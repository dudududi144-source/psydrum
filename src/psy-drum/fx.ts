// PSYDRUM FX (step J): a reverb impulse response generator for the device's
// reverb send bus. Procedural (noise with exponential decay) so there are no
// external/quarantined assets.

// Generate a stereo-ish (mono) reverb impulse response: seeded noise with an
// exponential decay envelope.
export function makeReverbIR(ctx: BaseAudioContext, durationSec: number, decay: number, seed: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  let s = seed >>> 0
  for (let i = 0; i < len; i++) {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    const noise = ((s >>> 0) / 4294967296) * 2 - 1
    const t = i / len
    // exponential decay; `decay` controls how fast it dies (higher = faster)
    const env = Math.pow(1 - t, Math.max(0.5, decay))
    data[i] = noise * env
  }
  return buf
}
