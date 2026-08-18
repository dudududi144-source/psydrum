// PSYDRUM ACB engine (Phase A — ROADMAP task A1.2).
// Analog Circuit Behavior modeling via a State-Variable Filter (SVF).
//
// The SVF is the computational model of the resonant low-pass circuits found
// in classic analog drum machines (TR-808/909). It provides independent
// low-pass, high-pass, band-pass, and notch outputs from a single topology,
// which is exactly what gives analog drums their characteristic "ring" and
// "boom". This is the foundation for replacing the naive sine/pitch-drop kick
// with a true ACB-modeled kick (ROADMAP task A1).

// Chamberlin State-Variable Filter.
// Reference: Hal Chamberlin, "Musical Applications of Microprocessors".
// The two integrator state variables (low, band) model the energy storage
// elements (capacitors) of the analog circuit.
export class SVF {
  private low = 0
  private band = 0
  private f = 0        // frequency coefficient
  private q = 2        // damping factor (lower = more resonance)

  constructor(sampleRate: number, cutoffHz: number, resonance: number) {
    this.setCutoff(sampleRate, cutoffHz)
    this.setResonance(resonance)
  }

  // Update the frequency coefficient. cutoffHz is the -3dB point.
  setCutoff(sampleRate: number, cutoffHz: number): void {
    const fc = Math.min(cutoffHz, sampleRate * 0.45) // Nyquist guard
    this.f = 2 * Math.sin(Math.PI * fc / sampleRate)
  }

  // Map resonance (0..1) to damping factor q.
  // resonance 0 -> q ~ 2.0 (no resonance, overdamped)
  // resonance 1 -> q ~ 0.1 (near self-oscillation, max ring)
  setResonance(resonance: number): void {
    const r = Math.max(0, Math.min(1, resonance))
    this.q = 0.1 + 1.9 * (1 - r)
  }

  // Process one sample. Returns the four classic SVF outputs.
  process(input: number): { low: number; high: number; band: number; notch: number } {
    this.low += this.f * this.band
    const high = input - this.low - this.q * this.band
    this.band += this.f * high
    const notch = high + this.low
    return { low: this.low, high, band: this.band, notch }
  }

  reset(): void {
    this.low = 0
    this.band = 0
  }
}

// ACB kick model parameters.
export interface AcbKickParams {
  sampleRate: number
  durationSec: number
  // Body oscillator
  bodyStartHz: number
  bodyEndHz: number
  pitchDecayMs: number
  // Resonant filter (the "boom")
  filterCutoffHz: number
  filterResonance: number   // 0..1
  filterCutoffDecayMs: number  // filter cutoff also drops over time
  // Click transient
  clickAmount: number
  clickMs: number
  // Output
  driveDb: number
}

// Render an ACB-modeled kick drum.
// The body oscillator is run through the resonant SVF. The filter resonance
// is what produces the characteristic analog "boom" that a plain sine cannot.
export function renderAcbKick(p: AcbKickParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)

  const svf = new SVF(sr, p.filterCutoffHz, p.filterResonance)
  const pitchDecay = Math.max(0.001, p.pitchDecayMs / 1000)
  const cutoffDecay = Math.max(0.001, p.filterCutoffDecayMs / 1000)
  const clickLen = Math.max(1, Math.floor(sr * (p.clickMs / 1000)))
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)

  let phase = 0
  let noiseState = 0x12345678 >>> 0

  for (let i = 0; i < n; i++) {
    const t = i / sr

    // Pitch envelope: exponential drop from bodyStartHz to bodyEndHz.
    const k = Math.exp(-t / pitchDecay)
    const bodyHz = p.bodyEndHz + (p.bodyStartHz - p.bodyEndHz) * k
    phase += bodyHz / sr
    if (phase >= 1) phase -= Math.floor(phase)
    let body = Math.sin(2 * Math.PI * phase)

    // Filter cutoff envelope: the filter also closes over time.
    const ck = Math.exp(-t / cutoffDecay)
    const cutoff = 60 + (p.filterCutoffHz - 60) * ck
    svf.setCutoff(sr, cutoff)

    // Run body through the resonant SVF — this is the ACB core.
    const filtered = svf.process(body)
    let sig = filtered.low

    // Click transient (first few ms) adds the "tick" of the beater.
    if (i < clickLen) {
      noiseState ^= noiseState << 13
      noiseState ^= noiseState >>> 17
      noiseState ^= noiseState << 5
      const noise = ((noiseState >>> 0) / 4294967296) * 2 - 1
      const clickEnv = 1 - i / clickLen
      sig += noise * p.clickAmount * clickEnv
    }

    // Amplitude envelope. The amplitude decay is deliberately SLOWER than the
    // pitch decay so the "boom" sustains while the body is in the sub range.
    // (Tying it to pitch decay made the amplitude die before the body got low.)
    const attack = Math.min(1, t / 0.0015)
    const bodyEnv = Math.exp(-t / Math.max(0.06, pitchDecay * 3.0))
    sig *= attack * bodyEnv

    // Drive/saturation.
    sig = Math.tanh(sig * drive)
    sig = Math.tanh(sig)

    out[i] = sig
  }

  return out
}


