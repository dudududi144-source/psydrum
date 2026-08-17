// PSYDRUM kit library (phase 7, ARCHITECTURE-STYLE.md section 6).
//
// Kit manifests declare kits with provenance. Invalid kits are REJECTED AT LOAD
// (never at runtime) and bump kitLoadErrors. Sample-layer assets that fail to
// resolve fall back to synthesis-only and bump sampleFallbacks (never silent,
// never throws). Provenance license must be procedural or CC0; UNKNOWN or
// QUARANTINED assets are refused at load.

import type { DrumPatch, KitChokeConfig } from './types'
import { isDrumRole } from './types'
import type { DrumCounters } from './counters'

export const ALLOWED_LICENSES: readonly string[] = ['procedural', 'CC0']

export interface KitProvenance {
  author: string
  license: string
  created: string
}

export interface KitDefinition {
  id: string
  style: string
  provenance: KitProvenance
  drums: Record<string, DrumPatch>
  humanize: boolean
  choke: KitChokeConfig
}

export interface KitManifest {
  manifestVersion: number
  seed: number
  kits: KitDefinition[]
}

// Bounds (ARCHITECTURE-STYLE.md section 6).
const MIN_HZ = 20
const MAX_HZ = 20000
const MAX_ENV_MS = 10000
const MAX_DRIVE_DB = 6

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function inHz(v: unknown): boolean {
  return isFiniteNumber(v) && v >= MIN_HZ && v <= MAX_HZ
}

function inMs(v: unknown): boolean {
  return isFiniteNumber(v) && v >= 0 && v <= MAX_ENV_MS
}

function inUnit(v: unknown): boolean {
  return isFiniteNumber(v) && v >= 0 && v <= 1
}

// Validate one drum patch. Returns error strings (empty = valid).
export function validateDrumPatch(patch: DrumPatch, role: string): string[] {
  const errors: string[] = []
  const p = patch as Record<string, unknown>

  if (p.body != null) {
    const body = p.body as Record<string, unknown>
    if (!inHz(body.startHz)) errors.push(role + '.body.startHz out of range')
    if (!inHz(body.endHz)) errors.push(role + '.body.endHz out of range')
    if (!inMs(body.pitchDecayMs)) errors.push(role + '.body.pitchDecayMs out of range')
  }
  if (p.click != null) {
    const click = p.click as Record<string, unknown>
    if (!inUnit(click.amount)) errors.push(role + '.click.amount out of range')
    if (!inHz(click.hpHz)) errors.push(role + '.click.hpHz out of range')
  }
  if (p.noise != null) {
    const noise = p.noise as Record<string, unknown>
    if (!inUnit(noise.mix)) errors.push(role + '.noise.mix out of range')
    if (!inHz(noise.bpHz)) errors.push(role + '.noise.bpHz out of range')
  }
  if (p.filter != null) {
    const filter = p.filter as Record<string, unknown>
    if (!inHz(filter.cutoff)) errors.push(role + '.filter.cutoff out of range')
    if (!isFiniteNumber(filter.res) || (filter.res as number) < 0) errors.push(role + '.filter.res out of range')
  }
  if (p.amp != null) {
    const amp = p.amp as Record<string, unknown>
    if (!inMs(amp.attackMs)) errors.push(role + '.amp.attackMs out of range')
    if (!inMs(amp.decayMs)) errors.push(role + '.amp.decayMs out of range')
    if (!inMs(amp.releaseMs)) errors.push(role + '.amp.releaseMs out of range')
  }
  if (p.driveDb != null && (!isFiniteNumber(p.driveDb) || (p.driveDb as number) < 0 || (p.driveDb as number) > MAX_DRIVE_DB)) {
    errors.push(role + '.driveDb out of range')
  }
  if (p.velTrack != null && !inUnit(p.velTrack)) {
    errors.push(role + '.velTrack out of range')
  }
  if (p.sends != null) {
    const sends = p.sends as Record<string, unknown>
    if (!inUnit(sends.delay)) errors.push(role + '.sends.delay out of range')
    if (!inUnit(sends.reverb)) errors.push(role + '.sends.reverb out of range')
  }
  if (p.sample != null) {
    const sample = p.sample as Record<string, unknown>
    if (!inUnit(sample.gain)) errors.push(role + '.sample.gain out of range')
    if (sample.assetId != null && typeof sample.assetId !== 'string') {
      errors.push(role + '.sample.assetId must be a string or null')
    }
  }
  return errors
}

