// Audit M3 regression tests — true sample/synth crossfade.
//
// Before this fix the sample layer STACKED on top of full synthesis: sample
// gain and synth gain both played at full weight (doubled energy, smeared
// transients). Now the synth side scales by (1 - patch.sample.gain):
// gain 1 = sample only, gain 0 = synth only. patch.sample.gain IS the
// crossfade weight, as ARCHITECTURE.md section 4.2 always promised.
//
// Note: playSampleLayer creates its gain BEFORE the synth builders, so all
// assertions below are order-independent (membership over the peak set).

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
interface RecSource { buffer: unknown }

function makeSampleDevice() {
  const gains: RecGain[] = []
  const sources: RecSource[] = []
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
    createBufferSource: () => {
      const s: RecSource = { buffer: null, ...node(), start: () => {}, stop: () => {} }
      sources.push(s)
      return s
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: countingParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const config = defaultDrumConfig()
  config.humanize = false // exact peak comparisons
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: 5,
    config: config,
  })
  device.onStart()
  const fakeSample = { marker: 'fake-audio-buffer' }
  function snare(): { peaks: number[]; sampleSources: RecSource[] } {
    const g0 = gains.length
    const s0 = sources.length
    device.onEvent({ type: 'note', note: 38, velocity: 100, duration: 0.1, channel: 'snare', at: 0 })
    const peaks = gains.slice(g0).map((g) => (g.gain.linRamps.length > 0 ? g.gain.linRamps[0].v : 0))
    const sampleSources = sources.slice(s0).filter((s) => s.buffer === fakeSample)
    return { peaks: peaks, sampleSources: sampleSources }
  }
  return { device, snare, fakeSample }
}

const GAIN_100 = 100 / 127
const NOISE_PEAK = GAIN_100 * 0.9 // snare noise voice peakScale

describe('audit M3 - sample/synth crossfade', () => {
  it('no sample: synth plays at full weight (control)', () => {
    const { snare } = makeSampleDevice()
    const r = snare()
    expect(r.sampleSources.length).toBe(0)
    expect(r.peaks.some((p) => Math.abs(p - NOISE_PEAK) < 1e-9)).toBe(true)
    expect(r.peaks.some((p) => Math.abs(p - GAIN_100 * 0.7) < 1e-9)).toBe(true) // tone voice
  })

  it('sample.gain 0.5: synth is halved, sample plays at half', () => {
    const { device, snare, fakeSample } = makeSampleDevice()
    device.setSample('snare', fakeSample as unknown as AudioBuffer)
    device.enableSampleLayer('snare', 0.5)
    const r = snare()
    expect(r.sampleSources.length).toBe(1)
    // synth side scaled by 1-0.5 (noise voice)
    expect(r.peaks.some((p) => Math.abs(p - NOISE_PEAK * 0.5) < 1e-9)).toBe(true)
    // sample gain ramps to params.gain * sample.gain
    expect(r.peaks.some((p) => Math.abs(p - GAIN_100 * 0.5) < 1e-9)).toBe(true)
    // nothing plays at full synth weight anymore
    expect(r.peaks.some((p) => Math.abs(p - NOISE_PEAK) < 1e-9)).toBe(false)
  })

  it('sample.gain 1.0: synth fully silent, sample carries the voice', () => {
    const { device, snare, fakeSample } = makeSampleDevice()
    device.setSample('snare', fakeSample as unknown as AudioBuffer)
    device.enableSampleLayer('snare', 1.0)
    const r = snare()
    expect(r.sampleSources.length).toBe(1)
    // the sample gain ramps to the full params.gain
    expect(r.peaks.some((p) => Math.abs(p - GAIN_100) < 1e-9)).toBe(true)
    // every OTHER peak (the synth envGains) is exactly 0
    const synthPeaks = r.peaks.filter((p) => Math.abs(p - GAIN_100) > 1e-9)
    expect(synthPeaks.length).toBeGreaterThanOrEqual(2) // noise + tone envGains
    for (const p of synthPeaks) expect(p).toBe(0)
  })
})
