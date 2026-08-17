// Phase 9 tests — MIDI note map (overridable data) + CC table + learn flow.
// No WebMIDI anywhere: everything is data + pure state transitions.

import { describe, it, expect } from 'bun:test'
import {
  DEFAULT_DRUM_NOTE_MAP,
  noteToRole,
  DRUM_PARAMS,
  isDrumParam,
  createCcTable,
  isValidCcNumber,
  bindCc,
  unbindCc,
  findBindingByCc,
  createLearnState,
  armLearn,
  disarmLearn,
  learnCc,
} from '../../src/psy-drum/midi-map'
import type { CcBinding } from '../../src/psy-drum/midi-map'

describe('drum MIDI note map (GM-style, overridable)', () => {
  it('maps the canonical GM drum notes', () => {
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 36)).toBe('kick')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 38)).toBe('snare')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 39)).toBe('clap')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 42)).toBe('hat-closed')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 46)).toBe('hat-open')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 45)).toBe('tom')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 48)).toBe('tom')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 49)).toBe('crash')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 57)).toBe('crash')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 51)).toBe('ride')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 33)).toBe('perc')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 34)).toBe('perc')
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 56)).toBe('perc')
  })

  it('returns null for unmapped and non-finite notes', () => {
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 100)).toBeNull()
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, 0)).toBeNull()
    expect(noteToRole(DEFAULT_DRUM_NOTE_MAP, Number.NaN)).toBeNull()
  })

  it('is overridable with a custom map', () => {
    const custom: Record<number, 'kick' | 'snare'> = { 60: 'snare', 62: 'kick' }
    expect(noteToRole(custom, 60)).toBe('snare')
    expect(noteToRole(custom, 62)).toBe('kick')
    expect(noteToRole(custom, 36)).toBeNull()
  })
})

describe('drum params', () => {
  it('exposes the addressable drum parameters', () => {
    expect(DRUM_PARAMS).toContain('tune')
    expect(DRUM_PARAMS).toContain('decay')
    expect(DRUM_PARAMS).toContain('tone')
    expect(DRUM_PARAMS).toContain('noiseMix')
    expect(DRUM_PARAMS).toContain('level')
  })

  it('isDrumParam validates', () => {
    expect(isDrumParam('tune')).toBe(true)
    expect(isDrumParam('level')).toBe(true)
    expect(isDrumParam('bogus')).toBe(false)
  })
})

describe('CC binding table', () => {
  const b1: CcBinding = { cc: 20, drum: 'kick', param: 'tune' }
  const b2: CcBinding = { cc: 21, drum: 'snare', param: 'decay' }

  it('isValidCcNumber accepts 0..127 only', () => {
    expect(isValidCcNumber(0)).toBe(true)
    expect(isValidCcNumber(127)).toBe(true)
    expect(isValidCcNumber(128)).toBe(false)
    expect(isValidCcNumber(-1)).toBe(false)
    expect(isValidCcNumber(Number.NaN)).toBe(false)
  })

  it('bindCc adds a binding and findBindingByCc retrieves it', () => {
    let table = createCcTable()
    table = bindCc(table, b1)
    expect(table.length).toBe(1)
    expect(findBindingByCc(table, 20)).toEqual(b1)
    expect(findBindingByCc(table, 99)).toBeNull()
  })

  it('bindCc replaces an existing binding for the same CC', () => {
    let table = createCcTable()
    table = bindCc(table, b1)
    table = bindCc(table, { cc: 20, drum: 'snare', param: 'tone' })
    expect(table.length).toBe(1)
    expect(findBindingByCc(table, 20)?.drum).toBe('snare')
  })

  it('bindCc replaces an existing binding for the same drum+param', () => {
    let table = createCcTable()
    table = bindCc(table, b1) // kick.tune on cc 20
    table = bindCc(table, { cc: 30, drum: 'kick', param: 'tune' }) // rebind kick.tune to cc 30
    expect(table.length).toBe(1)
    expect(findBindingByCc(table, 20)).toBeNull()
    expect(findBindingByCc(table, 30)?.param).toBe('tune')
  })

  it('bindCc does not mutate the input table', () => {
    const table = createCcTable()
    const after = bindCc(table, b1)
    expect(table.length).toBe(0)
    expect(after.length).toBe(1)
    expect(after).not.toBe(table)
  })

  it('unbindCc removes a binding by CC', () => {
    let table = bindCc(createCcTable(), b1)
    table = bindCc(table, b2)
    table = unbindCc(table, 20)
    expect(table.length).toBe(1)
    expect(findBindingByCc(table, 20)).toBeNull()
    expect(findBindingByCc(table, 21)).toEqual(b2)
  })
})

describe('MIDI-learn flow (device state only)', () => {
  it('starts disarmed', () => {
    const s = createLearnState()
    expect(s.armed).toBe(false)
    expect(s.targetDrum).toBeNull()
    expect(s.targetParam).toBeNull()
  })

  it('armLearn arms for a target drum+param', () => {
    const s = createLearnState()
    armLearn(s, 'kick', 'tune')
    expect(s.armed).toBe(true)
    expect(s.targetDrum).toBe('kick')
    expect(s.targetParam).toBe('tune')
  })

  it('a CC arriving while armed binds and disarms', () => {
    const s = createLearnState()
    armLearn(s, 'snare', 'decay')
    const result = learnCc(s, createCcTable(), 21)
    expect(result.learned).toBe(true)
    expect(result.table.length).toBe(1)
    expect(result.table[0]).toEqual({ cc: 21, drum: 'snare', param: 'decay' })
    expect(s.armed).toBe(false) // auto-disarm after learn
  })

  it('a CC arriving while NOT armed leaves the table unchanged', () => {
    const s = createLearnState()
    const table = createCcTable()
    const result = learnCc(s, table, 21)
    expect(result.learned).toBe(false)
    expect(result.table).toBe(table)
    expect(result.table.length).toBe(0)
  })

  it('an invalid CC while armed does not bind', () => {
    const s = createLearnState()
    armLearn(s, 'kick', 'level')
    const result = learnCc(s, createCcTable(), 200) // > 127
    expect(result.learned).toBe(false)
    expect(result.table.length).toBe(0)
    expect(s.armed).toBe(true) // stays armed waiting for a valid CC
  })

  it('disarmLearn clears the armed state', () => {
    const s = createLearnState()
    armLearn(s, 'ride', 'tone')
    disarmLearn(s)
    expect(s.armed).toBe(false)
    expect(s.targetDrum).toBeNull()
    expect(s.targetParam).toBeNull()
  })
})
