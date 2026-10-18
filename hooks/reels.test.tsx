import { expect, test } from 'claude-code/testing'

import { checkLibrary, checkReel } from './reel-rules'
import { ANIMATIONS } from './spinner'
import { ALL_REELS, INDEXED_KEYS, LEGACY_REELS, NEW_REELS, unindexedLines } from './library'

for (const reel of ALL_REELS) {
  test(`the ${reel.name} reel meets the reel rules`, { timeoutMs: 30_000 }, () => {
    expect(checkReel(reel).map(f => `${f.rule}: ${f.detail}`)).toEqual([])
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
