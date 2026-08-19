// PSYDRUM library motion data (extraction from demo).
//
// Motion data records per-step parameter values so they can be played back,
// giving TR-8S-style real-time automation. It is DOM-free and deterministic.

export interface MotionTrack {
  // paramName -> array of values, one per step (null = not recorded)
  [param: string]: Array<number | null>
}

export class MotionRecorder {
  readonly steps: number
  private tracks: MotionTrack = {}
  private recording = false
  private playing = false

  constructor(steps: number = 16) {
    this.steps = steps
  }

  // Register a parameter to record (clears any existing data for it).
  registerParam(param: string): void {
    this.tracks[param] = new Array(this.steps).fill(null)
  }

  startRecording(): void {
    this.recording = true
  }

  stopRecording(): void {
    this.recording = false
  }

  isRecording(): boolean {
    return this.recording
  }

  // Record a value for a parameter at a given step (while recording).
  record(param: string, step: number, value: number): void {
    if (!this.recording) return
    if (!this.tracks[param]) this.registerParam(param)
    const s = step % this.steps
    this.tracks[param][s] = value
  }

  startPlayback(): void {
    this.playing = true
  }

  stopPlayback(): void {
    this.playing = false
  }

  isPlaying(): boolean {
    return this.playing
  }

  // Get the recorded value for a parameter at a step, or null if none.
  valueAt(param: string, step: number): number | null {
    if (!this.playing) return null
    const t = this.tracks[param]
    if (!t) return null
    return t[step % this.steps]
  }

  // Clear all recorded data.
  clear(): void {
    for (const p of Object.keys(this.tracks)) this.tracks[p].fill(null)
  }
}
