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

/** Selectable scales (semitone offsets within an octave, ascending from root). */
export const SCALE_PRESETS: { name: string; semitones: number[] }[] = [
  { name: 'Major pentatonic', semitones: [0, 2, 4, 7, 9] },
  { name: 'Minor pentatonic', semitones: [0, 3, 5, 7, 10] },
  { name: 'Suspended', semitones: [0, 2, 5, 7, 10] },
  { name: 'Blues', semitones: [0, 3, 5, 6, 7, 10] },
  { name: 'Major', semitones: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Minor', semitones: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Dorian', semitones: [0, 2, 3, 5, 7, 9, 10] },
];

/** Note names for the 12 semitones from C, for the key picker. */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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

/**
 * Voicing by ABSOLUTE board position (full-range, predictable):
 *
 *  - axis 'row' (Pitched / piano roll): pitch = the row's height, bottom row =
 *    degree 0 (lowest), climbing to the top row = degree (rows-1). The whole
 *    grid height is the pitch range, so spreading pieces vertically spreads the
 *    pitch. Column = time.
 *  - axis 'col' (Per-row instruments): pitch = the column index (left = degree
 *    0). A row (one instrument) plays a melody across the columns; a column
 *    stack layers instruments on the same note.
 *
 * Degrees map to the ascending pentatonic (or the given chord's tones), wrapping
 * up octaves — always in key. A cell's pitch depends only on its position, not
 * on the other pieces, so it never shifts as you place more. Keyed `${row},${col}`.
 */
export function voicingForCells(
  cells: CellRef[],
  rootMidi: number,
  semitones: number[],
  chordNotes: readonly number[] | null,
  axis: 'row' | 'col' = 'row',
  rows = 8,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of cells) {
    const degree = axis === 'row' ? rows - 1 - c.row : c.col;
    const midi = chordNotes && chordNotes.length > 0
      ? chordDegreeMidi(degree, chordNotes)
      : degreeMidi(degree, rootMidi, semitones);
    map.set(`${c.row},${c.col}`, midi);
  }
  return map;
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

/** Every drum a row can be assigned in the per-row drum picker. */
export const DRUM_CHOICES = [
  'kick', 'snare', 'hat', 'crash', 'kickCrash', 'tom', 'clap', 'rim',
] as const;
export type DrumChoice = (typeof DRUM_CHOICES)[number];

/**
 * Resolve the drum a row should play: an explicit per-row choice (from the
 * picker) wins; otherwise fall back to the default bottom→top kit mapping;
 * null means the row plays no drum. `rowDrums` is indexed by row (0 = top),
 * '' = "use the default for this row".
 */
export function drumForRowChoice(
  row: number,
  rows: number,
  rowDrums: readonly string[],
  defaults: readonly string[] = DEFAULT_DRUM_ROWS,
): string | null {
  const choice = rowDrums[row];
  if (choice && choice.length > 0) return choice;
  return drumForRow(row, rows, defaults);
}

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
