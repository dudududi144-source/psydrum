// Phase 7 tests — kit library: load-time validation, provenance policy,
// reject-at-load (never at runtime), and sample fallback.
//
// Contract under test: invalid kits are REJECTED AT LOAD and bump kitLoadErrors;
// sample assets that fail to resolve fall back to synthesis-only and bump
// sampleFallbacks (never silent, never throws).

import { describe, it, expect } from 'bun:test'
import {
  ALLOWED_LICENSES,
  validateDrumPatch,
  validateProvenance,
  validateKitDefinition,
  loadKitManifest,
  applySampleFallback,
} from '../../src/psy-drum/kit-library'
import type { KitDefinition } from '../../src/psy-drum/kit-library'
import type { DrumPatch } from '../../src/psy-drum/types'
import { createCounters } from '../../src/psy-drum/counters'

function goodPatch(): DrumPatch {
  return {
    body: { wave: 'sine', startHz: 150, endHz: 50, pitchDecayMs: 100 },
    amp: { attackMs: 1, decayMs: 200, releaseMs: 50 },
  }
}

function goodKit(): KitDefinition {
  return {
    id: 'test-kit',
    style: 'psytrance',
    provenance: { author: 'tester', license: 'procedural', created: '2026' },
    drums: { kick: goodPatch() },
    humanize: true,
    choke: { hat: 'exclusive', crashMaxPoly: 2, rideMaxPoly: 2 },
  }
}

describe('provenance policy', () => {
  it('allowed licenses are procedural and CC0', () => {
    expect([...ALLOWED_LICENSES]).toEqual(['procedural', 'CC0'])
  })

  it('a valid provenance passes', () => {
    expect(validateProvenance({ author: 'a', license: 'CC0', created: '2026' })).toEqual([])
  })

  it('rejects a missing author', () => {
    const errs = validateProvenance({ license: 'CC0', created: '2026' })
    expect(errs.length).toBeGreaterThan(0)
  })

  it('rejects an unknown / quarantined license', () => {
    const errs = validateProvenance({ author: 'a', license: 'UNKNOWN', created: '2026' })
    expect(errs.length).toBeGreaterThan(0)
  })

  it('rejects a missing created date', () => {
    const errs = validateProvenance({ author: 'a', license: 'CC0' })
    expect(errs.length).toBeGreaterThan(0)
  })

  it('rejects a null provenance', () => {
    expect(validateProvenance(null).length).toBeGreaterThan(0)
  })
})

describe('drum patch bounds (reject at load)', () => {
  it('a valid patch passes', () => {
    expect(validateDrumPatch(goodPatch(), 'kick')).toEqual([])
  })

  it('rejects body.startHz below 20Hz', () => {
    const p = goodPatch()
    p.body = { wave: 'sine', startHz: 10, endHz: 50, pitchDecayMs: 100 }
    expect(validateDrumPatch(p, 'kick').length).toBeGreaterThan(0)
  })

  it('rejects body.endHz above 20kHz', () => {
    const p = goodPatch()
    p.body = { wave: 'sine', startHz: 150, endHz: 30000, pitchDecayMs: 100 }
    expect(validateDrumPatch(p, 'kick').length).toBeGreaterThan(0)
  })

  it('rejects driveDb above 6', () => {
    const p = goodPatch()
    p.driveDb = 12
    expect(validateDrumPatch(p, 'kick').length).toBeGreaterThan(0)
  })

  it('rejects velTrack above 1', () => {
    const p = goodPatch()
    p.velTrack = 2
    expect(validateDrumPatch(p, 'kick').length).toBeGreaterThan(0)
  })

  it('rejects amp.releaseMs above the env cap', () => {
    const p = goodPatch()
    p.amp = { attackMs: 1, decayMs: 200, releaseMs: 99999 }
    expect(validateDrumPatch(p, 'kick').length).toBeGreaterThan(0)
  })

  it('rejects a non-string sample.assetId', () => {
    const p = { sample: { gain: 0.5, assetId: 123 } } as unknown as DrumPatch
    const errs = validateDrumPatch(p, 'kick')
    expect(errs.length).toBeGreaterThan(0)
  })
})

