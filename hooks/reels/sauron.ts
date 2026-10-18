import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// The Eye of Sauron (The Lord of the Rings), the rare reel. A lidless eye of
// fire kindles from a slit under dim aqua stars and turns, searching. An
// ember glints at one edge and the eye snaps to it, finds nothing and turns
// away. Behind it, a star brightens at that edge; the eye snaps all the way
// back across onto it and holds it in its pupil, gazing as into the
// palantir. The eye widens: the pupil opens, the gold iris and red ring
// spread from its edge, the rim flares and the flames roar. The star gutters
// out, the eye narrows and glides back to its search, and sinks to a slit
// for the next loop. The seed picks the star's side and height, the ember's
// height, the sweep's direction, the sky and the flames.
//
// It draws on the canvas it gets (compact): on 32 columns the eye spans
// columns 6 to 25 and the star at column 1 or 30; on 16, columns 2 to 13
// and the star at column 0 or 15, past the flame tongues at the eye's corners.

const LOOP = 108
const TURN = 8 // fully open; the search begins
const LEAD = 28 // the eye snaps to the ember (glints 2 frames ahead)
const BACK = 38 // nothing there: the eye glides back and sways away
const GLINT = 46 // the star brightens
const SNAP = 49 // the eye snaps to the star
const LOCK = 52 // locked on: the star in the pupil
const RING = 64 // the eye widens and blazes
const FLARE = 70 // the rim's flare ends
const FADE = 84 // the star gutters out and the eye narrows
const DRIFT = 88 // the eye glides back to its search
const CLOSE = 100 // the eye sinks to a slit

