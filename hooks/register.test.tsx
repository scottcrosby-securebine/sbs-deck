import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import type { ToolCallArgs } from 'claude-code'

import { colorLine } from './color'
import { NEW_REELS, reelNamed } from './library'
import { contextOf, holdEnd, poolOf } from './picker'
import type { Context, Entry } from './picker'
import { HALF_RATE } from './reels/legacy'
import { ANIMATIONS, NIGHT_CITY_PHRASES, SPINNER_PHRASES, decrypt, phraseFor, scanBar } from './spinner'
import type { SpinnerMode } from './spinner'

const SURFACES = ['terminal', 'desktop'] as const

// The closing sentence the engine puts after a prompt delivered mid-turn.
const TAIL = '\n\nThis is how Claude Code surfaces messages the user sends mid-turn.'

// A terminal wide and tall enough for the two-row working line with 32-cell art.
const WIDE = { columns: 120, rows: 40 }

// The working line as drawn: row 1's words, the readout, and both art rows.
async function drawnLine(ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }) {
  return {
    words: (await ui.find({ key: 'words' }))?.text ?? '',
    readout: (await ui.find({ key: 'readout' }))?.text ?? '',
    art: `${(await ui.find({ key: 'art0' }))?.text ?? ''}\n${(await ui.find({ key: 'art1' }))?.text ?? ''}`,
  }
}

// A legacy reel's strip at a frame of its play: a half-rate name moves every other frame.
const stripAt = (name: string, frame: number) => ANIMATIONS[name]!(HALF_RATE.has(name) ? Math.floor(frame / 2) : frame)

// Quiet tool rows are on by default; the result-drawing tests turn them off.
const quietOff = ($: Engine) =>
  $.command.run({
    command: 'sbs',
    args: 'quiet',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

test('the person\'s prompt is boxed under an OPERATOR label', async ($, on) => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'sbs-deck',
      surface,
      component: 'UserMessage',
      props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Text', text: 'OPERATOR' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hello there' })).toBeDefined()
    await ui.unmount()
  }
})

test('a task notification keeps the engine\'s drawing', async ($, on) => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'sbs-deck',
      surface,
      component: 'UserMessage',
      props: { text: 'task done', origin: { kind: 'task-notification' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Text', text: 'OPERATOR' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the reply header draws once per turn, however many prompts arrive in it', async ($, on) => {
  mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const block = (requestId: string, text: string) =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text, isFirstOfReply: true },
    })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await block('m1', 'a reply')
  expect(await first.find({ type: 'Text', text: 'a reply' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: 'CLAUDE' })).toBeDefined()

  // A prompt typed mid-turn opens no new turn, so it earns no second header.
  await $.prompt.submit({ text: 'also this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  const later = await block('m2', 'a status note')
  expect(await later.find({ type: 'Text', text: 'a status note' })).toBeDefined()
  expect(await later.find({ type: 'Text', text: 'CLAUDE' })).toBeUndefined()

  await $.turn.start({ text: 'also this', turnId: 't2' })
  const next = await block('m3', 'the next reply')
  expect(await next.find({ type: 'Text', text: 'CLAUDE' })).toBeDefined()
})

test('reply headers are saved when a turn completes and restored at start', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  // A store of the test's own, so what the plugin saved can be read back.
  const stored: Record<string, unknown> = { turnOpeners: ['old-opener'] }
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const block = (requestId: string) =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text: 'a reply', isFirstOfReply: true },
    })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const restored = await block('old-opener')
  expect(await restored.find({ type: 'Text', text: 'CLAUDE' })).toBeDefined()
  const never = await block('not-an-opener')
  expect(await never.find({ type: 'Text', text: 'CLAUDE' })).toBeUndefined()

  await $.turn.start({ text: 'go', turnId: 't1' })
  await block('new-opener')
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(stored.turnOpeners).toEqual(['old-opener', 'new-opener'])
})

test('a shell result is drawn with its patterns colored', async ($, on) => {
  mock.store(on)
  await quietOff($)
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 't1',
      tool: 'Bash',
      output: { stdout: 'Gi0/1 is up at 10.0.0.1/24\nplain line\n', stderr: '' },
      isErrored: false,
    },
  })
  // `find` matches by inclusion, so the line's own Text matches too: the span
  // is the one whose whole text is the token.
  const colorOf = async (token: string) =>
    (await ui.findAll({ type: 'Text', text: token })).find(found => found.text === token)?.props.color
  expect(await colorOf('10.0.0.1/24')).toBe('#00E5FF')
  expect(await colorOf('up')).toBe('#3EE08A')
  expect(await colorOf('Gi0/1')).toBe('#F5A701')
  expect(await ui.find({ type: 'Text', text: 'plain line' })).toBeDefined()
  await ui.unmount()
})

test('a long result shows its head and counts the rest', async ($, on) => {
  mock.store(on)
  await quietOff($)
  const stdout = Array.from({ length: 50 }, (_, index) => `row ${index}`).join('\n')
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 't2', tool: 'Bash', output: { stdout, stderr: '' }, isErrored: false },
  })
  expect(await ui.find({ type: 'Text', text: 'row 19' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'row 20' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\+30 lines/ })).toBeDefined()
  await ui.unmount()
})

test('another tool\'s result is left to the engine', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine drew it</Text>
  })
  await quietOff($)

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 't3', tool: 'Read', output: { stdout: 'up 10.0.0.1' }, isErrored: false },
  })
  expect(await ui.find({ type: 'Text', text: 'engine drew it' })).toBeDefined()
  await ui.unmount()
})

test('/sbs off hands every row back to the engine, and on restores it', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const row = {
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
  } as const
  const run = (args: string) =>
    $.command.run({
      command: 'sbs',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })

  await run('off')
  const off = await $.ui.mount(row)
  expect(await off.find({ type: 'Text', text: 'OPERATOR' })).toBeUndefined()
  expect(await off.find({ type: 'Text', text: 'hello there' })).toBeDefined()
  await off.unmount()

  await run('on')
  const back = await $.ui.mount(row)
  expect(await back.find({ type: 'Text', text: 'OPERATOR' })).toBeDefined()
  await back.unmount()
})

test('a spinner phrase resolves out of noise and keeps its length', () => {
  const phrase = 'Jacking in'
  expect(decrypt(phrase, 0, 1)).not.toBe(phrase)
  expect(decrypt(phrase, 0, 1).length).toBe(phrase.length)
  expect(decrypt(phrase, 0, 1)[7]).toBe(' ')
  expect(decrypt(phrase, 2, 3).startsWith('Jack')).toBe(true)
  expect(decrypt(phrase, 5, 6)).toBe(phrase)
})

test('a run of picks shows every phrase of a pool once, and the bar keeps its width', () => {
  for (const mode of ['requesting', 'thinking', 'tool-input', 'tool-use', 'responding'] as const) {
    const size = SPINNER_PHRASES[mode].length
    const seen = new Set(Array.from({ length: size }, (_, pick) => phraseFor(mode, pick + 500)))
    expect(seen.size, mode).toBe(size)
  }

  for (let tick = 0; tick < 20; tick += 1) {
    expect(scanBar(tick).length).toBe(6)
    expect([...scanBar(tick)].filter(cell => cell === '▰').length).toBe(2)
  }
})

test('the spinner line carries the phrase and the bar', async ($, on) => {
  mock.clock(on)

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    viewport: WIDE,
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  const [, name = '', variant = ''] = ((await reelKey(ui)) ?? '').split(':')
  expect(poolOf('thinking', NEW_REELS).map(entry => entry.reel)).toContain(name)
  expect([...((await ui.find({ key: 'art0' }))?.text ?? '')]).toHaveLength(32)
  const { words } = await drawnLine(ui)
  const first = reelNamed(name)?.variants[variant]?.beats[0]?.phrase
  expect(SPINNER_PHRASES.thinking.some(phrase => phrase.length === words.length) || words === first, words).toBe(true)
  await ui.unmount()
})

test('every spinner phrase fits the line and appears once', () => {
  const all = Object.values(SPINNER_PHRASES).flat()

  for (const phrase of all) {
    expect(phrase.length, phrase).toBeLessThanOrEqual(28)
    expect(/^[\x20-\x7e]+$/.test(phrase), phrase).toBe(true)
  }

  expect(new Set(all).size).toBe(all.length)
})

