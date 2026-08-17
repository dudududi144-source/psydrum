// PSYDRUM audit B1 (HARD GATE) — static analysis.
//
// The psysynth bug was a nullish-coalescing pitch fallback that gave an
// unpitched drum a default pitch. This test greps every src/ file for
// null-coalesce (??) / logical-or (||) pitch fallbacks and FAILS the build if
// any is found. Comments are stripped first so documentation that merely
// mentions the anti-pattern does not false-positive.

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(import.meta.dir, '../../src')

function collectTsFiles(dir: string): string[] {
  var out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    var full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out = out.concat(collectTsFiles(full))
    } else if (entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

// Strip block and line comments so only code is scanned.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const B1_PATTERNS: RegExp[] = [
  /\bnote\s*\?\?\s*\d/,
  /\bnote\s*\|\|\s*\d/,
  /\bpitch\s*\?\?\s*\d/,
  /\bpitch\s*\|\|\s*\d/,
]

describe('audit B1 - no null-coalesce pitch fallback (hard gate)', () => {
  it('no src/ file falls back to a default pitch via ?? or ||', () => {
    var violations: string[] = []
    for (const file of collectTsFiles(SRC_ROOT)) {
      var code = stripComments(readFileSync(file, 'utf8'))
      for (const pattern of B1_PATTERNS) {
        if (pattern.test(code)) {
          violations.push(file + ' matches ' + pattern.source)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
