import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { artRuns, drawFrame } from './canvas'
import type { Reel, Run } from './canvas'
import { cleanLine, colorLine } from './color'
import { LEGACY_REELS, NEW_REELS, reelNamed, unindexedLines } from './library'
import { contextOf, drawFromBag, holdEnd, nextVariant, poolOf, rollsRare } from './picker'
import type { Bags, Context } from './picker'
import { endStep, newTurn, readoutText, withEffort } from './readout'
import type { TurnStats } from './readout'
import { AUTO, decrypt, phraseFor } from './spinner'
import type { PhraseSource, SpinnerMode } from './spinner'
import { CUT_CORNER_TERMINALS, ROLES, THEME_NAMES, cutsCorners } from './theme'
import type { Role, ThemeName } from './theme'
import { layoutLine, rowOneText, tierFor } from './workline'

// Nerd Font icons, written as escapes so no editor or pipe can drop them: a
// shield for the operator and a robot for the assistant.
const OPERATOR_ICON = '\uF132'
const ASSISTANT_ICON = '\u{F06A9}'

// The spinner's animation clock: a timer advances it while a turn runs, and
// the Spinner hook reads it, so each tick redraws that one line alone.
const spinnerTick = atom({ plugin: 'sbs-deck', key: 'spinnerTick' } as const, 0)
// Each loop's turn data for the readout, keyed 'main' or the agent id. An atom,
// so a reload of the mod keeps counting.
const turnStats = atom({ plugin: 'sbs-deck', key: 'turnStats' } as const, {} as Record<string, TurnStats>)
const TICK_MS = 125
// How many turn-opening reply ids are kept between loads.
const MAX_SAVED_OPENERS = 400
// How many drawn reply ids are remembered within a session.
const MAX_TRACKED_REPLIES = 4000
// A ticker nobody has drawn from for this many ticks stops itself. That is how
// it stops at all: a background agent's spinner can outlive the turn that
// started it, so the end of a turn does not stop the ticker.
const IDLE_TICKS = 48
// How many agents' turn data is kept, the oldest dropped first.
const MAX_AGENTS = 50
// A spinner instance not drawn for this long is dropped at the next main turn.
const INSTANCE_TTL_MS = 10 * 60_000
// How many frames a beat's catchphrase stands on row 1.
const BEAT_FRAMES = 12
// The reels whose play shows the Night City phrase pool in that theme.
const NIGHT_CITY_REELS = ['breach', 'sandevistan']

// How many lines of a result are drawn colored before the rest is counted.
const MAX_RESULT_LINES = 20

// A plain text block: one with text and, if it names a type, the type `text`.
function isTextBlock(block: unknown): block is { text: string } {
  return (
    typeof block === 'object' &&
    block !== null &&
    'text' in block &&
    typeof block.text === 'string' &&
    (!('type' in block) || block.type === 'text')
  )
}

// The blocks' text, or undefined where any block is an image, a resource or
// anything else that is not plain text: that result is the engine's to draw,
// whole.
function textOfBlocks(blocks: readonly unknown[]): string | undefined {
  return blocks.length > 0 && blocks.every(isTextBlock) ? blocks.map(block => block.text).join('\n') : undefined
}

// A tool result's text, in whichever of the shapes it arrives: a shell
// result's two streams, a bare string, or a list of text blocks. Undefined
// for any other shape, and for a shell result whose output is an image, which
// the engine then draws itself.
function textOfOutput(output: unknown): string | undefined {
  if (typeof output === 'string') {
    return output
  }

  if (Array.isArray(output)) {
    return textOfBlocks(output)
  }

  if (typeof output !== 'object' || output === null) {
    return undefined
  }

  if ('content' in output && Array.isArray(output.content)) {
    return textOfBlocks(output.content)
  }

  if ('isImage' in output && output.isImage === true) {
    return undefined
  }

  const streams = [
    'stdout' in output ? output.stdout : undefined,
    'stderr' in output ? output.stderr : undefined,
  ].filter((stream): stream is string => typeof stream === 'string' && stream.trim().length > 0)

  return streams.length > 0 ? streams.join('\n') : undefined
}

// One line saying what a tool call is for: the description the model gave a
// shell command, else the tool's name and the first telling argument.
function summaryOf(tool: string, input: unknown): string {
  const name = tool.startsWith('mcp__') ? tool.slice(5).replace('__', ': ') : tool

  if (typeof input !== 'object' || input === null) {
    return name
  }

  const fields = input as Record<string, unknown>

  if (typeof fields.description === 'string' && fields.description.trim().length > 0) {
    return cleanLine(fields.description.trim().split('\n')[0] ?? '')
  }

  for (const key of ['file_path', 'path', 'pattern', 'query', 'url', 'command', 'skill', 'prompt']) {
    const value = fields[key]

    if (typeof value === 'string' && value.trim().length > 0) {
      return `${name} ${cleanLine(value.trim().split('\n')[0] ?? '').slice(0, 100)}`
    }
  }

  return name
}

// A prompt's text as it is compared: line endings alike, the spaces around
// each line and the blank lines around the whole dropped, so a prompt is the
// same text when it is queued, drawn and delivered.
function comparable(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}

