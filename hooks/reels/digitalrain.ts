import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Digital rain (The Matrix). A block cursor blinks on a black screen. WAKE UP,
// NEO: the code erupts from the cursor and pours down every column, each
// stream led by a lit head glyph with its trail fading behind it, every
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
// blinks again.
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
const KANA = 'ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'

// The rain's clock stops for 2 frames on each knock.
const clock = (f: number) => f - KNOCKS.reduce((n, k) => n + Math.max(0, Math.min(2, f - k + 1)), 0)
const kana = (...n: number[]) => KANA[Math.floor(noise(...n) * KANA.length)]!

type Stream = { s: number; v: number; len: number }

// Column c's streams, by the rain clock: the first leaves the cursor's row at
// the eruption, 2 columns a frame each way, and the last clears by DRAINED.
function streams(seed: number, c: number): Stream[] {
  const v = 0.55 + noise(seed, 1, c) * 0.6 // dots a frame
  const len = 3 + Math.floor(noise(seed, 2, c) * 6) // trail, in dots
  const cross = (8 + len) / v
  const out: Stream[] = []
  for (let s = Math.abs(c - CURSOR) / 2 + (c === CURSOR ? 0 : noise(seed, 6, c) * 8), k = 0; s + cross <= clock(DRAINED); k++) {
    out.push({ s, v, len })
    s += cross * 0.8 + 6 + noise(seed, 3, c, k) * 14
  }
  return out
}

// The Woman in the Red Dress: hair, bodice, skirt, and a swaying or flared hem.
const WOMAN = ['.S.', '.H.', 'HHH', 'HDH']
const STRIDE = ['.S.', '.H.', 'HHH', 'DHD']
const FLARE = ['..S..', '..H..', '.HHH.', 'HDHDH']
// The rabbit facing right, 7 pixels wide: ears, head with a red eye, body, feet.
const SIT = ['....X.X', '....XXE', '.XXXXX.', '..X..X.']
const TWITCH = ['.....XX', '....XXE', '.XXXXX.', '..X..X.']
const RUN = ['....X.X', '...XXXE', 'XXXXXX.', '......X']

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
// columns a frame, then runs back across the whole width. It never bobs: a
// bob would flip its cells between full and half blocks.
function rabbitAt(f: number): { x: number; rows: readonly string[] } | null {
  if (f < RABBIT) return null
  if (f < RABBIT + 8) return { x: 13, rows: (f >> 2) & 1 ? TWITCH : SIT }
  const x = f < BACK ? 13 + 2 * (f - RABBIT - 8) : -7 + 2 * (f - BACK)
  return x > 32 ? null : { x, rows: RUN }
}

