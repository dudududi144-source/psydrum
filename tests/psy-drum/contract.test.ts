// Phase 11 — contract tests: NoteEvent handling END-TO-END via the canonical
// DeviceHost + InMemoryChannel (shim/host.ts + shim/protocol.ts).
//
// This proves the drum device participates correctly in the family runtime:
// events published on the shared channel reach the device through the host,
// transport/context fan out, capabilities are discoverable by role, and a
// misbehaving device cannot starve the channel (host catches per-device).
//
// bun has no WebAudio, so a minimal mock AudioContext stands in for the real
// context; the contract under test is the EVENT flow, not the audio.

import { describe, it, expect } from 'bun:test'
import { DeviceHost } from '../../src/psy-foundation-shim/host'
import { InMemoryChannel } from '../../src/psy-foundation-shim/protocol'
import { createDrumDevice } from '../../src/psy-drum/index'
import { DRUM_ROLES } from '../../src/psy-drum/types'
import type { NoteEvent } from '../../src/psy-foundation-shim/protocol'

// ─── Minimal mock AudioContext ───────────────────────────────────────────────

function makeParam(value: number) {
  return {
    value: value,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  }
}

function makeNode() {
  return { connect: () => {}, disconnect: () => {} }
}

function makeMockAudioContext() {
  return {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => ({ ...makeNode(), gain: makeParam(1) }),
    createOscillator: () => ({
      ...makeNode(),
      type: 'sine',
      frequency: makeParam(100),
      start: () => {},
      stop: () => {},
      onended: null,
    }),
    createBiquadFilter: () => ({
      ...makeNode(),
      type: 'lowpass',
      frequency: makeParam(1000),
      Q: makeParam(1),
    }),
  }
}

function makeHostedDevice(id = 'psydrum') {
  const channel = new InMemoryChannel('contract-test')
  const host = new DeviceHost(channel)
  const ctx = makeMockAudioContext()
  const { device } = createDrumDevice({
    id: id,
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: makeNode() as unknown as AudioNode,
    optsSeed: 11,
  })
  return { channel, host, device }
}

function noteEvent(note: number, velocity: number, channel: string): NoteEvent {
  return { type: 'note', note: note, velocity: velocity, duration: 0.1, channel: channel, at: 0 }
}

// ─── End-to-end event flow ───────────────────────────────────────────────────

describe('contract: NoteEvent end-to-end via DeviceHost + InMemoryChannel', () => {
  it('a published NoteEvent reaches the device and increments counters', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    const before = device.getCounters().eventsReceived
    host.publish(noteEvent(36, 100, 'kick'))
    expect(device.getCounters().eventsReceived).toBe(before + 1)
    host.dispose()
  })

  it('registering a device starts it (onStart called by the host)', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    // After registration the device reports its latency (base recorded at onStart).
    expect(device.reportLatencyMs()).toBeGreaterThanOrEqual(0)
    host.dispose()
  })

  it('registering the same device id twice throws', () => {
    const { host, device } = makeHostedDevice('dup')
    host.register(device)
    expect(() => host.register(device)).toThrow()
    host.dispose()
  })

  it('unmapped notes are counted as unknown-channel drops', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    const before = device.getCounters().unknownChannel
    host.publish(noteEvent(200, 100, 'kick')) // note 200 not in the map
    expect(device.getCounters().unknownChannel).toBe(before + 1)
    host.dispose()
  })

  it('multiple mapped notes all reach the device', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    const before = device.getCounters().eventsReceived
    host.publish(noteEvent(36, 100, 'kick'))
    host.publish(noteEvent(38, 100, 'snare'))
    host.publish(noteEvent(42, 100, 'hat-closed'))
    expect(device.getCounters().eventsReceived).toBe(before + 3)
    host.dispose()
  })
})

function makeTransport() {
  const origin = { audioTime: { seconds: 0 }, beatIndex: 0, bpm: 140 }
  return {
    bpm: 140,
    beat: 0,
    bar: 0,
    beatsPerBar: 4,
    beatTime: { seconds: 0, phase: 0 },
    barTime: 0,
    phase: 0,
    barPhase: 0,
    confidence: 1,
    locked: true,
    revision: 1,
    origin: origin,
    lastObservationAgo: 0,
    observationCount: 1,
  }
}

describe('contract: transport + context fan-out', () => {
  it('pushTransport reaches the device without throwing', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    expect(() => host.pushTransport(makeTransport(), 0)).not.toThrow()
    host.dispose()
  })

  it('pushContext reaches the device without throwing', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    expect(() =>
      host.pushContext({
        key: 'A',
        rootPc: 9,
        scale: 'minor',
        energy: 0.7,
        style: 'psytrance',
        section: 'drop',
        beatsPerBar: 4,
      }),
    ).not.toThrow()
    host.dispose()
  })
})

describe('contract: discovery by role', () => {
  it('findByRole finds the drum device for canonical roles', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    expect(host.findByRole('kick').length).toBe(1)
    expect(host.findByRole('hat-open').length).toBe(1)
    expect(host.findByRole('bass').length).toBe(0)
    host.dispose()
  })

  it('list exposes capabilities for every registered device', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    const listed = host.list()
    expect(listed.length).toBe(1)
    expect(listed[0].capabilities.roles.length).toBe(DRUM_ROLES.length)
    host.dispose()
  })

  it('unregister stops the device and removes it', () => {
    const { host, device } = makeHostedDevice()
    host.register(device)
    expect(host.deviceCount).toBe(1)
    host.unregister(device.id)
    expect(host.deviceCount).toBe(0)
    host.dispose()
  })
})

describe('contract: fault isolation', () => {
  it('a throwing device does not starve the channel (host catches per-device)', () => {
    const channel = new InMemoryChannel('fault-test')
    const host = new DeviceHost(channel)

    // A deliberately broken device that throws on every event.
    const badDevice = {
      id: 'bad',
      capabilities: () => ({
        audio: true,
        midi: false,
        inputs: 0,
        outputs: 0,
        voices: 0,
        latencyMs: 0,
        roles: ['kick'] as string[],
      }),
      onTransport: () => {},
      onContext: () => {},
      onEvent: () => {
        throw new Error('boom')
      },
    }

    const { device } = makeHostedDevice('good')
    host.register(badDevice)
    host.register(device)

    const before = device.getCounters().eventsReceived
    // Even though `bad` throws, the host catches it and `device` still receives.
    expect(() => host.publish(noteEvent(36, 100, 'kick'))).not.toThrow()
    expect(device.getCounters().eventsReceived).toBe(before + 1)
    host.dispose()
  })
})
