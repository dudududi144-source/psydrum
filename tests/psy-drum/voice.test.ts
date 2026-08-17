// Phase 5 tests — voice DSP: envelopes, velocity curves, deterministic render,
// and the style-9 velocity-to-timbre spectral-centroid assertion.

import { describe, it, expect } from 'bun:test'
import {
  expDecay,
  makeDecayTable,
  pitchEnvelopeHz,
  velocityToGain,
  velocityToBrightness,
  clampVelocity,
  lcgStep,
  lcgToNoise,
  renderKick,
  renderSnare,
  renderClap,
  renderHat,
  renderTom,
  renderPerc,
  renderRide,
  renderCrash,
  renderDrum,
} from '../../src/psy-drum/voice'
import type { VoiceRenderOpts } from '../../src/psy-drum/voice'

const SR = 48000

function opts(velocity = 100, velTrack = 0.6, seed = 7): VoiceRenderOpts {
  return { sampleRate: SR, velocity: velocity, velTrack: velTrack, velCurve: 'linear', seed: seed }
}

// ─── Envelopes ───────────────────────────────────────────────────────────────

describe('envelopes', () => {
  it('expDecay is 1 at t=0 and ~-60dB at t=1', () => {
    expect(expDecay(0)).toBe(1)
    expect(expDecay(1)).toBeCloseTo(0.001, 6)
  })

  it('expDecay is monotonically decreasing', () => {
    let prev = expDecay(0)
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const v = expDecay(t)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('makeDecayTable endpoints and monotonicity', () => {
    const table = makeDecayTable(64)
    expect(table.length).toBe(64)
    expect(table[0]).toBeCloseTo(1, 6)
    expect(table[63]).toBeCloseTo(0.001, 3)
    for (let i = 1; i < table.length; i++) {
      expect(table[i]).toBeLessThanOrEqual(table[i - 1])
    }
  })

  it('pitchEnvelopeHz glides from start to end', () => {
    expect(pitchEnvelopeHz(0, 150, 50)).toBeCloseTo(150, 3)
    expect(pitchEnvelopeHz(1, 150, 50)).toBeCloseTo(50, 3)
    const mid = pitchEnvelopeHz(0.5, 150, 50)
    expect(mid).toBeGreaterThan(50)
    expect(mid).toBeLessThan(150)
  })
})

// ─── Velocity curves ─────────────────────────────────────────────────────────

describe('velocity curves', () => {
  it('velocityToGain is monotonic and bounded 0..1', () => {
    expect(velocityToGain(0, 'linear')).toBe(0)
    expect(velocityToGain(127, 'linear')).toBeCloseTo(1, 6)
    expect(velocityToGain(64, 'linear')).toBeGreaterThan(velocityToGain(32, 'linear'))
    expect(velocityToGain(200, 'linear')).toBeLessThanOrEqual(1)
    expect(velocityToGain(-5, 'linear')).toBe(0)
  })

  it('power curve is below linear for mid velocities', () => {
    expect(velocityToGain(64, 'power')).toBeLessThan(velocityToGain(64, 'linear'))
  })

  it('velocityToBrightness rises with velocity and velTrack', () => {
    expect(velocityToBrightness(0, 1)).toBe(1)
    expect(velocityToBrightness(127, 0)).toBe(1)
    expect(velocityToBrightness(127, 1)).toBeCloseTo(2, 6)
    expect(velocityToBrightness(100, 1)).toBeGreaterThan(velocityToBrightness(50, 1))
  })

  it('clampVelocity clamps to 0..127', () => {
    expect(clampVelocity(200)).toBe(127)
    expect(clampVelocity(-10)).toBe(0)
    expect(clampVelocity(Number.NaN)).toBe(0)
  })
})

// ─── Deterministic PRNG ──────────────────────────────────────────────────────

describe('deterministic noise', () => {
  it('lcg is deterministic for a given seed', () => {
    let a = lcgStep(123)
    let b = lcgStep(123)
    expect(a).toBe(b)
    expect(lcgToNoise(a)).toBe(lcgToNoise(b))
  })

  it('lcgToNoise stays within [-1, 1]', () => {
    let s = 42 >>> 0
    for (let i = 0; i < 200; i++) {
      s = lcgStep(s)
      const v = lcgToNoise(s)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

// ─── Render: every chain produces deterministic, non-silent audio ───────────

function energy(buf: Float32Array): number {
  let e = 0
  for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i]
  return e
}

describe('every drum chain renders deterministic non-silent audio', () => {
  const cases = [
    ['kick', renderKick],
    ['snare', renderSnare],
    ['clap', renderClap],
    ['hat-closed', (o, p) => renderHat(o, p, false)],
    ['hat-open', (o, p) => renderHat(o, p, true)],
    ['tom', renderTom],
    ['perc', renderPerc],
    ['ride', renderRide],
    ['crash', renderCrash],
  ]

  for (const [name, fn] of cases) {
    it(name + ' renders non-silent, deterministic audio', () => {
      const a = new Float32Array(2048)
      const b = new Float32Array(2048)
      fn(a, opts(100, 0.6, 99))
      fn(b, opts(100, 0.6, 99))
      expect(energy(a)).toBeGreaterThan(0)
      // same seed + params => identical samples
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).toBe(b[i])
      }
    })
  }

  it('a higher seed than a different one yields different audio', () => {
    const a = new Float32Array(1024)
    const b = new Float32Array(1024)
    renderSnare(a, opts(100, 0.6, 1))
    renderSnare(b, opts(100, 0.6, 2))
    let same = true
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { same = false; break }
    }
    expect(same).toBe(false)
  })

  it('renderDrum dispatches every canonical role', () => {
    const roles = ['kick', 'snare', 'clap', 'hat-closed', 'hat-open', 'tom', 'perc', 'ride', 'crash'] as const
    for (const role of roles) {
      const out = new Float32Array(1024)
      expect(renderDrum(role, out, opts(100, 0.6, 3))).toBe(true)
      expect(energy(out)).toBeGreaterThan(0)
    }
  })
})

// ─── Velocity-to-timbre (style criterion 9): louder = brighter ──────────────

// In-place iterative radix-2 FFT (n must be a power of two).
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      let tr = re[i]; re[i] = re[j]; re[j] = tr
      let ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wReal = Math.cos(ang)
    const wImag = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curReal = 1
      let curImag = 0
      const half = len >> 1
      for (let k = 0; k < half; k++) {
        const vr = re[i + k + half] * curReal - im[i + k + half] * curImag
        const vi = re[i + k + half] * curImag + im[i + k + half] * curReal
        re[i + k + half] = re[i + k] - vr
        im[i + k + half] = im[i + k] - vi
        re[i + k] = re[i + k] + vr
        im[i + k] = im[i + k] + vi
        const nr = curReal * wReal - curImag * wImag
        const ni = curReal * wImag + curImag * wReal
        curReal = nr
        curImag = ni
      }
    }
  }
}

