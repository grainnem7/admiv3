/**
 * "Time to press again" (audit A7): how long the first press of Stop, Exit or Set up waits
 * for its second, while the piece plays. Saved per player. Undo and the notices take their
 * length from it, so a player who needs longer for one gets longer for the others.
 *
 * Pure, so the screen, the saved settings and the tests share one set of numbers.
 */

/** The choices, in seconds. */
export const PRESS_AGAIN_CHOICES = [3, 4, 6, 10] as const;
export type PressAgainSec = (typeof PRESS_AGAIN_CHOICES)[number];

/** Today's behaviour: what a player saved before this setting existed gets. */
export const DEFAULT_PRESS_AGAIN_SEC: PressAgainSec = 4;

/** A stored value that is one of the choices, else the default. */
export function sanitizePressAgainSec(v: unknown): PressAgainSec {
  return PRESS_AGAIN_CHOICES.find((c) => c === v) ?? DEFAULT_PRESS_AGAIN_SEC;
}

export const pressAgainMs = (sec: number): number => sec * 1000;

/** The least Undo stays on offer (what it has always been). */
const UNDO_MIN_MS = 15_000;

/** How long Undo stays on offer: 15 s, or four times the press-again time when that is longer. */
export const undoMs = (pressAgainSec: number): number => Math.max(UNDO_MIN_MS, pressAgainSec * 4 * 1000);

/** A notice stays at least this long. */
export const NOTICE_MIN_MS = 5000;

/** How long a notice asked to stay for `ms` does: never less than NOTICE_MIN_MS. */
export const noticeMs = (ms: number): number => Math.max(NOTICE_MIN_MS, ms);
