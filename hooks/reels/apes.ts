import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Together strong (Planet of the Apes). One variant, march, 108 frames, played
// for subagents and Agent calls.
//
// Two ape forearms reach in from the edges, a thin yellow or aqua stick
// between their fists. The fists push, the stick bows, and APE
// ALONE WEAK: it snaps open at its break in a red shock, splinters burst out
// in yellow and aqua rays, the fists jerk apart and the halves swing down and
// drop away. A thick bundle of four aqua and yellow sticks spreads from the
// middle out into the fists. They push: it bows, wider each time. APES
// TOGETHER STRONG: it springs straight and holds, red cords bind it from the
// middle out, the knuckles blaze, and a red glint runs along it.
//
// A red sunset sky wipes in, a yellow sun on the horizon and redwoods at the
// right edge. The troop marches in black silhouette, Caesar among them,
// upright and taller. CAESAR IS HOME: he halts in front of the sun and raises a
// fist, the troop behind him halts too and the sun swells to blaze across the
// middle, while the apes ahead walk on into the trees. Then they march on.
//
// The statue in the sand, silent: the beach wipes in from the right at dusk,
// stars over olive sand with the sea lapping at the left edge, and a ruined
// aqua figure slides into view, toppled toward its torch, buried to the
// shoulders, its crown of spikes and raised torch against the dark red sky.
// The torch flickers.
//
// The seed picks each arm's fur tone, the stick's ink, its knots and where it
// breaks (the shock plate moves with it), the splinter rays, the bundle's
// stacking order, its dark knots and its outer cords, the troop (5 or 6 apes,
// their gaps, which one is Caesar), the sun's column, the stars, and which way
// the statue leans.

const LOOP = 108
const SNAP = 12 // APE ALONE WEAK: the stick breaks
const DROP = 21 // the bundle spreads into the fists
const HOLD = 36 // APES TOGETHER STRONG: it springs straight and holds
const SKY = 48 // the sunset sky wipes in from the left
const HOME = 70 // CAESAR IS HOME: Caesar halts in front of the sun
const HALT = 12 // frames he stands there
const BEACH = 84 // the beach wipes in from the right

// Apes facing right, 6 dots wide: Caesar upright (8 tall), Caesar with his
// fist raised, a troop ape knuckle-walking (7 tall), each with two strides.
const UPRIGHT = [
  ['..XX..', '..XX..', '.XXXX.', 'XXXXXX', 'X.XX.X', 'X.XX.X', '..XX..', '.X..X.'],
  ['..XX..', '..XX..', '.XXXX.', 'XXXXXX', 'X.XX.X', 'X.XX.X', '..XX..', '..XX..'],
]
const FIST = ['..XX.X', '..XX.X', '.XXXXX', 'XXXX..', 'X.XX..', 'X.XX..', '..XX..', '.X..X.']
const HUNCH = [
  ['......', '...XX.', '.XXXXX', 'XXXXXX', 'XXXX.X', 'X.X..X', 'X.X..X', '.X..X.'],
  ['......', '...XX.', '.XXXXX', 'XXXXXX', 'XXXX.X', '.XX.X.', '.XX.X.', 'X..X..'],
]
// The statue in the sand, toppled toward its torch, 18 dots wide and 8 tall:
// the crown's spikes and the head with an eye socket sheared toward the lean,
// the arm raised to the torch (F marks the flame). The sand covers the
// shoulders.
const STATUE = [
  '..X...X..X......FF',
  '...X..X.X......FFF',
  '...XXXXX..X....XX.',
  '.XXXXXXXXX....XX..',
  '..XXX..XXX...XX...',
  '...XXXXXX...XX....',
  '...XXXX...XXX.....',
  '...XXXXXXXXX......',
]

// The bundle's four sticks in aqua and yellow tones, so they stand out from
// the red fists; the seed stacks them in any of the 24 orders.
const STICKS: readonly Ink[] = ['cool', 'spark', { from: 'cool', to: 'base', t: 0.5 }, { from: 'spark', to: 'base', t: 0.5 }]
// The single stick's ink and each arm's fur tone, by seed.
const STICK: readonly Ink[] = ['spark', 'cool'] // close in luminance to the rays, so trading cells with them never flashes
const FUR = [0.25, 0.5, 0.75] as const
// The outer cords' columns, by seed; the middle cord is always 15-16.
const CORDS = [[11, 20], [10, 21], [12, 19]] as const

