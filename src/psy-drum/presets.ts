// PSYDRUM presets (step R) — premium preset library.
// Full kit presets (per psy style) + full groove presets (complete 16-step
// patterns for all drums), modeled after what market-leading drum machines
// (Elektron Digitakt, Roland TR-8S, Arturia DrumBrute) ship as factory content.

import type { DrumPatch } from './types'

export interface KitPreset {
  id: string
  label: string
  style: string
  drums: Record<string, DrumPatch>
}

export interface GroovePreset {
  id: string
  label: string
  style: string
  // channel -> 16-char pattern ('x' = hit, '.' = rest)
  patterns: Record<string, string>
}

// ─── Kit presets (per psy style) ─────────────────────────────────────────────

export const KIT_PRESETS: KitPreset[] = [
  {
    id: 'kit-full-psych',
    label: 'Full On Psych',
    style: 'psytrance',
    drums: {
      kick: { body: { wave: 'sine', startHz: 170, endHz: 44, pitchDecayMs: 40 }, amp: { attackMs: 1, decayMs: 220, releaseMs: 50 }, driveDb: 4, velTrack: 0.5 },
      snare: { body: { wave: 'triangle', startHz: 195, endHz: 195, pitchDecayMs: 10 }, noise: { mix: 0.9, bpHz: 1850 }, amp: { attackMs: 1, decayMs: 150, releaseMs: 40 }, driveDb: 2, velTrack: 0.6 },
      clap: { noise: { mix: 0.9, bpHz: 1150 }, amp: { attackMs: 1, decayMs: 92, releaseMs: 30 }, velTrack: 0.5 },
      'hat-closed': { noise: { mix: 0.8, bpHz: 7600 }, amp: { attackMs: 1, decayMs: 42, releaseMs: 20 }, velTrack: 0.7 },
      'hat-open': { noise: { mix: 0.8, bpHz: 6400 }, amp: { attackMs: 1, decayMs: 330, releaseMs: 100 }, velTrack: 0.7 },
      tom: { body: { wave: 'sine', startHz: 218, endHz: 118, pitchDecayMs: 120 }, amp: { attackMs: 1, decayMs: 232, releaseMs: 60 }, velTrack: 0.5 },
      perc: { body: { wave: 'triangle', startHz: 640, endHz: 640, pitchDecayMs: 10 }, noise: { mix: 0.4, bpHz: 2600 }, amp: { attackMs: 1, decayMs: 72, releaseMs: 20 }, velTrack: 0.6 },
      ride: { noise: { mix: 0.6, bpHz: 6000 }, amp: { attackMs: 1, decayMs: 520, releaseMs: 200 }, velTrack: 0.6 },
      crash: { noise: { mix: 0.7, bpHz: 5000 }, amp: { attackMs: 1, decayMs: 720, releaseMs: 300 }, velTrack: 0.6 },
    },
  },
  {
    id: 'kit-dark-forest',
    label: 'Dark Forest',
    style: 'darkpsy',
    drums: {
      kick: { body: { wave: 'sine', startHz: 150, endHz: 38, pitchDecayMs: 55 }, amp: { attackMs: 1, decayMs: 260, releaseMs: 60 }, driveDb: 5.5, velTrack: 0.6 },
      snare: { body: { wave: 'triangle', startHz: 170, endHz: 170, pitchDecayMs: 10 }, noise: { mix: 0.9, bpHz: 1500 }, amp: { attackMs: 1, decayMs: 130, releaseMs: 40 }, driveDb: 3, velTrack: 0.6 },
      clap: { noise: { mix: 0.9, bpHz: 950 }, amp: { attackMs: 1, decayMs: 80, releaseMs: 30 }, driveDb: 2, velTrack: 0.5 },
      'hat-closed': { noise: { mix: 0.8, bpHz: 8200 }, amp: { attackMs: 1, decayMs: 36, releaseMs: 20 }, velTrack: 0.7 },
      'hat-open': { noise: { mix: 0.8, bpHz: 7000 }, amp: { attackMs: 1, decayMs: 300, releaseMs: 100 }, velTrack: 0.7 },
      tom: { body: { wave: 'sine', startHz: 190, endHz: 95, pitchDecayMs: 130 }, amp: { attackMs: 1, decayMs: 250, releaseMs: 60 }, velTrack: 0.5 },
      perc: { body: { wave: 'triangle', startHz: 560, endHz: 560, pitchDecayMs: 10 }, noise: { mix: 0.45, bpHz: 2300 }, amp: { attackMs: 1, decayMs: 65, releaseMs: 20 }, velTrack: 0.6 },
      ride: { noise: { mix: 0.6, bpHz: 6500 }, amp: { attackMs: 1, decayMs: 480, releaseMs: 200 }, velTrack: 0.6 },
      crash: { noise: { mix: 0.7, bpHz: 5400 }, amp: { attackMs: 1, decayMs: 700, releaseMs: 300 }, velTrack: 0.6 },
    },
  },
  {
    id: 'kit-progressive',
    label: 'Progressive',
    style: 'progressive',
    drums: {
      kick: { body: { wave: 'sine', startHz: 175, endHz: 50, pitchDecayMs: 36 }, amp: { attackMs: 1, decayMs: 190, releaseMs: 45 }, driveDb: 1.5, velTrack: 0.4 },
      snare: { body: { wave: 'triangle', startHz: 210, endHz: 210, pitchDecayMs: 10 }, noise: { mix: 0.85, bpHz: 2100 }, amp: { attackMs: 1, decayMs: 160, releaseMs: 40 }, driveDb: 1, velTrack: 0.6 },
      clap: { noise: { mix: 0.85, bpHz: 1300 }, amp: { attackMs: 1, decayMs: 100, releaseMs: 30 }, velTrack: 0.5 },
      'hat-closed': { noise: { mix: 0.75, bpHz: 7200 }, amp: { attackMs: 1, decayMs: 48, releaseMs: 20 }, velTrack: 0.7 },
      'hat-open': { noise: { mix: 0.75, bpHz: 6100 }, amp: { attackMs: 1, decayMs: 360, releaseMs: 110 }, velTrack: 0.7 },
      tom: { body: { wave: 'sine', startHz: 235, endHz: 130, pitchDecayMs: 110 }, amp: { attackMs: 1, decayMs: 220, releaseMs: 60 }, velTrack: 0.5 },
      perc: { body: { wave: 'triangle', startHz: 700, endHz: 700, pitchDecayMs: 10 }, noise: { mix: 0.35, bpHz: 2900 }, amp: { attackMs: 1, decayMs: 80, releaseMs: 20 }, velTrack: 0.6 },
      ride: { noise: { mix: 0.55, bpHz: 5800 }, amp: { attackMs: 1, decayMs: 560, releaseMs: 200 }, velTrack: 0.6 },
      crash: { noise: { mix: 0.65, bpHz: 4800 }, amp: { attackMs: 1, decayMs: 750, releaseMs: 300 }, velTrack: 0.6 },
    },
  },
  {
    id: 'kit-minimal',
    label: 'Minimal',
    style: 'minimal',
    drums: {
      kick: { body: { wave: 'sine', startHz: 160, endHz: 48, pitchDecayMs: 45 }, amp: { attackMs: 1, decayMs: 200, releaseMs: 50 }, driveDb: 2, velTrack: 0.4 },
      snare: { body: { wave: 'triangle', startHz: 200, endHz: 200, pitchDecayMs: 10 }, noise: { mix: 0.8, bpHz: 2000 }, amp: { attackMs: 1, decayMs: 120, releaseMs: 40 }, velTrack: 0.5 },
      clap: { noise: { mix: 0.8, bpHz: 1200 }, amp: { attackMs: 1, decayMs: 70, releaseMs: 30 }, velTrack: 0.5 },
      'hat-closed': { noise: { mix: 0.7, bpHz: 7400 }, amp: { attackMs: 1, decayMs: 30, releaseMs: 20 }, velTrack: 0.7 },
      'hat-open': { noise: { mix: 0.7, bpHz: 6300 }, amp: { attackMs: 1, decayMs: 280, releaseMs: 100 }, velTrack: 0.7 },
      tom: { body: { wave: 'sine', startHz: 210, endHz: 110, pitchDecayMs: 120 }, amp: { attackMs: 1, decayMs: 210, releaseMs: 60 }, velTrack: 0.5 },
      perc: { body: { wave: 'triangle', startHz: 620, endHz: 620, pitchDecayMs: 10 }, noise: { mix: 0.3, bpHz: 2700 }, amp: { attackMs: 1, decayMs: 60, releaseMs: 20 }, velTrack: 0.6 },
      ride: { noise: { mix: 0.5, bpHz: 6000 }, amp: { attackMs: 1, decayMs: 500, releaseMs: 200 }, velTrack: 0.6 },
      crash: { noise: { mix: 0.6, bpHz: 5000 }, amp: { attackMs: 1, decayMs: 680, releaseMs: 300 }, velTrack: 0.6 },
    },
  },
]

