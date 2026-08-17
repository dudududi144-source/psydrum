// PSYDRUM voice DSP (phase 5, ARCHITECTURE.md sections 4.1 + 4.3).
//
// Pure, DETERMINISTIC analog-modeled drum synthesis that renders into
// caller-provided Float32Array buffers. There is NO Web Audio dependency in
// this core, so it is fully testable headless (bun). The device (phase 10)
// realizes these same chains as Web Audio nodes for real-time playback.
//
// Zero-allocation-on-trigger principle (4.1): the render loops use only
// arithmetic plus a fast inline PRNG; envelope tables are precomputed by
// makeDecayTable and reused. No arrays or closures are created per trigger.
//
// Velocity-to-timbre (4.3): velocity drives BOTH gain (velocityToGain) and
// brightness (velocityToBrightness) — louder hits are brighter, not just
// louder. The brightness factor scales the high-frequency transient/click and
// the noise-band level, which is what the style-9 spectral-centroid test
// asserts.

import type { DrumRole } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2
// exp(-DECAY_TO_60DB) === 0.001, i.e. -60 dB at normalized progress 1.
export const DECAY_TO_60DB = 6.907755278982137

// ─── Velocity curves (4.3) ───────────────────────────────────────────────────

export type VelCurveKind = 'linear' | 'power'

export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0
  return Math.max(0, Math.min(127, velocity))
}

// MIDI velocity (0..127) -> gain (0..1). 'power' gives a more expressive curve.
export function velocityToGain(velocity: number, curve: VelCurveKind): number {
  const v = clampVelocity(velocity) / 127
  return curve === 'power' ? v * v : v
}

// Brightness multiplier (>= 1) applied to high-frequency content. Higher
// velocity and higher velTrack depth => brighter hit (the "louder = brighter"
// drum behavior). At velocity 0 or velTrack 0 this is 1 (neutral).
export function velocityToBrightness(velocity: number, velTrack: number): number {
  const v = clampVelocity(velocity) / 127
  const depth = Math.max(0, Math.min(1, velTrack))
  return 1 + depth * v
}

// ─── Envelopes ───────────────────────────────────────────────────────────────

// Exponential decay: 1 at t=0, ~0.001 (-60 dB) at t=1, keeps decaying for t>1.
export function expDecay(t: number): number {
  if (t <= 0) return 1
  return Math.exp(-DECAY_TO_60DB * t)
}

// Precomputed decay table (allocated ONCE at patch load, reused on trigger).
// table[0] === 1, table[length-1] ~ 0.001.
export function makeDecayTable(length: number): Float32Array {
  const n = Math.max(2, Math.floor(length))
  const table = new Float32Array(n)
  for (var i = 0; i < n; i++) {
    table[i] = expDecay(i / (n - 1))
  }
  return table
}

// Pitch envelope (kick/tom body): exponential glide startHz -> endHz as
// progress goes 0 -> 1. Returns the instantaneous frequency in Hz.
export function pitchEnvelopeHz(progress: number, startHz: number, endHz: number): number {
  const p = Math.max(0, Math.min(1, progress))
  // Exponential interpolation keeps the musical (log) pitch drop linear.
  const s = Math.max(1, startHz)
  const e = Math.max(1, endHz)
  return s * Math.pow(e / s, p)
}

// ─── Deterministic PRNG (fast inline LCG, zero allocation) ──────────────────

// One LCG step. Pass the returned state into the next call.
export function lcgStep(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0
}

// Map an LCG state to a noise sample in [-1, 1].
export function lcgToNoise(state: number): number {
  return (state >>> 0) / 0x100000000 * 2 - 1
}

// ─── Render options ─────────────────────────────────────────────────────────

export interface VoiceRenderOpts {
  sampleRate: number
  velocity: number // 0..127
  velTrack: number // 0..1 velocity-to-timbre depth
  velCurve: VelCurveKind
  seed: number
}

// ─── Per-drum render functions (fill `out` in place) ────────────────────────

// KICK: sine body with pitch envelope + click transient, brightness-scaled.
export function renderKick(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const startHz = 150
  const endHz = 50
  const pitchDecaySec = 0.045
  const bodyDecaySec = 0.28
  const clickSec = 0.004

  let phase = 0
  let noiseState = (opts.seed >>> 0) || 1
  let clickLP = 0

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    const prog = Math.min(1, t / pitchDecaySec)
    const freq = pitchEnvelopeHz(prog, startHz, endHz)
    phase += (TWO_PI * freq) / sr

    const body = Math.sin(phase) * expDecay(t / bodyDecaySec)

    noiseState = lcgStep(noiseState)
    const noise = lcgToNoise(noiseState)
    // One-pole high-pass: the click is clearly high-frequency, so velocity-to-
    // timbre (bright) measurably raises the spectral centroid (style 9).
    clickLP = clickLP + 0.3 * (noise - clickLP)
    const clickHP = noise - clickLP
    const clickEnv = t < clickSec ? 1 - t / clickSec : 0
    const click = clickHP * clickEnv * bright

    out[n] = body * gain * 0.9 + click * gain * 0.5
  }
}

// SNARE: tone osc + bright noise band, noise level scaled by brightness.
export function renderSnare(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const toneHz = 190
  const toneDecaySec = 0.11
  const noiseDecaySec = 0.16

  let phase = 0
  let noiseState = (opts.seed >>> 0) || 7

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    phase += (TWO_PI * toneHz) / sr

    const tone = Math.sin(phase) * expDecay(t / toneDecaySec) * 0.5

    noiseState = lcgStep(noiseState)
    const noise = lcgToNoise(noiseState) * expDecay(t / noiseDecaySec) * 0.5 * bright

    out[n] = (tone + noise) * gain
  }
}

