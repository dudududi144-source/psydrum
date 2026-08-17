// Phase 3 tests — note-router routing table (ARCHITECTURE.md section 3.3) and
// the B1 fix (unpitched drums ignore note for pitch).

import { describe, it, expect } from 'bun:test'
import {
  routeNote,
  canonicalRoutingTable,
  STALE_WINDOW_MS,
} from '../../src/psy-drum/note-router'
import type { NoteEvent } from '../../src/psy-foundation-shim/protocol'

const NOW = 1.0
const table = canonicalRoutingTable()

function ev(channel: string, velocity: number, note: number, at: number): NoteEvent {
  return { type: 'note', note: note, velocity: velocity, duration: 1, channel: channel, at: at }
}

describe('note router - on decisions', () => {
  it('velocity>0 unpitched drum routes to a one-shot on with pitch null', () => {
    const d = routeNote(ev('kick', 0.8, 36, NOW), NOW, table)
    expect(d.type).toBe('on')
    if (d.type === 'on') {
      expect(d.role).toBe('kick')
      expect(d.pitched).toBe(false)
      expect(d.pitch).toBeNull()
      expect(d.velocity).toBe(0.8)
      expect(d.at).toBe(NOW)
    }
  })

  it('velocity>0 pitched drum (tom) carries a pitch hint', () => {
    const d = routeNote(ev('tom', 0.7, 50, NOW), NOW, table)
    expect(d.type).toBe('on')
    if (d.type === 'on') {
      expect(d.role).toBe('tom')
      expect(d.pitched).toBe(true)
      expect(d.pitch).toBe(50)
    }
  })

  it('velocity>0 pitched drum (ride) carries a pitch hint', () => {
    const d = routeNote(ev('ride', 0.5, 72, NOW), NOW, table)
    expect(d.type).toBe('on')
    if (d.type === 'on') {
      expect(d.pitched).toBe(true)
      expect(d.pitch).toBe(72)
    }
  })

  it('unpitched drums IGNORE note for pitch (the B1 fix)', () => {
    const d = routeNote(ev('snare', 0.9, 99, NOW), NOW, table)
    expect(d.type).toBe('on')
    if (d.type === 'on') {
      expect(d.pitched).toBe(false)
      expect(d.pitch).toBeNull()
    }
  })
})

describe('note router - off decisions', () => {
  it('velocity==0 routes to note-off with the channel', () => {
    const d = routeNote(ev('hat-open', 0, 46, NOW), NOW, table)
    expect(d.type).toBe('off')
    if (d.type === 'off') {
      expect(d.role).toBe('hat-open')
      expect(d.channel).toBe('hat-open')
      expect(d.at).toBe(NOW)
    }
  })
})

describe('note router - drops', () => {
  it('unknown channel drops with unknown-channel reason', () => {
    const d = routeNote(ev('bass', 0.8, 60, NOW), NOW, table)
    expect(d.type).toBe('drop')
    if (d.type === 'drop') expect(d.reason).toBe('unknown-channel')
  })

  it('stale event (older than the window) drops with stale reason', () => {
    var staleAt = NOW - STALE_WINDOW_MS / 1000 - 0.001
    const d = routeNote(ev('kick', 0.8, 36, staleAt), NOW, table)
    expect(d.type).toBe('drop')
    if (d.type === 'drop') expect(d.reason).toBe('stale')
  })

  it('event exactly at the stale boundary is NOT stale', () => {
    var boundaryAt = NOW - STALE_WINDOW_MS / 1000
    const d = routeNote(ev('kick', 0.8, 36, boundaryAt), NOW, table)
    expect(d.type).toBe('on')
  })

  it('future event is not stale', () => {
    const d = routeNote(ev('kick', 0.8, 36, NOW + 0.5), NOW, table)
    expect(d.type).toBe('on')
  })

  it('pitched drum with out-of-range pitch drops with invalid-event', () => {
    const high = routeNote(ev('tom', 0.7, 200, NOW), NOW, table)
    expect(high.type).toBe('drop')
    if (high.type === 'drop') expect(high.reason).toBe('invalid-event')

    const low = routeNote(ev('tom', 0.7, -5, NOW), NOW, table)
    expect(low.type).toBe('drop')
    if (low.type === 'drop') expect(low.reason).toBe('invalid-event')
  })

  it('unpitched drum with out-of-range note still routes (note ignored)', () => {
    const d = routeNote(ev('kick', 0.8, 999, NOW), NOW, table)
    expect(d.type).toBe('on')
    if (d.type === 'on') expect(d.pitch).toBeNull()
  })
})

describe('note router - routing table', () => {
  it('canonicalRoutingTable routes every canonical role to itself', () => {
    const roles = [
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
    for (const role of roles) {
      expect(table.get(role)).toBe(role)
    }
    expect(table.size).toBe(9)
  })

  it('a custom table can restrict routing (kit-provided data)', () => {
    const small = new Map<string, 'kick'>([['kick', 'kick']])
    const okHit = routeNote(ev('kick', 0.8, 36, NOW), NOW, small)
    expect(okHit.type).toBe('on')
    const miss = routeNote(ev('snare', 0.8, 38, NOW), NOW, small)
    expect(miss.type).toBe('drop')
    if (miss.type === 'drop') expect(miss.reason).toBe('unknown-channel')
  })
})
