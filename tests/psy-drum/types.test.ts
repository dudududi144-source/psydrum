// Phase 2 tests — canonical drum types (audit B10 role taxonomy, the B1 fix).

import { describe, it, expect } from 'bun:test'
import {
  DRUM_ROLES,
  PITCHED_ROLES,
  isDrumRole,
  isPitchedRole,
  DEFAULT_ROLE_CAPS,
  defaultDrumConfig,
  createVoiceState,
} from '../../src/psy-drum/types'

const CANONICAL = [
  'kick',
  'snare',
  'clap',
  'hat-closed',
  'hat-open',
  'tom',
  'perc',
  'ride',
  'crash',
]

describe('canonical drum roles (audit B10)', () => {
  it('DRUM_ROLES advertises EXACTLY the canonical set, in order', () => {
    expect([...DRUM_ROLES]).toEqual(CANONICAL)
    expect(DRUM_ROLES.length).toBe(9)
  })

  it('exposes hat-closed / hat-open, NOT a single "hat"', () => {
    expect(DRUM_ROLES).toContain('hat-closed')
    expect(DRUM_ROLES).toContain('hat-open')
    expect(DRUM_ROLES).not.toContain('hat')
  })

  it('isDrumRole accepts canonical roles and rejects others', () => {
    expect(isDrumRole('kick')).toBe(true)
    expect(isDrumRole('hat-open')).toBe(true)
    expect(isDrumRole('crash')).toBe(true)
    expect(isDrumRole('hat')).toBe(false)
    expect(isDrumRole('bass')).toBe(false)
    expect(isDrumRole('')).toBe(false)
  })
})

describe('pitch semantics (the B1 fix)', () => {
  it('pitched roles are exactly tom and ride', () => {
    expect([...PITCHED_ROLES]).toEqual(['tom', 'ride'])
  })

  it('isPitchedRole marks only tom/ride as pitched', () => {
    expect(isPitchedRole('tom')).toBe(true)
    expect(isPitchedRole('ride')).toBe(true)
    expect(isPitchedRole('kick')).toBe(false)
    expect(isPitchedRole('snare')).toBe(false)
    expect(isPitchedRole('hat-open')).toBe(false)
    expect(isPitchedRole('crash')).toBe(false)
  })
})

describe('drum config and role caps', () => {
  it('defaultDrumConfig matches the architecture defaults', () => {
    const cfg = defaultDrumConfig()
    expect(cfg.voices).toBe(16)
    expect(cfg.seed).toBe(1)
    expect(cfg.humanize).toBe(true)
    expect(cfg.choke.hat).toBe('exclusive')
    expect(cfg.choke.crashMaxPoly).toBe(2)
    expect(cfg.choke.rideMaxPoly).toBe(2)
  })

  it('DEFAULT_ROLE_CAPS covers every canonical role with a positive cap', () => {
    for (const role of DRUM_ROLES) {
      const cap = DEFAULT_ROLE_CAPS[role]
      expect(cap).toBeGreaterThan(0)
    }
  })
})

describe('voice state', () => {
  it('createVoiceState returns an idle, unassigned voice', () => {
    const v = createVoiceState(3)
    expect(v.index).toBe(3)
    expect(v.active).toBe(false)
    expect(v.role).toBeNull()
    expect(v.channel).toBe('')
    expect(v.onsetAt).toBe(0)
    expect(v.releasedAt).toBe(0)
    expect(v.gain).toBe(0)
  })

  it('createVoiceState gives each index a distinct object', () => {
    const a = createVoiceState(0)
    const b = createVoiceState(1)
    a.active = true
    expect(b.active).toBe(false)
    expect(a).not.toBe(b)
  })
})
