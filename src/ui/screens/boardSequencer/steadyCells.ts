import type { ActiveCell } from '../../../tracking/BoardSequencerMode';

/** How long a counter stays listed after the camera last saw it. */
export const STEADY_HOLD_MS = 1200;

export type SteadyMemory = Map<string, { cell: ActiveCell; at: number }>;

const keyOf = (c: ActiveCell): string => `${c.row},${c.col},${c.colour}`;

/**
 * What the camera sees, made steady enough to read and to press buttons beside.
 *
 * Before the pattern settles, the list is drawn straight from each camera frame, and a
 * counter that flickers out for one frame made the list shrink, grow and reorder several
 * times a second — and moved the Play button under the player's hand. Here a counter
 * stays listed until it has been gone for `holdMs`, and the list is always in board order
 * (row, then step), so nothing changes place unless a counter really did.
 */
export function steadyCells(
  memory: SteadyMemory, seen: readonly ActiveCell[], nowMs: number, holdMs = STEADY_HOLD_MS,
): ActiveCell[] {
  for (const c of seen) memory.set(keyOf(c), { cell: c, at: nowMs });
  for (const [k, v] of memory) if (nowMs - v.at > holdMs) memory.delete(k);
  return [...memory.values()]
    .map((v) => v.cell)
    .sort((a, b) => a.row - b.row || a.col - b.col || a.colour.localeCompare(b.colour));
}
