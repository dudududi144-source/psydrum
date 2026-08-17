// Phase 2 tests — measured latency (audit B9): baseLatency + trigger overhead,
// overhead measured once and never hardcoded.

import { describe, it, expect } from 'bun:test'
import {
  createLatencyState,
  recordBaseLatency,
  recordTriggerOverhead,
  reportLatencyMs,
} from '../../src/psy-drum/latency'

describe('measured latency (audit B9)', () => {
  it('reportLatencyMs is baseLatency + trigger overhead', () => {
    const s = createLatencyState()
    recordBaseLatency(s, 0.005) // 5 ms
    recordTriggerOverhead(s, 0.4) // 0.4 ms
    expect(reportLatencyMs(s)).toBe(5) // round(5 + 0.4)
  })

  it('recordBaseLatency converts seconds to whole milliseconds', () => {
    const s = createLatencyState()
    recordBaseLatency(s, 0.0123)
    expect(s.baseLatencyMs).toBe(12)
  })

  it('unmeasured overhead is 0, not a hardcoded guess', () => {
    const s = createLatencyState()
    recordBaseLatency(s, 0.01)
    expect(s.measured).toBe(false)
    expect(s.triggerOverheadMs).toBe(0)
    expect(reportLatencyMs(s)).toBe(10)
  })

  it('trigger overhead is measured once (later calls ignored)', () => {
    const s = createLatencyState()
    recordTriggerOverhead(s, 0.5)
    expect(s.triggerOverheadMs).toBe(0.5)
    expect(s.measured).toBe(true)
    recordTriggerOverhead(s, 99)
    expect(s.triggerOverheadMs).toBe(0.5)
  })

  it('guards non-finite and negative inputs', () => {
    const s = createLatencyState()
    recordBaseLatency(s, Number.NaN)
    expect(s.baseLatencyMs).toBe(0)
    recordBaseLatency(s, -1)
    expect(s.baseLatencyMs).toBe(0)
    recordTriggerOverhead(s, -5)
    expect(s.triggerOverheadMs).toBe(0)
    expect(s.measured).toBe(true)
  })
})
