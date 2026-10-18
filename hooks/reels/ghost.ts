import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Ghost line (Ghost in the Shell). Three variants, 48 frames each, one
// catchphrase each. Every variant opens and closes on a dark frame (every cell
// under 0.10 luminance in both themes), so any variant can follow any other.
//
// camo: a night skyline of dark red towers with lit windows. The Major stands
// on a roof ledge in yellow and lets her coat fall. THERMOPTIC CAMO: the camo
// wipes down her body top to bottom behind a yellow scan line, leaving a
// see-through aqua outline that shimmers. She tips back off the roof and drops;
// the city streams up past her as she falls, her outline breaks up and is gone,
// and the lights go out at street level.
//
// net-dive: a dark field of hex digits. A diver drops into the center.
// DIVE // SECTION 9: the splash, two yellow wavefronts racing out to the edges
// rewriting every digit they cross. Their aqua echoes run back and meet in the
// middle, then a red sweep crosses from one side. Digits change only at a front.
//
// lattice: the net grows out of one node at the center, an aqua diamond lattice
// over a dark red harlequin, its crossings lighting aqua as it reaches them.
// THE NET IS VAST AND INFINITE: every crossing blazes yellow at once. Then the
// lattice flows outward from the center without end while yellow packets race
// along its links, each lighting the cell it crosses, and it dims to dark.
//
// The seed picks the skyline, windows, where she stands and where the coat
// falls; the digits and the sweep's side; the packets' routes and times.

const LOOP = 48

// camo
const WIPE = 12 // the camo wipe starts: THERMOPTIC CAMO
const TIP = 20 // she tips off the ledge
const FALL = 22 // the camera follows her down: the city streams up a pixel a frame
const FADE = [30, 40] as const // her outline breaks up and is gone
const DARK = 46 // the street: the lights are out

// net-dive
const SPLASH = 8 // DIVE // SECTION 9
const ECHO = 16 // the echoes start back from the edges
const SWEEP = 26 // the red sweep starts

// lattice
const BLAZE = 12 // THE NET IS VAST AND INFINITE
const FLOW = 18 // the lattice starts to flow outward

const HEX = '0123456789ABCDEF'

// The Major, 6 dots wide and 7 tall: standing, then spread as she falls.
const STAND = ['..XX..', '..XX..', '.XXXX.', 'X.XX.X', '..XX..', '.X..X.', '.X..X.']
const SPREAD = ['X.XX.X', '.XXXX.', '..XX..', '..XX..', '.X..X.', 'X....X', '......']

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function camo(c: Canvas, f: number, seed: number) {
  const dim = (s: 'deep' | 'hot') => c.mix(s, 'base', s === 'deep' ? 0.25 : 0.5)
  const dark = f === 0 || f >= DARK
  const s = clamp(f - FALL + 1, 0, DARK - FALL) // camera drop in pixels
  const x0 = 28 + 2 * Math.floor(noise(seed, 1) * 3) // her left dot column
  const hc = x0 >> 1
  const inZone = (col: number) => col >= hc - 2 && col <= hc + 4

  // The skyline: towers 4 columns wide, some gaps, roofs at world pixel 1 to 3;
  // her tower's roof is just under the frame (world pixel 4).
  const off = Math.floor(noise(seed, 2) * 4)
  const tower = (col: number) => {
    if (col >= hc - 1 && col <= hc + 3) return { roof: 4, id: -1 }
    const id = Math.floor((col + off) / 4)
    if ((col + off) % 4 === 3 && noise(seed, 3, id) < 0.6) return null
    return { roof: 1 + Math.floor(noise(seed, 4, id) * 3), id }
  }
  // A lit window at world pixel y of column col, or null.
  const windowAt = (col: number, y: number, roof: number): Ink | null => {
    const ph = Math.floor(noise(seed, 5, col) * 5)
    if (y <= roof || (y + ph) % 5 !== 0 || noise(seed, 6, col, y) < 0.3) return null
    if (dark) return null
    if (s === 0 && f < 1 + Math.floor(noise(seed, 7, col, y) * 10)) return null // the lights come on
    if (inZone(col)) return 'hot'
    const n = noise(seed, 8, col, y)
    return n < 0.3 ? 'spark' : n < 0.55 ? 'cool' : 'hot'
  }
  // A world pixel's ink: facade, roof rim (dim), window, or sky.
  const world = (col: number, y: number): Ink | null => {
    const t = tower(col)
    if (!t || y < t.roof) return null
    if (dark || y === t.roof) return dim('deep')
    return windowAt(col, y, t.roof) ?? 'deep'
  }

  for (let col = 0; col < 32; col++) {
    if (inZone(col)) {
      // Plates, so her dots can sit over the city: a cell takes its brighter pixel.
      for (let r = 0; r < 2; r++) {
        const top = world(col, s + 2 * r), bottom = world(col, s + 2 * r + 1)
        const ink = top === 'hot' || bottom === 'hot' ? 'hot' : bottom ?? top
        if (ink) c.bg(col, r, ink)
      }
    } else {
      for (let y = 0; y < 4; y++) {
        const ink = world(col, s + y)
        if (ink) c.pix(col, y, ink)
      }
    }
  }

  // The roof ledge she stands on, a hot rail at dot row 7, scrolling up with the city.
  const ledge = 7 - 2 * s
  if (ledge >= 0 && !dark) for (let x = (hc - 1) * 2; x < (hc + 4) * 2; x++) c.put(x, ledge, f < 2 ? dim('hot') : 'hot', 1)

  // The Major.
  const gone = f >= FADE[1] || dark
  if (!gone) {
    const pose = f < TIP ? STAND : SPREAD
    const tilt = f >= TIP && f < FALL ? 1 : 0
    const front = f - WIPE // the camo front's dot row; above it she is camo
    const fade = clamp((f - FADE[0]) / (FADE[1] - FADE[0]), 0, 1)
    pose.forEach((line, y) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== 'X') continue
        const x = x0 + i + (y < 4 ? tilt : 0)
        if (y < front) {
          // Camo: an aqua outline that shimmers, each dot flipping within its cell.
          if (noise(seed, 9, i, y) < fade) continue
          const flip = ((f >> 1) + y + i) % 3 === 0 ? 1 : 0
          c.put(x ^ flip, y, 'cool', 2)
        } else {
          c.put(x, y, f < 2 ? 'hot' : 'spark', 3)
        }
      }
    })
    // The scan line at the front, wider than she is.
    if (front >= 0 && front < 8) {
      for (let x = x0 - 3; x < x0 + 9; x++) c.put(x, front, 'spark', 4)
      for (let col = hc - 1; col <= hc + 3; col++) c.bg(col, front >> 2, c.mix('cool', 'base', 0.5))
    }
    // The coat falls away to the seed's side, frames 5 to 11.
    if (f >= 5 && f < 12) {
      const side = noise(seed, 10) < 0.5 ? -1 : 1
      const cx = x0 + 2 + side * (3 + ((f - 5) >> 1)), cy = 2 + (f - 5)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] as const) if (cy + dy < 8) c.put(cx + dx, cy + dy, 'hot', 3)
    }
  }
}

