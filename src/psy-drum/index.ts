// PSYDRUM public barrel + factory (phase 10, ARCHITECTURE.md module map).
//
// createDrumDevice(opts) -> { device, load, dispose }
//   device  : the DrumDevice (implements the canonical PsyDevice contract)
//   load    : validates a kit manifest (reject-at-load) and applies the kit
//             that matches the current MusicalContext style (first match);
//             never throws, counts kitLoadErrors on bad input.
//   dispose : suspend-safe teardown (fast-release + disconnect).
//
// Re-exports the drum-public types so a host imports one module.

import { DrumDevice } from './device'
import type { DrumDeviceOptions } from './device'
import { loadKitManifest } from './kit-library'
import type { KitDefinition } from './kit-library'

export interface CreateDrumDeviceResult {
  device: DrumDevice
  load: (manifest: unknown) => number
  dispose: () => void
}

export function createDrumDevice(opts: DrumDeviceOptions): CreateDrumDeviceResult {
  const device = new DrumDevice(opts)

  // Validate the manifest (reject-at-load) and apply the first valid kit.
  // Returns how many kits were accepted (0 means nothing was applied).
  const load = function (manifest: unknown): number {
    const counters = device.getCounters()
    const kits: KitDefinition[] = loadKitManifest(manifest, counters)
    if (kits.length > 0) device.loadKit(kits[0])
    return kits.length
  }

  const dispose = function (): void {
    device.onStop()
  }

  return { device: device, load: load, dispose: dispose }
}

export { DrumDevice } from './device'
export type { DrumDeviceOptions } from './device'
export { loadKitManifest } from './kit-library'
export type { KitManifest, KitDefinition } from './kit-library'
export { DRUM_ROLES } from './types'
export type { DrumRole, DrumPatch, DrumConfig } from './types'

export { DEFAULT_PSY_KIT } from './default-kit'

export { BUILTIN_KIT_MANIFEST } from './kit-builtin'

export { renderDrumSample } from './sample-gen'
