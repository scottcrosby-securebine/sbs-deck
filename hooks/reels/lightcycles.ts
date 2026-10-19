import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Light cycles (Tron). Seen from above, the strip is a stretch of the game
// grid with four lanes (the 4 half-block pixel rows). The arena boots from the
// center while a yellow beam rezzes an aqua and a red cycle side by side.
// They launch and the camera rides with them: the grid streams past and
// their light walls trail behind. They jockey and weave; the grid pulses out
// from the cycles. Red surges ahead and cuts down into aqua's lane; aqua drops
// a lane at the last frame, under red's corner. Aqua boosts past beneath red
// and turns up across red's lane: red hits aqua's wall and derezzes, the world
// stops, aqua rides off and the arena powers down behind it.
//
// The seed picks the lanes, the start column and how far red leads before
// the cut-off (so where red crashes), how far ahead of red aqua turns, the
// jockeying and weave frames, the arena's tiles, seams and spacing, and
// mirrors the race left or right and up or down. Every column the story
// uses lies in 8 to 23, so the 16-column crop shows both cycles, the cut-off
// and the crash.

const LOOP = 144
const RACE = 8 // launch: the walls start and the grid streams
const GRID = 42 // the grid pulse
const DODGE = 78 // aqua drops a lane under red's corner
const CRASH = 114 // red hits aqua's wall and derezzes
const DOWN = 126 // the arena powers down, back to front

// The camera rides with the cycles from launch, a column a frame, and
// lurches a column further on two frames from `lurch`. Its last step is on
// frame CRASH - 1, so the world is still on the crash.
const cam = (f: number, lurch: number) =>
  Math.min(Math.max(f - RACE, 0), CRASH - 1 - RACE) + Math.min(Math.max(f - lurch + 1, 0), 2)

type Px = { wx: number; y: number; at: number } // a wall pixel in world columns, born at frame `at`
type Plan = {
  x0: number; a: number; lead: number; flipX: boolean; flipY: boolean
  arena: number; gap: number; lurch: number; aqua: Px[]; red: Px[]
}

// A cycle's screen column and lane per frame, from per-frame steps, and the
// wall it lays: each frame it runs along its lane, then turns into the new one.
function ride(x0: number, lane: number, steps: Map<number, [number, number]>, end: number, lurch: number): Px[] {
  const wall: Px[] = [{ wx: x0 - 1, y: lane, at: 0 }, { wx: x0, y: lane, at: 0 }]
  let [sx, y] = [x0, lane]
  for (let f = RACE + 1; f <= end; f++) {
    const [dx, dy] = steps.get(f) ?? [0, 0]
    const from = sx + cam(f - 1, lurch)
    sx += dx
    for (let wx = from + 1; wx <= sx + cam(f, lurch); wx++) wall.push({ wx, y, at: f })
    if (dy) wall.push({ wx: sx + cam(f, lurch), y: (y += dy), at: f })
  }
  return wall
}

const plans = new Map<number, Plan>() // a fresh seed every loop: cleared past 8 plans
function plan(seed: number): Plan {
  const known = plans.get(seed)
  if (known) return known
  const pick = (k: number, n: number) => Math.floor(noise(seed, k) * n)
  const x0 = 12 + pick(1, 2) // both cycles' start column
  const a = 1 + pick(2, 2) // aqua's lane; red rides the lane above
  const lead = 5 + pick(3, 2) // red's lead at the cut-off
  const ahead = 3 + pick(4, 2) // how far ahead of red aqua turns
  const aqua = new Map<number, [number, number]>()
  const red = new Map<number, [number, number]>()
  const step = (m: Map<number, [number, number]>, f: number, dx: number, dy = 0) => {
    const [x, y] = m.get(f) ?? [0, 0]
    m.set(f, [x + dx, y + dy])
  }

  // Jockeying: aqua surges two columns, red draws level, and the camera
  // lurches to catch up with both.
  const j = 12 + pick(5, 5), lurch = j + 12
  for (const k of [0, 1]) {
    step(aqua, j + k, 1); step(red, j + 6 + k, 1)
    step(aqua, lurch + k, -1); step(red, lurch + k, -1)
  }
  // A weave out of the other's way and back: red up when it has room, else aqua down.
  const w = j + 15 + pick(6, 4)
  if (a === 2) { step(red, w, 0, -1); step(red, w + 6, 0, 1) } else { step(aqua, w, 0, 1); step(aqua, w + 6, 0, -1) }

  // Red surges `lead` columns and cuts down into aqua's lane; aqua's wall
  // would meet red's corner on the frame after DODGE, so it drops a lane on it.
  const jog = 54 + pick(11, 3) // aqua weaves out and back while red lines up
  step(aqua, jog, 0, 1); step(aqua, jog + 5, 0, -1)
  const cut = DODGE + 1 - lead
  for (let k = 0; k < lead; k++) step(red, cut - lead - 3 + k, 1)
  step(red, cut, 0, 1)
  step(aqua, DODGE, 0, 1)

  // Aqua boosts past beneath red and turns up across red's lane, timed so red
  // reaches the turn on CRASH.
  for (let k = 0; k < lead + ahead; k++) step(aqua, 90 + k, 1)
  const feint = 98 + pick(12, 3) // red weaves up and back, still in the trap
  step(red, feint, 0, -1); step(red, feint + 4, 0, 1)
  const turn = CRASH - ahead
  step(aqua, turn, 0, -1)
  step(aqua, turn + 1, 0, -1)
  // After the crash the camera stops and aqua rides off.
  for (let f = CRASH; f < LOOP; f++) step(aqua, f, 1)

  const p: Plan = {
    x0, a, lead,
    flipX: noise(seed, 7) < 0.5, flipY: noise(seed, 8) < 0.5,
    arena: pick(9, 3), gap: 3 + pick(10, 2), lurch,
    aqua: ride(x0, a, aqua, LOOP - 1, lurch),
    red: ride(x0, a - 1, red, CRASH - 1, lurch),
  }
  if (plans.size >= 8) plans.clear()
  plans.set(seed, p)
  return p
}

