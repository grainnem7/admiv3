import { describe, it, expect } from 'vitest';
import { suppressSpill, type SpillCtx } from '../tracking/boardFrame';
import type { CellReading } from '../tracking/BoardSequencerMode';

const ctx = (over: Partial<SpillCtx> = {}): SpillCtx => ({
  rows: 8, cols: 8, boardSquares: 8, minFilledFraction: 0.1, ...over,
});

/** A cell reading whose colour centroid sits at unit board position (x, y). */
function cell(row: number, col: number, x: number, y: number, fill: number, colour = 'red'): CellReading {
  return {
    row, col, occupied: true, colour,
    centroid: { x, y }, centroids: { [colour]: { x, y } }, fractions: { [colour]: fill }, offset: 0,
  };
}

const empty = (row: number, col: number): CellReading => ({ row, col, occupied: false, colour: null, centroid: null });

describe('suppressSpill', () => {
  it('a counter on the line between two cells is kept in one cell only', () => {
    // 8 × 8: the counter straddles x = 0.25, so each cell sees it at its own edge.
    // Coverage is one counter's worth in total, and most of it is in cell (0,1).
    const readings = [
      cell(0, 1, 0.235, 0.0625, 0.15),
      cell(0, 2, 0.265, 0.0625, 0.10),
      empty(0, 3),
    ];
    const lit = suppressSpill(readings, ctx()).filter((r) => r.occupied);
    expect(lit).toHaveLength(1);
    expect(lit[0].col).toBe(1);
  });

  it('keeps the cell the fused centroid actually lands in', () => {
    const readings = [cell(0, 1, 0.235, 0.0625, 0.10), cell(0, 2, 0.265, 0.0625, 0.15)];
    expect(suppressSpill(readings, ctx()).filter((r) => r.occupied).map((r) => r.col)).toEqual([2]);
  });

  it('two real counters side by side are both kept', () => {
    // Each cell carries a whole counter's coverage, so this is two pieces, not spill.
    const readings = [cell(0, 1, 0.1875, 0.0625, 0.25), cell(0, 2, 0.3125, 0.0625, 0.25)];
    expect(suppressSpill(readings, ctx()).filter((r) => r.occupied)).toHaveLength(2);
  });

  it('leaves diagonal neighbours and different colours alone', () => {
    const diag = [cell(0, 1, 0.235, 0.0625, 0.15), cell(1, 2, 0.265, 0.1875, 0.10)];
    expect(suppressSpill(diag, ctx()).filter((r) => r.occupied)).toHaveLength(2);
    const twoColours = [cell(0, 1, 0.235, 0.0625, 0.15), cell(0, 2, 0.265, 0.0625, 0.10, 'blue')];
    expect(suppressSpill(twoColours, ctx()).filter((r) => r.occupied)).toHaveLength(2);
  });

  it('suppresses vertical spill as well', () => {
    const readings = [cell(0, 1, 0.1875, 0.115, 0.15), cell(1, 1, 0.1875, 0.135, 0.10)];
    const lit = suppressSpill(readings, ctx()).filter((r) => r.occupied);
    expect(lit).toHaveLength(1);
    expect(lit[0].row).toBe(0);
  });

  it('works on a coarse 4 × 4 grid too (one counter, one box)', () => {
    const c = ctx({ rows: 4, cols: 4, minFilledFraction: 0.045 });
    const readings = [cell(0, 0, 0.24, 0.125, 0.07), cell(0, 1, 0.26, 0.125, 0.05)];
    expect(suppressSpill(readings, c).filter((r) => r.occupied)).toHaveLength(1);
  });
});
