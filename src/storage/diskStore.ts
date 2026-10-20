/**
 * The laptop's copy of the Board Sequencer's saved data, kept by the local dev/preview
 * server in a folder next to the app (.admi-data/). The page sends its backup here as it
 * saves and reads it back when it opens, so loops and scenes survive a different address,
 * a different browser, or cleared browser data.
 *
 * Only the laptop itself may read or write it: the server also listens on the local
 * network for the iPad, and nothing on the network should be able to replace a player's
 * loops. Every write is checked, written whole (temporary file, then rename), and the copy
 * it replaces is kept in backups/ — the newest 40 of them.
 *
 * Node only. Never bundled into the app.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasBoardData, parseBoardBackup } from './boardBackup';

export const STORE_PATH = '/admi-store';
const MAX_BODY = 8 * 1024 * 1024;
const KEEP_BACKUPS = 40;
/** A routine save keeps the copy it replaces at most this often. */
const BACKUP_EVERY_MS = 10 * 60 * 1000;

export function isLoopback(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The request comes from ADMI's own page on this laptop: addressed to localhost, and
 * either not from a page at all or from one at that same address. Being on the laptop is
 * not enough — any website open in the same browser could otherwise post to it.
 */
export function isOwnPage(host: string | undefined, origin: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_HOSTS.has(name)) return false;
  return origin === undefined || origin === `http://${host}` || origin === `https://${host}`;
}

function stamp(at: Date): string {
  return at.toISOString().replace(/[:.]/g, '-');
}

export interface DiskStore {
  read(): string | null;
  /** Save a backup; `replaced` = the copy a restore is about to overwrite. */
  write(text: string, kind: 'main' | 'replaced', now?: Date): boolean;
  backups(): string[];
}

export function createDiskStore(dir: string): DiskStore {
  const main = join(dir, 'board.json');
  const backupDir = join(dir, 'backups');
  const ensure = () => mkdirSync(backupDir, { recursive: true });
  const backups = () => (existsSync(backupDir) ? readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort() : []);
  const prune = () => {
    const all = backups();
    for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) {
      try { unlinkSync(join(backupDir, f)); } catch { /* already gone */ }
    }
  };
  return {
    read() {
      try { return readFileSync(main, 'utf8'); } catch { return null; }
    },
    write(text, kind, now = new Date()) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return false; }
      const incoming = parseBoardBackup(parsed);
      if (!incoming) return false;
      ensure();
      if (kind === 'replaced') {
        writeFileSync(join(backupDir, `${stamp(now)}-replaced.json`), text);
        prune();
        return true;
      }
      // The laptop copy only moves forward: never replaced by an empty setup, or by an
      // older one (a tab left open since yesterday).
      if (!hasBoardData(incoming)) return false;
      let current: ReturnType<typeof parseBoardBackup> = null;
      try { current = existsSync(main) ? parseBoardBackup(JSON.parse(readFileSync(main, 'utf8'))) : null; } catch { current = null; }
      if (current && incoming.savedAt < current.savedAt) return false;
      if (existsSync(main)) {
        const newest = backups().filter((f) => f.endsWith('-saved.json')).pop();
        const last = newest ? statSync(join(backupDir, newest)).mtimeMs : 0;
        if (now.getTime() - last >= BACKUP_EVERY_MS) {
          copyFileSync(main, join(backupDir, `${stamp(now)}-saved.json`));
          prune();
        }
      }
      const tmp = `${main}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, main);
      return true;
    },
    backups,
  };
}

type Next = (err?: unknown) => void;

/** Connect-style handler, mounted at STORE_PATH (so req.url is "/" or "/replaced"). */
export function diskStoreHandler(store: DiskStore) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/' && path !== '' && path !== '/replaced') { next(); return; }
    if (!isLoopback(req.socket.remoteAddress) || !isOwnPage(req.headers.host, req.headers.origin)) {
      res.statusCode = 403; res.end(); return;
    }
    if (req.method === 'GET' && path !== '/replaced') {
      const text = store.read();
      res.setHeader('Cache-Control', 'no-store');
      if (text === null) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(text);
      return;
    }
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { tooBig = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) { res.statusCode = 413; res.end(); return; }
      let ok = false;
      try { ok = store.write(Buffer.concat(chunks).toString('utf8'), path === '/replaced' ? 'replaced' : 'main'); } catch { ok = false; }
      res.statusCode = ok ? 204 : 400;
      res.end();
    });
  };
}
