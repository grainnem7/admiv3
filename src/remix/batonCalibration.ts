/**
 * batonCalibration — map a player's calibrated movement range onto the full
 * 0–1 control range, with a reach margin so the player needn't hit the exact
 * extremes to reach full / none. Pure; identity when uncalibrated.
 */

export interface AxisRange {
  min: number;
  max: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * @param raw    0–1 axis value from the tracker.
 * @param range  the player's calibrated [min,max] for this axis, or null.
 * @param margin outer fraction (each end) of the normalised range that snaps
 *               to 0 / 1. e.g. 0.1 → outer 10% reaches the extreme.
 */
export function applyAxisCalibration(
  raw: number,
  range: AxisRange | null,
  margin: number,
): number {
  if (!range || range.max - range.min < 1e-6) return raw;

  const normalised = clamp01((raw - range.min) / (range.max - range.min));

  const m = clamp01(margin);
  if (m <= 0) return normalised;
  if (normalised <= m) return 0;
  if (normalised >= 1 - m) return 1;
  // Rescale the inner band [m, 1-m] back to [0,1].
  return (normalised - m) / (1 - 2 * m);
}
