import { describe, it, expect } from 'vitest';
import { distToSegment, axisFromMoments } from '../tracking/segmentGeometry';

describe('distToSegment', () => {
  it('is zero for a point on the segment', () => {
    expect(distToSegment(0.5, 0.5, 0, 0.5, 1, 0.5)).toBeCloseTo(0, 6);
  });

  it('measures perpendicular distance to the segment body', () => {
    // Horizontal segment y=0.5 from x=0..1; point above it by 0.2.
    expect(distToSegment(0.5, 0.3, 0, 0.5, 1, 0.5)).toBeCloseTo(0.2, 6);
  });

  it('clamps to the nearest endpoint when the projection falls outside', () => {
    // Point beyond the right end → distance to the (1,0.5) endpoint.
    expect(distToSegment(1.3, 0.5, 0, 0.5, 1, 0.5)).toBeCloseTo(0.3, 6);
  });

  it('handles a degenerate (zero-length) segment as point distance', () => {
    expect(distToSegment(0.3, 0.4, 0.5, 0.5, 0.5, 0.5)).toBeCloseTo(Math.hypot(0.2, 0.1), 6);
  });
});

// Accumulate raw moment sums for a set of points, the way ColorTracker's
// pixel loop will.
function moments(pts: { x: number; y: number }[]) {
  let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
  for (const p of pts) {
    sumX += p.x; sumY += p.y;
    sumXX += p.x * p.x; sumYY += p.y * p.y; sumXY += p.x * p.y;
  }
  return { sumX, sumY, sumXX, sumYY, sumXY, count: pts.length };
}

function linePoints(ax: number, ay: number, bx: number, by: number, n = 101) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay) });
  }
  return pts;
}

describe('axisFromMoments', () => {
  it('recovers a vertical tube line, with the near (larger-y) end first', () => {
    const m = moments(linePoints(0.5, 0.4, 0.5, 0.8));
    const seg = axisFromMoments(m.sumX, m.sumY, m.sumXX, m.sumYY, m.sumXY, m.count);
    // a = near end (larger y), b = far end (smaller y).
    expect(seg.ax).toBeCloseTo(0.5, 2);
    expect(seg.ay).toBeCloseTo(0.8, 2);
    expect(seg.bx).toBeCloseTo(0.5, 2);
    expect(seg.by).toBeCloseTo(0.4, 2);
  });

  it('recovers a diagonal tube line', () => {
    const m = moments(linePoints(0.2, 0.3, 0.8, 0.9));
    const seg = axisFromMoments(m.sumX, m.sumY, m.sumXX, m.sumYY, m.sumXY, m.count);
    // Near end (larger y) ≈ (0.8,0.9); far end ≈ (0.2,0.3).
    expect(seg.ax).toBeCloseTo(0.8, 1);
    expect(seg.ay).toBeCloseTo(0.9, 1);
    expect(seg.bx).toBeCloseTo(0.2, 1);
    expect(seg.by).toBeCloseTo(0.3, 1);
  });
});
