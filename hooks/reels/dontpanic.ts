import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Don't panic (The Hitchhiker's Guide to the Galaxy). Three variants, each
// opening from black and closing to black, so any variant can follow any other.
//
// cover, 48 frames. The Guide's dark red cover lights up and DON'T PANIC drops
// in, one big friendly letter a frame, each with a red shadow. DON'T PANIC
// lands as the last letter does. A glint runs across the letters and back,
// then they leap off the cover and it goes dark. The 16-column form spells
// DON'T, flips letter by letter to PANIC like a split-flap board (the N stays),
// and the same glint and exit follow.
//
// deep-thought, 72 frames. Deep Thought's console boots, each row's digits
// written by a front. COMPUTING THE ANSWER: computing fronts race along both
// rows, and a digit changes only when a front passes it, flaring yellow and
// cooling through red to dim aqua. Lock fronts close in from both ends,
// settling each digit they pass, and drive into the center, where the answer
// assembles on a red plate. THE ANSWER IS 42 lands as the 42 is whole. Ripples
// run out from the plate and rewrite the console 424242, then it shuts down
// from the ends inward, the 42 last.
//
// improbability, 72 frames. The Heart of Gold cruises in over the dark red
// surface of Magrathea with two missiles closing in. IMPROBABILITY DRIVE: a
// 2-frame wipe of color crosses the strip, and the missiles are now a sperm
// whale and a bowl of petunias, falling through the streaming air. MOSTLY
// HARMLESS lands as the whale does, with a thud that cracks the ground red.
// The petunias land after, bounce once, and the Heart of Gold zips overhead
// before it all goes dark.
//
// The seed picks the cover's letter and glint colors, its drop and exit
// orders and which way the letters leave; the console's digits, which row
// computes which way and the fronts' timing; and the stars, the missiles'
// lanes, the wipe's colors, the whale's facing, the petunias' spot, the air
// streaks and the flyby's direction.

// A 3 x 4 pixel font. The apostrophe and the I are glyph strokes in a cell of
// their own, so each word is 15 pixels and the whole phrase fits 32 columns.
const FONT: Record<string, readonly string[]> = {
  D: ['XX.', 'X.X', 'X.X', 'XX.'],
  O: ['XXX', 'X.X', 'X.X', 'XXX'],
  N: ['X.X', 'XXX', 'XXX', 'X.X'],
  T: ['XXX', '.X.', '.X.', '.X.'],
  P: ['XX.', 'X.X', 'XX.', 'X..'],
  A: ['.X.', 'X.X', 'XXX', 'X.X'],
  C: ['.XX', 'X..', 'X..', '.XX'],
  4: ['X.X', 'X.X', 'XXX', '..X'],
  2: ['XX.', '..X', '.X.', 'XXX'],
}
const STROKES: Record<string, readonly (string | null)[]> = { "'": ['╹', null], I: ['┃', '┃'] }

type Letter = readonly [string, number]
const PHRASE: readonly Letter[] = [['D', 0], ['O', 4], ['N', 8], ["'", 11], ['T', 12], ['P', 17], ['A', 21], ['N', 25], ['I', 28], ['C', 29]]
const DONT: readonly Letter[] = PHRASE.slice(0, 5)
const PANIC: readonly Letter[] = PHRASE.slice(5).map(([ch, x]) => [ch, x - 17] as const)

// Draws one letter at x, dy pixels down (negative: above), in rows the mask
// allows. Shadows are drawn by a first pass so no letter's shadow covers
// another letter.
function letter(c: Canvas, [ch, x]: Letter, dy: number, ink: Ink, rows: readonly [boolean, boolean], shadow: Ink | null) {
  const stroke = STROKES[ch]
  if (stroke) {
    if (shadow) return
    // A stroke shows only while its letter is at or a pixel above its place.
    stroke.forEach((g, row) => { if (g && rows[row] && dy >= -1 && dy <= 0) c.glyph(x, row, g, ink) })
    return
  }
  FONT[ch]!.forEach((line, ly) => [...line].forEach((v, lx) => {
    const y = ly + dy
    if (v !== 'X' || y < 0 || y > 3 || !rows[y >> 1]) return
    if (shadow) c.pix(x + lx + 1, y, shadow)
    else c.pix(x + lx, y, ink)
  }))
}

