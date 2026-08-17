// PSYDRUM built-in kit manifest (step D).
//
// Three psy-flavored kits with distinct character. This is a KitManifest that
// loadKitManifest validates (provenance = 'procedural', all CC0-safe). Choosing
// a kit is a host decision (WHAT); the device only realizes the HOW.

import type { KitManifest } from './kit-library'

const PROV = { license: 'procedural', author: 'psydrum', created: '2026-01-01' }

export const BUILTIN_KIT_MANIFEST: KitManifest = {
  manifestVersion: 1,
  seed: 11,
  kits: [
    {
      id: 'psy-classic',
      style: 'psytrance',
      provenance: PROV,
      humanize: true,
      choke: { hat: 'exclusive', crashMaxPoly: 2, rideMaxPoly: 2 },
      drums: {
        kick: { body: { wave: 'sine', startHz: 168, endHz: 44, pitchDecayMs: 42 }, amp: { attackMs: 1, decayMs: 218, releaseMs: 50 }, filter: { cutoff: 950, res: 1 }, driveDb: 3.5, velTrack: 0.5 },
        snare: { body: { wave: 'triangle', startHz: 196, endHz: 196, pitchDecayMs: 10 }, noise: { mix: 0.9, bpHz: 1850 }, amp: { attackMs: 1, decayMs: 150, releaseMs: 40 }, filter: { cutoff: 4600, res: 1 }, driveDb: 2.0, velTrack: 0.6 },
        clap: { noise: { mix: 0.9, bpHz: 1150 }, amp: { attackMs: 1, decayMs: 92, releaseMs: 30 }, filter: { cutoff: 3600, res: 1 }, velTrack: 0.5 },
        'hat-closed': { noise: { mix: 0.8, bpHz: 7600 }, amp: { attackMs: 1, decayMs: 42, releaseMs: 20 }, filter: { cutoff: 9200, res: 1 }, velTrack: 0.7 },
        'hat-open': { noise: { mix: 0.8, bpHz: 6400 }, amp: { attackMs: 1, decayMs: 330, releaseMs: 100 }, filter: { cutoff: 8600, res: 1 }, velTrack: 0.7 },
        tom: { body: { wave: 'sine', startHz: 218, endHz: 118, pitchDecayMs: 120 }, amp: { attackMs: 1, decayMs: 232, releaseMs: 60 }, filter: { cutoff: 2600, res: 1 }, velTrack: 0.5 },
        perc: { body: { wave: 'triangle', startHz: 645, endHz: 645, pitchDecayMs: 10 }, noise: { mix: 0.4, bpHz: 2650 }, amp: { attackMs: 1, decayMs: 72, releaseMs: 20 }, filter: { cutoff: 5100, res: 1 }, velTrack: 0.6 },
        ride: { noise: { mix: 0.6, bpHz: 6050 }, amp: { attackMs: 1, decayMs: 520, releaseMs: 200 }, filter: { cutoff: 10200, res: 1 }, velTrack: 0.6 },
        crash: { noise: { mix: 0.7, bpHz: 5050 }, amp: { attackMs: 1, decayMs: 720, releaseMs: 300 }, filter: { cutoff: 9600, res: 1 }, velTrack: 0.6 },
      },
    },
    {
      id: 'dark-forest',
      style: 'darkpsy',
      provenance: PROV,
      humanize: true,
      choke: { hat: 'exclusive', crashMaxPoly: 2, rideMaxPoly: 2 },
      drums: {
        kick: { body: { wave: 'sine', startHz: 150, endHz: 38, pitchDecayMs: 55 }, amp: { attackMs: 1, decayMs: 260, releaseMs: 60 }, filter: { cutoff: 700, res: 1 }, driveDb: 5.0, velTrack: 0.6 },
        snare: { body: { wave: 'triangle', startHz: 170, endHz: 170, pitchDecayMs: 10 }, noise: { mix: 0.9, bpHz: 1500 }, amp: { attackMs: 1, decayMs: 130, releaseMs: 40 }, filter: { cutoff: 3800, res: 1 }, driveDb: 3.0, velTrack: 0.6 },
        clap: { noise: { mix: 0.9, bpHz: 950 }, amp: { attackMs: 1, decayMs: 80, releaseMs: 30 }, filter: { cutoff: 3000, res: 1 }, driveDb: 2.0, velTrack: 0.5 },
        'hat-closed': { noise: { mix: 0.8, bpHz: 8200 }, amp: { attackMs: 1, decayMs: 36, releaseMs: 20 }, filter: { cutoff: 9800, res: 1 }, velTrack: 0.7 },
        'hat-open': { noise: { mix: 0.8, bpHz: 7000 }, amp: { attackMs: 1, decayMs: 300, releaseMs: 100 }, filter: { cutoff: 9000, res: 1 }, velTrack: 0.7 },
        tom: { body: { wave: 'sine', startHz: 190, endHz: 95, pitchDecayMs: 130 }, amp: { attackMs: 1, decayMs: 250, releaseMs: 60 }, filter: { cutoff: 2200, res: 1 }, velTrack: 0.5 },
        perc: { body: { wave: 'triangle', startHz: 560, endHz: 560, pitchDecayMs: 10 }, noise: { mix: 0.45, bpHz: 2300 }, amp: { attackMs: 1, decayMs: 65, releaseMs: 20 }, filter: { cutoff: 4400, res: 1 }, velTrack: 0.6 },
        ride: { noise: { mix: 0.6, bpHz: 6500 }, amp: { attackMs: 1, decayMs: 480, releaseMs: 200 }, filter: { cutoff: 11000, res: 1 }, velTrack: 0.6 },
        crash: { noise: { mix: 0.7, bpHz: 5400 }, amp: { attackMs: 1, decayMs: 700, releaseMs: 300 }, filter: { cutoff: 10000, res: 1 }, velTrack: 0.6 },
      },
    },
    {
      id: 'progressive',
      style: 'progressive',
      provenance: PROV,
      humanize: true,
      choke: { hat: 'exclusive', crashMaxPoly: 2, rideMaxPoly: 2 },
      drums: {
        kick: { body: { wave: 'sine', startHz: 175, endHz: 50, pitchDecayMs: 36 }, amp: { attackMs: 1, decayMs: 190, releaseMs: 45 }, filter: { cutoff: 1200, res: 1 }, driveDb: 1.5, velTrack: 0.4 },
        snare: { body: { wave: 'triangle', startHz: 210, endHz: 210, pitchDecayMs: 10 }, noise: { mix: 0.85, bpHz: 2100 }, amp: { attackMs: 1, decayMs: 160, releaseMs: 40 }, filter: { cutoff: 5200, res: 1 }, driveDb: 1.0, velTrack: 0.6 },
        clap: { noise: { mix: 0.85, bpHz: 1300 }, amp: { attackMs: 1, decayMs: 100, releaseMs: 30 }, filter: { cutoff: 4000, res: 1 }, velTrack: 0.5 },
        'hat-closed': { noise: { mix: 0.75, bpHz: 7200 }, amp: { attackMs: 1, decayMs: 48, releaseMs: 20 }, filter: { cutoff: 8800, res: 1 }, velTrack: 0.7 },
        'hat-open': { noise: { mix: 0.75, bpHz: 6100 }, amp: { attackMs: 1, decayMs: 360, releaseMs: 110 }, filter: { cutoff: 8200, res: 1 }, velTrack: 0.7 },
        tom: { body: { wave: 'sine', startHz: 235, endHz: 130, pitchDecayMs: 110 }, amp: { attackMs: 1, decayMs: 220, releaseMs: 60 }, filter: { cutoff: 2900, res: 1 }, velTrack: 0.5 },
        perc: { body: { wave: 'triangle', startHz: 700, endHz: 700, pitchDecayMs: 10 }, noise: { mix: 0.35, bpHz: 2900 }, amp: { attackMs: 1, decayMs: 80, releaseMs: 20 }, filter: { cutoff: 5600, res: 1 }, velTrack: 0.6 },
        ride: { noise: { mix: 0.55, bpHz: 5800 }, amp: { attackMs: 1, decayMs: 560, releaseMs: 200 }, filter: { cutoff: 9800, res: 1 }, velTrack: 0.6 },
        crash: { noise: { mix: 0.65, bpHz: 4800 }, amp: { attackMs: 1, decayMs: 750, releaseMs: 300 }, filter: { cutoff: 9200, res: 1 }, velTrack: 0.6 },
      },
    },
  ],
}
