import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Forest spirit (Princess Mononoke). One variant, walk, 108 frames, played on
// long waits. A night forest of dark red trunks over a mossy floor.
//
// Kodama rise out of the floor one by one, each 4 dots wide and 8 tall: a big
// round head with two eye holes on a thin body. KODAMA RATTLE: every head
// blazes yellow and they rattle in unison, tilting left, upright, right, then
// fall out of step. They sense something, all turn toward one side and sink
// back into the ground, nearest first.
//
// The curse demon charges in from that side: a dark boar shape covered in a
// writhing mass of short red worms, aqua tusks at its snout and one red eye.
// TATARIGAMI: it halts in the middle, the eye snaps open, worms lash out
// across the canvas and a red blight runs along the floor to both edges. Then
// it charges off the other side while the blight fades.
//
// Two kodama peek out of the floor, rattling, and duck as the Forest Spirit
// nears. SHISHIGAMI WALKS: the Forest Spirit, an aqua deer with a red face and a
// yellow crown of antlers, walks across. Where its hooves fall, flowers spring
// up, bloom, then wilt red and wither to nothing behind it.
//
// The seed picks how many kodama rise (4 to 6), where, when and how they fall
// out of step; the demon's side, where it halts, its worms and its lashes; and
// the flowers' heights and timing. The forest is seed-free, so the wrap from
// one loop to the next is seamless.

const LOOP = 108
const RATTLE = 12 // KODAMA RATTLE: the heads blaze and rattle in unison
const SENSE = 30 // the kodama turn toward the demon's side
const CHARGE = 38 // the demon enters
const CURSE = 48 // TATARIGAMI: it halts, the eye opens, the lashes fly
const LEAVE = 60 // it charges off
const PEEK = 67 // two kodama peek out
const WALK = 84 // SHISHIGAMI WALKS: the spirit at the middle

const KODAMA = ['.XX.', 'XXXX', 'X..X', '.XX.', '.XX.', 'XXXX', '.XX.', 'X..X']
// The Forest Spirit facing right, 13 dots wide: antlers, head and snout, neck,\n// body, legs; the last row strides.
const DEER = [
  '.......X.X.X.',
  '........XXX..',
  '.........XXXX',
  '........XX...',
  'X.XXXXXXXX...',
  '.XXXXXXXXX...',
  '.XX....XX....',
]
const STRIDE = ['X..X..X..X...', '.XX....XX....']

// Trunks, seed-free: the cells of these columns are dark red on both rows.
const TRUNKS = new Set([2, 6, 11, 17, 22, 27])

// A canvas where a cell belongs to whichever of pixels and dots reaches it
// first, so dots never erase pixels: the later layer skips a claimed cell.
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

const sprite = (c: Canvas, rows: readonly string[], x: number, y: number, ink: (r: number) => Ink, prio: number, shift: (r: number) => number = () => 0) =>
  rows.forEach((line, r) => {
    for (let i = 0; i < line.length; i++) if (line[i] === 'X') c.put(x + i + shift(r), y + r, ink(r), prio)
  })

// The demon's side: -1 it enters from the left and runs right, 1 the reverse.
const sideOf = (seed: number) => (noise(seed, 5) < 0.5 ? -1 : 1)
const stopOf = (seed: number) => 15 + Math.floor(noise(seed, 6) * 2)

// The demon's center column at frame f, or null off stage.
function demonAt(seed: number, f: number): number | null {
  const side = sideOf(seed), stop = stopOf(seed)
  const start = side < 0 ? -7 : 38, end = side < 0 ? 38 : -7
  if (f < CHARGE || f > LEAVE + 11) return null
  if (f < CURSE) return start + ((stop - start) * (f - CHARGE)) / (CURSE - CHARGE)
  if (f < LEAVE) return stop + (f >= CURSE + 2 && f < CURSE + 8 ? ((f >> 1) % 2 ? 0.5 : -0.5) * side : 0)
  return stop + ((end - stop) * (f - LEAVE)) / 11
}

