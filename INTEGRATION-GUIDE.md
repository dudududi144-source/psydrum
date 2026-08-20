# PSYDRUM Integration Guide

How to connect the PSY Drum Device to any PSY family host (PSY4, PSY6, or future products). Mirror of psysynth's integration pattern, adapted for drums + MIDI pads.

## Architecture Recap

    Host (PSY4/PSY6/future)
      |
      Composition Engine -> NoteEvent { type:'note', note, velocity, duration, channel, at }
      |
      DrumBridge (adapter in host)
      |
      DeviceHost + InMemoryChannel (foundation contract)
      |
      DrumDevice (this repo)
      |
      Audio output -> host engine bus (shared AudioContext)

## Step 1 - Build the drum bundle

    cd psydrum
    bun run scripts/build-bundle.ts
    # -> public/psydrum.js (ESM, single file)

## Step 2 - Copy bundle and samples to host

    cp psydrum/public/psydrum.js   host/public/
    # kits ship INSIDE the bundle (BUILTIN_KIT_MANIFEST) — no kits directory to copy
    cp -r psydrum/public/samples   host/public/   # only samples with clean provenance

## Step 3 - Create DrumBridge in the host

The bridge converts host-internal drum hits to canonical NoteEvents and routes them through a DeviceHost. Minimal reference:

    import { InMemoryChannel, DeviceHost } from './drum-bridge-contracts'

    export class DrumBridge {
      readonly host: DeviceHost

      constructor() {
        const channel = new InMemoryChannel('host-drums')
        this.host = new DeviceHost(channel)
      }

      // Host produced a drum hit (composition path)
      publishHit(at: number, role: string, velocity: number, note?: number, duration = -1): void {
        // role MUST be a canonical DrumRole. note is OPTIONAL and only for pitched drums.
        this.host.publish({ type: 'note', note: note ?? 0, velocity, duration, channel: role, at })
      }

      // MIDI pad path (hold mode for ride/shaker-loop; one-shot otherwise)
      publishPadOn(at: number, role: string, midi: number, velocity: number): void {
        this.host.publish({ type: 'note', note: midi, velocity, duration: -1, channel: role, at })
      }
      publishPadOff(at: number, role: string, midi: number): void {
        this.host.publish({ type: 'note', note: midi, velocity: 0, duration: 0, channel: role, at })
      }

      // Transport changed
      publishTransport(snap: { bpm: number; bar: number; revision: number }): void {
        this.host.pushTransport({
          bpm: snap.bpm, beat: snap.bar * 4, bar: snap.bar,
          beatsPerBar: 4, beatTime: 0, barTime: 0,
          phase: 0, barPhase: 0, confidence: 1, locked: true,
          revision: snap.revision,
          origin: { audioTime: 0, beatIndex: 0, bpm: snap.bpm },
          lastObservationAgo: 0, observationCount: 1,
        }, 0)
      }
    }

Bridge rules (do not violate):
1. channel must be a canonical DrumRole: kick | snare | clap | hat-closed | hat-open | tom | perc | ride | crash. Unknown values are dropped by the device (and counted).
2. Never fabricate pitch for unpitched drums - pass note:0 (ignored by the device) or omit. Never pass a guessed pitch that could be mistaken for tuning.
3. at is AudioContext time. The bridge does not add latency compensation; the device reports its own.
4. Groove/swing is applied by the host BEFORE publishHit (by choosing at). The device renders event.at exactly.

## Step 4 - Load the drum device in the host page

    // After host engine init (AudioContext available):
    const { DrumBridge } = await import('../lib/drum-bridge')
    const bridge = new DrumBridge()
    composer.attachDrumBridge(bridge)   // host-side seam (like attachSamplerBridge/attachSynthBridge)

    const drumModule = await import('/psydrum.js')
    const { device } = drumModule.createDrumDevice({
      ctx: engine.audioContext,               // SHARED - never create your own
      outputNode: engine.engineBusInput,      // SHARED master bus
      optsSeed: 1,
      // optional: config (DrumConfig), kitPatches, noteMap
    })
    // Kit choice is a HOST decision (style/energy): pick from a manifest and
    // loadKit. The device never selects kits by itself.
    const manifest = drumModule.BUILTIN_KIT_MANIFEST
    const kit = manifest.kits.find((k) => k.style === contextStyle) ?? manifest.kits[0]
    device.loadKit(kit)
    bridge.host.register(device)
    device.onStart()

## Step 5 - Feed transport and context

- On every tempo/beat update: bridge.publishTransport(snapshot).
- On style/section change: bridge.host.pushContext({ key, rootPc, scale, energy, style, section, beatsPerBar }) - the HOST switches kits accordingly via device.loadKit (the device stores the context snapshot but never selects kits by itself).

## MIDI Pad Wiring (host side)

    // WebMIDI lives in the HOST/bridge, never in the device
    const access = await navigator.requestMIDIAccess()
    const PAD_MAP = { 36:'kick', 38:'snare', 39:'clap', 42:'hat-closed', 46:'hat-open', 45:'tom', 51:'ride', 49:'crash', 33:'perc' }
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => {
        const [status, data1, data2] = e.data
        const cmd = status & 0xf0
        const role = PAD_MAP[data1]
        if (!role) return                        // unmapped pad note -> ignore (do NOT coerce)
        const t = engine.audioContext.currentTime + 0.003
        if (cmd === 0x90 && data2 > 0) bridge.publishPadOn(t, role, data1, data2 / 127)
        else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) bridge.publishPadOff(t, role, data1)
        else if (cmd === 0xB0) drums.setParameterByCC(data1, data2 / 127)  // via midi-map
      }
    }

## Voice Budget Negotiation

Declare per-host budgets at creation via the config: createDrumDevice({ ..., config: { ...defaultDrumConfig(), voices: 12 } }) when running alongside sampler + synth on the same bus. Default 16 (defaultDrumConfig). The pool hard-caps at this value; steals are deterministic and counted.

## Kick-onset sidechain hook (optional)

If the host sidechains the synth/bass bus on the kick, PSYDRUM can publish kick-onset timing via capabilities().onsetReporting. The host subscribes and ducks its bass bus. Ducking itself stays host-side (FX contract). If the host does its own kick detection from audio, this hook is not needed.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Silence, unknownChannel counter rising | non-canonical channel strings | map host drum names to the 9 canonical roles |
| Kick pitched wrong | host passed a guessed pitch for the kick | pass note:0 / omit for unpitched drums (device ignores note for unpitched anyway) |
| Open-hat doesn't choke closed | kit choke config off | enable kit.choke.hat = 'exclusive' |
| Steal clicks on fast hats | budget too low at high BPM | raise maxVoices or raise hat budget cap |
| Two clocks fighting | host added a device-side scheduler | remove it; device is clock-free by design |
| Sample silent, synth fallback counter rising | sample failed license check or load | ensure samples are procedural/CC0 and manifest assetId resolves |
