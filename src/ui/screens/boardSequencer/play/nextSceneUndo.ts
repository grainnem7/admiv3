/**
 * Next scene's Undo (audit 2026-10-30, B13): Next scene changes the scene at one press, so
 * for one pass afterwards "↶ Back to <scene>" returns to the scene before. Pure: the screen
 * keeps the offer and asks whether it still stands.
 */

/** The shortest time the offer stays, whatever the pass: long enough to see it and press. */
export const NEXT_UNDO_MIN_MS = 3_000;

export interface NextSceneUndo {
  /** The scene to go back to. */
  backTo: number;
  name: string;
  /** The scene Next brought in: the offer stands only while it is on. */
  from: number;
  untilMs: number;
}

/** The offer after Next scene went from `prev` to `next`, or null when there is nothing to go back to. */
export function nextSceneUndo(
  prev: number | null, next: number | null, scenes: readonly { name: string }[], nowMs: number, passMs: number,
): NextSceneUndo | null {
  if (prev === null || next === null || prev === next) return null;
  const scene = scenes[prev];
  if (!scene) return null;
  return { backTo: prev, name: scene.name, from: next, untilMs: nowMs + Math.max(NEXT_UNDO_MIN_MS, passMs) };
}

/** Whether the offer still stands: within its pass, and the scene Next brought in still on. */
export function nextUndoOffered(u: NextSceneUndo | null, nowMs: number, currentScene: number | null): boolean {
  return u !== null && nowMs < u.untilMs && currentScene === u.from;
}