// The demon's body cells: the hump on row 0 sits back from the snout.
function inBody(cx: number, col: number, row: number, dir: number) {
  const d = (col - cx) * dir // positive toward the snout
  return row === 1 ? d >= -5 && d <= 5 : d >= -4 && d <= 2
}

function kodama(c: Canvas, f: number, seed: number) {
  const side = sideOf(seed)
  const n = 4 + Math.floor(noise(seed, 1) * 3)
  // Two of the four center slots, so the 16-column crop always holds two.
  const center = [2, 3, 4, 5].sort((a, b) => noise(seed, 2, a) - noise(seed, 2, b)).slice(0, 2)
  const rest = [0, 1, 2, 3, 4, 5, 6, 7].filter(s => !center.includes(s)).sort((a, b) => noise(seed, 3, a) - noise(seed, 3, b))
  const slots = [...center, ...rest.slice(0, n - 2)]
  const order = [...slots].sort((a, b) => noise(seed, 4, a) - noise(seed, 4, b))
  // The ones nearest the demon's side sink first.
  const byNear = [...slots].sort((a, b) => (side < 0 ? a - b : b - a))
  for (const slot of slots) {
    const i = order.indexOf(slot)
    const rise = 1 + Math.round((i * 9) / (n - 1)) // frame it starts to rise
    const sink = SENSE + 2 + byNear.indexOf(slot) // frame it starts to sink
    const depth = f < rise ? 8 : f < sink ? Math.max(0, 8 - 2 * (f - rise + 1)) : Math.min(8, 2 * (f - sink + 1))
    if (depth >= 8) continue
    let pose = 0
    if (f < RATTLE) {
      // A curious tilt, once, while it settles.
      const at = rise + 4 + Math.floor(noise(seed, 7, slot) * 3)
      if (f >= at && f < at + 2 && at <= RATTLE - 4) pose = noise(seed, 8, slot) < 0.5 ? -1 : 1
    } else if (f < RATTLE + 8) pose = [-1, 0, 1, 0][(f - RATTLE) % 4]!
    else if (f < RATTLE + 10) pose = 0
    else if (f < SENSE) pose = [-1, 0, 1, 0][((f + Math.floor(noise(seed, 9, slot) * 8)) >> 1) % 4]!
    else pose = side
    const blaze = f >= RATTLE && f < RATTLE + 8
    const x = 2 * (4 * slot + 1)
    sprite(c, KODAMA, x, depth, r => (r < 4 ? (blaze ? 'spark' : 'cool') : c.mix('cool', 'base', 0.25)), 4, r => (r < 2 ? pose : 0))
  }
}

// After the demon has gone, the two center kodama peek out, heads only, and
// rattle; each ducks back down just ahead of the Forest Spirit.
function peek(c: Canvas, f: number, seed: number) {
  const center = [2, 3, 4, 5].sort((a, b) => noise(seed, 2, a) - noise(seed, 2, b)).slice(0, 2)
  for (const slot of center) {
    const x = 2 * (4 * slot + 1)
    const rise = PEEK + Math.floor(noise(seed, 16, slot) * 3)
    const sink = WALK + Math.floor((x - 44) / 3)
    const depth = f < rise ? 8 : f < sink ? Math.max(4, 8 - 2 * (f - rise + 1)) : Math.min(8, 4 + 2 * (f - sink + 1))
    if (depth >= 8) continue
    const pose = [-1, 0, 1, 0][((f + slot) >> 1) % 4]!
    sprite(c, KODAMA.slice(0, 4), x, depth, () => 'cool', 4, r => (r < 2 ? pose : 0))
  }
}

