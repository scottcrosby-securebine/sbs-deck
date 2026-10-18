import type { Reel } from './canvas'
import * as INDEXED from './reels/index'
import { LEGACY_REELS } from './reels/legacy'

export { LEGACY_REELS }
export const INDEXED_KEYS: readonly string[] = Object.keys(INDEXED)
// Object.keys of a module namespace is alphabetical by export name.
export const NEW_REELS: readonly Reel[] = Object.values(INDEXED) as Reel[]
export const ALL_REELS: readonly Reel[] = [...NEW_REELS, ...LEGACY_REELS]

export const reelNamed = (name: string): Reel | undefined => ALL_REELS.find(r => r.name === name)

export const indexLine = (name: string) => `export { default as ${name} } from './${name}'`

export function unindexedLines(fileNames: readonly string[], indexed: readonly string[] = INDEXED_KEYS): string[] {
  return fileNames
    .filter(f => f.endsWith('.ts') && !['index.ts', 'legacy.ts'].includes(f) && !f.startsWith('_') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map(f => f.slice(0, -3))
    .filter(base => !indexed.includes(base))
    .map(indexLine)
}
