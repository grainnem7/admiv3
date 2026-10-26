import { describe, it, expect } from 'vitest';
import { createSessionArchive, memoryTakeStore, MAX_TAKES } from '../storage/sessionArchive';
import { SessionLog, type SessionLogData } from '../songs/sessionLog';

const take = (iso: string, notes = 3): SessionLogData => ({
  version: 1, startedAt: iso, player: 'Tim',
  notes: Array.from({ length: notes }, (_, i) => ({ t: i, origin: 'placed', role: 'melody', colour: 'r', row: 1, col: i, durSec: 0.5, source: 'live' })),
  events: [{ t: 0, kind: 'start', player: 'Tim', settings: {} }],
});

describe('the archive of session takes', () => {
  it('keeps each take, newest first, and gives it back whole', async () => {
    const a = createSessionArchive(memoryTakeStore());
    await a.save(take('2026-10-26T10:00:00.000Z'));
    await a.save(take('2026-10-26T11:00:00.000Z', 5));
    const list = await a.list();
    expect(list.map((t) => t.notes)).toEqual([5, 3]);
    expect((await a.load(list[1].key))?.startedAt).toBe('2026-10-26T10:00:00.000Z');
  });

  it('saving the same take again replaces it (autosave while playing)', async () => {
    const a = createSessionArchive(memoryTakeStore());
    await a.save(take('2026-10-26T10:00:00.000Z', 1));
    await a.save(take('2026-10-26T10:00:00.000Z', 9));
    expect((await a.list()).map((t) => t.notes)).toEqual([9]);
  });

  it('keeps only the newest takes', async () => {
    const a = createSessionArchive(memoryTakeStore());
    for (let i = 0; i < MAX_TAKES + 3; i++) await a.save(take(new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()));
    const list = await a.list();
    expect(list).toHaveLength(MAX_TAKES);
    expect(list.at(-1)?.startedAt).toBe(new Date(Date.UTC(2026, 9, 1, 0, 3)).toISOString());
  });

  it('a take with no notes is not worth keeping', async () => {
    const a = createSessionArchive(memoryTakeStore());
    await a.save(take('2026-10-26T10:00:00.000Z', 0));
    expect(await a.list()).toEqual([]);
  });
});

describe('a session log brought back', () => {
  it('is the same log, ready to save, but not running', () => {
    const log = new SessionLog(() => 0);
    log.start('Tim', { bpm: 90 }, 0);
    log.addNotes([{ row: 1, col: 2, colour: 'r', role: 'melody', audioTime: 1, durSec: 0.5, source: 'live', origin: 'placed', midi: 60 }]);
    const back = SessionLog.fromJSON(log.toJSON());
    expect(back.toJSON()).toEqual(log.toJSON());
    expect(back.isRunning()).toBe(false);
    expect(back.counts().notes).toBe(1);
  });
});