function netDive(c: Canvas, f: number, seed: number) {
  const plate = c.mix('deep', 'base', 0.5)
  const center = 15 + Math.floor(noise(seed, 1) * 2)
  const sweepDir = noise(seed, 2) < 0.5 ? 1 : -1
  type Wave = { t0: number; origin: number; dir: 1 | -1; scheme: 0 | 1 | 2 }
  const waves: Wave[] = [
    { t0: SPLASH, origin: center + 0.5, dir: 1, scheme: 0 },
    { t0: SPLASH, origin: center - 0.5, dir: -1, scheme: 0 },
    { t0: ECHO, origin: -0.5, dir: 1, scheme: 1 },
    { t0: ECHO, origin: 31.5, dir: -1, scheme: 1 },
    { t0: SWEEP, origin: sweepDir === 1 ? -0.5 : 31.5, dir: sweepDir, scheme: 2 },
  ]
  // Echo fronts stop where they meet.
  const reach = (w: Wave) => (w.scheme === 1 ? 16 : 40)
  const SCHEMES: [Ink, Ink][][] = [
    [['spark', 'base'], ['hot', 'spark'], ['deep', 'cool']],
    [['cool', 'base'], [c.mix('cool', 'base', 0.25), 'base'], ['deep', 'cool']],
    [['hot', 'spark'], [c.mix('hot', 'deep', 0.5), 'hot'], [plate, 'hot']],
  ]
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 32; col++) {
      let gen = 0
      let look: [Ink, Ink] = [plate, c.mix('cool', 'base', 0.5)]
      waves.forEach((w, k) => {
        if (f < w.t0) return
        const p = w.origin + w.dir * 2 * (f - w.t0 + 1) // the front, 2 columns a frame
        const behind = w.dir * (p - (col + w.dir * r * 0.5)) // the front slants a half column
        const travelled = w.dir * (col - w.origin)
        if (behind < 0 || travelled > reach(w) || travelled < 0) return
        gen = k + 1
        const stage = behind < 2 ? 0 : behind < 4 ? 1 : behind < 8 ? 2 : -1
        if (stage >= 0) look = SCHEMES[w.scheme]![stage]!
      })
      c.bg(col, r, look[0])
      // The diver drops into the center, frames 2 to 7; its cells hold dots, not digits.
      const diving = f >= 2 && f < SPLASH && (col === center || col === center + 1)
      if (!diving) c.glyph(col, r, HEX[Math.floor(noise(seed, 3, col, r, gen) * 16)]!, look[1])
    }
  }
  if (f >= 2 && f < SPLASH) {
    const y = (f - 2) * 1.5
    const x = center * 2 + 1
    // Head first: hands and head in yellow, a body and an aqua wake above.
    const diver = [[0, 0, 'spark'], [1, 0, 'spark'], [-1, -1, 'spark'], [2, -1, 'spark'], [0, -1, 'spark'], [1, -1, 'spark'], [0, -2, 'cool'], [1, -2, 'cool'], [0, -3, 'cool'], [1, -4, 'cool']] as const
    for (const [dx, dy, ink] of diver) if ((x + dx) >> 1 === center || (x + dx) >> 1 === center + 1) c.put(x + dx, y + dy, ink, 2)
  }
}

