import { expect, test } from 'claude-code/testing'

import { artRuns, createCanvas } from './canvas'
import type { Part, Run } from './canvas'
import { ROLES } from './theme'
import { columnsOf, layoutLine, rowOneText, tierFor } from './workline'

const fixture = (cols: 32 | 16) => {
  const c = createCanvas(cols)
  c.pix(1, 0, 'hot'); c.pix(2, 3, 'cool'); c.glyph(5, 1, 'ｱ', 'spark')
  return artRuns(c.cells(), 'securebine')
}
const ART32 = fixture(32)
const ART16 = fixture(16)

const width = (row: Run[]) => row.reduce((n, run) => n + columnsOf(run.text), 0)
const part = (row: Run[] | undefined, name: Part) => row?.filter(r => r.part === name).map(r => r.text).join('') ?? ''

test('the tiers follow the width and the surface', () => {
  expect(tierFor('terminal', { columns: 80, rows: 40 }, false)).toBe('full')
  expect(tierFor('terminal', { columns: 79, rows: 40 }, false)).toBe('compact')
  expect(tierFor('terminal', { columns: 60, rows: 40 }, false)).toBe('compact')
  expect(tierFor('terminal', { columns: 59, rows: 40 }, false)).toBe('one-row')
  expect(tierFor('terminal', undefined, false)).toBe('one-row')
  expect(tierFor('terminal', { columns: 120, rows: 11 }, false)).toBe('one-row')
  expect(tierFor('desktop', { columns: 120, rows: 40 }, false)).toBe('one-row')
  expect(tierFor('terminal', { columns: 120, rows: 40 }, true)).toBe('one-row')
})

test('at 80 columns both rows fill the plate exactly and the words truncate', () => {
  const rows = layoutLine({ theme: 'nightcity', tier: 'full', columns: 80, art: ART32,
    words: 'Quickhacking the subnet with a very long tail that cannot fit', isCatchphrase: false, readout: '12s · ~4.2k tokens · effort high' })
  expect(rows.map(width)).toEqual([80, 80])
  expect(rows.flat().every(run => run.backgroundColor !== undefined)).toBe(true)
  expect(part(rows[0], 'words')).toMatch(/^Quickhacking.*…$/)
  expect(part(rows[1], 'readout')).toBe('12s · ~4.2k tokens · effort high')
})

test('a combining mark adds no column, so the pad makes up the plate', () => {
  const rows = layoutLine({ theme: 'securebine', tier: 'full', columns: 80, art: ART32,
    words: 'é', isCatchphrase: false, readout: '3s' })
  expect(part(rows[0], 'pad')).toHaveLength(80 - 32 - 2 - 1)
})

test('a wide character counts two columns and the row still fills the plate', () => {
  const rows = layoutLine({ theme: 'securebine', tier: 'full', columns: 80, art: ART32,
    words: '漢字 build output from a long command', isCatchphrase: false, readout: '3s · 12 tokens' })
  expect(rows.map(width)).toEqual([80, 80])
})

test('a wide character that does not fit the edge is dropped and padded', () => {
  const rows = layoutLine({ theme: 'securebine', tier: 'full', columns: 80, art: ART32,
    words: 'x'.repeat(44) + '漢字', isCatchphrase: false, readout: '3s' })
  expect(rows.map(width)).toEqual([80, 80])
  expect(part(rows[0], 'words')).toBe('x'.repeat(44) + '…')
})

test('the one-row form keeps the readout whole and truncates the phrase', () => {
  const [row] = layoutLine({ theme: 'securebine', tier: 'one-row', columns: 59, art: undefined,
    words: 'Opening hailing frequencies', isCatchphrase: false, readout: '1m 4s · ~4.2k tokens · effort high' })
  expect(part(row, 'readout')).toBe('1m 4s · ~4.2k tokens · effort high')
  expect(width(row ?? [])).toBe(59)
})

test('with no width known the plate is as wide as the text', () => {
  const [row] = layoutLine({ theme: 'securebine', tier: 'one-row', columns: undefined, art: undefined,
    words: 'Jacking in', isCatchphrase: false, readout: '3s · 12 tokens' })
  expect(row?.map(r => r.text).join('')).toBe('Jacking in  3s · 12 tokens')
})

test('row 1 takes the message, then the desktop word, then the catchphrase, then the phrase', () => {
  const base = { message: null, word: 'Baking', surface: 'terminal', phrase: 'Jacking in', catchphrase: undefined }
  expect(rowOneText({ ...base, message: 'Compacting' }).text).toBe('Compacting')
  expect(rowOneText({ ...base, surface: 'desktop', word: 'Running tests' }).text).toBe('Running tests')
  expect(rowOneText({ ...base, surface: 'desktop', word: 'Working' }).text).toBe('Jacking in')
  expect(rowOneText({ ...base, catchphrase: 'END OF LINE' })).toEqual({ text: 'END OF LINE', isCatchphrase: true })
  expect(rowOneText({ ...base, message: 'a\u001b[31mb\tc' }).text).toBe('ab    c')
  expect(rowOneText({ ...base, message: 'Compacting\nnow' }).text).toBe('Compacting now')
  expect(columnsOf('é')).toBe(1)
  expect(columnsOf('e᷀')).toBe(1)
})

test('the compact tier keeps the gap and fills 60 columns', () => {
  const rows = layoutLine({ theme: 'securebine', tier: 'compact', columns: 60, art: ART16,
    words: 'Opening hailing frequencies to the far side', isCatchphrase: false, readout: '3s · 12 tokens' })
  expect(rows.map(width)).toEqual([60, 60])
  expect(part(rows[0], 'gap')).toBe('  ')
  expect(part(rows[1], 'gap')).toBe('  ')
})

test('at 20 columns the one-row form truncates the whole line and never exceeds the plate', () => {
  const [row] = layoutLine({ theme: 'securebine', tier: 'one-row', columns: 20, art: undefined,
    words: 'Opening hailing frequencies', isCatchphrase: false, readout: '1m 4s · ~4.2k tokens' })
  expect(width(row ?? [])).toBe(20)
  expect(part(row, 'readout')).toBe('')
  expect(part(row, 'words')).toMatch(/^Opening.*…$/)
})

test('a catchphrase run is bold in the phrase role', () => {
  const rows = layoutLine({ theme: 'nightcity', tier: 'full', columns: 80, art: ART32,
    words: 'END OF LINE', isCatchphrase: true, readout: '3s' })
  const words = rows[0]?.find(r => r.part === 'words')
  expect(words?.bold).toBe(true)
  expect(words?.color).toBe(ROLES.nightcity.phrase.color)
  const plain = layoutLine({ theme: 'nightcity', tier: 'full', columns: 80, art: ART32,
    words: 'Jacking in', isCatchphrase: false, readout: '3s' })[0]?.find(r => r.part === 'words')
  expect(plain?.bold).toBeFalsy()
})

test('emoji count two columns and the rows still fill the plate', () => {
  expect(columnsOf('✅')).toBe(2)
  const rows = layoutLine({ theme: 'securebine', tier: 'full', columns: 80, art: ART32,
    words: '✅ ⚡ ⭐ 🇯🇵 done', isCatchphrase: false, readout: '3s' })
  expect(rows.map(width)).toEqual([80, 80])
})
