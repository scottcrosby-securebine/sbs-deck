import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Vortex (Doctor Who). One variant, vortex, 120 frames, played on long waits.
//
// The time vortex irises open from the center: a spiral tunnel of red,
// yellow, aqua, dark red and dim aqua bands turning about 0.05 radians a
// frame. WIBBLY WOBBLY TIMEY WIMEY lands as the tunnel is fully open. The
// TARDIS appears in the tunnel's dark heart, a speck with its lamp, and
// tumbles nearer, its lamp wheeling round the box, until the vortex closes in
// on it and it is gone.
//
// A night street: a dark red sky over black rooftops whose windows light one
// by one. VWORP VWORP: the TARDIS materialises, pulsing in and out and
// brighter with each pulse, its lamp flashing with the pulses, until it
// stands solid. Its lamp blinks; the door swings open and yellow light spills
// out across the street.
//
// Close on the sonic screwdriver against the TARDIS's dark blue doors: its
// head extends and the emitter warms up. ALLONS-Y: the emitter blazes and
// sonic waves ripple out from the tip, a ring every 6 frames. Back on the
// street the TARDIS dematerialises, pulsing out, and the vortex opens again on
// the next loop.
//
// The seed picks the vortex (which way it turns, two or three arms, its
// handedness and the order of its bands), which way the TARDIS tumbles, where
// it lands, the rooftops and their windows, and the colors of the sonic waves.

const LOOP = 120
const OPEN = 11 // WIBBLY WOBBLY TIMEY WIMEY: the iris is fully open
const SPECK = 14 // the TARDIS appears far down the tunnel
const NEAR = 24 // it is nearer: a box with its lamp
const CLOSE = 36 // the vortex closes in, 8 frames
const VWORP = 44 // VWORP VWORP: the TARDIS materialises on the street
const DOOR = 66 // the door opens
const SONIC = 76 // close on the sonic screwdriver
const ALLONS = 84 // ALLONS-Y: the sonic fires
const DEMAT = 102 // back on the street: the TARDIS dematerialises
const SPIN = 0.05 // radians a frame

// Materialisation levels per frame, 0 gone to 4 solid: pulses in, each brighter.
const PULSES = [1, 1, 2, 2, 2, 1, 1, 3, 3, 3, 2, 2, 4, 4, 4, 3, 3, 4]
// And out to nothing, from DEMAT to the loop's end.
const DEPULSES = [4, 4, 4, 3, 3, 4, 4, 2, 2, 3, 3, 1, 1, 2, 2, 1, 1, 0]

// The iris: cells in order of distance from the center, 4 a frame across the
// 16-column crop's 32 cells, then 8 a frame, so the band turning and the iris
// together never light more than 8 cells in the crop or 16 in all.
const IRIS = [...Array(64).keys()]
  .map(i => ({ col: i % 32, row: i >> 5, d: Math.hypot(i % 32 - 15.5, ((i >> 5) - 0.5) * 4.4) }))
  .sort((a, b) => a.d - b.d || a.col - b.col || a.row - b.row)
const RANK = new Map(IRIS.map(({ col, row }, k) => [col * 2 + row, k]))

// The road: dim enough that no cell rises 0.10 as a scene cuts in from black.
const road = (c: Canvas) => c.mix('deep', 'base', 0.5)

