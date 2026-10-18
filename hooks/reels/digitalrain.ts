import type { Canvas, Ink, Reel } from '../canvas'
import type { Slot } from '../theme'
import { noise } from '../canvas'

// Digital rain (The Matrix). As the code drains, a block cursor types WAKE
// UP, NEO on the black screen. WAKE UP, NEO: the code erupts from the cursor,
// washes the words away and pours down every column, each stream led by a
// bright head glyph that lands full bright, its trail fading behind it, every
// katakana changing in place in both rows, and about 40% of the columns
// trailing a streak of 2 or 3 dots behind their heads. Red glitch cells blink
// in the code. The Woman in the Red Dress walks in, the code around her going
// still and red, and stops at the center with her dress flared in a red bloom
// (her peak, frame 26); look again, and she dissolves into red glitch code.
// FOLLOW THE WHITE RABBIT: a yellow rabbit with a red eye pops out of the code
// at the center in a yellow flare, twitches its ears, dashes off one side and
// runs back across the whole width, the code lighting yellow behind it. KNOCK,
// KNOCK, NEO: the rain stops dead and a red disc booms out of the center from a
// yellow core, twice. Red glitches swarm, the rain drains away and the cursor
// types again.
//
// The seed picks every stream's speed, length and gaps, which columns carry dot
// tails, the katakana, the glitches, the side she walks in from and the side
// the rabbit runs to. Every key moment sits in the center (columns 8 to 23), so
// the 16-column crop reads.

const LOOP = 108
const DRESS = 26 // her peak: she stops at the center, the bloom
const GONE = DRESS + 8 // she has dissolved into red code
const RABBIT = 40 // the rabbit pops out of the code
const BACK = 58 // the rabbit runs back across from the far side
const KNOCKS = [76, 84] as const
const CURSOR = 12 // the cursor's column; the rain erupts from it
const DRAINED = 98 // every stream has left the screen
const WAKE = 'WAKE UP, NEO'
const TYPE = LOOP - WAKE.length // the cursor types WAKE UP, NEO a character a frame to the loop's end
const KANA = 'ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'

// The rain's clock stops for 2 frames on each knock.
const clock = (f: number) => f - KNOCKS.reduce((n, k) => n + Math.max(0, Math.min(2, f - k + 1)), 0)
const kana = (...n: number[]) => KANA[Math.floor(noise(...n) * KANA.length)]!
const M = (from: Slot, t: number, to: Slot = 'base'): Ink => ({ from, to, t })

type Stream = { s: number; v: number }

// Rain levels, dark to bright: the cell's plate and glyph ink. Below the head,
// each glyph is brighter than its plate or has none, so the trail reads as
// code. Up to level 5 each step is under 0.10 in luminance in both themes, in
// truecolor and at 256 colors, so cells glowing back a level a frame from under
// the script never count, however many glow together. The step into level 6 is
// over 0.10, so the rain never glows back into it; a cell reaches it only as its
// head falls on. A trail dims a level a frame and never brightens by 0.10 on the
// way, so it counts at most once.
const LEVELS: readonly (readonly [Ink | null, Ink])[] = [
  [null, M('cool', 0.75)],
  [null, M('cool', 0.5)],
  [M('cool', 0.75), M('cool', 0.5)],
  [M('cool', 0.75), M('cool', 0.25)],
  [M('cool', 0.5), M('cool', 0.25)],
  [M('cool', 0.75), 'cool'],
  [M('cool', 0.25), 'cool'],
  ['cool', 'base'], // the head
]
const STEP = 1.2 // dots a level; a stream falls at most 1.15 dots a frame

// Column c's streams, by the rain clock: the first leaves the cursor's row at
// the eruption, 2 columns a frame each way, and the last clears by DRAINED.
function streams(seed: number, c: number): Stream[] {
  const v = 0.55 + noise(seed, 1, c) * 0.6 // dots a frame
  const cross = (8 + 7 * STEP) / v // the canvas and the trail below it
  const out: Stream[] = []
  for (let s = Math.abs(c - CURSOR) / 2 + (c === CURSOR ? 0 : noise(seed, 6, c) * 8), k = 0; s + cross <= clock(DRAINED); k++) {
    out.push({ s, v })
    s += cross * 0.7 + 3 + noise(seed, 3, c, k) * 12
  }
  return out
}

// A cell's rain level at rain time tau: full bright the frame a head lands in
// it (one counted rise), then a level every STEP dots behind it. A stream falls
// at most 1.15 dots a frame, so the trail drops a level a frame at most and
// never counts, and the next landing repeats the rise's direction and does not
// count either.
function level(list: readonly Stream[], row: number, tau: number): number {
  let best = 0
  for (const { s, v } of list) {
    const y = (tau - s) * v // the head, in dots
    const top = row * 4
    const lv = y < top ? 0 : y < top + 4 ? 7 : 6 - Math.floor((y - top - 4) / STEP)
    best = Math.max(best, Math.min(7, lv))
  }
  return best
}

