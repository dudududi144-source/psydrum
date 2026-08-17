// Shim barrel — re-exports all canonical contracts.
// Replace individual file imports with `@psy-foundation/*` package imports
// when integrated into the canonical workspace.
//
// NOTE: unlike psy-sampler, PSYDRUM does NOT re-export the shim voice-pool —
// the drum device builds its own drum-specific voice pool (phase 6,
// src/psy-drum/voice-pool.ts). The shim here stays limited to the canonical
// protocol/transport/device/host contracts.

export type {
  PsyDevice,
} from './device'

export {
  DeviceHost,
  type DeviceHostOptions,
} from './host'

export type {
  TransportState,
  MusicalContext,
  DeviceCapabilities,
  DeviceState,
  SessionState,
  MaterialType,
  Material,
  MusicalAction,
  MusicalOutcome,
  Experience,
  EventTime,
  BeatEvent,
  SectionEvent,
  EnergyEvent,
  DropEvent,
  NoteEvent,
  PatternEvent,
  MusicalEvent,
  EventOfType,
  ChannelListener,
  Unsubscribe,
  Channel,
} from './protocol'

export {
  InMemoryChannel,
} from './protocol'

export type {
  AudioTime,
  ObservedBeatTime,
  EstimatedBeatTime,
  PredictedBeatTime,
  BeatObservation,
  MusicalTransport,
  TransportClockOptions,
} from './transport'
