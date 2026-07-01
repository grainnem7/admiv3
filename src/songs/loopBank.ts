/**
 * Loop bank — the pure state machine behind the tangible save/recall/layer feature.
 * No audio, no DOM. The screen partitions each frame's settled cells into the live
 * pattern and the bottom-row "bank" slots, then calls stepLoopBank.
 *
 * A slot is EMPTY (`saved[i] === null`) or FULL (an array, possibly `[]`). Placing a
 * counter on an empty slot (rising edge of presence) CAPTURES the current pattern; a
 * counter on a full slot plays it (recall); removing the counter pauses it (snapshot
 * kept). clearLoopSlot empties a slot. Only slots with a counter present AND a saved
 * loop are "active" (layered).
 */

import type { ActiveCell } from '../tracking/BoardSequencerMode';

export interface LoopBankState {
  /** Saved loop per slot; null = empty (never saved). Index = slot (bottom-row column). */
  saved: (ActiveCell[] | null)[];
  /** Whether a counter was on each slot last frame (for rising-edge capture). */
  present: boolean[];
}

export interface LoopBankStep {
  state: LoopBankState;
  /** Snapshots of currently active (present + full) slots, to layer. */
  active: ActiveCell[][];
  /** Slot indices that captured this frame (rising edge on an empty slot). */
  captured: number[];
}

/** A fresh, all-empty bank for `slotCount` slots. */
export function emptyLoopBank(slotCount: number): LoopBankState {
  const n = Math.max(0, Math.floor(slotCount));
  return { saved: Array(n).fill(null), present: Array(n).fill(false) };
}

/**
 * Advance the bank one frame. `present[i]` = a settled counter sits on slot i now;
 * `patternCells` = the current settled pattern (already excluding the bank row).
 * Capture fires only on a rising edge (absent→present) of an EMPTY slot.
 */
export function stepLoopBank(
  prev: LoopBankState,
  present: boolean[],
  patternCells: ActiveCell[],
  slotCount: number,
): LoopBankStep {
  const n = Math.max(0, Math.floor(slotCount));
  const saved: (ActiveCell[] | null)[] = [];
  const nextPresent: boolean[] = [];
  const active: ActiveCell[][] = [];
  const captured: number[] = [];
  for (let i = 0; i < n; i++) {
    const here = present[i] === true;
    const was = prev.present[i] === true;
    let slot = prev.saved[i] ?? null;
    if (here && !was && slot === null) {
      slot = patternCells.map((c) => ({ ...c })); // capture a copy
      captured.push(i);
    }
    saved[i] = slot;
    nextPresent[i] = here;
    if (here && slot !== null) active.push(slot);
  }
  return { state: { saved, present: nextPresent }, active, captured };
}

/** Empty a slot (the screen Clear button); returns a new state (present unchanged). */
export function clearLoopSlot(state: LoopBankState, slot: number): LoopBankState {
  if (slot < 0 || slot >= state.saved.length) return state;
  const saved = state.saved.slice();
  saved[slot] = null;
  return { saved, present: state.present.slice() };
}
