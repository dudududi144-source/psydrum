// Step L tests — per-sample psy kick DSP (pure renderPsyKickSamples).

import { describe, it, expect } from 'bun:test'
import { renderPsyKickSamples } from '../../src/psy-drum/kick-dsp'

const baseParams = {
  startHz: 168, endHz: 44, pitchDecayMs: 42,
  clickMs: 2, driveDb: 3.5, sampleRate: 44100, durationSec: 0.25,
}

describe('per-sample psy kick DSP', () => {
  it('produces the right number of samples', () => {
    const s = renderPsyKickSamples(baseParams)
    expect(s.length).toBe(Math.floor(44100 * 0.25))
  })

  it('is deterministic (same params -> same output)', () => {
    const a = renderPsyKickSamples(baseParams)
    const b = renderPsyKickSamples(baseParams)
    expect(Array.from(a.slice(0, 200))).toEqual(Array.from(b.slice(0, 200)))
  })

  it('is bounded to [-1, 1] (tanh saturation)', () => {
    const s = renderPsyKickSamples(baseParams)
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(-1)
      expect(s[i]).toBeLessThanOrEqual(1)
    }
  })

  it('the attack is strong (early samples have energy)', () => {
    const s = renderPsyKickSamples(baseParams)
    let early = 0
    for (let i = 0; i < 400; i++) early += Math.abs(s[i])
    expect(early / 400).toBeGreaterThan(0.1)
  })

  it('the tail decays (later samples are quieter than early)', () => {
    const s = renderPsyKickSamples(baseParams)
    const n = s.length
    let early = 0, tail = 0
    for (let i = 0; i < 300; i++) early += Math.abs(s[i])
    for (let i = n - 300; i < n; i++) tail += Math.abs(s[i])
    expect(tail / 300).toBeLessThan(early / 300)
  })
})
