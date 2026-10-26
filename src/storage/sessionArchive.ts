/**
 * Every take's session log, kept in the browser as it is played, so a reload, Exit, or a
 * new Play doesn't throw away what was recorded (it is research data). The newest
 * MAX_TAKES are kept. The logs can be large — tens of thousands of notes — so they live
 * in IndexedDB, not localStorage. Without IndexedDB (a private window, the tests) it
 * simply keeps nothing, and the screen behaves as before.
 */
import type { SessionLogData } from '../songs/sessionLog';

export const MAX_TAKES = 30;

export interface TakeSummary {
  key: string;
  startedAt: string;
  player: string;
  notes: number;
}

/** Where takes are kept: IndexedDB in the app, a Map in the tests. */
export interface TakeStore {
  put(key: string, data: SessionLogData): Promise<void>;
  get(key: string): Promise<SessionLogData | null>;
  all(): Promise<{ key: string; data: SessionLogData }[]>;
  delete(key: string): Promise<void>;
}

export interface SessionArchive {
  save(data: SessionLogData): Promise<void>;
  list(): Promise<TakeSummary[]>;
  load(key: string): Promise<SessionLogData | null>;
}

const keyOf = (d: SessionLogData): string => `${d.startedAt}|${d.player}`;

export function createSessionArchive(store: TakeStore | null): SessionArchive {
  const list = async (): Promise<TakeSummary[]> => {
    if (!store) return [];
    const all = await store.all();
    return all
      .map(({ key, data }) => ({ key, startedAt: data.startedAt, player: data.player, notes: data.notes.length }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  };
  return {
    async save(data) {
      if (!store || data.notes.length === 0) return;
      try {
        await store.put(keyOf(data), data);
        const takes = await list();
        for (const old of takes.slice(MAX_TAKES)) await store.delete(old.key);
      } catch (err) {
        console.warn('[session archive] could not keep the take:', err);
      }
    },
    async list() {
      try { return await list(); } catch { return []; }
    },
    async load(key) {
      try { return store ? await store.get(key) : null; } catch { return null; }
    },
  };
}

export function memoryTakeStore(): TakeStore {
  const m = new Map<string, SessionLogData>();
  return {
    put: async (k, d) => { m.set(k, structuredClone(d)); },
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)!) : null),
    all: async () => [...m].map(([key, data]) => ({ key, data })),
    delete: async (k) => { m.delete(k); },
  };
}

const DB = 'admi-sessions';
const STORE = 'takes';

/** The browser's IndexedDB, or null where there is none. */
export function indexedDbTakeStore(): TakeStore | null {
  if (typeof indexedDB === 'undefined') return null;
  let opening: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    opening ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    put: async (k, data) => { await run('readwrite', (s) => s.put(data, k)); },
    get: async (k) => ((await run<SessionLogData | undefined>('readonly', (s) => s.get(k))) ?? null),
    all: async () => {
      const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      const values = await run<SessionLogData[]>('readonly', (s) => s.getAll());
      return keys.map((key, i) => ({ key: String(key), data: values[i] }));
    },
    delete: async (k) => { await run('readwrite', (s) => s.delete(k)); },
  };
}
