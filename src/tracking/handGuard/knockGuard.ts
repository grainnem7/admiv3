/**
 * Knock guard: when several counters go at once, the pattern keeps playing.
 *
 * A knocked board used to fall silent within 150 ms and forget what was there — hours of
 * work gone in an instant, and nothing to put back. The lost cells become **ghosts**
 * instead: they keep sounding exactly as they did, and the player decides what happens
 * next (let them go, or save them as a loop). Putting a counter back takes over its ghost.
 *
 * A hand covering counters is a hold, not a knock, so cells the watcher is holding can
 * never trigger this.
 */
import type { ActiveCell } from '../BoardSequencerMode';

export interface KnockOpts {
  minCount: number;
  minFraction: number;
  windowMs: number;
}

export interface KnockState {
  /** Note cells lost recently, with when they went, for the "at once" test. */
  recentLost: { cell: string; at: number }[];
  /** Cells still sounding although their counter has gone. */
  ghosts: Map<string, ActiveCell>;
}

export const keyOf = (c: { row: number; col: number }): string => `${c.row},${c.col}`;

export function initialKnockState(): KnockState {
  return { recentLost: [], ghosts: new Map() };
}

export interface KnockStep {
  state: KnockState;
  /** True on the frame a knock is first recognised (for the announcement). */
  knocked: boolean;
}

/**
 * Compare the settled note cells before and after this frame.
 *
 * `settledBefore` and `settledNow` must already exclude control and Off colours and the
 * loop-bank row: a volume counter being picked up is not a knock.
 */
export function stepKnock(
  prev: KnockState, settledBefore: ActiveCell[], settledNow: ActiveCell[],
  held: ReadonlySet<string>, now: number, opts: KnockOpts,
): KnockStep {
  const nowKeys = new Set(settledNow.map(keyOf));
  const recentLost = prev.recentLost.filter((e) => now - e.at <= opts.windowMs);
  const ghosts = new Map(prev.ghosts);

  const lostThisFrame: ActiveCell[] = [];
  for (const cell of settledBefore) {
    const key = keyOf(cell);
    // A covered counter is being held, not knocked — that is the whole point of the
    // hand guard, and treating it as a knock would fill the board with ghosts.
    if (nowKeys.has(key) || held.has(key) || ghosts.has(key)) continue;
    lostThisFrame.push(cell);
    recentLost.push({ cell: key, at: now });
  }

  let knocked = false;
  if (lostThisFrame.length > 0) {
    const lostKeys = new Set(recentLost.map((e) => e.cell));
    const before = settledBefore.length;
    const enough = lostKeys.size >= opts.minCount
      && before > 0
      && lostKeys.size / before >= opts.minFraction;
    if (enough) {
      const byKey = new Map(settledBefore.map((c) => [keyOf(c), c]));
      for (const key of lostKeys) {
        const cell = byKey.get(key);
        // Keep the ghost exactly as it played: colour, and whether it was a Variation cell.
        if (cell && !ghosts.has(key)) ghosts.set(key, { ...cell });
      }
      knocked = true;
      recentLost.length = 0;
    }
  }

  return { state: { recentLost, ghosts }, knocked };
}

/** A counter settling where a ghost is takes over from it, whatever its colour. */
export function releaseGhostsAt(state: KnockState, settledNow: ActiveCell[]): KnockState {
  if (state.ghosts.size === 0) return state;
  const ghosts = new Map(state.ghosts);
  for (const cell of settledNow) ghosts.delete(keyOf(cell));
  return ghosts.size === state.ghosts.size ? state : { ...state, ghosts };
}

/** "Let go": the pattern really is gone. */
export function letGo(state: KnockState): KnockState {
  return state.ghosts.size === 0 ? state : { recentLost: [], ghosts: new Map() };
}

/** Ghosts plus what is still on the board, for "Save as loop". Live cells win. */
export function ghostsForSave(state: KnockState, liveNotes: ActiveCell[]): ActiveCell[] {
  const out = new Map<string, ActiveCell>();
  for (const [key, cell] of state.ghosts) out.set(key, cell);
  for (const cell of liveNotes) out.set(keyOf(cell), cell);
  return [...out.values()];
}
