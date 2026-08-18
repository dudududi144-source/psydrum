// Step W RENDER-PROOF tests — assert the kick actually SOUNDS like a kick.
// Uses the Goertzel algorithm to measure energy at specific frequencies, so we
// test the SOUND, not just that the function returns an array.

import { describe, it, expect } from 'bun:test'
import { renderKickEngine } from '../../src/psy-drum/kick-engine'
import type { KickEngineParams } from '../../src/psy-drum/kick-engine'

const SR = 44100

function baseParams(over: Partial<KickEngineParams> = {}): KickEngineParams {
  return {
    sampleRate: SR,
    durationSec: 0.25,
    oversample: 2,
    bodyStartHz: 160,
    bodyEndHz: 48,
    bodyPitchDecayMs: 45,
    punchRatio: 3,
    punchAmount: 0.5,
    punchDecayMs: 12,
    clickAmount: 0.4,
    clickHpHz: 4000,
    clickMs: 2,
    filterCutoffHz: 300,
    filterQ: 1.2,
    driveDb: 4,
    ...over,
  }
}

// Goertzel: measure relative energy at a target frequency.
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

describe('kick engine render-proof (tests the SOUND)', () => {
  it('has real sub energy below 60Hz (the boom)', () => {
    const s = renderKickEngine(baseParams())
    const sub = goertzelEnergy(s, SR, 50)
    expect(sub).toBeGreaterThan(0.05)
  })

  it('has a real fast transient (strong energy in the first 3ms)', () => {
    const s = renderKickEngine(baseParams())
    const head = Math.floor(SR * 0.003)
    let headEnergy = 0
    for (let i = 0; i < head; i++) headEnergy += Math.abs(s[i])
    headEnergy /= head
    expect(headEnergy).toBeGreaterThan(0.05)
  })

  it('body decays (later samples quieter than early)', () => {
    const s = renderKickEngine(baseParams())
    const n = s.length
    const win = Math.floor(n / 10)
    let head = 0, tail = 0
    for (let i = 0; i < win; i++) head += Math.abs(s[i])
    for (let i = n - win; i < n; i++) tail += Math.abs(s[i])
    expect(tail / win).toBeLessThan(head / win)
  })

  it('drive increases harmonic content (more high-freq energy)', () => {
    const low = renderKickEngine(baseParams({ driveDb: 0 }))
    const high = renderKickEngine(baseParams({ driveDb: 10 }))
    const lowMid = goertzelEnergy(low, SR, 400)
    const highMid = goertzelEnergy(high, SR, 400)
    expect(highMid).toBeGreaterThan(lowMid)
  })

  it('is bounded (saturation keeps it under control)', () => {
    const s = renderKickEngine(baseParams({ driveDb: 12 }))
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(-1.01)
      expect(s[i]).toBeLessThanOrEqual(1.01)
    }
  })

  it('is deterministic', () => {
    const a = renderKickEngine(baseParams())
    const b = renderKickEngine(baseParams())
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
})
