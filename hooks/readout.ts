export type TurnStats = { startedAt: number; doneTokens: number; stickyChars: number; effort: string | number | undefined }

export const newTurn = (now: number): TurnStats => ({ startedAt: now, doneTokens: 0, stickyChars: 0, effort: undefined })

// An undefined effort keeps the last value.
export const withEffort = (stats: TurnStats, effort: string | number | undefined): TurnStats =>
  effort === undefined ? stats : { ...stats, effort }

// Usage replaces the step's estimate; without it the streamed characters stay as an estimate.
export const endStep = (stats: TurnStats, outputTokens: number | undefined, streamedChars: number): TurnStats =>
  outputTokens === undefined
    ? { ...stats, stickyChars: stats.stickyChars + streamedChars }
    : { ...stats, doneTokens: stats.doneTokens + outputTokens }

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

export const formatTokens = (count: number, isEstimate: boolean): string =>
  `${isEstimate ? '~' : ''}${count < 1000 ? count : `${(count / 1000).toFixed(1)}k`} tokens`

export function readoutText(stats: TurnStats | undefined, now: number, streamingChars: number): string {
  if (!stats) return '-- · -- tokens'
  const tokens = stats.doneTokens + Math.round((stats.stickyChars + streamingChars) / 4)
  const parts = [
    formatElapsed(now - stats.startedAt),
    formatTokens(tokens, streamingChars > 0 || stats.stickyChars > 0),
  ]
  if (stats.effort !== undefined) parts.push(`effort ${stats.effort}`)
  return parts.join(' · ')
}
