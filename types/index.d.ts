export type SpinnerTick = number

// One loop's turn, as hooks/readout.ts counts it (the contract cannot import it).
export type TurnStats = { startedAt: number; doneTokens: number; stickyChars: number; effort: string | number | undefined }

declare module 'claude-code' {
  interface PluginState {
    // turnStats is keyed 'main' or the agent id.
    'sbs-deck': { spinnerTick: SpinnerTick; turnStats: Record<string, TurnStats> }
  }
}
