/**
 * Pure helpers behind the board view: what is popping right now, and how to say the
 * board out loud. Kept out of the canvas so both can be tested without a DOM.
 */
import type { FiredNote } from '../../../../songs/BoardSequencerEngine';
import type { ActiveCell } from '../../../../tracking/BoardSequencerMode';
import { describeChannel, type ColourChannel, type ColourId } from '../../../../tracking/boardColours';

/** A pop lasts at least this long, so a very short note still registers visually. */
export const MIN_POP_SEC = 0.12;

export interface Pop {
  row: number;
  col: number;
  colour: ColourId;
  /** 0 at the start of the pop, 1 at its end. */
  progress: number;
  source: FiredNote['source'];
}

/**
 * The notes sounding at `now` (audible time, not `Tone.now()`). Notes still in the
 * look-ahead haven't been heard yet, so they must not be drawn: a pop that arrives
 * before its sound reads as the instrument being out of time.
 */
export function popsAt(fired: readonly FiredNote[], now: number): Pop[] {
  const out: Pop[] = [];
  for (const f of fired) {
    const dur = Math.max(f.durSec, MIN_POP_SEC);
    if (now < f.audioTime || now >= f.audioTime + dur) continue;
    out.push({
      row: f.row,
      col: f.col,
      colour: f.colour,
      progress: (now - f.audioTime) / dur,
      source: f.source,
    });
  }
  return out;
}

/** Drop notes that finished sounding, so the log doesn't grow between drains. */
export function pruneFired(fired: readonly FiredNote[], now: number): FiredNote[] {
  return fired.filter((f) => now < f.audioTime + Math.max(f.durSec, MIN_POP_SEC));
}

/** The board's accessible name, throttled by the caller. */
export function boardSummary(rows: number, cols: number, step: number, pieces: number): string {
  return `${cols} by ${rows} board, step ${step + 1} of ${cols}, ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`;
}

/** The whole layout in words, for the Describe board button. */
export function describeBoard(
  cells: readonly ActiveCell[], channels: readonly ColourChannel[], rows: number, cols: number,
): string {
  if (cells.length === 0) return `${cols} by ${rows} board, empty.`;
  const nameOf = (id: ColourId): string => {
    const c = channels.find((ch) => ch.id === id);
    return c ? describeChannel(c) : id;
  };
  const parts = [...cells]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col))
    .map((c) => `${nameOf(c.colour)} row ${c.row + 1} step ${c.col + 1}${c.conditional ? ', every other pass' : ''}`);
  return `${cols} by ${rows} board. ${parts.join('. ')}.`;
}
