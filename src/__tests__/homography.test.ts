import { describe, it, expect } from 'vitest';
import {
  computeHomography,
  applyHomography,
  cellCentreUnit,
  UNIT_SQUARE,
  type Point,
} from '../utils/homography';

const close = (a: Point, b: Point, eps = 1e-6) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

describe('homography', () => {
  it('maps the unit square to a scaled square (identity-like)', () => {
    const dst: Point[] = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    expect(close(applyHomography(h, { x: 0.5, y: 0.5 }), { x: 50, y: 50 }, 1e-3)).toBe(true);
  });

  it('maps each unit-square corner exactly onto an oblique (trapezoid) target', () => {
    const dst: Point[] = [
      { x: 120, y: 80 },
      { x: 520, y: 80 },
      { x: 600, y: 400 },
      { x: 40, y: 400 },
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    expect(close(applyHomography(h, { x: 0, y: 0 }), dst[0], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 1, y: 0 }), dst[1], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 1, y: 1 }), dst[2], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 0, y: 1 }), dst[3], 1e-3)).toBe(true);
  });

  it('cellCentreUnit places centres at the middle of each cell', () => {
    expect(cellCentreUnit(0, 0, 4, 4)).toEqual({ x: 0.125, y: 0.125 });
    expect(cellCentreUnit(3, 3, 4, 4)).toEqual({ x: 0.875, y: 0.875 });
  });

  it('round-trips a cell centre grid→image and back to the right cell', () => {
    const dst: Point[] = [
      { x: 120, y: 80 }, { x: 520, y: 80 }, { x: 600, y: 400 }, { x: 40, y: 400 },
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    const c = cellCentreUnit(1, 2, 4, 4);
    const img = applyHomography(h, c);
    expect(img.x).toBeGreaterThan(40);
    expect(img.x).toBeLessThan(600);
    expect(img.y).toBeGreaterThan(80);
    expect(img.y).toBeLessThan(400);
  });
});
