import { describe, it, expect } from 'vitest';
import {
  computeHomography, computeHomographyFit, applyHomography, type Mat3,
} from '../utils/homography';

/** A board seen at an angle: strong perspective, so the far edge is much shorter. */
const ANGLED: Mat3 = [
  1.8, 0.35, 40,
  0.12, 1.6, 30,
  0.0016, 0.0009, 1,
];

/** Lattice indices 0..8 in both directions, as the board detector produces. */
function grid(n = 9): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push({ x: i, y: j });
  return out;
}

const project = (h: Mat3, pts: { x: number; y: number }[]) => pts.map((p) => applyHomography(h, p));

describe('computeHomographyFit', () => {
  it('recovers a perspective mapping exactly from a whole lattice', () => {
    const src = grid();
    const dst = project(ANGLED, src);
    const fitted = computeHomographyFit(src, dst);
    for (const p of src) {
      const want = applyHomography(ANGLED, p);
      const got = applyHomography(fitted, p);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    }
  });

  it('keeps the perspective terms instead of flattening to an affine map', () => {
    // This is the whole point. The old code fell back to a parallelogram seed, whose
    // bottom row is [0, 0, 1] — no perspective — so an angled board's corners were
    // extrapolated to somewhere off the side of it.
    const src = grid();
    const fitted = computeHomographyFit(src, project(ANGLED, src));
    expect(Math.abs(fitted[6])).toBeGreaterThan(1e-5);
    expect(Math.abs(fitted[7])).toBeGreaterThan(1e-5);
  });

  it('extrapolates well beyond the points it was given', () => {
    // The detector fits from the crossings it can see, then reads the OUTSIDE corners of
    // the board off that fit — points no corner was ever supplied for.
    const inner = grid().filter((p) => p.x >= 2 && p.x <= 6 && p.y >= 2 && p.y <= 6);
    const fitted = computeHomographyFit(inner, project(ANGLED, inner));
    for (const corner of [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]) {
      const want = applyHomography(ANGLED, corner);
      const got = applyHomography(fitted, corner);
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(0.5);
    }
  });

  it('averages out noise, beating any four points on their own', () => {
    const src = grid();
    const truth = project(ANGLED, src);
    // Deterministic jitter, like sub-pixel corner error.
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648) - 0.5;
    };
    const noisy = truth.map((p) => ({ x: p.x + rand() * 1.2, y: p.y + rand() * 1.2 }));

    const err = (h: Mat3): number => {
      let sum = 0;
      for (let i = 0; i < src.length; i++) {
        const got = applyHomography(h, src[i]);
        sum += Math.hypot(got.x - truth[i].x, got.y - truth[i].y);
      }
      return sum / src.length;
    };

    const corners = [0, 8, 80, 72]; // the four extreme lattice points
    const four = computeHomography(corners.map((i) => src[i]), corners.map((i) => noisy[i]));
    expect(err(computeHomographyFit(src, noisy))).toBeLessThan(err(four));
  });

  it('still takes exactly four points, and refuses fewer', () => {
    const src = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const dst = project(ANGLED, src);
    const fitted = computeHomographyFit(src, dst);
    for (let i = 0; i < 4; i++) {
      expect(applyHomography(fitted, src[i]).x).toBeCloseTo(dst[i].x, 6);
    }
    expect(() => computeHomographyFit(src.slice(0, 3), dst.slice(0, 3))).toThrow(/at least 4/);
    expect(() => computeHomographyFit(src, dst.slice(0, 3))).toThrow(/same length/);
  });
});
