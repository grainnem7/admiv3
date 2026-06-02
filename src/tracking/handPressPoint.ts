/**
 * handPressPoint — pick the point on a hand that "presses" a surface key.
 *
 * For the surface-press instrument, Tim presses table keys with his hand.
 * The pressing point is the lowest fingertip in the image (the part of the
 * hand nearest the table when reaching down across the camera's oblique
 * view). Tracking the lowest of the five fingertips — rather than strictly
 * the index tip — is forgiving of hand pose: one finger, several, or a
 * loose hand all work, while non-fingertip landmarks (wrist, knuckles) are
 * ignored so the side of the hand doesn't trigger.
 *
 * Pure (no MediaPipe import): takes the normalised landmark array directly.
 * x/y are whatever space the caller's landmarks are in (HandDetector mirrors
 * x to match the displayed video, so x is screen-space there).
 */

/** MediaPipe hand fingertip landmark indices: thumb, index, middle, ring, pinky. */
const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const;

/** MediaPipe index-finger tip landmark index. */
const INDEX_TIP = 8;

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Return the index-finger tip (landmark 8), or null if the landmark array is
 * missing or shorter than a full hand. Use this when the pressing point should
 * be specifically the index finger (a deliberate "pointing" press) rather than
 * whichever fingertip is lowest.
 */
export function indexFingertip(
  landmarks: readonly Point2D[] | null | undefined,
): Point2D | null {
  if (!landmarks || landmarks.length < 21) return null;
  const lm = landmarks[INDEX_TIP];
  return lm ? { x: lm.x, y: lm.y } : null;
}

/**
 * Return the fingertip with the greatest y (lowest in the image), or null
 * if the landmark array is missing or shorter than a full hand (21 points).
 */
export function lowestFingertip(
  landmarks: readonly Point2D[] | null | undefined,
): Point2D | null {
  if (!landmarks || landmarks.length < 21) return null;

  let best: Point2D | null = null;
  for (const i of FINGERTIP_INDICES) {
    const lm = landmarks[i];
    if (!lm) continue;
    if (best === null || lm.y > best.y) {
      best = { x: lm.x, y: lm.y };
    }
  }
  return best;
}
