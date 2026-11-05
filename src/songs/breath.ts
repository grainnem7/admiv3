/**
 * Breathing (sound investigation, S2, fourth part): a kept loop plays the same notes every
 * pass, and the ear hears a machine within half a minute. A player never delivers a figure
 * identically: the second time a touch stronger, the fourth time a note lifted to make a
 * breath before coming round again. This gives the loops that delivery, in a four pass
 * shape, with the amount the owner already sets as Loops vary (0 = exactly as saved):
 *  - pass one as kept, pass two a little louder, pass three the peak, pass four softer;
 *  - on pass four the loop's melody note on the last step rests (and, with a lot of
 *    variation, the one before the middle too), the breath.
 * Only the loops: the player's own notes are the player's. Nothing moves in time. The
 * phase comes from the pass count the whole engine already uses for taking turns, so a
 * scene plays the same however it is reached.
 */

/** The four pass shape as a gain, scaled by the amount (0 to 1). */
export function breathGain(phase: number, amount: number): number {
  const a = Math.max(0, Math.min(1, amount));
  const shape = [1, 1 + 0.08 * a, 1 + 0.14 * a, 1 - 0.1 * a];
  return shape[((Math.floor(phase) % 4) + 4) % 4];
}

/** The phase of the breath for a beat: which of the four passes this is. */
export function breathPhase(lap: number): number {
  return ((Math.floor(lap) % 4) + 4) % 4;
}

/**
 * Whether a loop's melody note rests on this pass: the last step of pass four, from a
 * quarter of variation up; the step before the middle as well, from three quarters up.
 */
export function breathRest(phase: number, col: number, cols: number, amount: number, role: string): boolean {
  if (role !== 'melody' || breathPhase(phase) !== 3 || cols < 2) return false;
  if (amount >= 0.25 && col === cols - 1) return true;
  if (amount >= 0.75 && col === Math.floor(cols / 2) - 1) return true;
  return false;
}
