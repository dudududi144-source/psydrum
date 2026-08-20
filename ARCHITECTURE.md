# PSYDRUM - Architecture

Version 1.0 (architecture phase). Companion documents: ARCHITECTURE-STYLE.md (drum/kit spec), PSY-DRUM-IMPLEMENTATION-PLAN.md (build plan), INTEGRATION-GUIDE.md (host wiring).

## 1. Position in the Family

The psy-foundation audit (PSY-FAMILY-ARCHITECTURE-CHALLENGE.md, section N) defines three realization devices: Sampler (exists), Synth (exists), Drums (future). This repo is the Drums box.

    FOUNDATION (canonical, headless, never imported at runtime)
      Protocol: MusicalEvent / NoteEvent / MusicalTransport / MusicalContext
      Device contract: PsyDevice / DeviceHost / DeviceCapabilities
           |
           v
    DEVICES (pure HOW)
      psy-sampler (exists) | psysynth (exists) | psydrum (THIS)
           |
           v
    FAMILY RUNTIME (host): shared AudioContext, shared engine bus,
      one DeviceHost, one transport per host (PSY4 / PSY6 / demo page)

Hard rules inherited from the family:
1. Devices are pure HOW. No composition, no scheduling policy, no transport ownership, no pattern ownership.
2. Foundation is never imported at runtime. Contracts arrive as a VERBATIM SHIM pinned to a foundation commit, guarded by a byte-equivalence sync test (same mechanism as psy-sampler/psysynth, pinned to foundation commit 4ae95d3).
3. One AudioContext per host. The device receives it at creation. It never calls new AudioContext().
4. The device outputs ONLY to the injected outputNode. It never touches ctx.destination.
5. Devices report upstream only via capabilities() and reportLatencyMs(). No other side channel.

## 2. Module Map

    src/psy-foundation-shim/        VERBATIM, sync-tested, do not edit
      protocol.ts                   MusicalEvent union, NoteEvent, DeviceCapabilities, MusicalContext
      transport.ts                  MusicalTransport (v0 contract, canonical for onTransport)
      device.ts                     PsyDevice interface
      host.ts                       DeviceHost + InMemoryChannel
    src/psy-drum/
      index.ts                      createDrumDevice(opts) factory -> { device, load, dispose }
      demo-entry.ts                 bundle entry for the demo page (demo-facing exports)
      types.ts                      DrumPatch, DrumRole, DrumConfig, VoiceState, ChokeGroup
      device.ts                     DrumDevice implements PsyDevice (per-voice audio handles, audit V4)
      note-router.ts                NoteEvent -> drum voice on/off/choke decisions
      voice.ts                      pure DSP math: envelopes, velocity curves, param resolution
      voice-synth.ts                WebAudio realization of per-drum chains + sample layer + silence ramps
      voice-bank.ts                 pre-rendered ACB buffer bank (opt-in useBank, ADR-008; velocity layers timbre-vary via per-layer drive, audit M2e)
      voice-pool.ts                 pooled drum voices + deterministic steal (pure bookkeeping)
      choke.ts                      choke-group state machine (open hat chokes closed, etc.)
      kit-library.ts                kit manifest load, validation, provenance, sample fallback
      kit-builtin.ts                built-in kit manifest (psy-classic / dark-forest / progressive)
      default-kit.ts                default psy kit patch data
      presets.ts                    kit + groove preset library (WHAT data, host-owned)
      grooves.ts                    16-step groove templates (WHAT data, host-owned)
      sample-loader.ts              sample fetch + decode (host load-time helper)
      variance-rules.ts             seeded micro-variance, all wired at device: velocity humanize (V2), timbre (M2b), clap tap jitter (M2c), round-robin via voice-bank (M2)
      midi-map.ts                   drum MIDI note map + CC <-> parameter table, MIDI-learn
      latency.ts                    measured latency: baseLatency + first-trigger overhead measured once (audit B9 wired)
      counters.ts                   event/voice/steal/choke counters (observability, no logging in audio path)
      filters.ts                    OnePole / Biquad / SVF / Moog filter primitives (offline engines)
      acb.ts                        ACB (SVF-based) kick/snare/hat offline render engines
      kick-engine.ts                offline kick render engine (oversampled)
      snare-engine.ts               offline snare render engine (oversampled)
      hat-engine.ts                 offline hat render engine (oversampled)
      cymbal-engine.ts              offline crash/ride render engine (oversampled)
      kit-to-engine.ts              DrumPatch -> engine params mapping
      fx.ts                         procedural reverb IR for the device reverb send
      master-fx.ts                  optional host-side master chain module (NOT wired inside the device, rule 4.5)
      transport.ts                  TransportClock (host utility; the device itself is clock-free)
      sequencer.ts                  DOM-free step sequencer (host utility)
      motion.ts                     per-step parameter motion recorder (host utility)
    public/manifest.json            PWA manifest for the demo page
    public/samples/                 demo sample assets — provenance audit: public/samples/PROVENANCE.json (all assets currently UNVERIFIED)
    public/samples/PROVENANCE.json  sample provenance registry (audit M5; action required per asset)
    tests/psy-drum/                 contract / shim-sync / unit / engine render-proof / audit regressions

