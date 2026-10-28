/**
 * One tab saves. Two tabs of ADMI at the same address share one browser store, and each
 * wrote its own copy of the loops over the other's: a loop kept in one was gone after the
 * other saved (T4-05). Warning about it was not enough.
 *
 * The first tab holds a lock (the browser's Web Locks) for as long as it is open. The
 * browser lets go of it by itself when that tab closes, reloads or crashes, so nothing can
 * leave it stuck. Any other tab waits: it saves nothing, to the browser or to the laptop's
 * copy, and says why. Once the lock has been free for a few seconds (the tab that saved has
 * gone, not just reloaded), the waiting tab takes it, reads what the other tab saved
 * (onTakeOver), and only then shows ADMI and saves.
 *
 * A reload is a new page asking for the lock a moment after the old one let go, so:
 *  - a new page waits up to `waitMs` for the lock before it calls itself the waiting tab
 *    (a reload of the only tab never lands on "open in another tab");
 *  - a waiting tab does not queue for the lock, it watches it, so the tab that saves keeps
 *    saving after a reload even while another tab is open.
 *
 * A browser without Web Locks (an old one, or a page opened over plain http from another
 * machine) saves as before: the other-tab warning on the board is then all there is.
 */

/** What the app shows: still finding out, the tab that saves, or a tab that waits. */
export type TabState = 'pending' | 'saving' | 'waiting';

/** The part of the browser's LockManager used here (a fake one in the tests). */
export interface LockManagerLike {
  request(
    name: string, options: { signal?: AbortSignal; ifAvailable?: boolean },
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
}

export interface ClaimOptions {
  /** How long a new page waits for the lock before it says another tab has it. */
  waitMs?: number;
  /** How often a waiting tab looks at the lock. */
  pollMs?: number;
  /** How many looks in a row must find the lock free before a waiting tab takes it. */
  freeLooks?: number;
  /** Runs when the lock comes to a waiting tab, before it shows ADMI or saves anything. */
  onTakeOver?: () => Promise<void> | void;
}

export interface TabSaving {
  /** Ask for the lock; resolves once it is known whether this tab saves. */
  claim(o?: ClaimOptions): Promise<TabState>;
  /** This tab may write: it holds the lock (or the browser has no locks to hold). */
  canSave(): boolean;
  state(): TabState;
  subscribe(fn: () => void): () => void;
  /** Saving is guarded by the lock (false where the browser has no Web Locks). */
  guarded(): boolean;
}

export const SAVING_LOCK = 'admi-saving';
/** Long enough for a reloading page's old self to let go of the lock, even on a busy laptop. */
export const CLAIM_WAIT_MS = 3000;
const POLL_MS = 1000;
/** About five seconds free: a reload of the tab that saves has long since asked again. */
const FREE_LOOKS = 5;

/** Held for the life of the tab: the browser lets go of it when the tab goes. */
const forever = (): Promise<never> => new Promise<never>(() => {});

export function createTabSaving(locks: LockManagerLike | null): TabSaving {
  let state: TabState = locks ? 'pending' : 'saving';
  let held = locks === null;
  let claimed: Promise<TabState> | null = null;
  const listeners = new Set<() => void>();
  const set = (s: TabState): void => {
    state = s;
    for (const fn of listeners) fn();
  };

  /** A waiting tab: look at the lock now and then, and take it once it has been free a while. */
  const watch = (locks: LockManagerLike, o: ClaimOptions): void => {
    let free = 0;
    let looking = false;
    const id = setInterval(() => {
      if (looking) return;
      looking = true;
      void (async () => {
        try {
          const snapshot = await locks.query();
          const busy = (snapshot.held ?? []).some((l) => l.name === SAVING_LOCK);
          free = busy ? 0 : free + 1;
          if (free < (o.freeLooks ?? FREE_LOOKS)) return;
          free = 0;
          await locks.request(SAVING_LOCK, { ifAvailable: true }, async (lock) => {
            if (!lock) return; // another tab took it first: keep watching
            clearInterval(id);
            held = true;
            // The tab that saved has gone: read what it saved first, then take over.
            try { await o.onTakeOver?.(); } catch { /* the browser's copy is still there */ }
            set('saving');
            await forever();
          });
        } catch {
          /* the next look tries again */
        } finally {
          looking = false;
        }
      })();
    }, o.pollMs ?? POLL_MS);
  };

  return {
    claim(o = {}) {
      if (claimed) return claimed;
      if (!locks) { claimed = Promise.resolve<TabState>('saving'); return claimed; }
      claimed = new Promise<TabState>((resolve) => {
        let answered = false;
        const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
        const answer = (s: TabState): void => {
          answered = true;
          set(s);
          resolve(s);
        };
        const timer = setTimeout(() => {
          if (answered) return;
          ctrl?.abort();
          answer('waiting');
          watch(locks, o);
        }, o.waitMs ?? CLAIM_WAIT_MS);
        locks.request(SAVING_LOCK, ctrl ? { signal: ctrl.signal } : {}, async () => {
          if (answered) return; // it came just as this tab gave up waiting: let it go again
          clearTimeout(timer);
          held = true;
          answer('saving');
          await forever();
        }).catch(() => {
          if (answered) return; // the wait was given up on purpose: this tab watches instead
          // The browser refused the lock itself (not "someone else has it"): save as before.
          clearTimeout(timer);
          held = true;
          answer('saving');
        });
      });
      return claimed;
    },
    canSave: () => held,
    state: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    guarded: () => locks !== null,
  };
}

function browserLocks(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' && typeof locks.query === 'function' ? locks : null;
}

/** This page's place among the tabs. */
const tab = createTabSaving(browserLocks());

export const claimSaving = (o?: ClaimOptions): Promise<TabState> => tab.claim(o);
/** Whether this tab may write to the browser's store or the laptop's copy. */
export const canSave = (): boolean => tab.canSave();
export const tabState = (): TabState => tab.state();
export const onTabState = (fn: () => void): (() => void) => tab.subscribe(fn);
export const savingGuarded = (): boolean => tab.guarded();
