# PSY-DRUM-IMPLEMENTATION-PLAN

Phased build plan for the PSY Drum Device. Every phase ends GREEN (all tests pass, no secrets, docs consistent). Each phase is small enough to review in one sitting and ships a testable increment. Read `ARCHITECTURE.md` and `ARCHITECTURE-STYLE.md` first; this plan is the ordering, the architecture is the source of truth.

## Progress

| Phase | Name | Status |
|---|---|---|
| 0 | Repo scaffolding | ✅ landed |
| 1 | Foundation shim (verbatim) | ✅ landed |
| 2 | Core types + counters + latency | ✅ landed |
| 3 | Note router (contract layer) | ✅ landed |
| 4 | Choke groups | ✅ landed |
| 5 | Voice DSP (analog-modeled chains) | ✅ landed (deterministic core; OfflineAudioContext render proof lands with the device/host) |
| 6 | Voice pool | ✅ landed |
| 7 | Kit library | ✅ landed |
| 8 | Variance rules (determinism) | ✅ landed |
| 9 | MIDI map + learn | ✅ landed |
| 10 | Device assembly + factory | ✅ landed |
| 11 | Contract + shim-sync tests | ✅ landed |
| 12 | Stress + render-proof + benchmarks | ⬜ next |
| 13 | Style acceptance tests | ⬜ |
| 14 | Sample layer (optional) | ⬜ |
| 15 | Bundle build + size budget | ⬜ |
| 16 | Demo page + integration proof | ⬜ |

## Ground rules (apply to every phase)

1. **Device is pure HOW.** No composition, no scheduling policy, no transport ownership, no pattern ownership. If a phase is tempted to add a pattern/phrase constant, it is a WHAT leak and must be rejected.
2. **Foundation is never imported at runtime.** All contracts live in `src/psy-foundation-shim/` as a VERBATIM SHIM pinned to foundation commit `4ae95d3`, guarded by a byte-equivalence sync test.
3. **One AudioContext per host.** The device receives it in the factory; never calls `new AudioContext()`.
4. **Output ONLY to the injected `outputNode`.** Never `ctx.destination`.
5. **Zero heap allocations on the hot path** (onEvent/on/off/choke/steal). Precompute envelope tables; reset voices in place.
6. **Determinism.** Single seeded mulberry32 per device. Same (seed, kit manifest version, event stream, sampleRate) => identical render.
7. **Every phase adds tests.** Unit + (where relevant) contract / stress / render-proof / style-acceptance. No phase merges without green tests.
8. **No secrets.** `secret-scan` runs in CI from phase 0. No quarantined/unlicensed samples ever.

## Phase 0 - Repo scaffolding

- `package.json` (bun workspace style like psysynth/psy-sampler), `tsconfig.json`, `.gitignore`.
- CI workflow: `bun test` + `secret-scan` + (later) `shim-sync` + `bundle` steps.
- Directory skeleton per the module map in ARCHITECTURE.md section 2.
- **Done when:** CI runs green on an empty-but-valid scaffold; `secret-scan` step present.

## Phase 1 - Foundation shim (verbatim)

- `src/psy-foundation-shim/protocol.ts` - MusicalEvent union, NoteEvent, DeviceCapabilities, MusicalContext.
- `src/psy-foundation-shim/transport.ts` - MusicalTransport v0 contract.
- `src/psy-foundation-shim/device.ts` - PsyDevice interface.
- `src/psy-foundation-shim/host.ts` - DeviceHost + InMemoryChannel.
- **Byte-equivalence sync test** pinned to foundation commit `4ae95d3` (same mechanism as psy-sampler/psysynth).
- **Done when:** shim compiles, sync test green against the pinned commit, no runtime import of foundation anywhere else.

## Phase 2 - Core types + counters + latency

