// Audit V5 + V6 regression tests.
//
// V5 — note-off is realized in AUDIO: the released voice ramps out over the
//      patch's amp.releaseMs (previously validated-by-kit-library but DEAD in
//      the device — note-off only touched bookkeeping).
// V6 — the router's MIDI pitch hint is finally consumed (style criterion #5:
//      tom fills with correct relative pitch); unpitched drums still ignore
//      note-for-pitch (B1 contract preserved).

import { describe, it, expect } from 'bun:test'
import { createDrumDevice, DEFAULT_RELEASE_MS } from '../../src/psy-drum/device'
import { midiToHz } from '../../src/psy-drum/voice-synth'
import { CHOKE_TARGET_GAIN } from '../../src/psy-drum/choke'
import type { DrumPatch, DrumRole } from '../../src/psy-drum/types'

// ─── Recording mock AudioContext ─────────────────────────────────────────────

interface RecParam {
  value: number
  cancels: number
  setValues: Array<{ v: number; t: number }>
  linRamps: Array<{ v: number; t: number }>
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function countingParam(value: number): RecParam {
  const setValues: Array<{ v: number; t: number }> = []
  const linRamps: Array<{ v: number; t: number }> = []
  const p: RecParam = {
    value: value,
    cancels: 0,
    setValues: setValues,
    linRamps: linRamps,
    setValueAtTime: (v: number, t: number): void => { setValues.push({ v: v, t: t }) },
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => { p.cancels = p.cancels + 1 },
  }
  return p
}

interface RecGain { gain: RecParam }
interface RecOsc { frequency: RecParam }
interface RecSource { stopTimes: number[] }

function makeMockCtx() {
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
  return { ctx, gains, oscs, sources }
}

function makeDevice(kitPatches?: Partial<Record<DrumRole, DrumPatch>>, noteMap?: Record<number, DrumRole>) {
  const { ctx, gains, oscs, sources } = makeMockCtx()
  const output = { connect: () => {}, disconnect: () => {} }
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: output as unknown as AudioNode,
    optsSeed: 9,
    kitPatches: kitPatches,
    noteMap: noteMap,
  })
  device.onStart()
  function trigger(note: number, channel: string, velocity: number) {
    const g0 = gains.length
    const o0 = oscs.length
    const s0 = sources.length
    device.onEvent({ type: 'note', note: note, velocity: velocity, duration: 0.1, channel: channel, at: 0 })
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

// ─── V5: note-off is real audio ──────────────────────────────────────────────

describe('audit V5 - note-off ramps the voice out (releaseMs)', () => {
  it('a note-off on the default patch releases over DEFAULT_RELEASE_MS', () => {
    const { device, trigger } = makeDevice()
    const snare = trigger(38, 'snare', 100)
    expect(snare.voiceGains.length).toBeGreaterThanOrEqual(1)

    device.onEvent({ type: 'note', note: 38, velocity: 0, duration: 0, channel: 'snare', at: 0 })

    const g = snare.voiceGains[0]
    expect(g.gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(g, CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) {
      expect(ramp.t).toBeCloseTo(DEFAULT_RELEASE_MS / 1000, 6) // 30ms
    }
  })

  it('the kit patch releaseMs drives the ramp length', () => {
    const patch: DrumPatch = { amp: { attackMs: 1, decayMs: 100, releaseMs: 80 } }
    const { device, trigger } = makeDevice({ snare: patch })
    const snare = trigger(38, 'snare', 100)
    device.onEvent({ type: 'note', note: 38, velocity: 0, duration: 0, channel: 'snare', at: 0 })
    const ramp = rampTo(snare.voiceGains[0], CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeCloseTo(0.08, 6)
  })

  it('a note-off with no matching voice is harmless', () => {
    const { device, trigger } = makeDevice()
    const kick = trigger(36, 'kick', 100)
    device.onEvent({ type: 'note', note: 38, velocity: 0, duration: 0, channel: 'snare', at: 0 })
    // the kick must be untouched
    expect(kick.voiceGains[0].gain.cancels).toBe(0)
    expect(rampTo(kick.voiceGains[0], CHOKE_TARGET_GAIN)).toBeNull()
  })
})

// ─── V6: pitch hints are consumed (style criterion #5) ──────────────────────

describe('audit V6 - midiToHz', () => {
  it('is standard A4=440 tuning', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 9)
    expect(midiToHz(81)).toBeCloseTo(880, 9)
    expect(midiToHz(57)).toBeCloseTo(220, 9)
  })
})

describe('audit V6 - tom honors the MIDI pitch hint', () => {
  it('note 45 tunes the tom to 110Hz and relative intervals hold (45 -> 48)', () => {
    const { trigger } = makeDevice()
    const t45 = trigger(45, 'tom', 100)
    const t48 = trigger(48, 'tom', 100)
    expect(t45.voiceOscs.length).toBe(1)
    expect(t48.voiceOscs.length).toBe(1)

    expect(t45.voiceOscs[0].frequency.value).toBeCloseTo(110, 6) // midiToHz(45)
    expect(t48.voiceOscs[0].frequency.value).toBeCloseTo(midiToHz(48), 6)
    const ratio = t48.voiceOscs[0].frequency.value / t45.voiceOscs[0].frequency.value
    expect(ratio).toBeCloseTo(Math.pow(2, 3 / 12), 6) // three semitones
  })
})

describe('audit V6 - ride ping is tuned by the hint', () => {
  it('the ping follows the hint (x16 into the 1.5-9kHz band)', () => {
    // custom note map so two distinct notes both route to ride
    const { trigger } = makeDevice(undefined, { 36: 'kick', 38: 'snare', 51: 'ride', 58: 'ride' })
    const r51 = trigger(51, 'ride', 100)
    const r58 = trigger(58, 'ride', 100)
    expect(r51.voiceOscs.length).toBe(1)
    expect(r58.voiceOscs.length).toBe(1)
    expect(r51.voiceOscs[0].frequency.value).toBeCloseTo(midiToHz(51) * 16, 6)
    expect(r58.voiceOscs[0].frequency.value).toBeCloseTo(midiToHz(58) * 16, 6)
    expect(r58.voiceOscs[0].frequency.value / r51.voiceOscs[0].frequency.value).toBeCloseTo(Math.pow(2, 7 / 12), 6)
  })
})

describe('audit V6 - unpitched drums still ignore note-for-pitch (B1)', () => {
  it('kick body starts at the patch startHz, NOT at the note frequency', () => {
    const { trigger } = makeDevice()
    const k = trigger(36, 'kick', 100)
    expect(k.voiceOscs.length).toBe(1)
    // MIDI note 36 is 65.41Hz; a B1 regression would leak it into the kick.
    // The patchless kick body starts at 165Hz.
    expect(k.voiceOscs[0].frequency.setValues[0].v).toBeCloseTo(165, 6)
  })
})
