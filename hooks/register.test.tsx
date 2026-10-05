import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { SPINNER_PHRASES, decrypt, phraseFor, scanBar } from './spinner'

const SURFACES = ['terminal', 'desktop'] as const

// The closing sentence the engine puts after a prompt delivered mid-turn.
const TAIL = '\n\nThis is how Claude Code surfaces messages the user sends mid-turn.'

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

test('a shell result is drawn with its patterns coloured', async ($, on) => {
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
  const colourOf = async (token: string) =>
    (await ui.findAll({ type: 'Text', text: token })).find(found => found.text === token)?.props.color
  expect(await colourOf('10.0.0.1/24')).toBe('#00E5FF')
  expect(await colourOf('up')).toBe('#3EE08A')
  expect(await colourOf('Gi0/1')).toBe('#F5A701')
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
  let word = ''
  let suffix = ''

  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    word = e.props.word
    suffix = e.props.suffix

    return <Text>spinner</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(SPINNER_PHRASES.thinking.some(phrase => phrase.length === word.length)).toBe(true)
  expect(suffix).toBe(` ${scanBar(0)}`)
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
  let suffix = ''
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    suffix = e.props.suffix

    return <Text>spinner</Text>
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.prompt.submit({ text: 'then this', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  // No turn is running: the clock moving draws nothing new.
  await clock.advance(450)
  const idle = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  const idleSuffix = suffix
  await idle.unmount()

  await $.turn.start({ text: 'then this', turnId: 't2' })
  await clock.advance(450)
  const running = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(suffix).not.toBe(idleSuffix)
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

test('a phrase still resolves after the spinner has been away mid-turn', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let word = ''
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    word = e.props.word

    return <Text>spinner</Text>
  })

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

  // The spinner is away for a minute, as behind a dialog: far past the idle
  // stop of the timer that drives it.
  await clock.advance(60_000)

  // It comes back in a new state: the new phrase starts as noise...
  const back = await spinner('tool-use')
  expect(SPINNER_PHRASES['tool-use']).not.toContain(word)
  await back.unmount()

  // ...and two seconds later it has resolved.
  await clock.advance(2_000)
  const later = await spinner('tool-use')
  expect(SPINNER_PHRASES['tool-use']).toContain(word)
  await later.unmount()
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

  expect(await sbs('')).toContain('Styling is on; quiet tool rows are on; output colouring is on.')
  expect(await sbs('quiet off')).toContain('quiet tool rows are off')
  expect(await sbs('quiet off')).toContain('quiet tool rows are off')
  expect(await sbs('colour off')).toContain('output colouring is off')
  expect(await sbs('normal')).toContain('Styling is off')
  expect(await sbs('status')).toContain('Styling is off; quiet tool rows are off; output colouring is off.')
  expect(await sbs('quiet sideways')).toContain('Unknown option')
  expect(await sbs('reset')).toContain('Styling is on; quiet tool rows are on; output colouring is on.')
})