## 3. Contract Layer (event handling)

### 3.1 NoteEvent shape (canonical, unchanged)

    export interface NoteEvent {
      type: 'note'
      note: number          // MIDI pitch 0..127 (see 3.2 for drums)
      velocity: number      // 0..1 ; 0 means NOTE-OFF (family convention)
      duration: number      // seconds ; -1 means HOLD until matching note-off
      channel: string       // drum role name: 'kick' | 'snare' | ...
      at: number            // AudioContext time
    }

### 3.2 Pitch semantics for drums (the B1 fix, made explicit)

Drums are predominantly UNPITCHED. The audit's single most damaging bug (B1) was treating a placeholder pitch as authoritative, playing kicks two octaves up. PSYDRUM eliminates this class of bug by construction:

| Drum category | Use of NoteEvent.note |
|---|---|
| Unpitched (kick, snare, clap, hats, perc) | IGNORED for pitch. Never feeds a pitch-ratio. May select a variant if the kit exposes variants, else fully ignored. |
| Pitched (tom, ride) | OPTIONAL pitch hint. If present and in 0..127 it tunes the voice within a safe range; if absent the kit default is used. Never coerced, never guessed. |
| Any | If note is outside 0..127 -> DROP + increment invalidEvent counter. |

Rule: there is no `note ?? 60` anywhere in the device. Unpitched means unpitched. This is enforced by a static-analysis test (grep for null-coalescing pitch fallbacks fails the build).

### 3.3 Routing rules (note-router.ts)

| Input | Rule |
|---|---|
| velocity > 0, unpitched drum | voice.on(at, vel); one-shot (auto-release per drum envelope); duration ignored for gating |
| velocity > 0, pitched drum (tom/ride) | voice.on(at, vel, pitchHint); one-shot |
| velocity > 0, duration == -1 (hold) | voice rings on its envelope; note-off applies the patch release ramp (audit V5). Duration-based gating is not implemented |
| velocity == 0 | find active voice for (channel) -> voice.off(at) (matters mostly for choke/hold drums) |
| channel unknown | DROP + increment unknownChannel counter. Never coerce, never guess. |
| at < ctx.currentTime - 50ms | DROP as stale + increment staleDrop counter (family stale-drop policy) |
| pitch out of 0..127 | DROP + increment invalidEvent counter |

Voice matching for note-off scans the pool linearly by channel (O(n), n = voices <= 16); the oldest unreleased match wins (releaseByChannel).

### 3.4 Choke groups (drum-specific HOW)

Choke is a drum-native behavior that belongs in the device (it is HOW, not WHAT):

| Group | Behavior |
|---|---|
| hat | open-hat trigger chokes any active closed-hat; closed-hat trigger chokes active open-hat (exclusive pair) |
| crash | a new crash chokes the previous crash of the same group (configurable crashMaxPoly) |
| ride | a new ride self-chokes the previous ride (configurable rideMaxPoly) |
| none | kick/snare/clap/tom/perc do not choke each other |

Choke is deterministic and counted (chokeCounter). Choke latency (time from trigger to choked-voice reaching -60dB) is < 3ms.

### 3.5 onTransport

Stores the snapshot. Used ONLY for: (a) phase-sync of tempo-locked drum LFOs (e.g. gated/filtered percussion), (b) reportLatencyMs context. NEVER used to schedule events. Drums are one-shot/percussive so transport is rarely load-bearing.

### 3.6 onContext

Stores a key/rootPc/scale/energy/style/section snapshot. The device itself does NOT act on it: kit selection by style is a HOST decision (the host picks a kit from a manifest and calls loadKit), and energy macros are host-side. Context never changes timing. (M1 correction: earlier revisions overclaimed kit-bank selection here.)

## 4. Audio Engine

### 4.1 DrumVoice synthesis chains (analog-modeled)

