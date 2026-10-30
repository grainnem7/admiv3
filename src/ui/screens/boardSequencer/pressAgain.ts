/**
 * The times a press waits on (audit A7): how long the first press of Stop, Exit or Set up
 * waits for its second, how long Undo stays, and the least a notice stays. One setting,
 * "Time to press again", saved per player; a player saved before it existed gets 4 s.
 * Pure, so the screen and its tests share the numbers.
 */

/** The choices for "Time to press again", in seconds. */
export const PRESS_AGAIN_CHOICES = [3, 4, 6, 10] as const;
export type PressAgainSec = (typeof PRESS_AGAIN_CHOICES)[number];
/** What every player had before the setting existed. */
export const DEFAULT_PRESS_AGAIN_SEC: PressAgainSec = 4;

/** A saved value that is one of the choices; anything else (or nothing) is today's 4 s. */
export function sanitizePressAgainSec(v: unknown): PressAgainSec {
  return (PRESS_AGAIN_CHOICES as readonly unknown[]).includes(v) ? (v as PressAgainSec) : DEFAULT_PRESS_AGAIN_SEC;
}

/** How long the first press waits for the second, in ms. */
export const pressAgainMs = (sec: number): number => sec * 1000;

/** Undo's shortest stay, whatever the press-again time. */
export const UNDO_MIN_MS = 15_000;
/** How long Undo stays: 15 s, or four times the press-again time when that is longer. */
export const undoMs = (sec: number): number => Math.max(UNDO_MIN_MS, pressAgainMs(sec) * 4);

/** The least a notice stays on screen, so it can be read at any pace. */
export const NOTICE_MIN_MS = 5_000;
/** How long a notice asked to stay `ms` stays: never under NOTICE_MIN_MS. */
export const noticeMs = (ms: number): number => Math.max(NOTICE_MIN_MS, ms);
