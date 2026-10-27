/**
 * A returning session's quiet check: is the board still where its saved corners say?
 * Judged in squares, like the burst's own agreement rule, and never "moved" without
 * having seen the board: counters, a hand or poor light can hide it from the detector.
 */
interface Point { x: number; y: number }

/** Further than this (in squares) at any corner, and the board has moved. */
export const BOARD_MOVED_SQUARES = 0.5;

export function boardStillThere(
  saved: readonly Point[], found: readonly Point[] | null, squares: number,
): 'found' | 'moved' | 'unsure' {
  if (!found || found.length !== 4 || saved.length !== 4) return 'unsure';
  let side = 0;
  for (let i = 0; i < 4; i++) side += Math.hypot(saved[(i + 1) % 4].x - saved[i].x, saved[(i + 1) % 4].y - saved[i].y);
  const square = side / 4 / Math.max(1, squares);
  // The detector lists corners from the picture; the saved ones follow the player's turn.
  let best = Infinity;
  for (const order of [found, [...found].reverse()]) {
    for (let k = 0; k < 4; k++) {
      let worst = 0;
      for (let i = 0; i < 4; i++) {
        const f = order[(i + k) % 4];
        worst = Math.max(worst, Math.hypot(f.x - saved[i].x, f.y - saved[i].y));
      }
      best = Math.min(best, worst);
    }
  }
  return best <= BOARD_MOVED_SQUARES * square ? 'found' : 'moved';
}
