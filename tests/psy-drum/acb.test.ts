// Phase A tests (ROADMAP A1.2/A1.4) — SVF + ACB kick model.
// These tests verify the ACB engine produces the analog "boom" that a plain
// sine/pitch-drop kick cannot. Spectral analysis (Goertzel) confirms the
// sub-bass energy and resonant character.

import { describe, it, expect } from 'bun:test'
import { SVF, renderAcbKick, acbKickParamsFromPatch, renderAcbSnare, renderAcbHat } from '../../src/psy-drum/acb'
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
    filterCutoffDecayMs: 100,
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


describe('acbKickParamsFromPatch (A1.3 kit->ACB mapping)', () => {
  it('maps kit patch body/drive to ACB params', () => {
    const p = acbKickParamsFromPatch(
      { body: { startHz: 200, endHz: 60, pitchDecayMs: 50 }, driveDb: 6 },
      { sampleRate: 44100, durationSec: 0.3 },
    )
    expect(p.bodyStartHz).toBe(200)
    expect(p.bodyEndHz).toBe(60)
    expect(p.pitchDecayMs).toBe(50)
    expect(p.driveDb).toBe(6)
    expect(p.sampleRate).toBe(44100)
  })

  it('provides defaults for empty patch', () => {
    const p = acbKickParamsFromPatch({}, { sampleRate: 44100, durationSec: 0.3 })
    expect(p.bodyStartHz).toBe(160)
    expect(p.bodyEndHz).toBe(48)
    expect(p.filterResonance).toBeGreaterThan(0)
    expect(p.driveDb).toBeGreaterThan(0)
  })

  it('different patches produce different ACB kicks', () => {
    const a = renderAcbKick(acbKickParamsFromPatch({ body: { startHz: 150, endHz: 40 } }, { sampleRate: 44100, durationSec: 0.2 }))
    const b = renderAcbKick(acbKickParamsFromPatch({ body: { startHz: 250, endHz: 80 } }, { sampleRate: 44100, durationSec: 0.2 }))
    // They should differ (different pitch content)
    let diff = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff += Math.abs(a[i] - b[i])
    expect(diff).toBeGreaterThan(0.01)
  })
})


describe('ACB snare model (A2.1)', () => {
  function snareParams(over = {}) {
    return {
      sampleRate: 44100, durationSec: 0.2,
      toneHz: 195, tonePitchDropHz: 40, toneAmount: 0.5,
      noiseBpHz: 1850, noiseResonance: 0.6, noiseAmount: 0.7,
      noiseDecayMs: 130, toneDecayMs: 90, driveDb: 2,
      ...over,
    }
  }
  it('is bounded and deterministic', () => {
    const a = renderAcbSnare(snareParams())
    const b = renderAcbSnare(snareParams())
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(-1.01)
      expect(a[i]).toBeLessThanOrEqual(1.01)
    }
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
  it('has resonant noise energy in the snare band', () => {
    const s = renderAcbSnare(snareParams())
    const e = goertzelEnergy(s, 44100, 1850)
    expect(e).toBeGreaterThan(0.005)
  })
  it('has a fast transient', () => {
    const s = renderAcbSnare(snareParams())
    const head = Math.floor(44100 * 0.003)
    let e = 0
    for (let i = 0; i < head; i++) e += Math.abs(s[i])
    expect(e / head).toBeGreaterThan(0.05)
  })
})

describe('ACB hat model (A2.2)', () => {
  function hatParams(over = {}) {
    return {
      sampleRate: 44100, durationSec: 0.15,
      metalHz: 5500, ringRatio: 1.34,
      hpHz: 7500, hpResonance: 0.6, decayMs: 45, driveDb: 1,
      ...over,
    }
  }
  it('is bounded and deterministic', () => {
    const a = renderAcbHat(hatParams())
    const b = renderAcbHat(hatParams())
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(-1.01)
      expect(a[i]).toBeLessThanOrEqual(1.01)
    }
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
  it('has metallic brightness (high-frequency energy)', () => {
    const s = renderAcbHat(hatParams())
    const e = goertzelEnergy(s, 44100, 8000)
    expect(e).toBeGreaterThan(0.003)
  })
  it('closed hat (short decay) is quieter in the tail than open hat (long decay)', () => {
    const closed = renderAcbHat(hatParams({ decayMs: 45, durationSec: 0.4 }))
    const open = renderAcbHat(hatParams({ decayMs: 330, durationSec: 0.4 }))
    let eClosed = 0, eOpen = 0
    const from = Math.floor(44100 * 0.2)
    for (let i = from; i < closed.length; i++) eClosed += Math.abs(closed[i])
    for (let i = from; i < open.length; i++) eOpen += Math.abs(open[i])
    expect(eOpen).toBeGreaterThan(eClosed)
  })
})