test('a prompt typed mid-turn is slate blue while it waits and gold once it is read', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.prompt.submit({ text: 'also do this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.submit({ text: 'a fresh ask', wait: false, origin: { kind: 'composer' } })

  const row = (text: string) =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text, origin: { kind: 'composer' }, isExpanded: false },
    })

  const waiting = await row('also do this')
  expect(await waiting.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  expect((await waiting.find({ type: 'Box' }))?.props.borderColor).toBe('#46637B')
  await waiting.unmount()

  const fresh = await row('a fresh ask')
  expect(await fresh.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  expect((await fresh.find({ type: 'Box' }))?.props.borderColor).toBe('#F5A701')
  await fresh.unmount()

  // A shorter waiting prompt that is only a fragment of the delivered one stays
  // waiting: "do this" is inside "also do this" and has not been delivered.
  await $.prompt.submit({ text: 'do this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  // Nor does one whose words only occur in the engine's own framing sentence.
  await $.prompt.submit({ text: 'new message', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  // Nor one that is, word for word, a framing sentence of the engine's.
  const lead = 'The user sent a new message while you were working:'
  await $.prompt.submit({ text: lead, wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({
    type: 'queued_command',
    text: `The user sent a new message while you were working:\nalso do this${TAIL}`,
    origin: { kind: 'engine' },
  })

  const fragment = await row('do this')
  expect(await fragment.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await fragment.unmount()

  const framed = await row('new message')
  expect(await framed.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await framed.unmount()

  const mimic = await row(lead)
  expect(await mimic.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await mimic.unmount()

  // Spaces around a prompt's lines do not stop it being recognised when read.
  await $.prompt.submit({ text: '  alpha\nbeta  ', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  const indentedWaiting = await row('  alpha\nbeta  ')
  expect(await indentedWaiting.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await indentedWaiting.unmount()
  await $.prompt.attachment({
    type: 'queued_command',
    text: `The user sent a new message while you were working:\n  alpha\nbeta  ${TAIL}`,
    origin: { kind: 'engine' },
  })
  const indentedRead = await row('  alpha\nbeta  ')
  expect(await indentedRead.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  await indentedRead.unmount()

  const read = await row('also do this')
  expect(await read.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  expect(await read.find({ type: 'Text', text: 'UPLINK' })).toBeDefined()
  expect((await read.find({ type: 'Box' }))?.props.borderColor).toBe('#F5A701')
  await read.unmount()
})

test('quiet mode draws a tool call as one line and hides output that worked', async ($, on) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine drew the result</Text>
  })

  const call = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: 'q1',
      tool: 'Bash',
      input: { command: 'ls -la /tmp', description: 'List temp files\nand a second line' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  })
  expect(await call.find({ type: 'Text', text: 'List temp files' })).toBeDefined()
  expect(await call.find({ type: 'Text', text: 'ls -la' })).toBeUndefined()
  expect(await call.find({ type: 'Text', text: 'second line' })).toBeUndefined()
  await call.unmount()

  const worked = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'q1', tool: 'Bash', output: { stdout: 'a\nb', stderr: '' }, isErrored: false },
  })
  expect(await worked.find({ type: 'Text' })).toBeUndefined()
  await worked.unmount()

  const failed = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'q2', tool: 'Bash', output: 'boom', isErrored: true },
  })
  expect(await failed.find({ type: 'Text', text: 'engine drew the result' })).toBeDefined()
  await failed.unmount()
})

test('an unknown /sbs option changes nothing', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const answer = await $.command.run({
    command: 'sbs',
    args: 'help',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(JSON.stringify(answer)).toContain('Unknown option')

  const row = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await row.find({ type: 'Text', text: 'OPERATOR' })).toBeDefined()
  await row.unmount()
})

test('a queued prompt that opens the next turn gets a running spinner', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  // The bar's strip moves on every frame.
  await sbsCommand($, 'anim bar')

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.prompt.submit({ text: 'then this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(450)

  await $.turn.start({ text: 'then this', turnId: 't2' })
  const running = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    viewport: WIDE,
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  const before = (await drawnLine(running)).art
  await clock.advance(450)
  expect((await drawnLine(running)).art).not.toBe(before)
  await running.unmount()
})

test('a reply drawn while styling was off cannot take the next turn\'s header', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const sbs = (args: string) =>
    $.command.run({
      command: 'sbs',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
  const block = (requestId: string) =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text: `reply ${requestId}`, isFirstOfReply: true },
    })

  await sbs('off')
  await $.turn.start({ text: 'one', turnId: 't1' })
  const first = await block('m1')
  await first.unmount()

  await $.turn.start({ text: 'two', turnId: 't2' })
  await sbs('on')
  const old = await block('m1')
  expect(await old.find({ type: 'Text', text: 'reply m1' })).toBeDefined()

  const fresh = await block('m2')
  expect(await fresh.find({ type: 'Text', text: 'CLAUDE' })).toBeDefined()
})

test('an MCP result that mixes text with an image is left to the engine', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine drew it</Text>
  })
  await quietOff($)

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'm1',
      tool: 'mcp__browser__screenshot',
      output: [
        { type: 'text', text: 'Screenshot captured, link is up' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ],
      isErrored: false,
    },
  })
  expect(await ui.find({ type: 'Text', text: 'engine drew it' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Screenshot captured' })).toBeUndefined()
  await ui.unmount()

  // A block that carries text but is not a text block counts the same way.
  const linked = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'm2',
      tool: 'mcp__files__fetch',
      output: [
        { type: 'text', text: 'Fetched, link is up' },
        { type: 'resource', text: 'raw file body' },
      ],
      isErrored: false,
    },
  })
  expect(await linked.find({ type: 'Text', text: 'engine drew it' })).toBeDefined()
  await linked.unmount()
})

test('a spinner back on screen mid-turn is redrawn by a restarted timer', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  const spinner = (mode: 'thinking' | 'tool-use') =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'Spinner',
      props: { word: 'Baking', message: null, suffix: '…', mode },
    })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await spinner('thinking')
  await first.unmount()
  // Away long enough for the timer to stop itself.
  await clock.advance(60_000)

  // Back, and left on screen: only the timer redraws it, so the new phrase
  // resolves only if the timer was started again.
  const back = await spinner('tool-use')
  expect(SPINNER_PHRASES['tool-use']).not.toContain((await drawnLine(back)).words)
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain((await drawnLine(back)).words)
  await back.unmount()
})

test('the label names the account signed in to Claude Code and follows a new sign-in', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/tester', USER: 'tester' })
  let signedIn = 'pat.doe@example.io'
  let pathRead = ''
  on('fs.read', ($, e) => {
    pathRead = e.path

    return { value: JSON.stringify({ oauthAccount: { emailAddress: signedIn } }) }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  const row = () =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
    })

  await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
  expect(pathRead).toBe('/home/tester/.claude.json')
  const first = await row()
  expect(await first.find({ type: 'Text', text: 'pat.doe@example.io' })).toBeDefined()
  await first.unmount()

  // Signed in as someone else: the very next prompt shows it.
  signedIn = 'sam.roe@example.io'
  await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
  const second = await row()
  expect(await second.find({ type: 'Text', text: 'sam.roe@example.io' })).toBeDefined()
  expect(await second.find({ type: 'Text', text: 'pat.doe@example.io' })).toBeUndefined()
  await second.unmount()
})

test('/sbs sets each switch by name, shows status, and resets', async ($, on) => {
  mock.store(on)
  const sbs = async (args: string) =>
    JSON.stringify(
      await $.command.run({
        command: 'sbs',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      }),
    )

  expect(await sbs('')).toContain('Styling is on; quiet tool rows are on; output coloring is on.')
  expect(await sbs('quiet off')).toContain('quiet tool rows are off')
  expect(await sbs('quiet off')).toContain('quiet tool rows are off')
  expect(await sbs('color off')).toContain('output coloring is off')
  expect(await sbs('normal')).toContain('Styling is off')
  expect(await sbs('status')).toContain('Styling is off; quiet tool rows are off; output coloring is off.')
  expect(await sbs('quiet sideways')).toContain('Unknown option')
  expect(await sbs('reset')).toContain('Styling is on; quiet tool rows are on; output coloring is on.')
})

test('every animation draws a fixed-width strip that moves', () => {
  for (const [name, draw] of Object.entries(ANIMATIONS)) {
    const frames = Array.from({ length: 40 }, (_, frame) => draw(frame))
    const widths = new Set(frames.map(frame => [...frame].length))
    expect(widths.size, name).toBe(1)
    expect(new Set(frames).size, name).toBeGreaterThan(3)
  }
})

test('/sbs anim refuses an unknown name and takes a name in all three spellings', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const sbs = async (args: string) =>
    JSON.stringify(
      await $.command.run({
        command: 'sbs',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      }),
    )

  expect(await sbs('anim list')).toContain('Spinner animation is auto')
  expect(await sbs('anim sideways')).toContain('No animation called')
  expect(await sbs('anim list')).toContain('Spinner animation is auto')
  expect(await sbs('ani wave')).toContain('Spinner animation is wave')
  expect(await sbs('animation list')).toContain('Spinner animation is wave')

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    viewport: WIDE,
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect((await drawnLine(ui)).art).toStartWith(ANIMATIONS.wave!(0))
  await ui.unmount()
})

test('the animations hold up at the frame numbers a real clock gives', () => {
  // Frames come from the clock in 150 ms steps: about twelve billion today.
  const start = 12_000_000_000

  for (const [name, draw] of Object.entries(ANIMATIONS)) {
    const width = name === 'bar' ? 6 : 8
    expect([...draw(0)].length, name).toBe(width)

    for (let frame = start; frame < start + 120; frame += 1) {
      expect([...draw(frame)].length, `${name} at ${frame}`).toBe(width)
    }

    const frames = new Set(Array.from({ length: 60 }, (_, step) => draw(start + step)))
    expect(frames.size, name).toBeGreaterThan(3)
  }

  for (let frame = start; frame < start + 120; frame += 1) {
    // Every column of the fire keeps its bottom row alight.
    for (const cell of ANIMATIONS.fire?.(frame) ?? '') {
      expect((cell.charCodeAt(0) - 0x2800) & 0xc0, `fire at ${frame}`).toBe(0xc0)
    }

    // The Game of Life never shows an empty world.
    expect(ANIMATIONS.life?.(frame), `life at ${frame}`).not.toBe('\u2800'.repeat(8))
  }

  // The comet is on screen for all but a frame or two of its cycle.
  const blank = Array.from({ length: 23 }, (_, step) => ANIMATIONS.comet?.(start + step)).filter(
    frame => frame === '\u2800'.repeat(8),
  )
  expect(blank.length).toBeLessThan(3)
})

test('a stored animation name is restored only when it names a reel', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  const stored: Record<string, unknown> = { animation: 'constructor' }
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const sbs = async (args: string) =>
    JSON.stringify(
      await $.command.run({
        command: 'sbs',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      }),
    )

  // A name inherited from Object is not an animation: the default stands.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await sbs('anim list')).toContain('Spinner animation is auto')

  // A real one is restored and drawn.
  stored.animation = 'cylon'
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await sbs('anim list')).toContain('Spinner animation is cylon')
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    viewport: WIDE,
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect((await drawnLine(ui)).art).toStartWith(ANIMATIONS.cylon!(0))
  await ui.unmount()
})

test('the reply header takes the agent name from the launch variable or /sbs name', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { USER: 'tester', SBS_AGENT_NAME: 'Forge' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  const sbs = async (args: string) =>
    JSON.stringify(
      await $.command.run({
        command: 'sbs',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      }),
    )
  const header = async (requestId: string, name: string) => {
    const ui = await $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text: 'a reply', isFirstOfReply: true },
    })
    const found = await ui.find({ type: 'Text', text: name })
    await ui.unmount()

    return found !== undefined
  }

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await header('m1', 'FORGE')).toBe(true)
  expect(await header('m1', 'CLAUDE')).toBe(false)

  // A name given by hand wins over the launch variable, and clear undoes it.
  expect(await sbs('name Night City')).toContain('NIGHT CITY')
  expect(await header('m1', 'NIGHT CITY')).toBe(true)
  expect(await sbs('name clear')).toContain('FORGE')
  expect(await header('m1', 'FORGE')).toBe(true)
})

