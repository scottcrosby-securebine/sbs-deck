import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Sandevistan (Cyberpunk: Edgerunners). Rain falls over a dark red skyline
// with a neon sign. A yellow runner walks in, stops, and the chrome charges:
// an aqua aura builds behind them. Time slows: the rain freezes in the air
// and an aqua shockwave rolls out from the runner, leaving the sky tinted.
// The runner dashes across, turns, dashes back and cuts to the center, six
// afterimages strung out behind (aqua nearest, then red, then dark red),
// fullest as the second dash ends. The afterimages collapse into the runner,
// and time comes back: a red flash at the runner, a ripple outward that
// shatters each frozen drop into a yellow spark, the rain falling again, and
// the runner walks off. The seed mirrors the story (which side they enter
// from) and picks the skyline, its lit windows, the sign and the rain.
//
// It draws on the canvas it gets (compact): positions are laid out on 32
// columns and scaled to 16, so the runner and the whole trail stay in view.

const LOOP = 144
const STOP = 12 // the walk-in ends
const FREEZE = 36 // time slows
const DASHES = [[42, 6, 56], [66, 56, 6], [90, 6, 29.5]] as const // start frame, from, to (32-column dots)
const SPEED = 2.5 // dots a frame in slowed time
const PEAK = 84 // the trail at its fullest
const GATHER = 100 // the afterimages start to collapse
const RESUME = 108 // time comes back
const LEAVE = 112 // the runner walks off
const GHOSTS = 6

const RUN = [
  ['.XX..', '.XX..', 'XXXX.', '.XX.X', '.XXX.', '.X.X.', 'X...X', 'X...X'],
  ['.XX..', '.XX..', '.XXXX', 'X.XX.', '.XXX.', '..X..', '.X..X', 'X....'],
]
const STAND = ['.XX..', '.XX..', '.XXX.', 'X.XX.', '.XX..', '.XX..', '.X.X.', '.X.X.']
const CROUCH = ['.....', '..XX.', '..XX.', 'XXXX.', '.XXXX', '.XX..', 'X..X.', 'X...X']
const KANA = 'ｱｲｶｷｻｼｽﾀﾁﾂﾈﾉﾊﾋﾏﾐﾑﾓﾔﾗﾘﾙﾛﾜﾝ'

// The runner's x (32-column dots, left edge of the sprite) and facing at frame t.
function runner(t: number): { x: number; face: number } {
  if (t < STOP) return { x: -6 + t, face: 1 }
  if (t < DASHES[0][0]) return { x: 6, face: 1 }
  for (let i = DASHES.length - 1; i >= 0; i--) {
    const [at, from, to] = DASHES[i]!
    if (t < at) continue
    const way = Math.sign(to - from)
    const x = from + way * Math.min(Math.abs(to - from), (t - at) * SPEED)
    // After a dash the runner faces the way of the next one.
    const next = DASHES[i + 1]
    const done = x === to && next !== undefined
    if (t < RESUME) return { x, face: done ? Math.sign(next[2] - next[1]) : way }
    return { x: to + Math.max(0, t - LEAVE) * 1.4, face: 1 }
  }
  return { x: 6, face: 1 }
}

const dashing = (t: number) => DASHES.some(([at, from, to]) => t >= at && t < at + Math.abs(to - from) / SPEED)

// The pose at frame t.
function pose(t: number): readonly string[] {
  if (t < STOP || t >= LEAVE) return RUN[(t >> 1) & 1]!
  if (dashing(t)) return RUN[t & 1]!
  if (t >= FREEZE && t < RESUME - 8) return CROUCH
  return STAND
}

// Frames between afterimages: they string out once the first dash starts and
// collapse into the runner before time comes back.
function lag(t: number): number {
  if (t < DASHES[0][0]) return 0
  if (t < GATHER) return Math.min(3, 1 + (t - DASHES[0][0]) / 21)
  return Math.max(0, 3 * (RESUME - t) / (RESUME - GATHER))
}