// The Woman in the Red Dress: hair, bodice, skirt, and a swaying or flared hem.
const WOMAN = ['.S.', '.H.', 'HHH', 'HDH']
const STRIDE = ['.S.', '.H.', 'HHH', 'DHD']
const FLARE = ['..S..', '..H..', '.HHH.', 'HDHDH']
// The rabbit facing right, 7 pixels wide: ears, head with a red eye, body, feet.
const SIT = ['....X.X', '....XXE', '.XXXXX.', '..X..X.']
const TWITCH = ['.....XX', '....XXE', '.XXXXX.', '..X..X.']
const RUN = ['....X.X', '...XXXE', 'XXXXXX.', '......X']
const TUCK = ['....X.X', '...XXXE', '.XXXXX.', '..XX...']

type Pixel = [number, number, Ink]

// A sprite's pixels, mirrored when it faces left.
function pixels(rows: readonly string[], x0: number, y0: number, face: 1 | -1, inks: Record<string, Ink>): Pixel[] {
  const w = rows[0]!.length
  const out: Pixel[] = []
  rows.forEach((line, y) => {
    for (let i = 0; i < w; i++) {
      const ink = inks[line[i]!]
      if (ink && y0 + y >= 0 && y0 + y < 4) out.push([x0 + (face === 1 ? i : w - 1 - i), y0 + y, ink])
    }
  })
  return out
}

// Her left column at frame f (walking in from the left; mirrored for the right), or null.
function womanAt(f: number): number | null {
  return f < DRESS - 17 || f >= GONE + 6 ? null : Math.min(14, 14 - (DRESS - f))
}

// The rabbit's left column and pose at frame f (running right; mirrored for
// the left), or null. It sits at the center, dashes off at the prototype's 2
// columns a frame, then runs back across the whole width with a running gait
// from its fourth frame (sooner adds too many rising cells to the 16-column
// crop). It never bobs: a bob would flip its cells between full and half blocks.
function rabbitAt(f: number): { x: number; rows: readonly string[] } | null {
  if (f < RABBIT) return null
  if (f < RABBIT + 8) return { x: 13, rows: (f >> 2) & 1 ? TWITCH : SIT }
  const x = f < BACK ? 13 + 2 * (f - RABBIT - 8) : -7 + 2 * (f - BACK)
  return x > 32 ? null : { x, rows: f > RABBIT + 10 && (f >> 1) & 1 ? TUCK : RUN }
}

const W = 32
const mirror = (face: 1 | -1, x: number, w: number) => (face === 1 ? x : W - x - w)

type Look = { bg: Ink | null; ink: Ink | null; ch: string }
// The scripted layer at frame f: pixels, the cells they hold, the cells it
// paints over the rain, and the cells where the rain is hushed to its dimmest.
type Scene = { pix: Pixel[]; held: Set<number>; over: Map<number, Look>; hush: Set<number> }

