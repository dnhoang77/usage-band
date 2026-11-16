export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snap = { limits: Limit[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snap: Snap | null; now: number; isHidden: boolean }
  }
}
