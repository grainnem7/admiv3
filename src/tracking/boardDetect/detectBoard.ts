/**
 * Find the board: an empty checkerboard's outer corners and how many squares it has.
 *
 * The lattice gives crossings named by integer step. A board's crossings form a square
 * block of them — 9 × 9 on an 8 × 8 board, 11 × 11 on a 10 × 10 — so the extent of the
 * block is the square count, and the block's outer corners are the corners of the
 * playing area. Everything is reported as a proposal with a confidence: the player
 * confirms it, and a poor result falls back to the editor rather than guessing.
 */
import { applyHomography, type Point } from '../../utils/homography';
import { toGrayDownscaled, type GrayImage } from './gray';
import { findXCorners } from './xCorners';
import { fitLattices, type Lattice } from './lattice';

export type DetectStatus = 'high' | 'low' | 'partial' | 'none';
export type BoardSquares = 8 | 10;

export interface BoardDetection {
  status: DetectStatus;
  /**
   * Fractions of the full captured frame, in displayed (mirrored) orientation — the same
   * space `BoardReader` samples. Order matches saved corners: [start+high, end+high,
   * end+low, start+low], taken from the picture (top-left first) until the player turns it.
   */
  corners?: [Point, Point, Point, Point];
  squares?: BoardSquares;
  /** Every lattice point in the picture, so the editor can snap handles to the board. */
  latticeNodes?: Point[];
  offscreenCorner?: 0 | 1 | 2 | 3;
  metrics: { coverage: number; margin: number; rms: number; nodes: number; ms: number };
  /** Plain-language hints for the message under the result. */
  reasons: string[];
}

export interface DetectOptions {
  /** Sizes to consider. */
  sizes?: BoardSquares[];
  now?: () => number;
  budgetMs?: number;
}

/** Share of the expected crossings that must be present for high confidence. */
export const HIGH_COVERAGE = 0.7;
/** How much better the winning size must be than the runner-up. */
export const HIGH_MARGIN = 0.15;

const NONE = (reasons: string[], ms: number): BoardDetection => ({
  status: 'none',
  metrics: { coverage: 0, margin: 0, rms: 0, nodes: 0, ms },
  reasons,
});

