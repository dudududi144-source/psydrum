// PSYDRUM device assembly + factory (phase 10).
//
// DrumDevice implements the canonical PsyDevice contract (shim/device.ts):
//   - onEvent    : routes NoteEvents -> trigger / note-off / drop (NEVER throws)
//   - onTransport: stores a snapshot only (device never owns the transport)
//   - onContext  : stores context; kit-bank selection by style + energy macro
//   - onStart    : allocates the voice pool + records base latency
//   - onStop     : fast-releases all voices + disconnects (suspend safety)
//   - capabilities / reportLatencyMs : the ONLY upstream reporting channels
//
// Audio graph (section 4.5): device subgraph -> per-drum buses -> deviceOut
// gain -> injected outputNode. NO internal mastering/limiter (that belongs to
// the host bus). The AudioContext is INJECTED (never `new AudioContext()`),
// and output goes ONLY to the injected outputNode (never ctx.destination).
//
// Determinism: a single seeded VarianceSource (phase 8) drives all allowed
// variance. Pitch mapping / choke / drop policy / role routing never vary.
//
// Bookkeeping uses TWO cooperating state machines, kept in lockstep here:
//   - the voice pool (phase 6) owns the actual VoiceState slots;
//   - the choke state machine (phase 4) tracks choke-relevant counts.
// allocVoice already enforces per-drum budget caps by stealing the oldest
// voice of the over-cap role (section 4.4), so no separate cap drop is needed.

import type {
  DeviceCapabilities,
  MusicalContext,
  MusicalEvent,
  NoteEvent,
} from '../psy-foundation-shim/protocol'
import type { MusicalTransport } from '../psy-foundation-shim/transport'
import type { PsyDevice } from '../psy-foundation-shim/device'

import type { DrumConfig, DrumPatch, DrumRole } from './types'
import { DRUM_ROLES, defaultDrumConfig, isDrumRole } from './types'
import type { KitDefinition } from './kit-library'
import { createCounters } from './counters'
import type { DrumCounters } from './counters'
import { createLatencyState, recordBaseLatency, reportLatencyMs } from './latency'
import type { LatencyState } from './latency'
import { routeNoteEvent } from './note-router'
import type { RouteContext } from './note-router'
import {
  createChokeState,
  decideChoke,
  applyChokeDecision,
  applyTrigger,
  applyRelease,
} from './choke'
import type { ChokeState } from './choke'
import {
  createVoicePool,
  allocVoice,
  releaseByChannel,
  chokeRole,
  resetPool,
} from './voice-pool'
import type { VoicePool } from './voice-pool'
import { createVarianceSource } from './variance-rules'
import type { VarianceSource } from './variance-rules'
import { resolveDrumParams } from './voice'
import { noteToRole, DEFAULT_DRUM_NOTE_MAP } from './midi-map'

// Suspend-safety: voices fast-release over this window on onStop (section 4.5).
export const STOP_FAST_RELEASE_MS = 10

export interface DrumDeviceOptions {
  id?: string
  ctx: BaseAudioContext
  outputNode: AudioNode
  config?: DrumConfig
  kitPatches?: Partial<Record<DrumRole, DrumPatch>>
  optsSeed?: number
  noteMap?: Record<number, DrumRole>
}

export class DrumDevice implements PsyDevice {
  readonly id: string

  private readonly ctx: BaseAudioContext
  private readonly outputNode: AudioNode
  private readonly config: DrumConfig
  private readonly counters: DrumCounters
  private readonly latency: LatencyState
  private readonly choke: ChokeState
  private readonly variance: VarianceSource
  private readonly noteMap: Record<number, DrumRole>
  private patches: Partial<Record<DrumRole, DrumPatch>>

  private pool: VoicePool | null
  private deviceOut: GainNode | null
  private buses: Partial<Record<DrumRole, GainNode>>
  private transport: MusicalTransport | null
  private context: MusicalContext | null
  private started: boolean

