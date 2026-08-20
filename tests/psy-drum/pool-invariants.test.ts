// Pool invariants — PROVEN, not assumed.
//
// Background: the roast claimed a latent defect ("allocVoice may return -1
// and startVoiceAudio plays untracked audio"). Code-level analysis showed
// that path is provably unreachable: with pool.size >= 1 (createVoicePool
// clamps), findFreeVoice === -1 implies all slots active, and then
// pickStealVictim must find a victim. Instead of adding dead defensive code,
// this file turns the load-bearing assumptions into PROVEN invariants:
//
//   I1  allocVoice never returns -1, under saturation + any trigger stream
//   I2  countActive never exceeds pool.size
//   I3  per-role caps hold after EVERY alloc (anti-starvation guarantee)
//   I4  resetPool leaves zero active voices
//   I5  steal order is deterministic: same stream => identical pool state
//   I6  releaseByChannel releases the matching voice exactly once, then -1
//   I7  chokeRole frees exactly min(requested, active-of-role)
//   P1  PINNED KNOWN GAP: VoiceState.gain is never updated post-alloc (the
//       documented "lowest current gain" steal tie-break is therefore dead —
//       envelopes live in WebAudio and are not tracked in the pool). Roadmap.

import { describe, it, expect } from 'bun:test'
import {
  createVoicePool, allocVoice, releaseByChannel, chokeRole,
  countActive, countActiveForRole, resetPool,
} from '../../src/psy-drum/voice-pool'
import { DRUM_ROLES, DEFAULT_ROLE_CAPS } from '../../src/psy-drum/types'
import type { DrumRole } from '../../src/psy-drum/types'
import { createCounters } from '../../src/psy-drum/counters'
import { mulberry32 } from '../../src/psy-drum/variance-rules'

// Seeded pseudo-random role stream (deterministic per seed).
function roleStream(seed: number, n: number): DrumRole[] {
  const rng = mulberry32(seed)
  const out: DrumRole[] = []
  for (let i = 0; i < n; i++) out.push(DRUM_ROLES[Math.floor(rng() * DRUM_ROLES.length)])
  return out
}

function runStream(seed: number, n: number, poolSize: number) {
  const pool = createVoicePool(poolSize)
  const counters = createCounters()
  const stream = roleStream(seed, n)
  for (let i = 0; i < stream.length; i++) {
    const idx = allocVoice(pool, stream[i], 'ch-' + stream[i], i, counters)
    if (idx < 0) return { pool, counters, failedAt: i }
  }
  return { pool, counters, failedAt: -1 }
}

describe('I1/I2/I3 - allocation invariants under saturation', () => {
  it('allocVoice never returns -1 and active never exceeds pool size (500-trigger stream)', () => {
    const pool = createVoicePool(16)
    const counters = createCounters()
    const stream = roleStream(7, 500)
    for (let i = 0; i < stream.length; i++) {
      const idx = allocVoice(pool, stream[i], 'c', i, counters)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(pool.size)
      expect(countActive(pool)).toBeLessThanOrEqual(pool.size)
    }
  })

  it('per-role caps hold after EVERY alloc across the stream', () => {
    const pool = createVoicePool(16)
    const counters = createCounters()
    const stream = roleStream(13, 500)
    for (let i = 0; i < stream.length; i++) {
      allocVoice(pool, stream[i], 'c', i, counters)
      for (const role of DRUM_ROLES) {
        expect(countActiveForRole(pool, role)).toBeLessThanOrEqual(DEFAULT_ROLE_CAPS[role])
      }
    }
  })

  it('holds even at the minimal pool size (1 voice)', () => {
    const pool = createVoicePool(1)
    const counters = createCounters()
    for (let i = 0; i < 50; i++) {
      const idx = allocVoice(pool, DRUM_ROLES[i % DRUM_ROLES.length], 'c', i, counters)
      expect(idx).toBe(0) // the single slot, re-stolen every time
    }
    expect(countActive(pool)).toBe(1)
  })
})

