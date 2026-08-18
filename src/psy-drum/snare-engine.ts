// PSYDRUM REAL snare engine (step X) — a genuine multi-engine snare.
//
// Mirrors the kick-engine philosophy: real engines, real filters, real
// saturation, oversampling. Not one Math.sin.
//   1. TONE   — sine/triangle body with a fast pitch drop (the 'crack' shell)
//   2. NOISE  — band-passed seeded noise (the snare-wire 'sizzle') through a
//               REAL biquad band-pass
//   3. TONE FILTER — resonant biquad low-pass on the tone body
//   4. MULTI-STAGE SATURATION
//   5. OVERSAMPLING (render at N*sr, decimate)

import { BiquadFilter } from './filters'

export interface SnareEngineParams {
  sampleRate: number
  durationSec: number
  oversample: number
  // tone body
  toneHz: number
  tonePitchDropHz: number   // how far the tone drops
  tonePitchDecayMs: number
  toneAmount: number        // 0..1
  toneDecayMs: number
  // noise (snare wires)
  noiseBpHz: number         // band-pass centre
  noiseQ: number
  noiseAmount: number       // 0..1
  noiseDecayMs: number
  // drive
  driveDb: number
}

export function renderSnareEngine(p: SnareEngineParams): Float32Array {
  const os = Math.max(1, Math.floor(p.oversample))
  const sr = p.sampleRate * os
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const noiseBp = new BiquadFilter(sr, 'bandpass', p.noiseBpHz, p.noiseQ)
  const toneLp = new BiquadFilter(sr, 'lowpass', Math.max(200, p.toneHz * 3), 0.9)

  let tonePhase = 0
  let noiseState = 0x9e3779b9 >>> 0
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  const tonePitchDecay = Math.max(0.001, p.tonePitchDecayMs / 1000)
  const toneDecay = Math.max(0.01, p.toneDecayMs / 1000)
  const noiseDecay = Math.max(0.01, p.noiseDecayMs / 1000)

  for (let i = 0; i < n; i++) {
    const t = i / sr

    // tone body: fast pitch drop (the shell 'crack')
    const k = Math.exp(-t / tonePitchDecay)
    const toneHz = (p.toneHz - p.tonePitchDropHz) + p.tonePitchDropHz * k
    tonePhase += toneHz / sr
    if (tonePhase >= 1) tonePhase -= Math.floor(tonePhase)
    const toneEnv = Math.exp(-t / toneDecay)
    const tone = Math.sin(2 * Math.PI * tonePhase) * toneEnv * p.toneAmount
    const toneFilt = toneLp.process(tone)

    // noise: band-passed seeded noise (the snare wires)
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >>> 17
    noiseState ^= noiseState << 5
    const noise = ((noiseState >>> 0) / 4294967296) * 2 - 1
    const noiseEnv = Math.exp(-t / noiseDecay)
    const noiseFilt = noiseBp.process(noise) * noiseEnv * p.noiseAmount

    // combine tone + noise
    let sig = toneFilt + noiseFilt

    // attack envelope
    const attack = Math.min(1, t / 0.001)
    sig *= attack

    // multi-stage saturation
    sig = Math.tanh(sig * drive)
    sig = Math.tanh(sig)

    out[i] = sig
  }

  // oversampled decimation
  if (os > 1) {
    const outLen = Math.floor(n / os)
    const ds = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      let sum = 0
      for (let j = 0; j < os; j++) sum += out[i * os + j]
      ds[i] = sum / os
    }
    return ds
  }
  return out
}
