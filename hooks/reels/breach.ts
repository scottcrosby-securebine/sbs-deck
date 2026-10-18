import type { Canvas, Ink, Reel } from '../canvas'
import { noise } from '../canvas'

// Breach Protocol (Cyberpunk 2077). A 2 x 8 grid of the six canon codes boots
// in; a cursor picks along the top row, down a column and along the bottom row
// into the buffer, which matches DAEMON, and an ICEPICK upload bar sweeps the
// bottom row. A fresh grid washes in and a second solve uploads DATAMINE_V3 in
// aqua, then the grid glitches out. The seed picks both grids' codes and the
// columns each solve takes, kept to codes 3 to 7 so the 16-column crop
// (columns 8 to 23) holds every pick.
//
// Layout: code i of a row at columns 3i and 3i + 1, a spacer at 3i + 2; the
// buffer `[......]` at columns 24 to 31 of row 1, DAEMON under it.

const CODES = ['1C', '55', '7A', 'BD', 'E9', 'FF']
const KANA = 'ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
const SOLVE = 64 // frames per solve; the second solve starts at frame 64
const PICKS = [22, 28, 44] // solve frames of the three picks
const MATCH = 46 // the buffer matches; DAEMON lights a frame later
const UPLOAD = 48 // the bar starts
const FULL = 60 // the bar is full
const GLITCH = 132 // the grid starts to glitch out

type Clip = (col: number) => boolean

// A canvas that draws only the columns `keep` passes.
const clipped = (c: Canvas, keep: Clip): Canvas => ({
  cols: c.cols, rows: c.rows, mix: c.mix,
  bg: (col, row, ink) => { if (keep(col)) c.bg(col, row, ink) },
  pix: (x, y, ink) => { if (keep(x)) c.pix(x, y, ink) },
  put: (x, y, ink, priority) => { if (keep(Math.floor(x / 2))) c.put(x, y, ink, priority) },
  glyph: (col, row, char, ink) => { if (keep(col)) c.glyph(col, row, char, ink) },
})