function demon(c: Canvas, f: number, seed: number, cx: number) {
  const dir = -sideOf(seed) // the way it runs
  const front = 2 * cx + 1 + dir * 11 // the snout's dot column
  // The eye, drawn first so no worm covers it: shut to a slit until it halts.
  const eye = Math.round(cx + 2 * dir)
  c.pix(eye, 1, 'hot')
  if (f >= CURSE) c.pix(eye, 0, 'hot')
  // Tusks, curving up from the snout.
  for (const [dx, y] of [[0, 6], [1, 5], [1, 4]] as const) c.put(front + dir * dx, y, 'cool', 6)
  // The worms: short curling strands anchored on the body, writhing.
  for (let k = 0; k < 16; k++) {
    let x = 2 * cx + 1 + (noise(seed, 10, k) - 0.5) * 20
    let y = noise(seed, 11, k) * 8
    if (y < 4 && Math.abs(x - 2 * cx - 1 + dir * 2) > 7) y += 4
    const ph = noise(seed, 12, k) * 6.28
    let th = noise(seed, 13, k) * 6.28 + 1.4 * Math.sin(0.7 * f + ph)
    const bend = 0.8 * Math.sin(0.9 * f + ph * 1.7)
    const ink: Ink = k % 3 ? 'hot' : c.mix('hot', 'deep', 0.5)
    for (let i = 0; i < 4; i++) {
      c.put(x, Math.max(0, Math.min(7, y)), ink, 3)
      th += bend
      x += Math.cos(th)
      y += Math.sin(th)
    }
  }
  // TATARIGAMI: the lashes fly out to the edges, then draw back.
  if (f >= CURSE && f < LEAVE) {
    const s = f - CURSE
    for (let k = 0; k < 6; k++) {
      const way = k % 2 ? dir : -dir
      const max = 14 + Math.floor(noise(seed, 14, k) * 14)
      const len = Math.min(max, s < 8 ? 4 * (s + 1) : Math.max(0, max - 4 * (s - 7)))
      const y0 = 1 + ((k * 5 + Math.floor(noise(seed, 15, k) * 3)) % 6)
      const x0 = 2 * cx + 1 + way * 9
      for (let i = 0; i < len; i++) {
        const x = x0 + way * i
        c.put(x, Math.max(0, Math.min(7, y0 + 2.5 * Math.sin(x * 0.32 + f * 0.7 + k * 2.1))), 'hot', 2)
      }
    }
  }
}

// The flower in a floor column: the frame it springs up, as the hind hoof
// leaves the cell, or null if none grows there.
function bloomAt(seed: number, col: number): number | null {
  if (noise(seed, 20, col) < 0.12) return null
  return WALK + Math.ceil((2 * col - 25) / 3) + Math.floor(noise(seed, 21, col) * 2)
}

// Each flower is a dot stem on the floor row; a tall one opens its head in the
// cell above. It sprouts, blooms, wilts red, droops and withers.
function blooms(c: Canvas, f: number, seed: number) {
  for (let col = 0; col < 32; col++) {
    const at = bloomAt(seed, col)
    if (at === null || f < at || f >= at + 12) continue
    const a = f - at
    const x = 2 * col + (noise(seed, 22, col) < 0.5 ? 0 : 1)
    const tall = noise(seed, 23, col) < 0.6
    const n = noise(seed, 24, col)
    const flower: Ink = n < 0.65 ? 'spark' : n < 0.85 ? 'cool' : 'hot'
    const stem: Ink = a < 6 ? 'cool' : a < 8 ? c.mix('cool', 'base', 0.5) : 'deep'
    const head: Ink = a < 6 ? flower : a < 8 ? 'hot' : 'deep'
    const dots = (pts: readonly (readonly [number, number])[], ink: Ink) => pts.forEach(([dx, y]) => c.put(x + dx, y, ink, 2))
    if (a >= 10) { dots([[0, 7], [x % 2 ? -1 : 1, 7]], c.mix('deep', 'base', 0.25)); continue }
    if (tall) {
      // The stem grows a dot a frame to its full height, then slumps.
      const top = a >= 8 ? 6 : Math.max(4, 7 - a)
      for (let y = top; y < 8; y++) dots([[0, y]], stem)
      if (a >= 2 && a < 8) dots([[x % 2 ? -1 : 1, 6]], stem) // a leaf
      if (a >= 2 && a < 6) dots([[0, 3], [x % 2 ? -1 : 1, 3], [0, 2], [x % 2 ? -1 : 1, 2], [0, 1]], head)
      else if (a >= 6 && a < 8) dots([[0, 3], [x % 2 ? -1 : 1, 3], [x % 2 ? -1 : 1, 2]], head) // drooping
      else if (a >= 8) dots([[x % 2 ? -1 : 1, 5]], head) // fallen against the stem
    } else {
      // A short flower is one cell: a head on a stub, all in the flower's color.
      if (a < 2) dots([[0, 7], [0, 6 + (a ? -1 : 1)]], 'cool')
      else if (a < 8) dots(([[0, 7], [0, 6], [0, 5], [x % 2 ? -1 : 1, 5], [0, 4], [x % 2 ? -1 : 1, 4]] as const).slice(0, a < 6 ? 6 : 4), head)
      else dots([[0, 7], [x % 2 ? -1 : 1, 7]], head)
    }
  }
}

