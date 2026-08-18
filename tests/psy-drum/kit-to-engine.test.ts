// Step AA tests — kit-to-engine mapping (kit presets drive the real engines).

import { describe, it, expect } from 'bun:test'
import { kickParamsFromPatch, snareParamsFromPatch, hatParamsFromPatch, cymbalParamsFromPatch } from '../../src/psy-drum/kit-to-engine'
import type { DrumPatch } from '../../src/psy-drum/types'

const D = { sampleRate: 44100, durationSec: 0.25, oversample: 2 }

describe('kit-to-engine mapping', () => {
  it('kick params come from the patch body/drive', () => {
    const p: DrumPatch = {
      body: { wave: 'sine', startHz: 200, endHz: 60, pitchDecayMs: 50 },
      amp: { attackMs: 1, decayMs: 150, releaseMs: 40 },
      driveDb: 6,
    }
    const k = kickParamsFromPatch(p, D)
    expect(k.bodyStartHz).toBe(200)
    expect(k.bodyEndHz).toBe(60)
    expect(k.bodyPitchDecayMs).toBe(50)
    expect(k.bodyDecayMs).toBe(150)
    expect(k.driveDb).toBe(6)
  })

  it('snare params come from the patch tone/noise', () => {
    const p: DrumPatch = {
      body: { wave: 'triangle', startHz: 220, endHz: 220, pitchDecayMs: 10 },
      noise: { mix: 0.8, bpHz: 2000 },
      driveDb: 3,
    }
    const s = snareParamsFromPatch(p, D)
    expect(s.toneHz).toBe(220)
    expect(s.noiseBpHz).toBe(2000)
    expect(s.driveDb).toBe(3)
  })

  it('hat params respect open vs closed decay', () => {
    const p: DrumPatch = { noise: { mix: 0.3, bpHz: 7000 } }
    const closed = hatParamsFromPatch(p, D, false)
    const open = hatParamsFromPatch(p, D, true)
    expect(closed.open).toBe(false)
    expect(open.open).toBe(true)
    expect(open.decayMs).toBeGreaterThan(closed.decayMs)
  })

  it('cymbal params: ride has ping, crash does not', () => {
    const p: DrumPatch = {}
    const crash = cymbalParamsFromPatch(p, D, false)
    const ride = cymbalParamsFromPatch(p, D, true)
    expect(crash.pingHz).toBe(0)
    expect(ride.pingHz).toBeGreaterThan(0)
  })

  it('different patches produce different engine params (sound changes with kit)', () => {
    const a: DrumPatch = { body: { wave: 'sine', startHz: 150, endHz: 40, pitchDecayMs: 40 } }
    const b: DrumPatch = { body: { wave: 'sine', startHz: 220, endHz: 70, pitchDecayMs: 60 } }
    const ka = kickParamsFromPatch(a, D)
    const kb = kickParamsFromPatch(b, D)
    expect(ka.bodyStartHz).not.toBe(kb.bodyStartHz)
  })
})
