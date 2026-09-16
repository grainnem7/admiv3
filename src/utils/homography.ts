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
export const UNIT_SQUARE: readonly [Readonly<Point>, Readonly<Point>, Readonly<Point>, Readonly<Point>] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
] as const;

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

export function computeHomography(src: readonly Point[], dst: readonly Point[]): Mat3 {
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

/**
 * Best-fit homography through FOUR OR MORE correspondences (least squares).
 *
 * Four points give one exact answer; more points average out the noise in each. This
 * matters because `computeHomography` accepts exactly four and throws otherwise — so a
 * caller refitting from a whole lattice had its refit throw every time, silently kept its
 * rough starting guess, and produced an affine map with no perspective in it at all. On a
 * board seen at an angle that is the difference between corners on the board and corners
 * somewhere off the side of it.
 *
 * Points are normalised before solving (Hartley): lattice indices count 0..8 while pixels
 * count 0..640, and mixing those scales directly makes the normal equations far worse
 * conditioned than they need to be.
 */
export function computeHomographyFit(src: readonly Point[], dst: readonly Point[]): Mat3 {
  if (src.length !== dst.length) {
    throw new Error('homography: src and dst must be the same length');
  }
  if (src.length < 4) {
    throw new Error('homography: need at least 4 point correspondences');
  }
  if (src.length === 4) return computeHomography(src, dst);

  const ns = normalise(src);
  const nd = normalise(dst);

  // Normal equations: (AᵀA) h = (Aᵀb), with the 8 unknowns of a homography whose h8 = 1.
  const ata: number[][] = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const addRow = (row: number[], rhs: number): void => {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) ata[i][j] += row[i] * row[j];
      atb[i] += row[i] * rhs;
    }
  };
  for (let i = 0; i < ns.points.length; i++) {
    const { x, y } = ns.points[i];
    const { x: X, y: Y } = nd.points[i];
    addRow([x, y, 1, 0, 0, 0, -x * X, -y * X], X);
    addRow([0, 0, 0, x, y, 1, -x * Y, -y * Y], Y);
  }
  const h = solveLinear(ata, atb);
  const fitted: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  // Undo the normalisation: H = T_dst⁻¹ · Ĥ · T_src.
  return multiply(inverseSimilarity(nd.transform), multiply(fitted, ns.transform));
}

/** Shift to the centroid and scale so the mean distance from it is √2 (Hartley). */
function normalise(points: readonly Point[]): { points: Point[]; transform: Mat3 } {
  const n = points.length;
  let cx = 0;
  let cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= n;
  cy /= n;
  let mean = 0;
  for (const p of points) mean += Math.hypot(p.x - cx, p.y - cy);
  mean /= n;
  const scale = mean < 1e-12 ? 1 : Math.SQRT2 / mean;
  return {
    points: points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale })),
    transform: [scale, 0, -scale * cx, 0, scale, -scale * cy, 0, 0, 1],
  };
}

/** Inverse of the scale-and-shift matrix `normalise` produces. */
function inverseSimilarity(t: Mat3): Mat3 {
  const s = t[0];
  return [1 / s, 0, -t[2] / s, 0, 1 / s, -t[5] / s, 0, 0, 1];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[r * 3 + k] * b[k * 3 + c];
      out[r * 3 + c] = sum;
    }
  }
  return out as unknown as Mat3;
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
