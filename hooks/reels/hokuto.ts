import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Hokuto Shinken (Fist of the North Star). Kenshiro, in aqua with his aura
// behind him, faces a hulking thug drawn in dark red half-block pixels.
//
// flurry: the thug stands. ATATATATATA: fists fly at him one after another,
// each a yellow fist with red and dark red ghosts behind it, and each pair
// of hits lights a yellow pressure point on his body. Ken draws back and
// HOWATAAA!: one big fist lands and a shockwave rolls out. Then the hundred
// fists: a blur of fists flickering between them while the last points
// light, and the thug swells. HOKUTO HYAKURETSU KEN: he bursts, a yellow
// core and a red and dark red spray under a red wash, and a new thug walks
// in for the next loop.
//
// seven-stars: under a blood red sky the seven stars of the Big Dipper glow
// in and blaze on HOKUTO SHICHISEI; the constellation draws itself, handle
// to bowl, and closes the bowl. Alcor, the death omen star, kindles red
// beside Mizar. Ken strikes seven points. HE IS ALREADY DEAD: the held
// moment, the thug throbbing at 1.3 Hz. NANI?!: he jolts, then swells,
// cracking yellow, faster, until HIDEBU!: the burst. The sky clears and a
// new thug walks in.
//
// The seed picks the row the punches open on, the order of the pressure
// points, the thug's red or dark red head, the blur's rhythm and the spray.
// It draws on the canvas it gets (compact): on 16 columns Ken stands at the
// left edge, and in seven-stars the Dipper takes his place.

const FLURRY = 108
const SEVEN = 144
const RUSH = 40 // flurry: HOWATAAA lands
const BLUR = [41, 72] as const // flurry: the hundred fists
const POP = 76 // flurry: the burst
const WALK = 8 // frames a new thug takes to walk in
const BLAZE = 8 // seven-stars: the stars blaze
const HELD = 44 // seven-stars: HE IS ALREADY DEAD
const NANI = 80 // seven-stars: the jolt
const HIDEBU = 116 // seven-stars: the burst

const KEN = [
  '..XX..',
  '..XX..',
  '.XXXX.',
  'X.XX.X',
  '..XX..',
  '.X..X.',
  '.X..X.',
  'X....X',
]
const KEN_PUNCH = [
  '..XX....',
  '..XX....',
  '.XXXXXXX',
  'X.XX....',
  '..XX....',
  '.X..X...',
  '.X..X...',
  'X....X..',
]
const KEN_DRAW = [
  '..XX..',
  '..XX..',
  'XXXX..',
  'X.XX..',
  '.XXX..',
  '.X..X.',
  'X...X.',
  'X....X',
]
const BIG_FIST = [
  '.XXXX..',
  'XXXXXX.',
  'XXXXXXX',
  'XXXXXXX',
  'XXXXXXX',
  'XXXXXX.',
  '.XXXX..',
  '..XX...',
]

// The Big Dipper in dots, 20 x 8: handle to bowl, then Alcor beside Mizar.
const STARS = [[0, 7], [4, 4], [8, 3], [12, 3], [13, 7], [19, 6], [19, 1]] as const
const ALCOR = [5, 2] as const
// Each segment joins two stars: the handle, the bowl, and Dubhe back to Megrez.
const SEGMENTS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] as const

const sprite = (c: Canvas, rows: readonly string[], x0: number, y0: number, ink: Ink, priority = 3) =>
  rows.forEach((line, y) => { for (let i = 0; i < line.length; i++) if (line[i] === 'X') c.put(x0 + i, y0 + y, ink, priority) })

// The dots of a line from a to b, ends excluded.
function line(a: readonly [number, number], b: readonly [number, number]): [number, number][] {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
  const out: [number, number][] = []
  for (let s = 1; s < n; s++) out.push([Math.round(a[0] + (b[0] - a[0]) * s / n), Math.round(a[1] + (b[1] - a[1]) * s / n)])
  return out
}

type Thug = {
  cx: number // the thug's center line, between two cells
  swell: number // 0 standing, up to 3
  body: Ink
  lit: number // pressure points lit
  point: Ink
  cracks: number // 0 to 1: share of the body cracked yellow
  // Walking in: a plain dark red silhouette, so the cells he crosses change
  // once each way, whatever the seed, and the pads light as he arrives.
  walking?: boolean
  lower?: Ink // the torso and legs, when they throb against the shoulders
}

