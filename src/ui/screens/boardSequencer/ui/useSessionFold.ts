import { useCallback, useSyncExternalStore } from 'react';

/** Where a fold's open state is kept: this browser tab, until it is closed (A1). */
const PREFIX = 'admi-fold:';
const listeners = new Set<() => void>();
/** Read once per key, then kept here, so every fold sharing a key agrees at once. */
const known = new Map<string, boolean>();

function read(key: string, fallback: boolean): boolean {
  const k = known.get(key);
  if (k !== undefined) return k;
  let v = fallback;
  try {
    const s = sessionStorage.getItem(PREFIX + key);
    if (s !== null) v = s === '1';
  } catch { /* not remembered */ }
  known.set(key, v);
  return v;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Forget every fold (a new session; the tests). */
export function forgetFolds(): void {
  known.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch { /* nothing kept */ }
  listeners.forEach((l) => l());
}

/**
 * A fold (▸ More…) that stays as it was left for the rest of the session: on every scene or
 * card that shares its key, at once, and after a reload. Nothing important hangs on it:
 * without session storage it simply starts as `fallback`.
 */
export function useSessionFold(key: string, fallback = false): [boolean, () => void] {
  const open = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
  const toggle = useCallback(() => {
    const next = !read(key, fallback);
    known.set(key, next);
    try { sessionStorage.setItem(PREFIX + key, next ? '1' : '0'); } catch { /* not remembered */ }
    listeners.forEach((l) => l());
  }, [key, fallback]);
  return [open, toggle];
}
