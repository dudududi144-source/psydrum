// PSYDRUM default psy kit (step B — sound design as DATA).
//
// A psytrance-flavored default kit. Each DrumPatch shapes one drum's character
// (body/noise/filter/amp/velTrack). This is DATA the device loads via
// loadKit / kitPatches — not hardcoded DSP — so kits stay swappable (HOW layer
// stays pure; choosing a kit is a host decision).

import type { DrumPatch, DrumRole } from './types'

export const DEFAULT_PSY_KIT: Record<DrumRole, DrumPatch> = {
  kick: {
    body: { wave: 'sine', startHz: 168, endHz: 44, pitchDecayMs: 42 },
    amp: { attackMs: 1, decayMs: 218, releaseMs: 50 },
    filter: { cutoff: 950, res: 1 },
    driveDb: 3.5,
    velTrack: 0.5,
  },
  snare: {
    body: { wave: 'triangle', startHz: 196, endHz: 196, pitchDecayMs: 10 },
    noise: { mix: 0.9, bpHz: 1850 },
    amp: { attackMs: 1, decayMs: 150, releaseMs: 40 },
    filter: { cutoff: 4600, res: 1 },
    driveDb: 2.0,
    velTrack: 0.6,
  },
  clap: {
    noise: { mix: 0.9, bpHz: 1150 },
    amp: { attackMs: 1, decayMs: 92, releaseMs: 30 },
    filter: { cutoff: 3600, res: 1 },
    velTrack: 0.5,
  },
  'hat-closed': {
    noise: { mix: 0.8, bpHz: 7600 },
    amp: { attackMs: 1, decayMs: 42, releaseMs: 20 },
    filter: { cutoff: 9200, res: 1 },
    velTrack: 0.7,
  },
  'hat-open': {
    noise: { mix: 0.8, bpHz: 6400 },
    amp: { attackMs: 1, decayMs: 330, releaseMs: 100 },
    filter: { cutoff: 8600, res: 1 },
    velTrack: 0.7,
  },
  tom: {
    body: { wave: 'sine', startHz: 218, endHz: 118, pitchDecayMs: 120 },
    amp: { attackMs: 1, decayMs: 232, releaseMs: 60 },
    filter: { cutoff: 2600, res: 1 },
    velTrack: 0.5,
  },
  perc: {
    body: { wave: 'triangle', startHz: 645, endHz: 645, pitchDecayMs: 10 },
    noise: { mix: 0.4, bpHz: 2650 },
    amp: { attackMs: 1, decayMs: 72, releaseMs: 20 },
    filter: { cutoff: 5100, res: 1 },
    velTrack: 0.6,
  },
  ride: {
    noise: { mix: 0.6, bpHz: 6050 },
    amp: { attackMs: 1, decayMs: 520, releaseMs: 200 },
    filter: { cutoff: 10200, res: 1 },
    velTrack: 0.6,
  },
  crash: {
    noise: { mix: 0.7, bpHz: 5050 },
    amp: { attackMs: 1, decayMs: 720, releaseMs: 300 },
    filter: { cutoff: 9600, res: 1 },
    velTrack: 0.6,
  },
}