// A hulking thug in half-block pixels: head, studded shoulder pads, torso, legs.
function thug(c: Canvas, seed: number, t: Thug) {
  const hw = c.cols === 32 ? 4 : 3 // half the shoulders' width
  const { cx, swell: s } = t
  const head: Ink = !t.walking && noise(seed, 40) < 0.5 ? 'hot' : t.body
  // The pressure points: body pixels on the head, shoulders and torso, in the seed's order.
  const spots: [number, number][] = [[-1, 0], [0, 0]]
  for (let dx = 1 - hw; dx < hw - 1; dx++) spots.push([dx, 1])
  for (let dx = 2 - hw; dx < hw - 2; dx++) spots.push([dx, 2])
  const order = spots.map((p, i) => ({ p, k: noise(seed, 41, i) })).sort((a, b) => a.k - b.k).map(e => e.p)
  // Seven strikes light half the spots at most, so the body still reads.
  const lit = new Set(order.slice(0, Math.round(t.lit * (spots.length >> 1) / 7)).map(([dx, y]) => `${dx},${y}`))
  const rows: [number, number][] = [[cx - 1 - (s >> 1), cx + 1 + (s >> 1)], [cx - hw - s, cx + hw + s], [cx - hw + 1 - s, cx + hw - 1 + s]]
  rows.forEach(([a, b], y) => {
    for (let col = a; col < b; col++) {
      let ink = y === 0 ? head : y === 2 ? t.lower ?? t.body : t.body
      if (y === 1 && (col === a || col === b - 1) && s === 0 && !t.walking) ink = 'cool'
      if (t.cracks > 0 && noise(seed, 42, col - cx, y) < t.cracks) ink = 'spark'
      if (lit.has(`${col - cx},${y}`)) ink = t.point
      c.pix(col, y, ink)
    }
  })
  // Legs apart; a swollen thug's legs splay.
  const legs = c.cols === 32 ? [-3, -2, 1, 2] : [-2, 1]
  for (const dx of legs) c.pix(cx + dx + Math.sign(dx + 0.5) * (s >> 1), 3, t.lower ?? t.body)
}

// The burst, k frames after it: a yellow core that shrinks and a red wash
// over the canvas that deepens, then fades.
function burstBack(c: Canvas, k: number, cx: number) {
  if (k >= 1 && k < 24) {
    const wash: Ink = k >= 2 && k <= 8 ? c.mix('hot', 'base', 0.5) : k < 16 ? c.mix('hot', 'base', 0.75) : c.mix('deep', 'base', 0.75)
    for (let col = 0; col < c.cols; col++) for (const row of [0, 1]) c.bg(col, row, wash)
  }
  const core = [4, 3, 3, 2, 2, 1][k]
  if (core === undefined) return
  for (let col = cx - core; col < cx + core; col++) {
    for (const row of [0, 1]) c.bg(col, row, k < 4 ? 'spark' : c.mix('spark', 'base', 0.5))
  }
}

// The splash: a ring of red and dark red half-block chunks bursts out of
// the core, 2 columns a frame toward Ken and 1 the other way. Each cell it
// reaches (most of them, as the seed picks) flares red for 2 frames, dims
// to dark red, and on the ground row leaves a dark red stain, kept until
// `dry`; the core's own cells stain once it has gone. A cell changes once
// up and then only down, whatever the seed, so the splash never strobes.
// `blocked` names the columns holding braille dots (Ken, the Dipper), which
// the chunks keep out of so pixels and dots never share a cell.
function splash(c: Canvas, seed: number, k: number, cx: number, dry: boolean, blocked: (col: number) => boolean) {
  if (k < 1) return
  for (let col = 0; col < c.cols; col++) {
    if (blocked(col)) continue
    const left = col < cx
    const d = left ? cx - 1 - col : col - cx // 0 to 3 inside the core
    for (const row of [0, 1]) {
      if (noise(seed, 61, col, row) >= 0.85) continue
      const late = noise(seed, 60, col, row) < 0.5 ? 0 : 1
      const top = noise(seed, 62, col, row) < 0.5
      const y = row * 2 + (top ? 0 : 1)
      const t0 = d < 4 ? 6 + late : 2 + Math.floor((d - 4) / (left ? 2 : 1)) + late
      if (k < t0) continue
      const s = k - t0
      if (d >= 4 && s < 2) {
        c.pix(col, y, 'hot')
        c.pix(col, row * 2 + (top ? 1 : 0), s ? 'deep' : c.mix('hot', 'deep', 0.5))
      } else if (d >= 4 && s === 2) c.pix(col, y, c.mix('hot', 'deep', 0.5))
      else if (d >= 4 && s === 3) c.pix(col, y, 'deep')
      else if (row === 1 && !dry) c.pix(col, 3, 'deep')
    }
  }
}

