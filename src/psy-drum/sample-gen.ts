// PSYDRUM procedural sample generation (step H).
//
// Renders a drum hit into an AudioBuffer using an OfflineAudioContext, so the
// sample layer has real procedural material (no external/quarantined files —
// provenance is inherently 'procedural'). Runs in the HOST (browser), not in
// bun tests (OfflineAudioContext is a browser API).

import type { DrumRole } from './types'

// Render a simple procedural drum hit to an AudioBuffer.
export async function renderDrumSample(
  role: DrumRole,
  sampleRate: number,
  durationSec: number,
): Promise<AudioBuffer> {
  const len = Math.max(1, Math.floor(sampleRate * durationSec))
  const octx = new OfflineAudioContext(1, len, sampleRate)

  const out = octx.createGain()
  out.gain.value = 0.9
  out.connect(octx.destination)

  if (role === 'kick' || role === 'tom') {
    const osc = octx.createOscillator()
    osc.type = 'sine'
    const startHz = role === 'kick' ? 165 : 215
    const endHz = role === 'kick' ? 44 : 115
    osc.frequency.setValueAtTime(startHz, 0)
    osc.frequency.exponentialRampToValueAtTime(endHz, 0.05)
    const g = octx.createGain()
    g.gain.setValueAtTime(0.0001, 0)
    g.gain.linearRampToValueAtTime(1, 0.003)
    g.gain.exponentialRampToValueAtTime(0.001, durationSec * 0.9)
    osc.connect(g)
    g.connect(out)
    osc.start(0)
    osc.stop(durationSec)
  } else {
    // noise-based drums: render a deterministic noise burst through a filter
    const buf = octx.createBuffer(1, len, sampleRate)
    const data = buf.getChannelData(0)
    let s = 0x12345678 >>> 0
    for (let i = 0; i < len; i++) {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      data[i] = ((s >>> 0) / 4294967296) * 2 - 1
    }
    const src = octx.createBufferSource()
    src.buffer = buf
    const f = octx.createBiquadFilter()
    f.type = role === 'hat-closed' || role === 'hat-open' || role === 'ride' || role === 'crash' ? 'highpass' : 'bandpass'
    f.frequency.value = role === 'snare' ? 1800 : role === 'clap' ? 1150 : 7000
    const g = octx.createGain()
    g.gain.setValueAtTime(0.0001, 0)
    g.gain.linearRampToValueAtTime(0.8, 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, durationSec * 0.85)
    src.connect(f)
    f.connect(g)
    g.connect(out)
    src.start(0)
    src.stop(durationSec)
  }

  return octx.startRendering()
}