// The waiting prompts a delivered text carries as whole lines, longest first,
// each match taken out of the text before the next is looked for: a prompt
// that only occurs inside a line, of the engine's framing or of a longer
// delivered prompt, is not counted as delivered.
function deliveredAmong(waiting: ReadonlySet<string>, text: string): string[] {
  let remaining = comparable(text)
  const delivered: string[] = []

  for (const prompt of [...waiting].sort((a, b) => b.length - a.length)) {
    // Padded with line breaks, the match starts and ends on one, and its index
    // in the padded text is where the prompt starts in the unpadded one.
    const at = prompt.length > 0 ? `\n${remaining}\n`.indexOf(`\n${prompt}\n`) : -1

    if (at !== -1) {
      delivered.push(prompt)
      remaining = `${remaining.slice(0, at)}\u0000${remaining.slice(at + prompt.length)}`
    }
  }

  return delivered
}

// The sentences the engine puts around a prompt it hands the model mid-turn.
// What lies between them is the prompt itself.
const DELIVERY_LEAD = 'The user sent a new message while you were working:\n'
const DELIVERY_TAIL = '\n\nThis is how Claude Code surfaces'

// The waiting prompts a `queued_command` attachment delivers. Where the text
// carries the engine's framing, only what the framing encloses is compared,
// and it must be a waiting prompt whole: first everything from the first lead
// to the last tail, so a prompt that quotes the framing itself is one prompt,
// then each framed part, for several prompts delivered together. Text with no
// framing is searched by whole lines.
function deliveredByAttachment(waiting: ReadonlySet<string>, text: string): string[] {
  const unified = text.replaceAll('\r\n', '\n')
  const start = unified.indexOf(DELIVERY_LEAD)

  if (start === -1) {
    return deliveredAmong(waiting, unified)
  }

  const end = unified.lastIndexOf(DELIVERY_TAIL)
  const whole = comparable(unified.slice(start + DELIVERY_LEAD.length, end > start ? end : undefined))

  if (waiting.has(whole)) {
    return [whole]
  }

  return unified
    .split(DELIVERY_LEAD)
    .slice(1)
    .map(part => comparable(part.split(DELIVERY_TAIL)[0] ?? ''))
    .filter(payload => waiting.has(payload))
}

// The email of the account signed in to Claude Code, from the same record the
// status line reads: `oauthAccount.emailAddress` in `.claude.json`.
async function signedInAccount($: EngineInterface): Promise<string | undefined> {
  try {
    // As Claude Code resolves it: an empty CLAUDE_CONFIG_DIR counts as unset.
    // With no directory at all there is nothing to read: a relative path would
    // be read from the session's working directory.
    const directory = (await $.env.get('CLAUDE_CONFIG_DIR')) || (await $.env.get('HOME'))

    if (!directory) {
      return undefined
    }

    const record: unknown = JSON.parse(await $.fs.read(`${directory}/.claude.json`))

    if (typeof record !== 'object' || record === null || !('oauthAccount' in record)) {
      return undefined
    }

    const signedIn = record.oauthAccount

    return typeof signedIn === 'object' &&
      signedIn !== null &&
      'emailAddress' in signedIn &&
      typeof signedIn.emailAddress === 'string' &&
      signedIn.emailAddress.length > 0
      ? signedIn.emailAddress
      : undefined
  } catch {
    return undefined
  }
}

// The turn data with `key`'s turn replaced and moved last, keeping the
// newest MAX_AGENTS agents beside the main loop.
function withTurn(all: Record<string, TurnStats>, key: string, turn: TurnStats): Record<string, TurnStats> {
  const { [key]: _old, ...rest } = all
  const kept: Record<string, TurnStats> = { ...rest, [key]: turn }
  const agents = Object.keys(kept).filter(name => name !== 'main')

  for (const name of agents.slice(0, Math.max(0, agents.length - MAX_AGENTS))) {
    delete kept[name]
  }

  return kept
}

const SBS_USAGE = [
  '/sbs on | off          all the styling',
  '/sbs normal            stock Claude Code (the same as off)',
  '/sbs reset             styling on with its defaults: quiet on, color on',
  '/sbs quiet on | off    one-line tool rows with output hidden',
  '/sbs color on | off   pattern coloring of output (seen with quiet off)',
  '/sbs anim [name|next|auto|off|list]  the working line\'s reel',
  '/sbs theme [securebine|nightcity]  the colors the mod draws in',
  '/sbs name <name>       what the reply header calls the assistant; clear to undo',
  '/sbs status            what is on now',
].join('\n')

// A name fit for the reply header: one line, upper case, no longer than the
// header has room for. Undefined for anything that is not a usable name.
function agentName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  // Cut by code points, so a name never ends in half a surrogate pair.
  const name = [...cleanLine(value.split('\n')[0] ?? '').trim().toUpperCase()].slice(0, 24).join('')

  return name.length > 0 ? name : undefined
}

