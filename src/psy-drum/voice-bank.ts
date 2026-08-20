// PSYDRUM voice bank (audit M2, ADR-008) — the hybrid buffer-bank layer.
//
// The realtime voice-synth chains stay the fallback for roles without offline
// engines (clap/tom/perc) and for hosts that opt out. For kick/snare/hats the
// device can pre-render a small deterministic bank from the ACB engines:
//
//   BANK_VELOCITY_LAYERS velocity layers (gain-layered) x BANK_VARIANTS
//   round-robin variants (seeded noise / micro-detune) per role.
//
// Layer selection uses the (humanized) velocity; variant selection uses
// roundRobinVariant from variance-rules — the anti-machine-gun machinery now
// has a real home. Rendering is deterministic per seed (ADR-002 preserved):
// same (patches, sampleRate, seed) => bit-identical bank.
//
// The pure render step (renderRoleBanks) returns Float32Arrays and is fully
// unit-testable without any AudioContext; buildAudioBank wraps them into
// AudioBuffers on the device context at load time (main thread, one-time).

import type { DrumPatch, DrumRole } from './types'
import {
  renderAcbKick,
  renderAcbSnare,
  renderAcbHat,
  acbKickParamsFromPatch,
  acbSnareParamsFromPatch,
  acbHatParamsFromPatch,
} from './acb'

export const BANK_VELOCITY_LAYERS: readonly number[] = [0.4, 0.7, 1.0]
export const BANK_VARIANTS = 2

// Banked roles: exactly the roles with ACB offline engines. clap/tom/perc are
// NOT banked (no engines) and always use the realtime synthesis path.
export const BANKED_ROLES: readonly DrumRole[] = ['kick', 'snare', 'hat-closed', 'hat-open']

const ROLE_SALT: Partial<Record<DrumRole, number>> = {
  kick: 11,
  snare: 23,
  'hat-closed': 37,
  'hat-open': 53,
}

const ROLE_DURATION_SEC: Partial<Record<DrumRole, number>> = {
  kick: 0.3,
  snare: 0.3,
  'hat-closed': 0.15,
  'hat-open': 0.4,
}

// Velocity layer selection: evenly spaced thresholds over normalized 0..1.
// Pure and deterministic.
export function pickBankLayer(velocity01: number, numLayers: number): number {
  if (numLayers <= 0) return 0
  const v = Math.max(0, Math.min(1, velocity01))
  const idx = Math.floor(v * numLayers)
  return Math.min(numLayers - 1, idx)
}

function renderOne(role: DrumRole, patch: DrumPatch, sampleRate: number, seed: number, variant: number): Float32Array {
  const salt = ROLE_SALT[role] === undefined ? 0 : ROLE_SALT[role]
  const dur = ROLE_DURATION_SEC[role] === undefined ? 0.3 : ROLE_DURATION_SEC[role]
  const d = { sampleRate: sampleRate, durationSec: dur }
  const variantSeed = (seed + salt + variant * 7919) >>> 0
  if (role === 'kick') {
    return renderAcbKick(acbKickParamsFromPatch(patch, d), variantSeed)
  }
  if (role === 'snare') {
    return renderAcbSnare(acbSnareParamsFromPatch(patch, d), variantSeed)
  }
  // hats: deterministic micro-detune (+7 cents on odd variants) as the variant
  const detune = variant % 2 === 0 ? 0 : 7
  return renderAcbHat(acbHatParamsFromPatch(patch, d, role === 'hat-open'), detune)
}

// Pure bank render: [layer][variant] Float32Arrays for every banked role.
// Layers are gain-scaled by BANK_VELOCITY_LAYERS (louder layer = louder hit;
// timbre variance across layers is ADR-004 documented as a known limitation of
// pre-rendered material).
export function renderRoleBanks(
  patches: Partial<Record<DrumRole, DrumPatch>>,
  sampleRate: number,
  seed: number,
): Partial<Record<DrumRole, Float32Array[][]>> {
  const out: Partial<Record<DrumRole, Float32Array[][]>> = {}
  for (let r = 0; r < BANKED_ROLES.length; r++) {
    const role = BANKED_ROLES[r]
    const patch = patches[role] === undefined ? {} : patches[role]
    const layers: Float32Array[][] = []
    for (let li = 0; li < BANK_VELOCITY_LAYERS.length; li++) {
      const gain = BANK_VELOCITY_LAYERS[li]
      const variants: Float32Array[] = []
      for (let v = 0; v < BANK_VARIANTS; v++) {
        const samples = renderOne(role, patch, sampleRate, seed, v)
        for (let i = 0; i < samples.length; i++) samples[i] = samples[i] * gain
        variants.push(samples)
      }
      layers.push(variants)
    }
    out[role] = layers
  }
  return out
}

// Device-side builder: wraps the pure render into AudioBuffers on ctx.
export function buildAudioBank(
  ctx: BaseAudioContext,
  patches: Partial<Record<DrumRole, DrumPatch>>,
  seed: number,
): Partial<Record<DrumRole, AudioBuffer[][]>> {
  const banks = renderRoleBanks(patches, ctx.sampleRate, seed)
  const out: Partial<Record<DrumRole, AudioBuffer[][]>> = {}
  for (let r = 0; r < BANKED_ROLES.length; r++) {
    const role = BANKED_ROLES[r]
    const layers = banks[role]
    if (layers === undefined) continue
    const bufLayers: AudioBuffer[][] = []
    for (let li = 0; li < layers.length; li++) {
      const bufVariants: AudioBuffer[] = []
      for (let v = 0; v < layers[li].length; v++) {
        const samples = layers[li][v]
        const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate)
        buf.getChannelData(0).set(samples)
        bufVariants.push(buf)
      }
      bufLayers.push(bufVariants)
    }
    out[role] = bufLayers
  }
  return out
}