function scene(f: number, seed: number): Scene {
  const tau = clock(f)
  const pix: Pixel[] = []
  const over = new Map<number, Look>()
  const hush = new Set<number>()
  const code = (col: number, row: number) => kana(seed, 8, col, row, Math.floor((tau + noise(seed, 9, col, row) * 5) / (2 + Math.floor(noise(seed, 7, col, row) * 4))))

  // The cursor types WAKE UP, NEO before the eruption, blinking once; the
  // eruption washes the words away column by column.
  const typed = Math.max(0, f - TYPE + 1)
  if ((f >= TYPE && f < DRAINED + 4) || f >= DRAINED + 6) pix.push([CURSOR + typed, 0, 'cool'], [CURSOR + typed, 1, 'cool'])
  for (let i = 0; i < WAKE.length; i++) {
    if (i < typed || (f < TYPE && tau < streams(seed, CURSOR + i)[0]!.s)) over.set(CURSOR + i, { bg: null, ink: WAKE[i] === ' ' ? null : 'cool', ch: WAKE[i]! })
  }

  // The Woman in the Red Dress: the code goes still and red around her, wider
  // at her peak; look again, and she is red glitch code.
  const herFace: 1 | -1 = noise(seed, 20) < 0.5 ? 1 : -1
  const wx = womanAt(f)
  if (wx !== null) {
    const rows = f >= DRESS ? FLARE : (f >> 1) & 1 ? STRIDE : WOMAN
    const x = mirror(herFace, f >= DRESS ? wx - 1 : wx, rows[0]!.length)
    const center = x + (rows[0]!.length >> 1)
    const reach = f < DRESS ? 4 : f < GONE ? 5 : 5 - (f - GONE)
    for (let col = center - reach; col <= center + reach; col++) {
      for (const row of [0, 1]) if (col >= 0 && col < W) over.set(row * W + col, { bg: M('hot', f >= DRESS && f < GONE && Math.abs(col - center) <= 2 ? 0.5 : 0.75), ink: 'hot', ch: code(col, row) })
    }
    const her = pixels(rows, x, 0, herFace, { S: 'spark', H: 'hot', D: 'deep' })
    if (f < DRESS + 4) pix.push(...her)
    else if (f < GONE) for (const [px, py] of her) if (px >= 0 && px < W) over.set((py >> 1) * W + px, { bg: 'deep', ink: 'hot', ch: kana(seed, 13, px, py >> 1, f >> 1) })
  }

  // The white rabbit runs to the seed's side; its eye is red. The rain holds
  // still around it, 10 columns ahead while it runs and 3 behind, where its
  // trail takes over, and ahead of where it comes back in before it does.
  const runFace: 1 | -1 = noise(seed, 21) < 0.5 ? 1 : -1
  const rabbit = rabbitAt(f)
  const zones: [number, number, number][] = [] // center, behind, ahead
  if (rabbit) {
    const w = rabbit.rows[0]!.length
    const x = mirror(runFace, rabbit.x, w)
    zones.push([x + (w >> 1), 3, f < RABBIT + 8 ? 6 : 10])
    const body = pixels(rabbit.rows, x, 0, runFace, { X: 'spark', E: 'hot' })
    pix.push(...body)
    // While it runs through the center, the center's rain holds still, so no
    // head lands beside its rising cells in the 16-column crop.
    if (f >= RABBIT + 8 && body.some(([px]) => px >= 8 && px <= 23)) for (let col = 8; col <= 23; col++) hush.add(col).add(W + col)
  }
  if (f >= BACK - 5 && f < BACK) zones.push([mirror(runFace, -7 + 2 * (f - BACK), RUN[0]!.length) + 3, 0, 10])
  for (const [center, behind, ahead] of zones) {
    for (let col = 0; col < W; col++) {
      const d = (col - center) * runFace
      if (d >= -behind && d <= ahead) hush.add(col).add(W + col)
    }
  }
  // The flare as it pops out; then the code lights yellow where it has been in
  // the last 5 frames.
  if (rabbit && f < RABBIT + 5) {
    const center = zones[0]![0]
    for (let col = center - 6; col <= center + 6; col++) for (const row of [0, 1]) over.set(row * W + col, { bg: M('spark', f < RABBIT + 2 ? 0.5 : 0.75), ink: 'spark', ch: code(col, row) })
  }
  for (let a = 5; a >= 1 && f >= RABBIT + 8; a--) {
    const r = rabbitAt(f - a)
    if (!r) continue
    const w = r.rows[0]!.length
    for (const [x, y] of pixels(r.rows, mirror(runFace, r.x, w), 0, runFace, { X: 'spark', E: 'hot' })) {
      const cell = (y >> 1) * W + x
      if (x >= 0 && x < W) over.set(cell, a <= 2 ? { bg: M('spark', 0.75), ink: 'spark', ch: code(x, y >> 1) } : { bg: null, ink: M('spark', a <= 3 ? 0.25 : 0.5), ch: code(x, y >> 1) })
    }
  }

  // The knocks: each a red disc booming out of the center a column a frame
  // each way from a yellow core, until the code drains.
  const knock = KNOCKS.filter(k => f >= k).map(k => f - k).pop() ?? -1
  for (let col = 0; col < W && f < 92; col++) {
    const depth = KNOCKS.map(k => f - k + 0.5 - Math.abs(col - 15.5)).filter(d => d >= 0).pop()
    if (depth === undefined) continue
    const bg: Ink = knock === 0 && depth === 0 ? 'spark' : depth < 2 ? 'hot' : depth < 4 ? M('hot', 0.5, 'deep') : 'deep'
    // Inside the ring the code is dim red on dark red: a full red glyph would
    // brighten the ring's cells as it passes, a flash at 256 colors.
    const ink: Ink = depth === 0 && knock > 0 ? 'spark' : depth < 4 ? 'base' : M('hot', 0.5)
    for (const row of [0, 1]) over.set(row * W + col, { bg, ink, ch: code(col, row) })
  }

  const held = new Set<number>()
  for (const [x, y] of pix) if (x >= 0 && x < W) held.add((y >> 1) * W + x)
  return { pix, held, over, hush }
}

