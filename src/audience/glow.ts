/**
 * The audience screen as glowing lights (owner, 7 Nov 2026: the counters still shown, but more
 * abstract and interesting; no timer, no words). The numbers behind the picture, pure:
 *
 * - each counter is a soft light that wanders a little round its square and breathes, each in
 *   its own time, so the board never reads as a grid;
 * - each note sends a few rings out across the dark, one after another, like rain on water:
 *   calm music, a few; busy music, many, overlapping.
 *
 * A viewer's "reduce motion" keeps the lights still and sends no rings. The rings are faint and
 * thin (never a flash); the blooms keep their own flash limit (light.ts).
 */

/** The rain: how long a note's rings last, how many, how far apart they start, how far they reach (in squares), how bright. */
export const RAIN = { seconds: 3.2, rings: 3, gapSec: 0.4, reachCells: 3.6, alpha: 0.32 } as const;

/** How far a light wanders from its square's middle, in squares. */
const DRIFT_CELLS = 0.08;

/** A square's own numbers, the same every time: its wandering and breathing differ from its neighbours'. */
function seedOf(row: number, col: number): number {
  const s = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Where a light is, off its square's middle, at time `t` (seconds): a slow wander. */
export function drift(row: number, col: number, t: number, reduced: boolean): { dx: number; dy: number } {
  if (reduced) return { dx: 0, dy: 0 };
  const s = seedOf(row, col);
  // Periods of about 9 to 17 seconds, never in step.
  const fx = (2 * Math.PI) / (9 + 8 * s);
  const fy = (2 * Math.PI) / (11 + 6 * ((s * 7.13) % 1));
  return {
    dx: DRIFT_CELLS * Math.sin(fx * t + s * 6.283),
    dy: DRIFT_CELLS * Math.sin(fy * t + s * 3.7),
  };
}

/** How bright a light is at rest, 0.8 to 1: a slow breath, each its own. */
export function breath(row: number, col: number, t: number, reduced: boolean): number {
  if (reduced) return 1;
  const s = seedOf(row, col);
  const period = 6 + 4 * s;
  return 0.9 + 0.1 * Math.sin((2 * Math.PI * t) / period + s * 6.283);
}

/** A note's rings `age` seconds after it sounded: each its radius (in squares) and brightness. */
export function rainRings(age: number, reduced: boolean): { r: number; alpha: number }[] {
  if (reduced || age < 0 || age > RAIN.seconds) return [];
  const out: { r: number; alpha: number }[] = [];
  for (let i = 0; i < RAIN.rings; i++) {
    const start = i * RAIN.gapSec;
    if (age < start) break;
    const life = RAIN.seconds - start;
    const u = Math.min(1, (age - start) / life);
    const spread = 1 - (1 - u) ** 2.2;
    out.push({ r: 0.35 + (RAIN.reachCells - 0.35) * spread, alpha: RAIN.alpha * (1 - u) ** 1.6 * (1 - 0.25 * i) });
  }
  return out;
}
