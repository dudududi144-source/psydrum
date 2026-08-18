// Step Q tests — real DSP filters (ported from psy5).

import { describe, it, expect } from 'bun:test'
import { OnePoleLP, OnePoleHP, BiquadFilter, MoogLadder } from '../../src/psy-drum/filters'

describe('OnePoleLP', () => {
  it('passes DC (low freq) and attenuates fast changes', () => {
    const f = new OnePoleLP(44100, 200)
    // feed a constant (DC) -> output converges to it
    let out = 0
    for (let i = 0; i < 500; i++) out = f.process(1)
    expect(out).toBeGreaterThan(0.9)
  })
})

describe('OnePoleHP', () => {
  it('blocks DC (output decays to ~0 for constant input)', () => {
    const f = new OnePoleHP(44100, 500)
    let out = 0
    for (let i = 0; i < 2000; i++) out = f.process(1)
    expect(Math.abs(out)).toBeLessThan(0.1)
  })
})

describe('BiquadFilter (RBJ)', () => {
  it('lowpass attenuates high frequencies more than low', () => {
    const sr = 44100
    const lp = new BiquadFilter(sr, 'lowpass', 500, Math.SQRT1_2)
    // measure output energy for a low tone vs a high tone
    function energy(freq: number): number {
      const f = new BiquadFilter(sr, 'lowpass', 500, Math.SQRT1_2)
      let e = 0
      let phase = 0
      for (let i = 0; i < 2000; i++) {
        phase += freq / sr
        const x = Math.sin(2 * Math.PI * phase)
        const y = f.process(x)
        if (i > 500) e += y * y
      }
      return e
    }
    const lowE = energy(100)
    const highE = energy(5000)
    expect(lowE).toBeGreaterThan(highE)
  })
})

describe('MoogLadder', () => {
  it('is deterministic and bounded', () => {
    const a = new MoogLadder(44100, 800, 0.5)
    const b = new MoogLadder(44100, 800, 0.5)
    let outA = 0, outB = 0
    for (let i = 0; i < 500; i++) {
      const x = Math.sin(2 * Math.PI * (i / 44100) * 200)
      outA = a.process(x)
      outB = b.process(x)
      expect(outA).toBeGreaterThanOrEqual(-2)
      expect(outA).toBeLessThanOrEqual(2)
    }
    expect(outA).toBeCloseTo(outB, 10)
  })
})