test('on SBSForge the reply header takes the name the platform gave the agent', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { HOME: '/home/sbsforge', USER: 'sbsforge', SBSFORGE_AGENT_NAME: 'miller-ws' })
  // The agent.yaml the platform writes; every other file is absent.
  on('fs.read', ($, e) =>
    e.path === '/home/sbsforge/.sbsforge/config/agent.yaml'
      ? { value: '# ~/.sbsforge/config/agent.yaml\nagent:\n  name: miller\n  display_name: "Miller"\n  model: opus\n' }
      : { deny: 'no such file' },
  )
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: 'a reply', isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Text', text: 'MILLER' })).toBeDefined()
  // The display name from agent.yaml, not the workspace variable.
  expect(await ui.find({ type: 'Text', text: 'MILLER-WS' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'CLAUDE' })).toBeUndefined()
  await ui.unmount()
})

// Whether the row for a prompt with this text is drawn as still waiting.
async function isQueued($: Engine, text: string): Promise<boolean> {
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  })
  const found = await ui.find({ type: 'Text', text: 'QUEUED' })
  await ui.unmount()

  return found !== undefined
}

test('a queued prompt that quotes the engine framing is read whole, and only when the model gets it', async ($, on) => {
  let dropAttachments = false
  let rewriteTo: string | undefined
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: dropAttachments ? null : (rewriteTo ?? e.text) }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  const lead = 'The user sent a new message while you were working:\n'

  // A prompt that quotes the lead, and a second prompt equal to its last line.
  const quoting = `quote:\n${lead}inner`
  await $.prompt.submit({ text: quoting, wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.submit({ text: 'inner', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({ type: 'queued_command', text: `${lead}${quoting}${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, quoting)).toBe(false)
  expect(await isQueued($, 'inner')).toBe(true)

  // An attachment the rest of the chain leaves out of the request delivers nothing.
  await $.prompt.submit({ text: 'held back', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  dropAttachments = true
  await $.prompt.attachment({ type: 'queued_command', text: `${lead}held back${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, 'held back')).toBe(true)
  dropAttachments = false
  await $.prompt.attachment({ type: 'queued_command', text: `${lead}held back${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, 'held back')).toBe(false)

  // One the chain rewrites delivers what it was rewritten to.
  rewriteTo = `${lead}replacement${TAIL}`
  await $.prompt.submit({ text: 'original', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.submit({ text: 'replacement', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({ type: 'queued_command', text: `${lead}original${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, 'original')).toBe(true)
  expect(await isQueued($, 'replacement')).toBe(false)
})

test('with no home directory nothing is read from the working directory', async ($, on) => {
  mock.store(on)
  mock.env(on, { USER: 'tester' })
  const paths: string[] = []
  on('fs.read', ($, e) => {
    paths.push(e.path)

    return { value: JSON.stringify({ oauthAccount: { emailAddress: 'planted@example.io' } }) }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(paths).toEqual([])
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: 'tester' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'planted@example.io' })).toBeUndefined()
  await ui.unmount()
})

test('an empty CLAUDE_CONFIG_DIR reads the account from HOME, as Claude Code does', async ($, on) => {
  mock.store(on)
  mock.env(on, { CLAUDE_CONFIG_DIR: '', HOME: '/home/tester', USER: 'tester' })
  const paths: string[] = []
  on('fs.read', ($, e) => {
    paths.push(e.path)

    return { deny: 'no such file' }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(paths).toContain('/home/tester/.claude.json')
})

test('a control character in the account email does not cost the prompt box its styling', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/tester', USER: 'tester' })
  on('fs.read', () => ({ value: JSON.stringify({ oauthAccount: { emailAddress: 'pat\u001b[31m@example.io' } }) }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: 'OPERATOR' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'pat@example.io' })).toBeDefined()
  await ui.unmount()
})

// The reply header's name for a set of launch variables and agent.yaml text
// (undefined: no agent.yaml), with an optional /sbs name typed first.
async function headerName(
  $: Engine,
  on: Parameters<TestBody>[1],
  env: Record<string, string>,
  yaml: string | undefined,
  given?: string,
): Promise<string> {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { HOME: '/home/agent', USER: 'agent', ...env })
  on('fs.read', ($, e) =>
    e.path === '/home/agent/.sbsforge/config/agent.yaml' && yaml !== undefined ? { value: yaml } : { deny: 'no such file' },
  )
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  if (given !== undefined) {
    await $.command.run({
      command: 'sbs',
      args: `name ${given}`,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })
  }

  const answer = await $.command.run({
    command: 'sbs',
    args: 'name',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  return /The reply header says (.*?)\. Set it/.exec(JSON.stringify(answer))?.[1] ?? ''
}

test('the launch variable beats agent.yaml', async ($, on) => {
  expect(await headerName($, on, { SBS_AGENT_NAME: 'Forge' }, 'agent:\n  display_name: Miller\n')).toBe('FORGE')
})

test('with no agent.yaml the workspace variable names the agent', async ($, on) => {
  expect(await headerName($, on, { SBSFORGE_AGENT_NAME: 'miller-ws' }, undefined)).toBe('MILLER-WS')
})

test('agent.yaml is read under agent:, without its quotes or a trailing comment', async ($, on) => {
  const yaml = 'owner:\n  display_name: Scott Crosby\n\nagent:\n  name: m\n\n  display_name: "Miller" # shown in the header\nmodel: x\n'
  expect(await headerName($, on, {}, yaml)).toBe('MILLER')
})

test('agent.yaml skips comment lines and nested maps in the agent block', async ($, on) => {
  const yaml = 'agent: # this agent\n# who it is\n  channel:\n    display_name: The Channel\n  display_name: Miller\n'
  expect(await headerName($, on, {}, yaml)).toBe('MILLER')
})

test('a long agent.yaml still gives the name', async ($, on) => {
  expect(await headerName($, on, {}, `agent:\n  display_name: Miller\n${'  # note\n'.repeat(600_000)}`)).toBe('MILLER')
})

test('an agent.yaml name that is only a comment is no name', async ($, on) => {
  expect(await headerName($, on, { SBSFORGE_AGENT_NAME: 'miller-ws' }, 'agent:\n  display_name: # unset\n')).toBe('MILLER-WS')
})

test('a plain agent.yaml name drops its comment', async ($, on) => {
  expect(await headerName($, on, {}, 'agent:\r\n  display_name: Miller  # set by the wizard\r\n')).toBe('MILLER')
})

test('a long name is cut on a whole character', async ($, on) => {
  const name = await headerName($, on, {}, undefined, 'ABCDEFGHIJKLMNOPQRSTUVW\u{1F916}X')
  expect(name).toBe('ABCDEFGHIJKLMNOPQRSTUVW\u{1F916}')
})

test('/sbs status names the animation and the reply header', async ($, on) => {
  mock.store(on)
  mock.env(on, { USER: 'tester', SBS_AGENT_NAME: 'Forge' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const run = async (args: string) =>
    JSON.stringify(
      await $.command.run({
        command: 'sbs',
        args,
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      }),
    )

  await run('anim fire')
  expect(await run('status')).toContain('Spinner animation: fire. Reply header: FORGE.')
})

test('a new turn reads a waiting prompt only where it stands on whole lines', async ($, on) => {
  mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.prompt.submit({ text: 'do this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.turn.start({ text: 'please do this now', turnId: 't2' })
  expect(await isQueued($, 'do this')).toBe(true)
  await $.turn.start({ text: 'first\ndo this\nlast', turnId: 't3' })
  expect(await isQueued($, 'do this')).toBe(false)
})

// The engine's framing around a prompt it delivers mid-turn.
const LEAD = 'The user sent a new message while you were working:\n'

// /sbs with these words, as the person types it.
const sbsCommand = ($: Engine, args: string) =>
  $.command.run({
    command: 'sbs',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

// The engine's own prompt row, which the mod wraps.
const engineUserMessage = (on: Parameters<TestBody>[1]) =>
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

test('the /sbs command is registered under the name its handler answers to', async ($, on) => {
  mock.store(on)
  mock.env(on, { USER: 'tester' })
  const names: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => {
    names.push(e.name)

    return { value: { command: e.name } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(names).toContain('sbs')
})

test('a delivered prompt with no user framing is found by its whole lines', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  await $.prompt.submit({ text: 'bridge ask', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({
    type: 'queued_command',
    text: 'Messages arrived in the bound thread while you were working:\nbridge ask',
    origin: { kind: 'engine' },
  })
  expect(await isQueued($, 'bridge ask')).toBe(false)
})

test('a queued prompt that quotes the closing sentence is read whole', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  const quoting = `before${TAIL}\nafter`
  await $.prompt.submit({ text: quoting, wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({ type: 'queued_command', text: `${LEAD}${quoting}${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, quoting)).toBe(false)
})

test('a queued row already on screen turns gold when it is read', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  engineUserMessage(on)
  const row = (text: string) =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text, origin: { kind: 'composer' }, isExpanded: false },
    })

  // Read mid-turn.
  await $.prompt.submit({ text: 'mid', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  const mid = await row('mid')
  expect(await mid.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await $.prompt.attachment({ type: 'queued_command', text: `${LEAD}mid${TAIL}`, origin: { kind: 'engine' } })
  await clock.settle()
  expect(await mid.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  await mid.unmount()

  // Read as the next turn.
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  const next = await row('next')
  expect(await next.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await $.turn.start({ text: 'next', turnId: 't2' })
  await clock.settle()
  expect(await next.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  await next.unmount()
})

test('a prompt row already on screen follows a new sign-in', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  mock.env(on, { HOME: '/home/tester', USER: 'tester' })
  let signedIn = 'pat@example.io'
  on('fs.read', () => ({ value: JSON.stringify({ oauthAccount: { emailAddress: signedIn } }) }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hi', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: 'pat@example.io' })).toBeDefined()
  signedIn = 'sam@example.io'
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: 'sam@example.io' })).toBeDefined()
  await ui.unmount()
})

test('a reply header already on screen follows /sbs name', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: 'a reply', isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Text', text: 'CLAUDE' })).toBeDefined()
  await sbsCommand($, 'name Night')
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: 'NIGHT' })).toBeDefined()
  await ui.unmount()
})

test('/sbs name and its clear are remembered into the next session', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  const stored: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete stored[e.key]

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const start = () => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await start()
  await sbsCommand($, 'name Night')
  await start()
  expect(JSON.stringify(await sbsCommand($, 'name'))).toContain('says NIGHT.')
  await sbsCommand($, 'name clear')
  await start()
  expect(JSON.stringify(await sbsCommand($, 'name'))).toContain('says CLAUDE.')
})

test('a control character in the agent name is dropped', async ($, on) => {
  expect(await headerName($, on, { SBS_AGENT_NAME: 'Fo\u0007rge' }, undefined)).toBe('FORGE')
})

test('an MCP result of plain text blocks is colored by the mod', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine drew it</Text>
  })

  await quietOff($)
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'm1', tool: 'mcp__net__show', output: [{ type: 'text', text: 'link is up' }], isErrored: false },
  })
  expect(await ui.find({ type: 'Text', text: 'engine drew it' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: 'up' })).find(found => found.text === 'up')?.props.color).toBe('#3EE08A')
  await ui.unmount()
})

// The main loop's spinner: one instance, the same id on every surface. With
// no viewport it draws the one-row form.
const spinnerOn = (
  $: Engine,
  mode: SpinnerMode,
  surface: 'terminal' | 'desktop' = 'terminal',
  options: { viewport?: { columns: number; rows: number }; requestId?: string; word?: string } = {},
) =>
  $.ui.mount({
    plugin: 'sbs-deck',
    surface,
    component: 'Spinner',
    requestId: options.requestId ?? 'main',
    viewport: options.viewport,
    props: { word: options.word ?? 'Baking', message: null, suffix: '…', mode },
  })

test('in auto the spinner plays a reel from its context\'s pool', { timeoutMs: 30_000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const modes = ['thinking', 'tool-use', 'tool-input', 'requesting'] as const

  for (let step = 0; step < 60; step += 1) {
    const mode = modes[step % modes.length] ?? 'thinking'
    const pool = poolOf(contextOf({ mode, isSubagent: false, tool: undefined, unchangedMs: 0 }), NEW_REELS)
    const ui = await spinnerOn($, mode, 'terminal', { viewport: WIDE, requestId: `main-${step}` })
    const key = await reelKey(ui)
    expect(pool.map(entryText), `${mode}: ${key}`).toContain(asEntry(key, pool))
    await ui.unmount()
  }
})

test('a subagent finishing does not stop the main turn\'s spinner', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await spinnerOn($, 'tool-use')
  await $.turn.complete({ answer: 'found it', durationMs: 5, isAborted: false, turnId: 's1', agentId: 'agent-1', reason: 'answer' })
  // Left on screen and in the same state, only the timer redraws it.
  expect(SPINNER_PHRASES['tool-use']).not.toContain((await drawnLine(ui)).words)
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain((await drawnLine(ui)).words)
  await ui.unmount()
})

test('spinners on the terminal and the desktop each resolve their own phrase', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  const terminal = await spinnerOn($, 'tool-input', 'terminal')
  // `Working` is the desktop's word while its row shows none: the mod's phrase stands.
  const desktop = await spinnerOn($, 'tool-use', 'desktop', { word: 'Working' })
  await clock.advance(3_000)
  expect(SPINNER_PHRASES['tool-input']).toContain((await drawnLine(terminal)).words)
  expect(SPINNER_PHRASES['tool-use']).toContain((await drawnLine(desktop)).words)
  await terminal.unmount()
  await desktop.unmount()
})

test('a subagent starting keeps the main turn\'s phrase and its one reply header', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  const hasHeader = async (requestId: string) => {
    const ui = await $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'AssistantMessage',
      requestId,
      props: { text: 'a reply', isFirstOfReply: true },
    })
    const found = await ui.find({ type: 'Text', text: 'CLAUDE' })
    await ui.unmount()

    return found !== undefined
  }

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await hasHeader('m1')).toBe(true)
  const spinner = await spinnerOn($, 'tool-use')
  await clock.advance(2_000)
  const phrase = (await drawnLine(spinner)).words
  expect(SPINNER_PHRASES['tool-use']).toContain(phrase)

  await $.turn.start({ text: 'look this up', turnId: 's1', agentId: 'agent-1' })
  await clock.advance(150)
  expect((await drawnLine(spinner)).words).toBe(phrase)
  expect(await hasHeader('m2')).toBe(false)
  await spinner.unmount()
})

test('a prompt queued while its row is on screen turns slate at once', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'one more', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: 'QUEUED' })).toBeUndefined()
  await $.prompt.submit({ text: 'one more', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: 'QUEUED' })).toBeDefined()
  await ui.unmount()
})

test('a prompt read while the rest of the submit chain is still running stays read', async ($, on) => {
  let release = () => {}
  let entered = () => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const hasEntered = new Promise<void>(resolve => {
    entered = resolve
  })
  on('prompt.submit', async ($, e) => {
    entered()
    await held

    return { text: e.text }
  })
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  const submitted = $.prompt.submit({ text: 'quick one', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  // Read once the prompt has passed the mod and the rest of the chain holds it.
  await hasEntered
  await $.prompt.attachment({ type: 'queued_command', text: `${LEAD}quick one${TAIL}`, origin: { kind: 'engine' } })
  release()
  await submitted
  expect(await isQueued($, 'quick one')).toBe(false)
})

test('spinners for two agents on one surface each resolve and keep their own phrase', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const spinnerFor = (requestId: string, mode: 'thinking' | 'tool-use') =>
    $.ui.mount({
      plugin: 'sbs-deck',
      surface: 'terminal',
      component: 'Spinner',
      requestId,
      props: { word: 'Baking', message: null, suffix: '…', mode },
    })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await spinnerFor('agent-a', 'thinking')
  await clock.advance(2_000)
  const settled = (await drawnLine(first)).words
  expect(SPINNER_PHRASES.thinking).toContain(settled)

  // A second spinner enters the same state, then another.
  const second = await spinnerFor('agent-b', 'thinking')
  const third = await spinnerFor('agent-c', 'tool-use')
  await clock.advance(2_000)
  expect((await drawnLine(first)).words).toBe(settled)
  expect(SPINNER_PHRASES.thinking).toContain((await drawnLine(second)).words)
  expect(SPINNER_PHRASES['tool-use']).toContain((await drawnLine(third)).words)
  await first.unmount()
  await second.unmount()
  await third.unmount()
})

test('a name saved by /sbs name is read back when a session starts', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  const stored: Record<string, unknown> = { agentName: 'Night' }
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await sbsCommand($, 'name'))).toContain('says NIGHT.')
})

test('a prompt taken back and sent again turns gold once it is read', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  engineUserMessage(on)

  // Queued, then taken back out of the queue: no event says so.
  await $.prompt.submit({ text: 'again', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.submit({ text: 'again', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.prompt.attachment({ type: 'queued_command', text: `${LEAD}again${TAIL}`, origin: { kind: 'engine' } })
  expect(await isQueued($, 'again')).toBe(false)
})

test('a background agent\'s spinner keeps moving after the main turn ends', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  const background = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'agent-1',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'tool-use' },
  })
  await $.turn.complete({ answer: 'started it', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(SPINNER_PHRASES['tool-use']).not.toContain((await drawnLine(background)).words)
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain((await drawnLine(background)).words)
  await background.unmount()
})

test('a shell result that is an image is left to the engine', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine drew it</Text>
  })

  await quietOff($)
  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'b1',
      tool: 'Bash',
      output: { stdout: 'iVBORw0KGgoAAAANSUhEUgAA', stderr: '', interrupted: false, isImage: true },
      isErrored: false,
    },
  })
  expect(await ui.find({ type: 'Text', text: 'engine drew it' })).toBeDefined()
  await ui.unmount()
})

test('a long run of spaces in an agent.yaml name reads quickly', async ($, on) => {
  const started = Date.now()
  const name = await headerName($, on, {}, `agent:\n  display_name: Mill${' '.repeat(100_000)}er # note\n`)
  expect(name.startsWith('MILL')).toBe(true)
  expect(Date.now() - started).toBeLessThan(1_000)
})

test('a line of escaped quotes colors quickly, and quoted strings still color', () => {
  const pairs = Object.fromEntries(Array.from({ length: 5_000 }, (_, index) => [`key${index}`, `value ${index}`]))
  // Double-encoded JSON: every inner quote is escaped and the line has no closing quote.
  // Kept at 100,000 characters: on much longer lines Bun can run the old rules fast too.
  const line = JSON.stringify(JSON.stringify(pairs)).slice(0, 100_000)
  const started = Date.now()
  colorLine(line)
  expect(Date.now() - started).toBeLessThan(250)

  const colorOf = (text: string, token: string) => colorLine(text).find(segment => segment.text === token)?.style?.color
  expect(colorOf('{"name": "a \\"b\\" c"}', '"name"')).toBe('#FF2E97')
  expect(colorOf('{"name": "a \\"b\\" c"}', '"a \\"b\\" c"')).toBe('#9FD6A8')
})

// The model beneath the mod: each step streams the text its script gives in
// one chunk and returns the output tokens it gives (null: no usage).
function scriptedModel(
  on: Parameters<TestBody>[1],
  script: (index: number) => { text: string; tokens: number | null },
) {
  on('turn.step', async function* ($, e) {
    const { text, tokens } = script(e.index)

    if (text.length > 0) {
      yield { kind: 'text' as const, index: 0, text }
    }

    return {
      turnId: e.turnId,
      index: e.index,
      answer: text,
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage:
        tokens === null
          ? null
          : { input_tokens: 1, output_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'test' },
    }
  })
}

// Reads a stream to its end.
async function drain(stream: AsyncGenerator<unknown, unknown>) {
  while (!(await stream.next()).done) {
    // Each chunk is passed on; only the end matters here.
  }
}

test('the working line draws two rows of art beside the phrase and the readout', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  // A legacy reel has no beats, so row 1 is the phrase throughout.
  await sbsCommand($, 'anim bar')

  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  await clock.advance(2_000)
  expect([...((await ui.find({ key: 'art0' }))?.text ?? '')]).toHaveLength(32)
  expect([...((await ui.find({ key: 'art1' }))?.text ?? '')]).toHaveLength(32)
  const { words, readout } = await drawnLine(ui)
  expect(SPINNER_PHRASES.thinking).toContain(words)
  expect(readout).toStartWith('2s · ')
  await ui.unmount()
})

test('the widths at 80, 79, 60, 59 and none, and rows under 12', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const cases: [{ columns: number; rows: number } | undefined, number | undefined][] = [
    [{ columns: 80, rows: 40 }, 32],
    [{ columns: 79, rows: 40 }, 16],
    [{ columns: 60, rows: 40 }, 16],
    [{ columns: 59, rows: 40 }, undefined],
    [undefined, undefined],
    [{ columns: 120, rows: 11 }, undefined],
  ]

  for (const [viewport, width] of cases) {
    const ui = await spinnerOn($, 'thinking', 'terminal', { viewport })
    const art = await ui.find({ key: 'art0' })
    expect(art === undefined ? undefined : [...art.text].length, JSON.stringify(viewport)).toBe(width)
    await ui.unmount()
  }
})

test('the readout counts a scripted turn', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  scriptedModel(on, index => (index === 0 ? { text: 'x'.repeat(400), tokens: 90 } : { text: 'y'.repeat(40), tokens: null }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })

  // Only a tick redraws the line, so each read waits one.
  const first = $.turn.step({ turnId: 't1', index: 0, model: 'test', effort: 'high', messageCount: 1 })
  await first.next()
  await clock.advance(125)
  expect((await drawnLine(ui)).readout).toEndWith('· ~100 tokens · effort high')
  await drain(first)
  await clock.advance(125)
  expect((await drawnLine(ui)).readout).toEndWith('· 90 tokens · effort high')

  // No usage: the step's estimate stays, with its `~`, until the turn ends.
  await drain($.turn.step({ turnId: 't1', index: 1, model: 'test', messageCount: 3 }))
  await clock.advance(125)
  expect((await drawnLine(ui)).readout).toEndWith('· ~100 tokens · effort high')
  await ui.unmount()
})

test('a subagent spinner reads its own turn', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  scriptedModel(on, () => ({ text: '', tokens: 7 }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.start({ turnId: 's1', agentId: 'agent-1', text: '' })
  await drain($.turn.step({ turnId: 's1', index: 0, model: 'test', messageCount: 1, agentId: 'agent-1' }))

  const agent = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'agent-1' })
  const main = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect((await drawnLine(agent)).readout).toContain('· 7 tokens')
  expect((await drawnLine(main)).readout).toContain('· 0 tokens')
  await agent.unmount()
  await main.unmount()
})

test('two spinners at once keep their own frame', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim cylon')

  const main = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  await clock.advance(500)
  const other = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'agent-x' })
  expect((await drawnLine(other)).art).toStartWith(stripAt('cylon', 0))
  expect((await drawnLine(main)).art).toStartWith(stripAt('cylon', 4))
  await main.unmount()
  await other.unmount()
})

test('the reel\'s frame counts from 0 when it starts on this spinner', async ($, on) => {
  // Wall-clock tick 8002: a frame read off the clock would draw another strip.
  mock.clock(on, { now: 1_000_250 })
  mock.store(on)
  await sbsCommand($, 'anim bar')

  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect((await drawnLine(ui)).art).toStartWith(stripAt('bar', 0))
  await ui.unmount()
})

test('a spinner hidden for several loops resumes at its loop start', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  // Cylon's strip differs on each of frames 0 to 8 and repeats every 30.
  await sbsCommand($, 'anim cylon')

  const shown = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  await clock.advance(2_000)
  await shown.unmount()
  // 31 s in all, 248 frames: not a whole number of 64-frame loops, so a jump
  // by whole loops or a modulo would land on frame 56.
  await clock.advance(29_000)

  const back = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect((await drawnLine(back)).art).toStartWith(stripAt('cylon', 0))

  for (let frame = 1; frame <= 8; frame += 1) {
    await clock.advance(125)
    expect((await drawnLine(back)).art, `frame ${frame}`).toStartWith(stripAt('cylon', frame))
  }

  await back.unmount()
})

test('the desktop draws the one-row form', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  const ui = await spinnerOn($, 'thinking', 'desktop', { viewport: WIDE })
  expect(await ui.find({ key: 'art0' })).toBeUndefined()
  expect(await ui.find({ key: 'words' })).toBeDefined()
  expect(await ui.find({ key: 'readout' })).toBeDefined()
  await ui.unmount()
})

test('an engine message with an escape sequence and a tab draws clean', async ($, on) => {
  mock.clock(on)
  mock.store(on)

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    viewport: WIDE,
    props: { word: 'Baking', message: 'Compacting\u001b[2K\tnow', suffix: '…', mode: 'thinking' },
  })
  expect((await drawnLine(ui)).words).toBe('Compacting    now')
  const wrapOf = async (key: string) => ((await ui.find({ key }))?.children[0] as { props: Record<string, unknown> } | undefined)?.props.wrap
  expect(await wrapOf('words')).toBe('truncate-end')
  expect(await wrapOf('readout')).toBe('truncate-end')
  await ui.unmount()
})

test('an instance not drawn for 10 minutes is dropped at the next main turn', async ($, on) => {
  // Every read below falls off the decrypt glitch tick (a tick that is a multiple of 23).
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  // No viewport: the one-row form, where no reel plays and so no catchphrase
  // stands in for the phrase.
  const agent = () => spinnerOn($, 'thinking', 'terminal', { requestId: 'agent-2' })

  await $.turn.start({ text: '', turnId: 's2', agentId: 'agent-2' })
  let ui = await agent()
  await clock.advance(2_000)
  expect(SPINNER_PHRASES.thinking).toContain((await drawnLine(ui)).words)
  await ui.unmount()

  // Away 9 minutes: kept, so its first draw shows the phrase resolved (tick 4336).
  await clock.advance(9 * 60_000)
  await $.turn.start({ text: 'go', turnId: 't1' })
  ui = await agent()
  expect(SPINNER_PHRASES.thinking).toContain((await drawnLine(ui)).words)
  await ui.unmount()

  // Away 11 minutes: dropped, so it decrypts afresh (tick 9616).
  await clock.advance(11 * 60_000)
  await $.turn.start({ text: 'go', turnId: 't2' })
  ui = await agent()
  expect(SPINNER_PHRASES.thinking).not.toContain((await drawnLine(ui)).words)
  await ui.unmount()
})

const fakeStore = (on: Parameters<TestBody>[1]) => {
  const stored: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })

  return stored
}

test('/sbs anim with a name, auto, off and list', async ($, on) => {
  const stored = fakeStore(on)
  mock.clock(on)
  const run = async (args: string) => JSON.stringify(await sbsCommand($, args))

  expect(await run('anim cylon')).toContain('Spinner animation is cylon.')
  expect(stored.animation).toBe('cylon')
  expect(await run('anim off')).toContain('Spinner animation is off.')
  expect(stored.animation).toBe('off')
  expect(await run('anim auto')).toContain('Spinner animation is auto.')
  expect(stored.animation).toBe('auto')
  const list = await run('anim list')
  expect(list).toContain('Spinner animation is auto.')
  expect(list).toContain('auto, off')
  expect(list).toContain('cylon (legacy)')
})

test('/sbs anim next steps to the first new reel that is not rare', async ($, on) => {
  const stored = fakeStore(on)
  mock.clock(on)
  await sbsCommand($, 'anim cylon')
  const reply = JSON.stringify(await sbsCommand($, 'anim next'))
  const first = NEW_REELS.find(r => !r.rare)?.name

  if (first === undefined) {
    expect(reply).toContain('No new reels yet.')
    expect(stored.animation).toBe('cylon')
  } else {
    expect(stored.animation).toBe(first)
  }
})

test('list names a reel file missing from the index, and session start toasts it', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  const line = "export { default as newone } from './newone'"
  const toasts: string[] = []
  let asked = ''
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.list', ($, e) => {
    asked = e.path

    return { value: [{ name: 'newone.ts', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(asked).toEndWith('/hooks/reels')
  expect(toasts.join('\n')).toContain(line)
  expect(JSON.stringify(await sbsCommand($, 'anim list'))).toContain(line)
})

test('anim off draws the one-row form with no scramble', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim off')
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  const seen = new Set<string>()

  for (let tick = 0; tick < 30; tick += 1) {
    const { words } = await drawnLine(ui)
    seen.add(words)
    expect(await ui.find({ key: 'art0' })).toBeUndefined()
    await clock.advance(125)
  }

  expect(seen.size).toBe(1)
  expect(SPINNER_PHRASES.thinking).toContain([...seen][0])
  await ui.unmount()
})

test('a pin typed mid-reel takes effect on the next frame', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim bar')
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  await clock.advance(1_000)
  await sbsCommand($, 'anim cylon')
  await clock.advance(125)
  const outer = (await ui.findAll({ type: 'Box' })).find(b => b.key?.startsWith('reel:'))
  expect(outer?.key).toBe('reel:cylon:strip')
  expect((await drawnLine(ui)).art).toStartWith(ANIMATIONS.cylon!(0))
  await ui.unmount()
})

const reelKey = async (ui: { findAll: (q: { type: string }) => Promise<{ key?: string }[]> }) =>
  (await ui.findAll({ type: 'Box' })).find(b => b.key?.startsWith('reel:'))?.key

test('a pinned reel\'s variants rotate across loops and turns', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await sbsCommand($, 'anim hokuto')
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect(await reelKey(ui)).toBe('reel:hokuto:flurry')

  // The loop's end starts the next variant.
  await clock.advance(reelNamed('hokuto')!.variants.flurry!.loop * 125)
  await clock.advance(125)
  expect(await reelKey(ui)).toBe('reel:hokuto:seven-stars')

  // A main turn drops the play; the rotation carries on, the third in turn.
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(125)
  expect(await reelKey(ui)).toBe('reel:hokuto:flurry')

  // A second turn steps on again: a rotation reset at each turn would replay flurry.
  await $.turn.start({ text: 'go', turnId: 't2' })
  await clock.advance(125)
  expect(await reelKey(ui)).toBe('reel:hokuto:seven-stars')
  await ui.unmount()
})

test('a hidden spinner takes one variant on return', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim hokuto')
  const shown = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect(await reelKey(shown)).toBe('reel:hokuto:flurry')
  await shown.unmount()

  // Frame 256 (flurry 108, seven-stars 144): one rotation per elapsed loop, or
  // stepping each variant's own loop, would land on flurry.
  await clock.advance((2 * 108 + 40) * 125)
  const back = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  expect(await reelKey(back)).toBe('reel:hokuto:seven-stars')

  for (let tick = 1; tick <= 8; tick += 1) {
    await clock.advance(125)
    expect(await reelKey(back), `tick ${tick}`).toBe('reel:hokuto:seven-stars')
  }

  await back.unmount()
})

test('a catchphrase replaces the phrase for 12 frames at its beat, whole and bold', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim breach')
  const beats = reelNamed('breach')!.variants.run!.beats
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
  const bold = async () => ((await ui.find({ key: 'words' }))?.children[0] as { props: Record<string, unknown> } | undefined)?.props.bold === true

  await clock.advance(beats[0]!.at * 125)
  expect((await drawnLine(ui)).words).toBe('BREACH PROTOCOL')
  expect(await bold()).toBe(true)

  // Frame at + 11 is the catchphrase's last; frame at + 12 is past it.
  await clock.advance(11 * 125)
  expect((await drawnLine(ui)).words).toBe('BREACH PROTOCOL')
  await clock.advance(125)
  const { words } = await drawnLine(ui)
  expect(words).not.toBe('BREACH PROTOCOL')
  expect(await bold()).toBe(words === beats[1]!.phrase)
  await ui.unmount()
})

test('/sbs anim with no argument and next step through the new reels', async ($, on) => {
  const stored = fakeStore(on)
  mock.clock(on)
  const steps = NEW_REELS.filter(r => !r.rare).map(r => r.name)
  expect(steps.length).toBeGreaterThan(0)
  await sbsCommand($, 'anim auto')

  // Each new reel in order, then back to the first; no argument and next alike.
  for (const [k, name] of [...steps, steps[0]!].entries()) {
    await sbsCommand($, k % 2 === 0 ? 'anim' : 'anim next')
    expect(stored.animation, `step ${k}`).toBe(name)
  }
})

test('a resize from 80 to 79 columns keeps the reel and its frame', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim breach')
  let ui = await spinnerOn($, 'thinking', 'terminal', { viewport: { columns: 80, rows: 40 } })
  // Frame 50, mid upload bar: the cropped art changes on every frame from 47 to
  // 60, so a drift of one frame either way draws different text.
  await clock.advance(50 * 125)
  const wide = (await drawnLine(ui)).art.split('\n')
  expect(wide.map(row => [...row].length)).toEqual([32, 32])
  await ui.unmount()

  ui = await spinnerOn($, 'thinking', 'terminal', { viewport: { columns: 79, rows: 40 } })
  const outer = (await ui.findAll({ type: 'Box' })).find(b => b.key?.startsWith('reel:'))
  expect(outer?.key).toBe('reel:breach:run')
  expect((await drawnLine(ui)).art.split('\n')).toEqual(wide.map(row => [...row].slice(8, 24).join('')))
  await ui.unmount()
})

