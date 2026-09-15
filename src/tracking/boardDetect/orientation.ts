/**
 * Board corner orientation. Saved corners map onto UNIT_SQUARE in this order:
 * [0] start + high notes, [1] end + high, [2] end + low, [3] start + low.
 */
import type { Point } from '../../utils/homography';

export type Corners = [Point, Point, Point, Point];

/** ⟲ Turn: move the loop's start to the next physical edge (one quarter turn per step). */
export function rotateCorners(c: Corners, quarterTurns: number): Corners {
  const n = ((Math.round(quarterTurns) % 4) + 4) % 4;
  let out: Corners = [c[0], c[1], c[2], c[3]];
  for (let i = 0; i < n; i++) out = [out[3], out[0], out[1], out[2]];
  return out;
}

/** ⇋ Flip: swap start and end, keeping the low-notes side. */
export function flipCorners(c: Corners): Corners {
  return [c[1], c[0], c[3], c[2]];
}
