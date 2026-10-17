import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import { ANIMATIONS, AUTO, SPINNER_PHRASES, animationFor, decrypt, phraseFor, scanBar } from './spinner'

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
  expect(Object.values(ANIMATIONS).map(draw => ` ${draw(0)}`)).toContain(suffix)
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

test('a spinner back on screen mid-turn is redrawn by a restarted timer', async ($, on) => {
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
  // Away long enough for the timer to stop itself.
  await clock.advance(60_000)

  // Back, and left on screen: only the timer redraws it, so the new phrase
  // resolves only if the timer was started again.
  const back = await spinner('tool-use')
  expect(SPINNER_PHRASES['tool-use']).not.toContain(word)
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain(word)
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

test('/sbs anim picks the spinner animation and refuses an unknown one', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  let suffix = ''
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    suffix = e.props.suffix

    return <Text>spinner</Text>
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

  expect(await sbs('anim list')).toContain('Spinner animation is auto')
  expect(await sbs('anim')).toContain('Spinner animation is now bar')
  expect(await sbs('ani')).toContain('Spinner animation is now wave')
  expect(await sbs('anim sideways')).toContain('No animation called')
  expect(await sbs('anim wave')).toContain('Spinner animation is wave')

  const ui = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(suffix).toBe(` ${ANIMATIONS.wave?.(0)}`)
  await ui.unmount()
})

test('in auto only a phrase that calls for it gets a themed animation', () => {
  expect(animationFor('auto', 'Reading the digital rain')).toBe('rain')
  expect(animationFor('auto', 'Checking for Cylons')).toBe('cylon')
  expect(animationFor('auto', 'Riding the sandworm')).toBe('wave')
  expect(animationFor('auto', 'Jumping to lightspeed')).toBe('warp')
  expect(animationFor('auto', 'Plotting the burn')).toBe('stars')
  expect(animationFor('auto', 'Bug hunting')).toBe('invader')
  expect(animationFor('auto', 'Loading the Construct')).toBe('load')
  // Pairings the review moved: no picture where the words do not call for one.
  expect(animationFor('auto', 'Storming Straylight')).toBe('bar')
  expect(animationFor('auto', 'Seeing the Golden Path')).toBe('bar')
  expect(animationFor('auto', 'Unfolding a sophon')).toBe('bar')
  expect(animationFor('auto', 'Walking without rhythm')).toBe('bar')
  expect(animationFor('auto', 'Thinking with portals')).toBe('bar')
  expect(animationFor('auto', 'Opening hailing frequencies')).toBe('morse')
  expect(animationFor('auto', 'Breaching the attack barrier')).toBe('binary')
  expect(animationFor('auto', 'Loading the quickhack')).toBe('load')
  expect(animationFor('auto', 'Executing the quickhack')).toBe('binary')
  expect(animationFor('auto', 'Firing the beam rifle')).toBe('comet')
  expect(animationFor('auto', 'Calculating the jump')).toBe('stars')
  expect(animationFor('auto', 'Firing the PDCs')).toBe('comet')
  expect(animationFor('auto', 'Opening the pod bay doors')).toBe('bar')
  expect(animationFor('auto', 'Testing, for science')).toBe('bar')
  expect(animationFor('auto', 'Purging the heresy')).toBe('fire')
  expect(animationFor('auto', 'Priming the thermoptics')).toBe('load')
  expect(animationFor('auto', 'Reloading the shotgun')).toBe('load')
  expect(animationFor('auto', 'Uplinking to Cyberdyne')).toBe('morse')
  expect(animationFor('auto', 'Raising Tycho Station')).toBe('morse')
  expect(animationFor('auto', 'Prepping a fresh sleeve')).toBe('helix')
  expect(animationFor('auto', 'Pinging the mothership')).toBe('sonar')
  expect(animationFor('auto', 'Handshaking')).toBe('pulse')
  // Nothing in these calls for a picture: they keep the plain bar.
  expect(animationFor('auto', 'Grabbing my towel')).toBe('bar')
  expect(animationFor('auto', 'Consulting the Codex')).toBe('bar')
  expect(animationFor('eq', 'Reading the digital rain')).toBe('eq')

  const all = Object.values(SPINNER_PHRASES).flat()

  for (const phrase of all) {
    expect(Object.keys(ANIMATIONS), phrase).toContain(animationFor('auto', phrase))
  }

  // A good share of the phrases stay plain.
  expect(all.filter(phrase => animationFor('auto', phrase) === 'bar').length).toBeGreaterThan(all.length / 3)
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

test('a stored animation name is restored only when it names an animation', async ($, on) => {
  mock.clock(on)
  mock.env(on, { USER: 'tester' })
  const stored: Record<string, unknown> = { animation: 'constructor' }
  let suffix = ''
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    suffix = e.props.suffix

    return <Text>spinner</Text>
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
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(suffix).toBe(` ${ANIMATIONS.cylon?.(0)}`)
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

// The word and suffix the Spinner was last drawn with.
function spinnerProbe(on: Parameters<TestBody>[1]): { word: string; suffix: string } {
  const drawn = { word: '', suffix: '' }
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    drawn.word = e.props.word
    drawn.suffix = e.props.suffix

    return <Text>spinner</Text>
  })

  return drawn
}

// The main loop's spinner: one instance, the same id on every surface.
const spinnerOn = ($: Engine, mode: 'requesting' | 'thinking' | 'tool-input' | 'tool-use', surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: 'sbs-deck',
    surface,
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Baking', message: null, suffix: '…', mode },
  })

test('in auto the spinner draws the animation its phrase calls for', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const drawn = spinnerProbe(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const modes = ['thinking', 'tool-use', 'tool-input', 'requesting'] as const
  let themed = 0

  for (let step = 0; step < 60; step += 1) {
    const mode = modes[step % modes.length] ?? 'thinking'
    const ui = await spinnerOn($, mode)
    await clock.advance(1_500)
    // Judged on a frame where the phrase reads whole: a resolved phrase still
    // flickers a character to noise now and then. The bar is the only
    // animation drawn with these cells.
    if (SPINNER_PHRASES[mode].includes(drawn.word)) {
      const name = animationFor(AUTO, drawn.word)
      themed += name === 'bar' ? 0 : 1
      expect(drawn.suffix.includes('▰'), drawn.word).toBe(name === 'bar')
    }

    await ui.unmount()
  }

  expect(themed).toBeGreaterThan(0)
})

test('a subagent finishing does not stop the main turn\'s spinner', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const drawn = spinnerProbe(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const ui = await spinnerOn($, 'tool-use')
  await $.turn.complete({ answer: 'found it', durationMs: 5, isAborted: false, turnId: 's1', agentId: 'agent-1', reason: 'answer' })
  // Left on screen and in the same state, only the timer redraws it.
  expect(SPINNER_PHRASES['tool-use']).not.toContain(drawn.word)
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain(drawn.word)
  await ui.unmount()
})

test('each turn opens on a new phrase, even in the state the last one ended in', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const drawn = spinnerProbe(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await spinnerOn($, 'requesting')
  await clock.advance(2_000)
  const before = drawn.word
  expect(SPINNER_PHRASES.requesting).toContain(before)
  await first.unmount()

  await $.turn.start({ text: 'again', turnId: 't2' })
  const second = await spinnerOn($, 'requesting')
  expect(SPINNER_PHRASES.requesting).not.toContain(drawn.word)
  await clock.advance(2_000)
  expect(drawn.word).not.toBe(before)
  await second.unmount()
})

test('spinners on the terminal and the desktop each resolve their own phrase', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  const words: Record<string, string> = {}
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    words[e.surface] = e.props.word

    return <Text>spinner</Text>
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const terminal = await spinnerOn($, 'tool-input', 'terminal')
  const desktop = await spinnerOn($, 'tool-use', 'desktop')
  await clock.advance(3_000)
  expect(SPINNER_PHRASES['tool-input']).toContain(words.terminal)
  expect(SPINNER_PHRASES['tool-use']).toContain(words.desktop)
  await terminal.unmount()
  await desktop.unmount()
})

test('a queued prompt waits as the rest of the chain let it in', async ($, on) => {
  let rewrite: string | undefined
  let isDropped = false
  on('prompt.submit', ($, e) => (isDropped ? { drop: 'not now' } : { text: rewrite ?? e.text }))
  engineUserMessage(on)

  // A rewritten one is let go: it may be read under its new text before the
  // chain returns, and must not be left waiting after that.
  rewrite = 'rewritten ask'
  await $.prompt.submit({ text: 'typed ask', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  expect(await isQueued($, 'rewritten ask')).toBe(false)
  expect(await isQueued($, 'typed ask')).toBe(false)

  rewrite = undefined
  isDropped = true
  await $.prompt.submit({ text: 'dropped ask', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  expect(await isQueued($, 'dropped ask')).toBe(false)

  // A dropped copy of a prompt that is already waiting leaves that one waiting.
  isDropped = false
  await $.prompt.submit({ text: 'same ask', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  isDropped = true
  await $.prompt.submit({ text: 'same ask', wait: false, origin: { kind: 'composer' }, turnId: 't1' })
  expect(await isQueued($, 'same ask')).toBe(true)
})

test('a subagent starting keeps the main turn\'s phrase and its one reply header', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  const drawn = spinnerProbe(on)
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
  const phrase = drawn.word
  expect(SPINNER_PHRASES['tool-use']).toContain(phrase)

  await $.turn.start({ text: 'look this up', turnId: 's1', agentId: 'agent-1' })
  await clock.advance(150)
  expect(drawn.word).toBe(phrase)
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
  const words: Record<string, string> = {}
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    words[e.requestId] = e.props.word

    return <Text>spinner</Text>
  })
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
  const settled = words['agent-a']
  expect(SPINNER_PHRASES.thinking).toContain(settled)

  // A second spinner enters the same state, then another.
  const second = await spinnerFor('agent-b', 'thinking')
  const third = await spinnerFor('agent-c', 'tool-use')
  await clock.advance(2_000)
  expect(words['agent-a']).toBe(settled)
  expect(SPINNER_PHRASES.thinking).toContain(words['agent-b'])
  expect(SPINNER_PHRASES['tool-use']).toContain(words['agent-c'])
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
  const words: Record<string, string> = {}
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    words[e.requestId] = e.props.word

    return <Text>spinner</Text>
  })

  await $.turn.start({ text: 'go', turnId: 't1' })
  const background = await $.ui.mount({
    plugin: 'sbs-deck',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'agent-1',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'tool-use' },
  })
  await $.turn.complete({ answer: 'started it', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(SPINNER_PHRASES['tool-use']).not.toContain(words['agent-1'])
  await clock.advance(2_000)
  expect(SPINNER_PHRASES['tool-use']).toContain(words['agent-1'])
  await background.unmount()
})
