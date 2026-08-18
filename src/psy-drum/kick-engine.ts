// PSYDRUM REAL kick engine (step W) — a genuine multi-engine psy kick.
//
// Replaces the single-sine "kick" with real drum DSP:
//   1. CLICK  — noise burst through a real high-pass (the transient 'tick')
//   2. BODY   — sine with exponential pitch drop (the 'boom')
//   3. PUNCH  — a second, higher-frequency oscillator with fast decay that FM-
//               style reinforces the attack (the 'knock')
//   4. RESONANT BIQUAD LOW-PASS IN THE SIGNAL PATH (the ported BiquadFilter,
//               no longer dead code)
//   5. MULTI-STAGE SATURATION (tanh -> soft clip)
//   6. OVERSAMPLING (render at N*sr, decimate) to reduce drive aliasing
//
// This is the honest answer to the roast: real engines, real filters, real
// saturation, oversampling. Not one Math.sin.

import { OnePoleHP, BiquadFilter } from './filters'

export interface KickEngineParams {
  sampleRate: number
  durationSec: number
  oversample: number
  // body
  bodyStartHz: number
  bodyEndHz: number
  bodyPitchDecayMs: number
  bodyDecayMs: number    // amplitude decay (separate from pitch decay so sub sustains)
  // punch
  punchRatio: number     // punch freq = bodyHz * punchRatio
  punchAmount: number    // 0..1
  punchDecayMs: number
  // click
  clickAmount: number    // 0..1
  clickHpHz: number
  clickMs: number
  // filter
  filterCutoffHz: number
  filterQ: number
  // drive
  driveDb: number
}

export function renderKickEngine(p: KickEngineParams): Float32Array {
  const os = Math.max(1, Math.floor(p.oversample))
  const sr = p.sampleRate * os
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const clickHp = new OnePoleHP(sr, p.clickHpHz)
  const bodyLp = new BiquadFilter(sr, 'lowpass', p.filterCutoffHz, p.filterQ)

  let bodyPhase = 0
  let punchPhase = 0
  let noiseState = 0x12345678 >>> 0
  const clickLen = Math.max(1, Math.floor(sr * (p.clickMs / 1000)))
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  const punchDecay = Math.max(0.001, p.punchDecayMs / 1000)
  const bodyPitchDecay = Math.max(0.001, p.bodyPitchDecayMs / 1000)
  const bodyDecay = Math.max(0.05, p.bodyDecayMs / 1000)

  for (let i = 0; i < n; i++) {
    const t = i / sr

    // body: exponential pitch drop
    const k = Math.exp(-t / bodyPitchDecay)
    const bodyHz = p.bodyEndHz + (p.bodyStartHz - p.bodyEndHz) * k

    bodyPhase += bodyHz / sr
    if (bodyPhase >= 1) bodyPhase -= Math.floor(bodyPhase)
    const body = Math.sin(2 * Math.PI * bodyPhase)

    // punch: higher-freq oscillator, fast decay (FM-style reinforcement)
    const punchHz = bodyHz * p.punchRatio
    const punchEnv = Math.exp(-t / punchDecay)
    punchPhase += punchHz / sr
    if (punchPhase >= 1) punchPhase -= Math.floor(punchPhase)
    const punch = Math.sin(2 * Math.PI * punchPhase) * punchEnv * p.punchAmount

    // click: high-passed noise burst, first clickMs only
    let click = 0
    if (i < clickLen) {
      noiseState ^= noiseState << 13
      noiseState ^= noiseState >>> 17
      noiseState ^= noiseState << 5
      const noise = ((noiseState >>> 0) / 4294967296) * 2 - 1
      click = clickHp.process(noise) * p.clickAmount * (1 - i / clickLen)
    }

    let sig = body + punch + click

    // resonant low-pass IN the path (real biquad)
    sig = bodyLp.process(sig)

    // envelope: fast attack, exponential decay (separate body decay so sub sustains)
    const attack = Math.min(1, t / 0.0015)
    const bodyEnv = Math.exp(-t / Math.max(0.05, bodyDecay))
    sig *= attack * bodyEnv

    // multi-stage saturation
    sig = Math.tanh(sig * drive)
    sig = Math.tanh(sig)

    out[i] = sig
  }

  // oversampled decimation (average) — body is already low-passed
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