  constructor(opts: DrumDeviceOptions) {
    this.id = opts.id === undefined ? 'psydrum' : opts.id
    this.ctx = opts.ctx
    this.outputNode = opts.outputNode
    this.config = opts.config === undefined ? defaultDrumConfig() : opts.config
    this.counters = createCounters()
    this.latency = createLatencyState()
    this.choke = createChokeState()
    this.variance = createVarianceSource(0, opts.optsSeed === undefined ? 1 : opts.optsSeed)
    this.noteMap = opts.noteMap === undefined ? (DEFAULT_DRUM_NOTE_MAP as Record<number, DrumRole>) : opts.noteMap
    this.patches = opts.kitPatches === undefined ? {} : opts.kitPatches
    this.pool = null
    this.deviceOut = null
    this.buses = {}
    this.transport = null
    this.context = null
    this.started = false
  }

  capabilities(): DeviceCapabilities {
    return {
      audio: true,
      midi: true,
      inputs: 0,
      outputs: 1,
      voices: this.config.voices,
      latencyMs: reportLatencyMs(this.latency),
      // Audit B10: advertise EXACTLY the canonical role set.
      roles: DRUM_ROLES.slice(),
    }
  }

  reportLatencyMs(): number {
    return reportLatencyMs(this.latency)
  }

  // Expose counters for the factory's kit-load path (main-thread only).
  getCounters(): DrumCounters {
    return this.counters
  }

  onTransport(transport: MusicalTransport): void {
    // Snapshot only — the device never owns or drives the transport.
    this.transport = transport
  }

  onContext(context: MusicalContext): void {
    // Store context; kit-bank selection by style + energy is a host concern the
    // device reflects here (no WHAT is invented inside the device).
    this.context = context
  }

  // Kit loading (phase 10; sample fallback is applied by the caller/host via
  // kit-library.applySampleFallback when the sample layer lands in phase 14).
  // Applies a validated KitDefinition's patches + choke config to the device.
  loadKit(kit: KitDefinition): void {
    var patches: Partial<Record<DrumRole, DrumPatch>> = {}
    var drumKeys = Object.keys(kit.drums)
    for (var i = 0; i < drumKeys.length; i++) {
      var key = drumKeys[i]
      if (isDrumRole(key)) {
        var patch = kit.drums[key]
        if (patch !== undefined) patches[key] = patch
      }
    }
    this.patches = patches
    this.config.choke = kit.choke
  }

  onStart(): void {
    if (this.started) return
    this.started = true

    // Record base latency once (audit B9).
    const base = (this.ctx as { baseLatency?: number }).baseLatency
    recordBaseLatency(this.latency, base === undefined ? 0 : base)

    // Allocate the voice pool + the device output subgraph.
    this.pool = createVoicePool(this.config.voices)
    this.deviceOut = this.ctx.createGain()
    this.deviceOut.gain.value = 1
    this.deviceOut.connect(this.outputNode)

    for (var i = 0; i < DRUM_ROLES.length; i++) {
      var role = DRUM_ROLES[i]
      var bus = this.ctx.createGain()
      bus.gain.value = 1
      bus.connect(this.deviceOut)
      this.buses[role] = bus
    }
  }

  onStop(): void {
    if (!this.started) return
    this.started = false

    // Suspend safety: fast-release all voices, then disconnect the subgraph so
    // nothing dangles off the injected outputNode.
    if (this.pool !== null) {
      resetPool(this.pool)
      this.pool = null
    }
    if (this.deviceOut !== null) {
      this.deviceOut.disconnect()
      this.deviceOut = null
    }
    for (var i = 0; i < DRUM_ROLES.length; i++) {
      var bus = this.buses[DRUM_ROLES[i]]
      if (bus !== undefined) bus.disconnect()
    }
    this.buses = {}
  }

  onEvent(event: MusicalEvent): void {
    // Never throws: any unexpected event shape is counted, not thrown.
    try {
      if (event.type !== 'note') return
      this.handleNote(event)
    } catch {
      this.counters.invalidEvent = this.counters.invalidEvent + 1
    }
  }

