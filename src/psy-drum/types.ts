// PSYDRUM canonical drum types (phase 2).
//
// DrumRole is the CANONICAL role enum (audit B10): capabilities() must
// advertise EXACTLY this set (hat-closed / hat-open, NOT a single "hat").
// DrumPatch / DrumConfig / VoiceState / ChokeGroup carry drum-native HOW data.
// Style CONTENT (patterns, grooves, kit defaults) lives in kit DATA, never here
// (ground rule 1: device is pure HOW, no WHAT).

// ─── Canonical roles ─────────────────────────────────────────────────────────

export const DRUM_ROLES = [
  'kick',
  'snare',
  'clap',
  'hat-closed',
  'hat-open',
  'tom',
  'perc',
  'ride',
  'crash',
] as const

export type DrumRole = (typeof DRUM_ROLES)[number]

export function isDrumRole(value: string): value is DrumRole {
  for (var i = 0; i < DRUM_ROLES.length; i++) {
    if (DRUM_ROLES[i] === value) return true
  }
  return false
}

// Pitched drums accept an OPTIONAL NoteEvent.note pitch hint (tuned within a
// safe range). Every other role is UNPITCHED and IGNORES note for pitch — the
// B1 fix made explicit: there is no `note ?? 60` anywhere in the device.
export const PITCHED_ROLES: readonly DrumRole[] = ['tom', 'ride']

export function isPitchedRole(role: DrumRole): boolean {
  for (var i = 0; i < PITCHED_ROLES.length; i++) {
    if (PITCHED_ROLES[i] === role) return true
  }
  return false
}

// ─── Choke ───────────────────────────────────────────────────────────────────

// Choke is drum-native HOW (ARCHITECTURE.md section 3.4):
//   hat   -> open-hat chokes active closed-hat and vice versa (exclusive pair)
//   crash -> a new crash chokes the previous crash (configurable max-poly)
// kick/snare/tom/perc do not choke each other.
export type ChokeGroupId = 'hat' | 'crash'

export interface ChokeGroup {
  id: ChokeGroupId
  maxPoly: number
}

export interface KitChokeConfig {
  hat: 'exclusive' | 'none'
  crashMaxPoly: number
}

// ─── Patches (analog-modeled synthesis parameters, ARCHITECTURE-STYLE.md) ───

export interface DrumBodyPatch {
  wave: 'sine' | 'triangle'
  startHz: number
  endHz: number
  pitchDecayMs: number
}

export interface DrumClickPatch {
  amount: number // 0..1 transient click level
  hpHz: number // click high-pass corner
}

export interface DrumNoisePatch {
  mix: number // 0..1 noise-vs-tone balance
  bpHz: number // noise band-pass centre
}

export interface DrumFilterPatch {
  cutoff: number
  res: number
}

export interface DrumAmpPatch {
  attackMs: number
  decayMs: number
  releaseMs: number
}

export interface DrumSendsPatch {
  delay: number // 0..1
  reverb: number // 0..1
}

export interface DrumSampleRef {
  assetId: string | null
  gain: number // 0..1 sample-vs-synthesis crossfade
}

// A per-drum patch. Every field is optional: a minimal patch declares only the
// blocks its synthesis chain needs (a hat has no body pitch envelope, etc.).
// With exactOptionalPropertyTypes, omit a field rather than setting undefined.
export interface DrumPatch {
  body?: DrumBodyPatch
  click?: DrumClickPatch
  noise?: DrumNoisePatch
  filter?: DrumFilterPatch
  amp?: DrumAmpPatch
  driveDb?: number // 0..6 pre-saturation
  velTrack?: number // 0..1 velocity-to-timbre depth
  sends?: DrumSendsPatch
  sample?: DrumSampleRef
}

// ─── Device config ───────────────────────────────────────────────────────────

export interface DrumConfig {
  voices: number // voice-pool size (default 16, host-overridable)
  seed: number // RNG seed (combined with kit manifest seed)
  humanize: boolean // enable seeded velocity micro-humanize
  choke: KitChokeConfig
}

export function defaultDrumConfig(): DrumConfig {
  return {
    voices: 16,
    seed: 1,
    humanize: true,
    choke: { hat: 'exclusive', crashMaxPoly: 2 },
  }
}

// Per-role voice budget caps (ARCHITECTURE.md section 4.4). The global pool is
// shared; caps prevent one drum from starving the kit.
export const DEFAULT_ROLE_CAPS: Readonly<Record<DrumRole, number>> = {
  kick: 2,
  snare: 2,
  clap: 2,
  'hat-closed': 4,
  'hat-open': 4,
  tom: 3,
  perc: 4,
  ride: 2,
  crash: 2,
}

// ─── Voice state (consumed by the voice pool, phase 6) ───────────────────────

export interface VoiceState {
  index: number
  active: boolean
  role: DrumRole | null
  channel: string // NoteEvent.channel, keyed for note-off matching (LRU)
  onsetAt: number // AudioContext time of trigger (oldest-on steal ordering)
  releasedAt: number // AudioContext time of release (oldest-released steal)
  gain: number // current gain (lowest-current-gain steal ordering)
}

export function createVoiceState(index: number): VoiceState {
  return {
    index: index,
    active: false,
    role: null,
    channel: '',
    onsetAt: 0,
    releasedAt: 0,
    gain: 0,
  }
}