function spirit(c: Canvas, f: number) {
  const x0 = 26 + 3 * (f - WALK)
  if (x0 <= -13 || x0 >= 64) return
  // A faint aqua aura around it.
  for (let col = (x0 >> 1); col <= (x0 + 12) >> 1; col++) for (const row of [0, 1]) if (col >= 0 && col < 32) c.bg(col, row, c.mix('cool', 'base', 0.75))
  const face = (r: number): Ink => (r < 2 ? 'spark' : r === 2 ? 'hot' : 'cool')
  sprite(c, DEER, x0, 0, face, 5)
  sprite(c, [STRIDE[(f >> 1) % 2]!], x0, 7, () => 'cool', 5)
}

function draw(canvas: Canvas, f: number, seed: number) {
  const c = claiming(canvas)
  const cx = demonAt(seed, f)
  const dir = -sideOf(seed)

  // The forest floor and trunks, then what the demon does to them.
  for (let col = 0; col < 32; col++) {
    for (const row of [0, 1]) {
      let ink: Ink | null = TRUNKS.has(col) ? c.mix('deep', 'base', 0.25) : row === 1 ? c.mix('deep', 'base', 0.5) : null
      // The blight: a red run along the floor from the halted demon to both edges.
      if (row === 1 && f >= CURSE) {
        const stop = stopOf(seed)
        const a = f - CURSE - Math.max(0, Math.abs(col - stop) - 5) / 2
        if (a >= 0) ink = a < 6 ? 'hot' : a < 9 ? c.mix('hot', 'deep', 0.5) : a < 12 ? 'deep' : a < 15 ? c.mix('deep', 'base', 0.25) : ink
      }
      if (cx !== null && inBody(cx, col, row, dir)) ink = c.mix('deep', 'base', 0.5)
      if (cx !== null && f >= CURSE && f < LEAVE && row === 0 && Math.abs(col - Math.round(cx + 2 * dir)) === 1) ink = c.mix('hot', 'base', 0.5)
      if (ink) c.bg(col, row, ink)
    }
  }

  // Pixels that must win their cells, then the figures in dots, then the rest.
  if (cx !== null) demon(c, f, seed, cx)
  else if (f < CHARGE) kodama(c, f, seed)
  if (f >= PEEK) peek(c, f, seed)
  blooms(c, f, seed)
  spirit(c, f)
  // Moss along the floor.
  for (let col = 0; col < 32; col++) if (!TRUNKS.has(col)) c.pix(col, 3, c.mix('cool', 'base', 0.75))
}

export default {
  name: 'kodama',
  title: 'Forest spirit',
  source: 'Princess Mononoke',
  contexts: ['long-wait'],
  rare: false,
  variants: {
    walk: {
      loop: LOOP,
      beats: [
        { at: RATTLE, phrase: 'KODAMA RATTLE' },
        { at: CURSE, phrase: 'TATARIGAMI' },
        { at: WALK, phrase: 'SHISHIGAMI WALKS' },
      ],
    },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
