// Step K tests — groove templates.

import { describe, it, expect } from 'bun:test'
import { GROOVE_TEMPLATES, parsePattern, findGroove, GROOVE_STEPS } from '../../src/psy-drum/grooves'

describe('groove templates', () => {
  it('provides at least four grooves with unique ids', () => {
    expect(GROOVE_TEMPLATES.length).toBeGreaterThanOrEqual(4)
    const ids = GROOVE_TEMPLATES.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every pattern is 16 steps of x/. characters', () => {
    for (const g of GROOVE_TEMPLATES) {
      for (const ch of Object.keys(g.patterns)) {
        const pat = g.patterns[ch]
        expect(pat.length).toBe(GROOVE_STEPS)
        for (const c of pat) {
          expect(c === 'x' || c === '.').toBe(true)
        }
      }
    }
  })

  it('parsePattern converts x/. to booleans', () => {
    const p = parsePattern('x.x.')
    expect(p[0]).toBe(true)
    expect(p[1]).toBe(false)
    expect(p[2]).toBe(true)
    expect(p[3]).toBe(false)
    // pads to 16 with false
    expect(p.length).toBe(GROOVE_STEPS)
  })

  it('findGroove returns the template by id, null otherwise', () => {
    expect(findGroove('psy-gallop')).not.toBeNull()
    expect(findGroove('nope')).toBeNull()
  })

  it('every groove has at least one hit somewhere', () => {
    for (const g of GROOVE_TEMPLATES) {
      const anyHit = Object.keys(g.patterns).some(ch => g.patterns[ch].includes('x'))
      expect(anyHit).toBe(true)
    }
  })
})
