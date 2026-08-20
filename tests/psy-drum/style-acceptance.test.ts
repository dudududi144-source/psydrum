// Style acceptance tests — ARCHITECTURE-STYLE.md section 7, encoded as
// device-level contract tests.
//
// Section 7 demands "render-proof + listening panel". Bun has no WebAudio, so
// the parts that are CONTRACTUAL (timing windows, choke ramps, pitch math,
// determinism, counters) are asserted here against a recording mock; the parts
// that are purely spectral (HPF sub check, phase smear) remain render-proof /
// listening-panel work and are marked as such per criterion.

import { describe, it, expect } from 'bun:test'
import { createDrumDevice } from '../../src/psy-drum/device'
import { CHOKE_TARGET_GAIN } from '../../src/psy-drum/choke'
import { midiToHz } from '../../src/psy-drum/voice-synth'
import { BUILTIN_KIT_MANIFEST } from '../../src/psy-drum/kit-builtin'
import type { DrumRole } from '../../src/psy-drum/types'

// ─── Recording mock AudioContext ─────────────────────────────────────────────

interface RecParam {
  value: number
  cancels: number
  setValues: Array<{ v: number; t: number }>
  linRamps: Array<{ v: number; t: number }>
  setValueAtTime: (v: number, t: number) => void
  linearRampToValueAtTime: (v: number, t: number) => void
  exponentialRampToValueAtTime: (v: number, t: number) => void
  cancelScheduledValues: (t: number) => void
}

function countingParam(value: number): RecParam {
  const setValues: Array<{ v: number; t: number }> = []
  const linRamps: Array<{ v: number; t: number }> = []
  const p: RecParam = {
    value: value,
    cancels: 0,
    setValues: setValues,
    linRamps: linRamps,
    setValueAtTime: (v: number, t: number): void => { setValues.push({ v: v, t: t }) },
    linearRampToValueAtTime: (v: number, t: number): void => { linRamps.push({ v: v, t: t }) },
    exponentialRampToValueAtTime: (): void => {},
    cancelScheduledValues: (): void => { p.cancels = p.cancels + 1 },
  }
  return p
}

interface RecGain { gain: RecParam }
interface RecOsc { frequency: RecParam }
interface RecSource { stopTimes: number[] }
interface RecBiquad { frequency: RecParam }

function makeStyledDevice(optsSeed: number, noteMap?: Record<number, DrumRole>) {
  const gains: RecGain[] = []
  const oscs: RecOsc[] = []
  const sources: RecSource[] = []
  const biquads: RecBiquad[] = []
  const node = () => ({ connect: () => {}, disconnect: () => {} })
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    baseLatency: 0.005,
    createGain: () => {
      const g = { ...node(), gain: countingParam(1) }
      gains.push(g)
      return g
    },
    createOscillator: () => {
      const o = { ...node(), type: 'sine', frequency: countingParam(100), start: () => {}, stop: () => {} }
      oscs.push(o)
      return o
    },
    createBiquadFilter: () => {
      const b = { ...node(), type: 'lowpass', frequency: countingParam(1000), Q: countingParam(1) }
      biquads.push(b)
      return b
    },
    createBuffer: (_c: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length), length: length, sampleRate: sr, numberOfChannels: 1,
    }),
    createBufferSource: () => {
      const s: RecSource = { stopTimes: [] }
      sources.push(s)
      return { ...node(), buffer: null, start: () => {}, stop: (t: number) => { s.stopTimes.push(t) } }
    },
    createWaveShaper: () => ({ ...node(), curve: null, oversample: 'none' }),
    createDelay: () => ({ ...node(), delayTime: countingParam(0.28) }),
    createConvolver: () => ({ ...node(), buffer: null }),
  }
  const { device } = createDrumDevice({
    ctx: ctx as unknown as BaseAudioContext,
    outputNode: { ...node() } as unknown as AudioNode,
    optsSeed: optsSeed,
    noteMap: noteMap,
  })
  device.onStart()
  function trigger(note: number, channel: string, velocity: number) {
    const g0 = gains.length
    const b0 = biquads.length
    device.onEvent({ type: 'note', note: note, velocity: velocity, duration: 0.1, channel: channel, at: 0 })
    return { voiceGains: gains.slice(g0), voiceBiquads: biquads.slice(b0) }
  }
  return { device, trigger, gains, oscs, sources, biquads }
}

function rampTo(g: RecGain, target: number): { v: number; t: number } | null {
  for (const r of g.gain.linRamps) {
    if (Math.abs(r.v - target) < 1e-9) return r
  }
  return null
}

// ─── 1. kick retrigger: zero retrigger clicks ────────────────────────────────
// (The HPF/sub spectral check is render-proof/listening-panel work.)

