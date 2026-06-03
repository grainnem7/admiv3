import { describe, it, expect } from 'vitest';
import {
  cellMidi, columnMidi, degreeMidi, chordDegreeMidi, voicingForCells, notesForStep, stepIndexAt,
} from '../songs/boardSequencerScale';
import {
  drumForRow, drumForRowChoice, drumsForStep, DEFAULT_DRUM_ROWS,
  loopLen, roleStep, strictlyAfter, pageIndexAt,
} from '../songs/boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';

const ROWS = 4;
const ROOT = 60;
const PENTA = [0, 2, 4, 7];

describe('boardSequencerScale pentatonic generators', () => {
  const penta5 = [0, 2, 4, 7, 9]; // C D E G A

  it('degreeMidi ascends the pentatonic and wraps octaves', () => {
    expect(degreeMidi(0, 60, penta5)).toBe(60); // C4
    expect(degreeMidi(4, 60, penta5)).toBe(69); // A4
    expect(degreeMidi(5, 60, penta5)).toBe(72); // C5 (octave wrap)
    expect(degreeMidi(6, 60, penta5)).toBe(74); // D5
  });

  it('columnMidi: col 0 lowest, ascending left→right (row-independent pitch)', () => {
    expect(columnMidi(0, 60, penta5)).toBe(60);
    expect(columnMidi(1, 60, penta5)).toBe(62);
    expect(columnMidi(5, 60, penta5)).toBe(72);
  });

  it('cellMidi is degreeMidi of the level from the bottom row', () => {
    expect(cellMidi(3, 4, 60, penta5)).toBe(degreeMidi(0, 60, penta5));
    expect(cellMidi(0, 4, 60, penta5)).toBe(degreeMidi(3, 60, penta5));
  });

  it('chordDegreeMidi walks the chord tones, wrapping octaves (always in key)', () => {
    const dMajor = [62, 66, 69]; // D F# A
    expect(chordDegreeMidi(0, dMajor)).toBe(62);
    expect(chordDegreeMidi(1, dMajor)).toBe(66);
    expect(chordDegreeMidi(2, dMajor)).toBe(69);
    expect(chordDegreeMidi(3, dMajor)).toBe(74); // D up an octave
    expect(chordDegreeMidi(4, dMajor)).toBe(78); // F# up an octave
  });

  it('chordDegreeMidi sorts notes defensively and is safe for empty chords', () => {
    expect(chordDegreeMidi(1, [69, 62, 66])).toBe(66); // unsorted → F#
    expect(chordDegreeMidi(0, [])).toBe(60); // empty → safe fallback
  });

  it('voicingForCells axis row: ABSOLUTE height → degree (rows-1-row), full grid range', () => {
    const rows = 4;
    const cells = [
      { row: 3, col: 2 }, // bottom → degree 0
      { row: 1, col: 0 }, // → degree 2
      { row: 0, col: 3 }, // top → degree 3
    ];
    const v = voicingForCells(cells, 60, penta5, null, 'row', rows);
    expect(v.get('3,2')).toBe(degreeMidi(0, 60, penta5));
    expect(v.get('1,0')).toBe(degreeMidi(2, 60, penta5));
    expect(v.get('0,3')).toBe(degreeMidi(3, 60, penta5));
  });

  it('voicingForCells: same-row cells share a pitch regardless of column', () => {
    const v = voicingForCells([{ row: 3, col: 0 }, { row: 3, col: 5 }], 60, penta5, null, 'row', 4);
    expect(v.get('3,0')).toBe(v.get('3,5'));
    expect(v.get('3,0')).toBe(degreeMidi(0, 60, penta5)); // bottom row of 4 → degree 0
  });

  it('voicingForCells: a row keeps its pitch no matter what else is placed (position-fixed)', () => {
    const top = { row: 0, col: 0 };
    const aloneTop = voicingForCells([top], 60, penta5, null, 'row', 4).get('0,0');
    const withLower = voicingForCells([{ row: 3, col: 0 }, top], 60, penta5, null, 'row', 4).get('0,0');
    expect(aloneTop).toBe(degreeMidi(3, 60, penta5)); // top row of 4 → degree 3, always
    expect(withLower).toBe(aloneTop); // unchanged when a lower piece is added
  });

  it('voicingForCells uses chord tones when a chord is supplied', () => {
    const v = voicingForCells([{ row: 3, col: 0 }, { row: 0, col: 0 }], 60, penta5, [62, 66, 69], 'row', 4);
    expect(v.get('3,0')).toBe(chordDegreeMidi(0, [62, 66, 69])); // bottom → first chord tone
    expect(v.get('0,0')).toBe(chordDegreeMidi(3, [62, 66, 69])); // top of 4 → degree 3 (wraps)
  });

  it("voicingForCells axis 'col': pitch = absolute column (per-instrument melody)", () => {
    const v = voicingForCells(
      [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 3 }], 60, penta5, null, 'col', 4,
    );
    expect(v.get('2,0')).toBe(degreeMidi(0, 60, penta5)); // leftmost → lowest
    expect(v.get('2,1')).toBe(degreeMidi(1, 60, penta5));
    expect(v.get('2,3')).toBe(degreeMidi(3, 60, penta5)); // absolute column index
  });

  it("voicingForCells axis 'col': cells in the same column share a note (layered instruments)", () => {
    const v = voicingForCells([{ row: 0, col: 1 }, { row: 3, col: 1 }], 60, penta5, null, 'col', 4);
    expect(v.get('0,1')).toBe(v.get('3,1'));
  });
});

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

  it('drumForRowChoice falls back to the default kit mapping when no override is set', () => {
    const rows = 4;
    const rowDrums = ['', '', '', ''];
    expect(drumForRowChoice(3, rows, rowDrums)).toBe('kick');  // bottom row default
    expect(drumForRowChoice(0, rows, rowDrums)).toBe('crash'); // top row default
  });

  it('drumForRowChoice honours an explicit per-row override (incl. extra kit pieces)', () => {
    const rows = 4;
    const rowDrums = ['clap', '', 'tom', ''];
    expect(drumForRowChoice(0, rows, rowDrums)).toBe('clap'); // override beats default 'crash'
    expect(drumForRowChoice(1, rows, rowDrums)).toBe('hat');  // '' → default
    expect(drumForRowChoice(2, rows, rowDrums)).toBe('tom');  // override
  });

  it('drumForRowChoice lets overrides give drums to rows beyond the 4-piece kit', () => {
    const rows = 6; // rows above the default kit normally fall to null
    const rowDrums = ['rim', 'clap', '', '', '', ''];
    expect(drumForRowChoice(0, rows, rowDrums)).toBe('rim');  // top row would be null by default
    expect(drumForRowChoice(1, rows, rowDrums)).toBe('clap');
    expect(drumForRow(1, rows, DEFAULT_DRUM_ROWS)).toBeNull(); // confirms default would be null
  });
});

