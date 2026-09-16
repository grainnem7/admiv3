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
  /** How long the pattern has been unchanged (ms), for the capture guard. */
  quietMs?: number;
  /** Shape of the pattern the quiet window is measuring. */
  patternKey?: string;
  /** Slots that were just cleared: they can't re-capture until the counter is lifted. */
  blocked?: boolean[];
  /** Toggle mode: slots latched on, so a loop plays without its counter staying put. */
  playing?: boolean[];
}

export interface LoopBankOptions {
  /** The pattern must be unchanged this long before a slot captures it. 0 = capture at once. */
  quietMs: number;
  /** Milliseconds since the previous frame. */
  dtMs: number;
  /**
   * Hold = the counter must stay for the loop to play (you can see what is playing).
   * Toggle = placing it starts the loop and placing it again stops it, so a player with
   * few counters can run several loops at once.
   */
  padMode?: 'hold' | 'toggle';
}

/** A stable description of a pattern, so "unchanged" ignores detection order. */
function patternKeyOf(cells: ActiveCell[]): string {
  return cells
    .map((c) => `${c.row},${c.col},${c.colour}${c.conditional ? ',v' : ''}`)
    .sort()
    .join('|');
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
  return {
    saved: Array(n).fill(null), present: Array(n).fill(false),
    quietMs: 0, patternKey: '', playing: Array(n).fill(false),
  };
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
  opts?: LoopBankOptions,
): LoopBankStep {
  const n = Math.max(0, Math.floor(slotCount));
  const saved: (ActiveCell[] | null)[] = [];
  const nextPresent: boolean[] = [];
  const nextBlocked: boolean[] = [];
  const nextPlaying: boolean[] = [];
  const toggle = opts?.padMode === 'toggle';
  const active: ActiveCell[][] = [];
  const captured: number[] = [];

  // Capture guard: a hand still arranging counters means the pattern is mid-edit, so a
  // slot saves nothing until the board has been unchanged for the quiet window.
  const quietMs = opts?.quietMs ?? 0;
  const key = quietMs > 0 ? patternKeyOf(patternCells) : '';
  const quiet = quietMs > 0 && key === (prev.patternKey ?? '')
    ? (prev.quietMs ?? 0) + (opts?.dtMs ?? 0)
    : 0;
  const settledLongEnough = quietMs <= 0 || quiet >= quietMs;

  for (let i = 0; i < n; i++) {
    const here = present[i] === true;
    const was = prev.present[i] === true;
    let slot = prev.saved[i] ?? null;
    // Lifting the counter re-arms a slot that was cleared while it sat there.
    const blocked = here && (prev.blocked?.[i] ?? false);
    // Toggle: each fresh placement flips the loop on or off.
    let latched = prev.playing?.[i] ?? false;
    if (toggle && here && !was && !blocked) latched = slot === null ? true : !latched;
    // The counter may land before the pattern is quiet, so capture is a level check
    // (counter here, slot still empty), not only the rising edge.
    if (here && !blocked && slot === null && settledLongEnough && (!was || quietMs > 0)) {
      slot = patternCells.map((c) => ({ ...c })); // capture a copy
      captured.push(i);
    }
    saved[i] = slot;
    nextPresent[i] = here;
    nextBlocked[i] = blocked;
    nextPlaying[i] = slot === null ? false : latched;
    const sounding = toggle ? nextPlaying[i] : here;
    if (sounding && slot !== null) active.push(slot);
  }
  return {
    state: {
      saved, present: nextPresent, quietMs: quiet, patternKey: key,
      blocked: nextBlocked, playing: nextPlaying,
    },
    active,
    captured,
  };
}

/** Empty a slot (the screen Clear button); returns a new state (present unchanged). */
export function clearLoopSlot(state: LoopBankState, slot: number): LoopBankState {
  if (slot < 0 || slot >= state.saved.length) return state;
  const saved = state.saved.slice();
  saved[slot] = null;
  // Clearing is the undo: the slot must not re-capture under the counter that is still
  // sitting on it, so it stays blocked until that counter is lifted.
  const blocked = (state.blocked ?? state.saved.map(() => false)).slice();
  blocked[slot] = true;
  const playing = (state.playing ?? state.saved.map(() => false)).slice();
  playing[slot] = false;
  return {
    saved, present: state.present.slice(), quietMs: 0, patternKey: state.patternKey, blocked, playing,
  };
}
