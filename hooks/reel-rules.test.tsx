import { expect, test } from 'claude-code/testing'

import { noise } from './canvas'
import type { Canvas, Reel, Variant } from './canvas'
import { checkLibrary, checkReel, phasesOf } from './reel-rules'

type Draw = (c: Canvas, frame: number, seed: number, variant: string) => void

// Hot plates on row 0 and cool plates on row 1 over columns 0 to 15 (32 of 64
// cells), with seeded cool braille on the cool plates. `plate` adds a spark glyph.
const ground: Draw = (c, _frame, seed) => {
  for (let col = 0; col < 16; col++) {
    c.bg(col, 0, 'hot'); c.bg(col, 1, 'cool')
    if (noise(seed, col) < 0.5) c.put(col * 2, 4, 'cool')
  }
}
const plate: Draw = (c, frame, seed, variant) => { ground(c, frame, seed, variant); c.glyph(20, 0, '*', 'spark') }

const STORY: Variant = { loop: 72, beats: [{ at: 4, phrase: 'GO' }, { at: 40, phrase: 'NOW' }] }

function reel(over: Partial<Reel> = {}, extra?: Draw): Reel {
  return {
    name: 'clean', title: 'Clean', source: 'test', contexts: [], rare: false,
    variants: { only: STORY },
    draw(c, frame, seed, variant) { plate(c, frame, seed, variant); extra?.(c, frame, seed, variant) },
    ...over,
  }
}

const rules = (r: Reel) => [...new Set(checkReel(r).map(f => f.rule))]
const beats = (...at: number[]) => at.map((n, i) => ({ at: n, phrase: `B${i}` }))
const loop = (variant: Variant) => reel({ variants: { only: variant } })

test('a clean fixture passes every rule', () => {
  expect(checkReel(reel())).toEqual([])
})

test('a full-width glyph is a glyphs finding', () => {
  expect(rules(reel({}, c => c.glyph(21, 0, 'ア', 'spark')))).toEqual(['glyphs'])
})

test('deep glyph ink is a glyphs finding', () => {
  expect(rules(reel({}, c => c.glyph(21, 0, '+', 'deep')))).toEqual(['glyphs'])
  expect(rules(reel({}, c => c.glyph(21, 0, '+', c.mix('hot', 'deep', 0.5))))).toEqual(['glyphs'])
})

test('a glyph of more than one code point is a glyphs finding', () => {
  expect(rules(reel({}, c => c.glyph(21, 0, 'AB', 'spark')))).toEqual(['glyphs'])
})

test('a mix of spark and cool is a slots finding', () => {
  expect(rules(reel({}, c => c.bg(24, 0, c.mix('spark', 'cool', 0.5))))).toEqual(['slots'])
})

test('a mix at t 0.3 is a slots finding', () => {
  expect(rules(reel({}, c => c.bg(24, 0, c.mix('hot', 'base', 0.3))))).toEqual(['slots'])
})

test('three slots in one phase is a color finding', () => {
  // The spark glyph shows only in the first phase, [4, 40).
  const draw: Draw = (c, frame, seed, variant) => {
    ground(c, frame, seed, variant)
    if (frame >= 4 && frame < 40) c.glyph(20, 0, '*', 'spark')
  }
  expect(rules(reel({ draw }))).toEqual(['color'])
})

// Phases [4, 44) and [44, 84) of 40 frames, 2,560 cell-frames each. Row 0 has
// hot plates on its first n cells; the last phase keeps all 32 (50%).
function coverage(first: (frame: number) => number): Reel {
  const draw: Draw = (c, frame, seed) => {
    const n = frame >= 4 && frame < 44 ? first(frame) : 32
    for (let col = 0; col < n; col++) c.bg(col, 0, 'hot')
    for (let col = 0; col < 31; col++) if (noise(seed, col) < 0.5) c.put(col * 2, 4, 'cool')
    c.glyph(31, 1, '*', 'spark')
  }
  return reel({ draw, variants: { only: { loop: 80, beats: beats(4, 44) } } })
}

