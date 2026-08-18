// PSYDRUM REAL cymbal engine (step Z) — genuine crash + ride.
//
// Cymbals are metallic. Like the hat, they use ring-modulation of square
// oscillators through a high-pass, but LOWER and LONGER. The ride adds a
// 'ping' tone (a sine oscillator) on top of the metallic wash.
//   1. METALLIC — ring-mod of two square oscillators (inharmonic)
//   2. HIGH-PASS — real biquad high-pass
//   3. PING (ride only) — a sine 'ping' tone
//   4. ENVELOPE — long decay
//   5. SATURATION + OVERSAMPLING

import { BiquadFilter } from './filters'

export interface CymbalEngineParams {
  sampleRate: number
  durationSec: number
  oversample: number
  // metallic
  metalHz: number
  ringRatio: number
  metalAmount: number
  // ping (ride)
  pingHz: number        // 0 = no ping (crash)
  pingAmount: number    // 0..1
  // filter
  hpHz: number
  hpQ: number
  // envelope
  decayMs: number
  // drive
  driveDb: number
}

function square(phase: number): number {
  return phase < 0.5 ? 1 : -1
}

export function renderCymbalEngine(p: CymbalEngineParams): Float32Array {
  const os = Math.max(1, Math.floor(p.oversample))
  const sr = p.sampleRate * os
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const hp = new BiquadFilter(sr, 'highpass', p.hpHz, p.hpQ)

  let ph1 = 0
  let ph2 = 0
  let pingPhase = 0
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  const decay = Math.max(0.01, p.decayMs / 1000)
  const metalHz2 = p.metalHz * p.ringRatio

  for (let i = 0; i < n; i++) {
    const t = i / sr

    // metallic: ring-mod of two square oscillators
    ph1 += p.metalHz / sr
    if (ph1 >= 1) ph1 -= Math.floor(ph1)
    ph2 += metalHz2 / sr
    if (ph2 >= 1) ph2 -= Math.floor(ph2)
    let metal = square(ph1) * square(ph2) * p.metalAmount

    // ping tone (ride)
    if (p.pingHz > 0 && p.pingAmount > 0) {
      pingPhase += p.pingHz / sr
      if (pingPhase >= 1) pingPhase -= Math.floor(pingPhase)
      const ping = Math.sin(2 * Math.PI * pingPhase)
      metal += ping * p.pingAmount
    }

    // high-pass + envelope
    let sig = hp.process(metal)
    const env = Math.exp(-t / decay)
    const attack = Math.min(1, t / 0.001)
    sig *= env * attack

    // saturation
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
