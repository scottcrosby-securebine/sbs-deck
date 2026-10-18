import type { Reel, Variant } from './canvas'
import { phasesOf } from './reel-rules'
import type { SpinnerMode } from './spinner'

export type Context = 'agents' | 'long-wait' | 'shell' | 'edit' | 'web' | 'thinking' | 'requesting' | 'other'
export const CONTEXTS: readonly Context[] = ['agents', 'long-wait', 'shell', 'edit', 'web', 'thinking', 'requesting', 'other']

export type Signals = { mode: SpinnerMode; isSubagent: boolean; tool: string | undefined; unchangedMs: number }
export type Entry = { reel: string; variant: string | undefined }
export type Bags = Map<Context, { left: Entry[]; last: string | undefined }>

export const RARE_ODDS = 50
export const LONG_WAIT_MS = 60_000
export const AGENT_TOOLS = ['Agent', 'Task']
export const SHELL_TOOLS = ['Bash']
export const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']
export const WEB_TOOLS = ['WebSearch', 'WebFetch']

export function contextOf({ mode, isSubagent, tool, unchangedMs }: Signals): Context {
  if (isSubagent || (tool && AGENT_TOOLS.includes(tool))) return 'agents'
  if (unchangedMs >= LONG_WAIT_MS) return 'long-wait'
  if (tool && SHELL_TOOLS.includes(tool)) return 'shell'
  if (tool && EDIT_TOOLS.includes(tool)) return 'edit'
  if (tool && (WEB_TOOLS.includes(tool) || (tool.startsWith('mcp__') && /fetch/i.test(tool)))) return 'web'
  if (mode === 'thinking' || mode === 'requesting') return mode
  return 'other'
}

export function poolOf(context: Context, reels: readonly Reel[]): Entry[] {
  const other = () => reels
    .filter(r => !r.rare && !r.legacy && r.name !== 'kodama')
    .map(r => ({ reel: r.name, variant: undefined }))
  if (context === 'other') return other()
  const pool: Entry[] = []
  for (const r of reels) {
    for (const c of r.contexts) {
      const [name, variant] = c.split(':')
      if (name === context) { pool.push({ reel: r.name, variant }); break }
    }
  }
  return pool.length ? pool : other()
}

export function drawFromBag(bags: Bags, context: Context, pool: readonly Entry[], random: () => number): Entry {
  let bag = bags.get(context)
  if (!bag) bags.set(context, bag = { left: [], last: undefined })
  if (!bag.left.length) {
    const left = [...pool]
    for (let i = left.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [left[i], left[j]] = [left[j]!, left[i]!]
    }
    if (left.length > 1 && left[0]!.reel === bag.last) left.push(left.shift()!)
    bag.left = left
  }
  const entry = bag.left.shift()!
  bag.last = entry.reel
  return entry
}

export function nextVariant(reel: Reel, turns: Map<string, number>): string {
  const names = Object.keys(reel.variants)
  const n = turns.get(reel.name) ?? 0
  turns.set(reel.name, n + 1)
  return names[n % names.length]!
}

export function holdEnd(variant: Variant, frame: number): number {
  const { loop } = variant
  const loopEnd = (Math.floor(frame / loop) + 1) * loop
  const phases = phasesOf(variant)
  const first = phases[0]!.start
  const cycle = Math.floor((frame - first) / loop) * loop
  const local = frame - cycle
  const phase = phases.find(p => local >= p.start && local < p.end)
  return Math.min(loopEnd, phase ? phase.end + cycle : loopEnd)
}

export const rollsRare = (random: number): boolean => random < 1 / RARE_ODDS
