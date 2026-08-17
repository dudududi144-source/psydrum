// Step J tests — reverb impulse response generator.

import { describe, it, expect } from 'bun:test'
import { makeReverbIR } from '../../src/psy-drum/fx'

// Minimal ctx stub (only sampleRate + createBuffer needed).
const fakeCtx = {
  sampleRate: 44100,
  createBuffer: (channels: number, length: number, sampleRate: number) => {
    const data = new Float32Array(length)
    return {
      getChannelData: () => data,
      length: length,
      sampleRate: sampleRate,
      numberOfChannels: channels,
    }
  },
} as unknown as BaseAudioContext

describe('reverb impulse response', () => {
  it('produces a buffer of the right length', () => {
    const ir = makeReverbIR(fakeCtx, 0.5, 2.0, 42)
    expect(ir.length).toBe(Math.floor(44100 * 0.5))
  })

  it('is deterministic for the same seed', () => {
    const a = makeReverbIR(fakeCtx, 0.2, 2.0, 7)
    const b = makeReverbIR(fakeCtx, 0.2, 2.0, 7)
    const da = a.getChannelData(0)
    const db = b.getChannelData(0)
    expect(Array.from(da.slice(0, 100))).toEqual(Array.from(db.slice(0, 100)))
  })

  it('decays toward zero (later samples are quieter on average)', () => {
    const ir = makeReverbIR(fakeCtx, 0.5, 2.5, 99)
    const d = ir.getChannelData(0)
    const n = d.length
    let head = 0, tail = 0
    const win = Math.floor(n / 10)
    for (let i = 0; i < win; i++) head += Math.abs(d[i])
    for (let i = n - win; i < n; i++) tail += Math.abs(d[i])
    expect(tail / win).toBeLessThan(head / win)
  })
})
