import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type CellReading } from '../tracking/BoardSequencerMode';

const cfg = {
  settleWindowMs: 600,
  velocityFloor: 0.0005,
  velocitySmoothing: 1,
  occupancyGraceMs: 150,
};

const redAt = (row: number, col: number, x: number, y: number): CellReading => ({
  row, col, occupied: true, colour: 'red', centroid: { x, y },
});
const empty = (row: number, col: number): CellReading => ({
  row, col, occupied: false, colour: null, centroid: null,
});

describe('BoardSequencerMode slide-and-settle', () => {
  it('a piece in transit never fires', () => {
    const m = new BoardSequencerMode(cfg);
    let x = 0.1;
    let res = m.step([redAt(0, 0, x, 0.5)], 16, 0);
    for (let t = 16; t < 2000; t += 16) {
      x += 0.01;
      res = m.step([redAt(0, 0, x, 0.5)], 16, t);
    }
    expect(res.activeCells).toHaveLength(0);
  });

  it('a still piece becomes active exactly once after the settle window', () => {
    const m = new BoardSequencerMode(cfg);
    m.step([redAt(0, 0, 0.5, 0.5)], 16, 0);
    let res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 16);
    expect(res.activeCells).toHaveLength(0);
    let settledCount = 0;
    for (let t = 32; t <= 1000; t += 16) {
      res = m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
      settledCount += res.justSettled.length;
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]);
    expect(settledCount).toBe(1);
  });

  it('moving a settled piece deactivates the old cell immediately', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.2, 0.2)], 16, t);
    const res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, 816);
    expect(res.justDeactivated).toContainEqual({ row: 0, col: 0 });
    expect(res.activeCells).not.toContainEqual({ row: 0, col: 0 });
  });

  it('the destination cell activates after settling', () => {
    const m = new BoardSequencerMode(cfg);
    let res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, 0);
    for (let t = 16; t <= 800; t += 16) {
      res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, t);
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 1 }]);
  });

  it('a single dropped frame does not deactivate a settled cell', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = m.step([empty(0, 0)], 16, 816);
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]);
    res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 832);
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]);
  });

  it('sustained occupancy loss deactivates after the grace window', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = { activeCells: [{ row: 0, col: 0 }] } as ReturnType<BoardSequencerMode['step']>;
    for (let t = 816; t <= 1100; t += 16) res = m.step([empty(0, 0)], 16, t);
    expect(res.activeCells).toHaveLength(0);
  });
});
