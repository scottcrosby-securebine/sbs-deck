import { expect, test } from 'claude-code/testing'

import { artRuns, createCanvas, drawFrame, noise } from './canvas'
import type { Reel } from './canvas'

test('each layer draws the expected glyph and colors', () => {
  const c = createCanvas(32)
  c.bg(0, 0, 'deep')
  c.pix(1, 0, 'hot'); c.pix(1, 1, 'cool')
  c.pix(2, 2, 'spark')
  c.put(6, 0, 'cool'); c.put(7, 3, 'hot', 2)
  c.glyph(4, 1, 'ｱ', 'spark')
  const cells = c.cells()
  expect(cells[0]?.[0]).toEqual({ char: ' ', fg: null, bg: 'deep' })
  expect(cells[0]?.[1]).toEqual({ char: '▀', fg: 'hot', bg: 'cool' })
  expect(cells[1]?.[2]).toEqual({ char: '▀', fg: 'spark', bg: null })
  expect(cells[0]?.[3]).toEqual({ char: String.fromCharCode(0x2800 + 0x01 + 0x80), fg: 'hot', bg: null })
  expect(cells[1]?.[4]).toEqual({ char: 'ｱ', fg: 'spark', bg: null })
})

test('equal-priority dots resolve to the first in scan order', () => {
  const c = createCanvas(32)
  c.put(1, 0, 'hot'); c.put(0, 3, 'cool')
  expect(c.cells()[0]?.[0]?.fg).toBe('cool')
})

test('a reel without compact is cropped to its center on the 16-column form', () => {
  const marker: Reel = { name: 'marker', title: '', source: '', contexts: [], rare: false,
    variants: { only: { loop: 36, beats: [{ at: 0, phrase: 'X' }] } },
    draw: (canvas) => { canvas.glyph(8, 0, 'A', 'spark'); canvas.glyph(23, 0, 'B', 'spark') } }
  const row = drawFrame(marker, 'only', 0, 1, 16)[0] ?? []
  expect(row).toHaveLength(16)
  expect([row[0]?.char, row[15]?.char]).toEqual(['A', 'B'])
})

test('art runs merge neighbours and paint an unset background as the plate', () => {
  const c = createCanvas(32)
  c.glyph(0, 0, 'A', 'spark'); c.glyph(1, 0, 'B', 'spark')
  const first = artRuns(c.cells(), 'nightcity')[0]?.[0]
  expect(first).toEqual({ text: 'AB', color: '#F3E600', backgroundColor: '#000000', part: 'art' })
})

test('noise is deterministic and stays in range', () => {
  expect(noise(3, 4)).toBe(noise(3, 4))
  expect(noise(3, 4)).not.toBe(noise(4, 3))
  expect(noise(9) >= 0 && noise(9) < 1).toBe(true)
})
