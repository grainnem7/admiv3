/**
 * arrangementStore — persist remix arrangements in localStorage, keyed by
 * songId + a user name. Pure storage wrappers; no UI.
 */
import type { RemixArrangement } from './remixRecording';

const PREFIX = 'remix:arr:';
const key = (songId: string, name: string) => `${PREFIX}${songId}:${name}`;

export function saveArrangement(name: string, a: RemixArrangement): void {
  localStorage.setItem(key(a.songId, name), JSON.stringify(a));
}

export function loadArrangementFromStore(songId: string, name: string): RemixArrangement | null {
  const raw = localStorage.getItem(key(songId, name));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RemixArrangement;
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