test('a pinned reel at 59 columns shows no catchphrase', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim breach')
  const variants = Object.values(reelNamed('breach')!.variants)
  const phrases = variants.flatMap(v => v.beats.map(b => b.phrase))
  const last = Math.max(...variants.flatMap(v => v.beats.map(b => b.at)))
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: { columns: 59, rows: 40 } })

  for (let frame = 0; frame <= last + 1; frame += 1) {
    expect(phrases, `frame ${frame}`).not.toContain((await drawnLine(ui)).words)
    await clock.advance(125)
  }

  await ui.unmount()
})

// A session started on this store and these variables, as Claude Code starts one.
const startSession = async ($: Engine, on: Parameters<TestBody>[1], surface: 'terminal' | 'desktop' = 'terminal') => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/', surface, isInteractive: true })
}

test('/sbs theme sets, shows and is kept by reset', async ($, on) => {
  const stored = fakeStore(on)
  mock.env(on, { USER: 'tester' })
  await startSession($, on)
  const run = async (args: string) => JSON.stringify(await sbsCommand($, args))

  const reply = await run('theme nightcity')
  expect(reply).toContain('Theme is now nightcity.')
  expect(reply).toContain('For Claude Code\'s own colors, run install.sh --theme nightcity, or pick it with /theme once installed.')
  expect(stored.theme).toBe('nightcity')
  await run('reset')
  expect(stored.theme).toBe('nightcity')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await run('status')).toContain('Reply header: CLAUDE. Theme: nightcity.')
  expect(await run('theme securebine')).toContain('Theme is now securebine.')
  expect(await run('theme securebine')).not.toContain('install.sh')
})

