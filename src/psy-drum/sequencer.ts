// PSYDRUM library step sequencer (extraction from demo).
//
// A deterministic, DOM-free step sequencer. The demo (or any host) drives it
// by calling tick() at the right times and rendering the result. Keeping it in
// the library means it can be unit-tested without a browser.

export interface SequencerOptions {
  steps?: number          // number of steps (default 16)
}

export class StepSequencer {
  readonly steps: number
  // pattern[row][step] = true/false
  private pattern: boolean[][] = []
  private step = 0
  private playing = false

  constructor(opts: SequencerOptions = {}) {
    this.steps = opts.steps ?? 16
  }

  // Set the number of rows (drums). Clears the pattern.
  setRows(rows: number): void {
    this.pattern = []
    for (let r = 0; r < rows; r++) this.pattern.push(new Array(this.steps).fill(false))
  }

  getPattern(): boolean[][] {
    return this.pattern
  }

  toggle(row: number, step: number): boolean {
    if (!this.pattern[row]) return false
    this.pattern[row][step] = !this.pattern[row][step]
    return this.pattern[row][step]
  }

  set(row: number, step: number, on: boolean): void {
    if (!this.pattern[row]) return
    this.pattern[row][step] = on
  }

  clear(): void {
    for (const row of this.pattern) row.fill(false)
  }

  // Load a pattern from an array of step indices per row.
  loadSteps(rows: number[][], totalRows: number): void {
    this.setRows(totalRows)
    for (let r = 0; r < rows.length && r < totalRows; r++) {
      for (const s of rows[r]) {
        if (s >= 0 && s < this.steps) this.pattern[r][s] = true
      }
    }
  }

  start(): void { this.playing = true; this.step = 0 }
  stop(): void { this.playing = false }
  isPlaying(): boolean { return this.playing }

  // Advance one step and return the current step index, or -1 if not playing.
  tick(): number {
    if (!this.playing) return -1
    const cur = this.step
    this.step = (this.step + 1) % this.steps
    return cur
  }

  // Return the rows that are active at the given step.
  activeRowsAt(step: number): number[] {
    const out: number[] = []
    for (let r = 0; r < this.pattern.length; r++) {
      if (this.pattern[r][step]) out.push(r)
    }
    return out
  }

  currentStep(): number { return this.step }
}