- `src/psy-drum/types.ts` - canonical `DrumRole` enum (kick/snare/clap/hat-closed/hat-open/tom/perc/ride/crash), `DrumPatch`, `DrumConfig`, `VoiceState`, `ChokeGroup`.
- `src/psy-drum/counters.ts` - eventsReceived, eventsDropped{reason}, voicesOn, voicesStolen, unknownChannel, staleDrop, invalidEvent, chokeCount, kitLoadErrors, sampleFallbacks.
- `src/psy-drum/latency.ts` - baseLatency + measured trigger overhead (measured once at onStart, not hardcoded - audit B9).
- **Done when:** types compile; capabilities() advertises EXACTLY the canonical role set (audit B10); counters increment in tests.

## Phase 3 - Note router (contract layer)

- `src/psy-drum/note-router.ts` - NoteEvent -> voice on/off/choke decisions per ARCHITECTURE.md section 3.3.
- Enforce the B1 fix: unpitched drums IGNORE `note` for pitch; no `note ?? 60` anywhere; static-analysis test greps for null-coalesce pitch fallbacks and FAILS the build if found.
- Routing table: velocity>0 unpitched => one-shot; velocity>0 pitched (tom/ride) => pitch hint; velocity==0 => note-off via (channel) LRU index; unknown channel => DROP+count; `at < now-50ms` => stale-drop+count; pitch out of 0..127 => invalidEvent+count.
- **Done when:** routing table fully unit-tested; static-analysis anti-B1 test present and passing.

## Phase 4 - Choke groups

- `src/psy-drum/choke.ts` - choke-group state machine: hat exclusive pair (open chokes closed and vice versa), crash/ride self-choke with configurable max-poly.
- Deterministic, counted (chokeCounter); choke latency < 3ms to -60dB.
- **Done when:** choke state machine unit-tested; choke-latency test asserts < 3ms.

## Phase 5 - Voice DSP (analog-modeled chains)

- `src/psy-drum/voice.ts` - per-drum synthesis chains per ARCHITECTURE.md section 4.1 (KICK/SNARE/CLAP/HAT/TOM/PERC/RIDE/CRASH).
- Velocity-to-timbre (section 4.3): gain = velCurve(velocity) AND tone shift (filter cutoff / noise brightness / pitch-envelope depth by velTrack).
- Precomputed envelope tables + per-sample interpolation; zero allocation on trigger.
- **Done when:** every drum chain renders in OfflineAudioContext; velocity-to-timbre spectral-centroid assertion passes (style criterion 9).

## Phase 6 - Voice pool

- `src/psy-drum/voice-pool.ts` - preallocated pool (size = capabilities().voices, default 16, host-overridable).
- Deterministic steal: oldest-released -> lowest-current-gain -> oldest-on; steal increments counter.
- Per-drum budget caps (kick 2, snare 2, clap 2, hat 4, tom 3, perc 4, ride 2).
- Zero heap allocations on on/off/choke/steal.
- **Done when:** allocation-counter stress test shows 0 allocations; deterministic-steal test passes.

## Phase 7 - Kit library

- `src/psy-drum/kit-library.ts` - kit manifest load, validation, provenance enforcement, hot-swap.
- `public/kits/manifest.json` - kit bank with provenance (procedural|CC0 only; UNKNOWN/QUARANTINED refused at load).
- Validation per ARCHITECTURE-STYLE.md section 6: every drum role key in the canonical enum; Hz/envelope bounds; sends 0..1; provenance present.
- **Done when:** valid kit loads; invalid kit rejected at load with counter (never at runtime); sample fallback never silent, never throws.

## Phase 8 - Variance rules (determinism)

- `src/psy-drum/variance-rules.ts` - single seeded mulberry32; seed = kit manifest seed XOR opts.seed (default 1).
- Allowed to vary (seeded): velocity micro-humanize +-3% when kit.humanize, per-hit tone/brightness variance, round-robin variant selection, clap tap jitter.
- Never varies: pitch mapping, choke logic, drop policy, role routing, kit selection.
- **Done when:** same (seed, kit, event stream, sampleRate) => bit-identical OfflineAudioContext render (render-proof).

