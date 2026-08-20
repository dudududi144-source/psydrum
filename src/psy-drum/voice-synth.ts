// PSYDRUM per-drum synthesis chains (completes phase 5; wired by device.ts).
//
// Each drum role gets its OWN analog-modeled chain per ARCHITECTURE.md 4.1, and
// every chain is PATCH-DRIVEN: the DrumPatch (tune/decay/tone/noise/drive/vel)
// shapes the sound, so sound design is data, not hardcoded. Deterministic: all
// noise comes from a SEEDED buffer (audit B9). Zero WHAT leaks — these chains
// only realize HOW a role sounds for a patch + resolved params.

import type { DrumPatch, DrumRole } from './types'
import { resolveNoiseFilterHz } from './voice'
import type { ResolvedDrumParams } from './voice'
import { CHOKE_TARGET_GAIN } from './choke'

// ─── voice audio handles (audit V4): real choke / steal / stop ramps ────────

// References to the per-voice nodes a choke, steal or stop must silence.
export interface VoiceAudioHandle {
  gains: GainNode[]
  sources: AudioScheduledSourceNode[]
}

// Silence a voice's audio within rampMs (audit V4): cancel the scheduled
// envelope automation, ramp to -60dB, then stop the sources. cancelAndHoldAtTime
// is used when available so the ramp starts from the LIVE value (no step); the
// fallback is safe on minimal mocks and older environments.
export function silenceVoiceAudio(handle: VoiceAudioHandle, now: number, rampMs: number): void {
  const ramp = Math.max(0.0005, rampMs / 1000)
  for (var i = 0; i < handle.gains.length; i++) {
    const param = handle.gains[i].gain
    const ext = param as unknown as { cancelAndHoldAtTime?: (t: number) => void }
    if (typeof ext.cancelAndHoldAtTime === 'function') {
      ext.cancelAndHoldAtTime(now)
    } else if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
    }
    param.linearRampToValueAtTime(CHOKE_TARGET_GAIN, now + ramp)
  }
  for (var j = 0; j < handle.sources.length; j++) {
    try {
      handle.sources[j].stop(now + ramp + 0.005)
    } catch {
      // already stopped — fine
    }
  }
}

export interface SynthCtx {
  ctx: BaseAudioContext
  noiseBuffer: AudioBuffer
  bus: GainNode
  now: number
  params: ResolvedDrumParams
  patch: DrumPatch
  duration: number // seconds the voice is allowed to ring
  sample: AudioBuffer | null // optional per-drum sample layer (step H)
  handles: VoiceAudioHandle // audit V4: nodes a choke/steal/stop must silence
  pitchHint: number | null // audit V6: MIDI note hint for pitched drums (tom/ride)
  timbre: number // audit M2b: per-hit seeded brightness multiplier (~1 +- 2%)
  clapTaps: Array<number> | null // audit M2c: seeded clap tap offsets in ms (null = fixed 0/12/24)
  synthMix: number // audit M3: sample/synth crossfade weight for the synth side (1 = no sample)
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

// ─── sample layer (step H): blend an optional sample under the synthesis ──

// Play the per-drum sample (if any) blended under the synthesis using
// patch.sample.gain as the sample-vs-synthesis crossfade weight.
export function playSampleLayer(sc: SynthCtx): void {
  const { ctx, sample, bus, now, params, patch, duration } = sc
  if (sample === null) return
  const sref = patch.sample
  if (sref === undefined || !(sref.gain > 0)) return

  const src = ctx.createBufferSource()
  src.buffer = sample

  const g = ctx.createGain()
  // sample.gain crossfades sample vs synthesis; scale by overall velocity gain.
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(params.gain * sref.gain, now + 0.003)
  g.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.05, duration))

  src.connect(g)
  g.connect(bus)
  src.start(now)
  src.stop(now + duration + 0.05)
  sc.handles.gains.push(g)
  sc.handles.sources.push(src)
}

// ─── drive / saturation (the psy punch, patch-driven) ───────────────────────

