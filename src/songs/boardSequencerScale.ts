/**
 * Pure pitch + scheduling helpers for the standalone board sequencer.
 *
 * Rows map to a FIXED pentatonic scale (no chord/song coupling): the BOTTOM
 * grid row is the lowest pitch. Columns are the loop's beats/steps. notesForStep
 * selects the pitches that should sound at a given step; the "next loop pass"
 * semantic is emergent — the engine reads the CURRENT active set each time the
 * playhead reaches a column, so a cell settled after the playhead passed only
 * sounds on the following pass.
 */

import type { CellRef } from '../tracking/BoardSequencerMode';

/**
 * MIDI for a cell. row 0 = top (highest), row (rows-1) = bottom (lowest).
 * `semitones` is the within-octave pattern, ascending from the bottom row.
 * When there are more rows than scale degrees, levels wrap into higher
 * octaves (level N → octave floor(N/len), degree N mod len).
 */
export function cellMidi(
  row: number,
  rows: number,
  rootMidi: number,
  semitones: number[],
): number {
  const levelFromBottom = rows - 1 - row;
  const len = semitones.length;
  const octave = Math.floor(levelFromBottom / len);
  const idx = ((levelFromBottom % len) + len) % len;
  return rootMidi + octave * 12 + semitones[idx];
}

/** Pitches to trigger at `step` (column): one per active cell in that column. */
export function notesForStep(
  active: CellRef[],
  step: number,
  rows: number,
  rootMidi: number,
  semitones: number[],
): number[] {
  return active
    .filter((c) => c.col === step)
    .map((c) => cellMidi(c.row, rows, rootMidi, semitones));
}

/** Default drum-kit row order, bottom row → top row. */
export const DEFAULT_DRUM_ROWS = ['kick', 'snare', 'hat', 'crash'] as const;

/** The drum name for a grid row, or null if the row is above the kit size. */
export function drumForRow(row: number, rows: number, drumNames: readonly string[]): string | null {
  const levelFromBottom = rows - 1 - row;
  return levelFromBottom >= 0 && levelFromBottom < drumNames.length
    ? drumNames[levelFromBottom]
    : null;
}

/** Drum names to trigger at `step` (column): one per active cell whose row maps to a drum. */
export function drumsForStep(
  active: { row: number; col: number }[],
  step: number,
  rows: number,
  drumNames: readonly string[],
): string[] {
  return active
    .filter((c) => c.col === step)
    .map((c) => drumForRow(c.row, rows, drumNames))
    .filter((d): d is string => d !== null);
}

/** Which step the playhead is on at `nowSec`, given loop start, beat length, and step count. */
export function stepIndexAt(
  nowSec: number,
  startSec: number,
  secPerBeat: number,
  totalSteps: number,
): number {
  const beats = Math.floor((nowSec - startSec) / secPerBeat);
  return ((beats % totalSteps) + totalSteps) % totalSteps;
}