## Phase 9 - MIDI map + learn

- `src/psy-drum/midi-map.ts` - drum MIDI note map (36=kick, 38=snare, 39=clap, 42=hat-closed, 46=hat-open, 45/48=tom, 49/57=crash, 51=ride, 33/34/56=perc) as overridable DATA.
- CC <-> per-drum parameter table; MIDI-learn mirrors psysynth (device state only, no storage I/O).
- **Done when:** map overridable; CC table + learn flow unit-tested; no WebMIDI inside the device.

## Phase 10 - Device assembly + factory

- `src/psy-drum/device.ts` - DrumDevice implements PsyDevice: onEvent (never throws), onTransport (snapshot only), onContext (kit-bank selection by style + energy macro), onStart/onStop (pool alloc + suspend safety).
- `src/psy-drum/index.ts` - `createDrumDevice(opts)` factory -> { device, load, dispose }.
- Audio graph: device subgraph -> per-drum buses -> deviceOut gain -> injected outputNode. No internal mastering.
- **Done when:** device passes contract tests; suspend-safety test (fast-release 10ms, no dangling graph).

## Phase 11 - Contract + shim-sync tests

- Contract tests: NoteEvent handling end-to-end via DeviceHost + InMemoryChannel.
- Shim-sync byte-equivalence test against foundation `4ae95d3`.
- **Done when:** all contract + shim-sync tests green.

## Phase 12 - Stress + render-proof + benchmarks

- Stress: 5min 170BPM 16th-hat loop, 0 GC dropouts; allocation counter 0 on hot path; drum trigger < 0.10ms; 16-voice full kit < 12% CPU.
- Render-proof: deterministic bit-compared OfflineAudioContext renders.
- Latency test: event-to-sound < 4ms over baseLatency.
- **Done when:** all performance budgets from ARCHITECTURE.md section 8 enforced by tests.

## Phase 13 - Style acceptance tests

- Implement all 9 style-acceptance criteria from ARCHITECTURE-STYLE.md section 7 (render-proof + assertions): FULL-ON kick, open-hat choke, snare+clap layer, HI-TECH hats, tom fill, crash choke, MIDI pad zombie check, kit switch mid-song, velocity-to-timbre.
- **Done when:** all 9 criteria pass as automated tests.

## Phase 14 - Sample layer (optional)

- `src/psy-drum/sample-layer.ts` - optional sample layer (AudioAsset) blended with synthesis via sampleGain crossfade.
- Samples procedural or CC0 only, loaded via kit manifest, provenance enforced at load; fallback to synthesis-only + counter on failure.
- **Done when:** sample/synthesis blend works; fallback path tested; no quarantined assets.

## Phase 15 - Bundle build + size budget

- `scripts/build-bundle.ts` -> `public/psydrum.js` (ESM, single file, no external runtime deps, target es2020).
- Bundle exports: createDrumDevice, DrumDevice, DRUM_ROLES, types. No globals. Samples NOT in bundle.
- Size budget: < 40KB minified.
- **Done when:** `bun run bundle` green; size < 40KB; no secrets in artifacts.

## Phase 16 - Demo page + integration proof

- Demo page wiring PSYDRUM via a DrumBridge per INTEGRATION-GUIDE.md (shared AudioContext, engine bus, transport + context).
- MIDI pad wiring (host-side WebMIDI -> NoteEvents).
- **Done when:** demo renders a psytrance-grade groove end-to-end; integration guide verified against shipped code.

## Definition of Done (repo-level)

- All tests green: `bun test` (unit + contract + stress + render-proof + style-acceptance).
- `shim-sync` green against pinned foundation commit `4ae95d3`.
- Bundle builds via `bun run bundle` (`public/psydrum.js`, single-file ESM, < 40KB).
- No secrets anywhere (`secret-scan` step in CI).
- README + 3 architecture docs + this plan consistent with shipped code.
- No quarantined/unlicensed samples. All drum sources procedural or CC0 with provenance.
