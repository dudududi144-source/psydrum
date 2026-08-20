// Phase 2 tests — observability counters increment correctly and stay
// consistent (total drops == sum of drop reasons).

import { describe, it, expect } from 'bun:test'
import {
  createCounters,
  resetCounters,
  incrementDrop,
  snapshotCounters,
} from '../../src/psy-drum/counters'

describe('drum counters', () => {
  it('createCounters starts every counter at zero', () => {
    const c = createCounters()
    expect(c.eventsReceived).toBe(0)
    expect(c.eventsDropped).toBe(0)
    expect(c.voicesOn).toBe(0)
    expect(c.voicesStolen).toBe(0)
    expect(c.unknownChannel).toBe(0)
    expect(c.staleDrop).toBe(0)
    expect(c.invalidEvent).toBe(0)
    expect(c.chokeCount).toBe(0)
    expect(c.kitLoadErrors).toBe(0)
    expect(c.sampleFallbacks).toBe(0)
    expect(c.velocityNormalized).toBe(0)
  })

  it('counters increment independently', () => {
    const c = createCounters()
    c.eventsReceived = c.eventsReceived + 2
    c.voicesOn = c.voicesOn + 1
    c.voicesStolen = c.voicesStolen + 1
    c.chokeCount = c.chokeCount + 1
    c.kitLoadErrors = c.kitLoadErrors + 1
    c.sampleFallbacks = c.sampleFallbacks + 1
    expect(c.eventsReceived).toBe(2)
    expect(c.voicesOn).toBe(1)
    expect(c.voicesStolen).toBe(1)
    expect(c.chokeCount).toBe(1)
    expect(c.kitLoadErrors).toBe(1)
    expect(c.sampleFallbacks).toBe(1)
  })

  it('incrementDrop bumps the total and the matching sub-counter', () => {
    const c = createCounters()
    incrementDrop(c, 'unknown-channel')
    incrementDrop(c, 'stale')
    incrementDrop(c, 'invalid-event')
    incrementDrop(c, 'stale')
    expect(c.eventsDropped).toBe(4)
    expect(c.unknownChannel).toBe(1)
    expect(c.staleDrop).toBe(2)
    expect(c.invalidEvent).toBe(1)
  })

  it('drop total stays consistent with the reason breakdown', () => {
    const c = createCounters()
    incrementDrop(c, 'unknown-channel')
    incrementDrop(c, 'invalid-event')
    expect(c.eventsDropped).toBe(c.unknownChannel + c.staleDrop + c.invalidEvent)
  })

  it('snapshotCounters returns an independent copy', () => {
    const c = createCounters()
    c.eventsReceived = 7
    const snap = snapshotCounters(c)
    expect(snap.eventsReceived).toBe(7)
    c.eventsReceived = 99
    expect(snap.eventsReceived).toBe(7)
  })

  it('resetCounters zeros everything', () => {
    const c = createCounters()
    c.eventsReceived = 5
    c.eventsDropped = 3
    c.unknownChannel = 3
    c.chokeCount = 2
    resetCounters(c)
    expect(c.eventsReceived).toBe(0)
    expect(c.eventsDropped).toBe(0)
    expect(c.unknownChannel).toBe(0)
    expect(c.chokeCount).toBe(0)
  })
})
