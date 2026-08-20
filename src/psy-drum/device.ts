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
  CHOKE_DURATION_MS,
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
import { createVarianceSource, velocityHumanize, roundRobinVariant, timbreVariance } from './variance-rules'
import type { VarianceSource } from './variance-rules'
import { resolveDrumParams } from './voice'
import { noteToRole, DEFAULT_DRUM_NOTE_MAP } from './midi-map'
import { synthDrum, makeNoiseBuffer, silenceVoiceAudio } from './voice-synth'
import { buildAudioBank, pickBankLayer } from './voice-bank'
import { makeReverbIR } from './fx'
import type { SynthCtx, VoiceAudioHandle } from './voice-synth'

// Suspend-safety: voices fast-release over this window on onStop (section 4.5).
export const STOP_FAST_RELEASE_MS = 10

// Audit V3: canonical NoteEvent.velocity is 0..1 (ARCHITECTURE.md section 3.1),
// but legacy hosts (and the bundled demo) emit raw MIDI 0..127. The DSP curves
// are calibrated to 0..127, so normalize at the device boundary: values <= 1
// are treated as normalized 0..1 and scaled; values > 1 pass through as MIDI.
// v = 1 maps to full velocity 127 (the compliant-host reading).
export function normalizeEventVelocity(v: number): number {
  return v <= 1 ? v * 127 : v
}

// Audit V4: steal victims ramp out over this window so fast retriggers do not
// stack or click (host-side budget, gentler than the 2.5ms choke ramp).
export const STEAL_RELEASE_MS = 8

// Audit V5: note-off realizes an audible release over this default window when
// the patch has no amp.releaseMs (previously releaseMs was validated but dead).
export const DEFAULT_RELEASE_MS = 30

// Audit M2b: per-hit timbre variance depth for the realtime path (seeded,
// deterministic). Brightness varies hit-to-hit; pitch and routing never do.
export const TIMBRE_VARIANCE_DEPTH = 0.02

