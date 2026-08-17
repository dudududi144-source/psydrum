// PSYDRUM note router (phase 3, contract layer, ARCHITECTURE.md section 3.3).
//
// note-router turns canonical NoteEvents into voice on/off/drop decisions. It is
// the B1 enforcement point: UNPITCHED drums IGNORE NoteEvent.note for pitch — no
// nullish-coalescing pitch fallback, no coercion, no guessing. The audit-b1 test
// statically guarantees that anti-pattern never appears in src/.
//
// The routing table (channel -> role) is injected as data; the router only looks
// up, never invents (ground rule 1: the device is pure HOW, channel content is
// WHAT and arrives from the host).

import type { NoteEvent } from '../psy-foundation-shim/protocol'
import { DRUM_ROLES, isPitchedRole } from './types'
import type { DrumRole } from './types'
import type { DropReason } from './counters'

// channel -> drum role. Built from the kit manifest at load time (phase 6);
// the router only ever reads it.
export type RoutingTable = ReadonlyMap<string, DrumRole>

// Canonical table: every canonical role routes to itself. Used by tests and as
// the default before a kit manifest overrides it.
export function canonicalRoutingTable(): RoutingTable {
  var table = new Map<string, DrumRole>()
  for (const role of DRUM_ROLES) {
    table.set(role, role)
  }
  return table
}

// Events scheduled more than this far in the past (relative to ctx.currentTime)
// are stale-dropped (family stale-drop policy).
export var STALE_WINDOW_MS = 50

export type RouteDecision =
  | {
      type: 'on'
      role: DrumRole
      channel: string
      pitched: boolean
      pitch: number | null
      velocity: number
      at: number
    }
  | { type: 'off'; role: DrumRole; channel: string; at: number }
  | { type: 'drop'; reason: DropReason }

export function routeNote(event: NoteEvent, now: number, table: RoutingTable): RouteDecision {
  var role = table.get(event.channel)

  // Unknown channel: DROP. Never coerce, never guess (audit B2).
  if (role === undefined) {
    return { type: 'drop', reason: 'unknown-channel' }
  }

  // Stale event: scheduled more than STALE_WINDOW_MS in the past.
  var staleCutoff = now - STALE_WINDOW_MS / 1000
  if (event.at < staleCutoff) {
    return { type: 'drop', reason: 'stale' }
  }

  // velocity == 0: note-off. The matching voice is found later via the (channel)
  // LRU active-voice index (O(1)); that lookup lives in the voice pool.
  if (event.velocity <= 0) {
    return { type: 'off', role: role, channel: event.channel, at: event.at }
  }

  // velocity > 0, pitched drum (tom/ride): carry a validated pitch hint.
  if (isPitchedRole(role)) {
    var pitch = event.note
    if (!Number.isFinite(pitch) || pitch < 0 || pitch > 127) {
      return { type: 'drop', reason: 'invalid-event' }
    }
    return {
      type: 'on',
      role: role,
      channel: event.channel,
      pitched: true,
      pitch: pitch,
      velocity: event.velocity,
      at: event.at,
    }
  }

  // velocity > 0, unpitched drum: one-shot. note is IGNORED for pitch (the B1
  // fix) — pitch stays null; there is no fallback to a default pitch.
  return {
    type: 'on',
    role: role,
    channel: event.channel,
    pitched: false,
    pitch: null,
    velocity: event.velocity,
    at: event.at,
  }
}
