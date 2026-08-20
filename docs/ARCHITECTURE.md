# PSYDRUM - Professional Architecture

Target architecture for PSYDRUM as a high-quality engineering product.

## 1. Layered Architecture

Host (demo/psysynth/psy-sampler) -> injects ctx + content
DrumDevice (PsyDevice contract) -> orchestration only
Sequencer | VoicePool | FX | Sample loading -> domain modules
Engines (ACB kick/snare/hat/cymbal) -> pure DSP, no I/O
Primitives (filters, PRNG, envelopes) -> reusable building blocks

Rules:
- Upper layers depend on lower layers, never the reverse.
- Domain modules communicate through the device, not directly.
- Engines are pure DSP with no DOM or I/O.
- Primitives have zero knowledge of drums.

## 2. Core Contracts

PsyDevice: onStart/onStop, onEvent, onContext, capabilities.
TransportClock: shared BPM/beat/bar sync across the family.
VoicePool: allocates/recycles voices (pure bookkeeping). The device owns the per-voice audio handles and silences/disposes them (audit V4).

## 3. Module Responsibilities

- device.ts: orchestration, contract implementation.
- voice-pool.ts: voice allocation/recycling.
- fx.ts: procedural reverb IR. master-fx.ts: optional host-side master chain (not wired inside the device, rule 4.5).
- acb.ts: ACB engines (kick/snare/hat/cymbal).
- filters.ts: SVF, Moog, one-pole.
- transport.ts: TransportClock.

## 4. Testing Strategy

- Unit tests for every module.
- Render-proof tests for every engine.
- Integration tests for device + voice-pool + fx.
- No DOM in library code.

## 5. Quality Gates

1. bun test green.
2. scripts/check.ts green.
3. Bundle size < 40KB.
4. No new any types.

## 6. Roadmap to Production

1. Stabilize - fix all known bugs (done: M0 hotfixes V1-V6, audited + regression-tested).
2. Extract - move demo-only features into the library.
3. Integrate - wire TransportClock + Context Sharing with psysynth.
4. Polish - velocity layers, round-robin samples, commercial sound.
