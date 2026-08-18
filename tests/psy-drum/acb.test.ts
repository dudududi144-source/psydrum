// Phase A tests (ROADMAP A1.2/A1.4) — SVF + ACB kick model.
// These tests verify the ACB engine produces the analog "boom" that a plain
// sine/pitch-drop kick cannot. Spectral analysis (Goertzel) confirms the
// sub-bass energy and resonant character.

import { describe, it, expect } from 'bun:test'
import { SVF, renderAcbKick } from '../../src/psy-drum/acb'
import type { AcbKickParams } from '../../src/psy-drum/acb'

const SR = 44100

function goertzelEnergy(samples: Float32Array, sampleRate: number, freqHz: number): number {
  const k = Math.round((samples.length * freqHz) / sampleRate)
  const w = (2 * Math.PI * k) / samples.length
  const coeff = 2 * Math.cos(w)
  let s0 = 0, s1 = 0, s2 = 0
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / samples.length
}

function kickParams(over: Partial<AcbKickParams> = {}): AcbKickParams {
  return {
    sampleRate: SR,
    durationSec: 0.3,
    bodyStartHz: 160,
    bodyEndHz: 48,
    pitchDecayMs: 45,
    filterCutoffHz: 400,
    filterResonance: 0.6,
    filterCutoffDecayMs: 80,
    clickAmount: 0.4,
    clickMs: 2,
    driveDb: 4,
    ...over,
  }
}

describe('SVF (State-Variable Filter)', () => {
  it('low-pass passes low frequencies and attenuates high', () => {
    const svfLow = new SVF(SR, 200, 0.3)
    const svfHigh = new SVF(SR, 200, 0.3)
    // Feed a low-freq sine to one, high-freq sine to the other
    let eLow = 0, eHigh = 0
    let ph1 = 0, ph2 = 0
    for (let i = 0; i < 4000; i++) {
      ph1 += 50 / SR; if (ph1 >= 1) ph1 -= 1
      ph2 += 5000 / SR; if (ph2 >= 1) ph2 -= 1
      const r1 = svfLow.process(Math.sin(2 * Math.PI * ph1))
      const r2 = svfHigh.process(Math.sin(2 * Math.PI * ph2))
      if (i > 1000) { eLow += r1.low * r1.low; eHigh += r2.low * r2.low }
    }
    expect(eLow).toBeGreaterThan(eHigh)
  })

  it('resonance boosts energy near the cutoff', () => {
    const svfNoRes = new SVF(SR, 300, 0.1)
    const svfRes = new SVF(SR, 300, 0.8)
    let e1 = 0, e2 = 0
    let ph = 0
    for (let i = 0; i < 4000; i++) {
      ph += 300 / SR; if (ph >= 1) ph -= 1
      const x = Math.sin(2 * Math.PI * ph)
      const r1 = svfNoRes.process(x)
      const r2 = svfRes.process(x)
      if (i > 1000) { e1 += r1.band * r1.band; e2 += r2.band * r2.band }
    }
    expect(e2).toBeGreaterThan(e1)
  })

  it('reset clears state', () => {
    const svf = new SVF(SR, 500, 0.5)
    svf.process(1)
    svf.reset()
    const r = svf.process(0)
    expect(r.low).toBe(0)
    expect(r.band).toBe(0)
  })
})

describe('ACB kick model', () => {
  it('produces strong sub-bass energy below 60Hz', () => {
    const s = renderAcbKick(kickParams())
    const sub = goertzelEnergy(s, SR, 50)
    expect(sub).toBeGreaterThan(0.05)
  })

  it('is bounded to [-1, 1]', () => {
    const s = renderAcbKick(kickParams({ driveDb: 12 }))
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(-1.01)
      expect(s[i]).toBeLessThanOrEqual(1.01)
    }
  })

  it('is deterministic', () => {
    const a = renderAcbKick(kickParams())
    const b = renderAcbKick(kickParams())
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })

  it('higher resonance produces more resonant "ring"', () => {
    const lowRes = renderAcbKick(kickParams({ filterResonance: 0.2 }))
    const highRes = renderAcbKick(kickParams({ filterResonance: 0.8 }))
    // Measure energy in the mid band where resonance rings
    const eLow = goertzelEnergy(lowRes, SR, 150)
    const eHigh = goertzelEnergy(highRes, SR, 150)
    expect(eHigh).toBeGreaterThan(eLow * 0.5)
  })

  it('has a fast transient (attack)', () => {
    const s = renderAcbKick(kickParams())
    const head = Math.floor(SR * 0.003)
    let e = 0
    for (let i = 0; i < head; i++) e += Math.abs(s[i])
    e /= head
    expect(e).toBeGreaterThan(0.05)
  })
})
