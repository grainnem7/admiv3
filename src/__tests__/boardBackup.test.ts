import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  applyBackup, backupFileName, parseBoardBackup, shouldRestore, snapshotStorage, summariseBackup,
  SAVED_AT_KEY, type BoardBackup,
} from '../storage/boardBackup';
import { createDiskStore, diskStoreHandler } from '../storage/diskStore';
import { loadActiveBoardConfig, saveActiveBoardConfig } from '../profiles/BoardProfiles';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored } from '../profiles/BoardSequencerConfig';

/**
 * Saved loops have to be there next time. The browser keeps them per address (port,
 * browser), so the app also keeps a copy on the laptop and can back up to a file.
 */

const players = (loops: (unknown[] | null)[], scenes: unknown[] = []) =>
  JSON.stringify([{ id: 'p1', name: 'Tim', settings: { loopSlots: loops, scenes }, channelSettings: {} }]);

const backup = (savedAt: number, keys: Record<string, string>): BoardBackup =>
  ({ app: 'admi-board', version: 1, savedAt, keys });

describe('a backup', () => {
  beforeEach(() => localStorage.clear());

  it('is read back only when it is one, and only the Board Sequencer keys', () => {
    expect(parseBoardBackup(null)).toBeNull();
    expect(parseBoardBackup({ app: 'other', version: 1, keys: {} })).toBeNull();
    expect(parseBoardBackup({ app: 'admi-board', version: 99, keys: {} })).toBeNull();
    const b = parseBoardBackup({ app: 'admi-board', version: 1, savedAt: 5, keys: { 'admi-board-rig': '{}', 'admi-storage': 'x', 'admi-board-players': 3 } });
    expect(b).toEqual(backup(5, { 'admi-board-rig': '{}' }));
  });

  it('round-trips through storage exactly, removing keys the backup does not have', () => {
    localStorage.setItem('admi-board-rig', 'OLD');
    localStorage.setItem('admi-remote-code', '1111');
    localStorage.setItem('admi-storage', 'untouched');
    applyBackup(localStorage, backup(42, { 'admi-board-rig': 'NEW', 'admi-board-players': players([]) }));
    expect(localStorage.getItem('admi-board-rig')).toBe('NEW');
    expect(localStorage.getItem('admi-remote-code')).toBeNull();
    expect(localStorage.getItem('admi-storage')).toBe('untouched');
    expect(localStorage.getItem(SAVED_AT_KEY)).toBe('42');
    expect(snapshotStorage(localStorage)).toEqual(backup(42, { 'admi-board-rig': 'NEW', 'admi-board-players': players([]) }));
  });

  it('the laptop copy wins only when it has a setup and is newer', () => {
    const local = backup(100, { 'admi-board-players': players([[{ row: 0, col: 0, colour: 'c1' }]]) });
    const newer = backup(200, { 'admi-board-players': players([]) });
    expect(shouldRestore(local, newer)).toBe(true);
    expect(shouldRestore(local, { ...newer, savedAt: 50 })).toBe(false);
    expect(shouldRestore(local, null)).toBe(false);
    expect(shouldRestore(local, backup(200, {}))).toBe(false); // empty: never wipes a setup
    expect(shouldRestore(local, { ...local, savedAt: 300 })).toBe(false); // same data
    // A browser that saved before save times were kept (another port, say) takes the copy.
    expect(shouldRestore(backup(0, local.keys), newer)).toBe(true);
  });

  it('says what it holds', () => {
    const b = backup(1, { 'admi-board-players': players([[{ row: 0, col: 0, colour: 'c1' }], null, [], [{ row: 1, col: 1, colour: 'c2' }]], [{ id: 's1' }]) });
    expect(summariseBackup(b)).toEqual({ players: 1, loops: 2, scenes: 1 });
    expect(backupFileName(new Date(2026, 9, 20, 19, 4))).toBe('admi-board-backup-2026-10-20-1904.json');
  });
});