test('/sbs theme with no argument names the theme and the choices', async ($, on) => {
  mock.store(on)
  expect(JSON.stringify(await sbsCommand($, 'theme'))).toContain('Theme: securebine. Choose from: securebine, nightcity.')
  await sbsCommand($, 'theme nightcity')
  expect(JSON.stringify(await sbsCommand($, 'theme'))).toContain('Theme: nightcity. Choose from: securebine, nightcity.')
})

test('an unknown theme changes nothing', async ($, on) => {
  const stored = fakeStore(on)
  expect(JSON.stringify(await sbsCommand($, 'theme neon'))).toContain('No theme called \\"neon\\". Choose from: securebine, nightcity.')
  expect(stored.theme).toBeUndefined()
  expect(JSON.stringify(await sbsCommand($, 'status'))).toContain('Theme: securebine.')
})

test('a stored theme that is not a theme is ignored', async ($, on) => {
  mock.store(on, { theme: 'neon' })
  mock.env(on, { USER: 'tester' })
  await startSession($, on)
  expect(JSON.stringify(await sbsCommand($, 'status'))).toContain('Theme: securebine.')
})

test('a stored theme is restored at session start', async ($, on) => {
  mock.store(on, { theme: 'nightcity' })
  mock.env(on, { USER: 'tester' })
  await startSession($, on)
  expect(JSON.stringify(await sbsCommand($, 'status'))).toContain('Theme: nightcity.')
})

