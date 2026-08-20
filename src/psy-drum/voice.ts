// PSYDRUM voice DSP — deterministic, zero-allocation core (phase 5).
//
// This module is the TESTABLE FOUNDATION of the analog-modeled drum chains
// (ARCHITECTURE.md section 4.1 / 4.3). It contains the pure DSP math that the
// per-drum chains consume:
//   - precomputed envelope tables + per-sample interpolation (zero alloc reads)
//   - velocity-to-gain curves (linear / power)
//   - velocity-to-timbre (louder = brighter: cutoff / noise brightness / pitch
//     depth scaled by velTrack)
//   - per-drum chain parameter resolution (DrumPatch + velocity -> params)
//
// The node-graph realization (oscillators / filters / VCA on a BaseAudioContext)
// is a thin browser layer that consumes these resolved params; it is exercised
// by the OfflineAudioContext render proof in the host, not here. Everything in
// THIS file is pure and unit-tested so the foundation stays rock solid.

import type { DrumPatch } from './types'

// ─── Envelope tables (precomputed; per-sample reads never allocate) ──────────

export interface EnvelopeSpec {
  attackMs: number
  decayMs: number
  releaseMs: number
  sustainLevel: number // 0..1
}

export interface EnvelopeTable {
  samples: Float32Array
  sampleRate: number
  totalMs: number
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// Build a piecewise-linear ADSR table over attack+decay+release milliseconds.
// Drums use a fast attack and a decay toward (usually low) sustain; release
// tails the end. Deterministic for a given spec + sampleRate.
export function buildEnvelopeTable(spec: EnvelopeSpec, sampleRate: number): EnvelopeTable {
  const attackMs = Math.max(0, spec.attackMs)
  const decayMs = Math.max(0, spec.decayMs)
  const releaseMs = Math.max(0, spec.releaseMs)
  const sustain = clamp01(spec.sustainLevel)
  const totalMs = attackMs + decayMs + releaseMs

  const numSamples = Math.max(1, Math.ceil((totalMs / 1000) * sampleRate))
  const samples = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    const tMs = numSamples === 1 ? 0 : (i / (numSamples - 1)) * totalMs
    samples[i] = envelopeValueAt(spec, tMs)
  }

  return { samples: samples, sampleRate: sampleRate, totalMs: totalMs }
}

// Piecewise-linear ADSR value at time tMs (pure; used by buildEnvelopeTable and
// directly testable).
export function envelopeValueAt(spec: EnvelopeSpec, tMs: number): number {
  const attackMs = Math.max(0, spec.attackMs)
  const decayMs = Math.max(0, spec.decayMs)
  const releaseMs = Math.max(0, spec.releaseMs)
  const sustain = clamp01(spec.sustainLevel)
  const t = Math.max(0, tMs)

  if (t < attackMs) {
    // Attack: 0 -> 1
    return attackMs === 0 ? 1 : t / attackMs
  }

  const decayEnd = attackMs + decayMs
  if (t < decayEnd) {
    // Decay: 1 -> sustain
    const p = decayMs === 0 ? 1 : (t - attackMs) / decayMs
    return 1 - (1 - sustain) * p
  }

  // Release: sustain -> 0
  const p = releaseMs === 0 ? 1 : (t - decayEnd) / releaseMs
  return sustain * (1 - Math.min(1, p))
}

// Per-sample LINEAR interpolation into a precomputed table. Zero allocation:
// reads only. Returns 0 outside the table.
export function sampleEnvelope(table: EnvelopeTable, tMs: number): number {
  const n = table.samples.length
  if (n === 0 || table.totalMs <= 0) return 0
  if (tMs <= 0) return table.samples[0]
  if (tMs >= table.totalMs) return table.samples[n - 1]

  const pos = (tMs / table.totalMs) * (n - 1)
  const i0 = Math.floor(pos)
  const i1 = Math.min(n - 1, i0 + 1)
  const frac = pos - i0
  const a = table.samples[i0]
  const b = table.samples[i1]
  return a + (b - a) * frac
}

// ─── Velocity-to-gain (section 4.3) ─────────────────────────────────────────

export type VelCurveKind = 'linear' | 'power'

export const MIN_VELOCITY = 0
export const MAX_VELOCITY = 127

