import type { Run } from './canvas'
import { cleanLine } from './color'
import { ROLES } from './theme'
import type { ThemeName } from './theme'

export type Tier = 'full' | 'compact' | 'one-row'

// Columns the spinner's own margin takes; Task 8 measures it live (PD5).
export const SPINNER_INSET = 0
// The desktop surface draws the one-row form unless this is set (D9).
export const DESKTOP_TWO_ROW = false

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
]
const ZERO = /\p{Mn}|\p{Me}/u
// Regional indicators are excluded: a flag pair is two of them in two columns.
const EMOJI = /(?![\u{1F1E6}-\u{1F1FF}])\p{Emoji_Presentation}/u

function charColumns(char: string): number {
  const code = char.codePointAt(0)!
  if (ZERO.test(char) || (code >= 0x200b && code <= 0x200f) || (code >= 0xfe00 && code <= 0xfe0f)) return 0
  return EMOJI.test(char) || WIDE.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1
}

export function columnsOf(text: string): number {
  let n = 0
  for (const char of text) n += charColumns(char)
  return n
}

// Cut to `max` columns, ending in `…` when anything was dropped. A wide
// character that does not fit is dropped whole.
function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  if (columnsOf(text) <= max) return text
  let out = ''
  let used = 0
  for (const char of text) {
    const w = charColumns(char)
    if (used + w > max - 1) break
    out += char
    used += w
  }
  return out + '…'
}

export function tierFor(surface: string, viewport: { columns: number; rows: number } | undefined, isOff: boolean): Tier {
  if (isOff || !viewport || viewport.columns < 60 || viewport.rows < 12) return 'one-row'
  if (surface !== 'terminal' && !(DESKTOP_TWO_ROW && surface === 'desktop')) return 'one-row'
  return viewport.columns >= 80 ? 'full' : 'compact'
}

export type LineParts = {
  theme: ThemeName
  tier: Tier
  columns: number | undefined
  art: Run[][] | undefined
  words: string
  isCatchphrase: boolean
  readout: string
}

export function layoutLine(parts: LineParts): Run[][] {
  const { theme, tier, columns, art, words, isCatchphrase, readout } = parts
  const roles = ROLES[theme]
  const backgroundColor = roles.plate.backgroundColor
  const plateWidth = columns === undefined ? undefined : columns - SPINNER_INSET
  const spaces = (part: 'gap' | 'pad', n: number): Run[] => n > 0 ? [{ text: ' '.repeat(n), backgroundColor, part }] : []
  const wordsRun = (text: string): Run => ({ ...roles.phrase, backgroundColor, ...(isCatchphrase ? { bold: true } : {}), text, part: 'words' })
  const readoutRun = (text: string): Run => ({ ...roles.readout, backgroundColor, text, part: 'readout' })

  if (tier !== 'one-row' && art && art.length === 2 && plateWidth !== undefined) {
    return art.map((artRow, i) => {
      const room = Math.max(0, plateWidth - artRow.reduce((n, r) => n + columnsOf(r.text), 0) - 2)
      const text = truncate(i === 0 ? words : readout, room)
      const run = i === 0 ? wordsRun(text) : readoutRun(text)
      return [...artRow, ...spaces('gap', 2), run, ...spaces('pad', room - columnsOf(text))]
    })
  }

  if (plateWidth === undefined) return [[wordsRun(words), ...spaces('gap', 2), readoutRun(readout)]]

  const room = plateWidth - 2 - columnsOf(readout)
  if (room >= 4) {
    const text = truncate(words, room)
    return [[wordsRun(text), ...spaces('gap', 2), readoutRun(readout), ...spaces('pad', room - columnsOf(text))]]
  }
  // PD4: no room for both, so the whole line truncates and the readout run is dropped.
  const text = truncate(`${words}  ${readout}`, plateWidth)
  return [[wordsRun(text), ...spaces('pad', plateWidth - columnsOf(text))]]
}

export function rowOneText(input: { message: string | null; word: string; surface: string; phrase: string; catchphrase: string | undefined }): { text: string; isCatchphrase: boolean } {
  const clean = (s: string) => cleanLine(s.replace(/\r\n|[\n\r\u2028\u2029]/g, ' '))
  if (input.message) return { text: clean(input.message), isCatchphrase: false }
  if ((input.surface === 'desktop' || input.surface === 'vscode') && input.word !== 'Working') return { text: clean(input.word), isCatchphrase: false }
  if (input.catchphrase) return { text: clean(input.catchphrase), isCatchphrase: true }
  return { text: clean(input.phrase), isCatchphrase: false }
}
