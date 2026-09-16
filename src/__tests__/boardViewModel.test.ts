import { describe, it, expect } from 'vitest';
import {
  popsAt, pruneFired, boardSummary, describeBoard, MIN_POP_SEC,
} from '../ui/screens/boardSequencer/components/boardViewModel';
import type { FiredNote } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const note = (over: Partial<FiredNote> = {}): FiredNote => ({
  row: 1, col: 2, colour: 'c1', role: 'melody', audioTime: 10, durSec: 0.5, source: 'live', ...over,
});

describe('popsAt', () => {
  it('never pops before the note is heard', () => {
    expect(popsAt([note()], 9.9)).toEqual([]);
    expect(popsAt([note()], 10)).toHaveLength(1);
  });

  it('pops for the note length, with a floor so a very short note still shows', () => {
    expect(popsAt([note({ durSec: 0.5 })], 10.49)).toHaveLength(1);
    expect(popsAt([note({ durSec: 0.5 })], 10.5)).toEqual([]);
    expect(popsAt([note({ durSec: 0.01 })], 10 + MIN_POP_SEC / 2)).toHaveLength(1);
  });

  it('reports progress through the pop and keeps the source', () => {
    const [pop] = popsAt([note({ source: 'loop' })], 10.25);
    expect(pop.progress).toBeCloseTo(0.5, 6);
    expect(pop.source).toBe('loop');
    expect(pop).toMatchObject({ row: 1, col: 2, colour: 'c1' });
  });
});

describe('pruneFired', () => {
  it('keeps notes still sounding and drops the finished ones', () => {
    const kept = pruneFired([note({ audioTime: 10 }), note({ audioTime: 5 })], 10.2);
    expect(kept).toHaveLength(1);
    expect(kept[0].audioTime).toBe(10);
  });
});

describe('boardSummary', () => {
  it('reads as a sentence, in steps the player counts from 1', () => {
    expect(boardSummary(4, 8, 2, 5)).toBe('8 by 4 board, step 3 of 8, 5 pieces');
    expect(boardSummary(4, 8, 0, 1)).toBe('8 by 4 board, step 1 of 8, 1 piece');
  });
});

describe('describeBoard', () => {
  const channels: ColourChannel[] = [
    { id: 'c1', kind: 'hue', role: 'melody', swatch: '#f00' },
    { id: 'c2', kind: 'black', role: 'drums', swatch: '#000' },
  ];

  it('says an empty board is empty', () => {
    expect(describeBoard([], channels, 4, 8)).toBe('8 by 4 board, empty.');
  });

  it('reads the pieces in board order and flags Variation', () => {
    const text = describeBoard(
      [{ row: 1, col: 3, colour: 'c2' }, { row: 0, col: 1, colour: 'c1', conditional: true }],
      channels, 4, 8,
    );
    expect(text).toBe('8 by 4 board. Red row 1 step 2, every other pass. Black row 2 step 4.');
  });
});
