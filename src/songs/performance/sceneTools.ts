/**
 * Small, pure tools for the Scenes step (producer flow, item 7): a scene's length, a copy
 * of a scene, and the time a dragged scene mark lands on.
 */
import { MAX_SCENES, type Scene } from './launcher';

/** How long a scene lasts: until the next scene with a time, or the end of the piece. Null for a scene brought in by hand. */
export function sceneLengthSec(scenes: readonly Scene[], i: number, lengthSec: number): number | null {
  const s = scenes[i];
  if (!s || typeof s.at !== 'number') return null;
  const next = scenes.slice(i + 1).map((x) => x.at).find((at): at is number => typeof at === 'number');
  return Math.max(0, (next ?? lengthSec) - s.at);
}

/**
 * A copy of scene `i`, placed right after it with no time of its own (the owner gives it
 * one), named after the original. Its own ideas and Magenta's kept ideas are not copied:
 * a copy that played exactly the same would be the same scene twice. Null when the piece
 * is full.
 */
export function duplicateScene(scenes: readonly Scene[], i: number, id: string): Scene[] | null {
  const s = scenes[i];
  if (!s || scenes.length >= MAX_SCENES) return null;
  const { ideas: _ideas, aiIdeas: _ai, ...rest } = s;
  const copy: Scene = { ...rest, id, name: copyName(s.name, scenes.map((x) => x.name)), at: null, loops: [...s.loops], settings: { ...s.settings } };
  return [...scenes.slice(0, i + 1), copy, ...scenes.slice(i + 1)];
}

/** "Build" → "Build 2", then "Build 3", never a name already in the list, never over 24 letters. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\s\d+$/, '').trim() || 'Scene';
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} ${n}`.slice(0, 24);
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base} 2`.slice(0, 24);
}

/** Dragged marks snap to this many seconds. */
export const DRAG_SNAP_SEC = 5;

/**
 * The time a scene's mark lands on when dragged to `x` of a timeline `width` px wide:
 * snapped to 5 s, and kept between the scene before and the scene after (a scene never
 * jumps over another). The first scene stays at 0:00.
 */
export function dragTime(x: number, width: number, lengthSec: number, prevAt: number | null, nextAt: number | null): number {
  if (width <= 0) return prevAt ?? 0;
  const raw = (Math.max(0, Math.min(width, x)) / width) * lengthSec;
  const snapped = Math.round(raw / DRAG_SNAP_SEC) * DRAG_SNAP_SEC;
  const low = prevAt === null ? 0 : prevAt + DRAG_SNAP_SEC;
  const high = (nextAt === null ? lengthSec : nextAt) - DRAG_SNAP_SEC;
  if (prevAt === null) return 0;
  return Math.max(low, Math.min(Math.max(low, high), snapped));
}
