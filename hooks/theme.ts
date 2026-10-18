// The color tables every hook reads from: one Paint per role, per theme. This
// file is the only place a hex literal may appear.

export type ThemeName = 'securebine' | 'nightcity'
export const THEME_NAMES: readonly ThemeName[] = ['securebine', 'nightcity']

export type Paint = { color?: string; backgroundColor?: string; bold?: boolean; underline?: boolean }

export type Role =
  | 'frame' | 'label' | 'header' | 'dim' | 'queued' | 'queuedFrame'
  | 'markRunning' | 'markDone' | 'markFailed' | 'phrase' | 'readout' | 'plate'
  | 'good' | 'warn' | 'bad' | 'address' | 'mac' | 'interface' | 'number'
  | 'time' | 'path' | 'url' | 'key' | 'string' | 'hash' | 'comment' | 'rule'

export type Slot = 'base' | 'hot' | 'deep' | 'spark' | 'cool'

const GOLD = '#F5A701'
const CYAN = '#00E5FF'
const MAGENTA = '#FF2E97'
const SLATE = '#46637B'
const INK_DIM = '#8FA3B0'
const AMBER = '#FFC23D'
const GREEN = '#3EE08A'
const RED = '#FF5555'
const PURPLE = '#B26BFF'
const BLACK = '#000000'

const NC_RED = '#C5003C'
const NC_DEEP = '#880425'
const NC_YELLOW = '#F3E600'
const NC_AQUA = '#55EAD4'

const onYellow: Paint = { color: BLACK, backgroundColor: NC_YELLOW, bold: true }
const onAqua: Paint = { color: BLACK, backgroundColor: NC_AQUA, bold: true }
const alarm: Paint = { color: NC_YELLOW, backgroundColor: NC_RED }

export const ROLES: Readonly<Record<ThemeName, Readonly<Record<Role, Paint>>>> = {
  securebine: {
    frame: { color: GOLD },
    label: { color: GOLD, bold: true },
    header: { color: CYAN, bold: true },
    dim: { color: INK_DIM },
    queued: { color: SLATE, bold: true },
    queuedFrame: { color: SLATE },
    markRunning: { color: CYAN },
    markDone: { color: GREEN },
    markFailed: { color: RED },
    phrase: { color: GOLD },
    readout: { color: INK_DIM },
    plate: { backgroundColor: BLACK },
    good: { color: GREEN, bold: true },
    warn: { color: AMBER, bold: true },
    bad: { color: RED, bold: true },
    address: { color: CYAN, bold: true },
    mac: { color: PURPLE },
    interface: { color: GOLD },
    number: { color: AMBER },
    time: { color: '#6FA8DC' },
    path: { color: '#7FC8D8' },
    url: { color: CYAN, underline: true },
    key: { color: MAGENTA },
    string: { color: '#9FD6A8' },
    hash: { color: PURPLE },
    comment: { color: '#5E7583' },
    rule: { color: MAGENTA, bold: true },
  },
  nightcity: {
    frame: { color: NC_RED },
    label: onYellow,
    header: onAqua,
    dim: { color: NC_AQUA },
    queued: { color: NC_YELLOW, backgroundColor: NC_DEEP, bold: true },
    queuedFrame: { color: NC_YELLOW },
    markRunning: { color: NC_AQUA },
    markDone: { color: NC_AQUA },
    markFailed: alarm,
    phrase: { color: NC_YELLOW },
    readout: { color: NC_AQUA },
    plate: { backgroundColor: BLACK },
    good: { color: NC_AQUA, bold: true },
    warn: { color: NC_YELLOW, bold: true },
    bad: { ...alarm, bold: true },
    address: { color: NC_AQUA, bold: true },
    mac: { color: NC_YELLOW },
    interface: { color: NC_YELLOW },
    number: { color: NC_YELLOW },
    time: { color: NC_AQUA },
    path: { color: NC_AQUA },
    url: { color: NC_AQUA, underline: true },
    key: { color: NC_YELLOW, bold: true },
    string: { color: NC_AQUA },
    hash: { color: NC_YELLOW },
    comment: { color: NC_AQUA },
    rule: { color: NC_YELLOW, backgroundColor: NC_DEEP, bold: true },
  },
}

export const SLOTS: Readonly<Record<ThemeName, Readonly<Record<Slot, string>>>> = {
  securebine: { base: BLACK, hot: MAGENTA, deep: SLATE, spark: GOLD, cool: CYAN },
  nightcity: { base: BLACK, hot: NC_RED, deep: NC_DEEP, spark: NC_YELLOW, cool: NC_AQUA },
}

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const toHex = (values: number[]) => '#' + values.map(v => v.toString(16).padStart(2, '0')).join('')

// WCAG relative luminance.
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const CUBE = [0, 95, 135, 175, 215, 255]

// Each channel rounds to the nearest of the six cube levels by index, as Claude
// Code does under tmux.
export function to256(hex: string): string {
  return toHex(channels(hex).map(v => CUBE[Math.round((v / 255) * 5)]!))
}

export function blend(a: string, b: string, t: number): string {
  const [x, y] = [channels(a), channels(b)]
  return toHex(x.map((v, i) => Math.round(v + (y[i]! - v) * t)))
}

// The terminals whose font lines `╱` up with the box lines, by the name
// cutsCorners gives them. Filled from the owner's checks; empty until then.
// SBS_CUT_CORNERS, a comma-separated list of names, adds terminals to it for
// one session, to try one before it is listed.
export const CUT_CORNER_TERMINALS: readonly string[] = []

// Whether Night City's box may cut its corners here: never under tmux, else
// only for a terminal on the list. The terminal is named by TERM_PROGRAM, then
// its own variable, then TERM last, so WSL in Windows Terminal reads as that.
export function cutsCorners(
  env: Readonly<Record<string, string | undefined>>,
  terminals: readonly string[] = CUT_CORNER_TERMINALS,
): boolean {
  if (env.TMUX) return false
  const name =
    env.TERM_PROGRAM ||
    (env.WT_SESSION && 'windows-terminal') ||
    (env.KITTY_WINDOW_ID && 'kitty') ||
    (env.ALACRITTY_WINDOW_ID && 'alacritty') ||
    env.TERM
  return name ? terminals.includes(name) : false
}