// What the seed fixes for the first act.
function act(seed: number) {
  const order = [0, 1, 2, 3].sort((a, b) => noise(seed, 20, a) - noise(seed, 20, b))
  return {
    fur: [0, 1].map(side => FUR[Math.floor(noise(seed, 21, side) * 3)]!), // left arm, right arm
    ink: STICK[Math.floor(noise(seed, 22) * 2)]!,
    brk: 31.5 + Math.floor(noise(seed, 23) * 5) - 2, // the break, in dots
    knots: [0, 1, 2].map(k => [18 + Math.floor(noise(seed, 24, k) * 28), 3 + Math.floor(noise(seed, 25, k) * 2)] as const),
    sticks: order.map(i => STICKS[i]!),
    bark: [0, 1, 2, 3].map(k => 9 + Math.floor(noise(seed, 26, k) * 14)), // a dark knot on each bundle stick
    cords: CORDS[Math.floor(noise(seed, 27) * 3)]!,
  }
}

// A canvas where a cell belongs to whichever of pixels and dots reaches it
// first, so dots never land in a pixel cell: the later layer skips it.
function claiming(c: Canvas): Canvas {
  const owner = new Map<number, 'pix' | 'dot'>()
  const take = (col: number, row: number, kind: 'pix' | 'dot') => {
    if (col < 0 || col >= c.cols || row < 0 || row > 1) return false
    const k = row * 64 + col
    const o = owner.get(k)
    if (o && o !== kind) return false
    owner.set(k, kind)
    return true
  }
  return {
    cols: c.cols, rows: c.rows, mix: c.mix, bg: c.bg, glyph: c.glyph,
    pix: (x, y, ink) => {
      const [X, Y] = [Math.round(x), Math.round(y)]
      if (Y >= 0 && Y < 4 && take(X, Y >> 1, 'pix')) c.pix(X, Y, ink)
    },
    put: (x, y, ink, priority) => {
      const [X, Y] = [Math.round(x), Math.round(y)]
      if (Y >= 0 && Y < 8 && X >= 0 && X < 64 && take(X >> 1, Y >> 2, 'dot')) c.put(X, Y, ink, priority)
    },
  }
}

// A canvas that draws only the columns `keep` passes.
const clipped = (c: Canvas, keep: (col: number) => boolean): Canvas => ({
  cols: c.cols, rows: c.rows, mix: c.mix,
  bg: (col, row, ink) => { if (keep(col)) c.bg(col, row, ink) },
  pix: (x, y, ink) => { if (keep(Math.round(x))) c.pix(x, y, ink) },
  put: (x, y, ink, priority) => { if (keep(Math.round(x) >> 1)) c.put(x, y, ink, priority) },
  glyph: (col, row, char, ink) => { if (keep(col)) c.glyph(col, row, char, ink) },
})

const sprite = (c: Canvas, rows: readonly string[], x: number, ink: Ink) =>
  rows.forEach((line, r) => {
    for (let i = 0; i < line.length; i++) if (line[i] === 'X') c.put(x + i, r, ink, 4)
  })

// The forearms from both edges and the fists at columns 7-8 and 23-24, pushed
// `out` columns outward. Fur in dark red, its top in a red tone the seed
// picks for each arm, fists in red.
function arms(c: Canvas, out: number, blaze: boolean, fur: readonly number[]) {
  for (const side of [-1, 1]) {
    const tone = c.mix('hot', 'deep', fur[side < 0 ? 0 : 1]!)
    for (let k = 0; k < 9; k++) {
      const col = side < 0 ? k - out : 31 - k + out
      if (k >= 7) {
        // The fist: a knuckle ridge on top, fingers wrapped below.
        const knuckle: Ink = blaze ? 'spark' : 'hot'
        c.pix(col, 0, k === 8 ? knuckle : tone)
        c.pix(col, 1, 'hot')
        c.pix(col, 2, 'hot')
        c.pix(col, 3, tone)
      } else {
        c.pix(col, 1, tone)
        c.pix(col, 2, 'deep')
      }
    }
  }
}

