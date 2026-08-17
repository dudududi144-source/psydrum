// Step N tests — per-sample tom/perc/crash/ride DSP.

import { describe, it, expect } from 'bun:test'
import { renderTomSamples, renderPercSamples, renderCymbalSamples } from '../../src/psy-drum/perc-dsp'

const tom = { startHz: 218, endHz: 118, pitchDecayMs: 120, driveDb: 2, sampleRate: 44100, durationSec: 0.25 }
const perc = { toneHz: 640, noiseBpHz: 2600, driveDb: 1.5, sampleRate: 44100, durationSec: 0.12 }
const crash = { hpHz: 5000, decayMs: 700, pingHz: 0, pingMix: 0, driveDb: 1, sampleRate: 44100, durationSec: 0.7 }
const ride = { hpHz: 6000, decayMs: 520, pingHz: 5200, pingMix: 0.4, driveDb: 1, sampleRate: 44100, durationSec: 0.5 }

describe('per-sample tom DSP', () => {
  it('produces the right number of samples and is bounded', () => {
    const s = renderTomSamples(tom)
    expect(s.length).toBe(Math.floor(44100 * 0.25))
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1) }
  })
  it('is deterministic', () => {
    const a = renderTomSamples(tom); const b = renderTomSamples(tom)
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
  })
})

describe('per-sample perc DSP', () => {
  it('produces bounded deterministic output', () => {
    const a = renderPercSamples(perc); const b = renderPercSamples(perc)
    expect(a.length).toBe(Math.floor(44100 * 0.12))
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
    for (let i = 0; i < a.length; i++) { expect(a[i]).toBeGreaterThanOrEqual(-1); expect(a[i]).toBeLessThanOrEqual(1) }
  })
})

describe('per-sample cymbal DSP', () => {
  it('crash (no ping) is bounded and deterministic', () => {
    const a = renderCymbalSamples(crash); const b = renderCymbalSamples(crash)
    expect(a.length).toBe(Math.floor(44100 * 0.7))
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
    for (let i = 0; i < a.length; i++) { expect(a[i]).toBeGreaterThanOrEqual(-1); expect(a[i]).toBeLessThanOrEqual(1) }
  })
  it('ride (with ping) is bounded', () => {
    const s = renderCymbalSamples(ride)
    for (let i = 0; i < s.length; i++) { expect(s[i]).toBeGreaterThanOrEqual(-1); expect(s[i]).toBeLessThanOrEqual(1) }
  })
})
