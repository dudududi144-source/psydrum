# PSYDRUM Style Architecture

The psytrance-grade requirement, made explicit for drums. Style lives in DATA (kits + subgenre presets + groove banks), never in device code. Device code is genre-agnostic; this document defines the genre content it must express.

## 1. WHAT/HOW Split for Drums

| Concern | Owner | Example |
|---|---|---|
| Which drums, which pattern, when | Host composer (WHAT) | kick on every beat, offbeat open-hat at bar 9 |
| How a drum sounds | psysynth kit patch (HOW) | kick: sine 150->45Hz, click 30%, drive 4dB |
| Which kit fits the genre | Host onContext(style) -> device kit switch | style=DARK-PSY => darkpsy kit |
| Groove/swing timing | Host (WHAT) | swing 12%, host-owned |
| How a groove renders once timed | psysynth (HOW) | render event.at exactly, < 2ms jitter |

The device never decides "play an offbeat hat". It renders whatever arrives with the right character. Groove *content* is WHAT; groove *rendering fidelity* is HOW.

## 2. Canonical Drum Roles - Full Specs

Every value below is a KIT PARAMETER DEFAULT, overridable per kit/patch. DrumRole enum (audit B10: capabilities advertises EXACTLY this set):

    export const DRUM_ROLES = ['kick','snare','clap','hat-closed','hat-open','tom','perc','ride','crash'] as const

### 2.1 kick (the foundation of psy)

| Param | Value (FULL-ON default) | Notes |
|---|---|---|
| body | sine, startHz 150, endHz 45, pitchDecayMs 90 | the "boom" |
| click | noise burst, clickAmount 0.3, clickHz hp 3000 | transient attack |
| drive | 0..6dB pre-saturation | weight/punch |
| filter | LPF cutoff 200Hz, res 0.1 | tame click ring |
| amp | attack 0.3ms, decay 180ms, release 40ms | sidechain-ready: fast release |
| velTrack | gain + cutoff depth | louder = punchier |
| choke | none | |
| required behavior | zero retrigger clicks at 16th repeats; no DC thump; sub present after HPF check on small speakers | click-free gate test mandatory |

Sub-styles: FULL-ON kick (punchy, mid decay), DARK-PSY kick (heavier sub, longer tail), HI-TECH kick (tighter, faster decay).

### 2.2 snare

| Param | Value |
|---|---|
| tone | osc tuneHz 180..240 |
| noise | bp noise, noiseTone mix 0.6 |
| amp | attack 0.3ms, decay 140ms |
| velTrack | gain + noise brightness |
| choke | none |

### 2.3 clap

| Param | Value |
|---|---|
| taps | 3..4 taps over clapSpreadMs 20..35 |
| color | band-pass 900..1400Hz |
| amp | per-tap fast decay, tail 120ms |

### 2.4 hats (closed + open, choke pair)

| Param | closed | open |
|---|---|---|
| source | metallic (ring-mod/square-mix/filtered noise) | same |
| highpass | 7kHz | 6.5kHz |
| decay | 40..70ms | 300..600ms |
| choke | chokes open | chokes closed (exclusive) |
| required behavior | open-hat trigger fully chokes active closed-hat < 3ms; no click on choke |

### 2.5 tom

| Param | Value |
|---|---|
| body | sine w/ pitch drop (like kick, higher startHz 200..320) |
| amp | decay 250..400ms |
| pitch | uses optional NoteEvent pitch hint within safe range |

### 2.6 perc (conga/bongo/shaker/rim flavors)

| Param | Value |
|---|---|
| type | short tone/noise hybrid, configurable flavor |
| amp | decay 60..200ms |
| variance | seeded per-hit brightness +-5% (the organic feel) |

### 2.7 ride / crash

| Param | ride | crash |
|---|---|---|
| source | metallic noise + strong ping tone | metallic noise, less ping |
| decay | 800..1500ms | 1200..2500ms |
| choke | self-choke (new ride chokes prev, max-poly 2) | self-choke (max-poly 2) |

## 3. Subgenre Kit Banks

A kit bank = { drum patch overrides + macro tuning } selected by onContext(style). All values are defaults per bank.

| Subgenre | Typical BPM | Kick character | Hats | Snare/clap | Energy macro character |
|---|---|---|---|---|---|
| FULL-ON | 142-148 | punchy, mid decay | tight closed, offbeat open | clap on 2&4 | driving, wide |
| DARK-PSY | 155-165 | heavy sub, longer tail | darker, busier | lower snare, sparse clap | bass weight + drive |
| PROGRESSIVE | 136-140 | warm, round | groovy 16ths, ghost hats | snare + clap layered | pluck-ish, groovy |
| GOA | 140-146 | organic, mid | live-feel, percussive | hand-drum flavor | melodic, organic |
| HI-TECH | 168-200 | very tight, fast | rapid 16th/32nd closed | tight snare, gated | density + speed |
| FOREST | 140-150 | organic, mid-dark | sparse, textural | perc-heavy, woody | texture + groove |