function spectralCentroid(samples: Float32Array, sampleRate: number): number {
  const n = samples.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = samples[i]
  fftInPlace(re, im)
  let num = 0
  let den = 0
  const half = n >> 1
  for (let k = 0; k < half; k++) {
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k])
    const freq = (k * sampleRate) / n
    num += freq * mag
    den += mag
  }
  return den === 0 ? 0 : num / den
}

describe('velocity-to-timbre (style 9): louder hits are brighter', () => {
  it('kick spectral centroid rises with velocity', () => {
    const soft = new Float32Array(2048)
    const loud = new Float32Array(2048)
    renderKick(soft, opts(20, 1, 5))
    renderKick(loud, opts(120, 1, 5))
    const cSoft = spectralCentroid(soft, SR)
    const cLoud = spectralCentroid(loud, SR)
    expect(cLoud).toBeGreaterThan(cSoft)
  })

  it('snare spectral centroid rises with velocity', () => {
    const soft = new Float32Array(2048)
    const loud = new Float32Array(2048)
    renderSnare(soft, opts(20, 1, 5))
    renderSnare(loud, opts(120, 1, 5))
    expect(spectralCentroid(loud, SR)).toBeGreaterThan(spectralCentroid(soft, SR))
  })

  it('zero velTrack removes the timbre shift (gain-only)', () => {
    // With velTrack 0 the spectral shape must NOT change with velocity.
    const soft = new Float32Array(2048)
    const loud = new Float32Array(2048)
    renderKick(soft, opts(20, 0, 5))
    renderKick(loud, opts(120, 0, 5))
    const cSoft = spectralCentroid(soft, SR)
    const cLoud = spectralCentroid(loud, SR)
    // Centroids should be (nearly) identical when timbre tracking is off.
    expect(Math.abs(cLoud - cSoft)).toBeLessThan(cSoft * 0.05 + 1)
  })
})