function vortex(c: Canvas, f: number, seed: number) {
  const dir = noise(seed, 1) < 0.5 ? 1 : -1
  const arms = noise(seed, 2) < 0.5 ? 2 : 3
  const hand = noise(seed, 3) < 0.5 ? 1 : -1
  const shift = Math.floor(noise(seed, 4) * 5)
  // Red to yellow to aqua, then dark: one bright rise per band cycle.
  const bands: Ink[] = ['hot', 'spark', 'cool', 'deep', c.mix('cool', 'base', 0.5)]
  const twist = hand * 1.5
  // The iris opens over frames 0 to 10 and closes over CLOSE to CLOSE + 7.
  const shown = f < 8 ? (f + 1) * 4 : f < OPEN ? 32 + (f - 7) * 8 : f >= CLOSE ? (CLOSE + 7 - f) * 8 : 64
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 4; y++) {
      if (RANK.get(x * 2 + (y >> 1))! >= shown) continue
      const dx = x - 15.5, dy = (y - 1.5) * 2.2, r = Math.hypot(dx, dy)
      const v = (arms * (Math.atan2(dy, dx) - dir * SPIN * f)) / (2 * Math.PI) + Math.log(r + 1) * twist
      c.pix(x, y, bands[(Math.floor((((v % 1) + 1) % 1) * 5) + shift) % 5]!)
    }
  }
  if (f < SPECK || f >= CLOSE + 6) return
  // The TARDIS: a speck, then a 3 x 2 box, its lamp wheeling round it as it
  // tumbles, in the dark heart of the tunnel so it reads against the bands.
  const near = f >= NEAR
  for (let x = near ? 13 : 14; x <= (near ? 19 : 18); x++) for (let y = 0; y < 4; y++) c.pix(x, y, 'base')
  const body: [number, number][] = near ? [[15, 1], [16, 1], [17, 1], [15, 2], [16, 2], [17, 2]] : [[16, 1], [16, 2]]
  const lamps: [number, number][] = near ? [[16, 0], [18, 1], [16, 3], [14, 2]] : [[16, 0], [17, 1], [16, 3], [15, 2]]
  const turn = noise(seed, 5) < 0.5 ? 1 : 3
  const lamp = lamps[(Math.floor((f - SPECK) / 3) * turn) % 4]!
  for (const [x, y] of body) c.pix(x, y, 'cool')
  c.pix(lamp[0], lamp[1], 'spark')
}

// The TARDIS on the street at columns x to x + 3, each row at its level, 0
// (gone) to 4 (solid). The bottom row steps a frame after the top, so no frame
// lights more than 4 of its cells.
function tardis(c: Canvas, x: number, levels: readonly [number, number], lit: boolean, open: boolean) {
  levels.forEach((level, row) => {
    if (level === 0) return
    const body: Ink = level === 4 ? 'cool' : c.mix('cool', 'base', ([0.75, 0.5, 0.25] as const)[level - 1]!)
    for (let col = x; col < x + 4; col++) c.bg(col, row, body)
    // Black panel lines: the sign and window bar on top; the door seam and the
    // panels below.
    for (let dx = 0; dx < 8; dx++) {
      const X = 2 * x + dx
      const center = dx === 3 || dx === 4
      if (row === 0) {
        c.put(X, 1, lit && center ? 'spark' : 'base', 2)
        c.put(X, 3, lit && center ? 'spark' : 'base', 2)
      } else if (dx % 2 === 0) c.put(X, 6, 'base', 2)
    }
    if (row === 1) for (let y = 4; y < 8; y++) c.put(2 * x + 3, y, 'base', 2)
  })
  if (levels[0] === 0) return
  if (lit) { c.put(2 * x + 3, 0, 'spark', 5); c.put(2 * x + 4, 0, 'spark', 5) }
  if (open) {
    // The right door swings open: yellow light inside and across the street.
    c.bg(x + 2, 1, 'spark'); c.bg(x + 3, 1, 'spark')
    c.bg(x + 4, 1, c.mix('spark', 'base', 0.5)); c.bg(x + 5, 1, c.mix('spark', 'base', 0.75))
  }
}

// A night street: a dark red sky over black rooftops whose windows light one
// by one, a dark road. The sky brightens over 3 frames as the scene cuts in.
function street(c: Canvas, f: number, seed: number) {
  const s = f - (f < DEMAT ? VWORP : DEMAT)
  const glow: Ink = s < 2 ? c.mix('deep', 'base', s ? 0.25 : 0.5) : 'deep'
  for (let col = 0; col < 32; col++) { c.bg(col, 0, glow); c.bg(col, 1, road(c)) }
  const x = 12 + Math.floor(noise(seed, 6) * 5)
  const windows: Ink[] = ['spark', 'cool', 'hot']
  for (let col = 0; col < 32; col++) {
    if (col >= x - 1 && col <= x + 5) continue
    const tall = noise(seed, 20, col) < 0.4
    if (tall) c.pix(col, 0, 'base')
    c.pix(col, 1, 'base')
    if (noise(seed, 21, col) < 0.45 && s >= 2 + Math.floor(noise(seed, 23, col) * 18)) {
      c.pix(col, tall && noise(seed, 24, col) < 0.5 ? 0 : 1, windows[Math.floor(noise(seed, 22, col) * 3)]!)
    }
  }
  if (f < DEMAT) {
    const p = f - VWORP
    const level = (q: number) => q < 0 ? 0 : q < PULSES.length ? PULSES[q]! : 4
    const pulsing = p < PULSES.length
    tardis(c, x, [level(p), level(p - 1)], pulsing ? level(p) >= 3 : (p >> 2) % 2 === 0, f >= DOOR)
  } else {
    const p = f - DEMAT
    const level = (q: number) => DEPULSES[Math.max(0, Math.min(q, DEPULSES.length - 1))]!
    tardis(c, x, [level(p), level(p - 1)], level(p) >= 3, false)
  }
}