Each drum is a small DSP chain, all deterministic, all zero-allocation on trigger (precomputed envelope tables + per-sample interpolation).

    KICK:  sine body w/ pitch envelope (startHz->endHz over pitchDecayMs)
           + click transient (short noise/hp burst, clickAmount)
           + optional drive (pre-saturation) --> LPF --> VCA (fast attack, drum decay)
    SNARE: tone osc (tuneHz) + noise band (bp noise, noiseTone mix)
           --> body filter + noise filter --> VCA (snare decay)
    CLAP:  multi-tap noise burst (N taps over clapSpreadMs) + band-pass color
    HAT:   metallic source (ring-mod / square-mix / filtered noise)
           --> highpass --> VCA (closed: short decay; open: long decay + choke-in)
    TOM:   sine/triangle w/ pitch drop (like kick but higher, longer) --> VCA
    PERC:  configurable short tone/noise hybrid (conga/bongo/shaker/rim flavors)
    RIDE/CRASH: metallic noise w/ long decay + ping tone (ride has stronger ping)

### 4.2 Sample layer (optional, per drum)

Each drum can blend a sample under its synthesized body: patch.sample.gain 0..1 sets the sample level. Samples are fetched/decoded at host load time (sample-loader.ts), attached via device.setSample / enableSampleLayer, and played by voice-synth.playSampleLayer. Samples are procedural or CC0 only; kit-manifest provenance is enforced at load (never at runtime). If a sample fails to load, the drum falls back to synthesis-only + sampleFallbacks counter (never silent, never throws). The blend is a true crossfade (audit M3): the synth side scales by 1 - sample.gain.

### 4.3 Velocity-to-timbre

Velocity maps to BOTH gain and timbre (the "louder = brighter" drum behavior):
- gain = velCurve(velocity)  (configurable linear / power curve)
- tone shift: higher velocity raises filter cutoff / noise brightness / pitch-envelope depth by velTrack amount
This is what makes drums feel alive rather than like a fixed sample triggered at different volumes.

### 4.4 VoicePool

- Preallocated at onStart, size = capabilities().voices (default 16). Host may override via config.voices when running alongside sampler+synth.
- Allocation: free voice first; else deterministic steal: oldest-released -> lowest-current-gain -> oldest-on. Steal increments counter.
- Hot path (on/off/choke/steal) performs ZERO heap allocations. Voices reset in place.
- Per-drum budget caps (DEFAULT_ROLE_CAPS in types.ts): kick 2, snare 2, clap 2, hat-closed 4, hat-open 4, tom 3, perc 4, ride 2, crash 2 (global pool shared; caps prevent one drum from starving the kit).

### 4.5 Audio graph rules

- device subgraph -> per-drum buses -> deviceOut gain -> injected outputNode.
- No device-internal mastering / limiter / compressor / ducking. Mastering + sidechain ducking belong to the host bus (single master chain, audit lesson).
- Suspend safety: on onStop, all voices fast-released (10ms), timers cleared, nodes disconnected from outputNode.

## 5. Timing Model

