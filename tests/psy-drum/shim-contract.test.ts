// Foundation shim runtime contract test (phase 1).
// Unlike shim-sync.test.ts (which is skipped in CI without the audit clone), this
// test RUNS everywhere and proves the shim is functional at runtime: channels
// deliver events, DeviceHost routes them to registered devices, and a throwing
// listener cannot starve the others.

import { describe, it, expect } from 'bun:test'
import { DeviceHost, InMemoryChannel } from '../../src/psy-foundation-shim'
import type {
  DeviceCapabilities,
  MusicalContext,
  MusicalEvent,
  MusicalTransport,
  NoteEvent,
  PsyDevice,
} from '../../src/psy-foundation-shim'

function makeCapabilities(): DeviceCapabilities {
  return {
    audio: true,
    midi: true,
    inputs: 0,
    outputs: 1,
    voices: 16,
    latencyMs: 5,
    roles: ['drums'],
  }
}

class MockDrumDevice implements PsyDevice {
  id = 'mock-drum'
  events: MusicalEvent[] = []
  started = false
  stopped = false

  capabilities(): DeviceCapabilities {
    return makeCapabilities()
  }
  onTransport(_t: MusicalTransport): void {}
  onContext(_c: MusicalContext): void {}
  onEvent(event: MusicalEvent): void {
    this.events.push(event)
  }
  onStart(): void {
    this.started = true
  }
  onStop(): void {
    this.stopped = true
  }
}

function kick(at: number): NoteEvent {
  return { type: 'note', note: 36, velocity: 0.9, duration: -1, channel: 'kick', at }
}

describe('foundation shim contract (runtime)', () => {
  it('InMemoryChannel delivers published events to subscribers', () => {
    const ch = new InMemoryChannel('test')
    const seen: MusicalEvent[] = []
    ch.subscribe((e) => seen.push(e))
    ch.publish(kick(0))
    expect(seen.length).toBe(1)
    expect((seen[0] as NoteEvent).channel).toBe('kick')
  })

  it('DeviceHost routes channel events to registered devices (onStart/onStop honored)', () => {
    const ch = new InMemoryChannel('host-test')
    const host = new DeviceHost(ch)
    const dev = new MockDrumDevice()
    host.register(dev)
    expect(dev.started).toBe(true)
    ch.publish(kick(0))
    expect(dev.events.length).toBe(1)
    host.unregister(dev.id)
    expect(dev.stopped).toBe(true)
  })

  it('a throwing listener does not starve other listeners', () => {
    const ch = new InMemoryChannel('err-test')
    const seen: MusicalEvent[] = []
    ch.subscribe(() => {
      throw new Error('boom')
    })
    ch.subscribe((e) => seen.push(e))
    ch.publish(kick(0))
    expect(seen.length).toBe(1)
  })

  it('findByRole matches devices by capability role', () => {
    const ch = new InMemoryChannel('role-test')
    const host = new DeviceHost(ch)
    const dev = new MockDrumDevice()
    host.register(dev)
    expect(host.findByRole('drums').length).toBe(1)
    expect(host.findByRole('bass').length).toBe(0)
    host.dispose()
  })
})