describe('kit definition validation', () => {
  it('a valid kit passes', () => {
    expect(validateKitDefinition(goodKit())).toEqual([])
  })

  it('rejects a missing id', () => {
    const k = goodKit() as unknown as Record<string, unknown>
    delete k.id
    expect(validateKitDefinition(k).length).toBeGreaterThan(0)
  })

  it('rejects an unknown drum role', () => {
    const k = goodKit()
    k.drums = { bass: goodPatch() } as Record<string, DrumPatch>
    const errs = validateKitDefinition(k)
    expect(errs.some((e) => e.indexOf('unknown drum role') !== -1)).toBe(true)
  })

  it('rejects empty drums', () => {
    const k = goodKit()
    k.drums = {}
    expect(validateKitDefinition(k).length).toBeGreaterThan(0)
  })

  it('rejects a bad choke.hat', () => {
    const k = goodKit() as unknown as Record<string, unknown>
    k.choke = { hat: 'sometimes', crashMaxPoly: 2, rideMaxPoly: 2 }
    expect(validateKitDefinition(k).length).toBeGreaterThan(0)
  })

  it('rejects crashMaxPoly below 1', () => {
    const k = goodKit() as unknown as Record<string, unknown>
    k.choke = { hat: 'exclusive', crashMaxPoly: 0, rideMaxPoly: 2 }
    expect(validateKitDefinition(k).length).toBeGreaterThan(0)
  })

  it('rejects a non-boolean humanize', () => {
    const k = goodKit() as unknown as Record<string, unknown>
    k.humanize = 'yes'
    expect(validateKitDefinition(k).length).toBeGreaterThan(0)
  })
})

describe('loadKitManifest — reject at load, never at runtime', () => {
  it('returns all valid kits and does not bump kitLoadErrors', () => {
    const counters = createCounters()
    const manifest = { manifestVersion: 1, seed: 1, kits: [goodKit()] }
    const kits = loadKitManifest(manifest, counters)
    expect(kits.length).toBe(1)
    expect(counters.kitLoadErrors).toBe(0)
  })

  it('rejects an invalid kit and bumps kitLoadErrors', () => {
    const counters = createCounters()
    const bad = goodKit() as unknown as Record<string, unknown>
    delete bad.id
    const manifest = { manifestVersion: 1, seed: 1, kits: [goodKit(), bad] }
    const kits = loadKitManifest(manifest, counters)
    expect(kits.length).toBe(1) // only the valid one survives
    expect(counters.kitLoadErrors).toBe(1)
  })

  it('a null manifest bumps kitLoadErrors and yields no kits', () => {
    const counters = createCounters()
    const kits = loadKitManifest(null, counters)
    expect(kits).toEqual([])
    expect(counters.kitLoadErrors).toBe(1)
  })

  it('a manifest without a kits array bumps kitLoadErrors', () => {
    const counters = createCounters()
    const kits = loadKitManifest({ manifestVersion: 1 }, counters)
    expect(kits).toEqual([])
    expect(counters.kitLoadErrors).toBe(1)
  })
})

describe('sample fallback — never silent, never throws', () => {
  it('zeroes sample gain and bumps sampleFallbacks when an asset is present', () => {
    const counters = createCounters()
    const patch: DrumPatch = { sample: { gain: 0.8, assetId: 'missing-asset' } }
    applySampleFallback(patch, counters)
    expect(patch.sample?.gain).toBe(0)
    expect(counters.sampleFallbacks).toBe(1)
  })

  it('is a no-op when there is no sample layer', () => {
    const counters = createCounters()
    const patch = goodPatch()
    applySampleFallback(patch, counters)
    expect(counters.sampleFallbacks).toBe(0)
  })

  it('is a no-op when the sample has no assetId', () => {
    const counters = createCounters()
    const patch: DrumPatch = { sample: { gain: 0.5, assetId: null } }
    applySampleFallback(patch, counters)
    expect(counters.sampleFallbacks).toBe(0)
  })
})
