// Extraction tests - StepSequencer (library-grade, DOM-free).

import { describe, it, expect } from 'bun:test'
import { StepSequencer } from '../../src/psy-drum/sequencer'

describe('StepSequencer (extraction)', () => {
  it('defaults to 16 steps', () => {
    const s = new StepSequencer()
    expect(s.steps).toBe(16)
  })

  it('setRows creates empty rows', () => {
    const s = new StepSequencer()
    s.setRows(9)
    const p = s.getPattern()
    expect(p.length).toBe(9)
    expect(p[0].length).toBe(16)
    expect(p[0].every(v => v === false)).toBe(true)
  })

  it('toggle flips a cell', () => {
    const s = new StepSequencer()
    s.setRows(9)
    expect(s.toggle(0, 0)).toBe(true)
    expect(s.toggle(0, 0)).toBe(false)
  })

  it('set/clear work', () => {
    const s = new StepSequencer()
    s.setRows(2)
    s.set(0, 5, true)
    expect(s.getPattern()[0][5]).toBe(true)
    s.clear()
    expect(s.getPattern()[0][5]).toBe(false)
  })

  it('loadSteps loads a pattern', () => {
    const s = new StepSequencer()
    s.loadSteps([[0, 4, 8, 12], [4, 12]], 9)
    const p = s.getPattern()
    expect(p[0][0]).toBe(true)
    expect(p[0][4]).toBe(true)
    expect(p[1][4]).toBe(true)
    expect(p[2][0]).toBe(false)
  })

  it('tick advances and wraps', () => {
    const s = new StepSequencer({ steps: 4 })
    s.setRows(1)
    s.start()
    expect(s.tick()).toBe(0)
    expect(s.tick()).toBe(1)
    expect(s.tick()).toBe(2)
    expect(s.tick()).toBe(3)
    expect(s.tick()).toBe(0) // wrap
  })

  it('tick returns -1 when not playing', () => {
    const s = new StepSequencer()
    s.setRows(1)
    expect(s.tick()).toBe(-1)
  })

  it('activeRowsAt returns the active rows', () => {
    const s = new StepSequencer()
    s.setRows(3)
    s.set(0, 2, true)
    s.set(2, 2, true)
    const active = s.activeRowsAt(2)
    expect(active).toContain(0)
    expect(active).toContain(2)
    expect(active).not.toContain(1)
  })

  it('stop halts ticking', () => {
    const s = new StepSequencer()
    s.setRows(1)
    s.start()
    s.tick()
    s.stop()
    expect(s.isPlaying()).toBe(false)
    expect(s.tick()).toBe(-1)
  })
})
