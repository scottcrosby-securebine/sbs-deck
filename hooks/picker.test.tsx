import { expect, test } from 'claude-code/testing'

import type { Reel, Variant } from './canvas'
import { drawFromBag, contextOf, holdEnd, nextVariant, poolOf, rollsRare } from './picker'
import type { Bags } from './picker'

const V: Variant = { loop: 72, beats: [] }
const make = (name: string, contexts: string[], variants: string[], rare = false): Reel => ({
  name, title: name, source: 'test', contexts, rare,
  variants: Object.fromEntries(variants.map(v => [v, V])),
  draw() {},
})

const LAUNCH: Reel[] = [
  make('apes', ['agents'], ['march']),
  make('breach', ['shell', 'thinking'], ['run']),
  make('digitalrain', ['shell'], ['rain']),
  make('dontpanic', ['thinking:deep-thought'], ['cover', 'deep-thought', 'improbability']),
  make('ghost', ['edit', 'web:net-dive'], ['camo', 'net-dive', 'lattice']),
  make('hokuto', ['thinking:seven-stars', 'requesting:flurry'], ['flurry', 'seven-stars']),
  make('jupiter2', ['web'], ['course']),
  make('kodama', ['long-wait'], ['walk']),
  make('lightcycles', ['shell', 'edit'], ['race']),
  make('sandevistan', ['agents', 'requesting'], ['run']),
  make('sauron', [], ['gaze'], true),
  make('vortex', ['long-wait'], ['vortex']),
]

function seeded(n: number): () => number {
  let s = n * 2654435761 + 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

test('detection follows the table, first row winning', () => {
  const base = { mode: 'thinking' as const, isSubagent: false, tool: undefined, unchangedMs: 0 }
  expect(contextOf({ ...base, isSubagent: true, tool: 'Bash' })).toBe('agents')
  expect(contextOf({ ...base, tool: 'Task' })).toBe('agents')
  expect(contextOf({ ...base, tool: 'Bash', unchangedMs: 60_000 })).toBe('long-wait')
  expect(contextOf({ ...base, tool: 'Bash' })).toBe('shell')
  expect(contextOf({ ...base, tool: 'NotebookEdit' })).toBe('edit')
  expect(contextOf({ ...base, tool: 'mcp__browser__Fetch_page' })).toBe('web')
  expect(contextOf({ ...base, tool: 'Read' })).toBe('thinking')
  expect(contextOf({ ...base, mode: 'requesting' })).toBe('requesting')
  expect(contextOf({ ...base, mode: 'responding' })).toBe('other')
})

test('pools match the table in docs/reels.md, with fixed variants where it names one', () => {
  expect(poolOf('thinking', LAUNCH)).toEqual([
    { reel: 'breach', variant: undefined }, { reel: 'dontpanic', variant: 'deep-thought' }, { reel: 'hokuto', variant: 'seven-stars' }])
  expect(poolOf('other', LAUNCH).map(e => e.reel)).not.toContain('kodama')
  expect(poolOf('other', LAUNCH).map(e => e.reel)).not.toContain('sauron')
})

test('an empty pool is the other pool', () => {
  const other = poolOf('other', LAUNCH)
  expect(other.length).toBeGreaterThan(0)
  expect(poolOf('web', [LAUNCH[0]!])).toEqual(poolOf('other', [LAUNCH[0]!]))
  expect(poolOf('web', [])).toEqual([])
})

test('a bag plays every entry before any repeats, and never the same one twice in a row', () => {
  const bags: Bags = new Map()
  const pool = poolOf('shell', LAUNCH)
  let previous = ''
  for (let round = 0; round < 30; round += 1) {
    const seen = new Set<string>()
    for (let i = 0; i < pool.length; i += 1) {
      const reel = drawFromBag(bags, 'shell', pool, seeded(round)).reel
      expect(reel).not.toBe(previous)
      seen.add(reel)
      previous = reel
    }
    expect(seen.size).toBe(pool.length)
  }
})

test('five spinners drawing from one bag in one tick never get back-to-back repeats', () => {
  const bags: Bags = new Map()
  const pool = poolOf('shell', LAUNCH)
  const rngs = [1, 2, 3, 4, 5].map(seeded)
  let previous = ''
  for (let i = 0; i < 60; i += 1) {
    const reel = drawFromBag(bags, 'shell', pool, rngs[i % 5]!).reel
    expect(reel).not.toBe(previous)
    previous = reel
  }
})

test('the hold ends where the current phase ends, or at the loop end', () => {
  const v = { loop: 72, beats: [{ at: 4, phrase: 'A' }, { at: 40, phrase: 'B' }] }
  expect(holdEnd(v, 10)).toBe(40)
  expect(holdEnd(v, 50)).toBe(72)
  expect(holdEnd(v, 2)).toBe(4)
  expect(holdEnd(v, 82)).toBe(112)
})

test('rollsRare is true just below 1/50 and false at 1/50', () => {
  expect(rollsRare(0.0199)).toBe(true)
  expect(rollsRare(1 / 50)).toBe(false)
})

test('variants rotate in order per reel', () => {
  const hokuto = LAUNCH.find(r => r.name === 'hokuto')!
  const turns = new Map<string, number>()
  expect([0, 1, 2].map(() => nextVariant(hokuto, turns))).toEqual(['flurry', 'seven-stars', 'flurry'])
})
