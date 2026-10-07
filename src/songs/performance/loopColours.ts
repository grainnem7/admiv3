/**
 * A counter as a loop: a colour whose job is "plays loop N". Put that counter anywhere on
 * the board and loop N plays — the green counter IS the chorus. Pure debounce over the
 * camera's view of each such colour, so a frame that loses the counter does not stop the
 * loop and a hand passing over the board does not start one.
 *
 * Hold: the loop plays while the counter is on the board. Toggle: each placement flips
 * it, so a player with few counters can run several loops and keep the counters.
 */

export interface LoopColourState {
  /** Per slot: how long the colour has been seen / not seen, and whether it counts as down. */
  slots: Record<number, { seenMs: number; goneMs: number; down: boolean; latched: boolean }>;
}

export interface LoopColourOptions {
  mode: 'hold' | 'toggle';
  /** A colour must be seen this long before it counts as placed. */
  settleMs: number;
  /** And unseen this long before it counts as lifted (a frame or two is nothing). */
  releaseMs: number;
}

export const DEFAULT_LOOP_COLOUR_OPTIONS: LoopColourOptions = { mode: 'hold', settleMs: 150, releaseMs: 600 };

export function initialLoopColourState(): LoopColourState {
  return { slots: {} };
}

/**
 * Advance one camera frame. `present` says, per slot, whether a counter of that slot's
 * colour is on the board right now. Returns the slots that should be playing.
 */
export function stepLoopColours(
  prev: LoopColourState, present: ReadonlyMap<number, boolean>, opts: LoopColourOptions, dtMs: number,
): { state: LoopColourState; wanted: Set<number> } {
  const slots: LoopColourState['slots'] = {};
  const wanted = new Set<number>();
  for (const [slot, here] of present) {
    const p = prev.slots[slot] ?? { seenMs: 0, goneMs: 0, down: false, latched: false };
    const seenMs = here ? p.seenMs + dtMs : 0;
    const goneMs = here ? 0 : p.goneMs + dtMs;
    let down = p.down;
    let latched = p.latched;
    if (!down && seenMs >= opts.settleMs) {
      down = true;
      if (opts.mode === 'toggle') latched = !latched; // a fresh placement flips it
    } else if (down && goneMs >= opts.releaseMs) {
      down = false;
    }
    slots[slot] = { seenMs, goneMs, down, latched };
    if (opts.mode === 'toggle' ? latched : down) wanted.add(slot);
  }
  return { state: { slots }, wanted };
}
