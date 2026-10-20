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

  // Seen on the rig: a counter near the detection threshold dropped out for a frame every
  // second or so, and each dropout restarted its settle window, so it never played.
  it('a counter missed for an odd frame still settles: a brief gap pauses, not restarts', () => {
    const m = new BoardSequencerMode(cfg);
    let res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 0);
    let settledAt = -1;
    for (let t = 16, f = 1; t <= 2000; t += 16, f++) {
      res = m.step([f % 8 === 0 ? empty(0, 0) : redAt(0, 0, 0.5, 0.5)], 16, t);
      if (settledAt < 0 && res.justSettled.length > 0) settledAt = t;
    }
    expect(settledAt).toBeGreaterThan(0);
    expect(settledAt).toBeLessThanOrEqual(800);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('a counter really taken away before it settles starts over when it comes back', () => {
    const m = new BoardSequencerMode(cfg);
    let t = 0;
    for (; t <= 400; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    for (; t <= 700; t += 16) m.step([empty(0, 0)], 16, t); // gone for 300 ms (> grace)
    let settled = 0;
    const back = t;
    for (; t <= back + 500; t += 16) settled += m.step([redAt(0, 0, 0.5, 0.5)], 16, t).justSettled.length;
    expect(settled).toBe(0); // 500 ms back is less than a fresh 600 ms window
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

const redAtOff = (
  row: number, col: number, x: number, y: number, offset: number,
): CellReading => ({ row, col, occupied: true, colour: 'red', centroid: { x, y }, offset });

const settle = (
  m: BoardSequencerMode, reading: CellReading,
): ReturnType<BoardSequencerMode['step']> => {
  let res = m.step([reading], 16, 0);
  for (let t = 16; t <= 1000; t += 16) res = m.step([reading], 16, t);
  return res;
};

describe('BoardSequencerMode variation (off-centre = conditional)', () => {
  const varCfg = { ...cfg, variationEnabled: true, variationOffsetThreshold: 0.6 };

  it('a settled off-centre piece is marked conditional', () => {
    const m = new BoardSequencerMode(varCfg);
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.8));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red', conditional: true }]);
  });

  it('a centred piece carries no conditional flag', () => {
    const m = new BoardSequencerMode(varCfg);
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.2));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('variation disabled → an off-centre piece is not conditional', () => {
    const m = new BoardSequencerMode({ ...cfg, variationEnabled: false });
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.9));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('conditional is latched at settle: jitter under a settled piece does not flip it', () => {
    const m = new BoardSequencerMode(varCfg);
    let res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.1));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
    res = m.step([redAtOff(0, 0, 0.5, 0.5, 0.85)], 16, 1016);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('setVariation updates the calibration live', () => {
    const m = new BoardSequencerMode({ ...cfg, variationEnabled: false });
    settle(m, redAtOff(0, 0, 0.5, 0.5, 0.9));
    m.setVariation(true, 0.6);
    const res = m.step([redAtOff(0, 0, 0.5, 0.5, 0.9)], 16, 1016);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red', conditional: true }]);
  });
});
