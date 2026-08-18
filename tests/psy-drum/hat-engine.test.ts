// Step Y RENDER-PROOF tests — assert the hi-hat actually SOUNDS metallic.
// Closed hat must decay fast; open hat must ring longer; both must be bright.

import { describe, it, expect } from 'bun:test'
import { renderHatEngine } from '../../src/psy-drum/hat-engine'
import type { HatEngineParams } from '../../src/psy-drum/hat-engine'

const SR = 44100

function baseParams(over: Partial<HatEngineParams> = {}): HatEngineParams {
  return {
    sampleRate: SR,
    durationSec: 0.4,
    oversample: 2,
    open: false,
    metalHz: 5500,
    ringRatio: 1.34,
    metalAmount: 0.6,
    noiseAmount: 0.3,
    noiseHpHz: 7000,
    hpHz: 7500,
    hpQ: 0.7,
    decayMs: 45,
    driveDb: 1,
    ...over,
  }
}

function rms(x: Float32Array, from = 0, to = -1): number {
  if (to < 0) to = x.length
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, to - from))
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

describe('hat engine render-proof (tests the SOUND)', () => {
  it('is bright (has high-frequency metallic energy above 5kHz)', () => {
    const s = renderHatEngine(baseParams())
    const hi = goertzelEnergy(s, SR, 6000) + goertzelEnergy(s, SR, 8000)
    expect(hi).toBeGreaterThan(0.005)
  })

  it('closed hat decays fast', () => {
    const s = renderHatEngine(baseParams({ decayMs: 45, durationSec: 0.3 }))
    const head = rms(s, 0, Math.floor(SR * 0.01))
    const tail = rms(s, Math.floor(SR * 0.15))
    expect(tail).toBeLessThan(head * 0.5)
  })

  it('open hat rings longer than closed hat', () => {
    const closed = renderHatEngine(baseParams({ decayMs: 45 }))
    const open = renderHatEngine(baseParams({ decayMs: 330, open: true }))
    const closedTail = rms(closed, Math.floor(SR * 0.2))
    const openTail = rms(open, Math.floor(SR * 0.2))
    expect(openTail).toBeGreaterThan(closedTail)
  })

  it('has a fast transient', () => {
    const s = renderHatEngine(baseParams())
    const head = Math.floor(SR * 0.002)
    let e = 0
    for (let i = 0; i < head; i++) e += Math.abs(s[i])
    e /= head
    expect(e).toBeGreaterThan(0.05)
  })

  it('is bounded and deterministic', () => {
    const a = renderHatEngine(baseParams())
    const b = renderHatEngine(baseParams())
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(-1.01)
      expect(a[i]).toBeLessThanOrEqual(1.01)
    }
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
})
