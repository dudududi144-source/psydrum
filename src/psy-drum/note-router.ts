// PSYDRUM note router (phase 3, ARCHITECTURE.md section 3.3).
//
// Turns a canonical NoteEvent into a voice on/off/choke DECISION. This is the
// contract layer: pure routing, no audio, no allocation-heavy work. The voice
// pool (phase 6) executes the decision.
//
// THE B1 FIX (non-negotiable): unpitched drums IGNORE NoteEvent.note for pitch.
// There is NO default-pitch fallback here or anywhere in the device. The
// anti-B1 static test (tests/psy-drum/no-pitch-fallback.test.ts) greps the
// sources and fails the build if a null-coalesce pitch fallback ever appears.

import type { NoteEvent } from '../psy-foundation-shim/protocol'
import type { DrumRole } from './types'
import { isDrumRole, isPitchedRole } from './types'
import type { DropReason } from './counters'

// ─── Decisions ───────────────────────────────────────────────────────────────

export type RouteDecision =
  | { kind: 'trigger'; role: DrumRole; velocity: number; pitch: number | null }
  | { kind: 'note-off'; role: DrumRole; channel: string }
  | { kind: 'drop'; reason: DropReason }

export interface RouteContext {
  // Current AudioContext time (seconds), for the stale check.
  nowSec: number
  // Events older than this window are dropped as stale (ARCHITECTURE.md 3.3).
  staleWindowSec: number
  // Maps a NoteEvent.channel to a drum role, or null if unroutable.
  resolveChannel: (channel: string) => DrumRole | null
}

// ─── Constants (architecture-mandated) ───────────────────────────────────────

export const STALE_WINDOW_SEC = 0.05 // 50 ms
export const MIN_NOTE = 0
export const MAX_NOTE = 127
export const MIN_VELOCITY = 0
export const MAX_VELOCITY = 127

// ─── Routing table ───────────────────────────────────────────────────────────

// Default channel->role map: each canonical role is reachable under its own
// name. A host (DrumBridge) may supply its own table to rename channels.
export const DEFAULT_ROUTING_TABLE: Readonly<Record<DrumRole, DrumRole>> = {
  kick: 'kick',
  snare: 'snare',
  clap: 'clap',
  'hat-closed': 'hat-closed',
  'hat-open': 'hat-open',
  tom: 'tom',
  perc: 'perc',
  ride: 'ride',
  crash: 'crash',
}

export function resolveRole(
  table: Readonly<Record<string, DrumRole>>,
  channel: string,
): DrumRole | null {
  const role = table[channel]
  if (role === undefined) return null
  return isDrumRole(role) ? role : null
}

export function makeChannelResolver(
  table: Readonly<Record<string, DrumRole>>,
): (channel: string) => DrumRole | null {
  return function (channel: string): DrumRole | null {
    return resolveRole(table, channel)
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

// Validation order is deliberate and documented:
//   1. channel -> role          (unknown-channel drop)
//   2. note within 0..127       (invalid-event drop)
//   3. velocity within 0..127   (invalid-event drop)
//   4. staleness                (stale drop)
//   5. velocity === 0           -> note-off
//   6. velocity  > 0            -> trigger
export function routeNoteEvent(event: NoteEvent, ctx: RouteContext): RouteDecision {
  const role = ctx.resolveChannel(event.channel)
  if (role === null) {
    return { kind: 'drop', reason: 'unknown-channel' }
  }

  if (!Number.isFinite(event.note) || event.note < MIN_NOTE || event.note > MAX_NOTE) {
    return { kind: 'drop', reason: 'invalid-event' }
  }

  if (
    !Number.isFinite(event.velocity) ||
    event.velocity < MIN_VELOCITY ||
    event.velocity > MAX_VELOCITY
  ) {
    return { kind: 'drop', reason: 'invalid-event' }
  }

  const window = ctx.staleWindowSec >= 0 ? ctx.staleWindowSec : STALE_WINDOW_SEC
  if (Number.isFinite(event.at) && event.at < ctx.nowSec - window) {
    return { kind: 'drop', reason: 'stale' }
  }

  if (event.velocity === 0) {
    return { kind: 'note-off', role: role, channel: event.channel }
  }

  // Pitch semantics (the B1 fix): pitched drums (tom/ride) carry an OPTIONAL
  // pitch hint taken from the note; every unpitched drum reports pitch=null and
  // the note is NOT used for pitch — no fallback to a default pitch.
  const pitch = isPitchedRole(role) ? Math.round(event.note) : null

  return { kind: 'trigger', role: role, velocity: event.velocity, pitch: pitch }
}
