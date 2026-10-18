import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Jupiter 2 (Lost in Space). One variant, course, 64 frames, played for web
// fetches.
//
// Deep space, a starfield streaming past in three layers. The saucer drops
// out of warp at one edge trailing an aqua streak and brakes into the center:
// a yellow-lit dome, an aqua hull, an aqua rim of yellow running lights with
// one dark light running round them, a dark red underside with a red reactor
// core. JUPITER 2 ON COURSE: at the center the engines flare, the core blazes
// yellow, a yellow, red and dark red plume roars out behind the rim and the
// near stars stretch into streaks. It holds the center, then pulls away and
// is gone.
//
// A red planet surface with dark craters wipes in behind it, and the Robot
// appears on it from the middle out: a glass bubble head with brain lights
// flickering yellow and red, broad aqua shoulders, a chest of chasing lights,
// dark aqua treads. His yellow accordion arms unfold and he flails them,
// each swinging between hanging down and overhead, aqua claws at the tips.
// The planet wipes away into the stars.
//
// The seed picks the stars (place, ink, the near and mid layers' rows),
// which way the saucer flies, how far it drifts while it holds and how hard
// it accelerates away, the craters, and the Robot's timing: when he starts
// waving, his tempo and how far apart his arms swing.

const LOOP = 64
const FLARE = 15 // JUPITER 2 ON COURSE: the engines flare at the center
const BOOST = 26 // the saucer pulls away
const SCENE = 30 // the planet wipes in behind it, 4 columns a frame
const ROBOT = 36 // the Robot appears from the middle out, a column each side a frame
const ARMS = 39 // his arms appear, hanging, before he starts to wave
const CLEAR = 58 // the planet wipes out, 6 columns a frame
const WIPE = 4
const OUT = 6

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// The saucer's center column flying left to right: it brakes in from off the
// edge, holds the center (drifting by `drift` a frame), then accelerates away.
function shipX(t: number, drift: number, acc: number) {
  if (t < FLARE) return 15.5 - 18.5 * (1 - t / FLARE) ** 1.2
  if (t < BOOST) return 15.5 + drift * (t - FLARE)
  const s = t - BOOST
  return 15.5 + drift * (BOOST - FLARE) + 0.25 * s + acc * s * s
}

// The saucer, pixel rows from its top: dome, hull, rim, underside.
const SPANS = [1, 5, 7, 4] as const
const LIGHTS = [-6, -3, 0, 3, 6]