function draw(c: Canvas, f: number, seed: number) {
  const W = c.cols, big = W === 32
  const mid = W / 2 // the eye's center line, in cell units
  const dotMid = W // the same, in braille dots
  const R = big ? 20 : 12 // the eye's half width in dots
  const T = big ? 6.5 : 3.5 // the pupil's offset when it looks to a side
  const A = big ? 4 : 2.5 // the search sway
  const side = noise(seed, 1) < 0.5 ? -1 : 1 // the star's side, where the ember glints first
  const sweep = noise(seed, 2) < 0.5 ? -1 : 1
  const edge = (s: number) => s > 0 ? W - (big ? 2 : 1) : big ? 1 : 0 // the star or ember column
  const starY = 1 + Math.floor(noise(seed, 3) * 6)
  const emberY = 1 + Math.floor(noise(seed, 4) * 6)

  // The pupil steps toward its target each frame, 1.1 cells at most, 3 in a
  // snap. After each snap it glides back to the center and sways on the same
  // way, so it never turns back over the cells it just crossed.
  const sway = (k: number, from: number, way: number) => mid + way * A * Math.sin((k - from) * 0.22)
  const target = (k: number) =>
    k < TURN ? mid
      : k < LEAD ? sway(k, TURN, sweep)
        : k < BACK ? mid + side * T
          : k < BACK + 6 ? mid
            : k < SNAP ? sway(k, BACK + 6, -side)
              : k < DRIFT ? mid + side * T
                : k < DRIFT + 6 ? mid
                  : sway(k, DRIFT + 6, -side)
  const snapping = (k: number) => (k >= LEAD && k < BACK) || (k >= SNAP && k < DRIFT)
  let cx = mid
  for (let k = 0; k <= f; k++) {
    const cap = snapping(k) ? 3 : 1.1
    cx += Math.max(-cap, Math.min(cap, target(k) - cx))
  }

  const open = f < TURN ? (f + 1) / TURN : f >= CLOSE ? (LOOP - f) / 8 : 1
  const wide = f >= RING && f < FADE
  // While wide the bands are measured from the pupil's edge and the iris
  // grows, so the gold spreads past the opened pupil instead of shrinking.
  const yel = (big ? 3 : 2.5) + (wide ? 2 : 0)
  const red = (big ? 6.5 : 4) + (wide ? 2.5 : 0)
  const p = Math.floor(cx)
  const half = (x: number) => {
    const u = (x - dotMid) / R
    return Math.abs(u) >= 1 ? -1 : 3.6 * open * Math.sqrt(1 - u * u)
  }

  // The night sky: dim aqua stars either side of the eye, twinkling slowly.
  for (let i = 0; i < (big ? 6 : 3); i++) {
    const s = i % 2 ? 1 : -1
    const col = s > 0 ? W - 1 - Math.floor(noise(seed, 10, i) * (big ? 3 : 2)) : Math.floor(noise(seed, 11, i) * (big ? 3 : 2))
    if (noise(seed, 12, i, (f + i * 3) >> 3) < 0.7) c.put(col * 2 + (i & 1), Math.floor(noise(seed, 13, i) * 8), c.mix('cool', 'base', 0.5), 1)
  }

  // The eye: a black slit, a yellow iris, a red ring, a dark red rim.
  for (let col = 0; col < W; col++) {
    const h = half(col * 2 + 1)
    if (h < 0) continue
    const pupil = wide ? Math.abs(col - p) <= 1 : col === p
    if (pupil && h > 0.5) continue
    const d = Math.abs(col + 0.5 - cx) - (wide ? 1 : 0)
    const ink: Ink | null = h > 1.2
      ? d < yel ? 'spark' : d < red ? 'hot' : d < red + 2 ? c.mix('hot', 'deep', 0.5) : 'deep'
      : h > 0.5 ? 'deep' : null
    if (ink) { c.bg(col, 0, ink); c.bg(col, 1, ink) }
  }

  // The rim's outline, flaring yellow as the eye widens.
  const rim: Ink = f >= RING && f < FLARE ? 'spark' : 'hot'
  for (let x = Math.ceil(dotMid - R); x <= dotMid + R; x++) {
    const h = half(x)
    if (h < 0) continue
    c.put(x, Math.round(3.5 - h), rim, 4)
    c.put(x, Math.round(3.5 + h), rim, 4)
  }

  // Flames: licks above and below the body, and tongues streaming off both
  // corners, longer and hotter as the eye widens.
  const heat = Math.min(1, open) * (wide ? 1.5 : 1)
  const flick = f >> 2
  for (let i = 0; i < 10; i++) {
    const x = dotMid - R + noise(seed, flick, i) * 2 * R, h = half(x)
    if (h > 0) c.put(x, noise(seed, flick, i, 1) < 0.5 ? 3.5 - h - 1 : 3.5 + h + 1, noise(seed, flick, i, 2) < 0.4 ? 'spark' : 'hot', 3)
  }
  const reach = (big ? 6 : 3) * heat
  for (const s of [-1, 1]) {
    const tip = dotMid + s * R
    for (let i = 0; i < 4; i++) {
      const len = Math.floor(noise(seed, 20, flick, s, i) * (reach + 1))
      const y0 = 2 + Math.floor(noise(seed, 21, flick, s, i) * 4)
      for (let k = 0; k < len; k++) {
        // Tongues stop short of the star's column, so they never smear the star.
        if (s === side && Math.round(tip + s * (k + 1)) >> 1 === edge(side)) break
        const ink: Ink = k * 3 < len ? 'spark' : k * 3 < len * 2 ? 'hot' : c.mix('hot', 'deep', 0.5)
        c.put(tip + s * (k + 1), y0 - (k >> 1), ink, k * 3 < len ? 3 : 2)
      }
    }
  }

  // The ember: a false lead at the star's edge, gone as the eye arrives.
  if (f >= LEAD - 2 && f < LEAD + 6) c.put(edge(side) * 2 + (side > 0 ? 0 : 1), emberY, f < LEAD - 1 ? c.mix('spark', 'base', 0.5) : 'spark', 9)

  // The star: it glints, brightens, glows once the eye holds it, blazes as
  // the eye widens, and gutters out.
  if (f >= GLINT && f < DRIFT) {
    const col = edge(side), x = col * 2 + (side > 0 ? 0 : 1)
    const lit = f >= GLINT + 2 && f < FADE
    const core: Ink = lit ? 'cool' : c.mix('cool', 'base', 0.5)
    c.put(x, starY, core, 9)
    if (lit) {
      c.put(x + side, starY, core, 9)
      const halo = c.mix('cool', 'base', 0.5)
      if ((f >> 2) & 1) { c.put(x, starY - 1, halo, 8); c.put(x, starY + 1, halo, 8) } else c.put(x - side, starY, halo, 8)
    }
    if (f >= LOCK && f < FADE) c.bg(col, starY >> 2, c.mix('cool', 'base', wide ? 0.5 : 0.75))
    // Its reflection in the pupil.
    if (f >= LOCK && f < FADE) { c.put(p * 2, starY, 'cool', 9); c.put(p * 2 + 1, starY, 'cool', 9) }
  }
}

export default {
  name: 'sauron',
  title: 'Eye of Sauron',
  source: 'The Lord of the Rings',
  contexts: [],
  rare: true,
  compact: true,
  variants: {
    gaze: {
      loop: LOOP,
      beats: [
        { at: TURN, phrase: 'THE EYE TURNS' },
        { at: LOCK, phrase: 'GAZING IN THE PALANTIR' },
        { at: RING, phrase: 'ONE RING TO RULE THEM ALL' },
      ],
    },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