// The display name the SBSForge platform gave this agent: the `display_name`
// key directly under a top-level `agent:` in ~/.sbsforge/config/agent.yaml,
// which the platform writes when it provisions a workspace. Blank and comment
// lines inside the block are skipped, and a deeper `display_name` belongs to a
// nested map, not to the agent. A quoted value loses its quotes and a plain
// one its `# comment`. Undefined anywhere that file is absent.
async function sbsforgeAgentName($: EngineInterface): Promise<string | undefined> {
  try {
    const home = await $.env.get('HOME')

    if (!home) {
      return undefined
    }

    const config = await $.fs.read(`${home}/.sbsforge/config/agent.yaml`)
    const head = /^agent:[ \t]*(?:#.*)?$/m.exec(config)

    if (head === null) {
      return undefined
    }

    // The block runs to the next line that starts at column 0 with a key.
    const rest = config.slice(head.index + head[0].length)
    const end = rest.search(/\n[^ \t#\r\n]/)
    const block = end === -1 ? rest : rest.slice(0, end)
    // The block's own indent: that of its first line that is not blank or a comment.
    const indent = /^([ \t]+)[^ \t#\r\n]/m.exec(block)?.[1]

    if (indent === undefined) {
      return undefined
    }

    const value = new RegExp(`^${indent}display_name:[ \\t]*(.*)$`, 'm').exec(block)?.[1]?.trim() ?? ''

    return agentName(/^(["'])(.*?)\1/.exec(value)?.[2] ?? value.replace(/(?:^|\s)#.*$/, ''))
  } catch {
    return undefined
  }
}

export const register: Register = on => {
  // Which reply block opens each turn, so the header draws once per turn and
  // not on every text block between tool calls. Saved to the store as each
  // turn completes and read back at start, so a reload keeps the headers.
  const turnOpeners = new Set<string>()
  let isAwaitingOpener = false
  // Every reply block drawn since this load, by id, and the ones among them
  // that were drawn before the current turn started.
  const drawnReplies = new Set<string>()
  let earlierReplies: ReadonlySet<string> = new Set<string>()
  // The prompts typed while a turn was still running and not yet handed to the
  // model, by their text. Their rows draw apart until they are read, then as
  // ordinary prompts. Module state: a reload forgets it.
  const waitingPrompts = new Set<string>()

  // The switches, kept in the plugin's store so they hold across sessions: the
  // whole mod, quiet tool rows, and the pattern coloring of results. A result
  // row is the engine's own again, folding and ctrl+o with it, only with quiet
  // and coloring both off.
  let isEnabled = true
  let theme: ThemeName = 'securebine'
  const paint = (role: Role) => ROLES[theme][role]
  const isTheme = (name: unknown): name is ThemeName => THEME_NAMES.includes(name as ThemeName)
  // Whether this terminal's font lines up Night City's cut corners, read at
  // session start.
  let isCutCorner = false
  // Quiet: each tool call is one line saying what it is for, and its output is
  // not drawn unless it failed.
  let isQuiet = true
  // The reel pinned everywhere by name, or auto (picked by what Claude is
  // doing), or off.
  let animation = AUTO
  // Reel files the index does not export yet, found at session start.
  let unindexed: string[] = []
  // The running ticker, how far it has counted, and the count the spinner last
  // drew at; then how many phrases each state has drawn from its pool, started
  // at a random place so sessions differ.
  let ticker: Timer | undefined
  let ticks = 0
  let drawnAt = 0
  const firstPick = Math.floor(Math.random() * 1000)
  const picks: Record<PhraseSource, number> = {
    requesting: firstPick,
    thinking: firstPick,
    'tool-input': firstPick,
    'tool-use': firstPick,
    responding: firstPick,
    nightcity: firstPick,
  }
  // Each spinner's state, its phrase and when that came up, by surface and
  // instance: a session can draw several spinners at once (the terminal and the
  // desktop, or one per agent), and each keeps its own phrase.
  const phrasesShown = new Map<string, { mode: SpinnerMode; source: PhraseSource; pick: number; since: number }>()
  // The turn tracker: the main loop's running tools in start order, the tool
  // whose input the model is streaming, the agents seen on turn and tool
  // events, and the characters streamed in each loop's current step.
  const runningTools: { id: string; name: string }[] = []
  let inputTool: string | undefined
  const knownAgents = new Set<string>()
  const streaming = new Map<string, number>()
  const currentTool = (): string | undefined => runningTools.at(-1)?.name ?? inputTool
  const rememberAgent = (id: string) => {
    knownAgents.delete(id)
    knownAgents.add(id)

    for (const oldest of knownAgents) {
      if (knownAgents.size <= MAX_AGENTS) {
        break
      }

      knownAgents.delete(oldest)
    }
  }
  // Whose turn a spinner reads: an agent's when its id is one, else the main
  // loop's. The turn data survives a reload, so it names the agents too.
  const loopKeyOf = (requestId: string, stats: Record<string, TurnStats>): string =>
    knownAgents.has(requestId) || Object.hasOwn(stats, requestId) ? requestId : 'main'
  // Each spinner instance's reel, when it was last drawn and its long-wait
  // clock, keyed as its phrase is. Which variant each reel plays next is kept
  // for the session, so rotation survives new plays and new turns.
  type Play = {
    reel: string
    variant: string
    seed: number
    startedAt: number
    context: Context
    holdUntil: number | undefined
    isRare: boolean
  }
  const plays = new Map<string, Play>()
  const lastDrawn = new Map<string, number>()
  const steady = new Map<string, { key: string; since: number }>()
  const variantTurns = new Map<string, number>()
  // One shuffle bag per context, shared by every spinner in the session, and
  // whether the main spinner's next first pick rolls for a rare reel.
  const bags: Bags = new Map()
  let pendingRareRoll = false
  // Whether a prompt submitted while idle has opened the main turn's working
  // line and its turn.start has yet to come.
  let isLineOpened = false
  // A tool starting or ending restarts the long-wait clocks, even between two
  // draws. A subagent's spinner is always in agents, so its clock never counts.
  const toolChanged = () => steady.clear()
  // A main turn opens its working line: the main spinner picks afresh, its
  // first pick rolling for a rare reel; a subagent's keeps its own. Any
  // instance not drawn for a while is dropped.
  const openMainLine = (now: number, stats: Record<string, TurnStats>) => {
    pendingRareRoll = true
    runningTools.length = 0
    inputTool = undefined
    streaming.delete('main')

    for (const instance of new Set([...plays.keys(), ...lastDrawn.keys(), ...steady.keys(), ...phrasesShown.keys()])) {
      const requestId = instance.slice(instance.indexOf(':') + 1)

      if (loopKeyOf(requestId, stats) === 'main' || now - (lastDrawn.get(instance) ?? now) >= INSTANCE_TTL_MS) {
        plays.delete(instance)
        lastDrawn.delete(instance)
        steady.delete(instance)
        phrasesShown.delete(instance)
      }
    }
  }
  // Who is shown beside OPERATOR: the account signed in to Claude Code, by its
  // email, read again at every turn so a new sign-in shows at once. The
  // machine's login name stands in where no account can be read.
  let username = 'unknown'
  let account: string | undefined
  // What the reply header calls the assistant: a name given with /sbs name,
  // else the name the session was started with (SBS_AGENT_NAME, or on the
  // SBSForge platform the agent's display name from its agent.yaml, or the
  // SBSFORGE_AGENT_NAME its workspace is given), else CLAUDE.
  let givenName: string | undefined
  let launchName: string | undefined
  const replyName = () => givenName ?? launchName ?? 'CLAUDE'
  let isColoring = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sbs',
      description: 'SecureBine styling: on, off, normal, reset, quiet on|off, color on|off, anim [name|next|auto|off|list], theme [securebine|nightcity], name <name>, status',
    })
    await $.command.register({
      name: 'sbs-color',
      description: 'Turn pattern coloring of command output on or off',
    })
    username = (await $.env.get('USER')) ?? username

    account = await signedInAccount($)
    launchName =
      agentName(await $.env.get('SBS_AGENT_NAME')) ??
      (await sbsforgeAgentName($)) ??
      agentName(await $.env.get('SBSFORGE_AGENT_NAME'))
    givenName = agentName(await $.store.get('agentName'))
    isEnabled = (await $.store.get('isEnabled')) !== false
    isColoring = (await $.store.get('isColoring')) !== false
    isQuiet = (await $.store.get('isQuiet')) !== false

    const savedTheme = await $.store.get('theme')

    if (isTheme(savedTheme)) {
      theme = savedTheme
    }

    isCutCorner = cutsCorners({
      TMUX: await $.env.get('TMUX'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TERM: await $.env.get('TERM'),
      WT_SESSION: await $.env.get('WT_SESSION'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      ALACRITTY_WINDOW_ID: await $.env.get('ALACRITTY_WINDOW_ID'),
    }, [...CUT_CORNER_TERMINALS, ...(await $.env.get('SBS_CUT_CORNERS') ?? '').split(',')])

    const savedAnimation = await $.store.get('animation')

    if (typeof savedAnimation === 'string' && (savedAnimation === AUTO || savedAnimation === 'off' || reelNamed(savedAnimation))) {
      animation = savedAnimation
    }

    // A change of animation starts every spinner afresh, and a new session
    // starts with fresh bags and rotations.
    plays.clear()
    bags.clear()
    variantTurns.clear()

    unindexed = []

    try {
      const listing = await $.fs.list(`${$.plugin.root}/hooks/reels`)
      unindexed = unindexedLines(listing.filter(entry => entry.kind === 'file').map(entry => entry.name))

      if (unindexed.length > 0) {
        $.ui.toast(`sbs-deck: add to hooks/reels/index.ts: ${unindexed[0]}${unindexed.length > 1 ? ` (and ${unindexed.length - 1} more: /sbs anim list)` : ''}`)
      }
    } catch {
      unindexed = []
    }

    const savedOpeners = await $.store.get('turnOpeners')

    if (Array.isArray(savedOpeners)) {
      for (const id of savedOpeners.slice(-MAX_SAVED_OPENERS)) {
        if (typeof id === 'string') {
          turnOpeners.add(id)
        }
      }
    }
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('command.run', { command: 'sbs' }, async ($, e) => {
    const [what = '', how = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const status = () =>
      `Styling is ${isEnabled ? 'on' : 'off'}; quiet tool rows are ${isQuiet ? 'on' : 'off'}; output coloring is ${isColoring ? 'on' : 'off'}. ` +
      `Spinner animation: ${animation}. Reply header: ${replyName()}. Theme: ${theme}.`

    // On or off as asked; with neither word, the opposite of what it is now.
    const setting = (current: boolean): boolean | undefined =>
      how === 'on' ? true : how === 'off' ? false : how === '' ? !current : undefined

    if (what === '' || what === 'status') {
      return { text: `${status()}\n${SBS_USAGE}` }
    }

    if (what === 'name') {
      const wanted = e.args.trim().slice(what.length).trim()

      if (wanted === '') {
        return {
          text: `The reply header says ${replyName()}. Set it with /sbs name <name>; /sbs name clear goes back to ${launchName ?? 'CLAUDE'}.`,
        }
      }

      givenName = wanted.toLowerCase() === 'clear' ? undefined : agentName(wanted)

      if (givenName === undefined) {
        await $.store.delete('agentName')
      } else {
        await $.store.set('agentName', givenName)
      }

      $.ui.invalidate('ui.render')

      return { text: `The reply header now says ${replyName()}.` }
    }

    if (what === 'anim' || what === 'ani' || what === 'animation') {
      const listText = () =>
        `Spinner animation is ${animation}. Choose from: auto, off, ` +
        [...NEW_REELS.map(r => (r.rare ? `${r.name} (rare)` : r.name)), ...LEGACY_REELS.map(r => `${r.name} (legacy)`)].join(', ') +
        '.' +
        (unindexed.length > 0 ? `\nNot in hooks/reels/index.ts yet. Add:\n${unindexed.join('\n')}` : '')

      if (how === 'list') {
        return { text: listText() }
      }

      let wanted = how

      // With no name, step to the next new reel, skipping the rare ones.
      if (how === '' || how === 'next') {
        const steps = NEW_REELS.filter(r => !r.rare)

        if (steps.length === 0) {
          return { text: 'No new reels yet.' }
        }

        wanted = steps[(steps.findIndex(r => r.name === animation) + 1) % steps.length]!.name
      } else if (how !== AUTO && how !== 'off' && !reelNamed(how)) {
        return { text: `No animation called "${how}".\n${listText()}` }
      }

      animation = wanted
      plays.clear()
      await $.store.set('animation', animation)

      return { text: `Spinner animation is ${animation}.` }
    }

    if (what === 'theme') {
      const choices = `Choose from: ${THEME_NAMES.join(', ')}.`

      if (how === '') {
        return { text: `Theme: ${theme}. ${choices}` }
      }

      if (!isTheme(how)) {
        return { text: `No theme called "${how}". ${choices}` }
      }

      theme = how
      await $.store.set('theme', theme)
      $.ui.invalidate('ui.render')

      return {
        text:
          `Theme is now ${theme}.` +
          (theme === 'nightcity'
            ? '\nFor Claude Code\'s own colors, run install.sh --theme nightcity,\nor pick it with /theme once installed.'
            : ''),
      }
    }

    if ((what === 'on' || what === 'off' || what === 'normal' || what === 'reset') && how === '') {
      isEnabled = what === 'on' || what === 'reset'

      if (what === 'reset') {
        isQuiet = true
        isColoring = true
      }
    } else if (what === 'quiet' && setting(isQuiet) !== undefined) {
      isQuiet = setting(isQuiet) ?? isQuiet
    } else if ((what === 'color' || what === 'colour') && setting(isColoring) !== undefined) {
      isColoring = setting(isColoring) ?? isColoring
    } else {
      return { text: `Unknown option "${e.args.trim()}".\n${SBS_USAGE}` }
    }

    await $.store.set('isEnabled', isEnabled)
    await $.store.set('isQuiet', isQuiet)
    await $.store.set('isColoring', isColoring)
    $.ui.invalidate('ui.render')

    return { text: status() }
  })

  on('command.run', { command: 'sbs-color' }, async $ => {
    isColoring = !isColoring
    await $.store.set('isColoring', isColoring)
    $.ui.invalidate('ui.render')

    return { text: `Output coloring is ${isColoring ? 'on' : 'off'}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    // The engine draws the working line from Enter, through the UserPromptSubmit
    // hooks, and starts the turn after them, inside next(e). A prompt submitted
    // while idle opens the line here, so its first pick is the turn's and no
    // turn.start replaces it; the readout shows `--` until turn.start, which
    // elapsed counts from.
    const opens = e.turnId === undefined

    if (opens) {
      const stats = await update($, turnStats, ({ main: _last, ...rest }) => rest)
      openMainLine(await $.clock.now(), stats)
      isLineOpened = true
    }

    const current = await signedInAccount($)

    if (current !== account) {
      account = current
      $.ui.invalidate('ui.render')
    }

    // A prompt typed while a turn was running carries that turn's id, and waits
    // from the moment it is submitted, by the text typed: the rest of the chain
    // can take a while, and the prompt can be read before it returns.
    if (e.turnId !== undefined && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      waitingPrompts.add(comparable(e.text))
      $.ui.invalidate('ui.render')
    }

    try {
      return await next(e)
    } finally {
      if (opens) {
        isLineOpened = false
      }
    }
  })

  // A waiting prompt is read when the engine injects it into the running turn
  // (the `queued_command` attachment) or when a new turn opens with it. The
  // attachment counts as the rest of the chain leaves it: one left out of the
  // request, or rewritten, has not handed the model that prompt.
  on('prompt.attachment', async ($, e, next) => {
    const result = await next(e)

    if (e.type === 'queued_command' && typeof result.text === 'string') {
      for (const prompt of deliveredByAttachment(waitingPrompts, result.text)) {
        waitingPrompts.delete(prompt)
        $.ui.invalidate('ui.render')
      }
    }

    return result
  })

  // Each turn, however it began, gets one reply header and a running ticker.
  // A subagent's run starts as a turn of its own inside the main turn: it is
  // the main turn's header, phrase and ticker that stand. Every turn, the
  // subagent's too, starts its own turn data for the readout.
  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()

    if (e.agentId !== undefined) {
      rememberAgent(e.agentId)
    }

    const stats = await update($, turnStats, all => withTurn(all, e.agentId ?? 'main', newTurn(now)))

    if (e.agentId !== undefined) {
      return next(e)
    }

    // A turn no idle prompt opened (a continuation, a queued prompt) opens its
    // line here.
    if (!isLineOpened) {
      openMainLine(now, stats)
    }

    for (const prompt of deliveredAmong(waitingPrompts, e.text)) {
      waitingPrompts.delete(prompt)
      $.ui.invalidate('ui.render')
    }

    if (drawnReplies.size > MAX_TRACKED_REPLIES) {
      const kept = [...drawnReplies].slice(-MAX_TRACKED_REPLIES / 2)
      drawnReplies.clear()

      for (const id of kept) {
        drawnReplies.add(id)
      }
    }

    earlierReplies = new Set(drawnReplies)
    isAwaitingOpener = true
    drawnAt = ticks
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => {
      ticks += 1

      if (ticks - drawnAt > IDLE_TICKS) {
        ticker?.cancel()
        ticker = undefined

        return
      }

      void update($, spinnerTick, count => count + 1)
    })

    return next(e)
  })

  // The readout's step data: the effort as the step starts, the characters
  // streamed while it runs, its output tokens once it ends. Chunks, the result
  // and errors pass through unchanged; the bookkeeping never throws into them.
  // A step that closes early or rejects counts as one without usage.
  on('turn.step', async function* ($, e, next) {
    const loop = e.agentId ?? 'main'
    let chars = 0
    let ended: { tokens: number | undefined } | undefined

    try {
      await update($, turnStats, all => {
        const stats = all[loop]

        return stats === undefined ? all : { ...all, [loop]: withEffort(stats, e.effort) }
      })
    } catch {
      // The readout misses this step's effort; the step goes on.
    }

    const stream = next(e)

    try {
      for await (const chunk of stream) {
        try {
          if (chunk.kind === 'text' || chunk.kind === 'thinking') {
            chars += chunk.text.length
          } else if (chunk.kind === 'input') {
            chars += chunk.json.length
          } else if (chunk.kind === 'tool' && loop === 'main') {
            inputTool = chunk.name
            toolChanged()
          }

          streaming.set(loop, chars)
        } catch {
          // A chunk the count cannot read is passed on uncounted.
        }

        yield chunk
      }

      const result = await stream.result
      ended = { tokens: result.usage?.output_tokens }

      return result
    } finally {
      streaming.delete(loop)

      if (loop === 'main') {
        inputTool = undefined
        toolChanged()
      }

      try {
        await update($, turnStats, all => {
          const stats = all[loop]

          return stats === undefined ? all : { ...all, [loop]: endStep(stats, ended?.tokens, chars) }
        })
      } catch {
        // The readout misses this step's tokens.
      }
    }
  })

  // The running tool on the main loop, from its start to its end, however it
  // ends; a subagent's call names its agent.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      rememberAgent(e.agentId)

      return next(e)
    }

    const running = { id: e.tool_use_id ?? '', name: e.tool }
    runningTools.push(running)
    toolChanged()

    try {
      return await next(e)
    } finally {
      const at = runningTools.indexOf(running)

      if (at !== -1) {
        runningTools.splice(at, 1)
      }

      toolChanged()
    }
  })

  // `/clear` ends the conversation and fires no session.start: the bags and
  // rotations start afresh here instead.
  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') {
      bags.clear()
      variantTurns.clear()
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's run completes as a turn of its own: the reply headers are
    // the main turn's, saved when it completes.
    if (e.agentId !== undefined) {
      return next(e)
    }

    const kept = [...turnOpeners].slice(-MAX_SAVED_OPENERS)

    if (kept.length < turnOpeners.size) {
      turnOpeners.clear()

      for (const id of kept) {
        turnOpeners.add(id)
      }
    }

    await $.store.set('turnOpeners', kept)

    return next(e)
  })

  // The person's own prompts only: notifications and other agents' messages
  // share the UserMessage site and keep the engine's drawing.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const kind = e.props.origin.kind

    if (!isEnabled || (kind !== 'composer' && kind !== 'bridge')) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const inner = await next(e)
    const prompt = comparable(e.props.text)
    const isWaiting = waitingPrompts.has(prompt)
    const label = paint(isWaiting ? 'queued' : 'label')
    const frame = paint(isWaiting ? 'queuedFrame' : 'frame').color

    const box = (
      <Box flexDirection="column" borderStyle="single" borderColor={frame} paddingX={1}>
        <Box flexDirection="row">
          <Text color={label.color} backgroundColor={label.backgroundColor}>
            {OPERATOR_ICON}{' '}
          </Text>
          <Text {...label}>
            OPERATOR // {isWaiting ? 'QUEUED' : 'UPLINK'}:
          </Text>
          <Text {...paint('dim')}> {cleanLine(account ?? username)}</Text>
        </Box>
        {/* The engine's row opens with a blank line; the eyebrow takes it. */}
        <Box flexDirection="column" marginTop={-1}>
          {inner}
        </Box>
      </Box>
    )

    if (theme !== 'nightcity' || !isCutCorner || e.surface !== 'terminal') {
      return box
    }

    // Night City cuts the top-left and bottom-right corners: overlays drawn
    // after the border, one placed on the corner, one pulled up onto the last
    // row. A live check showed both land and the sides stay whole.
    return (
      <Box flexDirection="column">
        {box}
        <Box key="cut-tl" position="absolute" top={0} left={0}>
          <Text color={frame}>╱</Text>
        </Box>
        <Box key="cut-br" marginTop={-1} alignSelf="flex-end">
          <Text color={frame}>╱</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // Kept whether or not the styling is on, so switching it back on finds the
    // books in order. Only a block first drawn in this turn can open it: an
    // earlier reply drawn again must not take the header meant for the new one.
    drawnReplies.add(e.requestId)

    if (isAwaitingOpener && !earlierReplies.has(e.requestId) && e.props.isFirstOfReply) {
      turnOpeners.add(e.requestId)
      isAwaitingOpener = false
    }

    if (!isEnabled || !turnOpeners.has(e.requestId)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const inner = await next(e)
    const header = paint('header')

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={header.color} backgroundColor={header.backgroundColor}>
            {ASSISTANT_ICON}{' '}
          </Text>
          <Text {...header}>
            {replyName()}
          </Text>
          <Text {...paint('dim')}> // DOWNLINK</Text>
        </Box>
        {/* The engine's block opens with a blank line; the header takes it. */}
        <Box flexDirection="column" marginTop={-1}>
          {inner}
        </Box>
      </Box>
    )
  })

  // Quiet mode: a tool call is one line, what it is for and how it stands.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (!isEnabled || !isQuiet) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const hasFailed = e.props.isErrored || e.props.isInterrupted
    const mark = e.props.isRunning ? '▸' : hasFailed ? '✗' : '✓'
    const markPaint = paint(e.props.isRunning ? 'markRunning' : hasFailed ? 'markFailed' : 'markDone')

    return (
      <Box flexDirection="row">
        <Text {...markPaint}>  {mark} </Text>
        <Text {...(e.props.isRunning ? {} : paint('dim'))} wrap="truncate-end">
          {summaryOf(e.props.tool, e.props.input)}
        </Text>
      </Box>
    )
  })

  // With quiet off, shell and MCP results are drawn here, colored by pattern.
  // The engine's own folding (ctrl+o) is not available to a hook-drawn row, so
  // a long result shows its head and a count; with quiet off, /sbs color hands
  // those rows back to the engine.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!isEnabled) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    // Quiet mode draws no output for a call that worked; a failure shows whole.
    if (isQuiet && !e.props.isErrored) {
      return <Box />
    }

    const isOurs = e.props.tool === 'Bash' || e.props.tool.startsWith('mcp__')
    const text = isColoring && isOurs && !e.props.isErrored ? textOfOutput(e.props.output) : undefined
    const lines = text?.trimEnd().split('\n').map(cleanLine) ?? []

    if (lines.every(line => line.trim().length === 0)) {
      return next(e)
    }

    const hidden = lines.length - MAX_RESULT_LINES

    return (
      <Box flexDirection="row">
        <Text {...paint('dim')}>{'  ⎿  '}</Text>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {lines.slice(0, MAX_RESULT_LINES).map(line => (
            <Text wrap="wrap">
              {colorLine(line, theme).map(segment =>
                segment.style ? (
                  <Text {...segment.style}>
                    {segment.text}
                  </Text>
                ) : (
                  segment.text
                ),
              )}
            </Text>
          ))}
          {hidden > 0 ? (
            <Text {...paint('dim')}>
              … +{hidden} lines (/sbs color for the full uncolored view)
            </Text>
          ) : null}
        </Box>
      </Box>
    )
  })

  // The working line, drawn by the mod: two rows of reel art beside the
  // phrase and the readout, or one row where there is no room for art.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isEnabled) {
      return next(e)
    }

    // Reading the tick subscribes this line to it; the animation itself runs
    // off the clock, so it stays right however rarely the line is redrawn.
    await read($, spinnerTick)
    const stats = await read($, turnStats)
    const now = await $.clock.now()
    const instance = `${e.surface}:${e.requestId}`
    lastDrawn.set(instance, now)
    drawnAt = ticks

    // The ticker stops itself when the spinner has been away (a dialog, a long
    // stretch of streamed text). Back on screen mid-turn, it is started again.
    if (ticker === undefined) {
      ticker = $.clock.every(TICK_MS, () => {
        ticks += 1

        if (ticks - drawnAt > IDLE_TICKS) {
          ticker?.cancel()
          ticker = undefined

          return
        }

        void update($, spinnerTick, count => count + 1)
      })
    }

    const tier = tierFor(e.surface, e.viewport, animation === 'off')
    const loop = loopKeyOf(e.requestId, stats)
    const isSubagent = loop !== 'main'
    const tool = isSubagent ? undefined : currentTool()
    // The long-wait clock: since this spinner's mode or running tool last changed.
    const steadyKey = `${e.props.mode}:${tool ?? ''}`
    let since = steady.get(instance)

    if (since?.key !== steadyKey) {
      since = { key: steadyKey, since: now }
      steady.set(instance, since)
    }

    const context = contextOf({ mode: e.props.mode, isSubagent, tool, unchangedMs: now - since.since })

    // The reel plays from this spinner's own frame 0; a loop's end starts the
    // next loop afresh, however many loops passed while it was hidden.
    let play: Play | undefined
    let art: Run[][] | undefined
    let catchphrase: string | undefined

    if (tier !== 'one-row') {
      const pinned = animation === AUTO ? undefined : (reelNamed(animation) ?? LEGACY_REELS[0]!)
      // A play from frame 0 with a fresh seed, in the bag entry's variant or
      // else the reel's next in its rotation.
      const startPlay = (reel: Reel, variant: string | undefined, isRare: boolean): Play => {
        const started: Play = {
          reel: reel.name,
          variant: variant ?? nextVariant(reel, variantTurns),
          seed: Math.floor(Math.random() * 2 ** 31),
          startedAt: now,
          context,
          holdUntil: undefined,
          isRare,
        }
        plays.set(instance, started)

        return started
      }
      const fromBag = () => {
        const entry = drawFromBag(bags, context, poolOf(context, NEW_REELS), Math.random)

        return startPlay(reelNamed(entry.reel)!, entry.variant, false)
      }

      play = plays.get(instance)

      if (pinned !== undefined) {
        if (play?.reel !== pinned.name) {
          play = startPlay(pinned, undefined, false)
        }
      } else if (play === undefined) {
        // A main turn's first pick by the main spinner: about 1 in 50 plays a
        // rare reel whole instead.
        if (pendingRareRoll && !isSubagent) {
          pendingRareRoll = false
          const rares = NEW_REELS.filter(r => r.rare)

          if (rares.length > 0 && rollsRare(Math.random())) {
            play = startPlay(rares[Math.floor(Math.random() * rares.length)]!, undefined, true)
          }
        }

        play ??= fromBag()
      }

      const playing = play
      const variant = reelNamed(playing.reel)?.variants[playing.variant]
      let frame = Math.floor((now - playing.startedAt) / TICK_MS)

      if (frame >= (variant?.loop ?? Infinity)) {
        // The pin plays on in its next variant; auto picks for the context it
        // detects now, which ends a rare play.
        play = pinned !== undefined ? startPlay(pinned, undefined, false) : fromBag()
        frame = 0
      } else if (pinned === undefined && !playing.isRare && variant !== undefined) {
        // A context whose pool holds the playing reel lets it play on and
        // cancels a hold. Any other plays the reel to the end of its phase or
        // loop, an end a further change does not move, then picks.
        if (context === playing.context || poolOf(context, NEW_REELS).some(entry => entry.reel === playing.reel)) {
          playing.context = context
          playing.holdUntil = undefined
        } else {
          playing.holdUntil ??= holdEnd(variant, frame)

          if (frame >= playing.holdUntil) {
            play = fromBag()
            frame = 0
          }
        }
      }

      const reel = reelNamed(play.reel) ?? LEGACY_REELS[0]!
      catchphrase = reel.variants[play.variant]?.beats.find(beat => frame >= beat.at && frame < beat.at + BEAT_FRAMES)?.phrase
      art = artRuns(drawFrame(reel, play.variant, frame, play.seed, tier === 'full' ? 32 : 16), theme)
    }

    // The Night City pool shows only while one of its reels plays, so never
    // where no reel plays.
    const source: PhraseSource = theme === 'nightcity' && play !== undefined && NIGHT_CITY_REELS.includes(play.reel) ? 'nightcity' : e.props.mode
    let shown = phrasesShown.get(instance)

    // A new phrase whenever the mode or the pool changes.
    if (shown?.mode !== e.props.mode || shown.source !== source) {
      picks[source] += 1
      shown = { mode: e.props.mode, source, pick: picks[source], since: now }
      phrasesShown.set(instance, shown)
    }

    const age = Math.floor((now - shown.since) / TICK_MS)
    const phrase = phraseFor(source, shown.pick)

    const rowOne = rowOneText({
      message: e.props.message,
      word: e.props.word,
      surface: e.surface,
      phrase: animation === 'off' ? phrase : decrypt(phrase, age, Math.floor(now / TICK_MS)),
      catchphrase,
    })
    const rows = layoutLine({
      theme,
      tier,
      columns: e.viewport?.columns,
      art,
      words: rowOne.text,
      isCatchphrase: rowOne.isCatchphrase,
      readout: readoutText(stats[loop], now, streaming.get(loop) ?? 0),
    })

    const { Box, Text } = $.ui.resolve(e)
    // A Text takes no key, so a keyed run sits in a Box of that key.
    const runText = ({ text, part: _part, ...paint }: Run, key?: string) => {
      const drawn = (
        <Text {...paint} wrap="truncate-end">
          {text}
        </Text>
      )

      return key === undefined ? drawn : <Box key={key}>{drawn}</Box>
    }

    return (
      <Box key={play ? `reel:${play.reel}:${play.variant}` : 'line'} flexDirection="column">
        {rows.map((runs, row) => (
          <Box flexDirection="row">
            {runs.some(run => run.part === 'art') ? (
              <Box key={`art${row}`}>
                <Text wrap="truncate-end">{runs.filter(run => run.part === 'art').map(run => runText(run))}</Text>
              </Box>
            ) : null}
            {runs
              .filter(run => run.part !== 'art')
              .map(run => runText(run, run.part === 'words' || run.part === 'readout' ? run.part : undefined))}
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    isEnabled ? next({ ...e, props: { ...e.props, word: 'Jacked out' } }) : next(e),
  )
}
