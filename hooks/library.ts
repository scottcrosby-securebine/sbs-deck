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

// Each launch reel's /config switch: a boolean userConfig field in
// .claude-plugin/plugin.json named reel plus its name, `reelHokuto`.
export const reelField = (name: string) => `reel${name.charAt(0).toUpperCase()}${name.slice(1)}`

// The launch reels switched off in /config. A reel with no field counts as on.
export const offReels = (options: Readonly<Record<string, unknown>>): string[] =>
  NEW_REELS.filter(r => options[reelField(r.name)] === false).map(r => r.name)

// The plugin.json userConfig lines missing for launch reels: the options hold
// every field the manifest declares, so a missing key is a missing line.
export const unlistedFields = (options: Readonly<Record<string, unknown>>): string[] =>
  NEW_REELS.filter(r => !Object.hasOwn(options, reelField(r.name))).map(r =>
    `${JSON.stringify(reelField(r.name))}: ${JSON.stringify({ type: 'boolean', title: `Reel: ${r.title}`, description: `From ${r.source}.`, required: false, default: true })}`)
