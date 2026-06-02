/**
 * Four-corner perspective homography (DLT) with minimal dependencies.
 *
 * computeHomography(src, dst) returns the 3x3 matrix (row-major, 9 numbers)
 * mapping src points → dst points. For the board we pass src = UNIT_SQUARE
 * (warped grid space) and dst = the four clicked image corners, so
 * applyHomography(H, gridPoint) yields the image pixel to sample.
 */

export interface Point {
  x: number;
  y: number;
}

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** Unit-square corners in TL, TR, BR, BL order. */
export const UNIT_SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Solve a square linear system A x = b via Gaussian elimination (partial pivot). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }
    const pv = m[col][col];
    if (Math.abs(pv) < 1e-12) {
      throw new Error('homography: degenerate corner configuration');
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / pv;
      for (let c = col; c <= n; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export function computeHomography(src: Point[], dst: Point[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('homography: need exactly 4 point correspondences');
  }
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(h: Mat3, p: Point): Point {
  const denom = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / denom,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / denom,
  };
}

/** Centre of grid cell (row, col) in unit-square coords; row 0 = top, col 0 = left. */
export function cellCentreUnit(row: number, col: number, rows: number, cols: number): Point {
  return { x: (col + 0.5) / cols, y: (row + 0.5) / rows };
}
