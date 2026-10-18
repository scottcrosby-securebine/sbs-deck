import { expect, test } from 'claude-code/testing'

import { endStep, formatElapsed, newTurn, readoutText, withEffort } from './readout'

test('the readout formats elapsed, tokens and effort', () => {
  const stats = withEffort({ ...newTurn(0), doneTokens: 4180 }, 'high')
  expect(readoutText(stats, 12_000, 80)).toBe('12s · ~4.2k tokens · effort high')
  expect(readoutText(stats, 64_000, 0)).toBe('1m 4s · 4.2k tokens · effort high')
  expect(readoutText({ ...newTurn(0), doneTokens: 999 }, 3_000, 0)).toBe('3s · 999 tokens')
  expect(readoutText(withEffort(newTurn(0), 3), 0, 0)).toBe('0s · 0 tokens · effort 3')
  expect(readoutText(undefined, 0, 0)).toBe('-- · -- tokens')
  expect(formatElapsed(3_723_000)).toBe('1h 2m 3s')
})

test('a step without effort keeps the last value', () => {
  expect(withEffort(withEffort(newTurn(0), 'high'), undefined).effort).toBe('high')
})

test('a step without usage keeps its estimate and its ~ until the turn ends', () => {
  const after = endStep(newTurn(0), undefined, 400)
  expect(readoutText(after, 1_000, 0)).toBe('1s · ~100 tokens')
  expect(readoutText(endStep(after, 50, 0), 1_000, 0)).toBe('1s · ~150 tokens')
  expect(readoutText(newTurn(5_000), 6_000, 0)).toBe('1s · 0 tokens')
})

test('real usage replaces the estimate at once, lower or higher', () => {
  expect(readoutText(endStep(newTurn(0), 20, 4000), 0, 0)).toBe('0s · 20 tokens')
})