function draw(c: Canvas, f: number, seed: number) {
  const tau = clock(f)
  // Scenes of nearby frames, kept for this draw only.
  const scenes = new Map<number, Scene>()
  const at = (g: number) => {
    const k = ((g % LOOP) + LOOP) % LOOP
    let sc = scenes.get(k)
    if (!sc) scenes.set(k, sc = scene(k, seed))
    return sc
  }
  const veiled = (g: number, cell: number) => { const sc = at(g); return sc.held.has(cell) || sc.over.has(cell) || sc.hush.has(cell) }
  const now = at(f)
  // Glitches swarm at her peak and as the code drains; none while the discs boom.
  const p = f >= DRESS - 2 && f < DRESS + 6 ? 0.5 : f >= KNOCKS[0] && f < 92 ? 0 : f >= 92 && f < 100 ? 0.45 : 0.18

  for (let col = 0; col < W; col++) {
    const list = streams(seed, col)
    const tail = noise(seed, 4, col) < 0.4 ? 2 + (noise(seed, 5, col) < 0.5 ? 1 : 0) : 0
    const x = col * 2 + (col & 1)
    const dots = new Set<number>()
    for (const { s, v } of list) {
      const hy = Math.floor((tau - s) * v)
      for (let i = 1; i <= tail && hy >= 0; i++) {
        const dy = hy >> 2 === 1 ? 4 - i : hy - i // behind a row-1 head, stacked at the foot of the cell above
        if (dy >= 0 && dy < 8 && dy >> 2 !== hy >> 2) dots.add(dy)
      }
    }

    for (const row of [0, 1]) {
      const cell = row * W + col
      if (now.held.has(cell)) continue
      const look = now.over.get(cell)
      if (look) {
        if (look.bg) c.bg(col, row, look.bg)
        if (look.ink) c.glyph(col, row, look.ch, look.ink)
        continue
      }
      const ch = kana(seed, 8, col, row, Math.floor((tau + noise(seed, 9, col, row) * 5) / (2 + Math.floor(noise(seed, 7, col, row) * 4))))
      // Out from under the script, the rain glows back a level a frame, each
      // cell up to 3 frames behind its neighbors, so few cells step up together.
      // It glows back no higher than level 5, and stays there while a head
      // lights the cell above that, so it never takes the step into level 6,
      // the one over 0.10.
      const lag = (col + 2 * row) % 4
      const freeAt = (g: number) => { let n = 0; while (n < 7 + lag && !veiled(g - n, cell)) n++; return n - lag }
      const free = freeAt(f)
      let lv = Math.min(level(list, row, tau), Math.max(0, free))
      for (let g = f; lv >= 6 && g > f - 12 && level(list, row, clock(g)) >= 6; g--) if (freeAt(g) < 7) lv = 5
      // A glitch blinks only in a dim cell that stays dim and clear of the
      // script around it; its 0.099 luminance never counts as a flash.
      const slot = f + ((col * 7 + row * 8) & 15)
      const glitch = slot % 16 < 2 && lv <= 1 && noise(seed, 11, col, row, slot >> 4) < p &&
        [-1, 0, 1, 2].every(d => !veiled(f + d, cell) && level(list, row, clock(f + d)) <= (d < 0 ? 2 : 1))
      if (glitch) {
        c.bg(col, row, 'deep')
        c.glyph(col, row, kana(seed, 13, col, row, f >> 1), M('hot', 0.5))
        continue
      }
      const [bg, ink] = LEVELS[lv]!
      // The discs leave the code on a red plate while it drains.
      const plate = bg ?? (f >= 92 && f < 96 ? M('hot', 0.75) : null)
      if (plate) c.bg(col, row, plate)
      const tailDots = [...dots].filter(dy => dy >> 2 === row)
      // The tail's nearest dot takes the cell's glyph ink, so the cell's
      // luminance is the same with dots or a glyph.
      if (tailDots.length && lv >= 1) {
        const near = Math.max(...tailDots)
        tailDots.forEach(dy => c.put(x, dy, dy === near ? ink : LEVELS[lv - 1]![1], dy === near ? 3 : 2))
      } else if (lv > 0 || noise(seed, 12, col, row, tau >> 3) < 0.45) c.glyph(col, row, lv >= 4 ? kana(seed, 6, col, row, tau) : ch, ink)
    }
  }

  for (const [x, y, ink] of now.pix) c.pix(x, y, ink)
}

export default {
  name: 'digitalrain',
  title: 'Digital rain',
  source: 'The Matrix',
  contexts: ['shell'],
  rare: false,
  variants: {
    rain: {
      loop: LOOP,
      beats: [
        { at: 0, phrase: 'WAKE UP, NEO' },
        { at: RABBIT, phrase: 'FOLLOW THE WHITE RABBIT' },
        { at: KNOCKS[0], phrase: 'KNOCK, KNOCK, NEO' },
      ],
    },
  },
  draw,
} satisfies Reel