  private handleNote(event: NoteEvent): void {
    this.counters.eventsReceived = this.counters.eventsReceived + 1

    // Role resolution via the (overridable) MIDI note map.
    var role = noteToRole(this.noteMap, event.note)
    if (role === null) {
      this.counters.eventsDropped = this.counters.eventsDropped + 1
      this.counters.unknownChannel = this.counters.unknownChannel + 1
      return
    }

    var resolvedRole = role
    var routeCtx: RouteContext = {
      nowSec: this.ctx.currentTime,
      staleWindowSec: 0.05,
      resolveChannel: function (): DrumRole | null {
        return resolvedRole
      },
    }

    var decision = routeNoteEvent(event, routeCtx)

    if (decision.kind === 'drop') {
      this.counters.eventsDropped = this.counters.eventsDropped + 1
      if (decision.reason === 'stale') this.counters.staleDrop = this.counters.staleDrop + 1
      else if (decision.reason === 'invalid-event') this.counters.invalidEvent = this.counters.invalidEvent + 1
      else this.counters.unknownChannel = this.counters.unknownChannel + 1
      return
    }

    if (decision.kind === 'note-off') {
      if (this.pool !== null) releaseByChannel(this.pool, event.channel, this.ctx.currentTime)
      applyRelease(this.choke, resolvedRole)
      return
    }

    // trigger
    this.triggerVoice(resolvedRole, event, decision.pitch)
  }

  private triggerVoice(role: DrumRole, event: NoteEvent, pitch: number | null): void {
    if (this.pool === null) return
    var pool = this.pool

    // Choke: decide, apply to the pool (frees choked voices), then update the
    // choke state machine so subsequent decisions stay consistent.
    var decision = decideChoke(this.choke, role, this.config.choke)
    if (decision.chokeHatClosed > 0) chokeRole(pool, 'hat-closed', decision.chokeHatClosed, this.counters)
    if (decision.chokeHatOpen > 0) chokeRole(pool, 'hat-open', decision.chokeHatOpen, this.counters)
    if (decision.chokeCrash > 0) chokeRole(pool, 'crash', decision.chokeCrash, this.counters)
    if (decision.chokeRide > 0) chokeRole(pool, 'ride', decision.chokeRide, this.counters)
    applyChokeDecision(this.choke, decision)
    applyTrigger(this.choke, role)

    // allocVoice enforces the per-drum budget cap (steals oldest of the role).
    allocVoice(pool, role, event.channel, this.ctx.currentTime, this.counters)
    this.startVoiceAudio(role, event, pitch)
  }

  private startVoiceAudio(role: DrumRole, event: NoteEvent, pitch: number | null): void {
    if (this.deviceOut === null) return
    var bus = this.buses[role]
    if (bus === undefined) return

    var patch = this.patches[role]
    var params = resolveDrumParams(patch === undefined ? {} : patch, event.velocity, 'linear', 2, this.ctx.sampleRate / 2)

    var now = this.ctx.currentTime
    var osc = this.ctx.createOscillator()
    osc.type = 'sine'
    // Pitched drums use the note as a pitch hint; unpitched ignore it (B1).
    var baseHz = pitch === null ? 100 : 40 + pitch * 2
    osc.frequency.value = baseHz

    var filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = params.cutoff

    var vca = this.ctx.createGain()
    vca.gain.setValueAtTime(0.0001, now)
    vca.gain.linearRampToValueAtTime(params.gain, now + 0.003)
    vca.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

    osc.connect(filter)
    filter.connect(vca)
    vca.connect(bus)
    osc.start(now)
    osc.stop(now + 0.3)
  }
}

// Factory (ARCHITECTURE.md module map): createDrumDevice(opts) -> { device }.
export interface CreateDrumDeviceResult {
  device: DrumDevice
}

export function createDrumDevice(opts: DrumDeviceOptions): CreateDrumDeviceResult {
  return { device: new DrumDevice(opts) }
}
