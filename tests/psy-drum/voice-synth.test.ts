// Step C tests — drive/saturation curve.

import { describe, it, expect } from 'bun:test'
import { makeDriveCurve } from '../../src/psy-drum/voice-synth'

describe('drive curve (tanh soft-clip)', () => {
  it('is deterministic and normalized to [-1, 1]', () => {
    const c = makeDriveCurve(3)
    expect(c.length).toBe(1024)
    expect(c[0]).toBeCloseTo(-1, 1)
    expect(c[1023]).toBeCloseTo(1, 1)
    expect(Math.abs(c[512])).toBeLessThan(0.05) // near zero at centre
  })

  it('higher drive produces a harder clip (flatter top)', () => {
    const soft = makeDriveCurve(1)
    const hard = makeDriveCurve(6)
    // At a hot input (near the top), the hard curve saturates closer to 1 sooner.
    const idx = 900
    expect(hard[idx]).toBeGreaterThanOrEqual(soft[idx])
  })

  it('two calls with the same drive are identical (deterministic)', () => {
    const a = makeDriveCurve(4)
    const b = makeDriveCurve(4)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})
