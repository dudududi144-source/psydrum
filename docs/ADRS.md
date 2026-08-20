# Architecture Decision Records (ADRs)

This document records the key architectural decisions for PSYDRUM, so the
reasoning behind the design is preserved and the project can be built as a
high-quality engineering product.

---

## ADR-001: WHAT/HOW Separation

**Status**: Accepted

**Context**: A drum machine can be split into *content* (patterns, kits,
styles) and *engine* (synthesis, effects, sequencing). Mixing them makes the
device non-portable across the PSY family.

**Decision**: PSYDRUM is a pure **HOW layer** (`DrumDevice` implements the
`PsyDevice` contract). All WHAT content lives in `presets.ts` / `grooves.ts`
and is injected at load time.

**Consequences**:
- The device is reusable by `psysynth` and `psy-sampler`.
- Content can be swapped without touching the engine.
- The engine must never hard-code pattern content.

---

## ADR-002: Deterministic Rendering

**Status**: Accepted

**Context**: For reproducible renders (and CI render-proof tests), the same
input must always produce the same audio.

**Decision**: All randomness uses a seeded `mulberry32` PRNG. No `Math.random`
in any render path.

**Consequences**:
- Renders are bit-identical across runs.
- CI can assert spectral properties of rendered audio.

---

## ADR-003: Sample Layer as an Overlay, Not a Replacement

**Status**: Accepted

**Context**: Real samples give commercial sound, but the device must still work
with zero samples (pure synthesis).

**Decision**: Samples are an optional overlay. `setSample` + `enableSampleLayer`
blend the sample with the synthesized voice. If no sample is loaded, the
synthesis path is used.

**Consequences**:
- The device is never "silent" without samples.
- Samples can be hot-loaded at runtime.
- Velocity-to-timbre is limited for pre-rendered samples (see ADR-004).

---

## ADR-004: Velocity-to-Timbre Limitation (Pre-Rendered Samples)

**Status**: Accepted

**Context**: Pre-rendered samples have a fixed timbre. Velocity can only scale
their gain, not change their timbre.

**Decision**: For pre-rendered samples, velocity maps to gain. For synthesis
voices, velocity can map to timbre (cutoff, brightness). This is documented as
a known limitation.

**Consequences**:
- Commercial-grade velocity expression requires either real-time synthesis or
  multi-layer samples (round-robin / velocity layers).

---

## ADR-005: The Demo Is a Prototype, Not the Product

**Status**: Accepted

**Context**: The demo (`public/index.html`) is a single-file prototype with
inline JS. It is fragile and not tested.

**Decision**: The demo is a *demonstration* of the engine, not the product.
The product is the `src/psy-drum/` library. The demo should be treated as
disposable.

**Consequences**:
- Features added only to the demo are not "done" until they are in the library
  and tested.
- The demo may be rewritten or removed without affecting the product.

---

## ADR-006: Bundle Size Budget

**Status**: Accepted

**Context**: The device targets a small bundle (<40KB) for fast loading.

**Decision**: The bundle must stay under 40KB. Any feature that pushes it over
must be optimized or deferred.

**Consequences**:
- Features are weighed against bundle cost.
- Tree-shaking and minimal dependencies are required.

---

## ADR-007: Render-Proof Testing

**Status**: Accepted

**Context**: Unit tests on DSP code can pass while the audio sounds wrong.

**Decision**: All sound-producing code must have render-proof tests that
measure the actual rendered audio (spectral energy, transients, decay).

**Consequences**:
- Tests catch "sounds wrong" bugs that unit tests miss.
- CI runs the full render-proof suite.

---

## ADR-008: Hybrid Buffer Bank for Drum Realization

**Status**: Accepted (opt-in via useBank)

**Context**: The realtime voice-synth chains are WebAudio-native and cheap, but the
ACB offline engines (SVF resonance, oversampled drive) demonstrably sound better —
the render-proof tests prove it. The offline engines, however, cannot modulate
per-hit at realtime. Both are needed: the sound AND the expression.

**Decision**: PSYDRUM supports a hybrid buffer bank. When `useBank: true`, the
device pre-renders a bank of BANK_VELOCITY_LAYERS (3, gain-layered) x
BANK_VARIANTS (2, seeded-noise / micro-detune round-robin) per banked role
(kick / snare / hat-closed / hat-open — exactly the roles with ACB engines) at
load time, deterministic per device seed. At trigger time the humanized
velocity picks the layer and a round-robin hit counter picks the variant.
Envelope / choke / steal / stop ramps apply to bank voices exactly as to
synth voices (VoiceAudioHandle). Roles without offline engines (clap / tom /
perc) fall through to realtime synthesis. The bank is rebuilt on loadKit.
Default stays `useBank: false` until host/demo adoption.

**Consequences**:
- Velocity-to-timbre on pre-rendered material is gain-layered (ADR-004 known
  limitation; true multi-layer samples or realtime engines are future work).
- roundRobinVariant and the variance machinery get a real home.
- One-time load-time render cost (~24 short offline renders) on the main
  thread; the audio hot path stays allocation-free.
- Determinism preserved: same (patches, sampleRate, seed) => identical bank.