// Map a kit DrumPatch onto AcbKickParams (ROADMAP task A1.3).
// This lets the kit system drive the ACB kick, so changing kit changes the
// ACB-modeled kick sound.
export function acbKickParamsFromPatch(
  patch: { body?: { startHz?: number; endHz?: number; pitchDecayMs?: number }; filter?: { cutoff?: number; res?: number }; driveDb?: number },
  d: { sampleRate: number; durationSec: number },
): AcbKickParams {
  const body = patch.body || {}
  const filter = patch.filter || {}
  return {
    sampleRate: d.sampleRate,
    durationSec: d.durationSec,
    bodyStartHz: typeof body.startHz === 'number' ? body.startHz : 160,
    bodyEndHz: typeof body.endHz === 'number' ? body.endHz : 48,
    pitchDecayMs: typeof body.pitchDecayMs === 'number' ? body.pitchDecayMs : 45,
    filterCutoffHz: typeof filter.cutoff === 'number' ? filter.cutoff : 400,
    filterResonance: typeof filter.res === 'number' ? Math.max(0, Math.min(1, filter.res / 10)) : 0.6,
    filterCutoffDecayMs: 100,
    clickAmount: 0.4,
    clickMs: 2,
    driveDb: typeof patch.driveDb === 'number' ? patch.driveDb : 4,
  }
}


// ACB snare (ROADMAP A2.1): tonal body + resonant band-passed noise via SVF.
export interface AcbSnareParams {
  sampleRate: number
  durationSec: number
  toneHz: number
  tonePitchDropHz: number
  toneAmount: number
  noiseBpHz: number
  noiseResonance: number
  noiseAmount: number
  noiseDecayMs: number
  toneDecayMs: number
  driveDb: number
}

export function renderAcbSnare(p: AcbSnareParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const svf = new SVF(sr, p.noiseBpHz, p.noiseResonance)
  const noiseDecay = Math.max(0.01, p.noiseDecayMs / 1000)
  const toneDecay = Math.max(0.01, p.toneDecayMs / 1000)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let tonePhase = 0
  let noiseState = 0x9e3779b9 >>> 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const toneHz = Math.max(40, p.toneHz - p.tonePitchDropHz * (1 - Math.exp(-t / 0.02)))
    tonePhase += toneHz / sr
    if (tonePhase >= 1) tonePhase -= Math.floor(tonePhase)
    const tone = Math.sin(2 * Math.PI * tonePhase) * Math.exp(-t / toneDecay) * p.toneAmount
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >>> 17
    noiseState ^= noiseState << 5
    const noise = ((noiseState >>> 0) / 4294967296) * 2 - 1
    const bp = svf.process(noise).band
    const noiseSig = bp * Math.exp(-t / noiseDecay) * p.noiseAmount
    let sig = (tone + noiseSig) * Math.min(1, t / 0.001)
    sig = Math.tanh(sig * drive)
    sig = Math.tanh(sig)
    out[i] = sig
  }
  return out
}

// ACB hat (ROADMAP A2.2): ring-mod metallic source through resonant high-pass.
export interface AcbHatParams {
  sampleRate: number
  durationSec: number
  metalHz: number
  ringRatio: number
  hpHz: number
  hpResonance: number
  decayMs: number
  driveDb: number
}

export function renderAcbHat(p: AcbHatParams): Float32Array {
  const sr = p.sampleRate
  const n = Math.max(1, Math.floor(sr * p.durationSec))
  const out = new Float32Array(n)
  const svf = new SVF(sr, p.hpHz, p.hpResonance)
  const decay = Math.max(0.005, p.decayMs / 1000)
  const drive = Math.pow(10, Math.max(0, p.driveDb) / 20)
  let ph1 = 0
  let ph2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    ph1 += p.metalHz / sr
    if (ph1 >= 1) ph1 -= Math.floor(ph1)
    ph2 += (p.metalHz * p.ringRatio) / sr
    if (ph2 >= 1) ph2 -= Math.floor(ph2)
    const sq1 = ph1 < 0.5 ? 1 : -1
    const sq2 = ph2 < 0.5 ? 1 : -1
    const metal = sq1 * sq2
    const hp = svf.process(metal).high
    let sig = hp * Math.exp(-t / decay) * Math.min(1, t / 0.0008)
    sig = Math.tanh(sig * drive)
    sig = Math.tanh(sig)
    out[i] = sig
  }
  return out
}
