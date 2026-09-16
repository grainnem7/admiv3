import { describe, it, expect } from 'vitest';
import {
  zoneContains, zoneSlotCount, zoneSlotOf, zonePosition, splitByZone, describeZone, clampZone,
  ANYWHERE, NO_ZONE, type Zone,
} from '../tracking/zones';

const row3: Zone = { mode: 'row', index: 3 };
const col0: Zone = { mode: 'col', index: 0 };

describe('zoneContains', () => {
  it('claims its own row or column and nothing else', () => {
    expect(zoneContains(row3, { row: 3, col: 2 })).toBe(true);
    expect(zoneContains(row3, { row: 2, col: 3 })).toBe(false);
    expect(zoneContains(col0, { row: 1, col: 0 })).toBe(true);
  });
  it('anywhere and off claim no cells at all', () => {
    expect(zoneContains(ANYWHERE, { row: 0, col: 0 })).toBe(false);
    expect(zoneContains(NO_ZONE, { row: 0, col: 0 })).toBe(false);
  });
});

describe('zoneSlotCount and zoneSlotOf', () => {
  it('a row lane has one pad per step, counted left to right', () => {
    expect(zoneSlotCount(row3, 4, 8)).toBe(8);
    expect(zoneSlotOf(row3, { row: 3, col: 5 }, 4)).toBe(5);
  });
  it('a column lane has one pad per row, counted from the bottom', () => {
    expect(zoneSlotCount(col0, 4, 8)).toBe(4);
    expect(zoneSlotOf(col0, { row: 3, col: 0 }, 4)).toBe(0);
    expect(zoneSlotOf(col0, { row: 0, col: 0 }, 4)).toBe(3);
  });
  it('a cell outside the lane has no pad', () => {
    expect(zoneSlotOf(row3, { row: 1, col: 1 }, 4)).toBe(-1);
    expect(zoneSlotCount(ANYWHERE, 4, 8)).toBe(0);
  });
});

describe('zonePosition', () => {
  it('a row lane reads left to right, a column lane bottom to top', () => {
    expect(zonePosition(row3, { x: 0.25, y: 0.9 })).toBeCloseTo(0.25, 10);
    expect(zonePosition(col0, { x: 0.1, y: 0.25 })).toBeCloseTo(0.75, 10);
    expect(zonePosition(col0, { x: 0.1, y: 1.4 })).toBe(0);   // clamped
  });
});

describe('splitByZone', () => {
  const cells = [
    { row: 0, col: 0 }, { row: 3, col: 1 }, { row: 1, col: 0 }, { row: 2, col: 2 },
  ];

  it('a cell in either lane never plays the pattern', () => {
    const out = splitByZone(cells, col0, row3);
    expect(out.controls).toEqual([{ row: 0, col: 0 }, { row: 1, col: 0 }]);
    expect(out.pads).toEqual([{ row: 3, col: 1 }]);
    expect(out.pattern).toEqual([{ row: 2, col: 2 }]);
  });

  it('with no lanes, everything is pattern', () => {
    const out = splitByZone(cells, ANYWHERE, NO_ZONE);
    expect(out.pattern).toHaveLength(4);
    expect(out.controls).toHaveLength(0);
    expect(out.pads).toHaveLength(0);
  });

  it('when both lanes name the same cell, controls win', () => {
    const out = splitByZone([{ row: 3, col: 0 }], col0, row3);
    expect(out.controls).toHaveLength(1);
    expect(out.pads).toHaveLength(0);
  });
});

describe('describeZone and clampZone', () => {
  it('names a lane the way the player counts', () => {
    expect(describeZone(row3)).toBe('row 4');
    expect(describeZone(col0)).toBe('step 1');
    expect(describeZone(ANYWHERE)).toBe('anywhere on the board');
  });
  it('keeps a lane inside the grid after a size change', () => {
    expect(clampZone({ mode: 'row', index: 7 }, 4, 8)).toEqual({ mode: 'row', index: 3 });
    expect(clampZone({ mode: 'col', index: 12 }, 4, 8)).toEqual({ mode: 'col', index: 7 });
    expect(clampZone(ANYWHERE, 4, 8)).toEqual(ANYWHERE);
  });
});
