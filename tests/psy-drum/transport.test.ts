// Phase D tests (ROADMAP D1) - TransportClock.
// These tests use fake timers so we can assert beat/bar advancement without
// waiting for real time to pass.

import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test'
import { TransportClock } from '../../src/psy-drum/transport'

describe('TransportClock (D1)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('starts at beat 0, bar 1', () => {
    const t = new TransportClock()
    const pos = t.getPosition()
    expect(pos.beat).toBe(0)
    expect(pos.bar).toBe(1)
  })

  it('advances beats on each tick', () => {
    const t = new TransportClock()
    t.setBpm(120) // 500ms per beat
    const beats: number[] = []
    t.subscribe({ onBeat: (b) => beats.push(b) })
    t.start()
    jest.advanceTimersByTime(500) // 1 beat
    t.stop()
    expect(beats.length).toBe(1)
  })

  it('fires onBar after beatsPerBar beats', () => {
    const t = new TransportClock()
    t.setBpm(120)
    let bars = 0
    t.subscribe({ onBar: () => bars++ })
    t.start()
    jest.advanceTimersByTime(500 * 4) // 4 beats = 1 bar
    t.stop()
    expect(bars).toBe(1)
  })

  it('notifies subscribers of BPM changes', () => {
    const t = new TransportClock()
    let seen = 0
    t.subscribe({ onBpmChange: (b) => { seen = b } })
    t.setBpm(150)
    expect(seen).toBe(150)
  })

  it('clamps BPM to a sane range', () => {
    const t = new TransportClock()
    t.setBpm(9999)
    expect(t.getBpm()).toBeLessThanOrEqual(300)
    t.setBpm(1)
    expect(t.getBpm()).toBeGreaterThanOrEqual(20)
  })

  it('stops advancing after stop()', () => {
    const t = new TransportClock()
    t.setBpm(120)
    const beats: number[] = []
    t.subscribe({ onBeat: (b) => beats.push(b) })
    t.start()
    jest.advanceTimersByTime(500)
    t.stop()
    jest.advanceTimersByTime(5000)
    t.stop()
    expect(beats.length).toBe(1)
  })

  it('reset() returns to beat 0 bar 1', () => {
    const t = new TransportClock()
    t.setBpm(120)
    t.start()
    jest.advanceTimersByTime(500 * 5)
    t.stop()
    t.reset()
    const pos = t.getPosition()
    expect(pos.beat).toBe(0)
    expect(pos.bar).toBe(1)
  })
})
