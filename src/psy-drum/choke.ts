// PSYDRUM choke groups (phase 4, ARCHITECTURE.md section 3.4).
//
// Choke is drum-native HOW:
//   hat   -> EXCLUSIVE PAIR. An open-hat chokes every active closed-hat and
//            vice versa (config.hat === 'exclusive').
//   crash -> SELF-CHOKE. A new crash chokes the oldest crash once the group is
//            at crashMaxPoly (configurable).
//   ride  -> SELF-CHOKE. Same idea, capped at rideMaxPoly (configurable).
// kick/snare/clap/tom/perc never choke.
//
// The state machine is DETERMINISTIC and COUNTED: decideChoke returns how many
// voices of each role to choke, and the caller bumps chokeCounter by
// totalChokes(...). Zero heap allocations on the hot path: ChokeState and
// ChokeDecision are plain mutable objects reused in place by the device.
//
// Which SPECIFIC voice dies (oldest-released, per the steal order) is chosen by
// the voice pool (phase 6); this module decides HOW MANY of WHICH role.

import type { DrumRole, KitChokeConfig } from './types'

// ─── State ───────────────────────────────────────────────────────────────────

// Active-voice counts for the choke-relevant roles. Mutated in place.
export interface ChokeState {
  hatClosedOn: number
  hatOpenOn: number
  crashOn: number
  rideOn: number
}

export function createChokeState(): ChokeState {
  return { hatClosedOn: 0, hatOpenOn: 0, crashOn: 0, rideOn: 0 }
}

export function resetChokeState(state: ChokeState): void {
  state.hatClosedOn = 0
  state.hatOpenOn = 0
  state.crashOn = 0
  state.rideOn = 0
}

// ─── Decisions ───────────────────────────────────────────────────────────────

// How many voices of each role to choke (release to -60dB within budget) when a
// new voice of the triggering role lands.
export interface ChokeDecision {
  chokeHatClosed: number
  chokeHatOpen: number
  chokeCrash: number
  chokeRide: number
}

export function emptyChokeDecision(): ChokeDecision {
  return { chokeHatClosed: 0, chokeHatOpen: 0, chokeCrash: 0, chokeRide: 0 }
}

export function totalChokes(d: ChokeDecision): number {
  return d.chokeHatClosed + d.chokeHatOpen + d.chokeCrash + d.chokeRide
}

// Decide which active voices are choked when a new voice of `role` triggers.
// Pure and deterministic. The caller then: applyChokeDecision -> applyTrigger.
export function decideChoke(
  state: ChokeState,
  role: DrumRole,
  config: KitChokeConfig,
): ChokeDecision {
  const d = emptyChokeDecision()

  if (role === 'hat-closed' && config.hat === 'exclusive') {
    // Closed hat chokes every active open hat.
    d.chokeHatOpen = state.hatOpenOn
  } else if (role === 'hat-open' && config.hat === 'exclusive') {
    // Open hat chokes every active closed hat.
    d.chokeHatClosed = state.hatClosedOn
  } else if (role === 'crash') {
    // Self-choke: keep active crashes <= crashMaxPoly once this one lands.
    const over = state.crashOn + 1 - config.crashMaxPoly
    if (over > 0) d.chokeCrash = over
  } else if (role === 'ride') {
    // Self-choke: keep active rides <= rideMaxPoly once this one lands.
    const over = state.rideOn + 1 - config.rideMaxPoly
    if (over > 0) d.chokeRide = over
  }
  // kick/snare/clap/tom/perc: no choke.

  return d
}

// ─── State transitions (zero allocation) ─────────────────────────────────────

export function applyTrigger(state: ChokeState, role: DrumRole): void {
  if (role === 'hat-closed') state.hatClosedOn = state.hatClosedOn + 1
  else if (role === 'hat-open') state.hatOpenOn = state.hatOpenOn + 1
  else if (role === 'crash') state.crashOn = state.crashOn + 1
  else if (role === 'ride') state.rideOn = state.rideOn + 1
}

export function applyRelease(state: ChokeState, role: DrumRole): void {
  if (role === 'hat-closed') state.hatClosedOn = Math.max(0, state.hatClosedOn - 1)
  else if (role === 'hat-open') state.hatOpenOn = Math.max(0, state.hatOpenOn - 1)
  else if (role === 'crash') state.crashOn = Math.max(0, state.crashOn - 1)
  else if (role === 'ride') state.rideOn = Math.max(0, state.rideOn - 1)
}

export function applyChokeDecision(state: ChokeState, d: ChokeDecision): void {
  state.hatClosedOn = Math.max(0, state.hatClosedOn - d.chokeHatClosed)
  state.hatOpenOn = Math.max(0, state.hatOpenOn - d.chokeHatOpen)
  state.crashOn = Math.max(0, state.crashOn - d.chokeCrash)
  state.rideOn = Math.max(0, state.rideOn - d.chokeRide)
}

// ─── Choke latency budget ────────────────────────────────────────────────────

// A choked voice ramps to -60dB (gain 0.001). The ramp must complete inside the
// budget. Modeled as a linear gain ramp so the budget is unit-testable without
// an AudioContext; the voice DSP (phase 5) realizes it in audio.
export const CHOKE_TARGET_GAIN = 0.001 // -60 dB
export const CHOKE_LATENCY_BUDGET_MS = 3
export const CHOKE_DURATION_MS = 2.5 // must stay under the budget

export function chokeReleaseGain(elapsedMs: number, durationMs: number): number {
  if (elapsedMs <= 0) return 1
  if (elapsedMs >= durationMs) return CHOKE_TARGET_GAIN
  const t = elapsedMs / durationMs
  return 1 + (CHOKE_TARGET_GAIN - 1) * t
}
