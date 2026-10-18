import type { Reel } from '../canvas'
import { ANIMATIONS } from '../spinner'

// Names drawn at half rate: they fail the per-cell flash rule at full rate.
export const HALF_RATE: ReadonlySet<string> = new Set(['stars', 'life', 'warp', 'glitch', 'eq'])

export const LEGACY_REELS: readonly Reel[] = Object.entries(ANIMATIONS).map(([name, strip]) => {
  const divisor = HALF_RATE.has(name) ? 2 : 1
  return {
    name, title: name, source: 'legacy', contexts: [], rare: false, legacy: true, compact: true,
    variants: { strip: { loop: 64, beats: [] } },
    draw(canvas, frame) {
      ;[...strip(Math.floor(frame / divisor))].forEach((char, col) => canvas.glyph(col, 0, char, 'spark'))
    },
  }
})
