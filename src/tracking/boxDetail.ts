/**
 * Where a counter sits inside its box, as an expressive parameter.
 *
 * Up–down is loudness (an accent), left–right is timing (the "and"). Both are measured
 * from the centre of the PHYSICAL square where the grid allows it, so a coarse grid
 * doesn't read a perfectly normal placement as an extreme, and both are off by default:
 * a player whose aim is unsteady must never be punished for it.
 */
import { gridDividesBoard } from './boardGrid';

/** Inside this fraction of the square, a counter reads as dead centre. */
export const BOX_DEAD_ZONE = 0.15;
/** How many colours one box can report when two counters share it. */
export const MAX_CELL_COLOURS = 2;

export interface BoxPosition {
  /** −1 at the bottom of the square, 0 centred, +1 at the top. */
  up: number;
  /** −1 at the left of the square, 0 centred, +1 at the right. */
  side: number;
}

export interface BoxContext {
  rows: number;
  cols: number;
  boardSquares: number;
}

export const CENTRED: BoxPosition = { up: 0, side: 0 };

/** Map a raw −1…1 offset through the dead zone, so the middle is reachable. */
function throughDeadZone(v: number): number {
  const sign = Math.sign(v);
  const mag = Math.abs(v);
  if (mag <= BOX_DEAD_ZONE) return 0;
  return sign * Math.min(1, (mag - BOX_DEAD_ZONE) / (1 - BOX_DEAD_ZONE));
}

/**
 * The counter's position within its box, in −1…1 per axis. `centroid` is in unit board
 * coordinates, the space `BoardReader` reports.
 */
export function boxPosition(
  centroid: { x: number; y: number }, row: number, col: number, ctx: BoxContext,
): BoxPosition {
  let fx: number;
  let fy: number;
  if (gridDividesBoard(ctx.boardSquares, ctx.rows, ctx.cols)) {
    // Within the physical square, exactly as Variation measures it.
    const n = ctx.boardSquares;
    fx = centroid.x * n - Math.floor(centroid.x * n);
    fy = centroid.y * n - Math.floor(centroid.y * n);
  } else {
    fx = centroid.x * ctx.cols - col;
    fy = centroid.y * ctx.rows - row;
  }
  return {
    // Image y grows downwards, so higher in the square is a smaller y.
    up: throughDeadZone(Math.max(-1, Math.min(1, (0.5 - fy) * 2))),
    side: throughDeadZone(Math.max(-1, Math.min(1, (fx - 0.5) * 2))),
  };
}

/** Higher in the square is louder. `amount` 0 leaves the base velocity alone. */
export function velocityFor(base: number, up: number, amount: number): number {
  return Math.max(0.05, Math.min(1, base * (1 + up * amount)));
}

/** Right of centre is later, as a fraction of one step ("the and" is +0.5). */
export function timingBeatsFor(side: number, amount: number): number {
  return side * amount * 0.5;
}

/** The position in words, for the legend and Describe board. */
export function describeBox(pos: BoxPosition): string {
  const parts: string[] = [];
  if (pos.up > 0.1) parts.push('louder');
  else if (pos.up < -0.1) parts.push('softer');
  if (pos.side > 0.1) parts.push('late');
  else if (pos.side < -0.1) parts.push('early');
  return parts.join(', ');
}

/** The median of each axis, for latching a position over the settle window. */
export function medianPosition(samples: readonly BoxPosition[]): BoxPosition {
  if (samples.length === 0) return CENTRED;
  const med = (v: number[]): number => {
    const s = [...v].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return { up: med(samples.map((p) => p.up)), side: med(samples.map((p) => p.side)) };
}
