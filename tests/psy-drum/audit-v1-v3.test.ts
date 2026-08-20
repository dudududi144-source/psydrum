// Audit V1 + V3 regression tests (M0 hotfixes).
//
// V1 — noiseBrightness is a velocity-tracked centre frequency in Hz (voice.ts
//      section 4.3). The old buildNoiseVoice formula treated it as a 0..1
//      factor and pinned every noise filter to the Nyquist guard, muting the
//      entire noise family (hats / cymbals / snare wires). These tests pin the
//      corrected behaviour: musical centre range + velocity tracking.
// V3 — canonical NoteEvent.velocity is 0..1 (ARCHITECTURE.md section 3.1) but
//      legacy hosts emit raw MIDI 0..127. The device boundary now normalizes
//      0..1 inputs onto the 0..127 DSP scale instead of silencing them.

import { describe, it, expect } from 'bun:test'
import { resolveNoiseFilterHz, resolveDrumParams } from '../../src/psy-drum/voice'
import { normalizeEventVelocity, createDrumDevice } from '../../src/psy-drum/device'
import { BUILTIN_KIT_MANIFEST } from '../../src/psy-drum/kit-builtin'
import type { DrumPatch } from '../../src/psy-drum/types'

const NYQ = 22050 - 100 // same guard as voice-synth at 44.1kHz

// ─── V1: resolveNoiseFilterHz ────────────────────────────────────────────────

describe('audit V1 - resolveNoiseFilterHz (noise filter centre)', () => {
  it('uses the velocity-tracked brightness (Hz) when present', () => {
    expect(resolveNoiseFilterHz(2828, 1850, NYQ)).toBeCloseTo(2828, 6)
  })

  it('falls back to a darker fraction of the base colour without a noise block', () => {
    expect(resolveNoiseFilterHz(0, 1800, NYQ)).toBeCloseTo(1080, 6)
  })

  it('never pins to / exceeds the Nyquist guard', () => {
    expect(resolveNoiseFilterHz(1e9, 7600, NYQ)).toBe(NYQ)
    expect(resolveNoiseFilterHz(12291, 7600, NYQ)).toBeLessThan(NYQ)
  })

  it('keeps a 40Hz floor for degenerate inputs', () => {
    expect(resolveNoiseFilterHz(1, 1, NYQ)).toBe(40)
  })
})

describe('audit V1 - builtin kits no longer pin noise filters to Nyquist', () => {
  for (const kit of BUILTIN_KIT_MANIFEST.kits) {
    it('kit "' + kit.id + '": every noise filter sits in a musical band and tracks velocity', () => {
      const drums = kit.drums as Record<string, DrumPatch | undefined>
      let checked = 0
      for (const role of Object.keys(drums)) {
        const patch = drums[role]
        if (patch === undefined || patch.noise === undefined) continue
        const bpHz = patch.noise.bpHz
        const loud = resolveDrumParams(patch, 112, 'linear', 2, NYQ)
        const fLoud = resolveNoiseFilterHz(loud.noiseBrightness, bpHz, NYQ)

        // inside a sane window around the patch colour — NEVER the guard
        expect(fLoud).toBeGreaterThanOrEqual(bpHz * 0.95)
        expect(fLoud).toBeLessThanOrEqual(Math.min(bpHz * 2.05, NYQ))
        expect(fLoud).toBeLessThan(NYQ)

        // louder = brighter (section 4.3) when the patch tracks velocity
        if (patch.velTrack !== undefined && patch.velTrack > 0) {
          const soft = resolveDrumParams(patch, 32, 'linear', 2, NYQ)
          const fSoft = resolveNoiseFilterHz(soft.noiseBrightness, bpHz, NYQ)
          expect(fLoud).toBeGreaterThan(fSoft)
        }
        checked = checked + 1
      }
      expect(checked).toBeGreaterThanOrEqual(4) // every builtin kit has 4+ noise drums
    })
  }
})

// ─── V3: normalizeEventVelocity ──────────────────────────────────────────────

describe('audit V3 - normalizeEventVelocity', () => {
  it('scales canonical 0..1 velocity onto the 0..127 DSP scale', () => {
    expect(normalizeEventVelocity(1)).toBeCloseTo(127, 6) // full velocity
    expect(normalizeEventVelocity(0.88)).toBeCloseTo(111.76, 6)
    expect(normalizeEventVelocity(0)).toBe(0)
  })

  it('passes legacy MIDI-scale velocity through unchanged', () => {
    expect(normalizeEventVelocity(112)).toBe(112)
    expect(normalizeEventVelocity(127)).toBe(127)
    expect(normalizeEventVelocity(2)).toBe(2)
  })
})

// ─── V3 end-to-end: a compliant host is AUDIBLE ─────────────────────────────

interface ParamRecorder {
  value: number
  linTargets: number[]
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
}

function makeRecordingParam(value: number): ParamRecorder {
  const linTargets: number[] = []
  return {
    value: value,
    linTargets: linTargets,
    setValueAtTime: (v: number): void => { void v },
    linearRampToValueAtTime: (v: number): void => { linTargets.push(v) },
    exponentialRampToValueAtTime: (): void => {},
  }
}

function makeMockCtx() {
  const gains: Array<{ gain: ParamRecorder }> = []
  const mockNode = () => ({ connect: () => {}, disconnect: () => {} })
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => {
      const g = { ...mockNode(), gain: makeRecordingParam(1) }
      gains.push(g)
      return g
    },
    createOscillator: () => ({ ...mockNode(), type: 'sine', frequency: makeRecordingParam(100), start: () => {}, stop: () => {} }),
    createBiquadFilter: () => ({ ...mockNode(), type: 'lowpass', frequency: makeRecordingParam(1000), Q: makeRecordingParam(1) }),
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => ({ ...mockNode(), buffer: null, start: () => {}, stop: () => {} }),
    createWaveShaper: () => ({ ...mockNode(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...mockNode(), delayTime: makeRecordingParam(0.28) }),
    createConvolver: () => ({ ...mockNode(), buffer: null }),
  }
  return { ctx, gains }
}

function triggerSnare(velocity: number) {
  const { ctx, gains } = makeMockCtx()
  const output = { connect: () => {}, disconnect: () => {} }
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: output as unknown as AudioNode,
    optsSeed: 7,
  })
  device.onStart()
  device.onEvent({ type: 'note', note: 38, velocity: velocity, duration: 0.1, channel: 'snare', at: 0 })
  let peak = 0
  for (const g of gains) {
    for (const t of g.gain.linTargets) if (t > peak) peak = t
  }
  return { device, peak }
}

describe('audit V3 - compliant 0..1 hosts are audible (end-to-end)', () => {
  it('velocity 0.88 on the canonical scale produces a full-level envelope', () => {
    const { device, peak } = triggerSnare(0.88)
    // snare noise voice peak = gain * 0.9 = 0.88 * 0.9 = 0.792
    // pre-fix this was ~0.006 (silence): assert loudly, not delicately
    expect(peak).toBeGreaterThan(0.5)
    expect(peak).toBeCloseTo(0.792, 1)
    expect(device.getCounters().velocityNormalized).toBe(1)
  })

  it('legacy MIDI velocity 112 sounds the same and is not counted', () => {
    const { device, peak } = triggerSnare(112)
    expect(peak).toBeCloseTo((112 / 127) * 0.9, 1)
    expect(device.getCounters().velocityNormalized).toBe(0)
  })

  it('velocity 1 means FULL velocity on the canonical scale', () => {
    const { peak } = triggerSnare(1)
    expect(peak).toBeCloseTo(0.9, 1)
  })
})