function draw(c: Canvas, t: number, seed: number) {
  const W = c.cols, DW = W * 2, S = W / 32
  const flip = noise(seed, 1) < 0.5
  // Maps a 32-column sprite position to this canvas, mirrored when flipped.
  const sx = (x: number) => { const v = Math.round(x * (DW - 5) / 59); return flip ? DW - 5 - v : v }
  const cellOf = (x: number) => Math.floor(x / 2)
  const frozen = t >= FREEZE && t < RESUME

  // The skyline: buildings 2 to 5 columns wide, every other one a shade
  // darker, low (the bottom row), mid (half the top row, a pixel) or tall.
  const height: number[] = [], tone: Ink[] = []
  for (let col = 0, b = 0; col < W; b++) {
    const width = 2 + Math.floor(noise(seed, 2, b) * 4)
    const h = Math.floor(noise(seed, 3, b) * 3)
    const ink = c.mix('deep', 'base', b % 2 ? 0.5 : 0.25)
    for (let k = 0; k < width && col < W; k++, col++) { height[col] = h; tone[col] = ink }
  }
  const tower = (col: number) => height[col] === 2
  for (let col = 0; col < W; col++) {
    c.bg(col, 1, tone[col]!)
    if (tower(col)) c.bg(col, 0, tone[col]!)
  }

  const me = runner(t)
  const center = cellOf(sx(me.x) + 2)

  // Slowed time: the sky tints aqua behind a shockwave rolling out from where
  // the runner stood; when time comes back a second ripple clears it.
  const origin = cellOf(sx(6) + 2), back = cellOf(sx(DASHES[2][2]) + 2)
  const out = (t - FREEZE) * 2 * S + 1, home = (t - RESUME) * 2 * S + 1
  const resumed = (col: number) => t >= RESUME && Math.abs(col - back) < home
  const tinted = (col: number) => t >= FREEZE && Math.abs(col - origin) < out && !resumed(col)
  for (let col = 0; col < W; col++) {
    const d = Math.abs(col - origin)
    if (!tower(col) && tinted(col)) c.bg(col, 0, c.mix('cool', 'base', 0.75))
    if (t >= FREEZE && d < out && d >= out - 2 * S) for (const row of [0, 1]) c.bg(col, row, 'cool')
    const e = Math.abs(col - back)
    if (t >= RESUME && e < home && e >= home - 2 * S) for (const row of [0, 1]) c.bg(col, row, 'spark')
  }

  // The neon sign: 2 or 3 kana on a lit plate, high on the skyline. Each
  // loop opens on the dark city: the sign lights a cell every 2 frames from
  // frame 3, the windows one a frame from frame 2, and the rain falls in from
  // the top, so a new seed's first frame never brightens many cells at once.
  const signAt = Math.floor(noise(seed, 4) * (W - 3)), signLen = 2 + Math.floor(noise(seed, 5) * 2)
  const signInk: Ink = (['hot', 'spark', 'cool'] as const)[Math.floor(noise(seed, 6) * 3)]!
  const sign: { col: number; char: string }[] = []
  for (let k = 0; k < signLen; k++) {
    const col = signAt + k
    if (t < 3 + 2 * k) continue
    sign.push({ col, char: KANA[Math.floor(noise(seed, 7, k) * KANA.length)]! })
    c.bg(col, 0, frozen && tinted(col) ? c.mix(signInk, 'base', 0.5) : signInk)
  }

  // The chrome charges: an aura builds behind the standing runner, the top
  // row a frame behind the bottom.
  for (const row of [0, 1]) {
    const k = t - row
    if (k < STOP + 4 || t >= FREEZE) continue
    const level = k < STOP + 12 ? 0.75 : k < STOP + 20 ? 0.5 : 0.25
    for (let col = center - 1; col <= center + 1; col++) c.bg(col, row, c.mix('cool', 'base', level))
  }

  // Time comes back with a red flash at the runner.
  if (t >= RESUME && t < RESUME + 2) {
    for (let col = center - 1; col <= center + 1; col++) for (const row of [0, 1]) c.bg(col, row, 'hot')
  }

  // The runner, then the afterimages newest first: each takes the cells of
  // its 5-dot box that nothing newer holds, plates them and draws its dots
  // there, so a newer figure always lies on top.
  type Sprite = { x: number; rows: readonly string[]; face: number; ink: Ink; plate: Ink | null }
  const sprites: Sprite[] = [{ x: sx(me.x), rows: pose(t), face: me.face, ink: 'spark', plate: null }]
  const L = lag(t)
  for (let k = 1; L > 0 && k <= GHOSTS; k++) {
    const then = runner(t - k * L)
    const [plate, ink]: [Ink, Ink] = k <= 2 ? [c.mix('cool', 'base', 0.25), 'cool'] : k <= 4 ? [c.mix('hot', 'base', 0.5), 'hot'] : ['deep', c.mix('hot', 'deep', 0.5)]
    sprites.push({ x: sx(then.x), rows: RUN[0]!, face: then.face, ink, plate })
  }
  const dots: { x: number; y: number; ink: Ink }[] = []
  const taken = new Set<number>()
  sprites.forEach((s, i) => {
    // An afterimage's plate runs on to the next newer figure, so the trail is
    // one unbroken streak.
    const ahead = sprites[i - 1]?.x ?? s.x
    const mine = new Set<number>()
    for (let col = Math.max(0, cellOf(Math.min(s.x, ahead))); col <= Math.min(W - 1, cellOf(Math.max(s.x, ahead) + 4)); col++) {
      for (const row of [0, 1]) {
        if (taken.has(row * W + col)) continue
        mine.add(row * W + col)
        if (s.plate) c.bg(col, row, s.plate)
      }
    }
    const face = flip ? -s.face : s.face
    s.rows.forEach((line, y) => {
      for (let i = 0; i < 5; i++) {
        const x = s.x + i
        if (line[face > 0 ? i : 4 - i] === 'X' && mine.has((y >> 2) * W + cellOf(x)) && x >= 0 && x < DW) dots.push({ x, y, ink: s.ink })
      }
    })
    for (const cell of mine) taken.add(cell)
  })
  // A mid building's top is a pixel, so no dot may share its cell.
  const roof = (col: number) => height[col] === 1 && !taken.has(col) && !sign.some(s => s.col === col)
  for (let col = 0; col < W; col++) if (roof(col)) c.pix(col, 1, tone[col]!)
  const signCell = (col: number) => col >= signAt && col < signAt + signLen
  const free = (x: number, y: number) => !taken.has((y >> 2) * W + cellOf(x)) && !(y < 4 && (roof(cellOf(x)) || signCell(cellOf(x))))

  // One drop a column at most, so a cell's rain never flickers between drops.
  const rainCols = [...Array(W).keys()].sort((a, b) => noise(seed, 14, a) - noise(seed, 14, b)).slice(0, Math.round(20 * S))

  // Lit windows on the buildings, off the rain's columns, one blinking slowly.
  const windows = [...Array(W).keys()].filter(col => !rainCols.includes(col) && noise(seed, 8, col) < 0.8)
  windows.forEach((col, j) => {
    const x = col * 2 + (noise(seed, 9, col) < 0.5 ? 0 : 1)
    const y = tower(col) && noise(seed, 10, col) < 0.5 ? 2 : 5 + Math.floor(noise(seed, 11, col) * 2)
    if (t < 2 + j || (j === 0 && (t >> 3) & 1)) return
    if (free(x, y)) c.put(x, y, noise(seed, 13, col) < 0.6 ? 'spark' : 'cool', 1)
  })

  // Rain: streaks falling a dot a frame, frozen in slowed time, shattering
  // into sparks as the ripple of returning time reaches them, then falling
  // on. The drops' phases are spread evenly (5 is odd, so i * 5 steps through
  // all 8), so no more than a quarter of them enter a new cell on one frame.
  const phase = Math.floor(noise(seed, 15) * 8)
  rainCols.forEach((col, i) => {
    const x = col * 2 + (noise(seed, 16, col) < 0.5 ? 0 : 1)
    const y0 = (i * 5 + phase) % 8
    const thaw = RESUME + Math.ceil(Math.abs(col - back) / (2 * S))
    // The head, counted from above the top: a drop is drawn once it has
    // fallen in. After its burst a drop falls in from the top again, on the
    // same even phase as before the freeze.
    const after = t - (RESUME - FREEZE), from = thaw + 2 - (RESUME - FREEZE)
    const head = t < FREEZE ? y0 + t - 8 : t < thaw + 2 ? y0 + FREEZE - 8 : y0 + after - 8 * Math.floor((y0 + from) / 8) - 8
    const y = (head + 8) % 8
    if (t >= thaw && t < thaw + 2) {
      for (const [dx, dy] of [[0, 0], [1, -1], [1, 1], [0, -2], [0, 2]] as const) if (free(x ^ dx, y + dy)) c.put(x ^ dx, y + dy, t === thaw ? 'hot' : 'spark', 2)
      return
    }
    const ink: Ink = t < thaw && tinted(col) ? c.mix('cool', 'base', 0.5) : 'cool'
    for (const d of [0, 1]) if (head - d >= 0 && free(x, (y + 8 - d) % 8)) c.put(x, (y + 8 - d) % 8, ink, 2)
  })

  for (const s of sign) if (!taken.has(s.col)) c.glyph(s.col, 0, s.char, 'base')
  for (const d of dots) c.put(d.x, d.y, d.ink, 5)
}

export default {
  name: 'sandevistan',
  title: 'Sandevistan',
  source: 'Cyberpunk: Edgerunners',
  contexts: ['agents', 'requesting'],
  rare: false,
  compact: true,
  variants: {
    run: {
      loop: LOOP,
      beats: [
        { at: 6, phrase: 'EDGERUNNER' },
        { at: FREEZE, phrase: 'TIME SLOWS DOWN' },
        { at: PEAK, phrase: 'SANDEVISTAN' },
        { at: RESUME, phrase: 'PREEM CHROME' },
      ],
    },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