// Solve k (0 ICEPICK, 1 DATAMINE) at solve frame s; s past 63 holds the full bar.
function solve(c: Canvas, seed: number, k: number, s: number) {
  const plate: Ink = k === 0 ? 'deep' : c.mix('cool', 'base', 0.75)
  const idle = c.mix('spark', 'base', 0.25)
  const code = (r: number, i: number) => CODES[Math.floor(noise(seed, k, r, i) * CODES.length)]!
  const a = 3 + Math.floor(noise(seed, k, 8) * 5)
  const b = 3 + ((a - 3 + 1 + Math.floor(noise(seed, k, 9) * 4)) % 5)
  const picks = [[0, a], [1, a], [1, b]] as const
  const taken = PICKS.filter(p => s >= p).length
  const isPicked = (r: number, i: number) => picks.slice(0, taken).some(([pr, pi]) => pr === r && pi === i)

  // The highlight band: the top row sweeping in from the left, the picked
  // column, then the bottom row opening out from that column.
  const band = (r: number, i: number) =>
    (s >= 8 && s < 24 && r === 0 && i <= s - 8) ||
    (s >= 24 && s < 30 && i === a) ||
    (s >= 30 && s < MATCH && r === 1 && Math.abs(i - a) <= s - 30)

  // The cursor steps a code every 2 frames, 7 steps a row, and lands on each
  // pick on its frame. Along the top row it bounces off the left edge; along
  // the bottom row it hunts: it backs away from its target, or overshoots it
  // where backing away would leave the grid, then turns.
  let cursor: readonly [number, number] | null = null
  if (s >= 8 && s < PICKS[0]!) {
    cursor = [0, Math.abs(a - 7 + ((s - 8) >> 1))]
  } else if (s >= 24 && s < PICKS[1]!) {
    cursor = [1, a]
  } else if (s >= 30 && s < PICKS[2]!) {
    const d = Math.sign(b - a), far = Math.abs(b - a), n = (s - 30) >> 1
    // An even distance spends its spare step holding at the turn.
    const hold = 1 - (far % 2), turn = (7 - far - hold) >> 1
    const out = a - d * turn <= 7 ? -turn : far + turn
    const back = Math.max(0, n - Math.abs(out) - hold)
    cursor = [1, a + d * (Math.sign(out) * Math.min(n, Math.abs(out)) - Math.sign(out) * back)]
  }

  // The fresh grid washes in 4 columns a frame, its front in red.
  const front = k === 1 && s < 8 ? (s + 1) * 4 : Infinity
  const booting = k === 0 && s < 8

  for (let r = 0; r < 2; r++) {
    if (r === 1 && s >= UPLOAD) continue
    for (let i = 0; i < 8; i++) {
      const n = r * 8 + i
      if (booting && n >= (s + 1) * 2) continue
      const x = i * 3
      let bg: Ink = band(r, i) ? 'hot' : plate
      let fg: Ink = band(r, i) || (booting && n >= s * 2) ? 'spark' : x >= front - 4 ? 'hot' : idle
      if (isPicked(r, i)) [bg, fg] = ['spark', 'base']
      if (cursor && cursor[0] === r && cursor[1] === i) [bg, fg] = ['cool', 'base']
      const text = code(r, i)
      for (const d of [0, 1]) {
        c.bg(x + d, r, bg)
        c.glyph(x + d, r, text[d]!, fg)
      }
      // Spacers carry the band: along a lit row, and either side of a lit column.
      const rowBand = s < 24 || s >= 30
      if (i < 7 && band(r, i) && band(r, i + 1) && rowBand) c.bg(x + 2, r, 'hot')
      if (!rowBand && i === a) {
        c.bg(x - 1, r, 'hot')
        c.bg(x + 2, r, 'hot')
      }
    }
  }

  // Each pick throws sparks into the spacers beside it, both rows, for 2 frames.
  PICKS.forEach((p, j) => {
    if (s < p || s >= p + 2) return
    const i = picks[j]![1]
    for (const col of [i * 3 - 1, i * 3 + 2]) {
      for (let y = 0; y < 8; y++) {
        for (const side of [0, 1]) {
          const h = noise(seed, k, s, col, y * 2 + side)
          if (h < 0.45) c.put(col * 2 + side, y, h < 0.2 ? 'cool' : 'spark', 2)
        }
      }
    }
  })

  // The buffer: dim dots fill with the picked codes; on the match it plates.
  const matched = s >= MATCH
  const buffer = picks.slice(0, taken).map(([r, i]) => code(r, i)).join('').padEnd(6, '.')
  const bufPlate: Ink = matched ? (k === 0 ? 'cool' : 'spark') : c.mix('cool', 'base', 0.75)
  ;`[${buffer}]`.split('').forEach((ch, j) => {
    c.bg(24 + j, 0, bufPlate)
    c.glyph(24 + j, 0, ch, matched ? 'base' : j === 0 || j === 7 ? 'cool' : ch === '.' ? c.mix('cool', 'base', 0.5) : 'spark')
  })
  const lit = s >= MATCH + 1
  ;' DAEMON '.split('').forEach((ch, j) => {
    if (lit) c.bg(24 + j, 1, k === 0 ? 'hot' : 'cool')
    c.glyph(24 + j, 1, ch, lit ? (k === 0 ? 'spark' : 'base') : 'hot')
  })

  // The upload bar across the grid's bottom row: a 2-column yellow head, then
  // a glint that runs the full bar while it holds.
  if (s >= UPLOAD) {
    const [top, bottom]: [Ink, Ink] = k === 0 ? ['hot', 'deep'] : ['cool', c.mix('cool', 'base', 0.5)]
    const empty: Ink = k === 0 ? c.mix('deep', 'base', 0.5) : c.mix('cool', 'base', 0.75)
    const filled = Math.min(24, (s - UPLOAD) * 2 + 2)
    const glint = s >= FULL ? (s - FULL) * 3 : -9
    for (let x = 0; x < 24; x++) {
      const head = s < FULL && x >= filled - 2 && x < filled
      const shine = x >= glint && x < glint + 2
      c.pix(x, 2, head || shine ? 'spark' : x < filled ? top : empty)
      c.pix(x, 3, head ? 'spark' : x < filled ? bottom : empty)
    }
  }
}

function draw(c: Canvas, frame: number, seed: number) {
  const k = frame < SOLVE ? 0 : 1
  const s = frame - k * SOLVE
  if (k === 1 && s < 8) {
    const front = (s + 1) * 4
    // Whole codes: a code turns over once its first column is behind the front.
    const fresh: Clip = col => Math.min(col - (col % 3), 24) < front
    solve(clipped(c, col => !fresh(col)), seed, 0, s + SOLVE)
    solve(clipped(c, fresh), seed, 1, s)
    return
  }
  solve(c, seed, k, s)
  if (frame < GLITCH) return

  // Glitch out: each cell flickers to a red katakana for a frame, then goes black.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < c.cols; col++) {
      const gone = GLITCH + Math.floor(noise(seed, 5, col, row) * 10)
      if (frame < gone - 1) continue
      c.bg(col, row, 'base')
      c.glyph(col, row, frame < gone ? KANA[Math.floor(noise(seed, 6, col, row) * KANA.length)]! : ' ', 'hot')
    }
  }
}

export default {
  name: 'breach',
  title: 'Breach Protocol',
  source: 'Cyberpunk 2077',
  contexts: ['shell', 'thinking'],
  rare: false,
  variants: {
    run: {
      loop: 144,
      beats: [
        { at: 0, phrase: 'BREACH PROTOCOL' },
        { at: PICKS[0]!, phrase: 'ACCESS POINT FOUND' },
        { at: UPLOAD, phrase: 'ICEPICK UPLOADED' },
        { at: SOLVE + UPLOAD, phrase: 'DATAMINE_V3' },
      ],
    },
  },
  draw: (c, frame, seed) => draw(c, frame, seed),
} satisfies Reel