describe('saved loops, scenes and names survive a reload', () => {
  beforeEach(() => localStorage.clear());

  it('every slot with its box detail, names, scenes and the performance settings', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      loopSlots: [
        [{ row: 2, col: 3, colour: DEFAULT_BOARD_SEQUENCER_CONFIG.channels[0]?.id ?? 'c1', velocity: 0.8, timingBeats: 0.25 }],
        null,
        [{ row: 0, col: 7, colour: 'c9', conditional: true }],
        null, null, null, null,
        [{ row: 5, col: 1, colour: 'c2' }],
      ],
      loopNames: ['Bed', '', 'Beat', '', '', '', '', 'Last'],
      scenes: [{ id: 's1', name: 'Arrival', loops: [0], settings: { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0, evolveAmount: 0, bpm: 90 }, at: 0 }],
      loopFadePasses: 2,
      performance: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.performance, style: 'chord', lengthSec: 420 },
    };
    saveActiveBoardConfig(cfg);
    const back = loadActiveBoardConfig()!;
    expect(back.loopSlots).toEqual(cfg.loopSlots);
    expect(back.loopNames).toEqual(cfg.loopNames);
    expect(back.scenes).toEqual(cfg.scenes);
    expect(back.loopFadePasses).toBe(2);
    expect(back.performance).toEqual(cfg.performance);
  });
});

describe('the laptop copy (dev server)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'admi-store-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const text = (savedAt: number) => JSON.stringify(backup(savedAt, { 'admi-board-players': players([]) }));

  it('writes whole backups only, and keeps the copy it replaces', () => {
    const store = createDiskStore(dir);
    expect(store.read()).toBeNull();
    expect(store.write('not json', 'main')).toBe(false);
    expect(store.write('{"app":"other"}', 'main')).toBe(false);
    expect(store.write(text(1), 'main', new Date(2026, 0, 1, 10, 0))).toBe(true);
    expect(store.write(text(2), 'main', new Date(2026, 0, 1, 10, 1))).toBe(true);
    expect(JSON.parse(store.read()!).savedAt).toBe(2);
    expect(store.backups().filter((f) => f.endsWith('-saved.json'))).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, 'backups', store.backups()[0]), 'utf8')).savedAt).toBe(1);
    expect(store.write(text(3), 'replaced')).toBe(true);
    expect(store.backups().some((f) => f.endsWith('-replaced.json'))).toBe(true);
    expect(readdirSync(dir)).not.toContain('board.json.tmp');
  });

  it('answers only the ADMI page on this laptop', () => {
    const handler = diskStoreHandler(createDiskStore(dir));
    const call = (remoteAddress: string, headers: Record<string, string>) => {
      const res = { statusCode: 200, headers: {} as Record<string, string>, body: '', setHeader(k: string, v: string) { this.headers[k] = v; }, end(b?: string) { this.body = b ?? ''; } };
      handler({ url: '/', method: 'GET', headers, socket: { remoteAddress } } as unknown as IncomingMessage, res as unknown as ServerResponse, () => {});
      return res.statusCode;
    };
    expect(call('172.20.10.3', { host: '172.20.10.8:3001' })).toBe(403);                               // the iPad, or anyone on the Wi-Fi
    expect(call('127.0.0.1', { host: 'localhost:3001', origin: 'https://evil.example' })).toBe(403);    // another website in the same browser
    expect(call('127.0.0.1', { host: 'localhost:3001', origin: 'http://localhost:3001' })).toBe(404);   // ADMI: no copy yet
    expect(call('127.0.0.1', { host: 'localhost:3001' })).toBe(404);
  });

  it('only moves forward: never replaced by an older or an empty setup', () => {
    const store = createDiskStore(dir);
    expect(store.write(text(200), 'main')).toBe(true);
    expect(store.write(text(100), 'main')).toBe(false);
    expect(store.write(JSON.stringify(backup(300, {})), 'main')).toBe(false);
    expect(JSON.parse(store.read()!).savedAt).toBe(200);
    expect(store.write(text(300), 'main')).toBe(true);
  });
});
