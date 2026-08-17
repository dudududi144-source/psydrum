// Phase 3 static-analysis guard (audit B1).
//
// Unpitched drums must IGNORE NoteEvent.note for pitch, and NO code path may
// fall back to a default pitch. This test scans every source file under
// src/psy-drum and FAILS THE BUILD if it finds a null-coalesce (or logical-or)
// pitch fallback such as `note ?? 60` / `event.note ?? 60` / `note || 60`.
//
// It is intentionally a dumb grep so it cannot be fooled by clever typing: if a
// fallback ever sneaks in, the build goes red and the review stops.

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = join(__dirname, '..', '..', 'src', 'psy-drum')

// Any of these means someone re-introduced a default-pitch fallback.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bnote\s*\?\?\s*-?\d+/g, // note ?? 60, event.note ?? 60
  /\bnote\s*\|\|\s*-?\d+/g, // note || 60, event.note || 60
]

function collectTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const nested of collectTsFiles(full)) out.push(nested)
    } else if (entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('anti-B1 static analysis (audit B1)', () => {
  it('finds the psy-drum sources to scan', () => {
    const files = collectTsFiles(SRC_DIR)
    expect(files.length).toBeGreaterThan(0)
  })

  it('has no null-coalesce / logical-or pitch fallback in src/psy-drum', () => {
    const files = collectTsFiles(SRC_DIR)
    const violations: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        pattern.lastIndex = 0
        if (pattern.test(source)) {
          violations.push(file)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
