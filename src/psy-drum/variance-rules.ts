// PSYDRUM variance rules — determinism (phase 8).
//
// Everything that is ALLOWED to vary is driven by ONE seeded mulberry32 PRNG.
// The seed is (kit manifest seed) XOR (opts.seed, default 1), so the same
// (seed, kit, event stream, sampleRate) ALWAYS yields a bit-identical render
// (the render-proof invariant).
//
// ALLOWED to vary (seeded): velocity micro-humanize (+-3% when kit.humanize),
// per-hit tone/brightness variance, round-robin variant selection, clap tap
// jitter.
//
// NEVER varies (deterministic by construction, NOT touched here): pitch
// mapping, choke logic, drop policy, role routing, kit selection.

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

// Deterministic 32-bit PRNG. Same seed => identical sequence, always.
export function mulberry32(seed: number): () => number {
  var a = seed >>> 0
  return function (): number {
    a = (a + 0x6d2b79f5) | 0
    var t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Combined device seed = (kit manifest seed) XOR (opts.seed, default 1).
export const DEFAULT_OPTS_SEED = 1

export function combineSeeds(kitSeed: number, optsSeed: number): number {
  const kit = toUint32(Number.isFinite(kitSeed) ? kitSeed : 0)
  const opts = toUint32(Number.isFinite(optsSeed) ? optsSeed : DEFAULT_OPTS_SEED)
  return (kit ^ opts) >>> 0
}

function toUint32(v: number): number {
  return Math.floor(v) >>> 0
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// ─── Allowed variance (all seeded via the injected rng) ──────────────────────

export const VELOCITY_HUMANIZE_DEPTH = 0.03 // +-3%

// Velocity micro-humanize: a multiplier in [1-depth, 1+depth] (i.e. +-3%).
export function velocityHumanize(rng: () => number, depth: number = VELOCITY_HUMANIZE_DEPTH): number {
  const d = clamp01(depth)
  return 1 + (rng() * 2 - 1) * d
}

// Per-hit tone/brightness variance: multiplier around 1, scaled by amount 0..1.
export function timbreVariance(rng: () => number, amount: number): number {
  const amt = clamp01(amount)
  return 1 + (rng() * 2 - 1) * amt
}

// Round-robin variant selection: cycles 0..numVariants-1 from a per-drum hit
// counter (anti machine-gun). Pure; the caller owns the counter.
export function roundRobinVariant(hitCounter: number, numVariants: number): number {
  if (numVariants <= 0) return 0
  const n = Math.floor(numVariants)
  return ((Math.floor(hitCounter) % n) + n) % n
}

// Clap multi-tap jitter: signed jitter in milliseconds within +-maxJitterMs.
export function clapTapJitter(rng: () => number, maxJitterMs: number): number {
  const max = Math.max(0, maxJitterMs)
  return (rng() * 2 - 1) * max
}

// ─── Convenience: a seeded variance source ───────────────────────────────────

export interface VarianceSource {
  seed: number
  rng: () => number
}

// Create the single seeded variance source for a device instance.
export function createVarianceSource(kitSeed: number, optsSeed: number): VarianceSource {
  const seed = combineSeeds(kitSeed, optsSeed)
  return { seed: seed, rng: mulberry32(seed) }
}
