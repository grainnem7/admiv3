/**
 * The page's side of the laptop copy (diskStore.ts): read it when the app opens, send it
 * a backup shortly after every save. Where there is no such server (a hosted build), every
 * call quietly does nothing and the browser's own saving carries on as before.
 */

import {
  applyBackup, hasBoardData, parseBoardBackup, shouldRestore, snapshotStorage, SAVED_AT_KEY, type BoardBackup,
} from './boardBackup';

export const STORE_PATH = '/admi-store';
const SAVE_DELAY_MS = 800;

export type DiskState = 'unknown' | 'saved' | 'unavailable';
let state: DiskState = 'unknown';
let lastSavedAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function diskState(): { state: DiskState; savedAt: number } {
  return { state, savedAt: lastSavedAt };
}
export function onDiskState(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function setState(s: DiskState, at = lastSavedAt): void {
  state = s;
  lastSavedAt = at;
  for (const fn of listeners) fn();
}

/** Browsers refuse a page-closing (keepalive) request bigger than 64 KB. */
const KEEPALIVE_LIMIT = 60 * 1024;

async function post(path: string, b: BoardBackup, keepalive = false): Promise<boolean> {
  try {
    const body = JSON.stringify(b);
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < KEEPALIVE_LIMIT,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The laptop's copy, or null when there is none or no server keeps one. */
export async function readDiskBackup(timeoutMs = 1500): Promise<BoardBackup | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(STORE_PATH, { signal: ctrl.signal, cache: 'no-store' });
    if (res.status === 404) { setState('unknown'); return null; } // a server, no copy yet
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('json')) { setState('unavailable'); return null; }
    const b = parseBoardBackup(await res.json());
    setState(b ? 'saved' : 'unavailable', b?.savedAt ?? 0);
    return b;
  } catch {
    setState('unavailable');
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * When the app opens: if the laptop's copy is newer than this browser's, use it. What it
 * replaces is sent to the laptop's backups folder first, so nothing is ever lost.
 */
export async function restoreFromDisk(): Promise<'restored' | 'kept'> {
  try {
    const disk = await readDiskBackup();
    const local = snapshotStorage(localStorage);
    if (!shouldRestore(local, disk) || !disk) return 'kept';
    if (hasBoardData(local)) await post(`${STORE_PATH}/replaced`, local);
    applyBackup(localStorage, disk);
    return 'restored';
  } catch {
    return 'kept';
  }
}

/** Send this browser's data to the laptop now. */
export async function flushDiskSave(keepalive = false): Promise<boolean> {
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    const snap = snapshotStorage(localStorage);
    if (!hasBoardData(snap)) return false;
    const ok = await post(STORE_PATH, snap, keepalive);
    setState(ok ? 'saved' : 'unavailable', ok ? snap.savedAt : lastSavedAt);
    return ok;
  } catch {
    return false;
  }
}

/** Call after the app saves: records the time and sends a copy once saving settles. */
export function scheduleDiskSave(): void {
  try { localStorage.setItem(SAVED_AT_KEY, String(Date.now())); } catch { /* not saved anyway */ }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushDiskSave(); }, SAVE_DELAY_MS);
}

// A change made just before the tab closes still reaches the laptop.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (timer) void flushDiskSave(true); });
}

/** Restore a backup file the facilitator chose: it becomes the newest copy everywhere. */
export async function restoreFromFile(b: BoardBackup): Promise<void> {
  const local = snapshotStorage(localStorage);
  if (hasBoardData(local)) await post(`${STORE_PATH}/replaced`, local);
  applyBackup(localStorage, b, Date.now());
  await flushDiskSave();
}
