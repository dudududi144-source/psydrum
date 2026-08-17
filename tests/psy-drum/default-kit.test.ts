// Step B tests — default psy kit integrity.

import { describe, it, expect } from 'bun:test'
import { DEFAULT_PSY_KIT } from '../../src/psy-drum/default-kit'
import { DRUM_ROLES } from '../../src/psy-drum/types'

describe('default psy kit', () => {
  it('provides a patch for every canonical drum role', () => {
    for (const role of DRUM_ROLES) {
      expect(DEFAULT_PSY_KIT[role]).toBeDefined()
    }
  })

  it('every patch has an amp envelope (attack < decay)', () => {
    for (const role of DRUM_ROLES) {
      const p = DEFAULT_PSY_KIT[role]
      expect(p.amp).toBeDefined()
      if (p.amp !== undefined) {
        expect(p.amp.attackMs).toBeGreaterThan(0)
        expect(p.amp.decayMs).toBeGreaterThan(p.amp.attackMs)
      }
    }
  })

  it('kick/tom have a pitched body; hats/snare/clap/crash/ride have noise', () => {
    const kick = DEFAULT_PSY_KIT['kick']
    const tom = DEFAULT_PSY_KIT['tom']
    expect(kick.body).toBeDefined()
    expect(tom.body).toBeDefined()
    for (const role of ['snare', 'clap', 'hat-closed', 'hat-open', 'ride', 'crash'] as const) {
      expect(DEFAULT_PSY_KIT[role].noise).toBeDefined()
    }
  })

  it('velTrack is within 0..1 for every patch', () => {
    for (const role of DRUM_ROLES) {
      const vt = DEFAULT_PSY_KIT[role].velTrack
      expect(vt).toBeDefined()
      if (vt !== undefined) {
        expect(vt).toBeGreaterThanOrEqual(0)
        expect(vt).toBeLessThanOrEqual(1)
      }
    }
  })
})
