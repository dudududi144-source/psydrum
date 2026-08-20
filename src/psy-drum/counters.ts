// PSYDRUM observability counters (phase 2, ARCHITECTURE.md section 11).
//
// Counters are plain mutable numbers on a single object so the audio hot path
// (onEvent / on / off / choke / steal) can increment them with ZERO heap
// allocation. snapshotCounters() copies — it is only called from
// getDiagnostics() on the main thread, never in the audio path.
//
// No logging in the audio path: counters are the only observability channel.

export interface DrumCounters {
  eventsReceived: number
  eventsDropped: number
  voicesOn: number
  voicesStolen: number
  unknownChannel: number
  staleDrop: number
  invalidEvent: number
  chokeCount: number
  kitLoadErrors: number
  sampleFallbacks: number
  // Audit V3: note events received on the canonical 0..1 velocity scale and
  // normalized to the 0..127 DSP scale at the device boundary.
  velocityNormalized: number
}

// The three drop reasons surfaced by the note-router (ARCHITECTURE.md 3.3).
// Each also bumps eventsDropped so the total stays consistent.
export type DropReason = 'unknown-channel' | 'stale' | 'invalid-event'

export function createCounters(): DrumCounters {
  return {
    eventsReceived: 0,
    eventsDropped: 0,
    voicesOn: 0,
    voicesStolen: 0,
    unknownChannel: 0,
    staleDrop: 0,
    invalidEvent: 0,
    chokeCount: 0,
    kitLoadErrors: 0,
    sampleFallbacks: 0,
    velocityNormalized: 0,
  }
}

export function resetCounters(counters: DrumCounters): void {
  counters.eventsReceived = 0
  counters.eventsDropped = 0
  counters.voicesOn = 0
  counters.voicesStolen = 0
  counters.unknownChannel = 0
  counters.staleDrop = 0
  counters.invalidEvent = 0
  counters.chokeCount = 0
  counters.kitLoadErrors = 0
  counters.sampleFallbacks = 0
  counters.velocityNormalized = 0
}

// In-place increment — zero allocation. Called from the audio hot path.
export function incrementDrop(counters: DrumCounters, reason: DropReason): void {
  counters.eventsDropped = counters.eventsDropped + 1
  if (reason === 'unknown-channel') {
    counters.unknownChannel = counters.unknownChannel + 1
  } else if (reason === 'stale') {
    counters.staleDrop = counters.staleDrop + 1
  } else {
    counters.invalidEvent = counters.invalidEvent + 1
  }
}

// Main-thread-only copy for getDiagnostics(). Allocates by design; never
// called in the audio path.
export function snapshotCounters(counters: DrumCounters): DrumCounters {
  return {
    eventsReceived: counters.eventsReceived,
    eventsDropped: counters.eventsDropped,
    voicesOn: counters.voicesOn,
    voicesStolen: counters.voicesStolen,
    unknownChannel: counters.unknownChannel,
    staleDrop: counters.staleDrop,
    invalidEvent: counters.invalidEvent,
    chokeCount: counters.chokeCount,
    kitLoadErrors: counters.kitLoadErrors,
    sampleFallbacks: counters.sampleFallbacks,
    velocityNormalized: counters.velocityNormalized,
  }
}
