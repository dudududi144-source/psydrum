// PSYDRUM Master FX Chain (ROADMAP task A3).
// A master bus effects chain applied to the whole drum output:
//   input -> Compressor -> Drive -> [dry + Reverb(wet)] -> output
// This is what glues the individual drums into a cohesive "kit" sound, the way
// a bus compressor + saturation + room does on a commercial record.

// Create a tanh drive curve for a WaveShaperNode.
export function createDriveCurve(amount: number, samples = 1024): Float32Array {
  const curve = new Float32Array(samples)
  const k = Math.max(1, Math.pow(10, amount / 20))
  const norm = Math.tanh(k)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(x * k) / norm
  }
  return curve
}

// Create a procedural reverb impulse response (noise with exponential decay).
export function createReverbIR(ctx: BaseAudioContext, durationSec: number, decayPow: number, seed: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let s = (seed + ch * 0x9e3779b9) >>> 0
    for (let i = 0; i < len; i++) {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      const noise = ((s >>> 0) / 4294967296) * 2 - 1
      const t = i / len
      data[i] = noise * Math.pow(1 - t, decayPow)
    }
  }
  return buf
}

export interface MasterFXNodes {
  input: GainNode
  compressor: DynamicsCompressorNode
  drive: WaveShaperNode
  driveGain: GainNode
  dry: GainNode
  reverb: ConvolverNode
  wet: GainNode
  output: GainNode
}

// Build the master FX chain. Returns the nodes so the caller can wire them and
// control the drive/reverb amounts at runtime.
export function createMasterFX(ctx: BaseAudioContext): MasterFXNodes {
  const input = ctx.createGain()
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 12
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.25

  const drive = ctx.createWaveShaper()
  drive.curve = createDriveCurve(0) as Float32Array<ArrayBuffer>
  drive.oversample = '2x'
  const driveGain = ctx.createGain()
  driveGain.gain.value = 1

  const dry = ctx.createGain()
  dry.gain.value = 1

  const reverb = ctx.createConvolver()
  reverb.buffer = createReverbIR(ctx, 1.8, 2.2, 0x5f3759df)
  const wet = ctx.createGain()
  wet.gain.value = 0 // reverb off by default

  const output = ctx.createGain()
  output.gain.value = 1

  // Wire: input -> compressor -> drive -> driveGain -> (dry + reverb->wet) -> output
  input.connect(compressor)
  compressor.connect(drive)
  drive.connect(driveGain)
  driveGain.connect(dry)
  driveGain.connect(reverb)
  reverb.connect(wet)
  dry.connect(output)
  wet.connect(output)

  return { input, compressor, drive, driveGain, dry, reverb, wet, output }
}
