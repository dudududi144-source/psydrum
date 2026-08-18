// PSYDRUM REAL hi-hat engine (step Y) — a genuine metallic hi-hat.
//
// Real hats are METALLIC. Naive high-passed noise sounds like white-noise
// 'shhh', not a hat. A real metallic hat uses RING MODULATION of square waves
// (the classic 808-style metallic generator) through a high-pass, plus a bit
// of noise for texture:
//   1. METALLIC — ring-mod of two square oscillators (inharmonic metallic tones)
//   2. NOISE    — a little high-passed noise for the 'splash' texture
//   3. HIGH-PASS — real biquad high-pass (hats live above ~6kHz)
//   4. ENVELOPE — closed = fast decay; open = long decay
//   5. SATURATION + OVERSAMPLING

import { BiquadFilter } from './filters'

export interface HatEngineParams {
  sampleRate: number
  durationSec: number
  oversample: number
  open: boolean
  // metallic
  metalHz: number         // base metallic oscillator frequency
  ringRatio: number       // ring-mod ratio (inharmonic)
  metalAmount: number     // 0..1
  // noise texture
  noiseAmount: number     // 0..1
  noiseHpHz: number
  // filter
  hpHz: number            // final high-pass
  hpQ: number
  // envelope
  decayMs: number
  // drive
  driveDb: number
}

function square(phase: number): number {
  return phase < 0.5 ? 1 : -1
}

export function renderHatEngine(p: HatEngineParams): Float32Array {
  const os = Math.max(1, Math.floor(p.oversample))
  const sr = p.sampleRate * os
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const hp = new BiquadFilter(sr, 'highpass', p.hpHz, p.hpQ)
  const noiseHp = new BiquadFilter(sr, 'highpass', p.noiseHpHz, 0.8)

  let ph1 = 0
  let ph2 = 0
  let noiseState = 0x243f6a88 >>> 0
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  const decay = Math.max(0.005, p.decayMs / 1000)
  const metalHz2 = p.metalHz * p.ringRatio

  for (let i = 0; i < n; i++) {
    const t = i / sr

    // metallic: ring-mod of two square oscillators (inharmonic metallic tones).
    // Softened by blending with the high-passed noise so the raw square harmonics
    // don't dominate (raw squares alone sound chiptune/8-bit).
    ph1 += p.metalHz / sr
    if (ph1 >= 1) ph1 -= Math.floor(ph1)
    ph2 += metalHz2 / sr
    if (ph2 >= 1) ph2 -= Math.floor(ph2)
    const metal = (square(ph1) * square(ph2)) * p.metalAmount * 0.6

    // noise texture
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >>> 17
    noiseState ^= noiseState << 5
    const noise = ((noiseState >>> 0) / 4294967296) * 2 - 1
    const noiseTex = noiseHp.process(noise) * p.noiseAmount

    // combine + final high-pass
    let sig = hp.process(metal + noiseTex)

    // envelope: closed = fast decay, open = long decay
    const env = Math.exp(-t / decay)
    const attack = Math.min(1, t / 0.0008)
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
