// Phase 5 tests — voice DSP deterministic core.
// Envelopes, velocity-to-gain, velocity-to-timbre, and per-drum param
// resolution are all pure functions and are asserted exhaustively here so the
// DSP foundation stays rock solid (louder = brighter, per section 4.3).

import { describe, it, expect } from 'bun:test'
import {
  buildEnvelopeTable,
  envelopeValueAt,
  sampleEnvelope,
  velCurveGain,
  velocityTimbreShift,
  velocityToCutoff,
  velocityToNoiseBrightness,
  velocityToPitchDepth,
  resolveDrumParams,
} from '../../src/psy-drum/voice'
import type { EnvelopeSpec } from '../../src/psy-drum/voice'
import type { DrumPatch } from '../../src/psy-drum/types'

const ADSR: EnvelopeSpec = { attackMs: 10, decayMs: 20, releaseMs: 30, sustainLevel: 0.2 }

describe('envelope shape (piecewise-linear ADSR)', () => {
  it('starts at zero at t=0', () => {
    expect(envelopeValueAt(ADSR, 0)).toBeCloseTo(0, 6)
  })

  it('ramps to the peak by the end of the attack', () => {
    expect(envelopeValueAt(ADSR, 5)).toBeCloseTo(0.5, 6) // mid-attack
    expect(envelopeValueAt(ADSR, 10)).toBeCloseTo(1, 1) // end of attack
  })

  it('decays toward the sustain level', () => {
    expect(envelopeValueAt(ADSR, 20)).toBeCloseTo(0.6, 6) // halfway 1 -> 0.2
    expect(envelopeValueAt(ADSR, 30)).toBeCloseTo(0.2, 6) // end of decay = sustain
  })

  it('releases from sustain to zero', () => {
    expect(envelopeValueAt(ADSR, 45)).toBeCloseTo(0.1, 6) // halfway 0.2 -> 0
    expect(envelopeValueAt(ADSR, 60)).toBeCloseTo(0, 6)
  })

  it('never exceeds 1 or goes below 0', () => {
    for (let t = 0; t <= 60; t += 1) {
      const v = envelopeValueAt(ADSR, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('a zero-attack envelope starts at the peak', () => {
    const spec: EnvelopeSpec = { attackMs: 0, decayMs: 10, releaseMs: 10, sustainLevel: 0.5 }
    expect(envelopeValueAt(spec, 0)).toBeCloseTo(1, 6)
  })
})

describe('envelope table (precomputed, zero-alloc reads)', () => {
  it('buildEnvelopeTable is deterministic for a given spec + rate', () => {
    const a = buildEnvelopeTable(ADSR, 6000)
    const b = buildEnvelopeTable(ADSR, 6000)
    expect(Array.from(a.samples)).toEqual(Array.from(b.samples))
    expect(a.totalMs).toBe(60)
  })

  it('table length matches totalMs at the sample rate', () => {
    const t = buildEnvelopeTable(ADSR, 6000)
    expect(t.samples.length).toBe(Math.ceil((60 / 1000) * 6000))
  })

  it('table reaches (approximately) the peak and returns to zero', () => {
    const t = buildEnvelopeTable(ADSR, 6000)
    let max = 0
    for (let i = 0; i < t.samples.length; i++) if (t.samples[i] > max) max = t.samples[i]
    expect(max).toBeGreaterThan(0.99)
    expect(t.samples[t.samples.length - 1]).toBeCloseTo(0, 3)
  })

  it('sampleEnvelope interpolates the ramp correctly', () => {
    const ramp: EnvelopeSpec = { attackMs: 100, decayMs: 0, releaseMs: 0, sustainLevel: 1 }
    const t = buildEnvelopeTable(ramp, 1000)
    expect(sampleEnvelope(t, 50)).toBeCloseTo(0.5, 2)
    expect(sampleEnvelope(t, 0)).toBeCloseTo(0, 2)
    expect(sampleEnvelope(t, 100)).toBeCloseTo(1, 2)
  })

  it('sampleEnvelope clamps outside the table', () => {
    const ramp: EnvelopeSpec = { attackMs: 100, decayMs: 0, releaseMs: 0, sustainLevel: 1 }
    const t = buildEnvelopeTable(ramp, 1000)
    expect(sampleEnvelope(t, -5)).toBe(t.samples[0])
    expect(sampleEnvelope(t, 9999)).toBe(t.samples[t.samples.length - 1])
  })
})

describe('velocity-to-gain (section 4.3)', () => {
  it('linear curve maps velocity/127', () => {
    expect(velCurveGain(127, 'linear', 2)).toBeCloseTo(1, 6)
    expect(velCurveGain(0, 'linear', 2)).toBeCloseTo(0, 6)
    expect(velCurveGain(64, 'linear', 2)).toBeCloseTo(64 / 127, 6)
  })

  it('power curve increases dynamic range', () => {
    expect(velCurveGain(127, 'power', 2)).toBeCloseTo(1, 6)
    expect(velCurveGain(64, 'power', 2)).toBeCloseTo(Math.pow(64 / 127, 2), 6)
    // power curve is below linear for mid velocities
    expect(velCurveGain(64, 'power', 2)).toBeLessThan(velCurveGain(64, 'linear', 2))
  })

  it('clamps out-of-range velocity', () => {
    expect(velCurveGain(200, 'linear', 2)).toBeCloseTo(1, 6)
    expect(velCurveGain(-5, 'linear', 2)).toBeCloseTo(0, 6)
  })
})

describe('velocity-to-timbre (louder = brighter)', () => {
  it('timbre shift scales with velocity and velTrack', () => {
    expect(velocityTimbreShift(127, 1)).toBeCloseTo(1, 6)
    expect(velocityTimbreShift(127, 0)).toBeCloseTo(0, 6)
    expect(velocityTimbreShift(0, 1)).toBeCloseTo(0, 6)
  })

  it('cutoff rises with velocity and is capped at the nyquist guard', () => {
    expect(velocityToCutoff(0, 1000, 1, 20000)).toBeCloseTo(1000, 6)
    expect(velocityToCutoff(127, 1000, 1, 20000)).toBeCloseTo(2000, 6)
    expect(velocityToCutoff(127, 15000, 1, 20000)).toBe(20000) // capped
  })

  it('velTrack 0 means no timbre shift (pure gain change)', () => {
    expect(velocityToCutoff(127, 1000, 0, 20000)).toBeCloseTo(1000, 6)
  })

  it('noise brightness follows the same rule', () => {
    expect(velocityToNoiseBrightness(127, 4000, 1, 20000)).toBeCloseTo(8000, 6)
  })

  it('pitch depth deepens with velocity', () => {
    expect(velocityToPitchDepth(0, 5, 1)).toBeCloseTo(5, 6)
    expect(velocityToPitchDepth(127, 5, 1)).toBeCloseTo(10, 6)
  })
})

describe('per-drum chain parameter resolution', () => {
  const patch: DrumPatch = {
    body: { wave: 'sine', startHz: 200, endHz: 50, pitchDecayMs: 40 },
    filter: { cutoff: 1000, res: 1 },
    velTrack: 1,
  }

  it('resolves gain, cutoff, and pitch depth from patch + velocity', () => {
    const p = resolveDrumParams(patch, 127, 'linear', 2, 20000)
    expect(p.gain).toBeCloseTo(1, 6)
    expect(p.cutoff).toBeCloseTo(2000, 6) // 1000 * (1 + 1)
    expect(p.pitchDepth).toBeCloseTo(300, 6) // (200-50) * (1+1)
    expect(p.noiseBrightness).toBe(0) // no noise block
  })

  it('a quiet hit resolves to lower gain and less timbre shift', () => {
    const p = resolveDrumParams(patch, 32, 'linear', 2, 20000)
    expect(p.gain).toBeCloseTo(32 / 127, 6)
    expect(p.cutoff).toBeLessThan(2000)
    expect(p.pitchDepth).toBeLessThan(300)
  })

  it('a patch without velTrack has no timbre shift', () => {
    const flat: DrumPatch = { filter: { cutoff: 1000, res: 1 } }
    const p = resolveDrumParams(flat, 127, 'linear', 2, 20000)
    expect(p.cutoff).toBeCloseTo(1000, 6)
    expect(p.pitchDepth).toBe(0)
  })
})
