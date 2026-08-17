# PSYDRUM vs The Family — A Brutally Honest Audit

> Written on demand. No marketing. The goal: kill the toy, ship the instrument.

## TL;DR

PSYDRUM today is a **well-architected demo wearing a toy's clothes**. The device layer
(contract, routing, choke, voice-pool, kit-library, determinism, tests) is genuinely
strong and matches family standards. But the **sound is OscillatorNode-lite** and the
**UI is a web-page, not an instrument**. Compared to PsySynthPro it's a prototype next
to a product. The fix is not more features — it's **rebuilding the surface + upgrading
the DSP**, using the device code we already have.

---

## 1) The sound: the ugly truth

PSYDRUM's voices are `OscillatorNode` + `BiquadFilterNode` + noise buffer. That's the
Web Audio **toy tier**. PsySynthPro runs **AudioWorklet, 48kHz per-sample DSP**:

| What PsySynthPro has | What PSYDRUM has | Verdict |
|---|---|---|
| PolyBLEP band-limited osc | raw OscillatorNode (aliasing) | PSYDRUM aliasing on every kick |
| ZDF state-variable filter (zero-delay feedback) | BiquadFilterNode | PSYDRUM filters sound digital/thin |
| Analog one-pole exponential ADSR | linearRamp/exponentialRamp gain | PSYDRUM envelopes feel stiff |
| FM (DX7-style instantaneous freq) | none | no FM punch on the kick |
| Convolution reverb + feedback delay | procedural IR convolver + simple delay | decent, not lush |

**Verdict:** the kick/snare are "correct" but **lifeless**. A psy kick needs a fast
pitch-drop + FM click + saturation to hit. PSYDRUM's kick is a sine sweep — it goes
"boop", not "DONK". The user is right: this is children's-table stuff next to PsySynthPro.

**What to do (steal from the family, don't reinvent):**
- psy5/`foundation/dsp/oscillators.ts` + `filters.ts` + `envelopes.ts` already implement
  real DSP (PolyBLEP, ZDF, one-pole ADSR) in the family. PSYDRUM should **port the kick
  voice to AudioWorklet** using those algorithms, not OscillatorNode.
- Add **FM pitch-click** to the kick (PsySynthPro's FM stage is the reference).
- Add **saturation/drive** as a real waveshaper stage (we already have driveDb — wire it
  into a proper drive curve + optional drive pre-gain).

---

## 2) The UI: a web-page, not an instrument

PSYDRUM's UI is a vertical stack of `div.row` buttons + `<input type=range>` sliders.
PsySynthPro is a **hardware chassis**: brushed-metal body, **wood cheeks, corner screws,
SVG rotary knobs with tick marks** (drag-vertical, scroll, double-click reset), glowing
pointer, a 3D perspective spectrum, performance macros. It looks like a **rack unit**.

**Verdict:** PSYDRUM's UI reads as "developer demo". There is no chassis, no knobs, no
hardware metaphor. Nobody looks at it and thinks "instrument".

**What to do:** rebuild `public/index.html` as a **chassis**:
- Chassis body (brushed metal gradient, wood cheeks, corner screws).
- **SVG knobs** (port PsySynthPro's `Knob`) for mixer levels + delay/reverb sends.
- Professional 16-step grid with 3-state steps + playing-step highlight.
- Header with branding + a master section.
- Keep the device code 100% — only the **view** changes.

---

## 3) Roasting the family (fair is fair)

- **PsySynthPro**: gorgeous DSP + chassis, but it's a **monolith** — one 106KB index.html
  with CSS+JS inlined, no device contract, no foundation shim, hand-rolled everything.
  It can't compose with the family. Great instrument, poor citizen.
- **psy5**: incredible foundation (250 tests, 13 packages) but it's **infrastructure, not
  an instrument**. You can't play a foundation. All gravity, no stage.
- **psy4**: "radio-following" engine — ambitious, but it's a **live engine**, not a
  playable drum device. And it's HTML-soup.
- **psysynth / psy-sampler**: canonical device-contract members (the good pattern PSYDRUM
  follows), but their surfaces are reference-grade, not pro.

**PSYDRUM's edge:** it's the **only one that's BOTH a proper family citizen (device-sdk,
verbatim shim, determinism, 200+ tests) AND a dedicated drum instrument**. That's the
potential. The gap is only the **surface + the DSP depth**, not the bones.

---

## 4) Reference: what real drum machines cost/offer

Real drum machines people pay serious money for (Elektron Digitakt, Roland TR-8S, Arturia
DrumBrute, Maschine) all share: **per-drum sound design knobs, a tactile step grid,
per-step accents/retriggers, swing, per-drum FX sends, and a hardware look**. PSYDRUM has
the data model for most of this already (kits, mixer, FX sends, swing, sequencer). What it
lacks is the **surface** to expose it like a real machine. That's a UI job, not a DSP job.

---

## 5) The verdict + the plan

**Keep:** the entire `src/psy-drum/` device layer. It's the strongest part. Do not throw it.
**Kill:** the toy UI (`public/index.html` current). Rebuild it.
**Upgrade:** kick/snare DSP toward PsySynthPro-grade (PolyBLEP/ZDF/FM/saturation).

**The move from demo→pro is 80% a UI rebuild + a DSP-depth pass, using code we already own.**