// One stick, frames 0 to DROP - 1: it bows, snaps at its seeded break,
// swings down and falls. Knots are dots missing from it.
function stick(c: Canvas, f: number, seed: number) {
  const { ink, brk, knots } = act(seed)
  const knot = (x: number, y: number) => knots.some(([kx, ky]) => kx === x && ky === y)
  const mid = Math.round(brk / 2) // the shock plate's columns: mid - 2 to mid + 1
  if (f >= SNAP) {
    // The shock behind the break.
    const s = f - SNAP
    const shock: Ink | null = s === 0 ? 'hot' : s === 1 ? c.mix('hot', 'deep', 0.5) : s === 2 ? 'deep' : s === 3 ? c.mix('deep', 'base', 0.5) : null
    if (shock) for (let col = mid - 2; col <= mid + 1; col++) for (const row of [0, 1]) c.bg(col, row, shock)
  }
  if (f < SNAP) {
    const bow = f < 4 ? 0 : ((f - 3) / 8) * 1.6
    for (let x = 18; x <= 45; x++) {
      const lift = Math.round(bow * Math.sin((Math.PI * (x - 17)) / 29))
      const strain = f >= SNAP - 3 && Math.abs(x - brk) < 3
      for (const y of [3, 4]) if (!knot(x, y)) c.put(x, y - lift, strain ? 'hot' : ink, 3)
    }
    return
  }
  // The halves pivot at the fists with a gap at the break, then drop.
  const s = f - SNAP
  const sag = Math.min(4, 0.5 + s * 0.8)
  const fall = Math.max(0, f - 18)
  const [end, start] = [Math.floor(brk) - 1, Math.ceil(brk) + 1] // the last left dot, the first right dot
  for (let x = 18; x <= 45; x++) {
    if (x > end && x < start) continue
    const along = x <= end ? (x - 17) / (end - 17) : (46 - x) / (46 - start)
    const dy = sag * along + (fall * (fall + 1)) / 2
    for (const y of [3, 4]) if (!knot(x, y)) c.put(x, y + dy, ink, 3)
  }
  // Splinters burst from the break as rays at full length on the snap, then
  // let go from the inside out, so every cell they light, lights on frame 12
  // (the loop's one mass rise) and later frames only go dark.
  if (s < 6) {
    for (let k = 0; k < 6; k++) {
      const a = ((k + 0.25 + noise(seed, 1, k) * 0.5) / 6) * 2 * Math.PI
      const reach = 3 * (2.5 + noise(seed, 2, k))
      const ray: Ink = noise(seed, 3, k) < 0.6 ? 'spark' : 'cool'
      // Points on a fixed grid along the ray, so letting go only removes dots.
      for (let r = 2; r <= reach; r += 0.5) if (r >= 2 + (s * (reach - 2)) / 5) c.put(brk + Math.cos(a) * r * 1.6, 3.5 + Math.sin(a) * r * 0.6, ray, 5)
    }
  }
}

// The bundle, frames DROP to SKY: four pixel sticks between the fists.
function bundle(c: Canvas, f: number, seed: number) {
  const { sticks, bark, cords } = act(seed)
  const reach = 2 * (f - DROP + 1) // it spreads out from the middle to the fists
  // The bow before it holds: wider each push, the middle up a pixel.
  const bowed = (col: number) => {
    if (f < 24 || f >= HOLD) return false
    const w = f < 28 ? 1 : f < 32 ? 2 : 4
    return f % 4 < 2 && Math.abs(col - 15.5) < w
  }
  // The red cords bind it from the middle out; then a glint runs along it.
  const tied = (col: number) => (col === 15 || col === 16) ? f >= HOLD : (cords as readonly number[]).includes(col) && f >= HOLD + 1
  const glint = f >= HOLD + 3 ? 9 + (f - HOLD - 3) * 2 : -9
  for (let col = 9; col <= 22; col++) {
    if (Math.abs(col - 15.5) > reach) continue
    for (let k = 0; k < 4; k++) {
      const y = 3 - k - (bowed(col) ? 1 : 0)
      if (y < 0) continue
      const shine = col === glint || col === glint + 1
      c.pix(col, y, tied(col) || shine ? 'hot' : col === bark[k] ? 'deep' : sticks[k]!)
    }
  }
}

// The troop: Caesar's left edge halts at 29 for HALT
// frames from HOME; the apes behind him halt with him, those ahead walk on.
function troop(seed: number) {
  const n = 5 + Math.floor(noise(seed, 5) * 2)
  const caesar = 1 + Math.floor(noise(seed, 6) * 2)
  const gaps = [...Array(n)].map((_, j) => 9 + Math.floor(noise(seed, 7, j) * 4))
  const offset = (j: number) => {
    let d = 0
    for (let i = Math.min(j, caesar); i < Math.max(j, caesar); i++) d += gaps[i]!
    return j < caesar ? d : -d
  }
  return { n, caesar, offset }
}

const caesarX = (f: number, halts: boolean) =>
  29 + 2 * (f - HOME) - (halts ? 2 * Math.max(0, Math.min(HALT, f - HOME)) : 0)

