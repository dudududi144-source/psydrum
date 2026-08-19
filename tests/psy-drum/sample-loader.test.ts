// Extraction tests - sample loader (library-grade).
// The loader is async and needs an AudioContext + fetch, so these tests focus
// on graceful failure (bad URL returns null) and the map loader shape.

import { describe, it, expect } from 'bun:test'
import { loadSample, loadSampleMap } from '../../src/psy-drum/sample-loader'

// Minimal mock AudioContext that fails to decode (we only exercise the
// fetch-failure path here, which returns null before decode).
const mockCtx = {
  decodeAudioData: async () => { throw new Error('no decode in test') },
  sampleRate: 44100,
} as unknown as AudioContext

describe('sample loader (extraction)', () => {
  it('loadSample returns null when fetch fails', async () => {
    // Use a URL that will not resolve in the test environment
    const buf = await loadSample(mockCtx, 'http://127.0.0.1:1/__nope__.wav')
    expect(buf).toBeNull()
  })

  it('loadSampleMap returns an object and omits failed channels', async () => {
    const map = await loadSampleMap(mockCtx, { kick: 'http://127.0.0.1:1/__nope__.wav' })
    expect(typeof map).toBe('object')
    expect(map.kick).toBeUndefined()
  })
})
