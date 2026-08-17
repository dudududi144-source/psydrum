// PSYDRUM per-drum synthesis chains (completes phase 5; wired by device.ts).
//
// Each drum role gets its OWN analog-modeled chain per ARCHITECTURE.md 4.1, so
// the drums actually SOUND different (kick punch, snare crack, hat tick, ...).
// Everything is built from the injected BaseAudioContext + a precomputed,
// SEEDED noise buffer (deterministic — same seed => identical noise, audit B9).
//
// Zero WHAT leaks: these chains only realize HOW a given role sounds for a
// given patch + resolved params; they never decide notes, patterns or grooves.

import type { DrumPatch, DrumRole } from './types'
import type { ResolvedDrumParams } from './voice'

export interface SynthCtx {
  ctx: BaseAudioContext
  noiseBuffer: AudioBuffer
  bus: GainNode
  now: number
  params: ResolvedDrumParams
  patch: DrumPatch
  duration: number // seconds the voice is allowed to ring
}

// Create a real AudioBuffer on the given context and fill it deterministically.
export function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  let s = seed >>> 0
  for (let i = 0; i < len; i++) {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    data[i] = ((s >>> 0) / 4294967296) * 2 - 1
  }
  return buf
}

// ─── Voice builders ──────────────────────────────────────────────────────────

function envGain(ctx: BaseAudioContext, now: number, peak: number, attackMs: number, decayMs: number, dur: number): GainNode {
  const g = ctx.createGain()
  const a = Math.max(0.001, attackMs / 1000)
  const d = Math.max(0.02, decayMs / 1000)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(peak, now + a)
  g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(a + 0.01, Math.min(dur, d)))
  return g
}

// KICK: sine body with a fast pitch drop (the psy 'donk'), optional click.
export function buildKick(sc: SynthCtx): void {
  const { ctx, bus, now, params, patch } = sc
  const startHz = patch.body !== undefined ? patch.body.startHz : 160
  const endHz = patch.body !== undefined ? patch.body.endHz : 45
  const pitchMs = patch.body !== undefined ? patch.body.pitchDecayMs : 45

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(startHz, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + Math.max(0.01, pitchMs / 1000))

  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = params.cutoff

  const g = envGain(ctx, now, params.gain, 1, 210, sc.duration)
  osc.connect(lpf)
  lpf.connect(g)
  g.connect(bus)
  osc.start(now)
  osc.stop(now + sc.duration + 0.05)
}

// Noise-based drums (snare/clap/hats/ride/crash): seeded noise -> filter -> VCA.
function buildNoiseVoice(sc: SynthCtx, filterType: BiquadFilterType, freq: number, attackMs: number, decayMs: number, peakScale: number): void {
  const { ctx, noiseBuffer, bus, now, params } = sc
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer

  const f = ctx.createBiquadFilter()
  f.type = filterType
  f.frequency.value = Math.min(freq * (0.6 + params.noiseBrightness * 0.8), ctx.sampleRate / 2 - 100)

  const g = envGain(ctx, now, sc.params.gain * peakScale, attackMs, decayMs, sc.duration)
  src.connect(f)
  f.connect(g)
  g.connect(bus)
  src.start(now)
  src.stop(now + sc.duration + 0.05)
}

// Add a tonal 'ping' osc on top of a noise voice (snare body, ride ping, tom).
function buildTone(sc: SynthCtx, hz: number, wave: OscillatorType, attackMs: number, decayMs: number, peakScale: number): void {
  const { ctx, bus, now, params } = sc
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.value = hz
  const g = envGain(ctx, now, params.gain * peakScale, attackMs, decayMs, sc.duration)
  osc.connect(g)
  g.connect(bus)
  osc.start(now)
  osc.stop(now + sc.duration + 0.05)
}

export function buildSnare(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'bandpass', 1800, 1, 140, 0.9)
  buildTone(sc, 190, 'triangle', 1, 90, 0.7)
}

export function buildClap(sc: SynthCtx): void {
  // Clap = a few tight noise taps; we realize it as 3 quick band-pass bursts.
  buildNoiseVoice(sc, 'bandpass', 1200, 1, 60, 0.8)
  buildNoiseVoice(sc, 'bandpass', 1500, 12, 70, 0.6)
  buildNoiseVoice(sc, 'bandpass', 1000, 24, 90, 0.5)
}

export function buildHat(sc: SynthCtx, open: boolean): void {
  buildNoiseVoice(sc, 'highpass', 7000, 1, open ? 320 : 45, open ? 0.5 : 0.6)
}

export function buildTom(sc: SynthCtx, hz: number): void {
  buildTone(sc, hz, 'sine', 1, 220, 1.0)
}

export function buildPerc(sc: SynthCtx): void {
  buildTone(sc, 620, 'triangle', 1, 70, 0.8)
  buildNoiseVoice(sc, 'bandpass', 2600, 1, 40, 0.35)
}

export function buildRide(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 6000, 1, 500, 0.35)
  buildTone(sc, 5200, 'sine', 1, 300, 0.25)
}

export function buildCrash(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 5000, 1, 700, 0.6)
}

// Dispatch by role (called by device.ts).
export function synthDrum(role: DrumRole, sc: SynthCtx): void {
  switch (role) {
    case 'kick':
      buildKick(sc)
      break
    case 'snare':
      buildSnare(sc)
      break
    case 'clap':
      buildClap(sc)
      break
    case 'hat-closed':
      buildHat(sc, false)
      break
    case 'hat-open':
      buildHat(sc, true)
      break
    case 'tom':
      buildTom(sc, 220)
      break
    case 'perc':
      buildPerc(sc)
      break
    case 'ride':
      buildRide(sc)
      break
    case 'crash':
      buildCrash(sc)
      break
    default:
      break
  }
}
