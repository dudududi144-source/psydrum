// Audit M2c + B9 regression tests.
//
// M2c — clap tap jitter: the last dead variance primitive. Taps 2/3 of the
//       clap burst wander +-CLAP_JITTER_MS around their 12/24ms slots (seeded,
//       deterministic); tap 1 stays the timing reference.
// B9  — trigger overhead MEASURED once at the first trigger (never
//       hardcoded), feeding reportLatencyMs()/capabilities() (audit B9).

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import { defaultDrumConfig } from '../../src/psy-drum/types'

// ─── Recording mock AudioContext ─────────────────────────────────────────────

interface RecParam {
  value: number
  linRamps: Array<{ v: number; t: number }>
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function countingParam(value: number): RecParam {
  const linRamps: Array<{ v: number; t: number }> = []
  const p: RecParam = {
    value: value,
    linRamps: linRamps,
    setValueAtTime: (): void => {},
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => {},
  }
  return p
}

interface RecGain { gain: RecParam }

function makeClapDevice(humanize: boolean, optsSeed: number) {
  const gains: RecGain[] = []
  const node = () => ({ connect: () => {}, disconnect: () => {} })
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => {
      const g = { ...node(), gain: countingParam(1) }
      gains.push(g)
      return g
    },
    createOscillator: () => ({ ...node(), type: 'sine', frequency: countingParam(100), start: () => {}, stop: () => {} }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: countingParam(1000), Q: countingParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => ({ ...node(), buffer: null, start: () => {}, stop: () => {} }),
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: countingParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const config = defaultDrumConfig()
  config.humanize = humanize
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: optsSeed,
    config: config,
  })
  device.onStart()
  // clap voice = 3 stacked noise taps; each envGain's attack ramp time encodes
  // the tap offset (envGain floors attack at 1ms).
  function clap(): number[] {
    const g0 = gains.length
    device.onEvent({ type: 'note', note: 39, velocity: 100, duration: 0.1, channel: 'clap', at: 0 })
    const taps: number[] = []
    for (let i = 0; i < 3; i++) {
      const g = gains[g0 + i]
      taps.push(g.gain.linRamps[0].t * 1000) // ms
    }
    return taps
  }
  return { device, clap }
}

describe('audit M2c - clap tap jitter (humanize ON)', () => {
  it('tap 1 is the fixed reference; taps 2/3 wander within +-1.5ms of 12/24ms', () => {
    const { clap } = makeClapDevice(true, 11)
    const a = clap()
    const b = clap()
    // tap 1: envGain attack floor = 1ms, identical every hit
    expect(a[0]).toBeCloseTo(1, 6)
    expect(b[0]).toBeCloseTo(1, 6)
    // taps 2/3 wander (jittered) but stay in band and ordered
    expect(a[1]).toBeGreaterThanOrEqual(10.5)
    expect(a[1]).toBeLessThanOrEqual(13.5)
    expect(a[2]).toBeGreaterThanOrEqual(22.5)
    expect(a[2]).toBeLessThanOrEqual(25.5)
    expect(a[2]).toBeGreaterThan(a[1])
    expect(b[1]).toBeGreaterThanOrEqual(10.5)
    expect(b[1]).toBeLessThanOrEqual(13.5)
    expect(b[2]).toBeGreaterThanOrEqual(22.5)
    expect(b[2]).toBeLessThanOrEqual(25.5)
    // the two hits are not clones (anti machine-gun)
    expect(a[1] !== b[1] || a[2] !== b[2]).toBe(true)
  })

  it('same seed => identical jitter sequence', () => {
    const a = makeClapDevice(true, 23)
    const b = makeClapDevice(true, 23)
    for (let i = 0; i < 3; i++) {
      expect(a.clap()).toEqual(b.clap())
    }
  })
})

describe('audit M2c - jitter is gated by config.humanize', () => {
  it('humanize OFF: fixed 0/12/24ms taps, bit-identical between hits', () => {
    const { clap } = makeClapDevice(false, 11)
    const a = clap()
    const b = clap()
    expect(a[0]).toBeCloseTo(1, 6) // 0ms tap -> envGain 1ms attack floor
    expect(a[1]).toBeCloseTo(12, 6)
    expect(a[2]).toBeCloseTo(24, 6)
    expect(a).toEqual(b)
  })
})

describe('audit B9 - trigger overhead is measured, once, from the same source', () => {
  it('reportLatencyMs >= base after the first trigger, then frozen', () => {
    const { device, clap } = makeClapDevice(true, 11)
    const base = device.reportLatencyMs()
    expect(base).toBe(5) // mock baseLatency 0.005s, overhead not measured yet

    clap()
    const afterFirst = device.reportLatencyMs()
    expect(Number.isFinite(afterFirst)).toBe(true)
    expect(afterFirst).toBeGreaterThanOrEqual(base)

    clap()
    clap()
    expect(device.reportLatencyMs()).toBe(afterFirst) // recorded exactly once
  })

  it('capabilities().latencyMs reads the same source as reportLatencyMs()', () => {
    const { device, clap } = makeClapDevice(true, 11)
    clap()
    expect(device.capabilities().latencyMs).toBe(device.reportLatencyMs())
  })
})
