// Step Z RENDER-PROOF tests — assert crash/ride actually SOUND like cymbals.
// Crash = long metallic wash, ride = metallic wash + ping tone.

import { describe, it, expect } from 'bun:test'
import { renderCymbalEngine } from '../../src/psy-drum/cymbal-engine'
import type { CymbalEngineParams } from '../../src/psy-drum/cymbal-engine'

const SR = 44100

function crashParams(over: Partial<CymbalEngineParams> = {}): CymbalEngineParams {
  return {
    sampleRate: SR,
    durationSec: 0.7,
    oversample: 2,
    metalHz: 3800,
    ringRatio: 1.41,
    metalAmount: 0.6,
    pingHz: 0,          // crash: no ping
    pingAmount: 0,
    hpHz: 5000,
    hpQ: 0.7,
    decayMs: 700,
    driveDb: 1,
    ...over,
  }
}

function rideParams(over: Partial<CymbalEngineParams> = {}): CymbalEngineParams {
  return crashParams({
    durationSec: 0.5,
    metalHz: 4500,
    pingHz: 5200,       // ride: has ping
    pingAmount: 0.5,
    hpHz: 6000,
    decayMs: 520,
    ...over,
  })
}

function rms(x: Float32Array, from = 0, to = -1): number {
  if (to < 0) to = x.length
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, to - from))
}

describe('cymbal engine render-proof (tests the SOUND)', () => {
  it('crash has metallic wash energy (total RMS)', () => {
    const s = renderCymbalEngine(crashParams())
    expect(rms(s)).toBeGreaterThan(0.02)
  })

  it('crash has a long decay (still ringing at 400ms)', () => {
    const s = renderCymbalEngine(crashParams({ durationSec: 0.7, decayMs: 700 }))
    const tail = rms(s, Math.floor(SR * 0.4))
    expect(tail).toBeGreaterThan(0.005)
  })

  it('ride ping adds a distinct tone (ride RMS > crash-style no-ping)', () => {
    const ride = renderCymbalEngine(rideParams({ pingHz: 5200, pingAmount: 0.5 }))
    const noPing = renderCymbalEngine(rideParams({ pingHz: 0, pingAmount: 0 }))
    expect(rms(ride)).toBeGreaterThan(rms(noPing))
  })

  it('is bounded and deterministic', () => {
    const a = renderCymbalEngine(crashParams())
    const b = renderCymbalEngine(crashParams())
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeGreaterThanOrEqual(-1.01)
      expect(a[i]).toBeLessThanOrEqual(1.01)
    }
    expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)))
  })
})
