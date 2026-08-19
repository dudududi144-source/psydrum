// PSYDRUM transport sync (Phase D - ROADMAP D1).
//
// A shared transport clock that keeps PSYDRUM aligned with sibling PSY-family
// devices (psysynth, psy-sampler). The clock owns the BPM and the beat/bar
// position; devices subscribe and receive onBeat / onBar callbacks so their
// sequencers never drift apart.

export interface TransportSubscriber {
  onBeat?: (beat: number, bar: number) => void
  onBar?: (bar: number) => void
  onBpmChange?: (bpm: number) => void
}

export class TransportClock {
  private bpm = 138
  private beat = 0
  private bar = 1
  private beatsPerBar = 4
  private running = false
  private timer: ReturnType<typeof setInterval> | null = null
  private subs: TransportSubscriber[] = []

  subscribe(sub: TransportSubscriber): void {
    this.subs.push(sub)
  }

  unsubscribe(sub: TransportSubscriber): void {
    const i = this.subs.indexOf(sub)
    if (i >= 0) this.subs.splice(i, 1)
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm))
    for (const s of this.subs) if (s.onBpmChange) s.onBpmChange(this.bpm)
    if (this.running) { this.stop(); this.start() }
  }

  getBpm(): number {
    return this.bpm
  }

  getPosition(): { beat: number; bar: number } {
    return { beat: this.beat, bar: this.bar }
  }

  start(): void {
    if (this.running) return
    this.running = true
    const stepMs = 60000 / this.bpm
    this.timer = setInterval(() => {
      this.beat = (this.beat + 1) % this.beatsPerBar
      if (this.beat === 0) {
        this.bar++
        for (const s of this.subs) if (s.onBar) s.onBar(this.bar)
      }
      for (const s of this.subs) if (s.onBeat) s.onBeat(this.beat, this.bar)
    }, stepMs)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  reset(): void {
    this.beat = 0
    this.bar = 1
  }
}
