// Audit V2 regression tests — the variance machinery is finally WIRED.
//
// Before this fix the device created a seeded VarianceSource and never called
// it: kit.humanize had no audible effect and identical hits machine-gunned.
// Now velocity micro-humanize (+-3%, seeded) is applied at the device boundary
// — deterministic per seed, and ONLY on velocity: pitch mapping, choke,
// routing and drop policy are never touched by variance.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import { defaultDrumConfig } from '../../src/psy-drum/types'

// ─── Recording mock AudioContext ─────────────────────────────────────────────

interface RecParam {
  value: number
  linRamps: Array<{ v: number; t: number }>
  setValues: Array<{ v: number; t: number }>
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function countingParam(value: number): RecParam {
  const linRamps: Array<{ v: number; t: number }> = []
  const setValues: Array<{ v: number; t: number }> = []
  const p: RecParam = {
    value: value,
    linRamps: linRamps,
    setValues: setValues,
    setValueAtTime: (v: number, t: number): void => { setValues.push({ v: v, t: t }) },
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => {},
  }
  return p
}

interface RecGain { gain: RecParam }
interface RecOsc { frequency: RecParam }

function makeDevice(humanize: boolean, optsSeed: number) {
  const gains: RecGain[] = []
  const oscs: RecOsc[] = []
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
    createOscillator: () => {
      const o = { ...node(), type: 'sine', frequency: countingParam(100), start: () => {}, stop: () => {} }
      oscs.push(o)
      return o
    },
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
  function triggerKick() {
    const g0 = gains.length
    const o0 = oscs.length
    device.onEvent({ type: 'note', note: 36, velocity: 100, duration: 0.1, channel: 'kick', at: 0 })
    return { voiceGains: gains.slice(g0), voiceOscs: oscs.slice(o0) }
  }
  return { device, triggerKick }
}

function kickPeak(voiceGains: RecGain[]): number {
  // the kick voice's envGain ramps to params.gain (no peakScale on kick)
  return voiceGains[0].gain.linRamps[0].v
}

const BASE = 100 / 127 // legacy velocity 100 on the 0..127 DSP scale

describe('audit V2 - velocity humanize is wired (anti machine-gun)', () => {
  it('humanize ON: identical hits get +-3% velocity variance', () => {
    const { triggerKick } = makeDevice(true, 21)
    const peaks: number[] = []
    for (let i = 0; i < 4; i++) peaks.push(kickPeak(triggerKick().voiceGains))
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(BASE * 0.97 - 1e-9)
      expect(p).toBeLessThanOrEqual(BASE * 1.03 + 1e-9)
    }
    // not a machine gun: at least two distinct levels in 4 hits
    expect(new Set(peaks.map((p) => p.toFixed(6))).size).toBeGreaterThan(1)
  })

  it('humanize OFF: identical hits stay bit-identical', () => {
    const { triggerKick } = makeDevice(false, 21)
    const peaks: number[] = []
    for (let i = 0; i < 4; i++) peaks.push(kickPeak(triggerKick().voiceGains))
    for (const p of peaks) expect(p).toBeCloseTo(BASE, 10)
  })
})

describe('audit V2 - variance is deterministic per seed', () => {
  it('same seed => identical humanize sequence', () => {
    const a = makeDevice(true, 11)
    const b = makeDevice(true, 11)
    for (let i = 0; i < 3; i++) {
      const pa = kickPeak(a.triggerKick().voiceGains)
      const pb = kickPeak(b.triggerKick().voiceGains)
      expect(pa).toBe(pb)
    }
  })

  it('variance never touches pitch (kick startHz identical across hits)', () => {
    const { triggerKick } = makeDevice(true, 33)
    const first = triggerKick().voiceOscs[0].frequency.setValues[0].v
    for (let i = 0; i < 3; i++) {
      const hz = triggerKick().voiceOscs[0].frequency.setValues[0].v
      expect(hz).toBe(first) // 165Hz, every hit — pitch never varies
    }
  })
})
