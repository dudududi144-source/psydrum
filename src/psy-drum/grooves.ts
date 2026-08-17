// PSYDRUM groove templates (step K).
//
// Ready-made 16-step grooves keyed by drum channel. Each template maps a drum
// channel to a 16-char pattern string ('x' = hit, '.' = rest). These are WHAT
// content (patterns) consumed by the host sequencer — the device stays pure HOW.

export interface GrooveTemplate {
  id: string
  label: string
  patterns: Record<string, string> // channel -> 16-char pattern
}

export const GROOVE_STEPS = 16

// Parse a 16-char pattern string into a boolean array.
export function parsePattern(pat: string): boolean[] {
  const out: boolean[] = []
  for (let i = 0; i < GROOVE_STEPS; i++) {
    out.push(pat[i] === 'x')
  }
  return out
}

export const GROOVE_TEMPLATES: GrooveTemplate[] = [
  {
    id: 'psy-gallop',
    label: 'Psy Gallop',
    patterns: {
      kick: 'xxx.xxx.xxx.xxx.',
      'hat-closed': '..x...x...x...x.',
      clap: '....x.......x...',
    },
  },
  {
    id: 'progressive',
    label: 'Progressive',
    patterns: {
      kick: 'x...x...x...x...',
      'hat-closed': '..x...x...x...x.',
      clap: '....x.......x...',
      'hat-open': '......x.......x.',
    },
  },
  {
    id: 'dark-forest',
    label: 'Dark Forest',
    patterns: {
      kick: 'xxx.xxx.xxx.xxx.',
      snare: '....x.......x...',
      'hat-closed': '..x.x...x.x...x.',
      perc: '..x...x...x...x.',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    patterns: {
      kick: 'x.......x.......',
      'hat-closed': '..x...x...x...x.',
    },
  },
]

// Find a groove template by id.
export function findGroove(id: string): GrooveTemplate | null {
  for (let i = 0; i < GROOVE_TEMPLATES.length; i++) {
    if (GROOVE_TEMPLATES[i].id === id) return GROOVE_TEMPLATES[i]
  }
  return null
}