describe('style 1 - kick retrigger has no clicks', () => {
  it('every kick envelope starts at ~0 and attacks upward (0.8/0.9 alternate)', () => {
    const { device, trigger } = makeStyledDevice(3)
    const vels = [102, 114, 102, 114] // ~0.8 / 0.9 alternating
    for (let i = 0; i < vels.length; i++) {
      const k = trigger(36, 'kick', vels[i])
      expect(k.voiceGains.length).toBe(1)
      const env = k.voiceGains[0].gain
      expect(env.setValues.length).toBeGreaterThanOrEqual(1)
      expect(env.setValues[0].v).toBeCloseTo(0.0001, 9) // starts at ~0: no step, no click
      expect(env.linRamps.length).toBeGreaterThanOrEqual(1)
      expect(env.linRamps[0].v).toBeGreaterThan(0.5) // attacks up to the peak
    }
    expect(device.getCounters().eventsDropped).toBe(0)
  })
})

// ─── 2. open-hat choke: closed fully gone < 3ms ─────────────────────────────

describe('style 2 - open hat chokes closed hat under 3ms', () => {
  it('the closed hat is cancelled and ramped to -60dB within the budget', () => {
    const { trigger } = makeStyledDevice(3)
    const closed = trigger(42, 'hat-closed', 100)
    trigger(46, 'hat-open', 100)
    const g = closed.voiceGains[0]
    expect(g.gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(g, CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeLessThanOrEqual(0.003)
  })
})

// ─── 3. snare + clap layer reads as one hit ─────────────────────────────────
// (Phase-smear judgement is listening-panel work; the contract part: both
// voices realize at the same instant, nothing dropped.)

describe('style 3 - snare + clap layer at the same instant', () => {
  it('both voices realize, nothing is dropped', () => {
    const { device, trigger } = makeStyledDevice(3)
    const snare = trigger(38, 'snare', 100)
    const clap = trigger(39, 'clap', 100)
    expect(snare.voiceGains.length).toBeGreaterThanOrEqual(2) // noise + tone
    expect(clap.voiceGains.length).toBeGreaterThanOrEqual(3)  // 3 stacked noise taps
    expect(device.getCounters().eventsDropped).toBe(0)
    expect(device.getCounters().voicesOn).toBe(2)
  })
})

// ─── 4. hi-tech 32 consecutive 16th hats ────────────────────────────────────

describe('style 4 - 32 consecutive hats: steals clean, variance deterministic', () => {
  function run32(seed: number): { peaks: string[]; stolen: number; dropped: number } {
    const { device, trigger } = makeStyledDevice(seed)
    const peaks: string[] = []
    for (let i = 0; i < 32; i++) {
      const h = trigger(42, 'hat-closed', 100)
      peaks.push(h.voiceGains[0].gain.linRamps[0].v.toFixed(9))
    }
    return { peaks: peaks, stolen: device.getCounters().voicesStolen, dropped: device.getCounters().eventsDropped }
  }

  it('cap-steals exactly the excess, drops nothing', () => {
    const r = run32(41)
    expect(r.stolen).toBe(28) // 32 hits against a cap of 4
    expect(r.dropped).toBe(0)
  })

  it('humanized levels vary (anti machine-gun) but same seed => identical sequence', () => {
    const a = run32(41)
    const b = run32(41)
    expect(new Set(a.peaks).size).toBeGreaterThan(1)
    expect(a.peaks).toEqual(b.peaks) // determinism: bit-identical at this layer
  })

  it('the stolen oldest hat is silenced in audio', () => {
    const { trigger } = makeStyledDevice(41)
    const first = trigger(42, 'hat-closed', 100)
    for (let i = 1; i < 5; i++) trigger(42, 'hat-closed', 100)
    expect(first.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    expect(rampTo(first.voiceGains[0], CHOKE_TARGET_GAIN)).not.toBeNull()
  })
})

// ─── 5. tom fill: correct relative pitch, safe range, no coercion ───────────

describe('style 5 - tom fill relative pitch', () => {
  it('four hinted toms ascend with exact MIDI ratios inside the safe band', () => {
    const map: Record<number, DrumRole> = { 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom' }
    const { oscs, trigger } = makeStyledDevice(3, map)
    const notes = [45, 47, 48, 50]
    const freqs: number[] = []
    for (let i = 0; i < notes.length; i++) {
      const o0 = oscs.length
      trigger(notes[i], 'tom', 100)
      freqs.push(oscs[o0].frequency.value)
    }
    expect(freqs[0]).toBeCloseTo(midiToHz(45), 6)
    expect(freqs[1] / freqs[0]).toBeCloseTo(Math.pow(2, 2 / 12), 6)
    expect(freqs[2] / freqs[1]).toBeCloseTo(Math.pow(2, 1 / 12), 6)
    expect(freqs[3] / freqs[2]).toBeCloseTo(Math.pow(2, 2 / 12), 6)
    for (const f of freqs) {
      expect(f).toBeGreaterThanOrEqual(70)
      expect(f).toBeLessThanOrEqual(420)
    }
  })
})

// ─── 6. crash choke: max-poly honored ───────────────────────────────────────

describe('style 6 - crash self-choke honors maxPoly 2', () => {
  it('two crashes coexist; the third chokes the oldest within the budget', () => {
    const { device, trigger } = makeStyledDevice(3)
    const c1 = trigger(49, 'crash', 100)
    trigger(49, 'crash', 100)
    expect(c1.voiceGains[0].gain.cancels).toBe(0) // under the cap: untouched
    trigger(49, 'crash', 100)
    expect(c1.voiceGains[0].gain.cancels).toBeGreaterThanOrEqual(1)
    const ramp = rampTo(c1.voiceGains[0], CHOKE_TARGET_GAIN)
    expect(ramp).not.toBeNull()
    if (ramp !== null) expect(ramp.t).toBeLessThanOrEqual(0.003)
    expect(device.getCounters().chokeCount).toBeGreaterThanOrEqual(1)
  })
})

// ─── 7. rapid on/off leaves zero zombie voices ──────────────────────────────

describe('style 7 - rapid note-off cycles leave no zombies', () => {
  it('every released hat gets a real release ramp', () => {
    const { device, trigger } = makeStyledDevice(3)
    const hats: Array<{ voiceGains: RecGain[] }> = []
    for (let i = 0; i < 3; i++) {
      hats.push(trigger(42, 'hat-closed', 100))
      device.onEvent({ type: 'note', note: 42, velocity: 0, duration: 0, channel: 'hat-closed', at: 0 })
    }
    for (const h of hats) {
      expect(rampTo(h.voiceGains[0], CHOKE_TARGET_GAIN)).not.toBeNull()
    }
    expect(device.getCounters().eventsDropped).toBe(0)
  })

  it('a held ride is not released until note-off', () => {
    const { device, trigger } = makeStyledDevice(3)
    const ride = trigger(51, 'ride', 100)
    expect(rampTo(ride.voiceGains[0], CHOKE_TARGET_GAIN)).toBeNull() // still ringing
    device.onEvent({ type: 'note', note: 51, velocity: 0, duration: 0, channel: 'ride', at: 0 })
    expect(rampTo(ride.voiceGains[0], CHOKE_TARGET_GAIN)).not.toBeNull()
  })
})

// ─── 8. kit switch mid-song: no drops, new patch audible immediately ────────

describe('style 8 - kit switch is clean and immediate', () => {
  it('no dropped hits; the next trigger uses the new kit (filter moves)', () => {
    const { device, trigger } = makeStyledDevice(3)
    device.loadKit(BUILTIN_KIT_MANIFEST.kits[0]) // psy-classic: kick cutoff 950
    const k1 = trigger(36, 'kick', 100)
    expect(k1.voiceBiquads.length).toBe(1)
    const f1 = k1.voiceBiquads[0].frequency.value

    device.loadKit(BUILTIN_KIT_MANIFEST.kits[1]) // dark-forest: kick cutoff 700
    const k2 = trigger(36, 'kick', 100)
    const f2 = k2.voiceBiquads[0].frequency.value

    expect(f2).toBeLessThan(f1) // darker kit realized on the very next hit
    expect(device.getCounters().eventsDropped).toBe(0)
  })
})

// ─── 9. velocity-to-timbre: brighter, not just louder ───────────────────────

describe('style 9 - louder is brighter (velocity-to-timbre)', () => {
  it('a loud snare filters higher than a soft one, and is also louder', () => {
    const { device, trigger } = makeStyledDevice(3)
    device.loadKit(BUILTIN_KIT_MANIFEST.kits[0]) // snare: bpHz 1850, velTrack 0.6
    const soft = trigger(38, 'snare', 38)   // ~0.3
    const loud = trigger(38, 'snare', 127)  // 1.0
    expect(soft.voiceBiquads.length).toBeGreaterThanOrEqual(1)
    expect(loud.voiceBiquads.length).toBeGreaterThanOrEqual(1)
    const fSoft = soft.voiceBiquads[0].frequency.value
    const fLoud = loud.voiceBiquads[0].frequency.value
    expect(fLoud).toBeGreaterThan(fSoft) // brighter
    const pSoft = soft.voiceGains[0].gain.linRamps[0].v
    const pLoud = loud.voiceGains[0].gain.linRamps[0].v
    expect(pLoud).toBeGreaterThan(pSoft) // and louder
  })
})