test('Night City draws the label on a yellow plate and the header on an aqua plate', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  engineUserMessage(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  await sbsCommand($, 'theme nightcity')

  const box = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect((await box.find({ type: 'Text', text: 'OPERATOR' }))?.props.backgroundColor).toBe('#F3E600')
  await box.unmount()

  await $.turn.start({ text: 'go', turnId: 't1' })
  const reply = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: 'a reply', isFirstOfReply: true },
  })
  expect((await reply.find({ type: 'Text', text: 'CLAUDE' }))?.props.backgroundColor).toBe('#55EAD4')
  await reply.unmount()
})

// Every color and plate the art rows draw in.
async function artPaints(ui: { find: (q: { key: string }) => Promise<{ children: unknown[] } | undefined> }) {
  const paints: string[] = []
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return
    const { props, children } = node as { props?: Record<string, unknown>; children?: unknown[] }
    for (const value of [props?.color, props?.backgroundColor]) if (typeof value === 'string') paints.push(value.toUpperCase())
    for (const child of children ?? []) walk(child)
  }
  for (const key of ['art0', 'art1']) walk(await ui.find({ key }))

  return paints
}

test('a theme change mid-reel recolors the next frame without restarting the reel', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'anim breach')
  const beats = reelNamed('breach')!.variants.run!.beats
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })

  await clock.advance((beats[0]!.at + 12) * 125)
  expect(await artPaints(ui)).toContainEqual('#FF2E97')
  await sbsCommand($, 'theme nightcity')
  await clock.advance(125)
  const outer = (await ui.findAll({ type: 'Box' })).find(b => b.key?.startsWith('reel:'))
  expect(outer?.key).toBe('reel:breach:run')
  const paints = await artPaints(ui)
  expect(paints.some(p => ['#C5003C', '#880425', '#F3E600', '#55EAD4'].includes(p)), paints.join()).toBe(true)
  for (const old of ['#FF2E97', '#46637B', '#F5A701', '#00E5FF']) expect(paints).not.toContain(old)

  for (let frame = beats[0]!.at + 13; frame < beats[1]!.at; frame += 1) {
    expect((await drawnLine(ui)).words, `frame ${frame}`).not.toBe(beats[0]!.phrase)
    await clock.advance(125)
  }

  expect((await drawnLine(ui)).words).toBe(beats[1]!.phrase)
  await ui.unmount()
})

// Row 1's resolved phrases over 200 frames: those that are a whole phrase of
// the Night City pool or of the thinking pool.
async function resolvedPhrases(
  $: Engine,
  on: Parameters<TestBody>[1],
  setup: string[],
  viewport: { columns: number; rows: number },
) {
  const clock = mock.clock(on)
  mock.store(on)
  for (const args of setup) await sbsCommand($, args)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport })
  const samples: string[] = []

  for (let frame = 0; frame < 200; frame += 1) {
    const { words } = await drawnLine(ui)
    const phrase = words.split(' · ')[0]!.replace(/…$/, '')
    if (NIGHT_CITY_PHRASES.includes(words) || SPINNER_PHRASES.thinking.includes(words)) samples.push(words)
    else if (NIGHT_CITY_PHRASES.includes(phrase) || SPINNER_PHRASES.thinking.includes(phrase)) samples.push(phrase)
    await clock.advance(125)
  }

  await ui.unmount()
  expect(samples.length).toBeGreaterThanOrEqual(10)

  return samples
}

