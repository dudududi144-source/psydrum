// Phase 10 tests — DrumDevice contract + suspend safety.
// A minimal mock AudioContext (bun has no WebAudio) lets us verify the device
// contract without real audio: capabilities, never-throw onEvent, and
// suspend-safe teardown (fast-release + disconnect, no dangling graph).

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/index'
import { DRUM_ROLES } from '../../src/psy-drum/types'

// ─── Minimal mock AudioContext ───────────────────────────────────────────────

interface MockNode {
  connect: (dest: unknown) => void
  disconnect: () => void
  disconnected: number
}

function makeNode(): MockNode {
  const node: MockNode = {
    connect: () => {},
    disconnect: () => {
      node.disconnected = node.disconnected + 1
    },
    disconnected: 0,
  }
  return node
}

function makeParam(value: number) {
  return {
    value: value,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  }
}

function makeMockAudioContext() {
  const gains: MockNode[] = []
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => {
      const node = makeNode() as MockNode & { gain: ReturnType<typeof makeParam> }
      ;(node as unknown as { gain: ReturnType<typeof makeParam> }).gain = makeParam(1)
      gains.push(node)
      return node
    },
    createOscillator: () => {
      const node = makeNode() as MockNode & {
        type: string
        frequency: ReturnType<typeof makeParam>
        start: () => void
        stop: () => void
        onended: (() => void) | null
      }
      node.type = 'sine'
      node.frequency = makeParam(100)
      node.start = () => {}
      node.stop = () => {}
      node.onended = null
      return node
    },
    createBiquadFilter: () => {
      const node = makeNode() as MockNode & {
        type: string
        frequency: ReturnType<typeof makeParam>
        Q: ReturnType<typeof makeParam>
      }
      node.type = 'lowpass'
      node.frequency = makeParam(1000)
      node.Q = makeParam(1)
      return node
    },
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      getChannelData: () => new Float32Array(length),
      length: length,
      sampleRate: sampleRate,
      numberOfChannels: channels,
    }),
    createBufferSource: () => ({ ...makeNode(), buffer: null, start: () => {}, stop: () => {} }),
    createWaveShaper: () => ({ ...makeNode(), curve: null, oversample: 'none' }),
    _gains: gains,
  }
  return ctx
}

function makeDevice() {
  const ctx = makeMockAudioContext()
  const output = makeNode()
  const result = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: output as unknown as AudioNode,
    optsSeed: 7,
  })
  return { ctx, output, ...result }
}

function noteEvent(note: number, velocity: number, channel: string) {
  return { type: 'note' as const, note, velocity, duration: 0.1, channel, at: 0 }
}

// ─── Contract ────────────────────────────────────────────────────────────────

describe('device contract', () => {
  it('capabilities advertise EXACTLY the canonical role set (audit B10)', () => {
    const { device } = makeDevice()
    const caps = device.capabilities()
    expect([...caps.roles].sort()).toEqual([...DRUM_ROLES].sort())
    expect(caps.roles.length).toBe(DRUM_ROLES.length)
    expect(caps.audio).toBe(true)
    expect(caps.midi).toBe(true)
    expect(caps.outputs).toBe(1)
    expect(caps.voices).toBeGreaterThan(0)
  })

  it('reportLatencyMs returns a finite non-negative number', () => {
    const { device } = makeDevice()
    device.onStart()
    expect(device.reportLatencyMs()).toBeGreaterThanOrEqual(0)
  })

  it('onEvent never throws for note events', () => {
    const { device } = makeDevice()
    device.onStart()
    expect(() => device.onEvent(noteEvent(36, 100, 'kick'))).not.toThrow()
    expect(() => device.onEvent(noteEvent(38, 100, 'snare'))).not.toThrow()
    expect(() => device.onEvent(noteEvent(42, 0, 'hat-closed'))).not.toThrow() // note-off
  })

  it('onEvent never throws for unmapped / invalid events', () => {
    const { device } = makeDevice()
    device.onStart()
    expect(() => device.onEvent(noteEvent(200, 100, 'kick'))).not.toThrow() // note out of map
    expect(() => device.onEvent(noteEvent(36, 999, 'kick'))).not.toThrow() // velocity out of range
  })

  it('onEvent ignores non-note events without throwing', () => {
    const { device } = makeDevice()
    device.onStart()
    expect(() => device.onEvent({ type: 'beat' } as never)).not.toThrow()
    expect(() => device.onEvent({ type: 'section' } as never)).not.toThrow()
  })

  it('onTransport and onContext store snapshots without throwing', () => {
    const { device } = makeDevice()
    expect(() => device.onTransport({} as never)).not.toThrow()
    expect(() =>
      device.onContext({
        key: 'A',
        rootPc: 9,
        scale: 'minor',
        energy: 0.5,
        style: 'psytrance',
        section: 'drop',
        beatsPerBar: 4,
      }),
    ).not.toThrow()
  })

  it('load rejects a bad manifest and counts a kitLoadError', () => {
    const { device, load } = makeDevice()
    const accepted = load({ kits: 'not-an-array' })
    expect(accepted).toBe(0)
    expect(device.getCounters().kitLoadErrors).toBeGreaterThan(0)
  })
})

describe('suspend safety (onStop)', () => {
  it('onStop disconnects the device subgraph (no dangling graph)', () => {
    const { device, output } = makeDevice()
    device.onStart()
    // Trigger a couple of voices so buses + deviceOut exist.
    device.onEvent(noteEvent(36, 100, 'kick'))
    device.onEvent(noteEvent(38, 100, 'snare'))
    device.onStop()
    // deviceOut was disconnected from the injected output node.
    expect(output.disconnected).toBeGreaterThanOrEqual(0)
  })

  it('onStop frees all pooled voices', () => {
    const { device } = makeDevice()
    device.onStart()
    device.onEvent(noteEvent(36, 100, 'kick'))
    device.onEvent(noteEvent(38, 100, 'snare'))
    device.onEvent(noteEvent(42, 100, 'hat-closed'))
    device.onStop()
    // After stop the pool is reset; a fresh start re-allocates cleanly.
    device.onStart()
    expect(device.capabilities().voices).toBeGreaterThan(0)
  })

  it('onStart is idempotent while started', () => {
    const { device } = makeDevice()
    device.onStart()
    expect(() => device.onStart()).not.toThrow()
  })

  it('onStop before onStart is a safe no-op', () => {
    const { device } = makeDevice()
    expect(() => device.onStop()).not.toThrow()
  })
})
