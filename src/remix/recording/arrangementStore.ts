/**
 * arrangementStore — persist remix arrangements in localStorage, keyed by
 * songId + a user name. Pure storage wrappers; no UI.
 */
import type { RemixArrangement } from './remixRecording';

const PREFIX = 'remix:arr:';
const key = (songId: string, name: string) => `${PREFIX}${songId}:${name}`;

/** Returns false if storage rejected the write (e.g. quota exceeded / disabled). */
export function saveArrangement(name: string, a: RemixArrangement): boolean {
  try {
    localStorage.setItem(key(a.songId, name), JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

/** Structural guard so malformed / schema-drifted blobs can't crash compositing later. */
function isValidArrangement(v: unknown): v is RemixArrangement {
  if (!v || typeof v !== 'object') return false;
  const a = v as Partial<RemixArrangement>;
  if (typeof a.songId !== 'string' || !Array.isArray(a.sections)) return false;
  return a.sections.every(
    (s) =>
      s != null &&
      Array.isArray((s as { layers?: unknown }).layers) &&
      (s as { layers: unknown[] }).layers.every(
        (t) =>
          t != null &&
          typeof (t as { id?: unknown }).id === 'string' &&
          Array.isArray((t as { events?: unknown }).events),
      ),
  );
}

export function loadArrangementFromStore(songId: string, name: string): RemixArrangement | null {
  const raw = localStorage.getItem(key(songId, name));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidArrangement(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function listArrangements(songId: string): string[] {
  const out: string[] = [];
  const p = `${PREFIX}${songId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(p)) out.push(k.slice(p.length));
  }
  return out;
}
