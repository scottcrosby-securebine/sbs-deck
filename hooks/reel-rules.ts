import { drawFrame, inkHex } from './canvas'
import type { Canvas, Cell, Ink, Reel, Variant } from './canvas'
import { SLOTS, THEME_NAMES, luminance } from './theme'
import type { Slot, ThemeName } from './theme'

// The reel rules of s5.4, measured as the Task 3 brief states them. A finding
// names the variant, seed, form, theme and frame where it applies.

export type Finding = {
  reel: string
  rule: 'glyphs' | 'slots' | 'color' | 'coverage' | 'beats' | 'flash' | 'phrases' | 'names' | 'seed'
  detail: string
}

export const RESERVED_NAMES = ['auto', 'off', 'list', 'next']
export const SEEDS = [1, 2, 3]

type Form = 32 | 16
const FORMS: readonly Form[] = [32, 16]
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
function inkLuminance(ink: Ink | null, theme: ThemeName): number {
  const key = `${theme}|${ink === null ? 'base' : inkName(ink)}`
  let lum = lumCache.get(key)
  if (lum === undefined) {
    const valid = ink !== null && (typeof ink === 'string' ? isSlot(ink) : isSlot(ink.from) && isSlot(ink.to))
    lum = luminance(valid ? inkHex(ink, theme) : SLOTS[theme].base)
    lumCache.set(key, lum)
  }
  return lum
}

export function cellLuminance(cell: Cell, theme: ThemeName): number {
  const bg = inkLuminance(cell.bg, theme)
  if (cell.char === ' ' || cell.char === '⠀') return bg
  const fg = inkLuminance(cell.fg, theme)
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
// Returns the frame index ending the first 8-frame window with 5 or more, or -1.
function cellFlash(frames: Float64Array[], cell: number): number {
  const n = frames.length
  const dir = (t: number) => {
    const a = frames[(t - 1) % n]![cell]!, b = frames[t % n]![cell]!
    return Math.abs(b - a) >= STEP && Math.min(a, b) < 0.8 ? Math.sign(b - a) : 0
  }
  // The sequence wraps, so the change before frame 1 is the cycle's last change.
  let last = 0
  for (let t = 1; t <= n; t++) last = dir(t) || last
  const counted = new Uint8Array(n + 7)
  let inWindow = 0
  for (let t = 1; t < n + 7; t++) {
    const d = dir(t)
    counted[t] = d !== 0 && d !== last ? 1 : 0
    if (d) last = d
    inWindow += counted[t]! - (t > 7 ? counted[t - 7]! : 0)
    if (inWindow >= 5) return t % n
  }
  return -1
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
  const lit = (name: string, seed: number, form: Form, theme: ThemeName): Float64Array[] => {
    const key = `${name}|${seed}|${form}|${theme}`
    let frames = lums.get(key)
    if (!frames) {
      frames = play(name, seed, form).map(rows => Float64Array.from(rows.flat(), cell => cellLuminance(cell, theme)))
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

  // Flash: each variant's three seeds back to back, wrapping, and each pair of
  // variants as A's three seeds then B's, wrapping, which measures A to B and B to A.
  for (const theme of THEME_NAMES) {
    for (const form of FORMS) {
      for (let i = 0; i < playable.length; i++) {
        for (let j = i; j < playable.length; j++) {
          const names = i === j ? [playable[i]![0]] : [playable[i]![0], playable[j]![0]]
          const blocks = names.flatMap(name => SEEDS.map(seed => ({ name, seed, frames: lit(name, seed, form, theme) })))
          const frames = blocks.flatMap(b => b.frames)
          const locate = (k: number) => {
            for (const b of blocks) {
              if (k < b.frames.length) return `variant ${b.name}, seed ${b.seed}, form ${form}, theme ${theme}, frame ${k}`
              k -= b.frames.length
            }
            return ''
          }
          const order = i === j ? '' : ` (playing ${names.join(' and ')} in turn)`
          const width = frames[0]!.length
          for (let cell = 0; cell < width; cell++) {
            const k = cellFlash(frames, cell)
            if (k >= 0) {
              add('flash', `${locate(k)}, cell ${cell % form},${Math.floor(cell / form)}: 5 or more counted changes in 8 frames${order}`)
              break
            }
          }
          if (legacy) continue
          const limit = form === 32 ? 16 : 8
          let k = 0
          for (const b of blocks) {
            const rising: number[] = []
            for (let f = 0; f < b.frames.length; f++, k++) {
              const now = frames[k]!, before = frames[(k - 1 + frames.length) % frames.length]!
              let up = 0
              for (let cell = 0; cell < width; cell++) if (now[cell]! - before[cell]! >= STEP) up++
              if (up > limit) rising.push(f)
            }
            if (rising.length > 1) add('flash', `variant ${b.name}, seed ${b.seed}, form ${form}, theme ${theme}, frames ${rising.join(', ')}: more than ${limit} cells rise by 0.10 or more, in more than one frame of the loop${order}`)
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
