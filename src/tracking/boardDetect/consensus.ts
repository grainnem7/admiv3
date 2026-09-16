/**
 * Agreement across a burst of frames.
 *
 * One frame can be lucky — a shadow, a blink of autofocus, a hand just leaving. Several
 * frames agreeing on the same corners is evidence in its own right, and it is also the
 * cheapest proof that the board was actually still while we looked at it. A single
 * detection that nothing else backs up is capped at "not sure", so the player is asked
 * to check rather than being handed a confident wrong answer.
 */
import type { BoardDetection } from './detectBoard';

/** Corners must agree within this fraction of a square to count as the same answer. */
export const AGREE_SQUARES = 0.2;
/** How many frames must agree before the result is trusted. */
export const AGREE_COUNT = 3;

export function consensus(detections: readonly BoardDetection[]): BoardDetection {
  const usable = detections.filter((d) => d.corners && (d.status === 'high' || d.status === 'low'));
  if (usable.length === 0) {
    // A "partial" used to skip the agreement rule entirely: the FIRST one found was
    // returned, from a single frame, corners and all — so a chequered floor or a keyboard
    // with no board in shot pre-loaded the corner editor with four handles of nonsense.
    const partials = detections.filter((d) => d.status === 'partial');
    const backed = partials.find((cand) => partials.filter((o) => agrees(cand, o)).length >= AGREE_COUNT);
    if (backed) return backed;
    // Keep what it has to say — "move the camera back" is useful — but not the corners.
    if (partials.length > 0) return { ...partials[0], corners: undefined };
    return detections[detections.length - 1] ?? {
      status: 'none',
      metrics: { coverage: 0, margin: 0, rms: 0, nodes: 0, ms: 0 },
      reasons: ['Couldn’t find the board.'],
    };
  }

  let best = usable[0];
  let bestAgreement = 0;
  for (const cand of usable) {
    const agreement = usable.filter((other) => agrees(cand, other)).length;
    const better = agreement > bestAgreement
      || (agreement === bestAgreement && cand.metrics.coverage > best.metrics.coverage);
    if (better) { best = cand; bestAgreement = agreement; }
  }

  if (bestAgreement >= AGREE_COUNT && best.status === 'high') return best;
  // Not enough frames agreed: keep the answer, drop the confidence.
  return {
    ...best,
    status: 'low',
    reasons: bestAgreement >= AGREE_COUNT
      ? best.reasons
      : ['I’m not sure this is right. Check the corners sit on the outside corners of the squares.'],
  };
}

function agrees(a: BoardDetection, b: BoardDetection): boolean {
  if (!a.corners || !b.corners || a.squares !== b.squares) return false;
  // "Within a fifth of a square" in frame fractions: a square is 1/squares of the board,
  // and the board's own width in the frame is the distance across its corners.
  const boardWidth = Math.hypot(
    a.corners[1].x - a.corners[0].x, a.corners[1].y - a.corners[0].y,
  );
  const tolerance = (boardWidth / (a.squares ?? 8)) * AGREE_SQUARES;
  return a.corners.every((p, i) => Math.hypot(p.x - b.corners![i].x, p.y - b.corners![i].y) <= tolerance);
}