test('in Night City row 1 draws from the Night City pool while Breach Protocol plays', { timeoutMs: 30_000 }, async ($, on) => {
  for (const phrase of await resolvedPhrases($, on, ['theme nightcity', 'anim breach'], WIDE)) expect(NIGHT_CITY_PHRASES).toContain(phrase)
})

test('in Night City row 1 draws from the Night City pool while Sandevistan plays', { timeoutMs: 30_000 }, async ($, on) => {
  for (const phrase of await resolvedPhrases($, on, ['theme nightcity', 'anim sandevistan'], WIDE)) expect(NIGHT_CITY_PHRASES).toContain(phrase)
})

test('in SecureBine row 1 keeps the mode pool while Breach Protocol plays', { timeoutMs: 30_000 }, async ($, on) => {
  for (const phrase of await resolvedPhrases($, on, ['anim breach'], WIDE)) expect(SPINNER_PHRASES.thinking).toContain(phrase)
})

test('in Night City row 1 keeps the mode pool while a legacy reel plays', { timeoutMs: 30_000 }, async ($, on) => {
  for (const phrase of await resolvedPhrases($, on, ['theme nightcity', 'anim bar'], WIDE)) expect(SPINNER_PHRASES.thinking).toContain(phrase)
})

test('in Night City row 1 keeps the mode pool at 59 columns', { timeoutMs: 30_000 }, async ($, on) => {
  const narrow = { columns: 59, rows: 40 }
  for (const phrase of await resolvedPhrases($, on, ['theme nightcity', 'anim breach'], narrow)) expect(SPINNER_PHRASES.thinking).toContain(phrase)
})

test('in Night City row 1 keeps the mode pool with anim off', { timeoutMs: 30_000 }, async ($, on) => {
  for (const phrase of await resolvedPhrases($, on, ['theme nightcity', 'anim off'], WIDE)) expect(SPINNER_PHRASES.thinking).toContain(phrase)
})

test('Night City boxes stay square on an unchecked terminal', async ($, on) => {
  mock.store(on)
  engineUserMessage(on)
  let variables: Record<string, string> = {}
  on('env.get', ($, e) => ({ value: variables[e.name] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  await sbsCommand($, 'theme nightcity')
  const cases: [string, Record<string, string>, 'terminal' | 'desktop'][] = [
    ['unchecked terminal', { TERM_PROGRAM: 'sbs-test-unchecked-terminal' }, 'terminal'],
    ['tmux', { TMUX: '/tmp/tmux-1/default,1,0', TERM_PROGRAM: 'sbs-test-unchecked-terminal' }, 'terminal'],
    ['no variables', {}, 'terminal'],
    ['desktop', { TERM_PROGRAM: 'sbs-test-unchecked-terminal' }, 'desktop'],
  ]

  for (const [name, env, surface] of cases) {
    variables = env
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({
      plugin: 'sbs-deck',
      surface,
      component: 'UserMessage',
      props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Text', text: 'OPERATOR' }), name).toBeDefined()
    expect(await ui.find({ key: 'cut-tl' }), name).toBeUndefined()
    expect(await ui.find({ key: 'cut-br' }), name).toBeUndefined()
    await ui.unmount()
  }
})

// The picker in auto (s5.5). No test here but the rare one runs a main
// `turn.start`, so no rare roll decides an outcome, and each starts with fresh
// bags. Pools overlap, so a pool is checked by drawing as many fresh instances
// as it holds: one full bag, every entry once in some order.

// A pool entry as a drawn key is compared with it: a fixed variant is named.
const entryText = ({ reel, variant }: Entry) => (variant === undefined ? reel : `${reel}:${variant}`)

// A drawn key `reel:<name>:<variant>` read as its entry in `pool`: the variant
// counts only where the pool fixes one.
function asEntry(key: string | undefined, pool: readonly Entry[]): string {
  const [, reel = '', variant] = (key ?? '').split(':')

  return pool.find(entry => entry.reel === reel)?.variant === undefined ? reel : `${reel}:${variant}`
}

const reelOf = async (ui: Parameters<typeof reelKey>[0]) => ((await reelKey(ui)) ?? '').split(':')[1] ?? ''
const variantOf = async (ui: Parameters<typeof reelKey>[0]) => {
  const [, name = '', variant = ''] = ((await reelKey(ui)) ?? '').split(':')

  return reelNamed(name)!.variants[variant]!
}
const poolFor = (context: Context) => poolOf(context, NEW_REELS)
const sortedPool = (context: Context) => poolFor(context).map(entryText).sort()

let freshCount = 0

// The key one fresh instance draws first, unmounted at once.
async function firstKey($: Engine, mode: SpinnerMode, requestId = `fresh-${(freshCount += 1)}`) {
  const ui = await spinnerOn($, mode, 'terminal', { viewport: WIDE, requestId })
  const key = await reelKey(ui)
  await ui.unmount()

  return key
}

// What `count` fresh instances draw, each read as its entry in `context`'s pool.
async function drawnPool($: Engine, mode: SpinnerMode, context: Context, count = poolFor(context).length) {
  const drawn: string[] = []

  for (let k = 0; k < count; k += 1) {
    drawn.push(asEntry(await firstKey($, mode), poolFor(context)))
  }

  return drawn
}

// Main-loop tool calls whose runs stay open until the test releases each one.
function heldCalls($: Engine, on: Parameters<TestBody>[1]) {
  let release = () => {}
  let arrived = () => {}
  on('tool.call', async () => {
    const open = new Promise<void>(resolve => {
      release = resolve
    })
    arrived()
    await open

    return { deny: 'held by the test' }
  })

  // Starts a call; resolves once its run is open, with its release and its end.
  return async (input: ToolCallArgs) => {
    const reached = new Promise<void>(resolve => {
      arrived = resolve
    })
    const settled = $.tool.call(input).then(
      () => undefined,
      () => undefined,
    )
    await reached

    return { release, settled }
  }
}

const BASH = { tool: 'Bash', command: 'ls' } as ToolCallArgs
const EDIT = { tool: 'Edit', file_path: '/tmp/x', old_string: 'a', new_string: 'b' } as ToolCallArgs
const WEB_FETCH = { tool: 'WebFetch', url: 'https://example.com', prompt: 'read it' } as ToolCallArgs
const AGENT = { tool: 'Agent', description: 'look', prompt: 'look around' } as ToolCallArgs

test('every indexed reel appears in /sbs anim list and in the pool of each of its contexts', async ($, on) => {
  mock.store(on)
  const list = JSON.stringify(await sbsCommand($, 'anim list'))

  for (const reel of NEW_REELS) {
    expect(list, reel.name).toContain(reel.rare ? `${reel.name} (rare)` : reel.name)

    for (const context of reel.contexts) {
      const [name, variant] = context.split(':')
      expect(poolFor(name as Context), context).toContainEqual({ reel: reel.name, variant })
    }

    if (!reel.rare && reel.name !== 'kodama') {
      expect(poolFor('other'), reel.name).toContainEqual({ reel: reel.name, variant: undefined })
    }
  }
})

test('detection reaches agents', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const start = heldCalls($, on)

  const call = await start(AGENT)
  expect((await drawnPool($, 'thinking', 'agents')).sort()).toEqual(sortedPool('agents'))
  call.release()
  await call.settled

  // A subagent's spinner, with no tool running.
  const drawn: string[] = []

  for (const [k] of poolFor('agents').entries()) {
    await $.turn.start({ text: '', turnId: `s${k}`, agentId: `agent-${k}` })
    drawn.push(asEntry(await firstKey($, 'thinking', `agent-${k}`), poolFor('agents')))
  }

  expect(drawn.sort()).toEqual(sortedPool('agents'))
})

test('detection reaches long-wait', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'waiting' })
  await clock.advance(60_000)
  // The hold, then one more loop: the two picks after it.
  const picks: string[] = []
  let last = await reelOf(ui)

  for (let tick = 0; tick < 600 && picks.length < 2; tick += 1) {
    await clock.advance(125)
    const reel = await reelOf(ui)

    if (reel !== last) {
      picks.push(reel)
      last = reel
    }
  }

  expect(picks.sort()).toEqual(['kodama', 'vortex'])
  await ui.unmount()
})

for (const [context, input] of [['shell', BASH], ['edit', EDIT], ['web', WEB_FETCH]] as const) {
  test(`detection reaches ${context}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const call = await heldCalls($, on)(input)
    expect((await drawnPool($, 'thinking', context)).sort()).toEqual(sortedPool(context))
    call.release()
    await call.settled
  })
}

for (const [context, mode] of [['thinking', 'thinking'], ['requesting', 'requesting'], ['other', 'responding']] as const) {
  test(`detection reaches ${context}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    expect((await drawnPool($, mode, context)).sort()).toEqual(sortedPool(context))
  })
}

test('with tools in parallel the most recent counts', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const start = heldCalls($, on)
  const bash = await start(BASH)
  const edit = await start(EDIT)
  expect((await drawnPool($, 'thinking', 'edit')).sort()).toEqual(sortedPool('edit'))
  edit.release()
  bash.release()
  await Promise.all([edit.settled, bash.settled])
})

test('streamed Bash input counts as shell before the call starts', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const ended = { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  on('turn.step', async function* () {
    yield { kind: 'tool' as const, index: 0, id: 'toolu_1', name: 'Bash' }
    // Held open: the test closes the step.
    await new Promise<void>(() => {})

    return ended
  })

  const step = $.turn.step({ turnId: 't1', index: 0, model: 'test', messageCount: 1 })
  await step.next()
  expect((await drawnPool($, 'thinking', 'shell')).sort()).toEqual(sortedPool('shell'))
  await step.return(ended)
  expect((await drawnPool($, 'thinking', 'thinking')).sort()).toEqual(sortedPool('thinking'))
})