function lattice(c: Canvas, f: number, seed: number) {
  const tri = (u: number) => Math.min(7, Math.abs((((u % 16) + 16) % 16) - 8))
  const flow = Math.max(0, f - FLOW) // dots the lattice has flowed outward
  const reach = f < BLAZE ? 3 * f + 1 : 99
  const linkInk: Ink = f >= 44 || f === 0 ? c.mix('cool', 'base', 0.5) : f >= 40 ? c.mix('cool', 'base', 0.25) : 'cool'

  // Packets: the seed picks when each leaves the center, its side and its line.
  const packets = [0, 1, 2, 3, 4, 5].map(k => ({
    t0: 16 + k * 3 + Math.floor(noise(seed, 1, k) * 2),
    side: (k + Math.floor(noise(seed, 2) * 2)) % 2 ? -1 : 1, // alternate sides
    line: noise(seed, 3, k) < 0.5 ? 0 : 1,
  }))
  const packetAt = (k: number) => {
    const p = packets[k]!
    return f >= p.t0 && f < p.t0 + 12 ? 3 * (f - p.t0) : -1 // its u, 3 dots a frame
  }

  // The plates, a harlequin keyed to the lattice: the diamonds centered on the
  // top apexes dark red, the others darker, the crossings dim red. Every plate
  // is within 0.10 luminance of the others, so the flow costs no flashes.
  for (let col = 0; col < 32; col++) {
    const x = col * 2
    const u = x >= 32 ? x - 32 : 30 - x
    if (u >= reach) continue
    const k = (((u - flow) % 16) + 16) % 16
    const kind = (k >= 3 && k <= 5) || (k >= 11 && k <= 13) ? 2 : k >= 6 && k <= 10 ? 1 : 0
    let ink: Ink = kind === 2 ? c.mix('hot', 'base', 0.5) : kind === 1 ? 'deep' : c.mix('deep', 'base', 0.5)
    if (f < BLAZE) {
      const age = f - Math.floor(u / 3) // frames since the growth reached it
      if (kind === 2) ink = age <= 0 ? 'cool' : age === 1 ? c.mix('cool', 'base', 0.25) : age === 2 ? c.mix('cool', 'base', 0.5) : ink
    } else if (f < BLAZE + 2) ink = kind === 2 ? 'spark' : kind === 1 ? 'hot' : 'deep'
    else if (f < BLAZE + 5) ink = kind === 2 ? 'hot' : kind === 1 ? c.mix('hot', 'deep', 0.5) : ink
    if (f === 0) ink = c.mix('deep', 'base', 0.5)
    if (f >= 44 && kind === 1) ink = c.mix('deep', 'base', 0.25)
    // A packet lights the cell its head is in.
    for (let k2 = 0; k2 < packets.length; k2++) {
      const pu = packetAt(k2)
      if (pu >= 0 && (packets[k2]!.side === 1 ? 32 + pu : 31 - pu) >> 1 === col) ink = 'cool'
    }
    for (const r of [0, 1]) c.bg(col, r, ink)
  }

  // The two zigzags, mirrored about the center and flowing outward.
  for (let x = 0; x < 64; x++) {
    const u = x >= 32 ? x - 32 : 31 - x
    if (u >= reach) continue
    const y1 = tri(u - flow), y2 = 7 - y1
    const tip = f > 0 && f < BLAZE && u >= reach - 3
    const ink: Ink = tip ? 'spark' : f >= BLAZE && f < BLAZE + 2 ? 'spark' : linkInk
    c.put(x, y1, ink, 1)
    c.put(x, y2, ink, 1)
  }
  for (let k = 0; k < packets.length; k++) {
    const pu = packetAt(k)
    if (pu < 0) continue
    const p = packets[k]!
    for (let d = 0; d < 3; d++) {
      const u = pu - d
      if (u < 0) continue
      const x = p.side === 1 ? 32 + u : 31 - u
      const y = p.line === 0 ? tri(u - flow) : 7 - tri(u - flow)
      c.put(x, y, 'spark', 5 - d)
    }
  }
}

export default {
  name: 'ghost',
  title: 'Ghost line',
  source: 'Ghost in the Shell',
  contexts: ['edit', 'web:net-dive'],
  rare: false,
  variants: {
    camo: { loop: LOOP, beats: [{ at: WIPE, phrase: 'THERMOPTIC CAMO' }] },
    'net-dive': { loop: LOOP, beats: [{ at: SPLASH, phrase: 'DIVE // SECTION 9' }] },
    lattice: { loop: LOOP, beats: [{ at: BLAZE, phrase: 'THE NET IS VAST AND INFINITE' }] },
  },
  draw: (c, frame, seed, variant) => (variant === 'net-dive' ? netDive : variant === 'lattice' ? lattice : camo)(c, frame, seed),
} satisfies Reel
