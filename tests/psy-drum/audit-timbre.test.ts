// Audit M2b regression tests — seeded per-hit TIMBRE variance on the realtime
// synthesis path.
//
// Style criterion #4 demands per-hit brightness variance that is DETERMINISTIC
// (same seed => same render). The device now draws timbreVariance(rng, 0.02)
// per trigger (after the velocity draw) and applies it to the noise filter
// centre in voice-synth. Loudness and pitch are untouched by design:
// velocity has its own humanize, pitched drums keep exact MIDI tuning.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import { defaultDrumConfig } from '../../src/psy-drum/types'
import { BUILTIN_KIT_MANIFEST } from '../../src/psy-drum/kit-builtin'

// ─── Recording mock AudioContext ─────────────────────────────────────────────

interface RecParam {
  value: number
  cancels: number
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
    cancels: 0,
    linRamps: linRamps,
    setValueAtTime: (): void => {},
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => { p.cancels = p.cancels + 1 },
  }
  return p
}

interface RecGain { gain: RecParam }
interface RecOsc { frequency: RecParam }
interface RecBiquad { frequency: RecParam }

function makeTimbreDevice(humanize: boolean, optsSeed: number) {
  const gains: RecGain[] = []
  const oscs: RecOsc[] = []
  const biquads: RecBiquad[] = []
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
    createBiquadFilter: () => {
      const b = { ...node(), type: 'lowpass', frequency: countingParam(1000), Q: countingParam(1) }
      biquads.push(b)
      return b
    },
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
  device.loadKit(BUILTIN_KIT_MANIFEST.kits[0]) // psy-classic: snare bpHz 1850, velTrack 0.6
  function snare(velocity: number): { centres: number[]; peaks: number[] } {
    const b0 = biquads.length
    const g0 = gains.length
    device.onEvent({ type: 'note', note: 38, velocity: velocity, duration: 0.1, channel: 'snare', at: 0 })
    const centres = biquads.slice(b0).map((b) => b.frequency.value)
    const peaks = gains.slice(g0).map((g) => (g.gain.linRamps.length > 0 ? g.gain.linRamps[0].v : 0))
    return { centres: centres, peaks: peaks }
  }
  function tom(note: number): number {
    const o0 = oscs.length
    device.onEvent({ type: 'note', note: note, velocity: 100, duration: 0.1, channel: 'tom', at: 0 })
    return oscs[o0].frequency.value
  }
  return { device, snare, tom }
}

// psy-classic snare, vel 100: brightness = 1850 * (1 + (100/127) * 0.6)
const SNARE_BASE = 1850 * (1 + (100 / 127) * 0.6)

describe('audit M2b - per-hit timbre variance (humanize ON)', () => {
  it('identical hits get slightly different noise centres, around the expected value', () => {
    const { snare } = makeTimbreDevice(true, 7)
    const a = snare(100).centres[0]
    const b = snare(100).centres[0]
    expect(a).not.toBe(b) // brightness varies hit-to-hit
    expect(a).toBeGreaterThanOrEqual(SNARE_BASE * 0.975)
    expect(a).toBeLessThanOrEqual(SNARE_BASE * 1.025)
    expect(b).toBeGreaterThanOrEqual(SNARE_BASE * 0.975)
    expect(b).toBeLessThanOrEqual(SNARE_BASE * 1.025)
  })

  it('is deterministic per seed (same seed => identical centre sequence)', () => {
    const a = makeTimbreDevice(true, 19)
    const b = makeTimbreDevice(true, 19)
    for (let i = 0; i < 4; i++) {
      expect(a.snare(100).centres[0]).toBe(b.snare(100).centres[0])
    }
  })

  it('does not touch pitch: hinted toms stay exactly on MIDI tuning', () => {
    const { tom } = makeTimbreDevice(true, 7)
    expect(tom(45)).toBeCloseTo(110, 6)
    expect(tom(48)).toBeCloseTo(440 * Math.pow(2, (48 - 69) / 12), 6)
  })
})

describe('audit M2b - timbre variance is gated by config.humanize', () => {
  it('humanize OFF: identical hits stay bit-identical', () => {
    const { snare } = makeTimbreDevice(false, 7)
    const a = snare(100)
    const b = snare(100)
    expect(a.centres[0]).toBe(b.centres[0])
    expect(a.centres[0]).toBeCloseTo(SNARE_BASE, 6) // no variance at all
  })
})
