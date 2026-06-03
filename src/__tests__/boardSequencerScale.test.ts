import { describe, it, expect } from 'vitest';
import { cellMidi, notesForStep, stepIndexAt } from '../songs/boardSequencerScale';
import { drumForRow, drumsForStep, DEFAULT_DRUM_ROWS } from '../songs/boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';

const ROWS = 4;
const ROOT = 60;
const PENTA = [0, 2, 4, 7];

describe('boardSequencerScale', () => {
  it('bottom row is lowest pitch, top row highest', () => {
    expect(cellMidi(3, ROWS, ROOT, PENTA)).toBe(60);
    expect(cellMidi(2, ROWS, ROOT, PENTA)).toBe(62);
    expect(cellMidi(1, ROWS, ROOT, PENTA)).toBe(64);
    expect(cellMidi(0, ROWS, ROOT, PENTA)).toBe(67);
  });

  it('notesForStep returns pitches only for active cells in that column', () => {
    const active: CellRef[] = [
      { row: 3, col: 0 },
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ];
    expect(notesForStep(active, 0, ROWS, ROOT, PENTA).sort()).toEqual([60, 67]);
    expect(notesForStep(active, 2, ROWS, ROOT, PENTA)).toEqual([62]);
    expect(notesForStep(active, 1, ROWS, ROOT, PENTA)).toEqual([]);
  });

  it('stepIndexAt advances one step per beat and wraps over the loop', () => {
    const secPerBeat = 0.5;
    const steps = 4;
    expect(stepIndexAt(0, 0, secPerBeat, steps)).toBe(0);
    expect(stepIndexAt(0.5, 0, secPerBeat, steps)).toBe(1);
    expect(stepIndexAt(1.0, 0, secPerBeat, steps)).toBe(2);
    expect(stepIndexAt(2.0, 0, secPerBeat, steps)).toBe(0);
    expect(stepIndexAt(2.5, 0, secPerBeat, steps)).toBe(1);
  });

  it('wraps into higher octaves when there are more rows than scale degrees', () => {
    const penta = [0, 2, 4, 7, 9]; // C D E G A (5-note major pentatonic)
    // 6 rows, root C4 = 60. Bottom row (5) = C4; ascending D E G A; top row (0) = C5.
    expect(cellMidi(5, 6, 60, penta)).toBe(60); // C4 (level 0)
    expect(cellMidi(4, 6, 60, penta)).toBe(62); // D4 (level 1)
    expect(cellMidi(1, 6, 60, penta)).toBe(69); // A4 (level 4)
    expect(cellMidi(0, 6, 60, penta)).toBe(72); // C5 (level 5 → octave wrap)
  });
});

describe('boardSequencerScale drum mapping', () => {
  it('DEFAULT_DRUM_ROWS is bottom-to-top kick, snare, hat, crash', () => {
    expect(DEFAULT_DRUM_ROWS).toEqual(['kick', 'snare', 'hat', 'crash']);
  });

  it('drumForRow maps the BOTTOM row to the first drum and wraps to null beyond the kit', () => {
    const rows = 4;
    expect(drumForRow(3, rows, DEFAULT_DRUM_ROWS)).toBe('kick');  // bottom row
    expect(drumForRow(2, rows, DEFAULT_DRUM_ROWS)).toBe('snare');
    expect(drumForRow(1, rows, DEFAULT_DRUM_ROWS)).toBe('hat');
    expect(drumForRow(0, rows, DEFAULT_DRUM_ROWS)).toBe('crash'); // top row
  });

  it('drumForRow returns null for rows above the kit size (bigger grid than kit)', () => {
    const rows = 6; // levels 0..5, only 4 drums
    expect(drumForRow(5, rows, DEFAULT_DRUM_ROWS)).toBe('kick'); // level 0
    expect(drumForRow(1, rows, DEFAULT_DRUM_ROWS)).toBeNull();   // level 4 → beyond kit
    expect(drumForRow(0, rows, DEFAULT_DRUM_ROWS)).toBeNull();   // level 5 → null
  });

  it('drumsForStep returns drum names for active cells in that column (skipping null rows)', () => {
    const rows = 4;
    const active = [
      { row: 3, col: 0 }, // kick
      { row: 1, col: 0 }, // hat
      { row: 0, col: 2 }, // crash (different column)
    ];
    expect(drumsForStep(active, 0, rows, DEFAULT_DRUM_ROWS).sort()).toEqual(['hat', 'kick']);
    expect(drumsForStep(active, 2, rows, DEFAULT_DRUM_ROWS)).toEqual(['crash']);
    expect(drumsForStep(active, 1, rows, DEFAULT_DRUM_ROWS)).toEqual([]);
  });
});