test('29% average coverage in one phase is a coverage finding', () => {
  // 22 frames of 19 cells and 18 of 18: 742 of 2,560, 28.98%.
  expect(rules(coverage(frame => frame < 26 ? 19 : 18))).toEqual(['coverage'])
})

test('30% average coverage passes', () => {
  // 8 frames of 20 cells and 32 of 19: 768 of 2,560, exactly 30%.
  expect(checkReel(coverage(frame => frame < 12 ? 20 : 19))).toEqual([])
})

test('a first beat at 16 is a beats finding', () => {
  expect(rules(loop({ loop: 72, beats: beats(16, 40) }))).toEqual(['beats'])
})

test('beats 11 apart are a beats finding', () => {
  expect(rules(loop({ loop: 72, beats: beats(4, 15) }))).toEqual(['beats'])
})

test('a last beat 11 frames before the loop end is a beats finding', () => {
  expect(rules(loop({ loop: 72, beats: beats(4, 61) }))).toEqual(['beats'])
})

test('two beats on a 71-frame loop are a beats finding', () => {
  expect(rules(loop({ loop: 71, beats: beats(4, 40) }))).toEqual(['beats'])
})

test('a variant with no beats is a beats finding', () => {
  expect(rules(loop({ loop: 72, beats: [] }))).toEqual(['beats'])
})

test('a fractional loop or a fractional, negative or repeated beat is a beats finding', () => {
  expect(rules(loop({ loop: 72.5, beats: beats(4, 40) }))).toEqual(['beats'])
  expect(rules(loop({ loop: 72, beats: beats(4, 40.5) }))).toEqual(['beats'])
  expect(rules(loop({ loop: 72, beats: beats(-1, 40) }))).toEqual(['beats'])
  expect(rules(loop({ loop: 72, beats: [{ at: 4, phrase: 'A' }, { at: 4, phrase: 'B' }] }))).toEqual(['beats'])
})

test('a cell switching yellow and black every frame is a flash finding', () => {
  expect(rules(reel({}, (c, frame) => { if (frame % 2) c.bg(22, 0, 'spark') }))).toEqual(['flash'])
})

test('two cells switching every 2 frames pass', () => {
  const extra: Draw = (c, frame) => { if (frame % 4 < 2) { c.bg(22, 0, 'spark'); c.bg(23, 0, 'spark') } }
  expect(checkReel(reel({}, extra))).toEqual([])
})

test('17 cells rising together twice in a loop is a flash finding', () => {
  const extra: Draw = (c, frame) => {
    if ((frame >= 10 && frame < 20) || (frame >= 50 && frame < 60)) {
      for (let col = 16; col < 32; col++) c.bg(col, 1, 'spark')
      c.bg(31, 0, 'spark')
    }
  }
  expect(rules(reel({}, extra))).toEqual(['flash'])
})

// One cell at (22, 0): `ends` is black, yellow, black, yellow over the loop's
// last 4 frames, `opens` is yellow, black, yellow over its first 3, and `still`
// stays black. Alone, each holds at most 4 counted changes in any 8 frames.
const ends: Draw = (c, frame) => { if (frame === 69 || frame === 71) c.bg(22, 0, 'spark') }
const opens: Draw = (c, frame) => { if (frame === 0 || frame === 2) c.bg(22, 0, 'spark') }

function cast(order: Record<string, Draw>): Reel {
  const variants = Object.fromEntries(Object.keys(order).map(name => [name, STORY]))
  return reel({ variants, draw(c, frame, seed, variant) { plate(c, frame, seed, variant); order[variant]!(c, frame, seed, variant) } })
}

test('each half of a flashing variant change passes alone', () => {
  expect(checkReel(cast({ ends }))).toEqual([])
  expect(checkReel(cast({ opens }))).toEqual([])
})

test('two variants that pass alone but flash across their change are a flash finding', () => {
  expect(rules(cast({ ends, opens }))).toEqual(['flash'])
})

test('a three-variant reel whose skipped pair flashes is a flash finding', () => {
  // ends -> still -> opens -> ends passes; ends -> opens flashes.
  const still: Draw = () => {}
  expect(rules(cast({ ends, still, opens }))).toEqual(['flash'])
})

