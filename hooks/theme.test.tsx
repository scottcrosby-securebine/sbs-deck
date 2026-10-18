import { expect, test } from 'claude-code/testing'

import { colorLine } from './color'
import { isPhrase } from './reel-rules'
import { NIGHT_CITY_PHRASES, SPINNER_PHRASES } from './spinner'
import { CUT_CORNER_TERMINALS, ROLES, THEME_NAMES, contrast, cutsCorners, to256 } from './theme'
import type { Role, ThemeName } from './theme'

const round2 = (n: number) => Math.round(n * 100) / 100

test('to256 rounds each channel to the cube level, as Claude Code does in tmux', () => {
  expect(to256('#C5003C')).toBe('#d7005f')
  expect(to256('#880425')).toBe('#af005f')
  expect(to256('#F3E600')).toBe('#ffff00')
  expect(to256('#55EAD4')).toBe('#87ffd7')
})

test('contrast gives the WCAG ratios of yellow and red on black', () => {
  expect(round2(contrast('#F3E600', '#000000'))).toBe(16.13)
  expect(round2(contrast('#C5003C', '#000000'))).toBe(3.44)
  expect(round2(contrast('#F3E600', '#880425'))).toBe(7.71)
  expect(round2(contrast(to256('#F3E600'), to256('#880425')))).toBe(6.54)
})

test('every text role reads at 4.5:1 on its plate or black, also at 256 colors', () => {
  const exempt: Record<ThemeName, readonly Role[]> = {
    securebine: ['frame', 'queued', 'queuedFrame', 'comment'],
    nightcity: ['frame'],
  }
  for (const theme of THEME_NAMES) {
    for (const [role, paint] of Object.entries(ROLES[theme])) {
      if (!paint.color || exempt[theme].includes(role as Role)) continue
      const ground = paint.backgroundColor ?? '#000000'
      expect(contrast(paint.color, ground), `${theme} ${role}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(to256(paint.color), to256(ground)), `${theme} ${role} at 256`).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('dark red is never a text color', () => {
  for (const theme of THEME_NAMES) {
    for (const paint of Object.values(ROLES[theme])) expect(paint.color).not.toBe('#880425')
  }
})

test('output coloring takes its colors from the theme', () => {
  expect(colorLine('link down', 'nightcity')[1]?.style).toEqual({ color: '#F3E600', backgroundColor: '#C5003C', bold: true })
  expect(colorLine('link down')[1]?.style).toEqual({ color: '#FF5555', bold: true })
})

test('cutsCorners reads TMUX first, then the terminal\'s own variable, then TERM', () => {
  expect(cutsCorners({ WT_SESSION: '1', TERM: 'xterm' }, ['windows-terminal'])).toBe(true)
  expect(cutsCorners({ TMUX: '/tmp/t', WT_SESSION: '1', TERM: 'xterm' }, ['windows-terminal'])).toBe(false)
  expect(cutsCorners({ TERM_PROGRAM: 'iTerm.app', WT_SESSION: '1' }, ['windows-terminal'])).toBe(false)
  expect(cutsCorners({ TERM_PROGRAM: 'iTerm.app' }, ['iTerm.app'])).toBe(true)
  expect(cutsCorners({ KITTY_WINDOW_ID: '3', TERM: 'xterm-kitty' }, ['kitty'])).toBe(true)
  expect(cutsCorners({ ALACRITTY_WINDOW_ID: '1', TERM: 'xterm-256color' }, ['xterm-256color'])).toBe(false)
  expect(cutsCorners({ ALACRITTY_WINDOW_ID: '1' }, ['alacritty'])).toBe(true)
  expect(cutsCorners({ TERM: 'xterm-256color' }, ['xterm-256color'])).toBe(true)
  expect(cutsCorners({}, ['xterm-256color'])).toBe(false)
  expect(cutsCorners({ TERM: 'xterm-256color' })).toBe(CUT_CORNER_TERMINALS.includes('xterm-256color'))
})

test('every Night City phrase passes the phrase rules and duplicates nothing', () => {
  const modes = new Set(Object.values(SPINNER_PHRASES).flat())
  expect(NIGHT_CITY_PHRASES.length).toBeGreaterThanOrEqual(24)
  expect(new Set(NIGHT_CITY_PHRASES).size).toBe(NIGHT_CITY_PHRASES.length)
  for (const phrase of NIGHT_CITY_PHRASES) {
    expect(isPhrase(phrase), phrase).toBe(true)
    expect(modes.has(phrase), phrase).toBe(false)
  }
})
