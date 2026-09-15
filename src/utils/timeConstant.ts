/** Reference frame the per-frame smoothing constants were tuned at (a 60 Hz display tick). */
export const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Convert an EMA alpha tuned per reference frame into the alpha for a step of `dtMs`,
 * so smoothing behaves the same whatever the frame rate: alpha = 1 − (1 − a)^(dt/ref).
 */
export function alphaForDt(alphaPerRef: number, dtMs: number, refMs: number = REFERENCE_FRAME_MS): number {
  if (alphaPerRef >= 1) return 1;
  if (alphaPerRef <= 0 || dtMs <= 0) return 0;
  return 1 - Math.pow(1 - alphaPerRef, dtMs / refMs);
}
