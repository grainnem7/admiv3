import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type BoardSettleConfig, type CellReading } from '../tracking/BoardSequencerMode';

const cfg: BoardSettleConfig = {
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
};

const at = (row: number, col: number, colour: string, x = 0.1, y = 0.1): CellReading => ({
  row, col, occupied: true, colour, centroid: { x, y }, offset: 0,
});

/**
 * Pressing Play used to start the settle over for every counter already on the board, so
 * a counter on step 1 stayed silent for a whole pass. Counters lying there when Play is
 * pressed are primed as settled.
 */
describe('primeSettled', () => {
  it('counters already on the board play from the first frame, with no settle tick', () => {
    const mode = new BoardSequencerMode(cfg);
    const board = [at(3, 0, 'red'), at(5, 2, 'blue', 0.3, 0.6)];
    mode.primeSettled(board);
    const out = mode.step(board, 50, 0);
    expect(out.activeCells.map((c) => `${c.row},${c.col},${c.colour}`).sort()).toEqual(['3,0,red', '5,2,blue']);
    expect(out.justSettled).toEqual([]);
  });

  it('without priming the same counters wait out the settle window', () => {
    const mode = new BoardSequencerMode(cfg);
    expect(mode.step([at(3, 0, 'red')], 50, 0).activeCells).toEqual([]);
  });

  it('a primed counter that is lifted goes after the usual grace', () => {
    const mode = new BoardSequencerMode(cfg);
    mode.primeSettled([at(3, 0, 'red')]);
    const empty: CellReading[] = [{ row: 3, col: 0, occupied: false, colour: null, centroid: null, offset: null }];
    let out = mode.step(empty, 100, 0);
    expect(out.activeCells).toHaveLength(1);
    out = mode.step(empty, 100, 100);
    expect(out.activeCells).toEqual([]);
  });

  it('empty squares are not primed', () => {
    const mode = new BoardSequencerMode(cfg);
    mode.primeSettled([{ row: 1, col: 1, occupied: false, colour: null, centroid: null, offset: null }]);
    expect(mode.step([], 50, 0).activeCells).toEqual([]);
  });
});