// ─── Groove presets (complete 16-step patterns) ──────────────────────────────

export const GROOVE_PRESETS: GroovePreset[] = [
  {
    id: 'groove-fullon',
    label: 'Full-On Gallop',
    style: 'psytrance',
    patterns: {
      kick: 'xxx.xxx.xxx.xxx.',
      'hat-closed': '..x...x...x...x.',
      clap: '....x.......x...',
    },
  },
  {
    id: 'groove-darkrolling',
    label: 'Dark Rolling',
    style: 'darkpsy',
    patterns: {
      kick: 'xxx.xxx.xxx.xxx.',
      snare: '....x.......x...',
      'hat-closed': '..x.x...x.x...x.',
      perc: '..x...x...x...x.',
    },
  },
  {
    id: 'groove-proghouse',
    label: 'Prog House',
    style: 'progressive',
    patterns: {
      kick: 'x...x...x...x...',
      clap: '....x.......x...',
      'hat-closed': '..x...x...x...x.',
      'hat-open': '......x.......x.',
    },
  },
  {
    id: 'groove-minimal',
    label: 'Minimal Tick',
    style: 'minimal',
    patterns: {
      kick: 'x.......x.......',
      'hat-closed': '..x...x...x...x.',
      perc: '....x.......x...',
    },
  },
]

export function findKitPreset(id: string): KitPreset | null {
  for (let i = 0; i < KIT_PRESETS.length; i++) {
    if (KIT_PRESETS[i].id === id) return KIT_PRESETS[i]
  }
  return null
}

export function findGroovePreset(id: string): GroovePreset | null {
  for (let i = 0; i < GROOVE_PRESETS.length; i++) {
    if (GROOVE_PRESETS[i].id === id) return GROOVE_PRESETS[i]
  }
  return null
}