export function detectBoard(
  rgba: Uint8ClampedArray, width: number, height: number, opts: DetectOptions = {},
): BoardDetection {
  const now = opts.now ?? (() => performance.now());
  const started = now();
  const sizes = opts.sizes ?? [8, 10];
  const budget = opts.budgetMs ?? 150;

  const gray = toGrayDownscaled(rgba, width, height);
  const corners = findXCorners(gray);
  if (corners.length < 12) {
    return NONE(['Couldn’t see the squares. Take the counters off and try more even light.'], now() - started);
  }
  const lattices = fitLattices(corners);
  if (lattices.length === 0) {
    return NONE(['Couldn’t find a grid of squares. Is the whole board in view?'], now() - started);
  }
  // NOTE: no bail-out here. This point is past everything expensive — the corners are
  // found and the lattices are fitted — so throwing the result away would discard a board
  // it had already located, and the old message blamed the player ("try again with the
  // board still") for what was only a busy machine. Detection ran slow on a loaded
  // browser and simply refused to find a board that was sitting there perfectly still.
  // The work left below is scoring two sizes and reading four corners off the lattice.
  const slow = now() - started > budget;

  const best = lattices[0];
  const span = latticeSpan(best);
  // A board's crossings span (squares) steps: 8 squares → indices 0…8.
  const scored = sizes
    .map((squares) => ({ squares, fit: fitScore(best, span, squares) }))
    .sort((a, b) => b.fit - a.fit);
  const winner = scored[0];
  const margin = scored.length > 1 ? winner.fit - scored[1].fit : 1;

  const quad = cornersOf(best, span, winner.squares, gray);
  if (!quad) {
    return NONE(['Found squares but not the edge of the board. Is the whole board in view?'], now() - started);
  }

  const toFraction = (p: Point): Point => ({
    x: (p.x * gray.scale) / width,
    y: (p.y * gray.scale) / height,
  });
  const frac = quad.map(toFraction) as [Point, Point, Point, Point];
  const offscreen = frac.findIndex((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1);

  const nodes = best.nodes.map((n) => toFraction(n.point));
  const ms = now() - started;
  const metrics = { coverage: winner.fit, margin, rms: best.rms, nodes: best.nodes.length, ms };
  // Slowness is worth knowing about, but it is information, not a failure.
  const slowNote = slow ? ['That took a while — close other tabs if it feels slow.'] : [];

  if (offscreen >= 0) {
    return {
      status: 'partial',
      corners: frac,
      squares: winner.squares,
      latticeNodes: nodes,
      offscreenCorner: offscreen as 0 | 1 | 2 | 3,
      metrics,
      reasons: [
        `The ${CORNER_NAMES[offscreen]} corner is outside the camera picture. Move the camera back.`,
        ...slowNote,
      ],
    };
  }

  const high = winner.fit >= HIGH_COVERAGE && margin >= HIGH_MARGIN;
  return {
    status: high ? 'high' : 'low',
    corners: frac,
    squares: winner.squares,
    latticeNodes: nodes,
    metrics,
    reasons: [
      ...(high
        ? [`Found a ${winner.squares} × ${winner.squares} board.`]
        : ['I’m not sure this is right. Check the corners sit on the outside corners of the squares.']),
      ...slowNote,
    ],
  };
}

const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

interface Span { minI: number; maxI: number; minJ: number; maxJ: number }

function latticeSpan(lattice: Lattice): Span {
  let minI = Infinity; let maxI = -Infinity; let minJ = Infinity; let maxJ = -Infinity;
  for (const n of lattice.nodes) {
    minI = Math.min(minI, n.i); maxI = Math.max(maxI, n.i);
    minJ = Math.min(minJ, n.j); maxJ = Math.max(maxJ, n.j);
  }
  return { minI, maxI, minJ, maxJ };
}

/**
 * How well a square count explains the lattice: the share of that size's expected
 * crossings actually found, penalised when the block is the wrong shape.
 */
/**
 * Where a `squares` x `squares` board sits inside the lattice, and how much of it is there.
 *
 * The block used to be anchored at the lattice's lowest index and penalised by its FULL
 * span, so a single stray crossing — a tiled splashback, a chequered cloth, one noisy
 * corner — moved the window off the board AND applied a penalty big enough to take a
 * confident detection to zero. Sliding the window fixes both: a stray node outside the
 * board simply isn't in the best block, and no penalty is needed because a lattice that
 * doesn't hold a full board can't fill one.
 */
function bestBlock(lattice: Lattice, span: Span, squares: number): { i0: number; j0: number; inside: number } {
  let best = { i0: span.minI, j0: span.minJ, inside: 0 };
  for (let i0 = span.minI; i0 <= span.maxI - squares; i0++) {
    for (let j0 = span.minJ; j0 <= span.maxJ - squares; j0++) {
      let inside = 0;
      for (const n of lattice.nodes) {
        if (n.i >= i0 && n.i <= i0 + squares && n.j >= j0 && n.j <= j0 + squares) inside++;
      }
      if (inside > best.inside) best = { i0, j0, inside };
    }
  }
  return best;
}

function fitScore(lattice: Lattice, span: Span, squares: number): number {
  const expected = (squares + 1) * (squares + 1);
  const { inside } = bestBlock(lattice, span, squares);
  // Two things have to be true: the block is FULL (this size explains the crossings it
  // covers) and little is left OVER (no larger board is being read as a smaller one —
  // an 8 x 8 block sits perfectly inside a 10 x 10 lattice, so fullness alone always
  // prefers the smaller size).
  //
  // Expressing "left over" as a share of the lattice, rather than as a penalty on its
  // span, is what makes this robust: one stray crossing from a tiled wall or a chequered
  // cloth costs a couple of per cent instead of taking a confident reading to zero.
  const explains = inside / Math.max(1, lattice.nodes.length);
  return Math.max(0, (inside / expected) * explains);
}

/** The four outer corners of the playing area, in working-image pixels. */
function cornersOf(lattice: Lattice, span: Span, squares: number, gray: GrayImage): [Point, Point, Point, Point] | null {
  // The same block the score chose, so the corners describe the board that was scored
  // rather than whatever happened to have the lowest index.
  const { i0, j0 } = bestBlock(lattice, span, squares);
  const i1 = i0 + squares;
  const j1 = j0 + squares;
  const at = (i: number, j: number): Point => applyHomography(lattice.toImage, { x: i, y: j });
  const quad: Point[] = [at(i0, j0), at(i1, j0), at(i1, j1), at(i0, j1)];
  if (quad.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  void gray;
  return orderByImage(quad);
}

/**
 * Put the quad in saved-corner order from the picture: top-left first, then clockwise.
 * The player turns it once against the start → / low labels if the board is the other
 * way round; nothing here tries to guess which way they are sitting.
 */
export function orderByImage(points: Point[]): [Point, Point, Point, Point] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  // atan2 starts at -π (pointing left); rotate so the top-left corner comes first.
  let startIndex = 0;
  let bestScore = Infinity;
  sorted.forEach((p, i) => {
    const score = (p.x - cx) + (p.y - cy);
    if (score < bestScore) { bestScore = score; startIndex = i; }
  });
  const ordered = [
    sorted[startIndex],
    sorted[(startIndex + 1) % 4],
    sorted[(startIndex + 2) % 4],
    sorted[(startIndex + 3) % 4],
  ];
  return ordered as [Point, Point, Point, Point];
}
