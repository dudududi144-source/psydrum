// PSYDRUM percussion DSP (step M) — per-sample snare + hats.
//
// Same per-sample philosophy as kick-dsp: real DSP instead of OscillatorNode.
//   SNARE: sine tone (fast pitch drop) + band-passed seeded noise, sharp attack.
//   HATS:  metallic high-passed seeded noise, fast attack; closed = short decay,
//          open = longer decay.
// Noise is a seeded xorshift (deterministic). Rendered into Float32Array /
// AudioBuffer for the sample layer. Runs in the HOST (browser).

export interface SnareParams {
  toneHz: number
  noiseBpHz: number
  driveDb: number
  sampleRate: number
  durationSec: number
}

export function renderSnareSamples(p: SnareParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let phase = 0
  let s = 0x9e3779b9 >>> 0
  // one-pole lowpass state for band-passing the noise
  let lp = 0
  const bpAlpha = Math.min(0.95, Math.max(0.02, p.noiseBpHz / (sr * 0.5)))
  for (let i = 0; i < n; i++) {
    const t = i / sr
    // tone: sine with fast pitch drop
    const freq = p.toneHz * Math.exp(-t / 0.05)
    phase += freq / sr
    if (phase >= 1) phase -= Math.floor(phase)
    const tone = Math.sin(2 * Math.PI * phase)
    // seeded noise
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    const noise = ((s >>> 0) / 4294967296) * 2 - 1
    // crude band-pass: noise - lowpass(noise)
    lp += bpAlpha * (noise - lp)
    const bpNoise = noise - lp
    // envelope: sharp attack, fast decay
    const attack = Math.min(1, t / 0.001)
    const decay = Math.exp(-t / 0.09)
    let sig = (tone * 0.45 + bpNoise * 0.55) * attack * decay
    sig = Math.tanh(sig * drive) / Math.tanh(drive)
    if (sig > 1) sig = 1
    if (sig < -1) sig = -1
    out[i] = sig
  }
  return out
}

export interface HatParams {
  hpHz: number
  decayMs: number
  driveDb: number
  sampleRate: number
  durationSec: number
}

export function renderHatSamples(p: HatParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let s = 0x12345678 >>> 0
  let lp = 0
  const hpAlpha = Math.min(0.95, Math.max(0.05, p.hpHz / (sr * 0.5)))
  const decaySec = Math.max(0.01, p.decayMs / 1000)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    const noise = ((s >>> 0) / 4294967296) * 2 - 1
    // high-pass: noise - lowpass(noise)
    lp += hpAlpha * (noise - lp)
    const hpNoise = noise - lp
    const attack = Math.min(1, t / 0.0008)
    const decay = Math.exp(-t / decaySec)
    let sig = hpNoise * 0.5 * attack * decay
    sig = Math.tanh(sig * drive) / Math.tanh(drive)
    if (sig > 1) sig = 1
    if (sig < -1) sig = -1
    out[i] = sig
  }
  return out
}

export function renderSnareInto(ctx: BaseAudioContext, p: SnareParams): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(p.sampleRate * p.durationSec), p.sampleRate)
  const data = renderSnareSamples(p)
  buf.getChannelData(0).set(data.subarray(0, buf.length))
  return buf
}

export function renderHatInto(ctx: BaseAudioContext, p: HatParams): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(p.sampleRate * p.durationSec), p.sampleRate)
  const data = renderHatSamples(p)
  buf.getChannelData(0).set(data.subarray(0, buf.length))
  return buf
}

// PSYDRUM remaining percussion DSP (step N) — per-sample tom / perc / crash / ride.
// Completes the drum set with real per-sample DSP (same philosophy as kick/snare/hats).
//   TOM:   sine body with pitch drop (like kick, higher + longer).
//   PERC:  short tone + band-passed noise hybrid.
//   CRASH: high-passed metallic noise, long decay.
//   RIDE:  high-passed metallic noise + a 'ping' tone, long decay.

export interface TomParams {
  startHz: number
  endHz: number
  pitchDecayMs: number
  driveDb: number
  sampleRate: number
  durationSec: number
}

export function renderTomSamples(p: TomParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  const pitchDecay = Math.max(0.001, p.pitchDecayMs / 1000)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const k = Math.exp(-t / pitchDecay)
    const freq = p.endHz + (p.startHz - p.endHz) * k
    phase += freq / sr
    if (phase >= 1) phase -= Math.floor(phase)
    let s = Math.sin(2 * Math.PI * phase)
    const attack = Math.min(1, t / 0.002)
    const decay = Math.exp(-t / Math.max(0.05, pitchDecay * 1.5))
    s *= attack * decay
    s = Math.tanh(s * drive) / Math.tanh(drive)
    if (s > 1) s = 1
    if (s < -1) s = -1
    out[i] = s
  }
  return out
}

export interface PercParams {
  toneHz: number
  noiseBpHz: number
  driveDb: number
  sampleRate: number
  durationSec: number
}

export function renderPercSamples(p: PercParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let phase = 0
  let s = 0xabcdef01 >>> 0
  let lp = 0
  const bpAlpha = Math.min(0.95, Math.max(0.02, p.noiseBpHz / (sr * 0.5)))
  for (let i = 0; i < n; i++) {
    const t = i / sr
    phase += p.toneHz / sr
    if (phase >= 1) phase -= Math.floor(phase)
    const tone = Math.sin(2 * Math.PI * phase)
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    const noise = ((s >>> 0) / 4294967296) * 2 - 1
    lp += bpAlpha * (noise - lp)
    const bpNoise = noise - lp
    const attack = Math.min(1, t / 0.001)
    const decay = Math.exp(-t / 0.06)
    let sig = (tone * 0.5 + bpNoise * 0.5) * attack * decay
    sig = Math.tanh(sig * drive) / Math.tanh(drive)
    if (sig > 1) sig = 1
    if (sig < -1) sig = -1
    out[i] = sig
  }
  return out
}

export interface CymbalParams {
  hpHz: number
  decayMs: number
  pingHz: number     // 0 = no ping (crash), >0 = ride ping
  pingMix: number    // 0..1 how much ping
  driveDb: number
  sampleRate: number
  durationSec: number
}

export function renderCymbalSamples(p: CymbalParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let s = 0xfedcba98 >>> 0
  let lp = 0
  const hpAlpha = Math.min(0.95, Math.max(0.05, p.hpHz / (sr * 0.5)))
  const decaySec = Math.max(0.01, p.decayMs / 1000)
  let pingPhase = 0
  const pm = Math.max(0, Math.min(1, p.pingMix))
  for (let i = 0; i < n; i++) {
    const t = i / sr
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    const noise = ((s >>> 0) / 4294967296) * 2 - 1
    lp += hpAlpha * (noise - lp)
    const hpNoise = noise - lp
    const attack = Math.min(1, t / 0.001)
    const decay = Math.exp(-t / decaySec)
    let sig = hpNoise * 0.5 * attack * decay
    if (p.pingHz > 0 && pm > 0) {
      pingPhase += p.pingHz / sr
      if (pingPhase >= 1) pingPhase -= Math.floor(pingPhase)
      const ping = Math.sin(2 * Math.PI * pingPhase)
      sig = sig * (1 - pm) + ping * pm * attack * decay
    }
    sig = Math.tanh(sig * drive) / Math.tanh(drive)
    if (sig > 1) sig = 1
    if (sig < -1) sig = -1
    out[i] = sig
  }
  return out
}
