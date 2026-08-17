// PSYDRUM voice pool (phase 6, ARCHITECTURE.md section 4.4).
//
// Preallocated pool of VoiceState objects. The hot path (alloc / release /
// choke / steal) performs ZERO heap allocations: it only reads and mutates the
// pre-created VoiceState objects in place.
//
// Deterministic steal order when the pool is full:
//   1. a voice already in release (releasedAt > 0), oldest release first
//   2. otherwise the lowest current gain
//   3. then the oldest onset
//
// Per-drum budget caps (DEFAULT_ROLE_CAPS) keep one drum from starving the
// kit: if a role is already at its cap, the oldest active voice of THAT role
// is stolen before a global steal is considered.

import type { DrumRole, VoiceState } from './types'
import { createVoiceState, DEFAULT_ROLE_CAPS } from './types'
import type { DrumCounters } from './counters'

export interface VoicePool {
  voices: VoiceState[]
  size: number
}

// Allocated ONCE (at onStart); not part of the hot path.
export function createVoicePool(size: number): VoicePool {
  const n = Math.max(1, Math.floor(size))
  const voices: VoiceState[] = []
  for (var i = 0; i < n; i++) {
    voices.push(createVoiceState(i))
  }
  return { voices: voices, size: n }
}

export function resetPool(pool: VoicePool): void {
  for (var i = 0; i < pool.size; i++) {
    freeVoice(pool.voices[i])
  }
}

export function countActive(pool: VoicePool): number {
  var c = 0
  for (var i = 0; i < pool.size; i++) {
    if (pool.voices[i].active) c++
  }
  return c
}

export function countActiveForRole(pool: VoicePool, role: DrumRole): number {
  var c = 0
  for (var i = 0; i < pool.size; i++) {
    if (pool.voices[i].active && pool.voices[i].role === role) c++
  }
  return c
}

// ─── Hot-path helpers (zero allocation) ─────────────────────────────────────

function freeVoice(v: VoiceState): void {
  v.active = false
  v.role = null
  v.channel = ''
  v.onsetAt = 0
  v.releasedAt = 0
  v.gain = 0
}

function findFreeVoice(pool: VoicePool): number {
  for (var i = 0; i < pool.size; i++) {
    if (!pool.voices[i].active) return i
  }
  return -1
}

function findOldestActiveForRole(pool: VoicePool, role: DrumRole): number {
  var victim = -1
  var oldestOnset = Infinity
  for (var i = 0; i < pool.size; i++) {
    const v = pool.voices[i]
    if (v.active && v.role === role && v.onsetAt < oldestOnset) {
      oldestOnset = v.onsetAt
      victim = i
    }
  }
  return victim
}

// Deterministic steal victim among ACTIVE voices.
function pickStealVictim(pool: VoicePool): number {
  var victim = -1
  for (var i = 0; i < pool.size; i++) {
    const v = pool.voices[i]
    if (!v.active) continue
    if (victim === -1) {
      victim = i
      continue
    }
    const u = pool.voices[victim]
    const vReleased = v.releasedAt > 0
    const uReleased = u.releasedAt > 0
    if (vReleased !== uReleased) {
      if (vReleased) victim = i // a releasing voice is stolen first
      continue
    }
    if (vReleased && uReleased) {
      // both releasing: oldest release first, then gain, then onset
      if (v.releasedAt < u.releasedAt) victim = i
      else if (v.releasedAt === u.releasedAt) {
        if (v.gain < u.gain) victim = i
        else if (v.gain === u.gain && v.onsetAt < u.onsetAt) victim = i
      }
      continue
    }
    // neither releasing: lowest gain, then oldest onset
    if (v.gain < u.gain) victim = i
    else if (v.gain === u.gain && v.onsetAt < u.onsetAt) victim = i
  }
  return victim
}

// ─── Public hot-path operations ─────────────────────────────────────────────

// Allocate a voice for `role`. Returns the voice index, or -1 if impossible.
export function allocVoice(
  pool: VoicePool,
  role: DrumRole,
  channel: string,
  at: number,
  counters: DrumCounters,
): number {
  const cap = DEFAULT_ROLE_CAPS[role]

  // Budget cap: if this role is already at its cap, steal its oldest voice so
  // this drum does not exceed its budget.
  if (countActiveForRole(pool, role) >= cap) {
    const oldest = findOldestActiveForRole(pool, role)
    if (oldest >= 0) {
      freeVoice(pool.voices[oldest])
      counters.voicesStolen = counters.voicesStolen + 1
    }
  }

  var idx = findFreeVoice(pool)
  if (idx === -1) {
    idx = pickStealVictim(pool)
    if (idx >= 0) {
      freeVoice(pool.voices[idx])
      counters.voicesStolen = counters.voicesStolen + 1
    }
  }
  if (idx === -1) return -1

  const v = pool.voices[idx]
  v.active = true
  v.role = role
  v.channel = channel
  v.onsetAt = at
  v.releasedAt = 0
  v.gain = 1
  counters.voicesOn = counters.voicesOn + 1
  return idx
}

// Note-off: release the oldest active (not yet released) voice of `channel`.
// The voice stays active (decaying) until stolen. Returns the index or -1.
export function releaseByChannel(pool: VoicePool, channel: string, at: number): number {
  var victim = -1
  var oldestOnset = Infinity
  for (var i = 0; i < pool.size; i++) {
    const v = pool.voices[i]
    if (v.active && v.channel === channel && v.releasedAt === 0 && v.onsetAt < oldestOnset) {
      oldestOnset = v.onsetAt
      victim = i
    }
  }
  if (victim >= 0) {
    pool.voices[victim].releasedAt = at
  }
  return victim
}

// Choke: fully stop up to `count` active voices of `role` (oldest first).
// Returns how many were choked. Choked voices are freed immediately; the audio
// layer ramps them to -60dB inside the choke latency budget.
export function chokeRole(pool: VoicePool, role: DrumRole, count: number, counters: DrumCounters): number {
  var choked = 0
  var remaining = count
  while (remaining > 0) {
    const victim = findOldestActiveForRole(pool, role)
    if (victim === -1) break
    freeVoice(pool.voices[victim])
    counters.chokeCount = counters.chokeCount + 1
    choked++
    remaining--
  }
  return choked
}