const COVER = 48
const COVER_BEAT = 14 // DON'T PANIC: the last letter lands
const DROP = 2 // the first letter starts to drop
const GLINT = 17 // the glint runs out; it runs back from GLINT + 10
const FLIP = 20 // the 16-column form flips DON'T to PANIC, a slot a frame
const LEAP = 38 // the letters leap off

function cover(c: Canvas, f: number, seed: number) {
  const narrow = c.cols === 16
  // The cover lights over 3 frames from a red ember, every step under a flash
  // in truecolor and at 256 colors.
  const cover: Ink | null = f === COVER - 1 ? null
    : f === 0 ? c.mix('hot', 'base', 0.75)
    : f === 1 ? c.mix('deep', 'base', 0.25)
    : f >= COVER - 3 ? c.mix('deep', 'base', 0.5) : 'deep'
  if (!cover) return
  for (let col = 0; col < c.cols; col++) { c.bg(col, 0, cover); c.bg(col, 1, cover) }
  const cool = noise(seed, 1) < 0.5
  const ink: Ink = cool ? 'cool' : 'spark'
  const glint: Ink = cool ? 'spark' : 'cool'
  const letters = narrow ? DONT : PHRASE
  const n = letters.length
  // Drop and leap orders: left to right, right to left, or from the middle out.
  const order = (k: number, salt: number) => {
    const way = Math.floor(noise(seed, salt) * 3)
    const rank = [...Array(n).keys()].sort((a, b) =>
      way === 0 ? a - b : way === 1 ? b - a : Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b)
    return rank.indexOf(k)
  }
  const up = noise(seed, 4) < 0.5 ? -1 : 1
  const draw = (shadow: boolean) => letters.forEach((_, i) => {
    const drop = DROP + order(i, 2)
    if (f < drop) return
    let dy = Math.min(0, f - drop - 3)
    if (f >= LEAP) {
      const leap = f - LEAP - (narrow ? order(i, 3) : order(i, 3) >> 1)
      if (leap >= 0) {
        if (leap > 0) return
        dy = 2 * up
      }
    }
    // The glint: out along the letters, then back (in the 16-column form,
    // out along DON'T and back along PANIC).
    const out = f - (narrow ? GLINT - 6 : GLINT) - i, back = f - (narrow ? GLINT + 12 : GLINT + 10) - (n - 1 - i)
    const lit = out === 0 || out === 1 || back === 0 || back === 1
    const word = (l: Letter, rows: readonly [boolean, boolean]) => letter(c, l, dy, lit ? glint : ink, rows, shadow ? 'hot' : null)
    // The split flap: the top half turns a frame before the bottom.
    const flip = FLIP + i
    if (!narrow) word(PHRASE[i]!, [true, true])
    else if (f < flip) word(DONT[i]!, [true, true])
    else if (f > flip) word(PANIC[i]!, [true, true])
    else { word(PANIC[i]!, [true, false]); word(DONT[i]!, [false, true]) }
  })
  draw(true)
  draw(false)
}

const LOOP = 72

// The 16-column form of a scene drawn on 32 columns: its center, columns 8 to 23.
const center = (c: Canvas): Canvas => c.cols === 32 ? c : {
  cols: c.cols, rows: c.rows, mix: c.mix,
  bg: (col, row, ink) => c.bg(col - 8, row, ink),
  pix: (x, y, ink) => c.pix(x - 8, y, ink),
  put: (x, y, ink, priority) => c.put(x - 16, y, ink, priority),
  glyph: (col, row, char, ink) => c.glyph(col - 8, row, char, ink),
}

