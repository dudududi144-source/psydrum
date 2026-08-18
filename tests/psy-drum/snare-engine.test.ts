// Step X RENDER-PROOF tests — assert the snare actually SOUNDS like a snare.
// Goertzel measures tone-body energy vs snare-wire noise energy.

import { describe, it, expect } from 'bun:test'
import { renderSnareEngine } from '../../src/psy-drum/snare-engine'
import type { SnareEngineParams } from '../../src/psy-drum/snare-engine'

const SR = 44100

function baseParams(over: Partial<SnareEngineParams> = {}): SnareEngineParams {
  return {
    sampleRate: SR,
    durationSec: 0.18,
    oversample: 2,
    toneHz: 195,
    tonePitchDropHz: 40,
    tonePitchDecayMs: 20,
    toneAmount: 0.5,
    toneDecayMs: 90,
    noiseBpHz: 1850,
    noiseQ: 1.0,
    noiseAmount: 0.7,
    noiseDecayMs: 130,
    driveDb: 2,
    ...over,
  }
}

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
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / samples.length
}

describe('snare engine render-proof (tests the SOUND)', () => {
  it('has tone-body energy near the shell frequency', () => {
    const s = renderSnareEngine(baseParams())
    const body = goertzelEnergy(s, SR, 190) + goertzelEnergy(s, SR, 200)
    expect(body).toBeGreaterThan(0.01)
  })

  it('has snare-wire noise energy near the band-pass centre', () => {
    const s = renderSnareEngine(baseParams())
    // the snare-wire noise is band-passed at noiseBpHz (1850); measure near it
    const mid = goertzelEnergy(s, SR, 1500) + goertzelEnergy(s, SR, 1850) + goertzelEnergy(s, SR, 2200)
    expect(mid).toBeGreaterThan(0.005)
  })

  it('has a fast transient (strong energy in the first 3ms)', () => {
    const s = renderSnareEngine(baseParams())
    const head = Math.floor(SR * 0.003)
    let e = 0
    for (let i = 0; i < head; i++) e += Math.abs(s[i])
    e /= head
    expect(e).toBeGreaterThan(0.05)
  })

  it('decays (later quieter than early)', () => {
    const s = renderSnareEngine(baseParams())
    const n = s.length
    const win = Math.floor(n / 10)
    let head = 0, tail = 0
    for (let i = 0; i < win; i++) head += Math.abs(s[i])
    for (let i = n - win; i < n; i++) tail += Math.abs(s[i])
    expect(tail / win).toBeLessThan(head / win)
  })

  it('is bounded and deterministic', () => {
    const a = renderSnareEngine(baseParams())
    const b = renderSnareEngine(baseParams())
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(-1.01)
      expect(a[i]).toBeLessThanOrEqual(1.01)
    }
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
})