function march(c: Canvas, f: number, seed: number) {
  const sun = 15 + Math.floor(noise(seed, 8) * 2) // sun cols sun-2..sun+1
  const peak = f >= HOME && f < HOME + HALT
  // The blaze: the sun swells a column each way a frame, holds, then sets back.
  const widen = peak ? Math.min(3, f - HOME + 1, HOME + HALT - f) : 0
  for (let col = 0; col < 32; col++) {
    const d = col < sun ? sun - 1 - col : col - sun // 0 at the two center columns
    const trees = col >= 28
    const row0: Ink = trees ? (col === 29 ? 'deep' : 'base') : d <= 1 + widen ? 'spark' : d <= 10 + widen ? 'hot' : c.mix('hot', 'deep', 0.5)
    const row1: Ink = trees ? (col === 29 ? 'deep' : 'base') : d <= 1 + widen ? 'spark' : 'hot'
    c.bg(col, 0, row0)
    c.bg(col, 1, row1)
  }
  const { n, caesar, offset } = troop(seed)
  const step = (f >> 1) % 2
  for (let j = 0; j < n; j++) {
    const x = caesarX(f, j >= caesar) + offset(j)
    if (x <= -6 || x >= 56) continue
    if (j === caesar) sprite(c, peak ? FIST : UPRIGHT[step]!, x, 'base')
    else sprite(c, HUNCH[(step + j) % 2]!, x, 'base')
  }
}

// The beach at dusk, from BEACH: a dark red sky with a few stars, sand along
// the bottom with the sea lapping at the left edge. The statue slides in from
// the right and stops at the middle; its torch flickers.
function beach(c: Canvas, f: number, seed: number) {
  const flip = noise(seed, 9) < 0.5
  const x0 = 22 + 2 * Math.max(0, BEACH + 16 - f) // the statue's left dot: still from frame 100
  const lap = 3 + [0, 1, 2, 1][(f >> 2) % 4]! // the sea's reach in columns
  for (let col = 0; col < 32; col++) {
    c.bg(col, 0, col < 6 || col > 26 ? c.mix('deep', 'base', 0.25) : 'deep')
    c.bg(col, 1, col < lap ? c.mix('cool', 'base', 0.5) : col === lap ? c.mix('cool', 'base', 0.25) : c.mix('spark', 'base', 0.5))
  }
  for (let k = 0; k < 4; k++) c.put(Math.floor(noise(seed, 10, k) * 64), Math.floor(noise(seed, 11, k) * 2), 'spark', 1)
  const flame: Ink = (f >> 1) % 3 === 0 ? 'hot' : 'spark'
  STATUE.forEach((line, r) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[flip ? line.length - 1 - i : i]
      if (ch === 'X') c.put(x0 + i, r, 'cool', 3)
      else if (ch === 'F') c.put(x0 + i, r, flame, 4)
    }
  })
}

function draw(canvas: Canvas, f: number, seed: number) {
  const c = claiming(canvas)
  if (f < SKY) {
    arms(c, f < 3 ? (3 - f) * 2 : f === SNAP + 1 || f === SNAP + 2 ? 1 : 0, f >= HOLD && f < HOLD + 8, act(seed).fur)
    if (f < DROP) stick(c, f, seed)
    if (f >= DROP) bundle(c, f, seed)
    return
  }
  if (f < BEACH + 6) {
    // The sky wipes in from the left 4 columns a frame over the bundle; the
    // beach wipes in from the right 6 a frame over the march.
    const front = (f - SKY + 1) * 4
    const beachFront = f >= BEACH ? 32 - (f - BEACH + 1) * 6 : 32
    if (f >= BEACH) beach(clipped(c, col => col >= beachFront), f, seed)
    march(clipped(c, col => col < front && col < beachFront), f, seed)
    if (front < 32) {
      const old = clipped(c, col => col >= front)
      arms(old, 0, false, act(seed).fur)
      bundle(old, f, seed)
    }
    return
  }
  beach(c, f, seed)
}

export default {
  name: 'apes',
  title: 'Together strong',
  source: 'Planet of the Apes',
  contexts: ['agents'],
  rare: false,
  variants: {
    march: {
      loop: LOOP,
      beats: [
        { at: SNAP, phrase: 'APE ALONE WEAK' },
        { at: HOLD, phrase: 'APES TOGETHER STRONG' },
        { at: HOME, phrase: 'CAESAR IS HOME' },
      ],
    },
  },
  draw,
} satisfies Reel