function draw(c: Canvas, f: number, seed: number) {
  const W = 32
  const mirror = (face: 1 | -1, x: number, w: number) => (face === 1 ? x : W - x - w)
  const tau = clock(f)
  const pix: Pixel[] = []

  // The cursor, before the eruption.
  if ((f >= 98 && f < 102) || f >= 104) pix.push([CURSOR, 0, 'cool'], [CURSOR, 1, 'cool'])

  // The Woman in the Red Dress.
  const herFace: 1 | -1 = noise(seed, 20) < 0.5 ? 1 : -1
  const wx = womanAt(f)
  let herCenter = -99
  const look = new Set<number>() // her cells once she dissolves: look again
  if (wx !== null) {
    const rows = f >= DRESS ? FLARE : (f >> 1) & 1 ? STRIDE : WOMAN
    const x = mirror(herFace, f >= DRESS ? wx - 1 : wx, rows[0]!.length)
    herCenter = x + (rows[0]!.length >> 1)
    const her = pixels(rows, x, 0, herFace, { S: 'spark', H: 'hot', D: 'deep' })
    if (f < DRESS + 4) pix.push(...her)
    else if (f < GONE) for (const [px, py] of her) if (px >= 0 && px < W) look.add((py >> 1) * W + px)
  }

  // The white rabbit, runs to the seed's side; its eye is red.
  const runFace: 1 | -1 = noise(seed, 21) < 0.5 ? 1 : -1
  const rabbit = rabbitAt(f)
  let rabbitCenter = -99
  if (rabbit) {
    const w = rabbit.rows[0]!.length
    const x = mirror(runFace, rabbit.x, w)
    rabbitCenter = x + (w >> 1)
    pix.push(...pixels(rabbit.rows, x, 0, runFace, { X: 'spark', E: 'hot' }))
  }
  // The rain hushes ahead of where the rabbit comes back in, before it does.
  const comingCenter = f >= BACK - 5 && f < BACK ? mirror(runFace, -7 + 2 * (f - BACK), RUN[0]!.length) + 3 : -99
  // Where the rabbit has been in the last 5 frames: the code lights yellow behind it.
  const trail = new Map<number, number>()
  for (let a = 5; a >= 1; a--) {
    const r = rabbitAt(f - a)
    if (!r || f < RABBIT + 8) continue
    const w = r.rows[0]!.length
    for (const [x, y] of pixels(r.rows, mirror(runFace, r.x, w), 0, runFace, { X: 'spark', E: 'hot' })) if (x >= 0 && x < W) trail.set((y >> 1) * W + x, a)
  }

  const held = new Set<number>() // cells holding pixels: no glyph or dot goes there
  for (const [x, y] of pix) if (x >= 0 && x < W) held.add((y >> 1) * W + x)

  // The rabbit's flare: a burst of yellow code around it.
  const flare = f >= RABBIT && f < RABBIT + 5 ? f - RABBIT : -1
  // The knocks: each a red disc booming out of the center a column a frame
  // each way, a yellow core on the knock, until the code drains.
  const peak = f >= DRESS && f < GONE
  const knock = f < 92 ? KNOCKS.filter(k => f >= k).map(k => f - k).pop() ?? -1 : -1
  // Glitches swarm at her peak and as the code drains; none while the discs boom.
  const p = f >= DRESS - 2 && f < DRESS + 6 ? 0.5 : f >= KNOCKS[0] && f < 92 ? 0 : f >= 92 && f < 100 ? 0.45 : 0.18

  for (let col = 0; col < W; col++) {
    const tail = noise(seed, 4, col) < 0.4 ? 2 + (noise(seed, 5, col) < 0.5 ? 1 : 0) : 0
    const x = col * 2 + (col & 1)
    const state = [9, 9] // per row: 0 head, else trail age in (0, 1], 9 none
    const dots = new Set<number>()
    for (const st of streams(seed, col)) {
      const y = (tau - st.s) * st.v
      if (y < 0 || y - st.len > 8) continue
      const hy = Math.floor(y)
      for (const row of [0, 1]) {
        const bottom = row * 4 + 3
        if (hy >= row * 4 && hy <= bottom) state[row] = 0
        else if (y > bottom && y - bottom <= st.len) state[row] = Math.min(state[row]!, (y - bottom) / st.len)
      }
      for (let i = 1; i <= tail; i++) {
        const dy = hy - i
        if (dy >= 0 && dy < 8 && dy >> 2 !== hy >> 2) dots.add(dy)
      }
    }

    for (const row of [0, 1]) {
      const cell = row * W + col
      if (held.has(cell)) continue
      const d = Math.abs(col - herCenter)
      // The code goes still and red around her, wider at her peak; it holds
      // still around the rabbit too, so each stands out: 10 columns ahead of it
      // while it runs, so no head lights just before it arrives, and 3 behind,
      // where its trail takes over.
      const red = d <= (f < DRESS ? 4 : f < GONE ? 5 : 5 - (f - GONE))
      const age = trail.get(cell)
      const ahead = (col - rabbitCenter) * runFace
      const due = (col - comingCenter) * runFace // ahead of where it comes back in
      const hush = red || age !== undefined || (rabbit !== null && ahead >= -3 && ahead <= (f < RABBIT + 8 ? 6 : 10)) || (due >= 0 && due <= 10)
      const s = hush ? 9 : state[row]!
      // Depth inside the youngest disc holding the cell: 0 on its front.
      const depth = KNOCKS.map(k => f < 92 ? f - k + 0.5 - Math.abs(col - 15.5) : -1).filter(k => k >= 0).pop() ?? -1
      const slot = f + Math.floor(noise(seed, 10, col, row) * 16)
      const glitch = look.has(cell) || (slot % 16 < 2 && !hush && depth < 0 && s > 1 && noise(seed, 11, col, row, slot >> 4) < p)
      let bg: Ink | null = null
      let ink: Ink | null = null
      let ch = kana(seed, 8, col, row, Math.floor((tau + noise(seed, 9, col, row) * 5) / (2 + Math.floor(noise(seed, 7, col, row) * 4))))

      if (s === 0) [bg, ink, ch] = ['cool', 'base', kana(seed, 6, col, row, tau)]
      else if (s <= 0.5) [bg, ink] = [c.mix('cool', 'base', 0.75), 'cool']
      else if (s <= 1) [bg, ink] = [c.mix('cool', 'base', 0.75), c.mix('cool', 'base', 0.5)]
      else if (noise(seed, 12, col, row, tau >> 3) < 0.45) ink = c.mix('cool', 'base', 0.75)
      if (red) [bg, ink] = [c.mix('hot', 'base', peak && d <= 2 ? 0.5 : 0.75), 'hot']
      // The discs leave the code on a red plate while it drains.
      if (!bg && f >= 92 && f < 96) bg = c.mix('hot', 'base', 0.75)

      if (flare >= 0 && Math.abs(col - rabbitCenter) <= 6) {
        bg = flare < 2 ? c.mix('spark', 'base', 0.5) : c.mix('spark', 'base', 0.75)
        ink = 'spark'
      } else if (age !== undefined) {
        if (age <= 2) [bg, ink] = [c.mix('spark', 'base', 0.75), 'spark']
        else ink = c.mix('spark', 'base', age <= 3 ? 0.25 : 0.5)
      }
      if (depth >= 0) {
        bg = knock === 0 && depth === 0 ? 'spark' : depth < 2 ? 'hot' : depth < 4 ? c.mix('hot', 'deep', 0.5) : 'deep'
        ink = depth === 0 && knock > 0 ? 'spark' : depth < 4 ? 'base' : 'hot'
      }
      if (glitch) [bg, ink, ch] = ['deep', 'hot', kana(seed, 13, col, row, f >> 1)]

      if (bg) c.bg(col, row, bg)
      const tailDots = [...dots].filter(dy => dy >> 2 === row)
      if (tailDots.length && !hush && depth < 0 && s !== 0 && !glitch && age === undefined && flare < 0) {
        tailDots.forEach(dy => c.put(x, dy, dy === Math.max(...tailDots) ? c.mix('cool', 'base', 0.25) : c.mix('cool', 'base', 0.5), 2))
      } else if (ink) c.glyph(col, row, ch, ink)
    }
  }

  for (const [x, y, ink] of pix) c.pix(x, y, ink)
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