Bank selection is a host decision via MusicalContext.style; unknown style => FULL-ON defaults + counter.

## 4. FX Interaction Contract

The drums do NOT own delay/reverb/ducking. Conventions with the host:

1. Sidechain: host ducks the synth/bass bus on kick (psy3-clean lineage). The kick amp envelope must have release <= 40ms so ducking reads as pumping. PSYDRUM publishes kick-onset events if the host needs them for duck timing (capabilities flag), but ducking itself is host-side.
2. Delay: host provides delaySend node. Drum sends (perc/ride) are level-only.
3. Reverb: host provides reverbSend node. Drum sends per kit (snare/clap/perc higher; kick/hats lower).
4. Drive/saturation: device-internal per-drum drive (pre-saturation 0..6dB) is allowed; bus mastering is not.
5. If host send nodes are absent, sends collapse silently into outputNode (no errors, counter increments).

## 5. Timing Feel Contract (groove rendering)

- Grid: 16th resolution is the design grid (hat decay, kick gate math).
- Groove/swing: arrives as event timing from the host; device renders event.at exactly; never applies its own swing or quantization.
- Guarantee: < 2ms jitter between event.at and audible onset.
- Live play (MIDI pads): no quantization in device; host decides.
- Determinism: same (seed, kit, event stream, sampleRate) => identical render (bit-compared in OfflineAudioContext).

## 6. Kit Schema (KitManifest — src/psy-drum/kit-library.ts)

Kit manifests follow the KitManifest type and are validated by loadKitManifest.
Built-in kits ship inside the module (BUILTIN_KIT_MANIFEST in src/psy-drum/kit-builtin.ts);
hosts may load external manifests at load time, and the demo can export the built-in
manifest as JSON. There is no public/kits directory in the repo (M1 correction).

    {
      "manifestVersion": 1,
      "seed": 1,
      "kits": [
        {
          "id": "kit-fullon-a",
          "style": "FULL-ON",
          "provenance": { "author": "psydrum", "license": "procedural", "created": "2026-08-17" },
          "drums": {
            "kick": {
              "body": { "wave": "sine", "startHz": 150, "endHz": 45, "pitchDecayMs": 90 },
              "click": { "amount": 0.3, "hpHz": 3000 },
              "filter": { "cutoff": 200, "res": 0.1 },
              "amp": { "attackMs": 0.3, "decayMs": 180, "releaseMs": 40 },
              "driveDb": 3,
              "sends": { "delay": 0.0, "reverb": 0.05 },
              "sample": { "assetId": null, "gain": 0.0 }
            },
            "hat-closed": { "...": "..." },
            "...": "..."
          },
          "humanize": true,
          "choke": { "hat": "exclusive", "crashMaxPoly": 2, "rideMaxPoly": 2 }
        }
      ]
    }

Validation rules: every drum role key must be in the canonical DrumRole enum; Hz/envelope bounds enforced; sends 0..1; provenance present with license in {procedural, CC0}; sample.assetId must resolve to a licensed asset or be null. Invalid kit => rejected at load with counter; never at runtime.

## 7. Style Acceptance Criteria (the sound test)

A build is psytrance-grade only if ALL pass (render-proof + listening panel):

1. FULL-ON kick 145 BPM: 16th kick at vel 0.8/0.9 alternating - audible punch, zero retrigger clicks, sub present on small speakers after HPF check.
2. Open-hat choke: trigger closed-hat, then open-hat 30ms later - closed fully gone < 3ms after open onset; no click artifact.
3. Snare + clap layer at 140: layered transient reads as one hit, no phase smear; noise tail natural.
4. HI-TECH hats at 175 BPM: 32 consecutive 16ths, zero steal artifacts, per-hit brightness variance audible but deterministic (same seed => same render, bit-compared in OfflineAudioContext).
5. Tom fill: 4 toms with pitch hints render in correct relative pitch, safe range respected, no coercion.
6. Crash choke: two crashes 100ms apart - second chokes first cleanly, max-poly honored.
7. MIDI pads: rapid on/off cycles on hat/ride leave zero zombie voices (pool state assertion); hold-mode ride sustains until note-off.
8. Kit switch mid-song (section event): no clicks, no dropped hits, < 5ms switch cost.
9. Velocity-to-timbre: vel 0.3 vs 1.0 on the same drum - clearly brighter at 1.0, not just louder (spectral-centroid assertion).
