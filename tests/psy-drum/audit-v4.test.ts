// Audit V4 regression tests — choke / steal / stop are finally realized in
// AUDIO, not just bookkeeping.
//
// Before this fix the choke state machine freed VoiceState slots while the
// actual WebAudio nodes kept ringing: style acceptance criteria #2 (open hat
// chokes closed <3ms) and #6 (crash self-choke) failed audibly. The device now
// collects per-voice node handles (voice-synth) and ramps them to -60dB
// (CHOKE_TARGET_GAIN) within CHOKE_DURATION_MS on choke, STEAL_RELEASE_MS on
// steal, and STOP_FAST_RELEASE_MS on onStop.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import { CHOKE_TARGET_GAIN } from '../../src/psy-drum/choke'

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
    setValueAtTime: (v: number): void => { void v },
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => { p.cancels = p.cancels + 1 },
  }
  return p
}

interface RecGain { gain: RecParam }
interface RecSource { stopTimes: number[] }

function makeMockCtx() {
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
    createOscillator: () => {
      const s: RecSource = { stopTimes: [] }
      sources.push(s)
      return { ...node(), type: 'sine', frequency: countingParam(100), start: () => {}, stop: (t: number) => { s.stopTimes.push(t) } }
    },
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: countingParam(1000), Q: countingParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => {
      const s: RecSource = { stopTimes: [] }
      sources.push(s)
      return { ...node(), buffer: null, start: () => {}, stop: (t: number) => { s.stopTimes.push(t) } }
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: countingParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  return { ctx, gains, sources }
}

function makeDevice() {
  const { ctx, gains, sources } = makeMockCtx()
  const output = { connect: () => {}, disconnect: () => {} }
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: output as unknown as AudioNode,
    optsSeed: 5,
  })
  device.onStart()
  function trigger(note: number, channel: string) {
    const g0 = gains.length
    const s0 = sources.length
    device.onEvent({ type: 'note', note: note, velocity: 100, duration: 0.1, channel: channel, at: 0 })
    return { voiceGains: gains.slice(g0), voiceSources: sources.slice(s0) }
  }
  return { device, trigger }
}

function rampTo(g: RecGain, target: number): { v: number; t: number } | null {
  for (const r of g.gain.linRamps) {
    if (Math.abs(r.v - target) < 1e-9) return r
  }
  return null
}

// ─── The choke is REAL audio now (style criteria #2 / #6) ────────────────────

describe('audit V4 - open hat chokes closed hat IN AUDIO', () => {
  it('the choked closed-hat envelope is cancelled and ramped to -60dB within 3ms', () => {
    const { trigger } = makeDevice()
    const closed = trigger(42, 'hat-closed')
    expect(closed.voiceGains.length).toBe(1)

    trigger(46, 'hat-open')

    const g = closed.voiceGains[0]
    expect(g.gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(g, CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) {
      expect(ramp.t).toBeGreaterThan(0)
      expect(ramp.t).toBeLessThanOrEqual(0.003) // CHOKE_DURATION_MS = 2.5ms
    }
    // the noise source is hard-stopped just after the ramp
    expect(closed.voiceSources[0].stopTimes.length).toBeGreaterThanOrEqual(1)
    expect(closed.voiceSources[0].stopTimes[0]).toBeLessThanOrEqual(0.01)
  })

  it('the choking open hat itself is NOT silenced', () => {
    const { trigger } = makeDevice()
    trigger(42, 'hat-closed')
    const open = trigger(46, 'hat-open')
    expect(open.voiceGains[0].gain.cancels).toBe(0)
    expect(rampTo(open.voiceGains[0], CHOKE_TARGET_GAIN)).toBeNull()
  })
})

describe('audit V4 - crash self-choke at maxPoly is real audio', () => {
  it('the third crash ramps out the oldest crash', () => {
    const { device, trigger } = makeDevice()
    const c1 = trigger(49, 'crash')
    trigger(49, 'crash')
    expect(c1.voiceGains[0].gain.cancels).toBe(0) // under maxPoly 2: no choke yet
    trigger(49, 'crash')
    expect(c1.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    expect(rampTo(c1.voiceGains[0], CHOKE_TARGET_GAIN)).not.toBeNull()
    expect(device.getCounters().chokeCount).toBeGreaterThanOrEqual(1)
  })
})

describe('audit V4 - steal victims ramp out (no stacked clicks)', () => {
  it('exceeding the hat-closed cap silences the oldest hat audio', () => {
    const { device, trigger } = makeDevice()
    const first = trigger(42, 'hat-closed')
    trigger(42, 'hat-closed')
    trigger(42, 'hat-closed')
    trigger(42, 'hat-closed') // at cap (4)
    expect(first.voiceGains[0].gain.cancels).toBe(0)
    trigger(42, 'hat-closed') // steals the oldest
    expect(first.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(first.voiceGains[0], CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeLessThanOrEqual(0.01) // STEAL_RELEASE_MS = 8ms
    expect(device.getCounters().voicesStolen).toBeGreaterThanOrEqual(1)
  })

  it('kicks never choke each other', () => {
    const { trigger } = makeDevice()
    const k1 = trigger(36, 'kick')
    trigger(36, 'kick')
    expect(k1.voiceGains[0].gain.cancels).toBe(0)
    expect(rampTo(k1.voiceGains[0], CHOKE_TARGET_GAIN)).toBeNull()
  })
})

describe('audit V4 - onStop fast-releases real audio', () => {
  it('active voices ramp to -60dB within STOP_FAST_RELEASE_MS on stop', () => {
    const { device, trigger } = makeDevice()
    const k = trigger(36, 'kick')
    expect(k.voiceGains[0].gain.cancels).toBe(0)
    device.onStop()
    expect(k.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(k.voiceGains[0], CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeLessThanOrEqual(0.012) // 10ms window
    expect(k.voiceSources[0].stopTimes.length).toBeGreaterThanOrEqual(1)
  })

  it('restart after stop works and fresh voices are not pre-silenced', () => {
    const { device, trigger } = makeDevice()
    trigger(36, 'kick')
    device.onStop()
    device.onStart()
    const k2 = trigger(36, 'kick')
    expect(k2.voiceGains[0].gain.cancels).toBe(0)
    expect(rampTo(k2.voiceGains[0], CHOKE_TARGET_GAIN)).toBeNull()
  })
})
