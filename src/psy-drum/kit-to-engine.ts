// PSYDRUM kit-to-engine mapping (step AA) — connects KIT_PRESETS to the real
// drum engines so CHANGING KIT ACTUALLY CHANGES THE SOUND.
//
// Each engine takes a Params object. A kit preset is a Record<role, DrumPatch>.
// This module maps a DrumPatch onto the engine params (filling engine-specific
// defaults the patch doesn't carry), so a kit drives the real DSP.

import type { DrumPatch } from './types'
import type { KickEngineParams } from './kick-engine'
import type { SnareEngineParams } from './snare-engine'
import type { HatEngineParams } from './hat-engine'
import type { CymbalEngineParams } from './cymbal-engine'

function num(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback
}

export interface EngineDefaults {
  sampleRate: number
  durationSec: number
  oversample: number
}

export function kickParamsFromPatch(p: DrumPatch, d: EngineDefaults): KickEngineParams {
  const body = p.body
  const amp = p.amp
  return {
    sampleRate: d.sampleRate,
    durationSec: d.durationSec,
    oversample: d.oversample,
    bodyStartHz: num(body && body.startHz, 160),
    bodyEndHz: num(body && body.endHz, 48),
    bodyPitchDecayMs: num(body && body.pitchDecayMs, 45),
    bodyDecayMs: num(amp && amp.decayMs, 120),
    punchRatio: 3,
    punchAmount: 0.5,
    punchDecayMs: 12,
    clickAmount: 0.4,
    clickHpHz: 4000,
    clickMs: 2,
    filterCutoffHz: num(p.filter && p.filter.cutoff, 300),
    filterQ: num(p.filter && p.filter.res, 1.2),
    driveDb: num(p.driveDb, 4),
  }
}

export function snareParamsFromPatch(p: DrumPatch, d: EngineDefaults): SnareEngineParams {
  const body = p.body
  const noise = p.noise
  const amp = p.amp
  return {
    sampleRate: d.sampleRate,
    durationSec: d.durationSec,
    oversample: d.oversample,
    toneHz: num(body && body.startHz, 195),
    tonePitchDropHz: 40,
    tonePitchDecayMs: 20,
    toneAmount: 0.5,
    toneDecayMs: num(amp && amp.decayMs, 90),
    noiseBpHz: num(noise && noise.bpHz, 1850),
    noiseQ: num(noise && noise.mix, 1.0),
    noiseAmount: 0.7,
    noiseDecayMs: 130,
    driveDb: num(p.driveDb, 2),
  }
}

export function hatParamsFromPatch(p: DrumPatch, d: EngineDefaults, open: boolean): HatEngineParams {
  const noise = p.noise
  const amp = p.amp
  return {
    sampleRate: d.sampleRate,
    durationSec: d.durationSec,
    oversample: d.oversample,
    open: open,
    metalHz: 5500,
    ringRatio: 1.34,
    metalAmount: 0.6,
    noiseAmount: num(noise && noise.mix, 0.5),
    noiseHpHz: num(noise && noise.bpHz, 7000),
    hpHz: 7500,
    hpQ: 0.7,
    decayMs: num(amp && amp.decayMs, open ? 330 : 45),
    driveDb: num(p.driveDb, 1),
  }
}

export function cymbalParamsFromPatch(p: DrumPatch, d: EngineDefaults, ride: boolean): CymbalEngineParams {
  const amp = p.amp
  return {
    sampleRate: d.sampleRate,
    durationSec: d.durationSec,
    oversample: d.oversample,
    metalHz: ride ? 4500 : 3800,
    ringRatio: 1.41,
    metalAmount: 0.6,
    pingHz: ride ? 5200 : 0,
    pingAmount: ride ? 0.5 : 0,
    hpHz: ride ? 6000 : 5000,
    hpQ: 0.7,
    decayMs: num(amp && amp.decayMs, ride ? 520 : 700),
    driveDb: num(p.driveDb, 1),
  }
}