describe('polyrhythm loop length', () => {
  it('loopLen falls back to the full grid width when polyrhythm is off (0/invalid)', () => {
    expect(loopLen(0, 8)).toBe(8);
    expect(loopLen(-3, 8)).toBe(8);
    expect(loopLen(0.5, 8)).toBe(8);
  });

  it('loopLen uses the configured length and clamps it to the grid width', () => {
    expect(loopLen(3, 8)).toBe(3);
    expect(loopLen(8, 8)).toBe(8);
    expect(loopLen(12, 8)).toBe(8); // longer than grid → clamp
    expect(loopLen(3.9, 8)).toBe(3); // floored
  });

  it('roleStep with polyrhythm off matches the plain beat-mod-cols playhead', () => {
    const cols = 8;
    for (let beat = 0; beat < 20; beat++) {
      expect(roleStep(beat, 0, cols)).toBe(beat % cols);
    }
  });

  it('roleStep wraps a role at its own loop length so roles drift apart', () => {
    // Drums looping every 3 against an 8-wide grid: 0,1,2,0,1,2,...
    expect([0, 1, 2, 3, 4, 5, 6].map((b) => roleStep(b, 3, 8)))
      .toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it('roleStep handles negative beats defensively', () => {
    expect(roleStep(-1, 3, 8)).toBe(2);
    expect(roleStep(-3, 3, 8)).toBe(0);
  });
});

describe('strictlyAfter (monophonic tick start-time guard)', () => {
  it('returns now when it is already after the previous start time', () => {
    expect(strictlyAfter(1.5, 1.0)).toBe(1.5);
  });

  it('bumps past the previous time when now repeats or goes backwards', () => {
    expect(strictlyAfter(1.0, 1.0)).toBeCloseTo(1.001); // same quantum → strictly later
    expect(strictlyAfter(0.9, 1.0)).toBeCloseTo(1.001); // backwards → still strictly later
  });

  it('chained calls with a repeated now stay strictly increasing', () => {
    const now = 2.0;
    const t1 = strictlyAfter(now, 0);
    const t2 = strictlyAfter(now, t1);
    const t3 = strictlyAfter(now, t2);
    expect(t1).toBeLessThan(t2);
    expect(t2).toBeLessThan(t3);
  });
});

describe('pageIndexAt (multi-page pattern chaining)', () => {
  it('always returns page 0 with a single page', () => {
    for (let beat = 0; beat < 20; beat++) {
      expect(pageIndexAt(beat, 8, 1)).toBe(0);
    }
  });

  it('advances one page per full grid width and wraps', () => {
    const cols = 8;
    // Page 0 for beats 0..7, page 1 for 8..15, then wrap to 0 for 16..23.
    expect(pageIndexAt(0, cols, 2)).toBe(0);
    expect(pageIndexAt(7, cols, 2)).toBe(0);
    expect(pageIndexAt(8, cols, 2)).toBe(1);
    expect(pageIndexAt(15, cols, 2)).toBe(1);
    expect(pageIndexAt(16, cols, 2)).toBe(0);
  });

  it('chains four pages in order', () => {
    expect([0, 8, 16, 24, 32].map((b) => pageIndexAt(b, 8, 4)))
      .toEqual([0, 1, 2, 3, 0]);
  });

  it('handles negative beats defensively', () => {
    expect(pageIndexAt(-1, 8, 2)).toBe(1);
    expect(pageIndexAt(-8, 8, 2)).toBe(1);
    expect(pageIndexAt(-16, 8, 2)).toBe(0);
  });
});
