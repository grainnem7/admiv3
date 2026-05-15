/**
 * loadStemBuffers — fetch + decode a song's stem files into AudioBuffers.
 *
 * Shared by RemixEngine and SongPresetEngine so the fetch/decode/progress
 * logic lives in one place. Returns a map keyed by stem id; callers build
 * their own gain/filter graph from the buffers.
 */
export async function loadStemBuffers(
  ctx: AudioContext,
  stems: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, AudioBuffer>> {
  const stemIds = Object.keys(stems);
  const total = stemIds.length;
  let loaded = 0;
  const result = new Map<string, AudioBuffer>();

  await Promise.all(
    stemIds.map(async (stemId) => {
      const url = stems[stemId];
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      result.set(stemId, audioBuffer);
      loaded++;
      onProgress?.(loaded, total);
    }),
  );

  return result;
}
