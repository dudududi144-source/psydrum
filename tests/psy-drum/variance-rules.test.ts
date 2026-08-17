// Phase 8 tests — variance rules (determinism).
// The render-proof invariant rests on the PRNG being fully seeded and
// deterministic: same seed => identical sequence. Every allowed-variance
// function is asserted for range and determinism here.

import { describe, it, expect } from 'bun:test'
import {
  mulberry32,
  combineSeeds,
  DEFAULT_OPTS_SEED,
  velocityHumanize,
  timbreVariance,
  roundRobinVariant,
  clapTapJitter,
  createVarianceSource,
  VELOCITY_HUMANIZE_DEPTH,
} from '../../src/psy-drum/variance-rules'

function take(rng: () => number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(rng())
  return out
}

describe('mulberry32 (seeded, deterministic)', () => {
  it('same seed yields an identical sequence', () => {
    const a = take(mulberry32(42), 16)
    const b = take(mulberry32(42), 16)
    expect(a).toEqual(b)
  })

  it('different seeds yield different sequences', () => {
    const a = take(mulberry32(1), 16)
    const b = take(mulberry32(2), 16)
    expect(a).not.toEqual(b)
  })

  it('outputs are in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('combineSeeds (kit XOR opts)', () => {
  it('XORs the kit and opts seeds', () => {
    expect(combineSeeds(0b1100, 0b1010)).toBe(0b1100 ^ 0b1010)
  })

  it('uses the default opts seed (1) for non-finite input', () => {
    expect(combineSeeds(5, Number.NaN)).toBe((5 ^ DEFAULT_OPTS_SEED) >>> 0)
    expect(DEFAULT_OPTS_SEED).toBe(1)
  })

  it('treats non-finite kit seed as 0', () => {
    expect(combineSeeds(Number.NaN, 3)).toBe((0 ^ 3) >>> 0)
  })

  it('is always an unsigned 32-bit value', () => {
    const s = combineSeeds(4294967295, 4294967295)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('velocity micro-humanize (+-3%)', () => {
  it('stays within [1-depth, 1+depth]', () => {
    const rng = mulberry32(9)
    for (let i = 0; i < 1000; i++) {
      const v = velocityHumanize(rng)
      expect(v).toBeGreaterThanOrEqual(1 - VELOCITY_HUMANIZE_DEPTH - 1e-9)
      expect(v).toBeLessThanOrEqual(1 + VELOCITY_HUMANIZE_DEPTH + 1e-9)
    }
  })

  it('respects a custom depth', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const v = velocityHumanize(rng, 0.1)
      expect(v).toBeGreaterThanOrEqual(0.9 - 1e-9)
      expect(v).toBeLessThanOrEqual(1.1 + 1e-9)
    }
  })

  it('is deterministic for a given seed', () => {
    expect(velocityHumanize(mulberry32(5))).toBe(velocityHumanize(mulberry32(5)))
  })
})

describe('per-hit timbre variance', () => {
  it('stays around 1, scaled by amount', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 500; i++) {
      const v = timbreVariance(rng, 0.2)
      expect(v).toBeGreaterThanOrEqual(0.8 - 1e-9)
      expect(v).toBeLessThanOrEqual(1.2 + 1e-9)
    }
  })

  it('amount 0 means no variance', () => {
    const rng = mulberry32(13)
    expect(timbreVariance(rng, 0)).toBe(1)
  })
})

describe('round-robin variant selection', () => {
  it('cycles through variants in order', () => {
    const seen: number[] = []
    for (let hit = 0; hit < 6; hit++) seen.push(roundRobinVariant(hit, 3))
    expect(seen).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('handles a single variant and zero variants', () => {
    expect(roundRobinVariant(0, 1)).toBe(0)
    expect(roundRobinVariant(5, 1)).toBe(0)
    expect(roundRobinVariant(5, 0)).toBe(0)
  })

  it('never returns a negative index for negative counters', () => {
    expect(roundRobinVariant(-1, 3)).toBeGreaterThanOrEqual(0)
    expect(roundRobinVariant(-1, 3)).toBeLessThan(3)
  })
})

describe('clap tap jitter', () => {
  it('stays within +-maxJitterMs', () => {
    const rng = mulberry32(17)
    for (let i = 0; i < 500; i++) {
      const j = clapTapJitter(rng, 2.5)
      expect(j).toBeGreaterThanOrEqual(-2.5 - 1e-9)
      expect(j).toBeLessThanOrEqual(2.5 + 1e-9)
    }
  })

  it('zero max means zero jitter', () => {
    const rng = mulberry32(19)
    expect(clapTapJitter(rng, 0)).toBe(0)
  })
})

describe('createVarianceSource (render-proof seeding)', () => {
  it('produces a reproducible stream for the same (kit, opts) seeds', () => {
    const a = createVarianceSource(123, 7)
    const b = createVarianceSource(123, 7)
    expect(a.seed).toBe(b.seed)
    expect(take(a.rng, 32)).toEqual(take(b.rng, 32))
  })

  it('different opts seeds diverge', () => {
    const a = createVarianceSource(123, 7)
    const b = createVarianceSource(123, 8)
    expect(a.seed).not.toBe(b.seed)
    expect(take(a.rng, 16)).not.toEqual(take(b.rng, 16))
  })
})
