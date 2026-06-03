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
 * MIDI for an ascending scale "degree" (0 = root). `semitones` is the
 * within-octave pentatonic pattern; degrees beyond its length wrap up octaves
 * (degree N → octave floor(N/len), step N mod len). This is the single
 * algorithmic pentatonic generator — every pitch the board plays comes from
 * here, so the result is always in-key.
 */
export function degreeMidi(level: number, rootMidi: number, semitones: number[]): number {
  const len = semitones.length;
  const octave = Math.floor(level / len);
  const idx = ((level % len) + len) % len;
  return rootMidi + octave * 12 + semitones[idx];
}

/**
 * MIDI for a cell in PITCHED mode. row 0 = top (highest), row (rows-1) =
 * bottom (lowest), ascending from the bottom row.
 */
export function cellMidi(
  row: number,
  rows: number,
  rootMidi: number,
  semitones: number[],
): number {
  return degreeMidi(rows - 1 - row, rootMidi, semitones);
}

/**
 * MIDI for a cell in PER-ROW-INSTRUMENT mode: pitch is generated from the
 * COLUMN (left → right ascends the pentatonic), independent of the row — the
 * row only selects the instrument. col 0 = lowest.
 */
export function columnMidi(col: number, rootMidi: number, semitones: number[]): number {
  return degreeMidi(col, rootMidi, semitones);
}

/**
 * MIDI for an ascending "degree" within a CHORD's note set (used when the board
 * is locked to a song: the degree set becomes the current chord's notes rather
 * than the standalone pentatonic). Degrees beyond the chord's size wrap up
 * octaves, so every note is a chord tone — always in key with the song.
 * `chordNotes` are MIDI numbers; they are sorted ascending defensively.
 */
export function chordDegreeMidi(degree: number, chordNotes: readonly number[]): number {
  const sorted = [...chordNotes].sort((a, b) => a - b);
  const len = sorted.length;
  if (len === 0) return 60;
  const octave = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return sorted[idx] + octave * 12;
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
