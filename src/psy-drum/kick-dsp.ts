// PSYDRUM kick DSP (step L) — a punchy psy kick rendered per-sample.
//
// Ported from the family's DSP approach (psy5 foundation): per-sample synthesis
// instead of OscillatorNode, so we get a REAL psy kick:
//   1. sine body with a SHARP exponential pitch drop (startHz -> endHz)
//   2. an FM-style pitch CLICK in the first few ms (the 'donk')
//   3. tanh saturation/drive for weight
//   4. sharp attack envelope
//
// Rendered into an AudioBuffer so it can be used via the sample layer. This runs
// in the HOST (browser), not bun tests.

export interface KickParams {
  startHz: number
  endHz: number
  pitchDecayMs: number
  clickMs: number      // length of the FM click
  driveDb: number      // saturation amount
  sampleRate: number
  durationSec: number
}

export function renderPsyKickSamples(p: KickParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const pitchDecay = Math.max(0.001, p.pitchDecayMs / 1000)
  const clickLen = Math.max(0, Math.floor(sr * (p.clickMs / 1000)))
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)

  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    // exponential pitch drop from startHz toward endHz
    const k = Math.exp(-t / Math.max(0.01, pitchDecay))
    let freq = p.endHz + (p.startHz - p.endHz) * k

    // FM click: in the first clickMs, add a fast high-frequency pitch burst
    if (i < clickLen) {
      const clickPhaseAmt = 1 - i / Math.max(1, clickLen)
      freq += clickPhaseAmt * p.startHz * 2.5
    }

    phase += freq / sr
    if (phase >= 1) phase -= Math.floor(phase)
    let s = Math.sin(2 * Math.PI * phase)

    // sharp attack envelope (fast rise, exponential decay)
    const attack = Math.min(1, t / 0.002)
    const decay = Math.exp(-t / Math.max(0.03, pitchDecay * 1.4))
    s *= attack * decay

    // tanh saturation for weight
    s = Math.tanh(s * drive) / Math.tanh(drive)

    out[i] = s
  }
  return out
}

// Fill an AudioBuffer's channel 0 with the rendered kick.
export function renderPsyKickInto(ctx: BaseAudioContext, p: KickParams): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(p.sampleRate * p.durationSec), p.sampleRate)
  const data = renderPsyKickSamples(p)
  buf.getChannelData(0).set(data.subarray(0, buf.length))
  return buf
}
