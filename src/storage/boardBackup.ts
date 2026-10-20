/**
 * Everything the Board Sequencer keeps between sessions — the rig, every player with
 * their loops, scenes and settings, the camera choice and the iPad code — as one backup.
 *
 * The browser keeps saved data per ADDRESS: http://localhost:3000 and :3001, or the same
 * page opened from another browser, each start empty. Loops saved under one were simply
 * not there under another. A backup is how the same setup reaches all of them: it is
 * written to a file on the laptop as the app saves (see diskSync.ts) and can be saved to
 * and restored from a file by hand.
 *
 * Pure apart from the Storage passed in, and safe to import from Node (the dev server).
 */

export const BACKUP_APP = 'admi-board';
export const BACKUP_VERSION = 1;

/** The saved data that belongs to the Board Sequencer. */
export const SYNCED_KEYS = [
  'admi-board-rig',
  'admi-board-players',
  'admi-board-active-player',
  'admi-board-sequencer',
  'admi-camera-choice',
  'admi-remote-enabled',
  'admi-remote-code',
] as const;

/** When this browser last saved, so the newer of two copies wins. */
export const SAVED_AT_KEY = 'admi-board-saved-at';

const PLAYERS_KEY = 'admi-board-players';
const RIG_KEY = 'admi-board-rig';

/** The part of the browser's Storage used here (named so Node can type-check this file). */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BoardBackup {
  app: typeof BACKUP_APP;
  version: number;
  /** ms since 1970; 0 = never saved by a version that kept the time. */
  savedAt: number;
  /** Raw stored strings, exactly as the browser had them. */
  keys: Record<string, string>;
}

/** A backup read from a file or the server, or null when it is not one. */
export function parseBoardBackup(v: unknown): BoardBackup | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.app !== BACKUP_APP || typeof o.version !== 'number' || o.version > BACKUP_VERSION) return null;
  if (typeof o.keys !== 'object' || o.keys === null) return null;
  const keys: Record<string, string> = {};
  for (const k of SYNCED_KEYS) {
    const val = (o.keys as Record<string, unknown>)[k];
    if (typeof val === 'string') keys[k] = val;
  }
  const savedAt = typeof o.savedAt === 'number' && Number.isFinite(o.savedAt) && o.savedAt > 0 ? o.savedAt : 0;
  return { app: BACKUP_APP, version: o.version, savedAt, keys };
}

export function localSavedAt(storage: Pick<KeyStore, 'getItem'>): number {
  const n = Number(storage.getItem(SAVED_AT_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What this browser has saved now. */
export function snapshotStorage(storage: Pick<KeyStore, 'getItem'>): BoardBackup {
  const keys: Record<string, string> = {};
  for (const k of SYNCED_KEYS) {
    const v = storage.getItem(k);
    if (v !== null) keys[k] = v;
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, savedAt: localSavedAt(storage), keys };
}

/**
 * Make this browser's saved data exactly the backup's: keys the backup has are written,
 * Board Sequencer keys it lacks are removed. `savedAt` is what the browser records as its
 * own save time (the backup's, or now for a restore the player chose).
 */
export function applyBackup(storage: KeyStore, b: BoardBackup, savedAt = b.savedAt): void {
  // All or nothing: a half-applied backup (storage full part-way) would leave one
  // player's loops with another setup's colours. On failure the old values go back.
  const before = new Map<string, string | null>();
  for (const k of [...SYNCED_KEYS, SAVED_AT_KEY]) before.set(k, storage.getItem(k));
  try {
    for (const k of SYNCED_KEYS) {
      if (k in b.keys) storage.setItem(k, b.keys[k]);
      else storage.removeItem(k);
    }
    if (savedAt > 0) storage.setItem(SAVED_AT_KEY, String(savedAt));
    else storage.removeItem(SAVED_AT_KEY);
  } catch (err) {
    for (const [k, v] of before) {
      try { if (v === null) storage.removeItem(k); else storage.setItem(k, v); } catch { /* best effort */ }
    }
    throw err;
  }
}

/** Whether a backup holds a board setup or any player at all. */
export function hasBoardData(b: BoardBackup): boolean {
  return RIG_KEY in b.keys || PLAYERS_KEY in b.keys;
}

function sameKeys(a: BoardBackup, b: BoardBackup): boolean {
  return SYNCED_KEYS.every((k) => a.keys[k] === b.keys[k]);
}

/** The laptop's copy should replace this browser's: it has a setup, and it is newer. */
export function shouldRestore(local: BoardBackup, disk: BoardBackup | null): boolean {
  if (!disk || !hasBoardData(disk) || sameKeys(local, disk)) return false;
  return disk.savedAt > local.savedAt;
}

export interface BackupSummary {
  players: number;
  /** Saved loops across every player. */
  loops: number;
  scenes: number;
}

/** What a backup holds, in the terms the facilitator uses. */
export function summariseBackup(b: BoardBackup): BackupSummary {
  let players: unknown = [];
  try { players = JSON.parse(b.keys[PLAYERS_KEY] ?? '[]'); } catch { players = []; }
  const list = Array.isArray(players) ? players : [];
  let loops = 0;
  let scenes = 0;
  for (const p of list) {
    const s = (typeof p === 'object' && p !== null ? (p as { settings?: unknown }).settings : null) as
      { loopSlots?: unknown; scenes?: unknown } | null;
    if (!s) continue;
    if (Array.isArray(s.loopSlots)) loops += s.loopSlots.filter((slot) => Array.isArray(slot) && slot.length > 0).length;
    if (Array.isArray(s.scenes)) scenes += s.scenes.length;
  }
  return { players: list.length, loops, scenes };
}

/** "admi-board-backup-2026-10-20-1904.json" */
export function backupFileName(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `admi-board-backup-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.json`;
}
