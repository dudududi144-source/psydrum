// Extraction tests - MotionRecorder (library-grade, DOM-free).

import { describe, it, expect } from 'bun:test'
import { MotionRecorder } from '../../src/psy-drum/motion'

describe('MotionRecorder (extraction)', () => {
  it('defaults to 16 steps', () => {
    const m = new MotionRecorder()
    expect(m.steps).toBe(16)
  })

  it('does not record when not recording', () => {
    const m = new MotionRecorder()
    m.record('drive', 0, 0.5)
    m.startPlayback()
    expect(m.valueAt('drive', 0)).toBeNull()
  })

  it('records values while recording', () => {
    const m = new MotionRecorder()
    m.registerParam('drive')
    m.startRecording()
    m.record('drive', 2, 0.7)
    m.stopRecording()
    m.startPlayback()
    expect(m.valueAt('drive', 2)).toBe(0.7)
  })

  it('valueAt wraps the step index', () => {
    const m = new MotionRecorder(4)
    m.registerParam('drive')
    m.startRecording()
    m.record('drive', 1, 0.9)
    m.stopRecording()
    m.startPlayback()
    expect(m.valueAt('drive', 5)).toBe(0.9) // 5 % 4 == 1
  })

  it('valueAt returns null when not playing', () => {
    const m = new MotionRecorder()
    m.registerParam('drive')
    m.startRecording()
    m.record('drive', 0, 0.5)
    m.stopRecording()
    // not playing
    expect(m.valueAt('drive', 0)).toBeNull()
  })

  it('clear removes recorded data', () => {
    const m = new MotionRecorder()
    m.registerParam('drive')
    m.startRecording()
    m.record('drive', 0, 0.5)
    m.clear()
    m.startPlayback()
    expect(m.valueAt('drive', 0)).toBeNull()
  })

  it('auto-registers a param on first record', () => {
    const m = new MotionRecorder()
    m.startRecording()
    m.record('reverb', 3, 0.2)
    m.stopRecording()
    m.startPlayback()
    expect(m.valueAt('reverb', 3)).toBe(0.2)
  })
})