- NO internal scheduler clock (audit B8 lesson: never run a second 25ms loop). All rendering is scheduled directly at event.at using Web Audio param scheduling.
- Groove/swing is HOST-OWNED. The device renders event.at exactly; never applies its own swing or quantization.
- Guarantee: < 2ms jitter between event.at and audible onset (the audit's timing-feel bar).
- Latency (audit P0.1): reportLatencyMs() = round(contextOutputLatency*1000) + drumTriggerOverhead. contextOutputLatency = ctx.outputLatency when available (baseLatency + OS/hardware estimate), else ctx.baseLatency, else 0. Trigger overhead is measured once at the first trigger (audit B9), never hardcoded. Scope is explicit: this is the device-reported latency (event-at-time to graph, plus graph-to-hardware estimate). It does NOT include host-side FX after the device output. No scheduling compensation is applied: Web Audio schedules sample-accurately on the audio clock, so output latency shifts all audible sound equally and never distorts device-relative timing.

## 6. Determinism and Variance

Single seeded RNG (mulberry32, foundation lineage) per device instance. Seed = kit manifest seed XOR host-provided seed (createDrumDevice opts.seed, default 1).

| Allowed to vary (seeded) | Never varies |
|---|---|
| velocity micro-humanize +-3% when kit.humanize=true | pitch mapping, choke logic |
| per-hit tone/brightness variance (the "alive" feel) | event drop policy |
| round-robin variant/sample selection | role routing |
| clap tap jitter within spreadMs | kit selection |

Same (seed, kit manifest version, event stream, AudioContext sampleRate) => identical parameter decisions. Audio render is reproducible in OfflineAudioContext (render-proof test).

## 7. MIDI Architecture (capabilities.midi = true)

### 7.1 MIDI-IN (host-owned, device-consumed)

The device never calls WebMIDI (that would make it a transport owner). The host bridge converts WebMIDI into NoteEvents:

| WebMIDI | Bridge output |
|---|---|
| Note On (vel>0) on a drum note | NoteEvent { channel: mappedRole, velocity: v/127, duration: -1 } |
| Note Off / Note On vel=0 | NoteEvent { velocity: 0 } |
| CC (mapped) | host applies to device via setParameter(cc mapping) |
| MIDI Clock/Start/Stop | host transport only; device never syncs to MIDI directly |

### 7.2 Drum MIDI note map (midi-map.ts)

Default PSY drum map (GM-compatible where sensible): 36=kick, 38=snare, 39=clap, 42=hat-closed, 46=hat-open, 45/48=tom, 49/57=crash, 51=ride, 33/34/56=perc. Map is data (overridable), not hardcoded routing. MIDI-learn claims the next CC for the targeted per-drum parameter.

### 7.3 MIDI-learn

Default CC table: per-drum tune/decay/level macros. Learn flow mirrors psysynth: host puts device in learn mode, next CC claims the targeted parameter, table persists via host storage. Device state only - no storage I/O inside the device.

## 8. Performance Budget

| Metric | Target | Enforcement |
|---|---|---|
| Heap allocations in onEvent path | 0 | stress test with allocation counter |
| Drum trigger cost | < 0.10ms (one-shots are cheaper than synth voices) | benchmark test |
| 16 voices full kit CPU | < 12% (M1-equivalent) | stress + render-proof |
| GC dropouts during 5min 170BPM 16th-hat loop | 0 | stress test |
| Event-to-sound added latency | < 4ms over baseLatency | latency test |
| Choke latency | < 3ms to -60dB | choke test |

## 9. Error Handling and Safety

- onEvent NEVER throws. Malformed events: drop + counter.
- Kit load failure: device stays silent for affected drum + status surfaced via capabilities metadata; host decides fallback. Synthesis fallback when a sample fails.
- outputNode disconnect detected (host teardown): fast-release all voices, no dangling graph.
- No eval, no dynamic code, no network inside the device bundle. Manifest/sample fetch happens in the factory (load step), not in the audio path.
- No secrets in code or artifacts. Provenance is about audio assets, not credentials.
- No quarantined samples. Sample manifest enforces license == procedural|CC0; UNKNOWN/QUARANTINED refused at load (samper precedent, but ENFORCED not advisory).

## 10. Audit-Lesson Compliance (B1-B12)

| Audit finding | psysynth response | psysynth drum design response |
|---|---|---|
| B1 midi??60 coercion | explicit per-role unpitched handling | UNPITCHED drums IGNORE note for pitch; no pitch-ratio ever; static-analysis test forbids null-coalesce pitch fallback |
| B2 duration ignored | duration drives gate/release | note-off drives a real release ramp (audit V5); duration-based gating documented as not implemented |
| B3 NoteEvent in 2 places | single verbatim shim | single verbatim shim; sync test fails on drift |
| B4 step dropped | n/a in HOW | documented WHAT-layer concern |
| B5 unsafe role cast | validated against SynthRole enum | channel validated against canonical DrumRole enum; unknown => drop+count |
| B6 musical constants in HOW | zero composition constants | zero pattern/phrase constants; groove content stays in host |
| B7 duplicate plan caches | n/a (stateless) | n/a (stateless) |
| B8 dual schedulers | no device clock | no device clock |
| B9 latency mismatch | measured latency | measured baseLatency; capabilities() reads same source as reportLatencyMs() (trigger-overhead measurement: roadmap hook) |
| B10 role taxonomy mismatch | canonical SynthRole enum | canonical DrumRole enum in types.ts; capabilities advertises EXACTLY it (hat-closed/hat-open, NOT hat) |
| B11 duplicated at | single at in NoteEvent | single at; no opts duplication |
| B12 transport cached twice | one transport snapshot | device holds ONE transport snapshot; host owns its own |

## 11. Observability (no logs in audio path)

counters.ts exposes: eventsReceived, eventsDropped{reason}, voicesOn, voicesStolen, unknownChannel, staleDrop, invalidEvent, chokeCount, kitLoadErrors, sampleFallbacks, velocityNormalized. Readable via device.getCounters() (live object, main thread only) or snapshotCounters() for a copy. Hosts may ignore.

## 12. Build and Bundle

- bun workspace like psysynth/psy-sampler. Build: bun run bundle -> public/psydrum.js (ESM, single file, no external runtime deps, target es2020). Entry: src/psy-drum/demo-entry.ts (demo-facing exports).
- Bundle exports (demo-entry.ts): createDrumDevice, DrumDevice, loadKitManifest, BUILTIN_KIT_MANIFEST, groove/preset data, the offline render engines, TransportClock, StepSequencer, MotionRecorder, loadSample/loadSampleMap. The library barrel (index.ts) exports the full module API. No globals.
- Size budget: < 40KB minified (psysynth precedent: 20.5KB; drums add sample-layer + choke).
- Samples are NOT in the bundle; they are fetched assets with provenance. Bundle is deterministic without them.
