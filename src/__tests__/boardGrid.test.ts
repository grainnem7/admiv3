import { describe, it, expect } from 'vitest';
import {
  suggestReadSettings, gridSizeOptions, applyGridChange, offsetFromSquare, gridDividesBoard, type GridFields,
} from '../tracking/boardGrid';

describe('suggestReadSettings', () => {
  it.each([
    [8, 8, 8, 5, 0.10],
    [8, 4, 4, 9, 0.045],
    [8, 2, 2, 15, 0.04],
    [8, 4, 8, 9, 0.09],
    [8, 6, 8, 6, 0.10],
    [10, 10, 10, 5, 0.10],
    [10, 5, 5, 9, 0.045],
    [10, 2, 2, 15, 0.04],
  ])('board %i, %i rows × %i cols → %i samples, %f fill', (board, rows, cols, samples, fill) => {
    const s = suggestReadSettings(board, rows, cols);
    expect(s.samplesPerAxis).toBe(samples);
    expect(s.minFilledFraction).toBeCloseTo(fill, 6);
  });

  it('scales fill with a measured piece area', () => {
    expect(suggestReadSettings(8, 4, 4, 0.9).minFilledFraction).toBeCloseTo(0.09, 6);
  });
});

describe('gridSizeOptions', () => {
  it('offers divisors of the board and flags a non-divisor current value', () => {
    const o = gridSizeOptions(8, { rows: 6, cols: 8 });
    expect(o.divisors).toEqual([2, 4, 8]);
    expect(o.rowsIsMore).toBe(true);
    expect(o.colsIsMore).toBe(false);
    expect(o.nearest).toEqual({ rows: 4, cols: 8 });
    expect(o.moreRows).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(o.moreCols).toEqual([2, 3, 4, 5, 6, 7, 8, 10, 12, 16]);
  });

  it('10 × 10: divisors 2, 5, 10; a square grid stays square', () => {
    const o = gridSizeOptions(10, { rows: 4, cols: 4 });
    expect(o.divisors).toEqual([2, 5, 10]);
    expect(o.nearest).toEqual({ rows: 2, cols: 2 });
    expect(o.moreRows).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('applyGridChange', () => {
  const base: GridFields = { rows: 4, cols: 4, boardSquares: 8, readSettingsCustom: false, minFilledFraction: 0.045, samplesPerAxis: 9 };

  it('re-suggests read settings on a grid change', () => {
    const next = applyGridChange(base, { rows: 8, cols: 8 });
    expect(next).toMatchObject({ rows: 8, cols: 8, samplesPerAxis: 5 });
    expect(next.minFilledFraction).toBeCloseTo(0.1, 6);
  });

  it('keeps read settings the user tuned', () => {
    const next = applyGridChange({ ...base, readSettingsCustom: true, minFilledFraction: 0.2, samplesPerAxis: 7 }, { rows: 8 });
    expect(next).toMatchObject({ rows: 8, minFilledFraction: 0.2, samplesPerAxis: 7 });
  });

  it('a board size change never changes rows/cols', () => {
    const next = applyGridChange(base, { boardSquares: 10 });
    expect(next).toMatchObject({ rows: 4, cols: 4, boardSquares: 10 });
  });
});

describe('offsetFromSquare', () => {
  it('a counter centred on its physical square reads as centred, even on a coarse grid', () => {
    // 4 × 4 grid over 8 × 8: cell (0,0) spans squares 0–1. A counter centred on
    // square (0,1) is half a cell from the cell centre but dead centre on its square.
    expect(offsetFromSquare({ x: 3 / 16, y: 1 / 16 }, 8)).toBeCloseTo(0, 6);
    expect(offsetFromSquare({ x: 1 / 16, y: 1 / 16 }, 8)).toBeCloseTo(0, 6);
  });

  it('a real shove off the square reads high', () => {
    // A third of a square past the centre, on an 8 × 8 board.
    expect(offsetFromSquare({ x: 1 / 16 + 0.4 / 8, y: 1 / 16 }, 8)).toBeCloseTo(0.8, 6);
    expect(offsetFromSquare({ x: 0, y: 0 }, 8)).toBeCloseTo(1, 6);
  });
});

describe('gridDividesBoard', () => {
  it('is true only when both axes divide the square count', () => {
    expect(gridDividesBoard(8, 4, 4)).toBe(true);
    expect(gridDividesBoard(8, 4, 8)).toBe(true);
    expect(gridDividesBoard(8, 3, 4)).toBe(false);
    expect(gridDividesBoard(10, 4, 4)).toBe(false);
  });
});
