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
  /** Placed, phrase or fill — a fill note lights its own mark, not a counter. */
  origin?: FiredNote['origin'];
}

/**
 * The notes sounding at `now` (audible time, not `Tone.now()`). Notes still in the
 * look-ahead haven't been heard yet, so they must not be drawn: a pop that arrives
 * before its sound reads as the instrument being out of time.
 */
export function popsAt(fired: readonly FiredNote[], now: number): Pop[] {
  const out: Pop[] = [];
  for (const f of fired) {
    // The band has no counter to light; the board's edge pulses for it instead.
    if (f.origin === 'band') continue;
    const dur = Math.max(f.durSec, MIN_POP_SEC);
    if (now < f.audioTime || now >= f.audioTime + dur) continue;
    out.push({
      row: f.row,
      col: f.col,
      colour: f.colour,
      progress: (now - f.audioTime) / dur,
      source: f.source,
      origin: f.origin,
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
  base?: number,
): string {
  if (cells.length === 0) return `${cols} by ${rows} board, empty.`;
  const nameOf = (id: ColourId): string => {
    const c = channels.find((ch) => ch.id === id);
    return c ? describeChannel(c) : id;
  };
  const parts = [...cells]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col))
    .map((c) => {
      const extras: string[] = [];
      if (c.conditional) extras.push('every other pass');
      // Box detail is part of how a cell plays, so it belongs in the spoken description.
      if (c.velocity !== undefined && base !== undefined) {
        if (c.velocity > base * 1.05) extras.push('louder');
        else if (c.velocity < base * 0.95) extras.push('softer');
      }
      if (c.timingBeats !== undefined && c.timingBeats !== 0) {
        extras.push(c.timingBeats > 0 ? 'late' : 'early');
      }
      const tail = extras.length > 0 ? `, ${extras.join(', ')}` : '';
      return `${nameOf(c.colour)} row ${c.row + 1} step ${c.col + 1}${tail}`;
    });
  return `${cols} by ${rows} board. ${parts.join('. ')}.`;
}

/** The beats a phrase counter owns: from its column up to the next counter of its colour. */
export interface PhraseSpan {
  row: number;
  /** The counter's column, where the phrase starts. */
  col: number;
  /** How many columns it owns (wrapping round the loop). */
  len: number;
  colour: ColourId;
}

/**
 * With phrases on, a counter plays until the next counter of the same colour, wrapping
 * round the loop — so one counter fills the loop and a second one divides it. These are
 * the bands drawn under the counters so the player can see which beats each one owns.
 * Only sequenced colours have phrases; `isSequenced` says which.
 */
export function phraseSpans(
  cells: readonly ActiveCell[], cols: number, isSequenced: (colour: ColourId) => boolean,
): PhraseSpan[] {
  if (cols <= 0) return [];
  const byColour = new Map<ColourId, ActiveCell[]>();
  for (const c of cells) {
    if (c.col < 0 || c.col >= cols || !isSequenced(c.colour)) continue;
    const list = byColour.get(c.colour);
    if (list) list.push(c);
    else byColour.set(c.colour, [c]);
  }
  const out: PhraseSpan[] = [];
  for (const [colour, list] of byColour) {
    const starts = [...new Set(list.map((c) => c.col))].sort((a, b) => a - b);
    for (const c of list) {
      const i = starts.indexOf(c.col);
      const next = starts[(i + 1) % starts.length];
      const len = starts.length === 1 ? cols : ((next - c.col + cols) % cols);
      out.push({ row: c.row, col: c.col, len, colour });
    }
  }
  return out;
}
