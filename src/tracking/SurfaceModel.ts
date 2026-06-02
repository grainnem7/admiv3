/**
 * SurfaceModel — the table surface as a line in normalised image space.
 *
 * The camera looks across the table at an oblique angle, so the surface
 * edge is a sloped line, not a constant y. We fit y = a·x + b from the
 * points the user touches during calibration. Works for any front/side
 * placement because the line comes entirely from the touched points.
 */

export interface SurfacePoint {
  /** Normalised image x (0 = left, 1 = right). */
  x: number;
  /** Normalised image y (0 = top, 1 = bottom). */
  y: number;
}

export interface SurfaceLine {
  /** Slope (Δy per unit x). */
  a: number;
  /** Intercept (y at x = 0). */
  b: number;
}

/**
 * Least-squares fit of a line through the touched surface points.
 * Requires at least two points. If every point shares the same x (no
 * horizontal spread to define a slope), falls back to a horizontal line
 * at the mean y.
 */
export function fitSurfaceLine(points: SurfacePoint[]): SurfaceLine {
  if (points.length < 2) {
    throw new Error('[SurfaceModel] need at least two points to fit a surface line');
  }

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }

  if (Math.abs(den) < 1e-9) {
    return { a: 0, b: meanY };
  }

  const a = num / den;
  const b = meanY - a * meanX;
  return { a, b };
}

/** Evaluate the surface y for a given x. */
export function surfaceY(line: SurfaceLine, x: number): number {
  return line.a * x + line.b;
}
