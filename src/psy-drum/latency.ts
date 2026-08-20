// PSYDRUM measured latency (phase 2, ARCHITECTURE.md section 5, audit B9).
//
// reportLatencyMs() = round(contextOutputLatency * 1000) + triggerOverhead.
// contextOutputLatency is chosen by the DEVICE at onStart (audit P0.1):
// ctx.outputLatency when available (baseLatency + OS/hardware estimate),
// falling back to ctx.baseLatency, else 0. The trigger overhead is MEASURED
// ONCE at the first trigger — never hardcoded (the B9 lesson). Until
// measurement happens the overhead is 0, so reportLatencyMs() still returns
// a truthful context-only figure.

export interface LatencyState {
  baseLatencyMs: number
  triggerOverheadMs: number
  measured: boolean
}

export function createLatencyState(): LatencyState {
  return { baseLatencyMs: 0, triggerOverheadMs: 0, measured: false }
}

// Context output latency in seconds; store whole milliseconds. A missing /
// non-finite / non-positive value (some OfflineAudioContexts) counts as 0.
export function recordBaseLatency(state: LatencyState, ctxBaseLatencySec: number): void {
  var sec = Number.isFinite(ctxBaseLatencySec) && ctxBaseLatencySec > 0 ? ctxBaseLatencySec : 0
  state.baseLatencyMs = Math.round(sec * 1000)
}

// Record the measured drum-trigger overhead exactly once (audit B9: measured,
// not hardcoded). Later calls are ignored so the figure cannot drift mid-run.
export function recordTriggerOverhead(state: LatencyState, overheadMs: number): void {
  if (state.measured) return
  var ms = Number.isFinite(overheadMs) && overheadMs > 0 ? overheadMs : 0
  state.triggerOverheadMs = ms
  state.measured = true
}

// The value returned by device.reportLatencyMs(). capabilities().latencyMs
// reads the SAME source (audit B9) — the device passes this result through.
export function reportLatencyMs(state: LatencyState): number {
  return Math.round(state.baseLatencyMs + state.triggerOverheadMs)
}