export function validateProvenance(prov: unknown): string[] {
  const errors: string[] = []
  if (prov == null || typeof prov !== 'object') {
    errors.push('provenance missing')
    return errors
  }
  const p = prov as Record<string, unknown>
  if (typeof p.author !== 'string' || p.author.length === 0) errors.push('provenance.author missing')
  if (typeof p.license !== 'string' || ALLOWED_LICENSES.indexOf(p.license) === -1) {
    errors.push('provenance.license must be one of ' + ALLOWED_LICENSES.join(', '))
  }
  if (typeof p.created !== 'string' || p.created.length === 0) errors.push('provenance.created missing')
  return errors
}

// Validate one kit definition. Returns error strings (empty = valid).
export function validateKitDefinition(kit: unknown): string[] {
  const errors: string[] = []
  if (kit == null || typeof kit !== 'object') {
    return ['kit is not an object']
  }
  const k = kit as Record<string, unknown>

  if (typeof k.id !== 'string' || k.id.length === 0) errors.push('kit.id missing')
  if (typeof k.style !== 'string' || k.style.length === 0) errors.push('kit.style missing')

  const provErrors = validateProvenance(k.provenance)
  for (var pe = 0; pe < provErrors.length; pe++) errors.push(provErrors[pe])

  const drums = k.drums
  if (drums == null || typeof drums !== 'object') {
    errors.push('kit.drums missing')
  } else {
    const drumMap = drums as Record<string, unknown>
    const roleKeys = Object.keys(drumMap)
    if (roleKeys.length === 0) errors.push('kit.drums is empty')
    for (var rk = 0; rk < roleKeys.length; rk++) {
      const roleKey = roleKeys[rk]
      if (!isDrumRole(roleKey)) {
        errors.push('unknown drum role: ' + roleKey)
        continue
      }
      const patchErrors = validateDrumPatch(drumMap[roleKey] as DrumPatch, roleKey)
      for (var de = 0; de < patchErrors.length; de++) errors.push(patchErrors[de])
    }
  }

  const choke = k.choke
  if (choke == null || typeof choke !== 'object') {
    errors.push('kit.choke missing')
  } else {
    const c = choke as Record<string, unknown>
    if (c.hat !== 'exclusive' && c.hat !== 'none') errors.push('kit.choke.hat must be exclusive or none')
    if (!isFiniteNumber(c.crashMaxPoly) || (c.crashMaxPoly as number) < 1) errors.push('kit.choke.crashMaxPoly must be >= 1')
    if (!isFiniteNumber(c.rideMaxPoly) || (c.rideMaxPoly as number) < 1) errors.push('kit.choke.rideMaxPoly must be >= 1')
  }

  if (k.humanize != null && typeof k.humanize !== 'boolean') errors.push('kit.humanize must be boolean')

  return errors
}

// Load a manifest. Invalid kits are REJECTED AT LOAD (never at runtime) and bump
// kitLoadErrors. Returns only the valid kits. Never throws.
export function loadKitManifest(manifest: unknown, counters: DrumCounters): KitDefinition[] {
  const valid: KitDefinition[] = []
  if (manifest == null || typeof manifest !== 'object') {
    counters.kitLoadErrors = counters.kitLoadErrors + 1
    return valid
  }
  const m = manifest as Record<string, unknown>
  const kits = m.kits
  if (!Array.isArray(kits)) {
    counters.kitLoadErrors = counters.kitLoadErrors + 1
    return valid
  }
  for (var i = 0; i < kits.length; i++) {
    const errors = validateKitDefinition(kits[i])
    if (errors.length > 0) {
      counters.kitLoadErrors = counters.kitLoadErrors + 1
      continue // reject at load, never at runtime
    }
    valid.push(kits[i] as KitDefinition)
  }
  return valid
}

// Sample fallback: if a sample asset fails to resolve, fall back to synthesis-
// only (sample.gain -> 0) and bump sampleFallbacks. Never silent (the synth body
// still plays), never throws.
export function applySampleFallback(patch: DrumPatch, counters: DrumCounters): void {
  if (patch.sample != null && patch.sample.assetId != null) {
    patch.sample.gain = 0
    counters.sampleFallbacks = counters.sampleFallbacks + 1
  }
}
