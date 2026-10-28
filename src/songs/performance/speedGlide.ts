/**
 * A scene that reaches its speed gradually: linear in BPM, from the speed in force when it
 * comes in to the scene's own, over the scene's glide time. Pure: the screen steps it
 * (GLIDE_STEP_MS) and every step goes through the engine's setBpm, which keeps the beat
 * continuous, so a glide never jumps the beat or restarts the loop.
 */

/** The shortest and longest a scene can take to reach its speed, in seconds. */
export const GLIDE_MIN_SEC = 2;
export const GLIDE_MAX_SEC = 120;
/** What "Gradually" starts at when it is first chosen. */
export const GLIDE_DEFAULT_SEC = 8;
/** How often a glide is stepped: often enough to be heard as smooth. */
export const GLIDE_STEP_MS = 100;

/** The engine's own limits: a glide never asks for a speed outside them. */
const MIN_BPM = 20;
const MAX_BPM = 400;
const bounded = (bpm: number): number => Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));

export interface SpeedGlide {
  from: number;
  to: number;
  /** When it began (performance.now()), and how long it takes; 0 = at once. */
  startMs: number;
  durMs: number;
}

/** A glide from `from` to `to` over `glideSec` (none, or 0: at once), starting at `nowMs`. */
export function startGlide(from: number, to: number, glideSec: number | undefined, nowMs: number): SpeedGlide {
  const sec = typeof glideSec === 'number' && glideSec > 0 ? Math.max(GLIDE_MIN_SEC, Math.min(GLIDE_MAX_SEC, glideSec)) : 0;
  return { from: bounded(from), to: bounded(to), startMs: nowMs, durMs: sec * 1000 };
}

/** The speed `nowMs` into a glide. */
export function glideBpmAt(g: SpeedGlide, nowMs: number): number {
  if (g.durMs <= 0) return g.to;
  const k = Math.max(0, Math.min(1, (nowMs - g.startMs) / g.durMs));
  return k >= 1 ? g.to : g.from + (g.to - g.from) * k;
}

/** The glide has reached its speed. */
export function glideDone(g: SpeedGlide, nowMs: number): boolean {
  return nowMs - g.startMs >= g.durMs;
}
