import { expect, test } from 'claude-code/testing'

import { CONTEXTS } from './picker'
import { checkLibrary, checkReel } from './reel-rules'
import { ANIMATIONS } from './spinner'
import { ALL_REELS, INDEXED_KEYS, LEGACY_REELS, NEW_REELS, unindexedLines } from './library'

for (const reel of ALL_REELS) {
  test(`the ${reel.name} reel meets the reel rules`, { timeoutMs: 30_000 }, () => {
    expect(checkReel(reel).map(f => `${f.rule}: ${f.detail}`)).toEqual([])
  })
}

// Runtime seeds are random 31-bit values, so check shifted seeds: five that once failed a reel, then k * 0x9E3779B1 % 2 ** 31 for k = 1..7.
const SEED_OFFSETS = [3, 114, 447, 459, 561, 506952113, 1013904226, 1520856339, 2027808452, 387276917, 894229030, 1401181143]

for (const reel of NEW_REELS) {
  test(`the ${reel.name} reel meets the reel rules on many seeds`, { timeoutMs: 60_000 }, () => {
    const findings = SEED_OFFSETS.flatMap(offset =>
      checkReel({ ...reel, draw: (c, f, s, v) => reel.draw(c, f, s + offset, v) })
        .filter(x => x.rule !== 'seed')
        .map(x => `${offset}: ${x.rule}: ${x.detail}`),
    )
    expect(findings).toEqual([])
  })
}

test('names and catchphrases are unique across the library', () => {
  expect(checkLibrary(ALL_REELS).map(f => `${f.reel}: ${f.rule}: ${f.detail}`)).toEqual([])
})

test('each index line exports a reel under its own name', () => {
  expect(NEW_REELS.map(r => r.name)).toEqual([...INDEXED_KEYS])
})

test('the 22 animations are legacy reels by their old names', () => {
  expect(LEGACY_REELS.map(r => r.name)).toEqual(Object.keys(ANIMATIONS))
  expect(LEGACY_REELS.every(r => r.legacy === true && r.compact === true)).toBe(true)
})

test('a reel file missing from the index gets the exact line to add', () => {
  expect(unindexedLines(['index.ts', 'legacy.ts', '_template.ts', 'notes.md', 'breach.ts', 'newone.ts'], ['breach']))
    .toEqual(["export { default as newone } from './newone'"])
})

// The s5.5 table, by reel: a context, or context:variant where a variant is named.
const SPEC_CONTEXTS: Record<string, string[]> = {
  apes: ['agents'],
  breach: ['shell', 'thinking'],
  digitalrain: ['shell'],
  dontpanic: ['thinking:deep-thought'],
  ghost: ['edit', 'web:net-dive'],
  hokuto: ['requesting:flurry', 'thinking:seven-stars'],
  jupiter2: ['web'],
  kodama: ['long-wait'],
  lightcycles: ['edit', 'shell'],
  sandevistan: ['agents', 'requesting'],
  sauron: [],
  vortex: ['long-wait'],
}

test('each launch reel\'s contexts match the spec table', () => {
  expect(Object.fromEntries(NEW_REELS.map(r => [r.name, [...r.contexts].sort()]))).toEqual(SPEC_CONTEXTS)
  expect(NEW_REELS.filter(r => r.rare).map(r => r.name)).toEqual(['sauron'])
})

test('every context in a reel\'s contexts is a known context with a known variant, and never `other`', () => {
  for (const reel of NEW_REELS) {
    for (const context of reel.contexts) {
      const [name = '', variant, ...rest] = context.split(':')
      expect(CONTEXTS, `${reel.name}: ${context}`).toContain(name)
      expect(name, `${reel.name}: ${context}`).not.toBe('other')
      expect(rest, `${reel.name}: ${context}`).toEqual([])
      if (variant !== undefined) expect(Object.keys(reel.variants), `${reel.name}: ${context}`).toContain(variant)
    }
  }
})
