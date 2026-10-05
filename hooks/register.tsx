import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'

import { cleanLine, colourLine } from './colour'
import { decrypt, phraseFor, scanBar } from './spinner'
import type { SpinnerMode } from './spinner'

// SecureBine site tokens (website_v3 app/globals.css, dark theme).
const GOLD = '#F5A701'
const INK_DIM = '#8FA3B0'
// The site's floating-surface blue: a prompt still waiting to be read.
const SLATE = '#46637B'

// Nerd Font icons, written as escapes so no editor or pipe can drop them: a
// shield for the operator and a robot for the assistant.
const OPERATOR_ICON = '\uF132'
const ASSISTANT_ICON = '\u{F06A9}'
// The cyberpunk accents: neither is a site token.
const NEON_CYAN = '#00E5FF'
const NEON_MAGENTA = '#FF2E97'

// The spinner's animation clock: a timer advances it while a turn runs, and
// the Spinner hook reads it, so each tick redraws that one line alone.
const spinnerTick = atom({ plugin: 'sbs-deck', key: 'spinnerTick' } as const, 0)
const TICK_MS = 150
// How many turn-opening reply ids are kept between loads.
const MAX_SAVED_OPENERS = 400
// How many drawn reply ids are remembered within a session.
const MAX_TRACKED_REPLIES = 4000
// A ticker nobody has drawn from for this many ticks stops itself: a turn that
// ended without `turn.complete` must not leave it running.
const IDLE_TICKS = 40

// How many lines of a result are drawn coloured before the rest is counted.
const MAX_RESULT_LINES = 20

function textOfBlocks(blocks: readonly unknown[]): string | undefined {
  const texts: string[] = []

  for (const block of blocks) {
    // An image, a resource or any other block that is not plain text: the
    // result is the engine's to draw, whole.
    if (typeof block !== 'object' || block === null || !('text' in block) || typeof block.text !== 'string') {
      return undefined
    }

    if ('type' in block && block.type !== 'text') {
      return undefined
    }

    texts.push(block.text)
  }

  return texts.length > 0 ? texts.join('\n') : undefined
}

// A tool result's text, in whichever of the shapes it arrives: a shell
// result's two streams, a bare string, or a list of text blocks. Undefined
// for any other shape, which the engine then draws itself.
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
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}

// Where `prompt` sits in `text` as whole lines: at the start or after a line
// break, and running to the end or to a line break. -1 when it does not. The
// engine frames a delivered prompt with sentences of its own, and a prompt
// that merely occurs inside that framing has not been delivered.
function wholeLineIndex(text: string, prompt: string): number {
  let from = 0

  for (;;) {
    const at = text.indexOf(prompt, from)

    if (at === -1) {
      return -1
    }

    const end = at + prompt.length
    const startsLine = at === 0 || text[at - 1] === '\n'
    const endsLine = end === text.length || text[end] === '\n'

    if (startsLine && endsLine) {
      return at
    }

    from = at + 1
  }
}

