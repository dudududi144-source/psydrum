// Audit P0.1 regression tests — latency reporting is HONEST.
//
// reportLatencyMs() = round(contextOutputLatency*1000) + triggerOverhead,
// where contextOutputLatency prefers ctx.outputLatency (baseLatency +
// OS/hardware estimate) and falls back to ctx.baseLatency / 0 when
// unsupported. Trigger overhead is measured once at the first trigger (B9)
// and frozen afterwards. capabilities().latencyMs reads the same source.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'

interface LatencyOpts {
  outputLatency?: number
  baseLatency?: number
}

function makeLatencyDevice(opts: LatencyOpts) {
  const node = () => ({ connect: () => {}, disconnect: () => {} })
  const param = (v: number) => ({
    value: v,
    setValueAtTime: (): void => {},
    linearRampToValueAtTime: (): void => {},
    exponentialRampToValueAtTime: (): void => {},
  })
  const ctx: Record<string, unknown> = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => ({ ...node(), gain: param(1) }),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: param(100), start: () => {}, stop: () => {} }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param(1000), Q: param(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => ({ ...node(), buffer: null, start: () => {}, stop: () => {} }),
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: param(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  if (opts.outputLatency !== undefined) ctx.outputLatency = opts.outputLatency
  if (opts.baseLatency !== undefined) ctx.baseLatency = opts.baseLatency
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: 3,
  })
  device.onStart()
  return device
}

describe('audit P0.1 - context output latency selection', () => {
  it('prefers ctx.outputLatency over ctx.baseLatency', () => {
    const device = makeLatencyDevice({ outputLatency: 0.008, baseLatency: 0.005 })
    expect(device.reportLatencyMs()).toBe(8) // 8ms, not 5ms
  })

  it('falls back to ctx.baseLatency when outputLatency is unsupported', () => {
    const device = makeLatencyDevice({ baseLatency: 0.005 })
    expect(device.reportLatencyMs()).toBe(5)
  })

  it('treats a zero outputLatency as unsupported (falls back to baseLatency)', () => {
    const device = makeLatencyDevice({ outputLatency: 0, baseLatency: 0.005 })
    expect(device.reportLatencyMs()).toBe(5)
  })

  it('reports 0 context latency when neither is available (OfflineAudioContext-like)', () => {
    const device = makeLatencyDevice({})
    expect(device.reportLatencyMs()).toBe(0)
  })
})

describe('audit P0.1 - trigger overhead is measured once and frozen', () => {
  it('report never decreases, freezes after the first measurement', () => {
    const device = makeLatencyDevice({ outputLatency: 0.008, baseLatency: 0.005 })
    const contextOnly = device.reportLatencyMs()
    expect(contextOnly).toBe(8)

    device.onEvent({ type: 'note', note: 36, velocity: 100, duration: 0.1, channel: 'kick', at: 0 })
    const afterFirst = device.reportLatencyMs()
    expect(afterFirst).toBeGreaterThanOrEqual(contextOnly)
    expect(Number.isFinite(afterFirst)).toBe(true)

    device.onEvent({ type: 'note', note: 36, velocity: 100, duration: 0.1, channel: 'kick', at: 0 })
    expect(device.reportLatencyMs()).toBe(afterFirst) // frozen
  })

  it('capabilities().latencyMs reads the SAME source as reportLatencyMs()', () => {
    const device = makeLatencyDevice({ outputLatency: 0.008, baseLatency: 0.005 })
    device.onEvent({ type: 'note', note: 36, velocity: 100, duration: 0.1, channel: 'kick', at: 0 })
    expect(device.capabilities().latencyMs).toBe(device.reportLatencyMs())
  })
})
