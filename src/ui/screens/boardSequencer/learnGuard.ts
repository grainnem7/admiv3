/**
 * Confirming the corners also learns the empty board, but only the first time. Re-finding
 * the board mid-session often happens with counters on it, and the board learnt before
 * still fits (it is kept square by square, wherever the board now sits): More → Learn it
 * again is there for a change of light. Never while the board plays.
 */
export function autoLearnAllowed(o: { hasLearnt: boolean; running: boolean }): boolean {
  return !o.hasLearnt && !o.running;
}

/** Learnt means the empty board itself was learnt, not only its colours. */
export function learntSquares(cfg: { boardReference: unknown; boardColours: readonly unknown[] }): number {
  return cfg.boardReference === null ? 0 : cfg.boardColours.length;
}
