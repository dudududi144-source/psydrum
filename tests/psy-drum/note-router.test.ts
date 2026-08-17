// Phase 3 tests — note router: routing table, drop reasons, and the B1 fix
// (unpitched drums never receive a pitch hint, and there is no fallback pitch).

import { describe, it, expect } from 'bun:test'
import {
  routeNoteEvent,
  resolveRole,
  makeChannelResolver,
  DEFAULT_ROUTING_TABLE,
  STALE_WINDOW_SEC,
  MIN_NOTE,
  MAX_NOTE,
} from '../../src/psy-drum/note-router'
import type { RouteContext } from '../../src/psy-drum/note-router'
import type { NoteEvent } from '../../src/psy-foundation-shim/protocol'

function ctx(nowSec = 1.0): RouteContext {
  return {
    nowSec: nowSec,
    staleWindowSec: STALE_WINDOW_SEC,
    resolveChannel: makeChannelResolver(DEFAULT_ROUTING_TABLE),
  }
}

function ev(overrides: Partial<NoteEvent> = {}): NoteEvent {
  return {
    type: 'note',
    note: 60,
    velocity: 100,
    duration: 0.1,
    channel: 'kick',
    at: 1.0,
    ...overrides,
  }
}

describe('routing table', () => {
  it('DEFAULT_ROUTING_TABLE reaches every canonical role under its own name', () => {
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
    for (const r of roles) {
      expect(resolveRole(DEFAULT_ROUTING_TABLE, r)).toBe(r)
    }
  })

  it('resolveRole returns null for unknown channels', () => {
    expect(resolveRole(DEFAULT_ROUTING_TABLE, 'bass')).toBeNull()
    expect(resolveRole(DEFAULT_ROUTING_TABLE, 'hat')).toBeNull()
    expect(resolveRole(DEFAULT_ROUTING_TABLE, '')).toBeNull()
  })
})

describe('trigger routing', () => {
  it('unpitched drum with velocity>0 triggers with pitch=null (B1 fix)', () => {
    const d = routeNoteEvent(ev({ channel: 'kick', note: 60 }), ctx())
    expect(d.kind).toBe('trigger')
    if (d.kind === 'trigger') {
      expect(d.role).toBe('kick')
      expect(d.pitch).toBeNull() // note is NOT used for pitch, no fallback
      expect(d.velocity).toBe(100)
    }
  })

  it('pitched drum (tom) carries the note as a pitch hint', () => {
    const d = routeNoteEvent(ev({ channel: 'tom', note: 62 }), ctx())
    expect(d.kind).toBe('trigger')
    if (d.kind === 'trigger') {
      expect(d.role).toBe('tom')
      expect(d.pitch).toBe(62)
    }
  })

  it('pitched drum (ride) carries the note as a pitch hint', () => {
    const d = routeNoteEvent(ev({ channel: 'ride', note: 66 }), ctx())
    if (d.kind === 'trigger') expect(d.pitch).toBe(66)
    else expect(true).toBe(false)
  })

  it('snare/clap/hats/perc/crash all trigger with pitch=null', () => {
    const unpitched = ['snare', 'clap', 'hat-closed', 'hat-open', 'perc', 'crash']
    for (const ch of unpitched) {
      const d = routeNoteEvent(ev({ channel: ch, note: 72 }), ctx())
      expect(d.kind).toBe('trigger')
      if (d.kind === 'trigger') expect(d.pitch).toBeNull()
    }
  })
})

describe('note-off routing', () => {
  it('velocity==0 routes to note-off with the channel attached', () => {
    const d = routeNoteEvent(ev({ channel: 'tom', velocity: 0, note: 62 }), ctx())
    expect(d.kind).toBe('note-off')
    if (d.kind === 'note-off') {
      expect(d.role).toBe('tom')
      expect(d.channel).toBe('tom')
    }
  })
})

describe('drop reasons', () => {
  it('unknown channel drops as unknown-channel', () => {
    const d = routeNoteEvent(ev({ channel: 'bass' }), ctx())
    expect(d.kind).toBe('drop')
    if (d.kind === 'drop') expect(d.reason).toBe('unknown-channel')
  })

  it('note above 127 drops as invalid-event', () => {
    const d = routeNoteEvent(ev({ note: MAX_NOTE + 1 }), ctx())
    expect(d.kind).toBe('drop')
    if (d.kind === 'drop') expect(d.reason).toBe('invalid-event')
  })

  it('note below 0 drops as invalid-event', () => {
    const d = routeNoteEvent(ev({ note: MIN_NOTE - 1 }), ctx())
    if (d.kind === 'drop') expect(d.reason).toBe('invalid-event')
    else expect(true).toBe(false)
  })

  it('velocity above 127 drops as invalid-event', () => {
    const d = routeNoteEvent(ev({ velocity: 200 }), ctx())
    if (d.kind === 'drop') expect(d.reason).toBe('invalid-event')
    else expect(true).toBe(false)
  })

  it('non-finite note drops as invalid-event', () => {
    const d = routeNoteEvent(ev({ note: Number.NaN }), ctx())
    if (d.kind === 'drop') expect(d.reason).toBe('invalid-event')
    else expect(true).toBe(false)
  })

  it('event older than the stale window drops as stale', () => {
    const d = routeNoteEvent(ev({ at: 0.9, }), ctx(1.0)) // 100ms old > 50ms window
    expect(d.kind).toBe('drop')
    if (d.kind === 'drop') expect(d.reason).toBe('stale')
  })

  it('event within the stale window still routes', () => {
    const d = routeNoteEvent(ev({ at: 0.97 }), ctx(1.0)) // 30ms old < 50ms window
    expect(d.kind).toBe('trigger')
  })
})