const HEX = '0123456789ABCDEF'
const COMPUTE = 8 // COMPUTING THE ANSWER: the computing fronts are off
const LOCK = 30 // lock fronts start in from both ends, a column a frame
const ANSWER = LOCK + 15 // THE ANSWER IS 42: the lock fronts meet in the center
const RIPPLE = ANSWER + 2 // ripples run out from the plate every 6 frames
const DOWN = 64 // the console shuts down from the ends inward

type Pass = { at: number; kind: 'boot' | 'compute' | 'lock' | 'ripple' }

function deepThought(c: Canvas, f: number, seed: number) {
  const flip = noise(seed, 30) < 0.5
  const plate = new Set<number>()
  for (let row = 0; row < 2; row++) {
    const dir = (row === 0) !== flip ? 1 : -1
    const phase = Math.floor(noise(seed, 31, row) * 6)
    for (let col = 0; col < 32; col++) {
      const along = dir > 0 ? col : 31 - col
      const k = Math.min(col, 31 - col)
      const lock = LOCK + k, down = DOWN + (k >> 1)
      if (f >= down) continue
      // Every front that has passed this cell, in order.
      const passes: Pass[] = [{ at: row + (along >> 2), kind: 'boot' }]
      for (let t = COMPUTE - 4 + phase; t <= 24; t += 6) {
        const at = t + (along >> 1)
        if (at <= lock - 4) passes.push({ at, kind: 'compute' })
      }
      passes.push({ at: lock, kind: 'lock' })
      if (k < 12) for (let t = RIPPLE; t < DOWN; t += 6) {
        const at = t + 11 - k
        if (at <= down - 4) passes.push({ at, kind: 'ripple' })
      }
      const past = passes.filter(p => p.at <= f)
      if (!past.length) continue
      const last = past[past.length - 1]!, age = f - last.at
      if (last.kind === 'lock' && k >= 12) {
        c.bg(col, row, 'hot')
        plate.add(col)
        continue
      }
      const rolled = past.filter(p => p.kind === 'boot' || p.kind === 'compute').length
      const rippled = past.some(p => p.kind === 'ripple')
      const digit = rippled ? (col % 2 ? '2' : '4') : HEX[Math.floor(noise(seed, row, col, rolled) * 16)]!
      let bg: Ink = 'deep', fg: Ink
      if (age === 0) {
        bg = last.kind === 'lock' ? 'spark' : last.kind === 'ripple' ? (noise(seed, 32) < 0.5 ? 'cool' : 'spark') : 'cool'
        fg = 'base'
      } else if (last.kind === 'lock') fg = c.mix('cool', 'base', 0.5)
      else if (last.kind === 'ripple') fg = age === 1 ? 'cool' : c.mix('spark', 'base', 0.25)
      else fg = age === 1 ? 'spark' : age === 2 ? 'hot' : c.mix('cool', 'base', 0.25)
      c.bg(col, row, bg)
      c.glyph(col, row, digit, fg)
    }
  }
  // The answer, on the plate cells locked so far, with a dark red shadow.
  const answer = (x: number, ch: string, ink: Ink, dx: number) => FONT[ch]!.forEach((line, y) => [...line].forEach((v, lx) => {
    if (v === 'X' && plate.has(x + lx + dx)) c.pix(x + lx + dx, y, ink)
  }))
  answer(12, '4', 'deep', 1); answer(16, '2', 'deep', 1)
  answer(12, '4', 'spark', 0); answer(16, '2', 'spark', 0)
}

const DRIVE = 14 // IMPROBABILITY DRIVE: the first of the wipe's two frames
const FALL = 16 // the whale and the petunias fall into view
const THUD = 32 // MOSTLY HARMLESS: the whale lands
const FLYBY = 44 // the Heart of Gold zips overhead
const FADE = 64 // it all goes dark

const WHALE = ['..XXXXXXXXX...X.', 'XXXXXXXXXXXXXXX.', '.XXXXXXXXXXXX.XX', '..XX.....XX.....']
const PETUNIAS = ['X.XX', 'XXXX', '.XX.']
const SHIP = ['..XXX.', 'XXXXXX']