// The waiting prompts a delivered text carries, longest first, each match
// taken out of the text before the next is looked for: a prompt that is only
// a fragment of a longer delivered one is not counted as delivered with it.
function deliveredAmong(waiting: ReadonlySet<string>, text: string): string[] {
  let remaining = comparable(text)
  const delivered: string[] = []

  for (const prompt of [...waiting].sort((a, b) => b.length - a.length)) {
    const at = prompt.length > 0 ? wholeLineIndex(remaining, prompt) : -1

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
// and it must be a waiting prompt whole; text with no framing is searched by
// whole lines.
function deliveredByAttachment(waiting: ReadonlySet<string>, text: string): string[] {
  const unified = text.replaceAll('\r\n', '\n')

  if (!unified.includes(DELIVERY_LEAD)) {
    return deliveredAmong(waiting, unified)
  }

  return unified
    .split(DELIVERY_LEAD)
    .slice(1)
    .map(part => comparable(part.split(DELIVERY_TAIL)[0] ?? ''))
    .filter(payload => waiting.has(payload))
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
  // whole mod, quiet tool rows, and the pattern colouring of results. A result
  // row is the engine's own again, folding and ctrl+o with it, only with quiet
  // and colouring both off.
  let isEnabled = true
  // Quiet: each tool call is one line saying what it is for, and its output is
  // not drawn unless it failed.
  let isQuiet = true
  // The running ticker, how far it has counted, and the count the spinner last
  // drew at; then how many phrases each state has drawn from its pool, started
  // at a random place so sessions differ, and the clock time the current one
  // came up.
  let ticker: Timer | undefined
  let ticks = 0
  let drawnAt = 0
  const firstPick = Math.floor(Math.random() * 1000)
  const picks: Record<SpinnerMode, number> = {
    requesting: firstPick,
    thinking: firstPick,
    'tool-input': firstPick,
    'tool-use': firstPick,
    responding: firstPick,
  }
  let spinnerMode: SpinnerMode | undefined
  let phraseSince = 0
  // Who is shown beside OPERATOR: the account signed in to Claude Code, by its
  // email, once the engine has named it (it does so in the context of a
  // conversation's first message; the last one seen is kept in the store). The
  // machine's login name stands in until then.
  let username = 'unknown'
  let account: string | undefined
  let isColouring = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sbs',
      description: 'SecureBine styling: /sbs on, off, quiet, colour, or /sbs to toggle',
    })
    await $.command.register({
      name: 'sbs-colour',
      description: 'Turn pattern colouring of command output on or off',
    })
    username = (await $.env.get('USER')) ?? username

    const savedAccount = await $.store.get('account')

    if (typeof savedAccount === 'string' && savedAccount.length > 0) {
      account = savedAccount
    }
    isEnabled = (await $.store.get('isEnabled')) !== false
    isColouring = (await $.store.get('isColouring')) !== false
    isQuiet = (await $.store.get('isQuiet')) !== false

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
    const wanted = e.args.trim().toLowerCase()

    if (wanted === 'colour' || wanted === 'color') {
      isColouring = !isColouring
      await $.store.set('isColouring', isColouring)
    } else if (wanted === 'quiet') {
      isQuiet = !isQuiet
      await $.store.set('isQuiet', isQuiet)
    } else if (wanted === '' || wanted === 'on' || wanted === 'off') {
      isEnabled = wanted === '' ? !isEnabled : wanted === 'on'
      await $.store.set('isEnabled', isEnabled)
    } else {
      return { text: `Unknown option "${wanted}". Use /sbs on, off, quiet or colour; /sbs alone toggles.` }
    }

    $.ui.invalidate('ui.render')

    return {
      text: `SecureBine styling is ${isEnabled ? 'on' : 'off'}; quiet tool rows are ${isQuiet ? 'on' : 'off'}; output colouring is ${isColouring ? 'on' : 'off'}.`,
    }
  })

  on('command.run', { command: 'sbs-colour' }, async $ => {
    isColouring = !isColouring
    await $.store.set('isColouring', isColouring)
    $.ui.invalidate('ui.render')

    return { text: `Output colouring is ${isColouring ? 'on' : 'off'}.` }
  })

  on('prompt.context', async ($, e, next) => {
    const block = e.blocks.find(one => one.name === 'userEmail')
    const email = block?.text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]

    if (email !== undefined && email !== account) {
      account = email
      await $.store.set('account', email)
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    // A prompt typed while a turn was running carries that turn's id.
    if (e.turnId !== undefined && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      waitingPrompts.add(comparable(e.text))
    }

    return next(e)
  })

  // A waiting prompt is read when the engine injects it into the running turn
  // (the `queued_command` attachment) or when a new turn opens with it.
  on('prompt.attachment', ($, e, next) => {
    if (e.type === 'queued_command') {
      for (const prompt of deliveredByAttachment(waitingPrompts, e.text)) {
        waitingPrompts.delete(prompt)
        $.ui.invalidate('ui.render')
      }
    }

    return next(e)
  })

  // Each turn, however it began, gets one reply header and a running ticker.
  on('turn.start', ($, e, next) => {
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

  on('turn.complete', async ($, e, next) => {
    ticker?.cancel()
    ticker = undefined

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
    const accent = isWaiting ? SLATE : GOLD

    return (
      <Box flexDirection="column" borderStyle="single" borderColor={accent} paddingX={1}>
        <Box flexDirection="row">
          <Text color={accent}>{OPERATOR_ICON} </Text>
          <Text bold color={accent}>
            OPERATOR // {isWaiting ? 'QUEUED' : 'UPLINK'}:
          </Text>
          <Text color={INK_DIM}> {account ?? username}</Text>
        </Box>
        {/* The engine's row opens with a blank line; the eyebrow takes it. */}
        <Box flexDirection="column" marginTop={-1}>
          {inner}
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

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={NEON_CYAN}>{ASSISTANT_ICON} </Text>
          <Text bold color={NEON_CYAN}>
            CLAUDE
          </Text>
          <Text color={INK_DIM}> // DOWNLINK</Text>
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
    const markColor = e.props.isRunning ? NEON_CYAN : hasFailed ? '#FF5555' : '#3EE08A'

    return (
      <Box flexDirection="row">
        <Text color={markColor}>  {mark} </Text>
        <Text color={e.props.isRunning ? undefined : INK_DIM} wrap="truncate-end">
          {summaryOf(e.props.tool, e.props.input)}
        </Text>
      </Box>
    )
  })

  // With quiet off, shell and MCP results are drawn here, coloured by pattern.
  // The engine's own folding (ctrl+o) is not available to a hook-drawn row, so
  // a long result shows its head and a count; with quiet off, /sbs colour hands
  // those rows back to the engine.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!isEnabled) {
      return next(e)
    }

    // Quiet mode draws no output for a call that worked; a failure shows whole.
    if (isQuiet && !e.props.isErrored) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    const { Box, Text } = $.ui.resolve(e)
    const isOurs = e.props.tool === 'Bash' || e.props.tool.startsWith('mcp__')
    const text = isColouring && isOurs && !e.props.isErrored ? textOfOutput(e.props.output) : undefined
    const lines = text?.replace(/\s+$/, '').split('\n').map(cleanLine) ?? []

    if (lines.length === 0 || lines.every(line => line.trim().length === 0)) {
      return next(e)
    }

    const hidden = lines.length - MAX_RESULT_LINES

    return (
      <Box flexDirection="row">
        <Text color={INK_DIM}>{'  ⎿  '}</Text>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {lines.slice(0, MAX_RESULT_LINES).map(line => (
            <Text wrap="wrap">
              {colourLine(line).map(segment =>
                segment.style ? (
                  <Text
                    color={segment.style.color}
                    bold={segment.style.bold}
                    underline={segment.style.underline}
                  >
                    {segment.text}
                  </Text>
                ) : (
                  segment.text
                ),
              )}
            </Text>
          ))}
          {hidden > 0 ? (
            <Text color={INK_DIM}>
              … +{hidden} lines (/sbs colour for the full uncoloured view)
            </Text>
          ) : null}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isEnabled) {
      return next(e)
    }

    // Reading the tick subscribes this line to it; the animation itself runs
    // off the clock, so it stays right however rarely the line is redrawn.
    await read($, spinnerTick)
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

    const now = await $.clock.now()
    const frame = Math.floor(now / TICK_MS)

    if (e.props.mode !== spinnerMode) {
      spinnerMode = e.props.mode
      phraseSince = now
      picks[e.props.mode] += 1
    }

    const age = Math.floor((now - phraseSince) / TICK_MS)
    const word = decrypt(phraseFor(e.props.mode, picks[e.props.mode]), age, frame)

    return next({ ...e, props: { ...e.props, word, suffix: ` ${scanBar(frame)}` } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    isEnabled ? next({ ...e, props: { ...e.props, word: 'Jacked out' } }) : next(e),
  )
}
