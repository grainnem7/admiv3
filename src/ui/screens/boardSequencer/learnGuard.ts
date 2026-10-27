/**
 * Confirming the corners also learns the empty board. Re-finding the board mid-session
 * can happen with counters on it, so a board already learnt is only replaced when this
 * one looks empty: the same share of odd-looking squares the Learn button warns about.
 */
export const AUTO_LEARN_MAX_COVERED = 0.12;

export function autoLearnAllowed(coveredSquares: number, totalSquares: number, hasLearnt: boolean): boolean {
  if (!hasLearnt) return true;
  return coveredSquares <= totalSquares * AUTO_LEARN_MAX_COVERED;
}
