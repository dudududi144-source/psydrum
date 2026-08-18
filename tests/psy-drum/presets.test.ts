// Step R tests — premium preset library.

import { describe, it, expect } from 'bun:test'
import { KIT_PRESETS, GROOVE_PRESETS, findKitPreset, findGroovePreset } from '../../src/psy-drum/presets'

const DRUM_ROLES = ['kick','snare','clap','hat-closed','hat-open','tom','perc','ride','crash']

describe('kit presets', () => {
  it('provides at least four kits with unique ids and styles', () => {
    expect(KIT_PRESETS.length).toBeGreaterThanOrEqual(4)
    const ids = KIT_PRESETS.map(k => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every kit defines all nine drum roles', () => {
    for (const kit of KIT_PRESETS) {
      for (const role of DRUM_ROLES) {
        expect(kit.drums[role]).toBeDefined()
      }
    }
  })

  it('every kit kick has a pitched body and drive', () => {
    for (const kit of KIT_PRESETS) {
      const kick = kit.drums['kick']
      expect(kick.body).toBeDefined()
      expect(kick.driveDb).toBeGreaterThan(0)
    }
  })

  it('findKitPreset returns the kit by id, null otherwise', () => {
    expect(findKitPreset('kit-full-psych')).not.toBeNull()
    expect(findKitPreset('nope')).toBeNull()
  })
})

describe('groove presets', () => {
  it('provides at least four grooves with unique ids', () => {
    expect(GROOVE_PRESETS.length).toBeGreaterThanOrEqual(6)
    const ids = GROOVE_PRESETS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every groove pattern is 16 chars of x/.', () => {
    for (const g of GROOVE_PRESETS) {
      for (const ch of Object.keys(g.patterns)) {
        const pat = g.patterns[ch]
        expect(pat.length).toBe(16)
        for (const c of pat) expect(c === 'x' || c === '.').toBe(true)
      }
    }
  })

  it('every groove has at least one hit', () => {
    for (const g of GROOVE_PRESETS) {
      const anyHit = Object.keys(g.patterns).some(ch => g.patterns[ch].includes('x'))
      expect(anyHit).toBe(true)
    }
  })

  it('findGroovePreset returns the groove by id, null otherwise', () => {
    expect(findGroovePreset('groove-fullon')).not.toBeNull()
    expect(findGroovePreset('nope')).toBeNull()
  })
})
