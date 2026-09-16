import { describe, it, expect } from 'vitest';
import {
  boxPosition, velocityFor, timingBeatsFor, describeBox, medianPosition, BOX_DEAD_ZONE,
} from '../tracking/boxDetail';

const divides = { rows: 4, cols: 4, boardSquares: 8 };
const doesNot = { rows: 3, cols: 3, boardSquares: 8 };

describe('boxPosition', () => {
  it('a counter on its square centre reads as centred', () => {
    // Square (0,1) of an 8 × 8 board: centre at 3/16, 1/16.
    expect(boxPosition({ x: 3 / 16, y: 1 / 16 }, 0, 0, divides)).toEqual({ up: 0, side: 0 });
  });

  it('higher in the square is positive up, right is positive side', () => {
    const high = boxPosition({ x: 1 / 16, y: 1 / 16 - 0.05 }, 0, 0, divides);
    expect(high.up).toBeGreaterThan(0);
    const right = boxPosition({ x: 1 / 16 + 0.05, y: 1 / 16 }, 0, 0, divides);
    expect(right.side).toBeGreaterThan(0);
    const low = boxPosition({ x: 1 / 16, y: 1 / 16 + 0.05 }, 0, 0, divides);
    expect(low.up).toBeLessThan(0);
  });

  it('a small wobble stays inside the dead zone, so the middle is reachable', () => {
    // A tenth of a square off centre is well inside the dead zone.
    const wobble = boxPosition({ x: 1 / 16, y: 1 / 16 - (0.05 * BOX_DEAD_ZONE) / 8 }, 0, 0, divides);
    expect(wobble).toEqual({ up: 0, side: 0 });
  });

  it('never leaves −1…1, at any corner of the square', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 0.999, y: 0.999 }, { x: 0, y: 0.999 }]) {
      const pos = boxPosition(p, 0, 0, divides);
      expect(Math.abs(pos.up)).toBeLessThanOrEqual(1);
      expect(Math.abs(pos.side)).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to the cell when the grid does not divide the board', () => {
    // Cell (0,0) of a 3 × 3 grid spans 0…1/3; its centre is 1/6.
    expect(boxPosition({ x: 1 / 6, y: 1 / 6 }, 0, 0, doesNot)).toEqual({ up: 0, side: 0 });
    expect(boxPosition({ x: 1 / 6, y: 0.05 }, 0, 0, doesNot).up).toBeGreaterThan(0);
  });
});

describe('velocityFor', () => {
  it('centred leaves the base velocity exactly alone', () => {
    expect(velocityFor(0.7, 0, 0.5)).toBeCloseTo(0.7, 10);
  });
  it('scales within the chosen amount and never reaches silence', () => {
    expect(velocityFor(0.6, 1, 0.5)).toBeCloseTo(0.9, 10);
    expect(velocityFor(0.6, -1, 0.5)).toBeCloseTo(0.3, 10);
    expect(velocityFor(0.6, -1, 1)).toBeGreaterThan(0);
    expect(velocityFor(1, 1, 1)).toBe(1);
  });
  it('an amount of zero switches the effect off', () => {
    expect(velocityFor(0.7, 1, 0)).toBeCloseTo(0.7, 10);
  });
});

describe('timingBeatsFor', () => {
  it('right of centre is late, left is early, and the amount caps it', () => {
    expect(timingBeatsFor(1, 0.35)).toBeCloseTo(0.175, 10);
    expect(timingBeatsFor(-1, 0.35)).toBeCloseTo(-0.175, 10);
    expect(timingBeatsFor(1, 1)).toBeCloseTo(0.5, 10);   // a full "and"
    expect(timingBeatsFor(0.5, 0)).toBe(0);
  });
});

describe('describeBox', () => {
  it('says the position in words, and nothing when centred', () => {
    expect(describeBox({ up: 0.5, side: 0.4 })).toBe('louder, late');
    expect(describeBox({ up: -0.5, side: -0.4 })).toBe('softer, early');
    expect(describeBox({ up: 0, side: 0 })).toBe('');
  });
});

describe('medianPosition', () => {
  it('ignores a single wild frame in the settle window', () => {
    const samples = [
      { up: 0.5, side: 0 }, { up: 0.52, side: 0 }, { up: -1, side: 0 },
      { up: 0.48, side: 0 }, { up: 0.5, side: 0 },
    ];
    expect(medianPosition(samples).up).toBeCloseTo(0.5, 10);
    expect(medianPosition([])).toEqual({ up: 0, side: 0 });
  });
});
