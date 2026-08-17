// PSYDRUM per-drum synthesis chains (completes phase 5; wired by device.ts).
//
// Each drum role gets its OWN analog-modeled chain per ARCHITECTURE.md 4.1, and
// every chain is PATCH-DRIVEN: the DrumPatch (tune/decay/tone/noise/drive/vel)
// shapes the sound, so sound design is data, not hardcoded. Deterministic: all
// noise comes from a SEEDED buffer (audit B9). Zero WHAT leaks — these chains
// only realize HOW a role sounds for a patch + resolved params.

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

// ─── drive / saturation (the psy punch, patch-driven) ───────────────────────

// Deterministic tanh soft-clip curve. Higher driveDb => harder clip => more bite.
export function makeDriveCurve(driveDb: number): Float32Array {
  const n = 1024
  const curve = new Float32Array(n)
  const k = Math.max(1, Math.pow(10, driveDb / 20))
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * k) / norm
  }
  return curve
}

function makeDrive(ctx: BaseAudioContext, driveDb: number): WaveShaperNode | null {
  if (!(driveDb > 0)) return null
  const ws = ctx.createWaveShaper()
  ws.curve = makeDriveCurve(driveDb)
  ws.oversample = '2x'
  return ws
}

// Route `from` through an optional drive stage into `to`.
function connectThroughDrive(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, driveDb: number): void {
  const drive = makeDrive(ctx, driveDb)
  if (drive === null) {
    from.connect(to)
  } else {
    from.connect(drive)
    drive.connect(to)
  }
}

// ─── patch readers (sound design = data) ────────────────────────────────────

function patchAttackMs(p: DrumPatch, fallback: number): number {
  return p.amp !== undefined ? p.amp.attackMs : fallback
}
function patchDecayMs(p: DrumPatch, fallback: number): number {
  return p.amp !== undefined ? p.amp.decayMs : fallback
}

// ─── voice builders ─────────────────────────────────────────────────────────

function envGain(ctx: BaseAudioContext, now: number, peak: number, attackMs: number, decayMs: number, dur: number): GainNode {
  const g = ctx.createGain()
  const a = Math.max(0.001, attackMs / 1000)
  const d = Math.max(0.02, decayMs / 1000)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(peak, now + a)
  g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(a + 0.01, Math.min(dur, d)))
  return g
}

// KICK: sine body with a fast pitch drop (the psy 'donk'), patch-driven.
export function buildKick(sc: SynthCtx): void {
  const { ctx, bus, now, params, patch, duration } = sc
  const startHz = patch.body !== undefined ? patch.body.startHz : 165
  const endHz = patch.body !== undefined ? patch.body.endHz : 44
  const pitchMs = patch.body !== undefined ? patch.body.pitchDecayMs : 42

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(startHz, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + Math.max(0.01, pitchMs / 1000))

  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = params.cutoff

  const g = envGain(ctx, now, params.gain, patchAttackMs(patch, 1), patchDecayMs(patch, 215), duration)
  osc.connect(lpf)
  lpf.connect(g)
  connectThroughDrive(ctx, g, bus, patch.driveDb === undefined ? 0 : patch.driveDb)
  osc.start(now)
  osc.stop(now + duration + 0.05)
}

// Noise-based drums (snare/clap/hats/ride/crash): seeded noise -> filter -> VCA.
function buildNoiseVoice(sc: SynthCtx, filterType: BiquadFilterType, defaultHz: number, attackMs: number, decayMs: number, peakScale: number): void {
  const { ctx, noiseBuffer, bus, now, params, patch } = sc
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer

  // Patch-driven tone: noise.bpHz overrides the default color.
  const baseHz = patch.noise !== undefined && patch.noise.bpHz > 0 ? patch.noise.bpHz : defaultHz
  const f = ctx.createBiquadFilter()
  f.type = filterType
  f.frequency.value = Math.min(baseHz * (0.6 + params.noiseBrightness * 0.8), ctx.sampleRate / 2 - 100)
  if (filterType === 'bandpass') f.Q.value = patch.noise !== undefined ? Math.max(0.4, patch.noise.mix) : 0.9

  const g = envGain(ctx, now, sc.params.gain * peakScale, patchAttackMs(patch, attackMs), patchDecayMs(patch, decayMs), sc.duration)
  src.connect(f)
  f.connect(g)
  connectThroughDrive(ctx, g, bus, patch.driveDb === undefined ? 0 : patch.driveDb)
  src.start(now)
  src.stop(now + sc.duration + 0.05)
}

// Tonal 'ping' osc on top of a noise voice (snare body, ride ping, tom).
function buildTone(sc: SynthCtx, defaultHz: number, wave: OscillatorType, attackMs: number, decayMs: number, peakScale: number): void {
  const { ctx, bus, now, params, patch } = sc
  const hz = patch.body !== undefined && patch.body.startHz > 0 ? patch.body.startHz : defaultHz
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.value = hz
  const g = envGain(ctx, now, params.gain * peakScale, patchAttackMs(patch, attackMs), patchDecayMs(patch, decayMs), sc.duration)
  osc.connect(g)
  connectThroughDrive(ctx, g, bus, patch.driveDb === undefined ? 0 : patch.driveDb)
  osc.start(now)
  osc.stop(now + sc.duration + 0.05)
}

export function buildSnare(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'bandpass', 1800, 1, 150, 0.9)
  buildTone(sc, 195, 'triangle', 1, 95, 0.7)
}

export function buildClap(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'bandpass', 1150, 1, 55, 0.8)
  buildNoiseVoice(sc, 'bandpass', 1500, 12, 70, 0.6)
  buildNoiseVoice(sc, 'bandpass', 950, 24, 90, 0.5)
}

export function buildHat(sc: SynthCtx, open: boolean): void {
  buildNoiseVoice(sc, 'highpass', open ? 6400 : 7600, 1, open ? 330 : 42, open ? 0.5 : 0.62)
}

export function buildTom(sc: SynthCtx, defaultHz: number): void {
  buildTone(sc, defaultHz, 'sine', 1, 230, 1.0)
}

export function buildPerc(sc: SynthCtx): void {
  buildTone(sc, 640, 'triangle', 1, 70, 0.8)
  buildNoiseVoice(sc, 'bandpass', 2600, 1, 40, 0.35)
}

export function buildRide(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 6000, 1, 520, 0.34)
  buildTone(sc, 5200, 'sine', 1, 300, 0.24)
}

export function buildCrash(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 5000, 1, 720, 0.6)
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
      buildTom(sc, 215)
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