// Deterministic tanh soft-clip curve. Higher driveDb => harder clip => more bite.
export function makeDriveCurve(driveDb: number): Float32Array<ArrayBuffer> {
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

  const g = envGain(ctx, now, params.gain * sc.synthMix, patchAttackMs(patch, 1), patchDecayMs(patch, 215), duration)
  sc.handles.gains.push(g)
  sc.handles.sources.push(osc)
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
  // Audit V1 fix: params.noiseBrightness is a velocity-tracked centre in Hz
  // (voice.ts section 4.3); the old formula treated it as a 0..1 factor and
  // pinned every noise filter to the Nyquist guard, muting hats/cymbals.
  // Audit M2b: the seeded per-hit timbre multiplier shifts the centre slightly
  // (brightness varies hit-to-hit; pitch and loudness do not).
  const centerHz = resolveNoiseFilterHz(params.noiseBrightness, baseHz, ctx.sampleRate / 2 - 100) * sc.timbre
  f.frequency.value = Math.max(40, Math.min(centerHz, ctx.sampleRate / 2 - 100))
  if (filterType === 'bandpass') f.Q.value = patch.noise !== undefined ? Math.max(0.4, patch.noise.mix) : 0.9

  const g = envGain(ctx, now, sc.params.gain * peakScale * sc.synthMix, patchAttackMs(patch, attackMs), patchDecayMs(patch, decayMs), sc.duration)
  sc.handles.gains.push(g)
  sc.handles.sources.push(src)
  src.connect(f)
  f.connect(g)
  connectThroughDrive(ctx, g, bus, patch.driveDb === undefined ? 0 : patch.driveDb)
  src.start(now)
  src.stop(now + sc.duration + 0.05)
}

// Tonal 'ping' osc on top of a noise voice (snare body, ride ping, tom).
// ─── pitch hints (audit V6): MIDI -> Hz for pitched drums ───────────────────

// Standard MIDI tuning (A4 = 440Hz). Deterministic and pure.
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function clampHz(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function buildTone(sc: SynthCtx, defaultHz: number, wave: OscillatorType, attackMs: number, decayMs: number, peakScale: number, hintHz: number): void {
  const { ctx, bus, now, params, patch } = sc
  // Audit V6: hintHz > 0 carries the router's MIDI pitch hint (tom/ride) and
  // wins over the kit's static tuning; unpitched callers pass 0 (B1 contract).
  const hz = hintHz > 0 ? hintHz : patch.body !== undefined && patch.body.startHz > 0 ? patch.body.startHz : defaultHz
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.value = hz
  const g = envGain(ctx, now, params.gain * peakScale * sc.synthMix, patchAttackMs(patch, attackMs), patchDecayMs(patch, decayMs), sc.duration)
  sc.handles.gains.push(g)
  sc.handles.sources.push(osc)
  osc.connect(g)
  connectThroughDrive(ctx, g, bus, patch.driveDb === undefined ? 0 : patch.driveDb)
  osc.start(now)
  osc.stop(now + sc.duration + 0.05)
}

export function buildSnare(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'bandpass', 1800, 1, 150, 0.9)
  buildTone(sc, 195, 'triangle', 1, 95, 0.7, 0)
}

// Fixed clap tap offsets (ms): the classic 3-tap burst. Tap 1 is the timing
// reference; taps 2/3 may be jittered by the device (audit M2c).
export const DEFAULT_CLAP_TAPS_MS: readonly number[] = [0, 12, 24]

export function buildClap(sc: SynthCtx): void {
  const taps = sc.clapTaps !== null && sc.clapTaps.length === 3 ? sc.clapTaps : DEFAULT_CLAP_TAPS_MS
  buildNoiseVoice(sc, 'bandpass', 1150, taps[0], 55, 0.8)
  buildNoiseVoice(sc, 'bandpass', 1500, taps[1], 70, 0.6)
  buildNoiseVoice(sc, 'bandpass', 950, taps[2], 90, 0.5)
}

export function buildHat(sc: SynthCtx, open: boolean): void {
  buildNoiseVoice(sc, 'highpass', open ? 6400 : 7600, 1, open ? 330 : 42, open ? 0.5 : 0.62)
}

export function buildTom(sc: SynthCtx, defaultHz: number): void {
  // Audit V6: the router's MIDI pitch hint tunes the tom (style criterion #5:
  // tom fills with correct relative pitch). The hint wins over the kit's
  // static body.startHz — per-note host tuning is the whole point.
  const hintHz = sc.pitchHint !== null ? clampHz(midiToHz(sc.pitchHint), 70, 420) : 0
  buildTone(sc, defaultHz, 'sine', 1, 230, 1.0, hintHz)
}

export function buildPerc(sc: SynthCtx): void {
  buildTone(sc, 640, 'triangle', 1, 70, 0.8, 0)
  buildNoiseVoice(sc, 'bandpass', 2600, 1, 40, 0.35)
}

export function buildRide(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 6000, 1, 520, 0.34)
  // Audit V6: the pitch hint tunes the ride's ping tone (wash stays metallic).
  const pingHz = sc.pitchHint !== null ? clampHz(midiToHz(sc.pitchHint) * 16, 1500, 9000) : 0
  buildTone(sc, 5200, 'sine', 1, 300, 0.24, pingHz)
}

export function buildCrash(sc: SynthCtx): void {
  buildNoiseVoice(sc, 'highpass', 5000, 1, 720, 0.6)
}

// Dispatch by role (called by device.ts).
export function synthDrum(role: DrumRole, sc: SynthCtx): void {
  // Optional sample layer blended under the synthesis (step H).
  playSampleLayer(sc)
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
