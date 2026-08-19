// PSYDRUM library sample loader (extraction from demo).
//
// Loads a real audio sample from a URL and returns the decoded AudioBuffer.
// Returns null on failure so the caller can fall back to synthesis. Keeping
// this in the library means it can be tested and reused by any host.

export async function loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const ab = await resp.arrayBuffer()
    return await ctx.decodeAudioData(ab)
  } catch (e) {
    return null
  }
}

// Load a map of channel -> sample URL, returning a map of channel -> AudioBuffer.
// Channels that fail to load are omitted from the result.
export async function loadSampleMap(
  ctx: AudioContext,
  urls: Record<string, string>
): Promise<Record<string, AudioBuffer>> {
  const out: Record<string, AudioBuffer> = {}
  for (const ch of Object.keys(urls)) {
    const buf = await loadSample(ctx, urls[ch])
    if (buf) out[ch] = buf
  }
  return out
}
