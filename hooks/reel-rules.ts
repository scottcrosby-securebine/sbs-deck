import { drawFrame, inkHex } from './canvas'
import type { Canvas, Cell, Ink, Reel, Variant } from './canvas'
import { SLOTS, THEME_NAMES, luminance, to256 } from './theme'
import type { Slot, ThemeName } from './theme'

// The reel rules: slots, glyphs, color, coverage, beats, flash, phrases, names
// and seed. A finding names the variant, seed, form, theme and frame where it
// applies, and for a flash the color depth when it is 256 colors.

export type Finding = {
  reel: string
  rule: 'glyphs' | 'slots' | 'color' | 'coverage' | 'beats' | 'flash' | 'phrases' | 'names' | 'seed'
  detail: string
}

export const RESERVED_NAMES = ['auto', 'off', 'list', 'next']
export const SEEDS = [1, 2, 3]

type Form = 32 | 16
const FORMS: readonly Form[] = [32, 16]
// A color depth: truecolor, or 256 colors, where Claude Code rounds each color
// to the cube (under tmux, and in a terminal without truecolor).
type Depth = 'truecolor' | '256'
const DEPTHS: readonly Depth[] = ['truecolor', '256']
const SLOT_NAMES = Object.keys(SLOTS.nightcity) as Slot[]
const PLATES = new Set(['▀', '▄', '█'])
const STEP = 0.1

export const isPhrase = (text: string) => /^[\x20-\x7E]{1,28}$/.test(text)

export function phasesOf(variant: Variant): { start: number; end: number }[] {
  const at = variant.beats.map(b => b.at)
  if (!at.length) return [{ start: 0, end: variant.loop }]
  return at.map((start, i) => ({ start, end: i + 1 < at.length ? at[i + 1]! : at[0]! + variant.loop }))
}

const isSlot = (s: unknown): s is Slot => SLOT_NAMES.includes(s as Slot)
const inkName = (ink: Ink) => typeof ink === 'string' ? ink : `mix(${ink.from}, ${ink.to}, ${ink.t})`
const hotDeep = (a: Slot, b: Slot) => (a === 'hot' && b === 'deep') || (a === 'deep' && b === 'hot')

function inkProblem(ink: Ink): string | null {
  if (typeof ink === 'string') return isSlot(ink) ? null : `ink '${ink}' is not a slot`
  if (!isSlot(ink.from) || !isSlot(ink.to)) return `${inkName(ink)} blends a name that is not a slot`
  if (![0.25, 0.5, 0.75].includes(ink.t)) return `${inkName(ink)} has t ${ink.t}, not 0.25, 0.5 or 0.75`
  if (ink.from !== 'base' && ink.to !== 'base' && !hotDeep(ink.from, ink.to)) return `${inkName(ink)} neither has base on one side nor blends hot with deep`
  return null
}

// The slots an ink counts as: a mix counts as its non-base slot, or both when it blends hot and deep.
function slotsOf(ink: Ink | null): Slot[] {
  if (ink === null) return ['base']
  if (typeof ink === 'string') return [ink]
  const sides = [ink.from, ink.to].filter(s => s !== 'base')
  return sides.length ? sides : ['base']
}

const lumCache = new Map<string, number>()
function inkLuminance(ink: Ink | null, theme: ThemeName, depth: Depth): number {
  const key = `${theme}|${depth}|${ink === null ? 'base' : inkName(ink)}`
  let lum = lumCache.get(key)
  if (lum === undefined) {
    const valid = ink !== null && (typeof ink === 'string' ? isSlot(ink) : isSlot(ink.from) && isSlot(ink.to))
    const hex = valid ? inkHex(ink, theme) : SLOTS[theme].base
    lum = luminance(depth === '256' ? to256(hex) : hex)
    lumCache.set(key, lum)
  }
  return lum
}

export function cellLuminance(cell: Cell, theme: ThemeName, depth: Depth = 'truecolor'): number {
  const bg = inkLuminance(cell.bg, theme, depth)
  if (cell.char === ' ' || cell.char === '⠀') return bg
  const fg = inkLuminance(cell.fg, theme, depth)
  if (cell.char === '█') return fg
  if (cell.char === '▀' || cell.char === '▄') return (fg + bg) / 2
  return 0.3 * fg + 0.7 * bg
}

