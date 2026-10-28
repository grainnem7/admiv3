import { describe, it, expect } from 'vitest';
import { createTabSaving, type LockManagerLike } from '../storage/tabSaving';

/**
 * The browser's lock queue, shared by every "tab" made from it. A holder keeps the lock
 * until its callback settles or its tab closes (`closeHolder`), as the browser does; a
 * queued request can be given up (signal), and `ifAvailable` never queues.
 */
function fakeLocks(): LockManagerLike & { closeHolder(): void; refuse: boolean } {
  let holder: { release: () => void } | null = null;
  const queue: { grant: () => void; gone: () => boolean }[] = [];
  const next = (): void => {
    while (queue.length > 0) {
      const q = queue.shift()!;
      if (!q.gone()) { q.grant(); return; }
    }
  };
  const fake = {
    refuse: false,
    request(_name: string, options: { signal?: AbortSignal; ifAvailable?: boolean }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown> {
      if (fake.refuse) return Promise.reject(new Error('SecurityError'));
      return new Promise((resolve, reject) => {
        let aborted = false;
        const grant = (): void => {
          let released = false;
          const release = (): void => {
            if (released) return;
            released = true;
            holder = null;
            resolve(undefined);
            next();
          };
          holder = { release };
          void callback({}).then(release, release);
        };
        if (!holder) { grant(); return; }
        if (options.ifAvailable) { void callback(null).then(resolve, reject); return; }
        options.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); });
        queue.push({ grant, gone: () => aborted });
      });
    },
    query: async () => ({ held: holder ? [{ name: 'admi-saving' }] : [] }),
    closeHolder(): void { holder?.release(); },
  };
  return fake;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const quick = { waitMs: 40, pollMs: 10, freeLooks: 3 };

describe('one tab saves (T4-05)', () => {
  it('the only tab saves at once', async () => {
    const tab = createTabSaving(fakeLocks());
    expect(tab.canSave()).toBe(false); // not before it is known
    expect(await tab.claim(quick)).toBe('saving');
    expect(tab.canSave()).toBe(true);
    expect(tab.state()).toBe('saving');
  });

  it('a second tab waits, and can save nothing', async () => {
    const locks = fakeLocks();
    const a = createTabSaving(locks);
    const b = createTabSaving(locks);
    await a.claim(quick);
    expect(await b.claim(quick)).toBe('waiting');
    await tick(80);
    expect(b.canSave()).toBe(false);
    expect(b.state()).toBe('waiting');
    expect(a.canSave()).toBe(true);
  });

  it('when the saving tab closes, the waiting tab reads what it saved first, then saves', async () => {
    const locks = fakeLocks();
    const a = createTabSaving(locks);
    const b = createTabSaving(locks);
    await a.claim(quick);
    const seen: string[] = [];
    b.subscribe(() => seen.push(b.state()));
    await b.claim({
      ...quick,
      onTakeOver: async () => {
        // Reading the latest copy may write (the laptop's copy into the browser): allowed,
        // but ADMI is not shown, and nothing else saves, until it is done.
        seen.push(`take over: ${b.state()}, may write ${b.canSave()}`);
        await tick(5);
      },
    });
    expect(b.state()).toBe('waiting');
    locks.closeHolder(); // tab A closes (or crashes)
    await tick(150);
    expect(seen).toEqual(['waiting', 'take over: waiting, may write true', 'saving']);
    expect(b.canSave()).toBe(true);
  });

  it('a reload of the only tab: the old page lets go a moment after the new one asks, and the new one saves, never waits', async () => {
    const locks = fakeLocks();
    const old = createTabSaving(locks);
    await old.claim(quick);
    const reloaded = createTabSaving(locks);
    const answer = reloaded.claim({ ...quick, waitMs: 500 });
    await tick(30);
    locks.closeHolder();
    expect(await answer).toBe('saving');
    expect(reloaded.canSave()).toBe(true);
  });

  it('a reload of the tab that saves, with another tab waiting: the reloaded tab still saves, the other still waits', async () => {
    const locks = fakeLocks();
    const a = createTabSaving(locks);
    const b = createTabSaving(locks);
    await a.claim(quick);
    await b.claim(quick);
    // A reloads: its old page lets go, and the new page asks again a moment later.
    locks.closeHolder();
    const aAgain = createTabSaving(locks);
    const answer = aAgain.claim({ ...quick, waitMs: 500 });
    expect(await answer).toBe('saving');
    await tick(100);
    expect(b.state()).toBe('waiting');
    expect(b.canSave()).toBe(false);
  });

  it('only one tab at a time: after a take-over, a third tab still waits', async () => {
    const locks = fakeLocks();
    const [a, b, c] = [createTabSaving(locks), createTabSaving(locks), createTabSaving(locks)];
    await a.claim(quick);
    await b.claim(quick);
    await c.claim(quick);
    locks.closeHolder();
    await tick(150);
    expect([b.canSave(), c.canSave()].filter(Boolean)).toHaveLength(1);
    expect([b.state(), c.state()].sort()).toEqual(['saving', 'waiting']);
  });

  it('no Web Locks in this browser: it saves as before', async () => {
    const tab = createTabSaving(null);
    expect(tab.canSave()).toBe(true);
    expect(await tab.claim()).toBe('saving');
    expect(tab.guarded()).toBe(false);
  });

  it('the browser refuses the lock itself: it saves as before', async () => {
    const locks = fakeLocks();
    locks.refuse = true;
    const tab = createTabSaving(locks);
    expect(await tab.claim(quick)).toBe('saving');
    expect(tab.canSave()).toBe(true);
  });
});