test('a variant change that flashes on one seed pair only is a flash finding', () => {
  // Only `ends` on seed 2 into `opens` on seed 1 flashes; seed 3 into seed 1 does not.
  const late: Draw = (c, frame, seed, variant) => { if (seed === 2) ends(c, frame, seed, variant) }
  const early: Draw = (c, frame, seed, variant) => { if (seed === 1) opens(c, frame, seed, variant) }
  expect(checkReel(cast({ late }))).toEqual([])
  expect(checkReel(cast({ early }))).toEqual([])
  const found = checkReel(cast({ late, early }))
  expect([...new Set(found.map(f => f.rule))]).toEqual(['flash'])
  expect(found.every(f => f.detail.includes('variant early, seed 1') && f.detail.includes('after variant late seed 2'))).toBe(true)
})

test('a flash inside one variant is not reported again for its variant changes', () => {
  // Mid-loop blinking: no 8-frame window that crosses a variant change holds it.
  const blink: Draw = (c, frame) => { if (frame >= 30 && frame < 40 && frame % 2) c.bg(22, 0, 'spark') }
  const alone = checkReel(cast({ blink }))
  expect(alone.length).toBeGreaterThan(0)
  expect(checkReel(cast({ blink, still: () => {} }))).toEqual(alone)
})

test('a 29-character catchphrase is a phrases finding', () => {
  const variant = { loop: 72, beats: [{ at: 4, phrase: 'A'.repeat(29) }, { at: 40, phrase: 'NOW' }] }
  expect(rules(loop(variant))).toEqual(['phrases'])
})

test('a seed-blind reel is a seed finding', () => {
  const draw: Draw = (c, frame, _seed, variant) => plate(c, frame, 1, variant)
  expect(rules(reel({ draw }))).toEqual(['seed'])
})

test('checkReel finds a reserved name', () => {
  expect(rules(reel({ name: 'next' }))).toEqual(['names'])
  expect(rules(reel({ name: 'Neon-2' }))).toEqual(['names'])
})

test('a legacy reel is checked for names and the per-cell flash only', () => {
  const strip: Draw = (c, frame) => c.glyph(frame % 6, 0, 'ア', 'deep')
  const legacy = { name: 'spin', title: 'Spin', source: 'legacy', contexts: [], rare: false, legacy: true,
    compact: true, variants: { only: { loop: 64, beats: [] } }, draw: strip } satisfies Reel
  expect(checkReel(legacy)).toEqual([])
  const blink: Draw = (c, frame) => { if (frame % 2) c.bg(0, 0, 'spark') }
  expect([...new Set(checkReel({ ...legacy, name: 'off', draw: blink }).map(f => f.rule))]).toEqual(['names', 'flash'])
})

test('checkLibrary finds a duplicate name and a duplicate catchphrase', () => {
  const one = loop({ loop: 72, beats: [{ at: 4, phrase: 'GO' }, { at: 40, phrase: 'NOW' }] })
  const twin = loop({ loop: 72, beats: [{ at: 4, phrase: 'UP' }, { at: 40, phrase: 'DOWN' }] })
  const echo = { ...loop({ loop: 72, beats: [{ at: 4, phrase: 'GO' }, { at: 40, phrase: 'LEFT' }] }), name: 'echo' }
  const found = checkLibrary([one, twin, echo])
  expect(found.map(f => f.rule).sort()).toEqual(['names', 'phrases'])
  expect(found.find(f => f.rule === 'names')?.detail).toContain("'clean'")
  expect(found.find(f => f.rule === 'phrases')?.detail).toContain("'GO'")
})

test('phasesOf splits a loop at its beats and wraps', () => {
  expect(phasesOf({ loop: 72, beats: [{ at: 4, phrase: 'A' }, { at: 40, phrase: 'B' }] }))
    .toEqual([{ start: 4, end: 40 }, { start: 40, end: 76 }])
  expect(phasesOf({ loop: 64, beats: [] })).toEqual([{ start: 0, end: 64 }])
  expect(phasesOf({ loop: 72, beats: [{ at: 8, phrase: 'A' }] })).toEqual([{ start: 8, end: 80 }])
})
