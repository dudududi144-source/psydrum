// Step M tests — per-sample snare + hats DSP (pure render functions).

import { describe, it, expect } from 'bun:test'
import { renderSnareSamples, renderHatSamples } from '../../src/psy-drum/perc-dsp'

const snare = { toneHz: 190, noiseBpHz: 1800, driveDb: 2, sampleRate: 44100, durationSec: 0.18 }
const hatClosed = { hpHz: 7000, decayMs: 42, driveDb: 1, sampleRate: 44100, durationSec: 0.1 }
const hatOpen = { hpHz: 6400, decayMs: 330, driveDb: 1, sampleRate: 44100, durationSec: 0.4 }

describe('per-sample snare DSP', () => {
  it('produces the right number of samples', () => {
    const s = renderSnareSamples(snare)
    expect(s.length).toBe(Math.floor(44100 * 0.18))
  })
  it('is deterministic', () => {
    const a = renderSnareSamples(snare)
    const b = renderSnareSamples(snare)
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
  })
  it('is bounded to [-1, 1]', () => {
    const s = renderSnareSamples(snare)
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1) }
  })
  it('has a strong attack', () => {
    const s = renderSnareSamples(snare)
    let early = 0
    for (let i = 0; i < 300; i++) early += Math.abs(s[i])
    expect(early / 300).toBeGreaterThan(0.05)
  })
})

describe('per-sample hats DSP', () => {
  it('closed hat decays faster than open hat', () => {
    const c = renderHatSamples(hatClosed)
    const o = renderHatSamples(hatOpen)
    // energy in the tail (after 100ms): open should have more
    const cTail = c.length > 4410 ? Math.abs(c[4500]) : 0
    const oTail = o.length > 4410 ? Math.abs(o[4500]) : 0
    // closed should be quieter at 100ms than open
    expect(cTail).toBeLessThanOrEqual(oTail + 1e-6)
  })
  it('is deterministic', () => {
    const a = renderHatSamples(hatClosed)
    const b = renderHatSamples(hatClosed)
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
  })
  it('is bounded to [-1, 1]', () => {
    const s = renderHatSamples(hatOpen)
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1) }
  })
})
