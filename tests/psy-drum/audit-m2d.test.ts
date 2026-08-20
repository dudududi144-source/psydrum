// Audit M2d regression tests — continuous bank variance (playbackRate).
//
// Bank voices are pre-rendered, so round-robin variants alone vary in
// DISCRETE steps. M2d adds a subtle SEEDED playbackRate shift (+-0.4%,
// humanize-gated) as the continuous anti-machine-gun layer. Pitch-critical
// material would need cents-aware handling; for drums +-0.4% reads as
// natural sample variance, not detune.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice, BANK_PLAYBACK_RATE_DEPTH } from '../../src/psy-drum/device'
import { defaultDrumConfig } from '../../src/psy-drum/types'
import { BUILTIN_KIT_MANIFEST } from '../../src/psy-drum/kit-builtin'

interface RecParam {
  value: number
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function plainParam(value: number): RecParam {
  return {
    value: value,
    setValueAtTime: (v: number): void => { void v },
    linearRampToValueAtTime: (): void => {},
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => {},
  }
}

interface BankSource { playbackRate: RecParam }

function makeBankRateDevice(humanize: boolean, optsSeed: number) {
  const rates: BankSource[] = []
  const node = () => ({ connect: () => {}, disconnect: () => {} })
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => ({ ...node(), gain: plainParam(1) }),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: plainParam(100), start: () => {}, stop: () => {} }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: plainParam(1000), Q: plainParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => {
      const s: BankSource = { playbackRate: plainParam(1) }
      rates.push(s)
      return { ...node(), buffer: null, playbackRate: s.playbackRate, start: () => {}, stop: () => {} }
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: plainParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const config = defaultDrumConfig()
  config.humanize = humanize
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: optsSeed,
    config: config,
    useBank: true,
  })
  device.onStart()
  device.loadKit(BUILTIN_KIT_MANIFEST.kits[0])
  function kickRates(): number[] {
    const r0 = rates.length
    device.onEvent({ type: 'note', note: 36, velocity: 100, duration: 0.1, channel: 'kick', at: 0 })
    return rates.slice(r0).map((s) => s.playbackRate.value)
  }
  return { kickRates }
}

describe('audit M2d - bank playbackRate variance (humanize ON)', () => {
  it('identical banked hits get subtly different playback rates within +-depth', () => {
    const { kickRates } = makeBankRateDevice(true, 31)
    const a = kickRates()[0]
    const b = kickRates()[0]
    expect(a).not.toBe(b) // continuous variance, not just discrete variants
    const lo = 1 - BANK_PLAYBACK_RATE_DEPTH
    const hi = 1 + BANK_PLAYBACK_RATE_DEPTH
    expect(a).toBeGreaterThanOrEqual(lo)
    expect(a).toBeLessThanOrEqual(hi)
    expect(b).toBeGreaterThanOrEqual(lo)
    expect(b).toBeLessThanOrEqual(hi)
  })

  it('same seed => identical playbackRate sequence', () => {
    const a = makeBankRateDevice(true, 37)
    const b = makeBankRateDevice(true, 37)
    for (let i = 0; i < 4; i++) {
      expect(a.kickRates()[0]).toBe(b.kickRates()[0])
    }
  })
})

describe('audit M2d - variance is gated by config.humanize', () => {
  it('humanize OFF: playbackRate stays exactly 1', () => {
    const { kickRates } = makeBankRateDevice(false, 31)
    for (let i = 0; i < 3; i++) {
      expect(kickRates()[0]).toBe(1)
    }
  })
})