function draw(c: Canvas, t: number, seed: number) {
  const d = noise(seed, 1) < 0.5 ? 1 : -1 // flight direction
  const used = new Set<number>() // cells holding pixels: no braille dots there
  const px = (x: number, y: number, ink: Ink) => {
    const X = Math.round(x)
    if (X < 0 || X > 31 || y < 0 || y > 3) return
    c.pix(X, y, ink)
    used.add(X * 2 + (y >> 1))
  }
  const blocked = new Set<number>() // cells dots skip besides pixel cells
  const dot = (x: number, y: number, ink: Ink, p = 1) => {
    const X = Math.round(x), Y = Math.round(y)
    if (X < 0 || X > 63 || Y < 0 || Y > 7) return
    const key = (X >> 1) * 2 + (Y >> 2)
    if (used.has(key) || blocked.has(key)) return
    c.put(X, Y, ink, p)
  }
  const mirror = (x: number) => (d > 0 ? x : 31 - x)

  // The planet scene covers a column once the wipe-in front has passed it and
  // the wipe-out front has not; both come in from the side the saucer entered.
  const covered = (col: number) => {
    const from = d > 0 ? col : 31 - col
    return from < (t - SCENE + 1) * WIPE && from >= (t - CLEAR + 1) * OUT
  }

  // The saucer.
  const drift = [0, 0.125, 0.25][Math.floor(noise(seed, 2) * 3)]!
  const acc = 0.1 + 0.02 * Math.floor(noise(seed, 3) * 4)
  const X = Math.round(mirror(shipX(t, drift, acc)))
  // The Robot stands in front of it once he appears.
  const sky = (x: number, y: number, ink: Ink) => { if (t < ROBOT || Math.round(x) < 8 || Math.round(x) > 23) px(x, y, ink) }
  const flaring = t >= FLARE
  if (X > -30 && X < 62) {
    // Behind the rim: the warp streak while it brakes in, a glow while it
    // holds, then the plume.
    if (t < 6) {
      const len = Math.round(2 * 18.5 * 1.2 / FLARE * (1 - t / FLARE) ** 0.2) + 2
      for (let k = 1; k <= len; k++) {
        sky(X - d * (7 + k), 2, k <= len / 3 ? 'cool' : c.mix('cool', 'base', k <= (2 * len) / 3 ? 0.5 : 0.75))
      }
    } else if (flaring) {
      // It dims away from the rim in both rows, so no cell brightens as it
      // trails past.
      const len = Math.min(12, 6 + 2 * (t - FLARE))
      for (let k = 1; k <= len; k++) {
        sky(X - d * (7 + k), 2, k <= 2 ? 'spark' : k <= 6 ? 'hot' : 'deep')
        if (k <= len - 3) sky(X - d * (7 + k), 3, k <= 2 ? 'deep' : k <= 6 ? 'hot' : 'deep')
      }
    } else {
      sky(X - d * 8, 2, 'hot')
    }
    SPANS.forEach((span, row) => {
      for (let dx = -span; dx <= span; dx++) {
        let ink: Ink = (['spark', 'cool', 'cool', 'deep'] as const)[row]!
        // Yellow rim lights, one dark at a time running round them.
        if (row === 2 && LIGHTS.includes(dx)) ink = LIGHTS.indexOf(dx * d) === (t >> 1) % 5 ? 'cool' : 'spark'
        // The reactor core: red, blazing yellow while it holds the center.
        const core = flaring && t < BOOST
        if (row === 3 && Math.abs(dx) <= 1) ink = core ? 'spark' : 'hot'
        if (row === 3 && core && Math.abs(dx) <= 3 && Math.abs(dx) > 1) ink = 'hot'
        sky(X + dx, row, ink)
      }
    })
  }

  // The planet surface: red ground with dark craters along the bottom row.
  for (let col = 0; col < 32; col++) {
    if (!covered(col)) continue
    const n = noise(seed, 30, col)
    c.bg(col, 1, n < 0.12 ? 'deep' : n < 0.3 ? c.mix('hot', 'deep', 0.5) : 'hot')
    blocked.add(col * 2 + 1)
  }

  // The Robot, at columns 13 to 18, until the planet wipes out under him: a
  // glass bubble head with brain lights flickering yellow and red, broad aqua
  // shoulders, a chest of chasing lights, dark aqua treads.
  const brain = Math.floor(t / 3) % 2
  const chest: Ink[] = ['hot', 'spark', 'cool']
  for (let col = 13; col <= 18; col++) {
    if (!covered(col) || t < ROBOT + Math.abs(col - 15.5) - 0.5) continue
    const inner = col >= 14 && col <= 17
    if (inner) px(col, 0, col === 14 || col === 17 ? c.mix('cool', 'base', 0.5) : (col - 15 === brain ? 'spark' : 'hot'))
    px(col, 1, 'cool')
    if (inner) px(col, 2, chest[(col + ((t + 2) >> 2)) % 3]!)
    px(col, 3, c.mix('cool', 'base', 0.5))
  }

  // His yellow accordion arms flail from the shoulders, each swinging
  // between down and overhead; the seed sets when he starts, his tempo and how
  // far apart the two arms swing.
  const start = ARMS + 1 + Math.floor(noise(seed, 40) * 5)
  const period = [12, 14, 16][Math.floor(noise(seed, 41) * 3)]!
  // The arms swing a quarter period apart, give or take, so they never cross
  // the middle on the same frame.
  const offset = (noise(seed, 42) < 0.5 ? 0.2 : 0.7) + 0.1 * noise(seed, 43)
  const swing = (k: number) => t < start ? -1 : -Math.cos(2 * Math.PI * ((t - start) / period + k * offset))
  // They unfold from the shoulders, three dots a frame.
  const reach = Math.min(9, (t - ARMS + 1) * 3)
  const arm = (sx: number, dir: number, lift: number) => {
    for (let i = 0; i <= reach; i++) {
      const x = sx + dir * i, y = clamp(3 - lift * i * 0.45, 0, 7)
      if (!covered(x >> 1)) continue
      const dys = i < 9 ? [0, 1] : [-1, 1]
      for (const dy of dys) {
        const yy = clamp(y + dy, 0, 7)
        c.put(x, yy, i < 9 ? 'spark' : 'cool', i < 9 ? 5 : 6)
        blocked.add((x >> 1) * 2 + (Math.round(yy) >> 2))
      }
    }
  }
  if (t >= ARMS && covered(12)) arm(25, -1, swing(0))
  if (t >= ARMS && covered(19)) arm(38, 1, swing(1))

  // The starfield streams against the flight, three times as fast and in
  // streaks while the engines flare.
  const warp = clamp(t - FLARE, 0, 14)
  const travel = t + 2 * warp
  const streak = t >= FLARE && t < FLARE + 14 ? Math.min(1, (t - FLARE + 1) / 3) : 0
  // Bright stars drift in the far layer, spread out along it and never
  // faster; the nearer layers are dim and streak, so no cell flashes as they
  // stream through.
  for (let i = 0; i < 19; i++) {
    const layer = i < 5 ? 0 : i < 13 ? 1 : 2
    const v = [0.5, 1, 2][layer]!
    const y = Math.floor(noise(seed, 10, i) * 8)
    const x0 = layer ? noise(seed, 12, i) * 64 : i * 13 + noise(seed, 12, i) * 5
    const x = (((x0 - d * v * (layer ? travel : t)) % 64) + 64) % 64
    const bright = noise(seed, 13, i) < 0.5
    const ink: Ink = layer === 0 ? (bright ? 'spark' : 'cool') : c.mix(bright ? 'spark' : 'cool', 'base', 0.5)
    const tail = layer ? Math.round(v * 3 * streak) + layer - 1 : 0
    for (let k = 0; k <= tail; k++) dot(x + d * k, y, k ? c.mix('cool', 'base', 0.5) : ink, k ? 1 : layer ? 2 : 3)
  }
}

export default {
  name: 'jupiter2',
  title: 'Jupiter 2',
  source: 'Lost in Space',
  contexts: ['web'],
  rare: false,
  variants: {
    course: { loop: LOOP, beats: [{ at: FLARE, phrase: 'JUPITER 2 ON COURSE' }] },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