function glyphProblem(char: string, ink: Ink): string | null {
  const points = [...char]
  const code = points.length === 1 ? points[0]!.codePointAt(0)! : -1
  const named = `glyph '${char}'${code >= 0 ? ` (U+${code.toString(16).toUpperCase().padStart(4, '0')})` : ''}`
  if (points.length !== 1) return `${named} is not exactly one code point`
  const allowed = (code >= 0x20 && code <= 0x7e) || (code >= 0xff66 && code <= 0xff9d) || (code >= 0x2500 && code <= 0x259f)
  if (!allowed) return `${named} is outside ASCII, half-width katakana, block and box characters`
  if (slotsOf(ink).includes('deep')) return `${named} uses deep ink ${inkName(ink)}`
  return null
}

const integral = (v: Variant) => Number.isInteger(v.loop) && v.loop > 0
const ordered = (v: Variant) => v.beats.every((b, i) => Number.isInteger(b.at) && b.at >= 0 && (i === 0 || b.at > v.beats[i - 1]!.at))

function beatProblems(v: Variant): string[] {
  const out: string[] = []
  const at = v.beats.map(b => b.at)
  if (!integral(v)) out.push(`loop ${v.loop} is not a positive integer`)
  if (!ordered(v)) out.push(`beats at ${at.join(', ')} are not strictly increasing non-negative integers`)
  if (!at.length) return [...out, 'has no beats']
  if (at[0]! > 15) out.push(`first beat at ${at[0]}, after frame 15`)
  for (let i = 1; i < at.length; i++) {
    if (at[i]! - at[i - 1]! < 12) out.push(`beats at ${at[i - 1]} and ${at[i]} are under 12 frames apart`)
  }
  if (at[at.length - 1]! > v.loop - 12) out.push(`last beat at ${at[at.length - 1]}, after frame ${v.loop - 12} (loop ${v.loop} less 12)`)
  if (v.loop < 36 * at.length) out.push(`loop ${v.loop} is under 36 x ${at.length} beats`)
  return out
}

// A per-cell flash: a counted change is a step of 0.10 or more whose darker side
// is under 0.80 and whose direction differs from the cell's previous change.
// (The previous counted change always has the direction of the previous change.)
// Transition t enters frame t mod n, and the sequence wraps. Returns the frame
// ending the first 8-frame window (7 transitions) with 5 or more, or -1. With
// `cross`, only windows holding transition `cross` are measured.
function cellFlash(frames: Float64Array[], cell: number, cross?: number): number {
  const n = frames.length
  const lum = (t: number) => frames[((t % n) + n) % n]![cell]!
  const dir = (t: number) => {
    const a = lum(t - 1), b = lum(t)
    return Math.abs(b - a) >= STEP && Math.min(a, b) < 0.8 ? Math.sign(b - a) : 0
  }
  const from = cross === undefined ? 1 : cross - 6
  const dirs = Array.from({ length: cross === undefined ? n + 6 : 13 }, (_, i) => dir(from + i))
  if (dirs.filter(d => d !== 0).length < 5) return -1
  let last = 0
  for (let t = from - 1; t > from - 1 - n && !last; t--) last = dir(t)
  const counted = new Uint8Array(dirs.length)
  let inWindow = 0
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]!
    counted[i] = d !== 0 && d !== last ? 1 : 0
    if (d) last = d
    inWindow += counted[i]! - (i >= 7 ? counted[i - 7]! : 0)
    if (i >= 6 && inWindow >= 5) return (from + i) % n
  }
  return -1
}

// The frames of a loop where more than `limit` cells each rise by 0.10 or more;
// frame 0 is compared with `before`, the frame played ahead of the loop.
function risingFrames(before: Float64Array, frames: Float64Array[], limit: number): number[] {
  const rises = (a: Float64Array, b: Float64Array) => {
    let up = 0
    for (let c = 0; c < b.length; c++) if (b[c]! - a[c]! >= STEP && ++up > limit) return true
    return false
  }
  return frames.flatMap((now, f) => rises(f ? frames[f - 1]! : before, now) ? [f] : [])
}

