// Scaffold baseline test — the structure gate (scripts/check.ts) requires this file.
// It asserts the repo scaffold (docs + config) is present and readable, so a green
// `bun test` means the scaffold is intact.

import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'

const DOCS = [
  'README.md',
  'ARCHITECTURE.md',
  'ARCHITECTURE-STYLE.md',
  'INTEGRATION-GUIDE.md',
  'PSY-DRUM-IMPLEMENTATION-PLAN.md',
] as const

describe('scaffold baseline', () => {
  for (const doc of DOCS) {
    it(`${doc} exists and is non-empty`, () => {
      expect(existsSync(doc)).toBe(true)
      expect(readFileSync(doc, 'utf8').length).toBeGreaterThan(0)
    })
  }

  it('package.json declares the expected scripts', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts.test).toBe('bun test')
    expect(pkg.scripts.check).toBe('bun run scripts/check.ts')
    expect(pkg.scripts['secret-scan']).toBe('bun run scripts/secret-scan.ts')
  })
})
