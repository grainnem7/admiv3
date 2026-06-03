import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type CellReading } from '../tracking/BoardSequencerMode';

const cfg = {
  settleWindowMs: 600,
  velocityFloor: 0.0005,
  velocitySmoothing: 1,
  occupancyGraceMs: 150,
  motionConfirmMs: 48,
};

const redAt = (row: number, col: number, x: number, y: number): CellReading => ({
  row, col, occupied: true, colour: 'red', centroid: { x, y },
});
const blackAt = (row: number, col: number, x: number, y: number): CellReading => ({
  row, col, occupied: true, colour: 'black', centroid: { x, y },
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
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
    expect(settledCount).toBe(1);
  });

  it('a still BLACK piece settles too, carrying its colour', () => {
    const m = new BoardSequencerMode(cfg);
    let res = m.step([blackAt(0, 0, 0.5, 0.5)], 16, 0);
    for (let t = 16; t <= 1000; t += 16) {
      res = m.step([blackAt(0, 0, 0.5, 0.5)], 16, t);
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'black' }]);
  });

  it('moving a settled piece (visible, sliding) deactivates it after the motion-confirm window', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.05, 0.05)], 16, t);
    let x = 0.05;
    let deact = 0;
    let res = m.step([redAt(0, 0, x, 0.05)], 16, 800);
    for (let t = 816; t <= 1000; t += 16) {
      x += 0.02; // 0.02/16ms = 0.00125 > floor → moving
      res = m.step([redAt(0, 0, x, 0.05)], 16, t);
      deact += res.justDeactivated.filter((c) => c.row === 0 && c.col === 0).length;
    }
    expect(deact).toBe(1);
    expect(res.activeCells).toHaveLength(0);
  });

  it('the destination cell activates after settling', () => {
    const m = new BoardSequencerMode(cfg);
    let res = m.step([redAt(0, 1, 0.7, 0.2)], 16, 0);
    for (let t = 16; t <= 800; t += 16) {
      res = m.step([redAt(0, 1, 0.7, 0.2)], 16, t);
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 1, colour: 'red' }]);
  });

  it('a single dropped frame does not deactivate a settled cell', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = m.step([empty(0, 0)], 16, 816);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
    res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 832);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('sustained occupancy loss deactivates after the grace window', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 808);
    expect(res.activeCells).toHaveLength(1);
    for (let t = 816; t <= 1100; t += 16) res = m.step([empty(0, 0)], 16, t);
    expect(res.activeCells).toHaveLength(0);
  });

  it('occlusion of one cell while a new piece appears elsewhere does NOT deactivate the occluded cell (per-cell)', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.2, 0.2)], 16, t);
    const res = m.step([empty(0, 0), redAt(1, 1, 0.8, 0.8)], 16, 816);
    expect(res.activeCells).toContainEqual({ row: 0, col: 0, colour: 'red' });
    expect(res.justDeactivated).not.toContainEqual({ row: 0, col: 0 });
  });

  it('a single jitter frame does NOT deactivate a settled cell (velocity hysteresis)', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = m.step([redAt(0, 0, 0.6, 0.5)], 16, 816); // one big jump → moving for 1 frame
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
    expect(res.justDeactivated).toHaveLength(0);
    res = m.step([redAt(0, 0, 0.6, 0.5)], 16, 832); // back to still
    res = m.step([redAt(0, 0, 0.6, 0.5)], 16, 848);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });
});