export function checkReel(reel: Reel): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  const add = (rule: Finding['rule'], detail: string) => {
    if (seen.has(rule + detail)) return
    seen.add(rule + detail)
    out.push({ reel: reel.name, rule, detail })
  }
  const legacy = reel.legacy === true
  const variants = Object.entries(reel.variants)

  if (!/^[a-z][a-z0-9]*$/.test(reel.name)) add('names', `name '${reel.name}' does not match ^[a-z][a-z0-9]*$`)
  if (RESERVED_NAMES.includes(reel.name)) add('names', `name '${reel.name}' is reserved`)

  if (!legacy) {
    for (const [name, v] of variants) {
      for (const p of beatProblems(v)) add('beats', `variant ${name}: ${p}`)
      for (const b of v.beats) if (!isPhrase(b.phrase)) add('phrases', `variant ${name}, beat at ${b.at}: '${b.phrase}' is not 1 to 28 printable ASCII characters`)
    }
  }

  // Glyph and ink problems are reported once each, where first drawn.
  let where = ''
  const once = (rule: 'glyphs' | 'slots', problem: string | null) => {
    if (problem && !seen.has(rule + problem)) { seen.add(rule + problem); out.push({ reel: reel.name, rule, detail: `${where}: ${problem}` }) }
  }
  const spy = (c: Canvas): Canvas => ({
    cols: c.cols, rows: c.rows, mix: c.mix,
    bg: (col, row, ink) => { once('slots', inkProblem(ink)); c.bg(col, row, ink) },
    pix: (x, y, ink) => { once('slots', inkProblem(ink)); c.pix(x, y, ink) },
    put: (x, y, ink, priority) => { once('slots', inkProblem(ink)); c.put(x, y, ink, priority) },
    glyph: (col, row, char, ink) => { once('slots', inkProblem(ink)); once('glyphs', glyphProblem(char, ink)); c.glyph(col, row, char, ink) },
  })
  const drawn: Reel = legacy ? reel : { ...reel, draw: (c, frame, seed, variant) => reel.draw(spy(c), frame, seed, variant) }

  const playable = variants.filter(([, v]) => integral(v))
  const plays = new Map<string, Cell[][][]>()
  const play = (name: string, seed: number, form: Form): Cell[][][] => {
    const key = `${name}|${seed}|${form}`
    let frames = plays.get(key)
    if (!frames && form === 16 && !reel.compact) {
      // drawFrame's crop of the 32-column draw, without drawing it again.
      frames = play(name, seed, 32).map(rows => rows.map(row => row.slice(8, 24)))
      plays.set(key, frames)
    }
    if (!frames) {
      frames = []
      for (let f = 0; f < reel.variants[name]!.loop; f++) {
        where = `variant ${name}, seed ${seed}, form ${form}, frame ${f}`
        frames.push(drawFrame(drawn, name, f, seed, form))
      }
      plays.set(key, frames)
    }
    return frames
  }
  const lums = new Map<string, Float64Array[]>()
  const lit = (name: string, seed: number, form: Form, theme: ThemeName, depth: Depth): Float64Array[] => {
    const key = `${name}|${seed}|${form}|${theme}|${depth}`
    let frames = lums.get(key)
    if (!frames) {
      frames = play(name, seed, form).map(rows => Float64Array.from(rows.flat(), cell => cellLuminance(cell, theme, depth)))
      lums.set(key, frames)
    }
    return frames
  }

  if (!legacy) {
    for (const [name, v] of playable) {
      const one = play(name, 1, 32), two = play(name, 2, 32)
      if (one.every((frame, f) => JSON.stringify(frame) === JSON.stringify(two[f]))) add('seed', `variant ${name}, form 32: seeds 1 and 2 draw the same cells in all ${v.loop} frames`)
      if (!ordered(v)) continue
      for (const seed of SEEDS) {
        const frames = play(name, seed, 32)
        for (const { start, end } of phasesOf(v)) {
          const span = `variant ${name}, seed ${seed}, form 32, frames ${start} to ${end - 1}`
          const slots = new Set<Slot>()
          let covered = 0, cells = 0
          for (let f = start; f < end; f++) {
            for (const cell of frames[f % v.loop]!.flat()) {
              for (const s of slotsOf(cell.bg)) slots.add(s)
              if (cell.fg) for (const s of slotsOf(cell.fg)) slots.add(s)
              const bgCounts = cell.bg !== null && cell.bg !== 'base'
              if (bgCounts || (PLATES.has(cell.char) && cell.fg !== null && cell.fg !== 'base')) covered++
              cells++
            }
          }
          if (slots.size < 4 || !slots.has('base')) add('color', `${span}: ${slots.size} slots (${[...slots].join(', ')}), needs 4 of 5 with base`)
          // Integer form of covered / cells >= 0.30.
          if (covered * 10 < cells * 3) add('coverage', `${span}: ${(100 * covered / cells).toFixed(2)}% coverage, under 30%`)
        }
      }
    }
  }

  // Flash: each variant's three seeds back to back, wrapping, then every
  // junction playback can make: variant A on seed s followed by variant B on seed
  // t, for every ordered pair (A, B), self pairs included, and every seed pair.
  // A junction reports only windows that cross it, and a loop's rising frames
  // only when its first frame, the one after the junction, is one of them.
  // Each theme is measured at both color depths.
  const last = (frames: Float64Array[]) => frames[frames.length - 1]!
  for (const theme of THEME_NAMES) for (const depth of DEPTHS) {
    for (const form of FORMS) {
      const limit = form === 32 ? 16 : 8
      const shade = depth === '256' ? ' at 256 colors' : ''
      const place = (name: string, seed: number, frame: number) => `variant ${name}, seed ${seed}, form ${form}, theme ${theme}${shade}, frame ${frame}`
      const cellAt = (cell: number) => `cell ${cell % form},${Math.floor(cell / form)}`
      for (const [name, v] of playable) {
        const loops = SEEDS.map(seed => lit(name, seed, form, theme, depth))
        const frames = loops.flat()
        for (let cell = 0; cell < frames[0]!.length; cell++) {
          const k = cellFlash(frames, cell)
          if (k < 0) continue
          add('flash', `${place(name, SEEDS[Math.floor(k / v.loop)]!, k % v.loop)}, ${cellAt(cell)}: 5 or more counted changes in 8 frames`)
          break
        }
        if (legacy) continue
        loops.forEach((frames, i) => {
          const rising = risingFrames(last(loops[(i + loops.length - 1) % loops.length]!), frames, limit)
          if (rising.length > 1) add('flash', `${place(name, SEEDS[i]!, rising[0]!)}: frames ${rising.join(', ')} each have more than ${limit} cells rising by 0.10 or more`)
        })
      }
      for (const [a] of playable) {
        for (const [b] of playable) {
          for (const s of SEEDS) {
            for (const t of SEEDS) {
              const ahead = lit(a, s, form, theme, depth), next = lit(b, t, form, theme, depth)
              const after = ` (after variant ${a} seed ${s})`
              // B first, so the junction A to B is the wrap: transition frames.length enters B's frame 0.
              const frames = [...next, ...ahead]
              for (let cell = 0; cell < frames[0]!.length; cell++) {
                const k = cellFlash(frames, cell, frames.length)
                if (k < 0) continue
                add('flash', `${place(b, t, k)}, ${cellAt(cell)}: 5 or more counted changes in 8 frames${after}`)
                break
              }
              if (legacy) continue
              if (!risingFrames(last(ahead), [next[0]!], limit).length) continue
              const rising = risingFrames(last(ahead), next, limit)
              if (rising.length > 1) add('flash', `${place(b, t, 0)}: frames ${rising.join(', ')} each have more than ${limit} cells rising by 0.10 or more${after}`)
            }
          }
        }
      }
    }
  }
  return out
}

export function checkLibrary(reels: readonly Reel[]): Finding[] {
  const out: Finding[] = []
  const names = new Map<string, number>()
  const phrases = new Map<string, string>()
  for (const reel of reels) {
    names.set(reel.name, (names.get(reel.name) ?? 0) + 1)
    if (names.get(reel.name) === 2) out.push({ reel: reel.name, rule: 'names', detail: `name '${reel.name}' is used by more than one reel` })
    for (const [variant, v] of Object.entries(reel.variants)) {
      for (const { phrase } of v.beats) {
        const first = phrases.get(phrase)
        const here = `${reel.name} variant ${variant}`
        if (first === undefined) phrases.set(phrase, here)
        else out.push({ reel: reel.name, rule: 'phrases', detail: `${here}: catchphrase '${phrase}' repeats ${first}` })
      }
    }
  }
  return out
}