// Map MIDI velocity (0..127) to a gain 0..1. 'power' applies an exponent >1 so
// soft hits are softer and loud hits punch harder (more dynamic feel).
export function velCurveGain(velocity: number, curve: VelCurveKind, powerExponent: number): number {
  const v = clamp01(velocity / MAX_VELOCITY)
  if (curve === 'power') {
    const exp = powerExponent > 0 ? powerExponent : 1
    return Math.pow(v, exp)
  }
  return v
}

// ─── Velocity-to-timbre (section 4.3: louder = brighter) ─────────────────────

// Higher velocity raises a parameter toward its ceiling by velTrack amount.
// velTrack 0 => no timbre shift (pure gain change); velTrack 1 => full shift.
export function velocityTimbreShift(velocity: number, velTrack: number): number {
  const v = clamp01(velocity / MAX_VELOCITY)
  const track = clamp01(velTrack)
  return v * track
}

// Filter cutoff rises with velocity: base * (1 + shift). Capped at nyquistGuard.
export function velocityToCutoff(velocity: number, baseCutoff: number, velTrack: number, nyquistGuard: number): number {
  const shift = velocityTimbreShift(velocity, velTrack)
  const cutoff = baseCutoff * (1 + shift)
  return Math.min(cutoff, nyquistGuard)
}

// Noise brightness (band-pass centre) rises with velocity.
export function velocityToNoiseBrightness(velocity: number, baseBpHz: number, velTrack: number, nyquistGuard: number): number {
  return velocityToCutoff(velocity, baseBpHz, velTrack, nyquistGuard)
}

// Pitch-envelope depth deepens with velocity (punchier kick/tom on loud hits).
export function velocityToPitchDepth(velocity: number, baseDepthSemitones: number, velTrack: number): number {
  const shift = velocityTimbreShift(velocity, velTrack)
  return baseDepthSemitones * (1 + shift)
}

// ─── Per-drum chain parameter resolution (deterministic) ─────────────────────

export interface ResolvedDrumParams {
  gain: number
  cutoff: number
  pitchDepth: number
  noiseBrightness: number
}

// Resolve a DrumPatch + velocity into concrete synthesis params. This is the
// single deterministic entry point a voice chain consumes on trigger.
export function resolveDrumParams(
  patch: DrumPatch,
  velocity: number,
  curve: VelCurveKind,
  powerExponent: number,
  nyquistGuard: number,
): ResolvedDrumParams {
  const velTrack = patch.velTrack === undefined ? 0 : clamp01(patch.velTrack)
  const gain = velCurveGain(velocity, curve, powerExponent)

  const baseCutoff = patch.filter === undefined ? nyquistGuard : patch.filter.cutoff
  const cutoff = velocityToCutoff(velocity, baseCutoff, velTrack, nyquistGuard)

  const baseNoise = patch.noise === undefined ? 0 : patch.noise.bpHz
  const noiseBrightness = baseNoise === 0 ? 0 : velocityToNoiseBrightness(velocity, baseNoise, velTrack, nyquistGuard)

  // Pitch depth derives from the body pitch span (startHz -> endHz) when present.
  const baseDepth = patch.body === undefined ? 0 : Math.max(0, patch.body.startHz - patch.body.endHz)
  const pitchDepth = velocityToPitchDepth(velocity, baseDepth, velTrack)

  return { gain: gain, cutoff: cutoff, pitchDepth: pitchDepth, noiseBrightness: noiseBrightness }
}

// --- Noise filter centre resolution (audit V1) ---------------------------------

// Resolve the noise-filter centre frequency in Hz for a triggered voice.
// `noiseBrightness` is the velocity-tracked centre (see velocityToNoiseBrightness),
// expressed in Hz — NOT a 0..1 factor. Treating it as a factor pinned every
// noise filter to the Nyquist guard and muted the entire noise family
// (hats / cymbals / snare wires). When the patch has no noise block
// (noiseBrightness === 0) fall back to a darker fraction of the base colour.
// Clamped into [40, nyquistGuard] so the biquad stays well-conditioned.
export function resolveNoiseFilterHz(
  noiseBrightness: number,
  baseHz: number,
  nyquistGuard: number,
): number {
  const target = noiseBrightness > 0 ? noiseBrightness : baseHz * 0.6
  return Math.max(40, Math.min(target, nyquistGuard))
}
