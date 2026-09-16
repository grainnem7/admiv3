/**
 * Fit a lattice to the x-corners.
 *
 * The crossings of a board photographed at an angle are not a neat grid in the picture,
 * but they ARE a projective image of one. So: guess a small starting parallelogram from
 * three nearby corners, name every other corner by the integer step it sits at, and keep
 * the guess that explains the most corners. That gives an image → board-index mapping
 * without ever assuming the camera is square on.
 */
import {
  applyHomography, computeHomography, computeHomographyFit, type Mat3, type Point,
} from '../../utils/homography';
import type { XCorner } from './xCorners';

/** A corner must land this close to an integer lattice point to count as explained. */
export const LATTICE_TOLERANCE = 0.25;
/** A lattice must explain at least this many corners to be worth returning. */
export const MIN_LATTICE_NODES = 8;
/** How many seed triples to try before giving up (keeps the search bounded). */
export const MAX_SEEDS = 400;

export interface LatticeNode {
  /** Integer board indices (not pixels). */
  i: number;
  j: number;
  point: Point;
}

export interface Lattice {
  /** Lattice index → image pixel. */
  toImage: Mat3;
  nodes: LatticeNode[];
  /** Mean distance, in lattice units, between a corner and its integer point. */
  rms: number;
  score: number;
}

/**
 * Fit up to `top` lattices, best first. `corners` are in working-image pixels.
 */
export function fitLattices(corners: XCorner[], top = 3): Lattice[] {
  if (corners.length < 4) return [];
  const found: Lattice[] = [];
  let seeds = 0;

  // Seed from a corner and its two nearest neighbours: on a board those are one square
  // away along each axis, which is exactly the parallelogram we want.
  for (let a = 0; a < corners.length && seeds < MAX_SEEDS; a++) {
    const origin = corners[a];
    const neighbours = nearest(corners, origin, 6);
    for (let m = 0; m < neighbours.length && seeds < MAX_SEEDS; m++) {
      for (let n = m + 1; n < neighbours.length && seeds < MAX_SEEDS; n++) {
        seeds++;
        const u = neighbours[m];
        const v = neighbours[n];
        // Reject a nearly-straight triple: it cannot define two axes.
        const cross = (u.x - origin.x) * (v.y - origin.y) - (u.y - origin.y) * (v.x - origin.x);
        const area = Math.abs(cross);
        if (area < 8) continue;
        const lattice = growLattice(corners, origin, u, v);
        if (lattice && lattice.nodes.length >= MIN_LATTICE_NODES) found.push(lattice);
      }
    }
  }
  if (found.length === 0) return [];

  found.sort((p, q) => q.score - p.score);
  // Keep only genuinely different lattices: the same board found from different seeds
  // would otherwise fill the list.
  const kept: Lattice[] = [];
  for (const cand of found) {
    if (kept.some((k) => similar(k, cand))) continue;
    kept.push(cand);
    if (kept.length >= top) break;
  }
  return kept;
}

function nearest(corners: XCorner[], from: XCorner, count: number): XCorner[] {
  return corners
    .filter((c) => c !== from)
    .map((c) => ({ c, d: Math.hypot(c.x - from.x, c.y - from.y) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, count)
    .map((e) => e.c);
}

/**
 * Name every corner by its integer step from the seed parallelogram, then refit the
 * mapping from all the corners that agreed — so one rough seed becomes an accurate
 * lattice over the whole board.
 */
function growLattice(corners: XCorner[], origin: Point, u: Point, v: Point): Lattice | null {
  // The seed maps (0,0), (1,0), (0,1) and (1,1) onto the parallelogram.
  const seedCorners: Point[] = [
    origin,
    { x: u.x, y: u.y },
    { x: u.x + v.x - origin.x, y: u.y + v.y - origin.y },
    { x: v.x, y: v.y },
  ];
  let toImage: Mat3;
  try {
    toImage = computeHomography(UNIT, seedCorners);
  } catch {
    return null;
  }

  for (let pass = 0; pass < 2; pass++) {
    const assigned = assign(corners, toImage);
    if (assigned.length < MIN_LATTICE_NODES) return null;
    try {
      // Least squares over EVERY agreeing corner. computeHomography takes exactly four
      // and threw on anything else, so this refit used to fail every single pass and
      // silently keep the seed — a parallelogram, i.e. a map with no perspective in it.
      // On a board seen at an angle that put the proposed corners off the board entirely.
      toImage = computeHomographyFit(
        assigned.map((n) => ({ x: n.i, y: n.j })),
        assigned.map((n) => n.point),
      );
    } catch {
      // Refit needs four points that aren't collinear; keep the previous mapping.
      break;
    }
  }

  const nodes = assign(corners, toImage);
  if (nodes.length < MIN_LATTICE_NODES) return null;
  const rms = meanError(nodes, toImage);
  // More corners explained is better; a tighter fit breaks ties.
  return { toImage, nodes, rms, score: nodes.length - rms * 4 };
}

const UNIT: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** Give each corner its integer lattice index, dropping those that don't fit. */
function assign(corners: XCorner[], toImage: Mat3): LatticeNode[] {
  const inverse = invert(toImage);
  if (!inverse) return [];
  const nodes: LatticeNode[] = [];
  const taken = new Set<string>();
  for (const c of corners) {
    const p = applyHomography(inverse, { x: c.x, y: c.y });
    const i = Math.round(p.x);
    const j = Math.round(p.y);
    // A point on the horizon divides by ~0 and comes back infinite. Math.round(Infinity)
    // is Infinity and Infinity - Infinity is NaN, so the tolerance test below is FALSE and
    // the bad node was kept — which made the span infinite and the board unconfirmable.
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue;
    if (Math.abs(p.x - i) > LATTICE_TOLERANCE || Math.abs(p.y - j) > LATTICE_TOLERANCE) continue;
    const key = `${i},${j}`;
    if (taken.has(key)) continue;    // one corner per lattice point
    taken.add(key);
    nodes.push({ i, j, point: { x: c.x, y: c.y } });
  }
  return nodes;
}

function meanError(nodes: LatticeNode[], toImage: Mat3): number {
  const inverse = invert(toImage);
  if (!inverse) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const n of nodes) {
    const p = applyHomography(inverse, n.point);
    sum += Math.hypot(p.x - n.i, p.y - n.j);
  }
  return sum / nodes.length;
}

function similar(a: Lattice, b: Lattice): boolean {
  // Two lattices are the same board when they explain mostly the same points.
  const keys = new Set(a.nodes.map((n) => `${Math.round(n.point.x)},${Math.round(n.point.y)}`));
  const shared = b.nodes.filter(
    (n) => keys.has(`${Math.round(n.point.x)},${Math.round(n.point.y)}`),
  ).length;
  return shared >= Math.min(a.nodes.length, b.nodes.length) * 0.6;
}

/** Invert a 3 × 3 matrix; null when it is singular. */
export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    A / det, (c * h - b * i) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, (c * d - a * f) / det,
    C / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ];
}
