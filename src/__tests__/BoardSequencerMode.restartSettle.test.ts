import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type BoardSettleConfig, type CellReading } from '../tracking/BoardSequencerMode';

const cfg: BoardSettleConfig = {
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
};

const DT = 50;

/** One square holding `colours`, all sitting still at the same spot. */
const cell = (colours: string[]): CellReading[] => [{
  row: 0,
  col: 0,
  occupied: colours.length > 0,
  colour: colours[0] ?? null,
  colours,
  centroid: colours.length > 0 ? { x: 0.125, y: 0.125 } : null,
  centroids: Object.fromEntries(colours.map((c) => [c, { x: 0.125, y: 0.125 }])),
  offsets: Object.fromEntries(colours.map((c) => [c, 0])),
  offset: 0,
}];

function run(mode: BoardSequencerMode, readings: CellReading[], ms: number, t0 = 0) {
  let out = mode.step(readings, DT, t0);
  for (let t = DT; t < ms; t += DT) out = mode.step(readings, DT, t0 + t);
  return out;
}

/**
 * A hand over the board freezes a cell rather than stepping it, so when the hand lifts the
 * counter under it must start its settle again from zero. If it doesn't, the time the hand
 * spent there counts as "held still" and the note fires the instant the hand moves away —
 * with whatever Variation and box detail the counter had BEFORE it was moved.
 */
describe('restartSettle', () => {
  it('sends a part-settled counter back to the start', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, cell(['red']), 400);          // 400 of the 600 ms done
    mode.restartSettle([{ row: 0, col: 0 }]);
    expect(run(mode, cell(['red']), 400).activeCells).toHaveLength(0);
    expect(run(mode, cell(['red']), 300, 400).activeCells).toHaveLength(1);
  });

  it('leaves a counter that was already playing alone', () => {
    // Lifting a hand must never silence a note that was sounding before it arrived.
    const mode = new BoardSequencerMode(cfg);
    expect(run(mode, cell(['red']), 700).activeCells).toHaveLength(1);
    mode.restartSettle([{ row: 0, col: 0 }]);
    expect(mode.step(cell(['red']), DT, 750).activeCells).toHaveLength(1);
  });

  it('finds both counters when two share a square', () => {
    // Each colour has its own state, keyed by square AND colour. Looking one up by square
    // alone missed every time, so with two counters in a box the hand guard did nothing.
    const mode = new BoardSequencerMode(cfg);
    mode.setTwoCounters(true);
    run(mode, cell(['red', 'blue']), 400);
    mode.restartSettle([{ row: 0, col: 0 }]);
    expect(run(mode, cell(['red', 'blue']), 400).activeCells).toHaveLength(0);
    expect(run(mode, cell(['red', 'blue']), 300, 400).activeCells).toHaveLength(2);
  });

  it('does nothing when handed no cells', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, cell(['red']), 400);
    mode.restartSettle([]);
    expect(run(mode, cell(['red']), 250).activeCells).toHaveLength(1);
  });
});
