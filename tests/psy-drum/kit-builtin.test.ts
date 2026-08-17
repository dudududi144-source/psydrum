// Step D tests — built-in kit manifest integrity.

import { describe, it, expect } from 'bun:test'
import { BUILTIN_KIT_MANIFEST } from '../../src/psy-drum/kit-builtin'
import { loadKitManifest } from '../../src/psy-drum/kit-library'
import { createCounters } from '../../src/psy-drum/counters'

describe('built-in kit manifest', () => {
  it('provides three kits with distinct ids and styles', () => {
    const kits = BUILTIN_KIT_MANIFEST.kits
    expect(kits.length).toBe(3)
    const ids = kits.map(k => k.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain('psy-classic')
  })

  it('every kit passes loadKitManifest validation (reject-at-load)', () => {
    const counters = createCounters()
    const loaded = loadKitManifest(BUILTIN_KIT_MANIFEST, counters)
    expect(loaded.length).toBe(3)
    expect(counters.kitLoadErrors).toBe(0)
  })

  it('every kit defines all nine drum roles', () => {
    const roles = ['kick','snare','clap','hat-closed','hat-open','tom','perc','ride','crash']
    for (const kit of BUILTIN_KIT_MANIFEST.kits) {
      for (const role of roles) {
        expect(kit.drums[role]).toBeDefined()
      }
    }
  })

  it('all kits carry procedural provenance (no quarantined samples)', () => {
    for (const kit of BUILTIN_KIT_MANIFEST.kits) {
      expect(kit.provenance.license).toBe('procedural')
    }
  })
})
