/**
 * segmentGeometry — pure 2D helpers for the surface-press feature.
 *
 * A table "key" is a coloured tube that appears in the image as a line
 * segment (a vector), because the tubes radiate toward the oblique camera.
 * Tim can press anywhere along a tube, so a press is decided by the
 * perpendicular distance from the pressing fingertip to the tube's line —
 * not by a single point. These helpers stay pure so they can be unit tested
 * without a camera.
 *
 * All coordinates are in the same normalised image space (0..1); distances
 * are therefore in that space too (and aspect-distorted equally for points
 * and segments, which keeps comparisons self-consistent).
 */

/** Perpendicular distance from a point to a finite segment (a→b). */
export function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export interface AxisSegment {
  /** Near end (larger y, closest to the camera). */
  ax: number;
  ay: number;
  /** Far end (smaller y). */
  bx: number;
  by: number;
}

/**
 * Estimate a blob's long-axis line segment from its pixel moments.
 *
 * Given the running sums a single pass over the matched pixels produces
 * (Σx, Σy, Σx², Σy², Σxy, count), this finds the principal axis (the
 * tube's length direction) and projects out a half-length from the variance
 * along that axis (treating the tube as a roughly uniform line: for a
 * uniform spread of half-length L the variance is L²/3, so L = √3·σ).
 *
 * Returns endpoints with the near end (larger y) first, so callers get a
 * stable orientation frame to frame.
 */
export function axisFromMoments(
  sumX: number, sumY: number,
  sumXX: number, sumYY: number, sumXY: number,
  count: number,
): AxisSegment {
  const mx = sumX / count;
  const my = sumY / count;
  const cxx = sumXX / count - mx * mx;
  const cyy = sumYY / count - my * my;
  const cxy = sumXY / count - mx * my;

  // Principal-axis angle (eigenvector of the 2×2 covariance for the larger
  // eigenvalue).
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  let dx = Math.cos(theta);
  let dy = Math.sin(theta);

  // Variance along that direction → half-length.
  const lambda = cxx * dx * dx + 2 * cxy * dx * dy + cyy * dy * dy;
  const halfLen = Math.sqrt(Math.max(lambda, 0)) * Math.sqrt(3);

  // Orient so the near end (larger y) is 'a'.
  if (dy < 0) { dx = -dx; dy = -dy; }

  return {
    ax: mx + dx * halfLen,
    ay: my + dy * halfLen,
    bx: mx - dx * halfLen,
    by: my - dy * halfLen,
  };
}
