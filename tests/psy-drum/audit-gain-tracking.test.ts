// Audit P0.2b — gain tracking: global steals prefer the QUIETEST voice.
//
// Before this fix VoiceState.gain stayed 1 forever after alloc, so the
// documented "lowest current gain" steal tie-break was dead and global steals
// degenerated to onset order. Now the device refreshes each active voice's
// gain from its patch envelope estimate (estimateEnvelopeLevel) before every
// alloc — quiet (more decayed) voices are stolen first, which is the musically
// correct choice (steal what you will least hear).
//
// The discriminating proof: two voices in a full pool — the OLDER one still
// LOUD (long decay), the YOUNGER one already silent (short decay). Global
// steal must take the younger+quieter voice — the exact OPPOSITE of what
// onset order would have done.

import { describe, it, expect } from 'bun:test'
import { estimateEnvelopeLevel } from '../../src/psy-drum/voice'
import { createDrumDevice } from '../../src/psy-drum/device'
import { defaultDrumConfig } from '../../src/psy-drum/types'

describe('estimateEnvelopeLevel (pure)', () => {
  it('is 0 before and at the trigger', () => {
    expect(estimateEnvelopeLevel(0, 1, 100)).toBe(0)
    expect(estimateEnvelopeLevel(-1, 1, 100)).toBe(0)
  })

  it('ramps linearly through the attack', () => {
    expect(estimateEnvelopeLevel(0.005, 10, 100)).toBeCloseTo(0.5, 6)
    expect(estimateEnvelopeLevel(0.01, 10, 100)).toBeCloseTo(1, 6)
  })

  it('follows the exact WebAudio exponential-ramp shape in decay', () => {
    // v(t) = 0.001^(t/d): envGain ramps exponentially to 0.001 over the decay
    expect(estimateEnvelopeLevel(0.011, 1, 100)).toBeCloseTo(Math.pow(0.001, 0.01 / 0.1), 6)
    expect(estimateEnvelopeLevel(0.051, 1, 100)).toBeCloseTo(Math.pow(0.001, 0.5), 6)
  })

  it('reaches the 0.001 floor at end of decay and holds it', () => {
    expect(estimateEnvelopeLevel(0.2, 1, 100)).toBe(0.001)
    expect(estimateEnvelopeLevel(5, 1, 100)).toBe(0.001)
  })

  it('is monotonic non-increasing through decay', () => {
    let prev = estimateEnvelopeLevel(0.002, 1, 200)
    for (let t = 0.01; t <= 0.25; t += 0.01) {
      const v = estimateEnvelopeLevel(t, 1, 200)
      expect(v).toBeLessThanOrEqual(prev)
      prev = v
    }
  })
})

// ─── device-level discriminating proof ───────────────────────────────────────

interface RecParam {
  value: number
  cancels: number
  linRamps: Array<{ v: number; t: number }>
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function makeGainDevice() {
  const gains: Array<{ gain: RecParam }> = []
  const node = () => ({ connect: () => {}, disconnect: () => {} })
  const mkParam = (v: number): RecParam => {
    const linRamps: Array<{ v: number; t: number }> = []
    const p: RecParam = {
      value: v,
      cancels: 0,
      linRamps: linRamps,
      setValueAtTime: (): void => {},
      linearRampToValueAtTime: (vv: number, t: number): void => { linRamps.push({ v: vv, t: t }) },
      exponentialRampToValueAtTime: (): void => {},
      cancelScheduledValues: (): void => { p.cancels = p.cancels + 1 },
    }
    return p
  }
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => {
      const g = { ...node(), gain: mkParam(1) }
      gains.push(g)
      return g
    },
    createOscillator: () => ({ ...node(), type: 'sine', frequency: mkParam(100), start: () => {}, stop: () => {} }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: mkParam(1000), Q: mkParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => ({ ...node(), buffer: null, playbackRate: mkParam(1), start: () => {}, stop: () => {} }),
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: mkParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const config = defaultDrumConfig()
  config.voices = 2 // tiny pool => the third trigger forces a GLOBAL steal
  config.humanize = false
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: 4,
    config: config,
    kitPatches: {
      // snare still LOUD at t=1s (2s decay); perc fully decayed by then (72ms)
      snare: { amp: { attackMs: 1, decayMs: 2000, releaseMs: 50 } },
      perc: { amp: { attackMs: 1, decayMs: 72, releaseMs: 20 } },
    },
  })
  device.onStart()
  return { ctx, device, gains }
}

describe('audit P0.2b - global steal takes the quietest voice', () => {
  it('steals the quiet YOUNGER voice, not the loud OLDER one (anti onset-order)', () => {
    const { ctx, device, gains } = makeGainDevice()

    // t=0: snare (long decay — will still be loud at t=1s)
    ctx.currentTime = 0
    const g0 = gains.length
    device.onEvent({ type: 'note', note: 38, velocity: 100, duration: 0.1, channel: 'snare', at: 0 })
    const snareGains = gains.slice(g0)

    // t=0.5: perc (72ms decay — will be at the 0.001 floor by t=1s)
    ctx.currentTime = 0.5
    const g1 = gains.length
    device.onEvent({ type: 'note', note: 56, velocity: 100, duration: 0.1, channel: 'perc', at: 0.5 })
    const percGains = gains.slice(g1)

    expect(snareGains.length).toBeGreaterThanOrEqual(2)
    expect(percGains.length).toBeGreaterThanOrEqual(2)

    // t=1.0: tom hits a full pool => global steal. Onset order would steal the
    // snare (older); gain tracking must steal the perc (quieter) instead.
    ctx.currentTime = 1.0
    device.onEvent({ type: 'note', note: 45, velocity: 100, duration: 0.1, channel: 'tom', at: 1.0 })

    const percCancelled = percGains.filter((g) => g.gain.cancels >= 1).length
    const snareCancelled = snareGains.filter((g) => g.gain.cancels >= 1).length
    expect(percCancelled).toBeGreaterThanOrEqual(1) // the quiet voice was stolen
    expect(snareCancelled).toBe(0)                  // the loud voice survived
  })
})
