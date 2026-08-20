// Audit M2 regression tests — the hybrid buffer bank (ADR-008).
//
// Banked roles (kick/snare/hats) play pre-rendered ACB buffers when useBank is
// on: velocity picks the layer, round-robin picks the variant. Non-banked roles
// (clap/tom/perc) and useBank-off devices keep the realtime synthesis path.
// The pure render (renderRoleBanks) is deterministic per seed.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import {
  pickBankLayer,
  renderRoleBanks,
  BANK_VELOCITY_LAYERS,
  BANK_VARIANTS,
  BANKED_ROLES,
} from '../../src/psy-drum/voice-bank'
import { roundRobinVariant } from '../../src/psy-drum/variance-rules'
import { CHOKE_TARGET_GAIN } from '../../src/psy-drum/choke'
import type { DrumPatch, DrumRole } from '../../src/psy-drum/types'

// ─── Pure bank logic ─────────────────────────────────────────────────────────

describe('audit M2 - pickBankLayer', () => {
  it('maps normalized velocity onto evenly spaced layers', () => {
    expect(pickBankLayer(0, 3)).toBe(0)
    expect(pickBankLayer(0.2, 3)).toBe(0)
    expect(pickBankLayer(0.5, 3)).toBe(1)
    expect(pickBankLayer(0.67, 3)).toBe(2)
    expect(pickBankLayer(0.99, 3)).toBe(2)
    expect(pickBankLayer(1, 3)).toBe(2)
  })

  it('clamps degenerate inputs', () => {
    expect(pickBankLayer(-1, 3)).toBe(0)
    expect(pickBankLayer(5, 3)).toBe(2)
    expect(pickBankLayer(0.5, 0)).toBe(0)
  })
})

describe('audit M2 - round-robin cycling', () => {
  it('cycles variants 0..n-1 deterministically', () => {
    expect(roundRobinVariant(0, 2)).toBe(0)
    expect(roundRobinVariant(1, 2)).toBe(1)
    expect(roundRobinVariant(2, 2)).toBe(0)
    expect(roundRobinVariant(3, 2)).toBe(1)
  })
})

describe('audit M2 - renderRoleBanks (pure, deterministic)', () => {
  const patches: Partial<Record<DrumRole, DrumPatch>> = {}

  it('renders exactly the banked roles, 3 layers x 2 variants', () => {
    const banks = renderRoleBanks(patches, 44100, 5)
    for (const role of BANKED_ROLES) {
      const layers = banks[role]
      expect(layers).toBeDefined()
      if (layers !== undefined) {
        expect(layers.length).toBe(BANK_VELOCITY_LAYERS.length)
        for (const variants of layers) expect(variants.length).toBe(BANK_VARIANTS)
      }
    }
    expect(banks['clap']).toBeUndefined()
    expect(banks['tom']).toBeUndefined()
    expect(banks['perc']).toBeUndefined()
  })

  it('same seed => bit-identical banks; different seed => different noise', () => {
    const a = renderRoleBanks(patches, 44100, 77)
    const b = renderRoleBanks(patches, 44100, 77)
    const c = renderRoleBanks(patches, 44100, 78)
    const ka = a['kick']
    const kb = b['kick']
    const kc = c['kick']
    expect(ka).toBeDefined()
    expect(kb).toBeDefined()
    expect(kc).toBeDefined()
    if (ka !== undefined && kb !== undefined && kc !== undefined) {
      for (let i = 0; i < 200; i++) {
        expect(ka[0][0][i]).toBe(kb[0][0][i])
      }
      let differ = false
      for (let i = 0; i < ka[0][0].length; i++) {
        if (ka[0][0][i] !== kc[0][0][i]) { differ = true; break }
      }
      expect(differ).toBe(true)
    }
  })

  it('louder layers are louder (gain layering)', () => {
    const banks = renderRoleBanks(patches, 44100, 5)
    const k = banks['kick']
    expect(k).toBeDefined()
    if (k !== undefined) {
      const peak = (x: Float32Array) => { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v } return m }
      expect(peak(k[2][0])).toBeGreaterThan(peak(k[0][0]))
    }
  })
})

// ─── Device wiring (opt-in) ──────────────────────────────────────────────────

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
interface RecOsc { frequency: RecParam }
interface RecSource { stopTimes: number[] }

function makeBankDevice(useBank: boolean) {
  const gains: RecGain[] = []
  const oscs: RecOsc[] = []
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
      const o = { ...node(), type: 'sine', frequency: countingParam(100), start: () => {}, stop: () => {} }
      oscs.push(o)
      return o
    },
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: countingParam(1000), Q: countingParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length),
      length: length,
      sampleRate: sr,
      numberOfChannels: 1,
      duration: length / sr,
    }),
    createBufferSource: () => {
      const s: RecSource = { stopTimes: [] }
      sources.push(s)
      return { ...node(), buffer: null, playbackRate: countingParam(1), start: () => {}, stop: (t: number) => { s.stopTimes.push(t) } }
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: countingParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: 13,
    useBank: useBank,
  })
  device.onStart()
  function trigger(note: number, channel: string) {
    const g0 = gains.length
    const o0 = oscs.length
    const s0 = sources.length
    device.onEvent({ type: 'note', note: note, velocity: 100, duration: 0.1, channel: channel, at: 0 })
    return { voiceGains: gains.slice(g0), voiceOscs: oscs.slice(o0), voiceSources: sources.slice(s0) }
  }
  return { device, trigger }
}

function rampTo(g: RecGain, target: number): { v: number; t: number } | null {
  for (const r of g.gain.linRamps) {
    if (Math.abs(r.v - target) < 1e-9) return r
  }
  return null
}

describe('audit M2 - bank playback (useBank on)', () => {
  it('banked kick plays a buffer voice (no oscillator)', () => {
    const { trigger } = makeBankDevice(true)
    const k = trigger(36, 'kick')
    expect(k.voiceSources.length).toBe(1)
    expect(k.voiceOscs.length).toBe(0)
    expect(k.voiceGains.length).toBe(1)
    expect(rampTo(k.voiceGains[0], 1)).not.toBeNull() // envelope peaks at 1
  })

  it('non-banked clap falls through to realtime synthesis', () => {
    const { trigger } = makeBankDevice(true)
    const c = trigger(39, 'clap')
    // clap synthesis is noise-only (buildClap: 3 stacked band-passed noise
    // voices, zero oscillators) — assert the noise voices, not oscillators.
    expect(c.voiceOscs.length).toBe(0)
    expect(c.voiceSources.length).toBeGreaterThanOrEqual(3)
    expect(c.voiceGains.length).toBeGreaterThanOrEqual(3)
  })

  it('choked bank voices still ramp out (V4 machinery applies)', () => {
    const { trigger } = makeBankDevice(true)
    const closed = trigger(42, 'hat-closed')
    trigger(46, 'hat-open')
    expect(closed.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(closed.voiceGains[0], CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeLessThanOrEqual(0.003)
  })
})

describe('audit M2 - bank is opt-in', () => {
  it('default devices still synthesize in realtime', () => {
    const { trigger } = makeBankDevice(false)
    const k = trigger(36, 'kick')
    expect(k.voiceOscs.length).toBe(1)
  })
})