test('in Night City auto, row 1 draws from the Night City pool exactly while the picked reel is breach', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await sbsCommand($, 'theme nightcity')
  const thinking = poolFor('thinking').map(entry => entry.reel)
  // One instance that plays breach and one that plays another thinking reel:
  // the bag holds three, so within three.
  const kept = new Map<'breach' | 'other', Awaited<ReturnType<typeof spinnerOn>>>()

  for (let k = 0; k < 3 && kept.size < 2; k += 1) {
    const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: `nc-${k}` })
    const first = await reelOf(ui)
    const kind = first === 'breach' ? 'breach' : 'other'
    expect(thinking).toContain(first)

    if (kept.has(kind)) {
      await ui.unmount()
    } else {
      kept.set(kind, ui)
    }
  }

  expect([...kept.keys()].sort()).toEqual(['breach', 'other'])
  const resolved = new Map([...kept.keys()].map(kind => [kind, 0]))

  // A loop end may change the reel; the phrase source follows it.
  for (let frame = 0; frame < 200; frame += 1) {
    for (const [kind, ui] of kept) {
      const { words } = await drawnLine(ui)
      const reel = await reelOf(ui)

      if (NIGHT_CITY_PHRASES.includes(words) || SPINNER_PHRASES.thinking.includes(words)) {
        resolved.set(kind, resolved.get(kind)! + 1)
        expect(reel === 'breach' ? NIGHT_CITY_PHRASES : SPINNER_PHRASES.thinking, `${kind}: ${reel} at frame ${frame}`).toContain(words)
      }
    }

    await clock.advance(125)
  }

  for (const [kind, count] of resolved) expect(count, kind).toBeGreaterThanOrEqual(10)
  for (const ui of kept.values()) await ui.unmount()
})

test('a Bash call that rejects is removed from the running-tool list', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', async () => {
    throw new Error('the run failed')
  })
  await $.tool.call(BASH).then(
    () => undefined,
    () => undefined,
  )

  const drawn = await drawnPool($, 'thinking', 'thinking')
  expect(drawn.sort()).toEqual(['breach', 'dontpanic:deep-thought', 'hokuto:seven-stars'])
  expect(drawn).not.toContain('digitalrain')
  expect(drawn).not.toContain('lightcycles')
})

test('a reel is picked when the spinner first appears and at each loop end', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'looping' })
  const first = await reelOf(ui)
  expect(poolFor('thinking').map(entry => entry.reel)).toContain(first)

  const { loop } = await variantOf(ui)
  await clock.advance((loop - 1) * 125)
  expect(await reelOf(ui)).toBe(first)
  // The draw where the frame reaches the loop: the bag never repeats back to back.
  await clock.advance(125)
  const next = await reelOf(ui)
  expect(poolFor('thinking').map(entry => entry.reel)).toContain(next)
  expect(next).not.toBe(first)
  await ui.unmount()
})

test('on a context change the reel finishes its current phase, then switches', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const start = heldCalls($, on)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'switching' })
  const first = await reelOf(ui)
  const variant = await variantOf(ui)
  const edit = await start(EDIT)
  // The first tick after the call draws frame 1.
  const end = holdEnd(variant, 1)

  for (let frame = 1; frame < end; frame += 1) {
    await clock.advance(125)
    expect(await reelOf(ui), `frame ${frame}`).toBe(first)
  }

  await clock.advance(125)
  expect(poolFor('edit').map(entry => entry.reel)).toContain(await reelOf(ui))
  edit.release()
  await edit.settled
  await ui.unmount()
})

test('a reel in the new pool plays on', { timeoutMs: 30_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const start = heldCalls($, on)
  let ui: Awaited<ReturnType<typeof spinnerOn>> | undefined

  for (let k = 0; k < 3 && ui === undefined; k += 1) {
    const candidate = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: `on-${k}` })

    if ((await reelKey(candidate)) === 'reel:breach:run') {
      ui = candidate
    } else {
      await candidate.unmount()
    }
  }

  expect(ui).toBeDefined()
  const { loop, beats } = reelNamed('breach')!.variants.run!
  // Frame 12 lies in [beats[0].at + 12, beats[1].at): the opening catchphrase is past.
  const at = beats[0]!.at + 12
  expect(at).toBeLessThan(beats[1]!.at)
  await clock.advance(at * 125)
  const bash = await start(BASH)

  for (let frame = at; frame < loop; frame += 1) {
    expect(await reelKey(ui!), `frame ${frame}`).toBe('reel:breach:run')
    expect((await drawnLine(ui!)).words, `frame ${frame}`).not.toBe(beats[0]!.phrase)
    await clock.advance(125)
  }

  bash.release()
  await bash.settled
  await ui!.unmount()
})

test('a second context change during the hold does not move its end', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const start = heldCalls($, on)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'twice' })
  const first = await reelOf(ui)
  const variant = await variantOf(ui)
  expect(1).toBeLessThan(variant.beats[1]!.at)
  const edit = await start(EDIT)
  const end = holdEnd(variant, 1)
  // Up to two frames before the hold's end, then the second change.
  await clock.advance((end - 2) * 125)
  expect(await reelOf(ui)).toBe(first)
  const web = await start(WEB_FETCH)
  await clock.advance(125)
  expect(await reelOf(ui)).toBe(first)
  await clock.advance(125)
  expect(poolFor('web').map(entryText)).toContain(asEntry(await reelKey(ui), poolFor('web')))
  web.release()
  edit.release()
  await Promise.all([web.settled, edit.settled])
  await ui.unmount()
})

test('a change back to the first context during the hold cancels it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const start = heldCalls($, on)
  const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId: 'back' })
  const key = await reelKey(ui)
  const variant = await variantOf(ui)
  // The first frame drawn after the call: in [beats[0].at, beats[1].at - 3).
  const at = Math.max(1, variant.beats[0]!.at)
  expect(at).toBeLessThan(variant.beats[1]!.at - 3)
  await clock.advance((at - 1) * 125)
  const edit = await start(EDIT)
  const end = holdEnd(variant, at)
  expect(end).toBe(variant.beats[1]!.at)
  await clock.advance((end - 2 - (at - 1)) * 125)
  edit.release()
  await edit.settled

  for (let frame = end - 1; frame <= end + 4; frame += 1) {
    await clock.advance(125)
    expect(await reelKey(ui), `frame ${frame}`).toBe(key)
  }

  await ui.unmount()
})

test('a bag entry with no fixed variant rotates', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const ghosts: string[] = []

  for (let k = 0; k < 2 * poolFor('other').length && ghosts.length < 2; k += 1) {
    const key = await firstKey($, 'responding')

    if (key?.startsWith('reel:ghost:')) ghosts.push(key)
  }

  expect(ghosts).toEqual(['reel:ghost:camo', 'reel:ghost:net-dive'])
})

test('the bag never repeats within a pool or back to back', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const bash = await heldCalls($, on)(BASH)
  const drawn = await drawnPool($, 'thinking', 'shell', 3 * poolFor('shell').length)
  const size = poolFor('shell').length

  for (let refill = 0; refill < 3; refill += 1) {
    expect(drawn.slice(refill * size, (refill + 1) * size).sort(), `refill ${refill}`).toEqual(sortedPool('shell'))
  }

  for (let k = 1; k < drawn.length; k += 1) expect(drawn[k], `draw ${k}`).not.toBe(drawn[k - 1])
  bash.release()
  await bash.settled
})

test('bags reset at session.end with reason clear', { timeoutMs: 30_000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  const bash = await heldCalls($, on)(BASH)

  for (let trial = 0; trial < 20; trial += 1) {
    await drawnPool($, 'thinking', 'shell', 2)
    await $.session.end({ reason: 'clear', sessionId: `s${trial}`, resume: { id: `s${trial}` } })
    expect((await drawnPool($, 'thinking', 'shell')).sort(), `trial ${trial}`).toEqual(sortedPool('shell'))
  }

  bash.release()
  await bash.settled
})

test('the rare reel replaces only a main turn\'s first pick and plays its whole loop through a context change', { timeoutMs: 60_000 }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  let rare = 0

  for (let turn = 0; turn < 1_000 && (turn < 200 || rare === 0); turn += 1) {
    await $.turn.start({ text: 'go', turnId: `t${turn}` })

    // In alternate turns a subagent's spinner draws before the main one.
    if (turn % 2 === 1) {
      await $.turn.start({ text: '', turnId: `a${turn}`, agentId: `agent-${turn}` })
      expect(await firstKey($, 'thinking', `agent-${turn}`), `agent in turn ${turn}`).not.toStartWith('reel:sauron:')
    }

    const main = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE })
    const key = await reelKey(main)

    for (const extra of ['x', 'y']) {
      expect(await firstKey($, 'thinking', `extra-${turn}-${extra}`), `extra in turn ${turn}`).not.toStartWith('reel:sauron:')
    }

    if (key === 'reel:sauron:gaze' && rare === 0) {
      // Its whole loop, while the mode changes under it.
      const { loop } = reelNamed('sauron')!.variants.gaze!

      for (let frame = 1; frame < loop; frame += 1) {
        await main.redraw({ word: 'Baking', message: null, suffix: '…', mode: frame % 2 === 0 ? 'thinking' : 'requesting' })
        await clock.advance(125)
        expect(await reelKey(main), `frame ${frame}`).toBe('reel:sauron:gaze')
      }

      await clock.advance(125)
      expect(await reelKey(main)).not.toStartWith('reel:sauron:')
    }

    if (key?.startsWith('reel:sauron:')) rare += 1
    await main.unmount()
  }

  expect(rare).toBeGreaterThan(0)
})

test('a tool that starts and ends between draws restarts the long-wait clock', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ deny: 'done at once' }))
  const reelAfterHiding = async (requestId: string, hidden: () => Promise<void>) => {
    await (await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId })).unmount()
    await hidden()
    // Back past its loop: it picks for the context it detects now.
    const ui = await spinnerOn($, 'thinking', 'terminal', { viewport: WIDE, requestId })
    const reel = await reelOf(ui)
    await ui.unmount()

    return reel
  }

  // Hidden 60 seconds in one state: long-wait.
  expect(poolFor('long-wait').map(entry => entry.reel)).toContain(await reelAfterHiding('steady', () => clock.advance(60_000)))

  // A Bash call halfway through, with no draw while it ran: the clock restarts.
  const reel = await reelAfterHiding('interrupted', async () => {
    await clock.advance(30_000)
    await $.tool.call(BASH)
    await clock.advance(30_000)
  })
  expect(poolFor('thinking').map(entry => entry.reel)).toContain(reel)
})
