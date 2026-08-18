// PSYDRUM filters (step Q) — ported from the family DSP (psy5 foundation/dsp/filters.ts).
// Real sample-by-sample resonant filters instead of Web Audio BiquadFilterNode,
// for an analog-deep sound. Includes an RBJ-cookbook biquad and a Moog-style
// 4-stage ladder with tanh-saturated resonance feedback.

export class OnePoleLP {
  private z = 0
  private a = 0
  private readonly sr: number

  constructor(sampleRate: number, cutoffHz: number) {
    this.sr = sampleRate
    this.setCutoff(cutoffHz)
  }
  setCutoff(hz: number): void {
    this.a = hz / (hz + this.sr / (2 * Math.PI))
  }
  process(x: number): number {
    this.z = this.a * x + (1 - this.a) * this.z
    return this.z
  }
  reset(): void { this.z = 0 }
}

export class OnePoleHP {
  private z = 0
  private prevX = 0
  private a = 0
  private readonly sr: number

  constructor(sampleRate: number, cutoffHz: number) {
    this.sr = sampleRate
    this.setCutoff(cutoffHz)
  }
  setCutoff(hz: number): void {
    this.a = hz / (hz + this.sr / (2 * Math.PI))
  }
  process(x: number): number {
    this.z = this.a * (this.z + x - this.prevX)
    this.prevX = x
    return this.z
  }
  reset(): void { this.z = 0; this.prevX = 0 }
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass'

export class BiquadFilter {
  private z1 = 0
  private z2 = 0
  private b0 = 1
  private b1 = 0
  private b2 = 0
  private a1 = 0
  private a2 = 0
  private readonly sr: number

  constructor(sampleRate: number, type: BiquadType, freqHz: number, Q = Math.SQRT1_2) {
    this.sr = sampleRate
    this.setParams(type, freqHz, Q)
  }

  setParams(type: BiquadType, freqHz: number, Q = Math.SQRT1_2): void {
    const w0 = (2 * Math.PI * freqHz) / this.sr
    const cosw = Math.cos(w0)
    const sinw = Math.sin(w0)
    const alpha = sinw / (2 * Q)
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0
    if (type === 'lowpass') {
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha
    } else if (type === 'highpass') {
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha
    } else { // bandpass
      b0 = alpha; b1 = 0; b2 = -alpha
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0
    this.a1 = a1 / a0; this.a2 = a2 / a0
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
  reset(): void { this.z1 = 0; this.z2 = 0 }
}

export class MoogLadder {
  private readonly sr: number
  private cutoff = 1000
  private resonance = 0
  private p = 0
  private k = 0
  private readonly stage = [0, 0, 0, 0]
  private readonly delay = [0, 0, 0, 0]

  constructor(sampleRate: number, cutoffHz = 1000, resonance = 0) {
    this.sr = sampleRate
    this.setCutoff(cutoffHz)
    this.setResonance(resonance)
  }
  setCutoff(hz: number): void {
    this.cutoff = hz
    const fc = (2 * hz) / this.sr
    this.p = (2 * Math.PI * fc) / (1 + this.resonance * 0.5)
  }
  setResonance(res: number): void {
    this.resonance = Math.max(0, Math.min(1, res))
    this.k = 4 * this.resonance
    this.setCutoff(this.cutoff)
  }
  process(x: number): number {
    const fb = this.k * (this.delay[3] ?? 0)
    const sat = x - Math.tanh(fb)
    for (let i = 0; i < 4; i++) {
      const stageIn = i === 0 ? sat : (this.delay[i - 1] ?? 0)
      this.stage[i] =
        this.stage[i] +
        this.p * (Math.tanh(stageIn - this.k * (this.stage[i] ?? 0)) - Math.tanh(this.stage[i] ?? 0))
      this.delay[i] = this.stage[i]
    }
    return this.delay[3] ?? 0
  }
  reset(): void {
    for (let i = 0; i < 4; i++) { this.stage[i] = 0; this.delay[i] = 0 }
  }
}