function improbability(c: Canvas, f: number, seed: number) {
  const pixCells = new Set<number>(), dotCells = new Set<number>()
  const px = (x: number, y: number, ink: Ink) => {
    const X = Math.round(x), Y = Math.round(y)
    if (X < 0 || X > 31 || Y < 0 || Y > 3 || dotCells.has(X * 2 + (Y >> 1))) return
    pixCells.add(X * 2 + (Y >> 1)); c.pix(X, Y, ink)
  }
  const dot = (x: number, y: number, ink: Ink, p = 1) => {
    const X = Math.round(x), Y = Math.round(y)
    if (X < 0 || X > 63 || Y < 0 || Y > 7 || pixCells.has((X >> 1) * 2 + (Y >> 2))) return
    dotCells.add((X >> 1) * 2 + (Y >> 2)); c.put(X, Y, ink, p)
  }
  // The fade: everything dims over 4 frames, then the ground alone, then black.
  const fade = f >= FADE ? ((f - FADE) >> 1) + 1 : 0
  const dim = (ink: Ink): Ink => fade === 0 || typeof ink !== 'string' ? ink : c.mix(ink, 'base', fade === 1 ? 0.5 : 0.75)
  if (fade >= 3) {
    if (fade === 3) for (let col = 0; col < 32; col++) c.bg(col, 1, c.mix('deep', 'base', 0.75))
    return
  }

  // Magrathea's surface lights from the left, 6 columns a frame, ahead of the
  // ship: no frame lights enough of it at once to flash.
  for (let col = 0; col < 32 && col < 6 * (f + 1); col++) c.bg(col, 1, dim('deep'))

  // The wipe: the left half both rows, then the right half's top row.
  const shift = Math.floor(noise(seed, 50) * 3)
  const BAND: Ink[] = ['hot', 'spark', 'cool']
  const band = (col: number, row: number) => c.bg(col, row, row === 0 && (col + shift) % 4 === 3 ? 'deep' : BAND[(col + row + shift) % 3]!)
  const wiped = (col: number, row: number) => (f === DRIVE && col < 16) || (f === DRIVE + 1 && col >= 16 && row === 0)
  for (let col = 0; col < 32; col++) for (let row = 0; row < 2; row++) if (wiped(col, row)) band(col, row)
  const clear = (x: number, y: number) => !wiped(Math.round(x) >> 1, Math.round(y) >> 2)

  const stars = (from: number) => {
    for (let i = 0; i < 7; i++) {
      if (f < from + i) continue
      const x = Math.floor(noise(seed, 40, i) * 64), y = Math.floor(noise(seed, 41, i) * 4)
      if (clear(x, y)) dot(x, y, dim(noise(seed, 42, i) < 0.7 ? 'spark' : 'cool'))
    }
  }

  if (f <= DRIVE) {
    // The Heart of Gold cruises in from the left; two missiles skim the surface after it.
    const sx = f - 6
    SHIP.forEach((line, y) => [...line].forEach((v, x) => { if (v === 'X' && clear(2 * (sx + x), 2 * y)) px(sx + x, y, x === 5 ? 'spark' : 'cool') }))
    const lane = noise(seed, 43) < 0.5 ? 0 : 1
    const missiles = [0, 1].map(i => [30 + 8 * i - 1.2 * f, 2 + ((lane + i) % 2)] as const)
    for (const [mx, my] of missiles) if (clear(2 * mx, 2 * my)) { px(mx, my, 'hot'); px(mx + 1, my, 'spark') }
    for (const [mx, my] of missiles) for (let k = 4; k < 9; k += 2) if (clear(2 * mx + k, 2 * my + 1)) dot(2 * mx + k, 2 * my + 1, c.mix('cool', 'base', 0.5))
    stars(0)
    return
  }

  // The whale and the petunias fall; the whale lands on THUD.
  const face = noise(seed, 44) < 0.5
  const wy = Math.min(4, -4 + (f - FALL) * 0.5)
  const whaleInk: Ink = dim('cool')
  // On the thud the whale flattens for 2 frames: its top row is gone.
  const squash = f >= THUD && f < THUD + 2
  WHALE.forEach((line, y) => [...line].forEach((v, x) => {
    if (v === 'X' && !(squash && y === 0)) dot(16 + (face ? 15 - x : x), wy + y, whaleInk, 3)
  }))
  const pxAt = [36, 40, 44][Math.floor(noise(seed, 45) * 3)]!
  const landed = FALL + Math.ceil(8 / 0.35)
  const py = f < landed ? Math.min(5, -3 + (f - FALL) * 0.35) : f === landed + 1 ? 4 : 5
  PETUNIAS.forEach((line, y) => [...line].forEach((v, x) => {
    if (v !== 'X') return
    const ink: Ink = y > 0 ? 'spark' : x === 2 ? 'spark' : 'hot'
    dot(pxAt + x, py + y, dim(ink), 2)
  }))

  if (f < THUD) {
    // Air streams up past them.
    for (let i = 0; i < 6; i++) {
      const cell = [0, 2, 4, 6, 16, 17, 24, 26, 28, 30][Math.floor(noise(seed, 46, i) * 10)]!
      const x = cell * 2 + (i & 1)
      if (x >> 1 === pxAt >> 1 || x >> 1 === (pxAt >> 1) + 1) continue
      const head = 9 - ((f * 2 + Math.floor(noise(seed, 47, i) * 12)) % 12)
      for (const y of [head, head + 1]) if (clear(x, y)) dot(x, y, c.mix('cool', 'base', 0.5))
    }
  } else {
    // The thud: the ground glows red under the whale and cracks outward.
    const s = f - THUD
    for (let col = 8; col < 16; col++) {
      const d = col < 12 ? 11 - col : col - 12
      if (s >= d >> 1) c.bg(col, 1, dim(s < 8 ? 'hot' : c.mix('hot', 'deep', 0.5)))
    }
    for (let d = 1; d <= 8; d++) {
      const t = s - 2 - d
      if (t < 0 || t > 2) continue
      for (const col of [8 - d, 15 + d]) c.bg(col, 1, t === 0 ? 'spark' : 'hot')
    }
    if (s >= 1 && s < 5) for (const x of [14, 13, 33, 34]) dot(x, 3 - s + (x & 1), c.mix('spark', 'base', s < 3 ? 0.25 : 0.5))
    if (f >= FLYBY && f < FLYBY + 16) {
      const way = noise(seed, 48) < 0.5
      const sx = way ? -6 + 2.5 * (f - FLYBY) : 32 - 2.5 * (f - FLYBY)
      SHIP.forEach((line, y) => [...line].forEach((v, x) => {
        const X = way ? sx + x : sx + 5 - x
        if (v === 'X') px(X, y, x === 5 ? 'spark' : 'cool')
      }))
    }
    if (f >= THUD + 8) stars(THUD + 8)
  }
}

export default {
  name: 'dontpanic',
  title: "Don't panic",
  source: "Hitchhiker's Guide",
  contexts: ['thinking:deep-thought'],
  rare: false,
  compact: true,
  variants: {
    cover: { loop: COVER, beats: [{ at: COVER_BEAT, phrase: "DON'T PANIC" }] },
    'deep-thought': {
      loop: LOOP,
      beats: [
        { at: COMPUTE, phrase: 'COMPUTING THE ANSWER' },
        { at: ANSWER, phrase: 'THE ANSWER IS 42' },
      ],
    },
    improbability: {
      loop: LOOP,
      beats: [
        { at: DRIVE, phrase: 'IMPROBABILITY DRIVE' },
        { at: THUD, phrase: 'MOSTLY HARMLESS' },
      ],
    },
  },
  draw(c, frame, seed, variant) {
    if (variant === 'cover') cover(c, frame, seed)
    else (variant === 'deep-thought' ? deepThought : improbability)(center(c), frame, seed)
  },
} satisfies Reel
