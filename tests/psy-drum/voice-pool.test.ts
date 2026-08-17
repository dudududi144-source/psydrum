// Phase 6 tests — voice pool: preallocation, free-first allocation,
// deterministic steal order, per-drum budget caps, choke, zero-allocation.

import { describe, it, expect } from 'bun:test'
import {
  createVoicePool,
  resetPool,
  countActive,
  countActiveForRole,
  allocVoice,
  releaseByChannel,
  chokeRole,
} from '../../src/psy-drum/voice-pool'
import { createCounters } from '../../src/psy-drum/counters'

describe('voice pool basics', () => {
  it('createVoicePool preallocates the requested size', () => {
    const pool = createVoicePool(16)
    expect(pool.size).toBe(16)
    expect(pool.voices.length).toBe(16)
    for (const v of pool.voices) {
      expect(v.active).toBe(false)
    }
  })

  it('allocVoice uses free voices first (no steal)', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    const i0 = allocVoice(pool, 'kick', 'a', 1, counters)
    const i1 = allocVoice(pool, 'snare', 'b', 2, counters)
    expect(i0).toBe(0)
    expect(i1).toBe(1)
    expect(counters.voicesStolen).toBe(0)
    expect(counters.voicesOn).toBe(2)
    expect(countActive(pool)).toBe(2)
  })

  it('allocVoice records role, channel and onset', () => {
    const pool = createVoicePool(2)
    const counters = createCounters()
    const i = allocVoice(pool, 'tom', 'ch', 3.5, counters)
    const v = pool.voices[i]
    expect(v.active).toBe(true)
    expect(v.role).toBe('tom')
    expect(v.channel).toBe('ch')
    expect(v.onsetAt).toBe(3.5)
    expect(v.releasedAt).toBe(0)
  })
})

describe('deterministic steal order', () => {
  it('steals the lowest-gain voice when none are released', () => {
    const pool = createVoicePool(2)
    const counters = createCounters()
    pool.voices[0].active = true
    pool.voices[0].role = 'snare'
    pool.voices[0].channel = 'a'
    pool.voices[0].onsetAt = 1
    pool.voices[0].gain = 0.5
    pool.voices[1].active = true
    pool.voices[1].role = 'snare'
    pool.voices[1].channel = 'b'
    pool.voices[1].onsetAt = 2
    pool.voices[1].gain = 0.9

    const idx = allocVoice(pool, 'kick', 'c', 3, counters)
    expect(idx).toBe(0) // lowest gain stolen
    expect(counters.voicesStolen).toBe(1)
  })

  it('prefers a releasing voice over a louder sustained one', () => {
    const pool = createVoicePool(2)
    const counters = createCounters()
    pool.voices[0].active = true
    pool.voices[0].role = 'snare'
    pool.voices[0].channel = 'a'
    pool.voices[0].onsetAt = 1
    pool.voices[0].gain = 0.9
    pool.voices[0].releasedAt = 5 // releasing
    pool.voices[1].active = true
    pool.voices[1].role = 'snare'
    pool.voices[1].channel = 'b'
    pool.voices[1].onsetAt = 2
    pool.voices[1].gain = 0.1
    pool.voices[1].releasedAt = 0 // sustaining

    const idx = allocVoice(pool, 'kick', 'c', 3, counters)
    expect(idx).toBe(0) // releasing voice stolen first despite higher gain
  })

  it('among two releasing voices steals the oldest release', () => {
    const pool = createVoicePool(2)
    const counters = createCounters()
    pool.voices[0].active = true
    pool.voices[0].role = 'crash'
    pool.voices[0].channel = 'a'
    pool.voices[0].onsetAt = 1
    pool.voices[0].gain = 0.5
    pool.voices[0].releasedAt = 2
    pool.voices[1].active = true
    pool.voices[1].role = 'crash'
    pool.voices[1].channel = 'b'
    pool.voices[1].onsetAt = 1.5
    pool.voices[1].gain = 0.5
    pool.voices[1].releasedAt = 4

    const idx = allocVoice(pool, 'kick', 'c', 5, counters)
    expect(idx).toBe(0) // releasedAt 2 < 4
  })
})

describe('per-drum budget caps', () => {
  it('kick stays within its cap of 2', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    allocVoice(pool, 'kick', 'k1', 1, counters)
    allocVoice(pool, 'kick', 'k2', 2, counters)
    expect(countActiveForRole(pool, 'kick')).toBe(2)

    allocVoice(pool, 'kick', 'k3', 3, counters)
    expect(countActiveForRole(pool, 'kick')).toBe(2) // cap enforced
    expect(counters.voicesStolen).toBe(1)
  })

  it('different roles do not consume each other budget', () => {
    const pool = createVoicePool(8)
    const counters = createCounters()
    allocVoice(pool, 'kick', 'k', 1, counters)
    allocVoice(pool, 'snare', 's', 2, counters)
    allocVoice(pool, 'hat-closed', 'h', 3, counters)
    expect(countActiveForRole(pool, 'kick')).toBe(1)
    expect(countActiveForRole(pool, 'snare')).toBe(1)
    expect(countActiveForRole(pool, 'hat-closed')).toBe(1)
    expect(counters.voicesStolen).toBe(0)
  })
})

describe('note-off and choke', () => {
  it('releaseByChannel releases the oldest active voice of the channel', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    const i1 = allocVoice(pool, 'tom', 'ch', 1, counters)
    const i2 = allocVoice(pool, 'tom', 'ch', 2, counters)

    const rel = releaseByChannel(pool, 'ch', 5)
    expect(rel).toBe(i1) // oldest onset released
    expect(pool.voices[i1].releasedAt).toBe(5)
    expect(pool.voices[i2].releasedAt).toBe(0)
  })

  it('releaseByChannel returns -1 when nothing matches', () => {
    const pool = createVoicePool(2)
    const counters = createCounters()
    expect(releaseByChannel(pool, 'nope', 1)).toBe(-1)
  })

  it('chokeRole frees up to count voices of the role', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    allocVoice(pool, 'crash', 'c1', 1, counters)
    allocVoice(pool, 'crash', 'c2', 2, counters)
    expect(countActiveForRole(pool, 'crash')).toBe(2)

    const choked = chokeRole(pool, 'crash', 1, counters)
    expect(choked).toBe(1)
    expect(countActiveForRole(pool, 'crash')).toBe(1)
    expect(counters.chokeCount).toBe(1)
  })

  it('chokeRole stops early when the role runs out', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    allocVoice(pool, 'crash', 'c1', 1, counters)
    const choked = chokeRole(pool, 'crash', 5, counters)
    expect(choked).toBe(1) // only one crash to choke
    expect(countActiveForRole(pool, 'crash')).toBe(0)
  })
})

describe('zero-allocation hot path', () => {
  it('hot-path ops reuse the same VoiceState objects (no new allocations)', () => {
    const pool = createVoicePool(4)
    const counters = createCounters()
    const refs = pool.voices.slice() // snapshot of object references

    allocVoice(pool, 'kick', 'a', 1, counters)
    allocVoice(pool, 'snare', 'b', 2, counters)
    releaseByChannel(pool, 'a', 3)
    chokeRole(pool, 'snare', 1, counters)
    allocVoice(pool, 'tom', 'c', 4, counters)
    resetPool(pool)

    for (let i = 0; i < pool.voices.length; i++) {
      expect(pool.voices[i]).toBe(refs[i]) // same objects, mutated in place
    }
  })
})
