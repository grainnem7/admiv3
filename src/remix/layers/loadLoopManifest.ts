/**
 * loadLoopManifest — fetch the curated loop manifest from
 * public/samples/drums/loops/loops.json and return only the loops whose
 * filename encodes a BPM. Any failure (missing file, bad JSON) yields an
 * empty list so the loop layer simply doesn't appear — never an error.
 */

import { parseLoopManifest, type LoopDef } from './loopManifest';

const MANIFEST_URL = 'samples/drums/loops/loops.json';

export async function loadLoopManifest(): Promise<LoopDef[]> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return [];
    return parseLoopManifest(await res.json());
  } catch {
    return [];
  }
}