// CLAP: multi-tap noise burst over clapSpreadMs with band-pass-ish color.
export function renderClap(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const spreadSec = 0.03
  const taps = 4
  const tailDecaySec = 0.14

  let noiseState = (opts.seed >>> 0) || 13
  let prev = 0

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    noiseState = lcgStep(noiseState)
    const raw = lcgToNoise(noiseState)

    // crude band-pass color: subtract a smoothed version (high-pass-ish).
    const colored = raw - prev * 0.5
    prev = raw

    // Multi-tap retrigger envelope within the spread window.
    let tapEnv = 0
    for (var k = 0; k < taps; k++) {
      const tapAt = (k / taps) * spreadSec
      if (t >= tapAt) {
        const dt = t - tapAt
        const e = expDecay(dt / 0.012)
        if (e > tapEnv) tapEnv = e
      }
    }
    const tail = t > spreadSec ? expDecay((t - spreadSec) / tailDecaySec) * 0.6 : 0

    out[n] = colored * (tapEnv + tail) * gain * 0.7 * bright
  }
}

// HAT: metallic noise through a high-pass-ish color; closed = short decay,
// open = long decay.
export function renderHat(out: Float32Array, opts: VoiceRenderOpts, open: boolean): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const decaySec = open ? 0.4 : 0.05

  let noiseState = (opts.seed >>> 0) || 29
  let hpPrev = 0

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    noiseState = lcgStep(noiseState)
    const raw = lcgToNoise(noiseState)

    // high-pass: emphasize transients/highs (metallic), scaled by brightness.
    const hp = raw - hpPrev
    hpPrev = raw * 0.7

    out[n] = hp * expDecay(t / decaySec) * gain * 0.5 * bright
  }
}

// TOM: sine/triangle with pitch drop (higher + longer than kick).
export function renderTom(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const startHz = 210
  const endHz = 110
  const pitchDecaySec = 0.06
  const bodyDecaySec = 0.34

  let phase = 0
  let noiseState = (opts.seed >>> 0) || 41

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    const prog = Math.min(1, t / pitchDecaySec)
    const freq = pitchEnvelopeHz(prog, startHz, endHz)
    phase += (TWO_PI * freq) / sr

    const body = Math.sin(phase) * expDecay(t / bodyDecaySec)

    noiseState = lcgStep(noiseState)
    const stick = lcgToNoise(noiseState) * (t < 0.003 ? 1 : 0) * 0.3 * bright

    out[n] = body * gain * 0.85 + stick * gain
  }
}

// PERC: short tone/noise hybrid (conga/bongo/rim-ish).
export function renderPerc(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const toneHz = 480
  const decaySec = 0.09

  let phase = 0
  let noiseState = (opts.seed >>> 0) || 57

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    phase += (TWO_PI * toneHz) / sr

    const tone = Math.sin(phase) * expDecay(t / decaySec) * 0.6
    noiseState = lcgStep(noiseState)
    const noise = lcgToNoise(noiseState) * expDecay(t / (decaySec * 0.7)) * 0.4 * bright

    out[n] = (tone + noise) * gain * 0.8
  }
}

// RIDE: metallic noise, long decay + strong ping tone.
export function renderRide(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const pingHz = 820
  const decaySec = 0.9

  let phase = 0
  let noiseState = (opts.seed >>> 0) || 71

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    phase += (TWO_PI * pingHz) / sr

    const ping = Math.sin(phase) * expDecay(t / decaySec) * 0.5
    noiseState = lcgStep(noiseState)
    const metal = lcgToNoise(noiseState) * expDecay(t / (decaySec * 0.8)) * 0.3 * bright

    out[n] = (ping + metal) * gain * 0.7
  }
}

// CRASH: bright metallic noise, long decay, weaker ping than ride.
export function renderCrash(out: Float32Array, opts: VoiceRenderOpts): void {
  const sr = opts.sampleRate
  const gain = velocityToGain(opts.velocity, opts.velCurve)
  const bright = velocityToBrightness(opts.velocity, opts.velTrack)
  const decaySec = 1.2

  let noiseState = (opts.seed >>> 0) || 97
  let hpPrev = 0

  for (var n = 0; n < out.length; n++) {
    const t = n / sr
    noiseState = lcgStep(noiseState)
    const raw = lcgToNoise(noiseState)
    const hp = raw - hpPrev
    hpPrev = raw * 0.6

    out[n] = hp * expDecay(t / decaySec) * gain * 0.6 * bright
  }
}

// Dispatcher: render the canonical role into `out`. Returns false for roles
// with no voice (should never happen for canonical roles).
export function renderDrum(role: DrumRole, out: Float32Array, opts: VoiceRenderOpts): boolean {
  switch (role) {
    case 'kick':
      renderKick(out, opts)
      return true
    case 'snare':
      renderSnare(out, opts)
      return true
    case 'clap':
      renderClap(out, opts)
      return true
    case 'hat-closed':
      renderHat(out, opts, false)
      return true
    case 'hat-open':
      renderHat(out, opts, true)
      return true
    case 'tom':
      renderTom(out, opts)
      return true
    case 'perc':
      renderPerc(out, opts)
      return true
    case 'ride':
      renderRide(out, opts)
      return true
    case 'crash':
      renderCrash(out, opts)
      return true
    default:
      return false
  }
}
