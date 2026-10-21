/**
 * Says plainly when the instrument is adding nothing of its own: with Extra notes and
 * Sounds change both at 0, plain Play only plays the counters (scenes may turn them up
 * during a piece, and then the line goes). Null when either is on.
 */
export function aiOffLine(fillAmount: number, evolveAmount: number): string | null {
  if (fillAmount > 0 || evolveAmount > 0) return null;
  return 'AI: Extra notes off · Sounds change off. Turn them up on the Sound tab.';
}
