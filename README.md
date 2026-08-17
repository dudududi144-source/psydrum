# PSYDRUM

**PSY Drum Device** — the canonical drum realization device for the PSY family. Pure HOW layer, third concrete sound-producing device (after `psy-sampler` and `psysynth`). Analog-modeled drum synthesis, drum-specific organization (choke groups, kits, groove rendering), MIDI-capable, deterministic, psytrance-grade.

> **Status: BUILDING — phase 2 landed.** Phase 0 (scaffold), phase 1 (verbatim foundation shim), and phase 2 (canonical drum types, counters, measured latency) are green. Read `ARCHITECTURE.md` first, then `ARCHITECTURE-STYLE.md`, then `PSY-DRUM-IMPLEMENTATION-PLAN.md` (the phased plan; every phase ends green).

## What PSYDRUM is

A `PsyDevice` that renders drums. It consumes canonical `NoteEvent`s on drum roles and produces audio on an injected output node. It does **not** compose, does **not** own a scheduler, does **not** own transport, and never calls `new AudioContext()`.

    FOUNDATION (canonical, headless, never imported at runtime)
      Protocol: MusicalEvent / NoteEvent / MusicalTransport / MusicalContext
      Device contract: PsyDevice / DeviceHost / DeviceCapabilities
           |
           v
    DEVICES (pure HOW)
      psy-sampler (exists)  |  psysynth (exists)  |  PSYDRUM (THIS)
           |
           v
    FAMILY RUNTIME (host): shared AudioContext, shared engine bus,
      one DeviceHost, one transport per host (PSY4 / PSY6 / demo page)

## How PSYDRUM complements the family

| Device | Sound source | Lane |
|---|---|---|
| `psy-sampler` | Generic sample playback | Plays *recorded* material, any role |
| `psysynth` | Subtractive synthesis (PolyBLEP) | Plays *tonal* material: bass/lead/arp/pad/stab/pluck/keys |
| **`PSYDRUM`** | **Analog-modeled drum synthesis + optional sample layer** | **Plays *rhythm* with drum-native behavior: choke groups, per-drum tone envelopes, velocity-to-timbre, groove-accurate timing** |

Drums are not "just another sampler voice". They need: choke groups (open hat chokes closed hat), per-drum pitch/decay/tone envelopes, velocity-to-timbre mapping (louder = brighter, not just louder), click/transient control, and sub-frequency management. A dedicated device expresses this cleanly instead of overloading the generic sampler.

## Hard rules (inherited from the family, non-negotiable)

1. **Device is pure HOW.** No composition, no scheduling policy, no transport ownership, no pattern ownership. Groove/pattern content is WHAT — it arrives as events from the host.
2. **Foundation is never imported at runtime.** Contracts arrive as a VERBATIM SHIM pinned to a foundation commit, guarded by a byte-equivalence sync test (same mechanism as psy-sampler/psysynth, pinned to foundation commit `4ae95d3`).
3. **One AudioContext per host.** The device receives it at creation. It never calls `new AudioContext()`.
4. **The device outputs ONLY to the injected `outputNode`.** It never touches `ctx.destination`.
5. **Upstream reporting only via `capabilities()` and `reportLatencyMs()`.** No other side channel. No WebMIDI inside the device.

## Documents

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Position, module map, contract handling, audio engine, timing, determinism, MIDI, performance budget, audit-lesson compliance, observability, build |
| `ARCHITECTURE-STYLE.md` | The psytrance-grade drum spec: canonical roles, per-subgenre kits, FX contract, timing feel, kit schema, style acceptance criteria |
| `INTEGRATION-GUIDE.md` | How a host (PSY4/PSY6/demo) wires PSYDRUM via a DrumBridge |
| `PSY-DRUM-IMPLEMENTATION-PLAN.md` | Phased build plan (each phase ends green) |

## Definition of Done (repo-level, preview)

- All tests green: `bun test` (unit + contract + stress + render-proof + style-acceptance).
- `shim-sync` green against pinned foundation commit.
- Bundle builds via `bun run bundle` (`public/psydrum.js`, single-file ESM, target < 40KB).
- No secrets anywhere (`secret-scan` step in CI).
- README + 3 architecture docs consistent with shipped code.
- No quarantined/unlicensed samples. All drum sources procedural or CC0 with provenance.