// Ken and his aura: dim with Ken in aqua, or blazing aqua with Ken in black.
function ken(c: Canvas, kx: number, f: number, pose: readonly string[] | null, power: number, k1: number) {
  const k0 = Math.max(0, (kx >> 1) - 1)
  for (let col = k0; col <= k1; col++) {
    for (const row of [0, 1]) {
      const edge = col === k0 || col === k1
      const dim = edge || ((f >> 3) + col + row) & 1 ? 0.75 : 0.5
      c.bg(col, row, power === 3 ? (edge ? c.mix('cool', 'base', 0.25) : 'cool') : power ? c.mix('cool', 'base', power === 2 ? 0.25 : 0.5) : c.mix('cool', 'base', dim))
    }
  }
  if (pose) sprite(c, pose, kx, 0, power ? 'base' : 'cool', 3)
}

const FIST = ['XXX.', 'XXXX', 'XXXX', 'XXX.']

function flurry(c: Canvas, f: number, seed: number) {
  const W = c.cols, big = W === 32
  const cx = big ? 25 : 13 // the thug's center line
  const kx = big ? 4 : 0 // Ken's left dot
  const x0 = kx + 7, x1 = (cx - (big ? 4 : 3)) * 2 - 4 // a fist's left dot, from Ken to the thug

  if (f >= POP) burstBack(c, f - POP, cx)

  const power = f < 34 || f >= 76 ? 0 : f < 36 || f >= 74 ? 1 : f < 38 || f >= 72 ? 2 : 3
  const pose = f >= 34 && f < 38 ? KEN_DRAW : f >= 1 && f < BLUR[1] ? KEN_PUNCH : KEN
  // Ken steps in on frame 1, a frame after his aura, so no loop opens on a flash.
  ken(c, kx, f, f === 0 ? null : pose, power, (kx >> 1) + 3)

  // The punches: one every 2 frames from frame 2, rows alternating, each 2 frames in flight.
  const hits = Math.max(0, Math.min(15, Math.floor((f - 4) / 2) + 1))
  const lit = f < RUSH ? Math.min(4, hits >> 1) : Math.min(7, 5 + Math.floor((f - RUSH) / 6))
  const swell = f < 60 ? 0 : f < 68 ? 1 : f < POP ? 2 : 0 // it grows on frames that throb down
  const first = noise(seed, 20) < 0.5 ? 1 : 0
  const gap = big ? 6 : 3 // dots between a fist and its ghosts
  if (f < 34) {
    for (let j = 0; j < 15; j++) {
      const at = 2 + 2 * j
      if (f < at || f > at + 2) continue
      const row = (j + first) & 1
      const x = Math.round(x0 + (x1 - x0) * (f - at) / 2)
      for (let col = Math.max(x0, x - 2 * gap) >> 1; col <= (x + 3) >> 1; col++) c.bg(col, row, c.mix('hot', 'base', 0.75))
      if (x - 2 * gap >= x0) sprite(c, FIST, x - 2 * gap, row * 4, 'deep', 1)
      if (x - gap >= x0) sprite(c, FIST, x - gap, row * 4, 'hot', 2)
      sprite(c, FIST, x, row * 4, 'spark', 4)
    }
  } else if (f >= 37 && f <= RUSH) {
    // HOWATAAA: the big fist, ghosts and a plate behind it.
    const x = Math.round(x0 + (x1 - 3 - x0) * (f - 37) / 3)
    for (let col = Math.max(x0, x - 12) >> 1; col <= (x + 6) >> 1; col++) for (const row of [0, 1]) c.bg(col, row, c.mix('hot', 'base', 0.5))
    if (x - 12 >= x0) sprite(c, BIG_FIST, x - 12, 0, 'deep', 1)
    if (x - 6 >= x0) sprite(c, BIG_FIST, x - 6, 0, 'hot', 2)
    sprite(c, BIG_FIST, x, 0, 'spark', 4)
  }

  // The shockwave from the big hit rolls out both ways.
  if (f >= RUSH && f < RUSH + 8) {
    const k = f - RUSH, hw = big ? 4 : 3
    for (const col of [cx - hw - 1 - k, cx + hw + k]) for (const row of [0, 1]) c.bg(col, row, k < 4 ? 'cool' : c.mix('cool', 'base', 0.5))
  }

  // The hundred fists: each cell flickers a fist on its own beat.
  if (f >= BLUR[0] && f < BLUR[1]) {
    const end = cx - (big ? 4 : 3) - swell - 1
    // The seed shuffles the 6 beats, dealt in turn along the cells, so each
    // frame lights at most one cell in 6 whatever the seed.
    const beats = [0, 1, 2, 3, 4, 5].sort((a, b) => noise(seed, 30, a) - noise(seed, 30, b))
    for (let col = (x0 >> 1) + 1; col <= end; col++) {
      for (const row of [0, 1]) {
        c.bg(col, row, c.mix('hot', 'base', 0.75))
        const k = (f + beats[(col * 2 + row) % 6]!) % 6
        const ink: Ink | null = k === 0 ? 'spark' : k === 1 ? 'hot' : k === 2 ? c.mix('hot', 'deep', 0.5) : k === 3 ? 'deep' : null
        if (!ink) continue
        const dy = row * 4 + (noise(seed, 31, col, row, f >> 3) < 0.5 ? 0 : 1)
        for (const [dx, yy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] as const) c.put(col * 2 + dx, dy + yy, ink, 2)
      }
    }
  }

  if (f < POP) {
    // The swelling thug's head and shoulders throb red over a dark red torso,
    // so only the few cells holding both brighten at once.
    const body: Ink = swell > 0 && (f >> 1) & 1 ? 'hot' : 'deep', lower: Ink = 'deep'
    thug(c, seed, { cx, swell, body, lower, lit, point: 'spark', cracks: f >= 60 ? (f - 58) / 40 : 0 })
  } else {
    splash(c, seed, f - POP, cx, f >= FLURRY - WALK, col => col <= (kx + 7) >> 1)
    if (f >= FLURRY - WALK) thug(c, seed, { cx: cx + FLURRY - f, swell: 0, body: 'deep', lit: 0, point: 'spark', cracks: 0, walking: true })
  }
}

