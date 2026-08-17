// PSYDRUM MIDI map + learn (phase 9).
//
// Two things live here, both pure DATA + device state (NO WebMIDI inside the
// device — the host/bridge owns the actual MIDI transport, ground rule 5):
//   1. The drum MIDI NOTE map (GM-style defaults, OVERRIDABLE DATA): which MIDI
//      note number triggers which drum role.
//   2. The CC <-> per-drum-parameter table + MIDI-learn flow: bind a CC number
//      to a specific drum's parameter. Learn state is device state only; there
//      is NO storage I/O here (the host decides persistence).

import type { DrumRole } from './types'
import { isDrumRole } from './types'

// ─── Drum MIDI note map (GM-style defaults, overridable DATA) ────────────────

// MIDI note number -> drum role. This is DATA: a host or kit manifest may pass
// its own map to re-map any note. Defaults follow the General-MIDI drum layout.
export const DEFAULT_DRUM_NOTE_MAP: Readonly<Record<number, DrumRole>> = {
  36: 'kick',
  38: 'snare',
  39: 'clap',
  42: 'hat-closed',
  46: 'hat-open',
  45: 'tom',
  48: 'tom',
  49: 'crash',
  57: 'crash',
  51: 'ride',
  33: 'perc',
  34: 'perc',
  56: 'perc',
}

// Resolve a MIDI note number to a drum role using the given (overridable) map.
// Returns null for unmapped notes.
export function noteToRole(noteMap: Readonly<Record<number, DrumRole>>, note: number): DrumRole | null {
  if (!Number.isFinite(note)) return null
  const role = noteMap[note]
  if (role === undefined) return null
  return isDrumRole(role) ? role : null
}

// ─── Per-drum parameters addressable by CC ───────────────────────────────────

// The drum parameters a CC may drive. These map onto DrumPatch fields.
export type DrumParam = 'tune' | 'decay' | 'tone' | 'noiseMix' | 'level'

export const DRUM_PARAMS: readonly DrumParam[] = ['tune', 'decay', 'tone', 'noiseMix', 'level']

export function isDrumParam(value: string): value is DrumParam {
  for (var i = 0; i < DRUM_PARAMS.length; i++) {
    if (DRUM_PARAMS[i] === value) return true
  }
  return false
}

// ─── CC binding table ────────────────────────────────────────────────────────

// A binding: CC number drives a specific drum's parameter.
export interface CcBinding {
  cc: number
  drum: DrumRole
  param: DrumParam
}

export type CcTable = CcBinding[]

export function createCcTable(): CcTable {
  return []
}

export function isValidCcNumber(cc: number): boolean {
  return Number.isFinite(cc) && cc >= 0 && cc <= 127
}

// Bind a CC to a drum+param. Replaces any existing binding for the SAME cc and
// any existing binding for the SAME (drum, param), so the table stays 1:1 in
// both directions. Returns a NEW table (no mutation).
export function bindCc(table: CcTable, binding: CcBinding): CcTable {
  const filtered = table.filter(function (b) {
    const sameCc = b.cc === binding.cc
    const sameTarget = b.drum === binding.drum && b.param === binding.param
    return !sameCc && !sameTarget
  })
  return filtered.concat([binding])
}

export function unbindCc(table: CcTable, cc: number): CcTable {
  return table.filter(function (b) {
    return b.cc !== cc
  })
}

export function findBindingByCc(table: CcTable, cc: number): CcBinding | null {
  for (var i = 0; i < table.length; i++) {
    if (table[i].cc === cc) return table[i]
  }
  return null
}

// ─── MIDI-learn flow (device state only, NO storage I/O) ─────────────────────

export interface LearnState {
  armed: boolean
  targetDrum: DrumRole | null
  targetParam: DrumParam | null
}

export function createLearnState(): LearnState {
  return { armed: false, targetDrum: null, targetParam: null }
}

// Arm learn: the next CC the user moves will bind to (drum, param).
export function armLearn(state: LearnState, drum: DrumRole, param: DrumParam): void {
  state.armed = true
  state.targetDrum = drum
  state.targetParam = param
}

export function disarmLearn(state: LearnState): void {
  state.armed = false
  state.targetDrum = null
  state.targetParam = null
}

export interface LearnResult {
  table: CcTable
  learned: boolean
}

// Feed an incoming CC while armed: bind it to the armed target and disarm. If
// not armed (or the CC is invalid), the table is returned unchanged.
export function learnCc(state: LearnState, table: CcTable, cc: number): LearnResult {
  if (!state.armed || state.targetDrum === null || state.targetParam === null) {
    return { table: table, learned: false }
  }
  if (!isValidCcNumber(cc)) {
    return { table: table, learned: false }
  }
  const binding: CcBinding = { cc: cc, drum: state.targetDrum, param: state.targetParam }
  const newTable = bindCc(table, binding)
  disarmLearn(state)
  return { table: newTable, learned: true }
}