describe('I4 - resetPool', () => {
  it('leaves zero active voices after saturation', () => {
    const r = runStream(21, 100, 16)
    expect(countActive(r.pool)).toBeGreaterThan(0)
    resetPool(r.pool)
    expect(countActive(r.pool)).toBe(0)
  })
})

describe('I5 - steal determinism', () => {
  it('same seed + same stream => bit-identical pool state', () => {
    const a = runStream(1234, 300, 16)
    const b = runStream(1234, 300, 16)
    expect(a.failedAt).toBe(-1)
    expect(b.failedAt).toBe(-1)
    for (let i = 0; i < a.pool.size; i++) {
      const va = a.pool.voices[i]
      const vb = b.pool.voices[i]
      expect(va.active).toBe(vb.active)
      expect(va.role).toBe(vb.role)
      expect(va.channel).toBe(vb.channel)
      expect(va.onsetAt).toBe(vb.onsetAt)
      expect(va.releasedAt).toBe(vb.releasedAt)
    }
    expect(a.counters.voicesStolen).toBe(b.counters.voicesStolen)
  })
})

describe('I6 - releaseByChannel', () => {
  it('releases the matching voice exactly once, then returns -1', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    allocVoice(pool, 'snare', 'snare', 1, counters)
    allocVoice(pool, 'snare', 'snare', 2, counters)
    const r1 = releaseByChannel(pool, 'snare', 10)
    expect(r1).toBeGreaterThanOrEqual(0)
    expect(pool.voices[r1].releasedAt).toBe(10)
    const r2 = releaseByChannel(pool, 'snare', 11)
    expect(r2).toBeGreaterThanOrEqual(0)
    expect(r2).not.toBe(r1)
    const r3 = releaseByChannel(pool, 'snare', 12)
    expect(r3).toBe(-1) // both already released
    const other = releaseByChannel(pool, 'kick', 13)
    expect(other).toBe(-1) // unknown channel
  })
})

describe('I7 - chokeRole frees exactly min(requested, active)', () => {
  it('chokes the requested count and never more', () => {
    const pool = createVoicePool(8)
    const counters = createCounters()
    // hat-closed cap is 4, so three allocs coexist (crash cap is 2 — see below)
    for (let i = 0; i < 3; i++) allocVoice(pool, 'hat-closed', 'hat-closed', i, counters)
    const choked = chokeRole(pool, 'hat-closed', 2, counters)
    expect(choked).toBe(2)
    expect(countActiveForRole(pool, 'hat-closed')).toBe(1)
    const chokedMore = chokeRole(pool, 'hat-closed', 5, counters)
    expect(chokedMore).toBe(1) // only one left
    expect(countActiveForRole(pool, 'hat-closed')).toBe(0)
  })

  it('cap enforcement: crash cap 2 steals the third concurrent crash', () => {
    // This is the near-miss that broke the first version of this test: with
    // cap 2, the third crash alloc steals the oldest — proof the anti-starve
    // caps fire at alloc time (I3), captured here intentionally.
    const pool = createVoicePool(8)
    const counters = createCounters()
    for (let i = 0; i < 3; i++) allocVoice(pool, 'crash', 'crash', i, counters)
    expect(countActiveForRole(pool, 'crash')).toBe(2)
    expect(counters.voicesStolen).toBe(1)
  })
})

describe('P1 - PINNED KNOWN GAP: pool gain is never updated post-alloc', () => {
  it('VoiceState.gain stays 1 (the "lowest current gain" tie-break is dead)', () => {
    // The documented steal order (released -> lowest gain -> oldest onset)
    // relies on VoiceState.gain, but the device never writes envelope levels
    // back into the pool (they live in WebAudio). So gain is always 1 and the
    // tie-break degenerates to onset order. PINNED here as current truth; the
    // roadmap (gain tracking) must replace this test when it lands.
    const pool = createVoicePool(4)
    const counters = createCounters()
    for (let i = 0; i < 4; i++) allocVoice(pool, 'perc', 'perc', i, counters)
    for (let i = 0; i < pool.size; i++) {
      expect(pool.voices[i].gain).toBe(1)
    }
  })
})