function draw(c: Canvas, f: number, seed: number) {
  const p = plan(seed)
  const { x0, a } = p
  const cs = x0 + p.lead // red's column from its surge to the crash
  const [tile, seam]: [Ink, Ink] = [
    [c.mix('deep', 'base', 0.5), c.mix('cool', 'base', 0.5)],
    [c.mix('deep', 'base', 0.25), c.mix('spark', 'base', 0.5)],
    [c.mix('spark', 'base', 0.75), c.mix('cool', 'base', 0.25)],
  ][p.arena] as [Ink, Ink]

  // Drawn unmirrored on 32 columns, 4 lanes, 64 x 8 dots, then flushed mirrored.
  const bgs: (Ink | null)[][] = [0, 1].map(() => Array(32).fill(null))
  const pxs: (Ink | null)[][] = [0, 1, 2, 3].map(() => Array(32).fill(null))
  const dots: [number, number, Ink][] = []
  const lit = new Set<number>() // cells whose background outshines the seam dots
  const setBg = (s: number, row: number, ink: Ink) => { if (s >= 0 && s < 32 && row >= 0 && row < 2) bgs[row]![s] = ink }
  const setPx = (s: number, y: number, ink: Ink) => { if (s >= 0 && s < 32) pxs[y]![s] = ink }
  const seamAt = (s: number) => ((s + cam(f, p.lurch)) % p.gap + p.gap) % p.gap === 0
  const down = (s: number) => f - DOWN - (s >> 1) // the power-down front reaches column s at 0

  // The arena: tiles and black seams with a dotted line, streaming with the
  // camera. The boot's front glows a dim red for a frame ahead of the tiles,
  // so no cell lights in one step bright enough to flash at 256 colors.
  for (let s = 0; s < 32; s++) {
    const reach = Math.floor(Math.abs(s - 15.5))
    if (f < RACE && reach >= 2 * (f + 1)) continue
    const front = f < RACE && reach >= 2 * f
    const k = down(s)
    if (k === 0) { setBg(s, 0, c.mix('spark', 'base', 0.5)); setBg(s, 1, c.mix('spark', 'base', 0.5)); lit.add(s).add(s + 32); continue }
    if (k > 0) continue
    if (seamAt(s)) {
      for (let dy = 0; dy < 8; dy++) dots.push([2 * s, dy, front ? c.mix('cool', 'base', 0.5) : seam])
    } else {
      const ink = front ? c.mix('hot', 'base', 0.75) : tile
      setBg(s, 0, ink); setBg(s, 1, ink)
    }
  }

  // The walls and the cycles: each wall's newest two pixels are its cycle.
  const walls = (wall: Px[], isRed: boolean) => {
    const laid = wall.filter(px => px.at <= f)
    const crashX = isRed ? wall[wall.length - 1]!.wx : 0
    laid.forEach((px, i) => {
      const s = px.wx - cam(f, p.lurch)
      if (s < 0 || s >= 32) return
      const head = i === laid.length - 1, cycle = i >= laid.length - 2
      // Red's wall dims like aqua's while they race; from the crash it burns full
      // red, so the dim wall under the crash flash never adds a counted change.
      let ink: Ink | null = isRed ? (cycle || f >= CRASH ? 'hot' : c.mix('hot', 'deep', 0.5))
        : cycle ? (head && f === DODGE ? 'spark' : 'cool') : c.mix('cool', 'base', 0.5)
      let glow = true
      if (isRed && f >= CRASH) {
        // Derez: a front runs back along the wall from the crash, 2 columns a frame.
        const k = f - CRASH - ((crashX - px.wx) >> 1)
        if (k >= 0) { ink = k === 0 ? 'spark' : k === 1 ? 'deep' : null; glow = false }
        if (k === 2 || k === 3) dots.push([2 * s + (px.wx & 1), 2 * px.y + k - 2, k === 2 ? 'hot' : 'deep'])
      }
      const k = down(s)
      if (k >= 0) { ink = k > 1 ? null : isRed ? 'deep' : c.mix('cool', 'base', 0.75); glow = false }
      if (!ink) return
      setPx(s, px.y, ink)
      if (glow && f >= 6 && !seamAt(s)) setBg(s, px.y >> 1, isRed ? c.mix('deep', 'base', 0.25) : c.mix('cool', 'base', 0.75))
    })
  }

  // The rez: a yellow beam fills the start column top down, then gathers into the two cycles.
  if (f < 6) {
    for (let y = 0; y < 4; y++) {
      if (f < 4 ? y <= f : y === a || y === a - 1) setPx(x0, y, 'spark')
      if (f >= 4 && (y === a || y === a - 1)) setPx(x0 - 1, y, 'spark')
    }
  } else {
    if (f < CRASH + 8) walls(p.red, true)
    // The derez: a diamond of pixels rings out from red's head, under aqua's walls.
    for (let y = 0; y < 4 && f >= CRASH && f < CRASH + 7; y++) {
      for (let s = cs - 8; s <= cs + 1; s++) {
        const d = f - CRASH - Math.abs(s - cs) - Math.abs(y - a)
        if (d >= 0 && d <= 2) setPx(s, y, d > 0 ? (d === 1 ? 'hot' : c.mix('hot', 'deep', 0.5)) : f < CRASH + 2 ? 'spark' : 'hot')
      }
    }
    walls(p.aqua, false)
  }

  // The grid pulse: a yellow ring runs out both ways from the cycles, a column a frame.
  if (f >= GRID && f < GRID + 22) {
    for (let s = 0; s < 32; s++) {
      const d = Math.abs(s - x0) - (f - GRID)
      if (d !== 0 && d !== -1) continue
      const ink: Ink = d === 0 ? 'spark' : c.mix('spark', 'base', 0.5)
      setBg(s, 0, ink); setBg(s, 1, ink); lit.add(s).add(s + 32)
    }
  }

  // The near miss: aqua's head goes yellow and the plates around it and red's corner flare.
  if (f === DODGE || f === DODGE + 1) {
    const ink: Ink = f === DODGE ? 'spark' : 'hot'
    for (let s = x0 - 1; s <= x0 + 2; s++) { setBg(s, 0, ink); setBg(s, 1, ink); lit.add(s).add(s + 32) }
  }

  // The flash: 8 columns behind aqua's wall light yellow and cool through red, and debris flies.
  if (f >= CRASH && f < CRASH + 6) {
    const k = f - CRASH
    const ink: Ink = ['spark', 'hot', c.mix('hot', 'deep', 0.5), 'deep', c.mix('deep', 'base', 0.5), c.mix('deep', 'base', 0.75)][k] as Ink
    for (let s = cs - 6; s <= cs + 1; s++) {
      setBg(s, 0, ink); setBg(s, 1, ink); lit.add(s).add(s + 32)
    }
    for (let i = 0; i < 8 && k > 0; i++) {
      const vx = noise(seed, 20, i) * 4 - 3, vy = (noise(seed, 21, i) - 0.5) * 2.4
      dots.push([2 * cs + 1 + vx * k, 2 * a + 0.5 + vy * k, k <= 2 ? 'spark' : k <= 4 ? 'hot' : 'deep'])
    }
  }

  // Flush, mirrored by the seed. Dots stay out of cells that hold a pixel.
  const mx = (s: number) => p.flipX ? 31 - s : s
  const hasPx = (s: number, row: number) => pxs[2 * row]![s] !== null || pxs[2 * row + 1]![s] !== null
  for (let row = 0; row < 2; row++) {
    for (let s = 0; s < 32; s++) {
      const ink = bgs[row]![s]
      if (ink) c.bg(mx(s), p.flipY ? 1 - row : row, ink)
    }
  }
  for (let y = 0; y < 4; y++) {
    for (let s = 0; s < 32; s++) {
      const ink = pxs[y]![s]
      if (ink) c.pix(mx(s), p.flipY ? 3 - y : y, ink)
    }
  }
  for (const [dx, dy, ink] of dots) {
    const [x, y] = [Math.round(dx), Math.round(dy)]
    if (x < 0 || x > 63 || y < 0 || y > 7) continue
    const [s, row] = [x >> 1, y >> 2]
    if (hasPx(s, row) || (ink === seam && lit.has(s + 32 * row))) continue
    c.put(p.flipX ? 63 - x : x, p.flipY ? 7 - y : y, ink, ink === seam ? 1 : 2)
  }
}

export default {
  name: 'lightcycles',
  title: 'Light cycles',
  source: 'Tron',
  contexts: ['shell', 'edit'],
  rare: false,
  variants: {
    race: {
      loop: LOOP,
      beats: [
        { at: 6, phrase: 'GREETINGS, PROGRAMS' },
        { at: GRID, phrase: 'ON THE GAME GRID' },
        { at: DODGE, phrase: 'I FIGHT FOR THE USERS' },
        { at: CRASH, phrase: 'END OF LINE' },
      ],
    },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
