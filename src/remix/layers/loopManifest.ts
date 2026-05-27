/**
 * loopManifest — pure helpers for the Remix loop layer's manifest.
 * A loop is only usable if its source BPM is known, and we read the BPM
 * from the filename (e.g. "drumloop_124bpm.wav", "Loop_130 BPM.wav").
 * Loops with no parseable BPM are dropped — they can't be time-stretched
 * to the song tempo correctly.
 */

/** A manifest entry as authored in loops.json (BPM not stored — parsed). */
export interface LoopManifestEntry {
  file: string;
  name: string;
}

/** A usable loop: manifest entry plus its parsed source BPM. */
export interface LoopDef {
  file: string;
  name: string;
  bpm: number;
}

/** Extract a BPM (2–3 digits) from a filename, or null if absent. */
export function parseBpmFromFilename(file: string): number | null {
  const m = /(?<!\d)(\d{2,3})\s?bpm/i.exec(file);
  return m ? Number(m[1]) : null;
}

/** Validate + enrich raw manifest entries, dropping any without a BPM. */
export function parseLoopManifest(raw: unknown): LoopDef[] {
  if (!Array.isArray(raw)) return [];
  const out: LoopDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.file !== 'string' || typeof e.name !== 'string') continue;
    const bpm = parseBpmFromFilename(e.file);
    if (bpm === null) continue;
    out.push({ file: e.file, name: e.name, bpm });
  }
  return out;
}
