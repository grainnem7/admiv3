/**
 * Follow the board when it is nudged.
 *
 * A nudge is a small rigid move of a board we have already seen, not an unknown board to
 * be found from scratch — so this asks one question of the watcher's learnt background:
 * *which small shift of the grid best explains the picture now?* A correction is only
 * taken when it measurably improves the match and is well inside the limit, so the grid
 * can neither drift on a still board nor chase a board that has really been moved.
 */
import { applyHomography, type Mat3 } from '../../utils/homography';
import type { Corners } from '../boardDetect/orientation';
import type { FrameInfo, WatchGrid } from './intruderMask';

/** How often tracking is worth running; a nudge is not a per-frame event. */
export const TRACK_INTERVAL_MS = 500;
/** Corrections are saved no more often than this. */
export const TRACK_SAVE_MS = 3000;

export interface TrackOptions {
  /** How far a nudge may be followed, in board squares. */
  maxShiftSquares: number;
  /** The share of the residual a correction must remove before it is believed. */
  minImprovement: number;
}

export interface TrackResult {
  /** Board-space shift, as a fraction of the whole board. */
  dx: number;
  dy: number;
  scale: number;
  improved: boolean;
  before: number;
  after: number;
}

const NO_MOVE: TrackResult = { dx: 0, dy: 0, scale: 1, improved: false, before: 0, after: 0 };

/**
 * The most the board may appear to grow or shrink in one correction (2.8%, the reach of
 * the coarse then fine scale search). A winner at this limit is treated like a big shift:
 * left to the "Board moved?" hint rather than half-followed into the saved corners.
 */
const MAX_SCALE_STEP = 0.028;

/** Mean absolute difference from the background, for one candidate move. */
function residual(
  grid: WatchGrid, bg: Float32Array, rgba: Uint8ClampedArray, h: Mat3, frame: FrameInfo,
  dx: number, dy: number, scale: number,
): number {
  const n = grid.size * grid.size;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    // Only points that had a background worth comparing against.
    if (grid.imgIdx[i] < 0) continue;
    const u = 0.5 + (grid.uv[i * 2] - 0.5) * scale + dx;
    const v = 0.5 + (grid.uv[i * 2 + 1] - 0.5) * scale + dy;
    const p = applyHomography(h, { x: u, y: v });
    const px = Math.round(p.x / frame.downscale);
    const py = Math.round(p.y / frame.downscale);
    if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) continue;
    const idx = (py * frame.width + px) * 4;
    sum += Math.abs(rgba[idx] - bg[i * 3])
      + Math.abs(rgba[idx + 1] - bg[i * 3 + 1])
      + Math.abs(rgba[idx + 2] - bg[i * 3 + 2]);
    count += 3;
  }
  return count > 0 ? sum / count : Number.POSITIVE_INFINITY;
}

/**
 * The small rigid move that best explains the current picture, or "leave it alone".
 * `h` is the homography the corners currently give (board → full-resolution pixels).
 */
export function estimateBoardShift(
  grid: WatchGrid, bg: Float32Array, rgba: Uint8ClampedArray, h: Mat3, frame: FrameInfo,
  opts: TrackOptions,
): TrackResult {
  const maxShift = opts.maxShiftSquares / Math.max(1, grid.boardSquares);
  const before = residual(grid, bg, rgba, h, frame, 0, 0, 1);
  if (!Number.isFinite(before)) return NO_MOVE;

  let best = { dx: 0, dy: 0, scale: 1, score: before };
  const search = (cx: number, cy: number, cs: number, step: number, scaleStep: number): void => {
    for (let iy = -2; iy <= 2; iy++) {
      for (let ix = -2; ix <= 2; ix++) {
        for (let is = -1; is <= 1; is++) {
          const dx = cx + ix * step;
          const dy = cy + iy * step;
          const scale = cs + is * scaleStep;
          if (Math.abs(dx) > maxShift || Math.abs(dy) > maxShift) continue;
          const score = residual(grid, bg, rgba, h, frame, dx, dy, scale);
          if (score < best.score) best = { dx, dy, scale, score };
        }
      }
    }
  };

  const coarse = maxShift / 2;
  search(0, 0, 1, coarse, 0.02);
  // One refinement around the winner, at a fifth of the coarse step.
  const fine = coarse / 5;
  search(best.dx, best.dy, best.scale, fine, 0.008);

  // A winner sitting on the edge of the search means the real move is bigger than we are
  // willing to follow: leave it to the "Board moved?" hint rather than half-following it.
  // Scale was bounded by nothing and tested at no edge, yet every accepted correction is
  // written into the player's saved corners and the next one starts from there. A slow
  // exposure ramp could keep preferring a slightly smaller board and shrink the saved
  // calibration, step by step, with no undo and nothing said.
  const atEdge = Math.abs(best.dx) > maxShift * 0.95
    || Math.abs(best.dy) > maxShift * 0.95
    || Math.abs(best.scale - 1) > MAX_SCALE_STEP * 0.95;
  const improved = !atEdge && best.score < before * (1 - opts.minImprovement);

  return {
    dx: improved ? best.dx : 0,
    dy: improved ? best.dy : 0,
    scale: improved ? best.scale : 1,
    improved,
    before,
    after: best.score,
  };
}

/**
 * Move the saved corners by a board-space shift. Everything downstream — the homography,
 * the watch grid, the sampling lattice, the overlay — follows from this one write.
 */
export function shiftCorners(corners: Corners, dx: number, dy: number, scale: number): Corners {
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
  // The shift is in board units, so it is applied along the board's own axes rather than
  // the picture's: a rotated board is nudged sideways, not across the screen.
  const ax = { x: (corners[1].x - corners[0].x + corners[2].x - corners[3].x) / 2,
    y: (corners[1].y - corners[0].y + corners[2].y - corners[3].y) / 2 };
  const ay = { x: (corners[3].x - corners[0].x + corners[2].x - corners[1].x) / 2,
    y: (corners[3].y - corners[0].y + corners[2].y - corners[1].y) / 2 };
  const move = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: cx + (p.x - cx) * scale + dx * ax.x + dy * ay.x,
    y: cy + (p.y - cy) * scale + dx * ax.y + dy * ay.y,
  });
  return [move(corners[0]), move(corners[1]), move(corners[2]), move(corners[3])];
}