function sevenStars(c: Canvas, f: number, seed: number) {
  const W = c.cols, big = W === 32
  const cx = big ? 25 : 13
  const ox = big ? 4 : 0 // the Dipper's left dot
  const kx = 30 // Ken's left dot, on 32 columns only

  // The blood red sky over the Dipper; the burst's wash covers it a while.
  for (let col = 0; col < W; col++) {
    c.bg(col, 0, c.mix('deep', 'base', 0.5))
    if (col <= (ox >> 1) + 10) c.bg(col, 1, c.mix('deep', 'base', 0.75))
  }
  if (f >= HIDEBU) burstBack(c, f - HIDEBU, cx)

  let body: Ink = 'deep', point: Ink = 'spark', swell = 0, cracks = 0
  if (f >= HELD && f < NANI) {
    // The held moment: a throb every 6 frames.
    const out = (f - HELD) % 6 < 3
    body = out ? 'hot' : 'deep'
    point = out ? 'spark' : c.mix('spark', 'base', 0.5)
  } else if (f >= NANI && f < HIDEBU) {
    // NANI?!: a jolt, then the swell, throbbing every 4 frames.
    const k = f - NANI
    swell = k < 6 ? 0 : k < 16 ? 1 : k < 26 ? 2 : 3
    body = k < 2 || (k >> 1) & 1 ? 'hot' : 'deep'
    cracks = k < 6 ? 0 : (k - 4) / 40
  }
  // The Dipper: its lines draw a segment every 3 frames from frame 10 and
  // go out in reverse after the burst. On 16 columns the swelling thug
  // grows under the bowl's edge: the Dipper gives way to him there.
  const edge = cx - (big ? 4 : 3) - swell
  const sky = (x: number, y: number, ink: Ink, priority: number) => { if (x >> 1 < edge) c.put(x, y, ink, priority) }
  const star = (i: number) => [ox + STARS[i]![0], STARS[i]![1]] as const
  SEGMENTS.forEach(([a, b], k) => {
    const from = 10 + 3 * k
    const gone = HIDEBU + 12 + 2 * (SEGMENTS.length - k)
    if (f < from || f >= gone) return
    const dots = line(star(a), star(b))
    const shown = Math.min(dots.length, Math.ceil(dots.length * (f - from + 1) / 3))
    dots.slice(0, shown).forEach(([x, y]) => sky(x, y, 'cool', 1))
  })
  STARS.forEach((_, i) => {
    const [x, y] = star(i)
    if (f < i || f >= HIDEBU + 26) return
    if (f >= BLAZE && f < BLAZE + 4) c.bg(x >> 1, y >> 2, c.mix('spark', 'base', 0.5))
    sky(x, y, f < BLAZE ? c.mix('spark', 'base', 0.5) : 'spark', 5)
  })
  // Alcor kindles red beside Mizar from frame 30 and pulses.
  if (f >= 30 && f < HIDEBU + 20) {
    const [x, y] = [ox + ALCOR[0], ALCOR[1]]
    c.bg(x >> 1, y >> 2, c.mix('hot', 'base', Math.floor((f - 30) / 3) % 2 ? 0.5 : 0.25))
    c.put(x, y, 'spark', 6)
  }

  // Ken, on 32 columns, strikes seven points from frame 30, one every 2 frames.
  const strikes = Math.max(0, Math.min(7, Math.floor((f - 30) / 2)))
  if (big) {
    const power = f >= 28 && f < HELD ? 3 : f >= 26 && f < HELD + 2 ? 2 : 0
    ken(c, kx, f, f >= 28 && f < HELD ? KEN_PUNCH : KEN, power, (kx >> 1) + 2)
    if (f >= 28 && f < HELD) {
      const j = Math.floor((f - 28) / 2)
      const y = (j & 1) * 4 + 1 + (j % 3 === 0 ? 1 : 0)
      // Dots 37 to 41: it stops a cell short of the thug.
      const x = kx + 7 + ((f - 28) % 2) * 2
      for (let i = 0; i < 3; i++) c.put(x + i, y, 'cool', 2)
    }
  }

  if (f < HIDEBU) {
    thug(c, seed, { cx, swell, body, lit: strikes, point, cracks })
  } else {
    // The splash keeps out of the Dipper's and Ken's columns; the new thug
    // walks in once it has landed.
    splash(c, seed, f - HIDEBU, cx, f >= SEVEN - 6, col => col <= (ox >> 1) + 9 || (big && col >= kx >> 1 && col <= (kx + 7) >> 1))
    if (f >= SEVEN - 6) thug(c, seed, { cx: cx + SEVEN - f, swell: 0, body: 'deep', lit: 0, point: 'spark', cracks: 0, walking: true })
  }
}

export default {
  name: 'hokuto',
  title: 'Hokuto Shinken',
  source: 'Fist of the North Star',
  contexts: ['thinking:seven-stars', 'requesting:flurry'],
  rare: false,
  compact: true,
  variants: {
    flurry: {
      loop: FLURRY,
      beats: [
        { at: 4, phrase: 'ATATATATATA' },
        { at: RUSH, phrase: 'HOWATAAA!' },
        { at: POP, phrase: 'HOKUTO HYAKURETSU KEN' },
      ],
    },
    'seven-stars': {
      loop: SEVEN,
      beats: [
        { at: BLAZE, phrase: 'HOKUTO SHICHISEI' },
        { at: HELD, phrase: 'HE IS ALREADY DEAD' },
        { at: NANI, phrase: 'NANI?!' },
        { at: HIDEBU, phrase: 'HIDEBU!' },
      ],
    },
  },
  draw: (c, frame, seed, variant) => (variant === 'seven-stars' ? sevenStars : flurry)(c, frame, seed),
} satisfies Reel
