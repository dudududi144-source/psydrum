// Phase 4 tests — choke-group state machine + choke-latency budget.

import { describe, it, expect } from 'bun:test'
import {
  createChokeState,
  resetChokeState,
  decideChoke,
  applyTrigger,
  applyRelease,
  applyChokeDecision,
  totalChokes,
  emptyChokeDecision,
  CHOKE_TARGET_GAIN,
  CHOKE_LATENCY_BUDGET_MS,
  CHOKE_DURATION_MS,
  chokeReleaseGain,
} from '../../src/psy-drum/choke'
import { defaultDrumConfig } from '../../src/psy-drum/types'
import type { KitChokeConfig } from '../../src/psy-drum/types'

const EXCLUSIVE: KitChokeConfig = { hat: 'exclusive', crashMaxPoly: 2, rideMaxPoly: 2 }
const HAT_NONE: KitChokeConfig = { hat: 'none', crashMaxPoly: 2, rideMaxPoly: 2 }

describe('hat exclusive pair', () => {
  it('an open hat chokes every active closed hat', () => {
    const s = createChokeState()
    applyTrigger(s, 'hat-closed')
    applyTrigger(s, 'hat-closed')
    expect(s.hatClosedOn).toBe(2)

    const d = decideChoke(s, 'hat-open', EXCLUSIVE)
    expect(d.chokeHatClosed).toBe(2)
    expect(d.chokeHatOpen).toBe(0)
    expect(totalChokes(d)).toBe(2)

    applyChokeDecision(s, d)
    applyTrigger(s, 'hat-open')
    expect(s.hatClosedOn).toBe(0)
    expect(s.hatOpenOn).toBe(1)
  })

  it('a closed hat chokes every active open hat', () => {
    const s = createChokeState()
    applyTrigger(s, 'hat-open')
    const d = decideChoke(s, 'hat-closed', EXCLUSIVE)
    expect(d.chokeHatOpen).toBe(1)
    expect(d.chokeHatClosed).toBe(0)
  })

  it('hat=none disables hat choking', () => {
    const s = createChokeState()
    applyTrigger(s, 'hat-closed')
    const d = decideChoke(s, 'hat-open', HAT_NONE)
    expect(totalChokes(d)).toBe(0)
  })

  it('a hat with no counterpart active chokes nothing', () => {
    const s = createChokeState()
    const d = decideChoke(s, 'hat-open', EXCLUSIVE)
    expect(totalChokes(d)).toBe(0)
  })
})

describe('crash / ride self-choke', () => {
  it('crash chokes the oldest once at crashMaxPoly', () => {
    const s = createChokeState()
    applyTrigger(s, 'crash')
    applyTrigger(s, 'crash')
    expect(s.crashOn).toBe(2)

    // Third crash while two ring: choke one to stay at max-poly 2.
    const d = decideChoke(s, 'crash', EXCLUSIVE)
    expect(d.chokeCrash).toBe(1)
    applyChokeDecision(s, d)
    applyTrigger(s, 'crash')
    expect(s.crashOn).toBe(2)
  })

  it('crash under the cap chokes nothing', () => {
    const s = createChokeState()
    applyTrigger(s, 'crash')
    const d = decideChoke(s, 'crash', EXCLUSIVE)
    expect(d.chokeCrash).toBe(0)
  })

  it('ride self-chokes at rideMaxPoly', () => {
    const s = createChokeState()
    applyTrigger(s, 'ride')
    applyTrigger(s, 'ride')
    const d = decideChoke(s, 'ride', EXCLUSIVE)
    expect(d.chokeRide).toBe(1)
  })

  it('a higher crashMaxPoly postpones the choke', () => {
    const s = createChokeState()
    const cfg: KitChokeConfig = { hat: 'exclusive', crashMaxPoly: 3, rideMaxPoly: 2 }
    applyTrigger(s, 'crash')
    applyTrigger(s, 'crash')
    applyTrigger(s, 'crash')
    const d = decideChoke(s, 'crash', cfg)
    expect(d.chokeCrash).toBe(1) // 4th crash over max-poly 3
  })
})

describe('non-choking roles', () => {
  it('kick/snare/clap/tom/perc never choke anything', () => {
    const s = createChokeState()
    applyTrigger(s, 'crash')
    applyTrigger(s, 'hat-open')
    for (const role of ['kick', 'snare', 'clap', 'tom', 'perc'] as const) {
      const d = decideChoke(s, role, EXCLUSIVE)
      expect(totalChokes(d)).toBe(0)
    }
  })
})

describe('choke state bookkeeping', () => {
  it('applyRelease decrements but never below zero', () => {
    const s = createChokeState()
    applyRelease(s, 'crash')
    expect(s.crashOn).toBe(0)
    applyTrigger(s, 'crash')
    applyRelease(s, 'crash')
    expect(s.crashOn).toBe(0)
  })

  it('resetChokeState zeroes all groups', () => {
    const s = createChokeState()
    applyTrigger(s, 'hat-open')
    applyTrigger(s, 'crash')
    resetChokeState(s)
    expect(s.hatOpenOn).toBe(0)
    expect(s.crashOn).toBe(0)
  })

  it('emptyChokeDecision has zero total', () => {
    expect(totalChokes(emptyChokeDecision())).toBe(0)
  })
})

describe('choke latency budget', () => {
  it('choke ramp duration is inside the 3ms budget', () => {
    expect(CHOKE_DURATION_MS).toBeLessThan(CHOKE_LATENCY_BUDGET_MS)
  })

  it('a choked voice reaches -60dB within the budget', () => {
    // At the budget boundary the gain is at/below the -60dB target.
    expect(chokeReleaseGain(CHOKE_LATENCY_BUDGET_MS, CHOKE_DURATION_MS)).toBeLessThanOrEqual(CHOKE_TARGET_GAIN)
  })

  it('the choke ramp starts at full gain and settles at the target', () => {
    expect(chokeReleaseGain(0, CHOKE_DURATION_MS)).toBe(1)
    expect(chokeReleaseGain(CHOKE_DURATION_MS, CHOKE_DURATION_MS)).toBe(CHOKE_TARGET_GAIN)
    expect(chokeReleaseGain(100, CHOKE_DURATION_MS)).toBe(CHOKE_TARGET_GAIN)
  })

  it('the ramp is monotonic downward', () => {
    let prev = chokeReleaseGain(0, CHOKE_DURATION_MS)
    for (let t = 0.5; t <= CHOKE_DURATION_MS; t += 0.5) {
      const g = chokeReleaseGain(t, CHOKE_DURATION_MS)
      expect(g).toBeLessThanOrEqual(prev)
      prev = g
    }
  })
})
