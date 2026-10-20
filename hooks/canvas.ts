import { SLOTS, blend } from './theme'
import type { Paint, Slot, ThemeName } from './theme'

export type Ink = Slot | { from: Slot; to: Slot; t: number }
export type Cell = { char: string; fg: Ink | null; bg: Ink | null }
// `hold`: frames the catchphrase stands, 12 when absent; it ends by the next beat.
export type Beat = { at: number; phrase: string; hold?: number }
export type Variant = { loop: number; beats: readonly Beat[] }

export type Canvas = {
  readonly cols: 32 | 16
  readonly rows: 2
  bg(col: number, row: number, ink: Ink): void
  pix(x: number, y: number, ink: Ink): void
  put(x: number, y: number, ink: Ink, priority?: number): void
  glyph(col: number, row: number, char: string, ink: Ink): void
  mix(a: Slot, b: Slot, t: number): Ink
}

export type Reel = {
  name: string
  title: string
  source: string
  contexts: readonly string[]
  rare: boolean
  legacy?: boolean
  compact?: boolean
  variants: Readonly<Record<string, Variant>>
  draw(canvas: Canvas, frame: number, seed: number, variant: string): void
}

export type Part = 'art' | 'gap' | 'words' | 'readout' | 'pad'
export type Run = Paint & { text: string; part: Part }

// Braille bits per dot column (left, right) and dot row.
const BITS = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]] as const

export function createCanvas(cols: 32 | 16): Canvas & { cells(): Cell[][] } {
  const bgs: (Ink | null)[][] = [0, 1].map(() => Array(cols).fill(null))
  const pixels: (Ink | null)[][] = [0, 1, 2, 3].map(() => Array(cols).fill(null))
  const dots: ({ ink: Ink; priority: number } | null)[][] = [...Array(8)].map(() => Array(cols * 2).fill(null))
  const glyphs: ({ char: string; ink: Ink } | null)[][] = [0, 1].map(() => Array(cols).fill(null))

  const cell = (grid: unknown[][], x: number, y: number) => {
    const [rx, ry] = [Math.round(x), Math.round(y)]
    return ry >= 0 && ry < grid.length && rx >= 0 && rx < grid[0]!.length ? [rx, ry] as const : null
  }

  return {
    cols, rows: 2,
    bg(col, row, ink) { const p = cell(bgs, col, row); if (p) bgs[p[1]]![p[0]] = ink },
    pix(x, y, ink) { const p = cell(pixels, x, y); if (p) pixels[p[1]]![p[0]] = ink },
    put(x, y, ink, priority = 1) {
      const p = cell(dots, x, y)
      if (!p) return
      const old = dots[p[1]]![p[0]]
      if (!old || priority >= old.priority) dots[p[1]]![p[0]] = { ink, priority }
    },
    glyph(col, row, char, ink) { const p = cell(glyphs, col, row); if (p) glyphs[p[1]]![p[0]] = { char, ink } },
    mix: (a, b, t) => ({ from: a, to: b, t }),
    cells() {
      return [0, 1].map(row => [...Array(cols)].map((_, col): Cell => {
        const bg = bgs[row]![col]!
        const g = glyphs[row]![col]!
        if (g) return { char: g.char, fg: g.ink, bg }
        let bits = 0
        let best: { ink: Ink; priority: number } | null = null
        // Scan order: left dot column top to bottom, then the right.
        for (const side of [0, 1]) {
          for (let k = 0; k < 4; k++) {
            const d = dots[row * 4 + k]![col * 2 + side]!
            if (!d) continue
            bits |= BITS[side]![k]!
            if (!best || d.priority > best.priority) best = d
          }
        }
        if (best) return { char: String.fromCharCode(0x2800 + bits), fg: best.ink, bg }
        const [top, bottom] = [pixels[row * 2]![col]!, pixels[row * 2 + 1]![col]!]
        if (top && bottom) {
          const same = typeof top === 'string' ? top === bottom : typeof bottom !== 'string' && top.from === bottom.from && top.to === bottom.to && top.t === bottom.t
          return same ? { char: '█', fg: top, bg } : { char: '▀', fg: top, bg: bottom }
        }
        if (top) return { char: '▀', fg: top, bg }
        if (bottom) return { char: '▄', fg: bottom, bg }
        return { char: ' ', fg: null, bg }
      }))
    },
  }
}

export function drawFrame(reel: Reel, variant: string, frame: number, seed: number, cols: 32 | 16): Cell[][] {
  const crop = cols === 16 && !reel.compact
  const canvas = createCanvas(crop ? 32 : cols)
  reel.draw(canvas, frame, seed, variant)
  const cells = canvas.cells()
  return crop ? cells.map(row => row.slice(8, 24)) : cells
}

export function inkHex(ink: Ink, theme: ThemeName): string {
  if (typeof ink === 'string') return SLOTS[theme][ink]
  return blend(SLOTS[theme][ink.from], SLOTS[theme][ink.to], ink.t)
}

export function artRuns(cells: Cell[][], theme: ThemeName): Run[][] {
  const plate = SLOTS[theme].base
  return cells.map(row => {
    const runs: Run[] = []
    for (const c of row) {
      const color = c.char === ' ' || !c.fg ? plate : inkHex(c.fg, theme)
      const backgroundColor = c.bg ? inkHex(c.bg, theme) : plate
      const last = runs[runs.length - 1]
      if (last && last.color === color && last.backgroundColor === backgroundColor) last.text += c.char
      else runs.push({ text: c.char, color, backgroundColor, part: 'art' })
    }
    return runs
  })
}

// Deterministic hash in [0, 1), shared by every reel.
export function noise(...values: number[]): number {
  let h = 2166136261
  for (const v of values) {
    h ^= Math.floor(v) + 0x9e3779b9
    h = Math.imul(h, 16777619)
    h ^= h >>> 13
  }
  return ((h >>> 0) % 100000) / 100000
}
