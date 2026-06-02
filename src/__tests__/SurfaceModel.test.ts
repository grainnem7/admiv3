import { describe, it, expect } from 'vitest';
import { fitSurfaceLine, surfaceY } from '../tracking/SurfaceModel';

describe('SurfaceModel', () => {
  it('fits a straight line through two points (oblique surface)', () => {
    // Camera tilted: surface rises from y=0.8 at left to y=0.6 at right.
    const line = fitSurfaceLine([{ x: 0, y: 0.8 }, { x: 1, y: 0.6 }]);
    expect(surfaceY(line, 0)).toBeCloseTo(0.8, 6);
    expect(surfaceY(line, 1)).toBeCloseTo(0.6, 6);
    expect(surfaceY(line, 0.5)).toBeCloseTo(0.7, 6); // varies with x — not constant
  });

  it('least-squares fits a best line through >2 noisy points', () => {
    const line = fitSurfaceLine([
      { x: 0, y: 0.80 }, { x: 0.5, y: 0.69 }, { x: 1, y: 0.60 },
    ]);
    // Slope ≈ -0.2, intercept ≈ 0.797
    expect(line.a).toBeCloseTo(-0.2, 1);
    expect(surfaceY(line, 0.5)).toBeCloseTo(0.697, 2);
  });

  it('falls back to a horizontal line when points share an x (no slope)', () => {
    const line = fitSurfaceLine([{ x: 0.5, y: 0.7 }, { x: 0.5, y: 0.9 }]);
    expect(line.a).toBe(0);
    expect(surfaceY(line, 0.2)).toBeCloseTo(0.8, 6); // mean of ys
  });

  it('throws when given fewer than two points', () => {
    expect(() => fitSurfaceLine([{ x: 0.5, y: 0.7 }])).toThrow();
  });
});