export interface DrumDeviceOptions {
  id?: string
  ctx: BaseAudioContext
  outputNode: AudioNode
  config?: DrumConfig
  kitPatches?: Partial<Record<DrumRole, DrumPatch>>
  optsSeed?: number
  noteMap?: Record<number, DrumRole>
  // Audit M2 (ADR-008): pre-render ACB banks for kick/snare/hats at load time
  // and play them instead of the realtime chains. Default false (opt-in).
  useBank?: boolean
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
  private noiseBuffer: AudioBuffer | null
  private samples: Partial<Record<DrumRole, AudioBuffer>>
  private delayBus: DelayNode | null
  private reverbBus: ConvolverNode | null
  private delaySends: Partial<Record<DrumRole, GainNode>>
  private reverbSends: Partial<Record<DrumRole, GainNode>>
  // Audit V4: per-voice audio handles, indexed by pool slot, so choke/steal/
  // stop can silence the ACTUAL nodes (not just the bookkeeping).
  private voiceAudio: Array<VoiceAudioHandle | null>
  // Audit M2 (ADR-008): optional pre-rendered bank (rebuilt at loadKit).
  private useBank: boolean
  private bank: Partial<Record<DrumRole, AudioBuffer[][]>> | null
  private hitCounters: Partial<Record<DrumRole, number>>

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
    this.noiseBuffer = null
    this.samples = {}
    this.delayBus = null
    this.reverbBus = null
    this.delaySends = {}
    this.reverbSends = {}
    this.voiceAudio = []
    this.useBank = opts.useBank === undefined ? false : opts.useBank
    this.bank = null
    this.hitCounters = {}
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
    // Audit M2: the bank is patch-derived; rebuild it when kits change.
    if (this.useBank) {
      this.bank = buildAudioBank(this.ctx, this.patches, this.variance.seed)
    }
  }

  onStart(): void {
    if (this.started) return
    this.started = true

    // Record base latency once (audit B9).
    const base = (this.ctx as { baseLatency?: number }).baseLatency
    recordBaseLatency(this.latency, base === undefined ? 0 : base)

    // Allocate the voice pool + the device output subgraph.
    this.pool = createVoicePool(this.config.voices)
    this.voiceAudio = new Array(this.pool.size)
    for (var vi = 0; vi < this.pool.size; vi++) this.voiceAudio[vi] = null
    // Audit M2: build the bank once at start if enabled and not built yet.
    if (this.useBank && this.bank === null) {
      this.bank = buildAudioBank(this.ctx, this.patches, this.variance.seed)
    }
    this.deviceOut = this.ctx.createGain()
    this.deviceOut.gain.value = 1
    this.deviceOut.connect(this.outputNode)

    // Deterministic seeded noise buffer shared by all noise-based drums.
    this.noiseBuffer = makeNoiseBuffer(this.ctx, 1.0, 0x9e3779b9)

    // FX send buses (step J): delay w/ feedback + reverb w/ procedural IR.
    var delay = this.ctx.createDelay(1.0)
    delay.delayTime.value = 0.28
    var fb = this.ctx.createGain()
    fb.gain.value = 0.35
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(this.deviceOut)
    this.delayBus = delay

    var reverb = this.ctx.createConvolver()
    reverb.buffer = makeReverbIR(this.ctx, 1.6, 2.2, 0x5f3759df)
    reverb.connect(this.deviceOut)
    this.reverbBus = reverb

    for (var i = 0; i < DRUM_ROLES.length; i++) {
      var role = DRUM_ROLES[i]
      var bus = this.ctx.createGain()
      bus.gain.value = 1
      bus.connect(this.deviceOut)
      this.buses[role] = bus

      var ds = this.ctx.createGain()
      ds.gain.value = 0
      bus.connect(ds)
      ds.connect(delay)
      this.delaySends[role] = ds

      var rs = this.ctx.createGain()
      rs.gain.value = 0
      bus.connect(rs)
      rs.connect(reverb)
      this.reverbSends[role] = rs
    }
  }

  // Mixer (step W): set a drum bus level (0..1.5). No-op before onStart.
  setDrumLevel(role: DrumRole, level: number): void {
    var bus = this.buses[role]
    if (bus === undefined) return
    var lvl = Math.max(0, Math.min(1.5, level))
    bus.gain.value = lvl
  }

  // Read back a drum bus level (1 before onStart).
  getDrumLevel(role: DrumRole): number {
    var bus = this.buses[role]
    return bus === undefined ? 1 : bus.gain.value
  }

  // Sample layer (step H): attach a pre-loaded AudioBuffer to a drum role.
  // Samples are loaded by the host at load time (provenance enforced there);
  // the device only realizes them.
  setSample(role: DrumRole, buffer: AudioBuffer): void {
    this.samples[role] = buffer
  }

  // Enable the sample layer for a drum by setting patch.sample.gain.
  // assetId stays null so applySampleFallback will not zero the gain.
  enableSampleLayer(role: DrumRole, gain: number): void {
    var patch = this.patches[role]
    if (patch === undefined) {
      patch = {}
      this.patches[role] = patch
    }
    patch.sample = { assetId: null, gain: Math.max(0, Math.min(1, gain)) }
  }

  // FX sends (step J): per-drum delay / reverb send level (0..1.5).
  setDrumDelaySend(role: DrumRole, level: number): void {
    var send = this.delaySends[role]
    if (send === undefined) return
    send.gain.value = Math.max(0, Math.min(1.5, level))
  }

  setDrumReverbSend(role: DrumRole, level: number): void {
    var send = this.reverbSends[role]
    if (send === undefined) return
    send.gain.value = Math.max(0, Math.min(1.5, level))
  }

  onStop(): void {
    if (!this.started) return
    this.started = false

    // Suspend safety: fast-release all voices, then disconnect the subgraph so
    // nothing dangles off the injected outputNode.
    if (this.pool !== null) {
      // Audit V4: ramp every active voice's AUDIO out over STOP_FAST_RELEASE_MS
      // before the bookkeeping reset (previously the constant was dead code).
      var stopNow = this.ctx.currentTime
      for (var v = 0; v < this.pool.size; v++) {
        if (this.voiceAudio[v] !== null) {
          silenceVoiceAudio(this.voiceAudio[v], stopNow, STOP_FAST_RELEASE_MS)
          this.voiceAudio[v] = null
        }
      }
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
      if (this.pool !== null) {
        var releasedIdx = releaseByChannel(this.pool, event.channel, this.ctx.currentTime)
        // Audit V5: note-off realizes an audible release ramp (patch amp.releaseMs,
        // or DEFAULT_RELEASE_MS) — previously releaseMs was validated but dead and
        // note-off only touched the bookkeeping.
        if (releasedIdx >= 0 && this.voiceAudio[releasedIdx] !== null) {
          var relPatch = this.patches[resolvedRole]
          var relMs = relPatch !== undefined && relPatch.amp !== undefined ? relPatch.amp.releaseMs : DEFAULT_RELEASE_MS
          relMs = Math.max(5, Math.min(300, relMs))
          silenceVoiceAudio(this.voiceAudio[releasedIdx], this.ctx.currentTime, relMs)
          this.voiceAudio[releasedIdx] = null
        }
      }
      applyRelease(this.choke, resolvedRole)
      return
    }

    // trigger
    this.triggerVoice(resolvedRole, event, decision.pitch)
  }

  // Audit V4: O(n) snapshot of which pool slots are active (n = voices, small).
  private snapshotActive(pool: VoicePool): boolean[] {
    var out: boolean[] = []
    for (var i = 0; i < pool.size; i++) out.push(pool.voices[i].active)
    return out
  }

  // Audit V4: ramp out the audio of every voice whose slot was freed since
  // `before` (choke victims, cap-steal victims). Bookkeeping-only choke was the
  // V4 bug: the state machine agreed while the audio kept ringing.
  private silenceFreedVoices(pool: VoicePool, before: boolean[], now: number, rampMs: number): void {
    for (var i = 0; i < pool.size; i++) {
      if (before[i] && !pool.voices[i].active && this.voiceAudio[i] !== null) {
        silenceVoiceAudio(this.voiceAudio[i], now, rampMs)
        this.voiceAudio[i] = null
      }
    }
  }

  private triggerVoice(role: DrumRole, event: NoteEvent, pitch: number | null): void {
    if (this.pool === null) return
    var pool = this.pool
    var now = this.ctx.currentTime

    // Choke: decide, apply to the pool (frees choked voices), then update the
    // choke state machine so subsequent decisions stay consistent.
    var beforeChoke = this.snapshotActive(pool)
    var decision = decideChoke(this.choke, role, this.config.choke)
    if (decision.chokeHatClosed > 0) chokeRole(pool, 'hat-closed', decision.chokeHatClosed, this.counters)
    if (decision.chokeHatOpen > 0) chokeRole(pool, 'hat-open', decision.chokeHatOpen, this.counters)
    if (decision.chokeCrash > 0) chokeRole(pool, 'crash', decision.chokeCrash, this.counters)
    if (decision.chokeRide > 0) chokeRole(pool, 'ride', decision.chokeRide, this.counters)
    // Audit V4: choked voices are silenced in AUDIO within CHOKE_DURATION_MS
    // (style acceptance criteria #2 / #6), not just in the bookkeeping.
    this.silenceFreedVoices(pool, beforeChoke, now, CHOKE_DURATION_MS)
    applyChokeDecision(this.choke, decision)
    applyTrigger(this.choke, role)

    // Voice start time: honour a future event.at (scheduled by a host
    // sequencer); otherwise start now.
    var when = event.at > now ? event.at : now

    // allocVoice enforces the per-drum budget cap (steals oldest of the role).
    var beforeAlloc = this.snapshotActive(pool)
    var idx = allocVoice(pool, role, event.channel, now, this.counters)
    // Audit V4: steal victims get a short ramp so fast retriggers don't click.
    this.silenceFreedVoices(pool, beforeAlloc, now, STEAL_RELEASE_MS)
    if (idx >= 0 && beforeAlloc[idx] && this.voiceAudio[idx] !== null) {
      // The slot was reused: the evicted voice's audio is ramped out too.
      silenceVoiceAudio(this.voiceAudio[idx], now, STEAL_RELEASE_MS)
      this.voiceAudio[idx] = null
    }
    this.startVoiceAudio(role, event, pitch, when, idx)
  }

  // Audit M2 (ADR-008): realize a voice from the pre-rendered bank. Returns
  // null when the role is not banked (caller falls back to synthesis).
  private bankVoice(role: DrumRole, vel: number, when: number): VoiceAudioHandle | null {
    if (this.bank === null) return null
    var layers = this.bank[role]
    if (layers === undefined) return null
    var bus = this.buses[role]
    if (bus === undefined) return null
    var patch = this.patches[role]

    var v01 = Math.max(0, Math.min(1, vel / 127))
    var layer = layers[pickBankLayer(v01, layers.length)]
    var count = this.hitCounters[role] === undefined ? 0 : this.hitCounters[role]
    this.hitCounters[role] = count + 1
    var variant = layer[roundRobinVariant(count, layer.length)]

    var src = this.ctx.createBufferSource()
    src.buffer = variant
    var g = this.ctx.createGain()
    var attackMs = patch !== undefined && patch.amp !== undefined ? patch.amp.attackMs : 1
    var decayMs = patch !== undefined && patch.amp !== undefined ? patch.amp.decayMs : 200
    var a = Math.max(0.001, attackMs / 1000)
    var d = Math.max(0.02, decayMs / 1000)
    var dur = variant.duration
    g.gain.setValueAtTime(0.0001, when)
    g.gain.linearRampToValueAtTime(1, when + a)
    g.gain.exponentialRampToValueAtTime(0.001, when + Math.max(a + 0.01, Math.min(dur, d)))
    src.connect(g)
    g.connect(bus)
    src.start(when)
    src.stop(when + dur + 0.05)
    return { gains: [g], sources: [src] }
  }

  private startVoiceAudio(role: DrumRole, event: NoteEvent, pitch: number | null, when: number, idx: number): void {
    if (this.deviceOut === null) return
    var bus = this.buses[role]
    if (bus === undefined) return
    if (this.noiseBuffer === null) return

    var patch = this.patches[role]
    // Audit V3: normalize canonical 0..1 velocity onto the 0..127 DSP scale
    // (legacy MIDI-scale events pass through unchanged).
    var vel = normalizeEventVelocity(event.velocity)
    if (vel !== event.velocity) {
      this.counters.velocityNormalized = this.counters.velocityNormalized + 1
    }
    // Audit V2: seeded velocity micro-humanize (variance-rules, +-3%). This is
    // the anti-machine-gun layer: deterministic per device seed, applied AFTER
    // normalization so both velocity scales humanize identically. Pitch mapping,
    // choke, routing and drop policy are NEVER touched by variance.
    if (this.config.humanize) {
      vel = vel * velocityHumanize(this.variance.rng)
    }
    // Audit M2b: seeded per-hit timbre variance — a small multiplier around 1
    // applied to the noise filter centre in voice-synth (brightness varies;
    // loudness/pitch do not). Drawn AFTER velocity so the seeded sequence is
    // stable and deterministic per device seed.
    var timbre = 1
    if (this.config.humanize) {
      timbre = timbreVariance(this.variance.rng, TIMBRE_VARIANCE_DEPTH)
    }
    // Audit M2 (ADR-008): banked roles play pre-rendered ACB buffers; the
    // humanized velocity picks the layer, the RR counter picks the variant
    // (anti machine-gun). Non-banked roles fall through to synthesis.
    if (this.useBank) {
      var bankHandles = this.bankVoice(role, vel, when)
      if (bankHandles !== null) {
        if (idx >= 0 && idx < this.voiceAudio.length) {
          this.voiceAudio[idx] = bankHandles
        }
        return
      }
    }
    var params = resolveDrumParams(patch === undefined ? {} : patch, vel, 'linear', 2, this.ctx.sampleRate / 2)

    // Per-role ring window; the per-drum envelopes shape the actual decay.
    var dur = role === 'crash' || role === 'ride' ? 0.9 : role === 'hat-open' ? 0.4 : 0.5

    // Audit V4: the builders register their nodes here so choke/steal/stop can
    // silence the ACTUAL audio, not just the bookkeeping.
    var handles: VoiceAudioHandle = { gains: [], sources: [] }
    var sc: SynthCtx = {
      ctx: this.ctx,
      noiseBuffer: this.noiseBuffer,
      bus: bus,
      now: when,
      params: params,
      patch: patch === undefined ? {} : patch,
      duration: dur,
      sample: this.samples[role] === undefined ? null : this.samples[role],
      handles: handles,
      pitchHint: pitch,
      timbre: timbre,
    }
    // Audit V6: `pitch` is the router's MIDI pitch hint — consumed by tom/ride
    // in voice-synth; unpitched drums ignore it (B1 contract preserved).
    synthDrum(role, sc)
    if (idx >= 0 && idx < this.voiceAudio.length) {
      this.voiceAudio[idx] = handles
    }
  }
}

// Factory (ARCHITECTURE.md module map): createDrumDevice(opts) -> { device }.
export interface CreateDrumDeviceResult {
  device: DrumDevice
}

export function createDrumDevice(opts: DrumDeviceOptions): CreateDrumDeviceResult {
  return { device: new DrumDevice(opts) }
}
