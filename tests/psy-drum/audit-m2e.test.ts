// Audit M2e regression tests — velocity layers carry TIMBRE, not just gain.
//
// ADR-004 noted that velocity-to-timbre on pre-rendered material was limited
// to gain layering. M2e renders each velocity layer with extra drive
// (LAYER_DRIVE_DB per layer step), so loud layers are brighter/more driven —
// spectrally different, like real velocity-layered drum machines.

import { describe, it, expect } from 'bun:test'
import { renderRoleBanks, BANK_VELOCITY_LAYERS, BANK_VARIANTS, LAYER_DRIVE_DB } from '../../src/psy-drum/voice-bank'

function peak(x: Float32Array): number {
  let m = 0
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i])
    if (v > m) m = v
  }
  return m
}

describe('audit M2e - velocity layers differ in timbre', () => {
  it('soft vs loud layer are NOT related by a constant gain factor', () => {
    const banks = renderRoleBanks({}, 44100, 9)
    const sn = banks['snare']
    expect(sn).toBeDefined()
    if (sn !== undefined) {
      const soft = sn[0][0]
      const loud = sn[2][0]
      const r = peak(loud) / peak(soft)
      // compare on significant samples only (avoid division noise near zeros)
      let maxDev = 0
      let counted = 0
      for (let i = 0; i < soft.length; i++) {
        if (Math.abs(soft[i]) > 0.05) {
          counted = counted + 1
          const dev = Math.abs(loud[i] - soft[i] * r)
          if (dev > maxDev) maxDev = dev
        }
      }
      expect(counted).toBeGreaterThan(100)
      // pure gain scaling would give maxDev ~ 0; driven layers deviate clearly
      expect(maxDev).toBeGreaterThan(0.02)
    }
  })

  it('kick layers are timbre-distinct too', () => {
    const banks = renderRoleBanks({}, 44100, 9)
    const k = banks['kick']
    expect(k).toBeDefined()
    if (k !== undefined) {
      const soft = k[0][0]
      const loud = k[2][0]
      const r = peak(loud) / peak(soft)
      let maxDev = 0
      for (let i = 0; i < soft.length; i++) {
        if (Math.abs(soft[i]) > 0.05) {
          const dev = Math.abs(loud[i] - soft[i] * r)
          if (dev > maxDev) maxDev = dev
        }
      }
      expect(maxDev).toBeGreaterThan(0.02)
    }
  })
})

describe('audit M2e - determinism and structure preserved', () => {
  it('same seed => bit-identical banks (render path still deterministic)', () => {
    const a = renderRoleBanks({}, 44100, 12)
    const b = renderRoleBanks({}, 44100, 12)
    const ka = a['kick']
    const kb = b['kick']
    expect(ka).toBeDefined()
    expect(kb).toBeDefined()
    if (ka !== undefined && kb !== undefined) {
      for (let li = 0; li < ka.length; li++) {
        for (let v = 0; v < ka[li].length; v++) {
          expect(Array.from(ka[li][v])).toEqual(Array.from(kb[li][v]))
        }
      }
    }
  })

  it('louder layers are still louder (gain layering intact)', () => {
    const banks = renderRoleBanks({}, 44100, 12)
    const k = banks['kick']
    expect(k).toBeDefined()
    if (k !== undefined) {
      expect(peak(k[2][0])).toBeGreaterThan(peak(k[0][0]))
      // layer gains follow BANK_VELOCITY_LAYERS
      const ratio = peak(k[2][0]) / peak(k[0][0])
      expect(ratio).toBeGreaterThan(BANK_VELOCITY_LAYERS[2] / BANK_VELOCITY_LAYERS[0] * 0.7)
      expect(ratio).toBeLessThan(BANK_VELOCITY_LAYERS[2] / BANK_VELOCITY_LAYERS[0] * 1.4)
    }
  })

  it('structure unchanged: 3 layers x 2 variants for every banked role', () => {
    const banks = renderRoleBanks({}, 44100, 12)
    for (const role of ['kick', 'snare', 'hat-closed', 'hat-open'] as const) {
      const layers = banks[role]
      expect(layers).toBeDefined()
      if (layers !== undefined) {
        expect(layers.length).toBe(BANK_VELOCITY_LAYERS.length)
        for (const variants of layers) expect(variants.length).toBe(BANK_VARIANTS)
      }
    }
    expect(LAYER_DRIVE_DB).toBeGreaterThan(0)
  })
})