function sonic(c: Canvas, f: number, seed: number) {
  // Against the TARDIS's dark blue doors.
  for (let col = 0; col < 32; col++) for (let row = 0; row < 2; row++) c.bg(col, row, c.mix('cool', 'base', 0.75))
  const used = new Set<number>()
  const px = (x: number, y: number, ink: Ink) => { c.pix(x, y, ink); used.add(x * 2 + (y >> 1)) }
  // The handle: a dark red pommel, a red and dark red grip, a yellow collar,
  // a steel neck that extends, and the emitter.
  const emitter = Math.min(15, 12 + ((f - SONIC) >> 1))
  px(3, 1, 'deep'); px(3, 2, 'deep')
  for (let x = 4; x <= 9; x++) { px(x, 1, x % 2 ? 'hot' : c.mix('hot', 'deep', 0.5)); px(x, 2, 'deep') }
  px(10, 1, 'spark'); px(10, 2, 'spark')
  for (let x = 11; x < emitter; x++) { px(x, 1, c.mix('cool', 'base', 0.5)); px(x, 2, c.mix('cool', 'base', 0.75)) }
  const s = f - ALLONS
  const blaze = s >= 0 && s % 6 < 2
  const glow: Ink = f < ALLONS ? c.mix('cool', 'base', ([0.75, 0.5, 0.25, 0.25] as const)[(f - SONIC) >> 1]!) : blaze ? 'spark' : 'cool'
  px(emitter, 1, glow); px(emitter, 2, glow)
  if (s < 0) return
  // Sonic waves: a ring every 6 frames, a bright lead and a red echo.
  const first: Ink = noise(seed, 7) < 0.5 ? 'spark' : 'cool'
  const second: Ink = first === 'spark' ? 'cool' : 'spark'
  const cx = 2 * emitter + 1.5, cy = 3.5
  for (let k = 0; k * 6 <= s; k++) {
    const rad = (s - k * 6) * 2.6 + 1
    if (rad > 40) continue
    const lead = k % 2 ? second : first
    for (const [r, ink] of [[rad, lead], [rad - 1, lead], [rad - 3, 'hot']] as [number, Ink][]) {
      if (r <= 0) continue
      for (let a = -40; a <= 40; a++) {
        const X = Math.round(cx + r * Math.cos((a / 80) * Math.PI)), Y = Math.round(cy + r * Math.sin((a / 80) * Math.PI))
        if (X < 0 || X > 63 || Y < 0 || Y > 7 || used.has((X >> 1) * 2 + (Y >> 2))) continue
        c.put(X, Y, ink, ink === 'hot' ? 1 : 3)
      }
    }
  }
}

function draw(c: Canvas, f: number, seed: number) {
  if (f < VWORP) vortex(c, f, seed)
  else if (f >= SONIC && f < DEMAT) sonic(c, f, seed)
  else street(c, f, seed)
}

export default {
  name: 'vortex',
  title: 'Vortex',
  source: 'Doctor Who',
  contexts: ['long-wait'],
  rare: false,
  variants: {
    vortex: {
      loop: LOOP,
      beats: [
        { at: OPEN, phrase: 'WIBBLY WOBBLY TIMEY WIMEY' },
        { at: VWORP, phrase: 'VWORP VWORP' },
        { at: ALLONS, phrase: 'ALLONS-Y' },
      ],
    },
  },
  draw,
} satisfies Reel
