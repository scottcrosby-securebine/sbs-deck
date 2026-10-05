export type SpinnerTick = number

declare module 'claude-code' {
  interface PluginState {
    'sbs-deck': { spinnerTick: SpinnerTick }
  }
}
