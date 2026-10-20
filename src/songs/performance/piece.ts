/**
 * The piece as a whole: its scenes in time order, what is on now and what comes next,
 * a ready-made plan to start from, and the decision the performance clock makes on each
 * tick. Pure, so the timing of a show is tested without a screen, a clock or a sound.
 */

import type { BandLevel } from '../band/band';
import { cuesCrossed, endingDue, scenesDue, type PerformanceSettings } from './clock';
import { LAUNCH_SLOTS, type Scene, type SceneSettings } from './launcher';

/** Scenes that come in at a time first, in time order; untimed ones after, as they were. */
export function sortScenes(scenes: readonly Scene[], current: number | null): { scenes: Scene[]; current: number | null } {
  const order = scenes.map((s, i) => ({ s, i }));
  order.sort((a, b) => {
    const ta = typeof a.s.at === 'number' ? a.s.at : Infinity;
    const tb = typeof b.s.at === 'number' ? b.s.at : Infinity;
    return ta !== tb ? ta - tb : a.i - b.i;
  });
  const cur = current === null ? null : order.findIndex((o) => o.i === current);
  return { scenes: order.map((o) => o.s), current: cur === null || cur < 0 ? null : cur };
}

/** What is wrong with a scene's time, in words, or null when it is fine. */
export function sceneTimeProblem(at: number | null, lengthSec: number, others: readonly (number | null | undefined)[]): string | null {
  if (at === null) return null;
  if (at >= lengthSec) return `After the end of the piece (${Math.floor(lengthSec / 60)}:${String(lengthSec % 60).padStart(2, '0')}).`;
  if (others.some((o) => o === at)) return 'Another scene comes in at the same moment.';
  return null;
}

export interface NowNext {
  /** The scene on now (the last one recalled), if any. */
  now: Scene | null;
  /** The next scene the clock will bring in, and how long until it does. */
  next: { scene: Scene; inSec: number } | null;
}

/** For the Now / Next strip: what is on, what the clock brings next and when. */
export function nowNext(scenes: readonly Scene[], current: number | null, elapsedSec: number | null): NowNext {
  const now = current !== null ? scenes[current] ?? null : null;
  if (elapsedSec === null) return { now, next: null };
  let next: { scene: Scene; inSec: number } | null = null;
  for (const s of scenes) {
    if (typeof s.at !== 'number' || s.at <= elapsedSec) continue;
    if (!next || s.at - elapsedSec < next.inSec) next = { scene: s, inSec: s.at - elapsedSec };
  }
  return { now, next };
}

/** What the performance clock does on one tick. */
export interface ClockDecision {
  /** Cues crossed (seconds left: 60, 30, 10). */
  cues: number[];
  /** The scene to bring in, if one came due (the latest, when several did at once). */
  scene: number | null;
  /** Start the automatic ending now. */
  end: boolean;
}

/**
 * One tick of the performance clock. Scenes don't change the stage while the piece is
 * ending; the automatic ending fires once per run, never in the first seconds, and not
 * again after "Cancel the ending".
 */
export function decideClockTick(input: {
  prev: { remaining: number; elapsed: number };
  now: { remaining: number; elapsed: number };
  scenes: readonly Scene[];
  performance: PerformanceSettings;
  passSec: number;
  ending: boolean;
  autoEnded: boolean;
}): ClockDecision {
  const cues = cuesCrossed(input.prev.remaining, input.now.remaining);
  const due = scenesDue(input.prev.elapsed, input.now.elapsed, input.scenes);
  const scene = due.length > 0 && !input.ending ? due[due.length - 1] : null;
  const end = !input.ending && !input.autoEnded && input.now.elapsed >= 5
    && endingDue(input.performance, input.now.remaining, input.passSec);
  return { cues, scene, end };
}

/** The plan's four sections, in proportion to the piece: 0:00, 1:30, 3:30, 6:00 of 7:00. */
const PLAN: { name: string; at: number; band: BandLevel; fill: number; evolve: number; loops: 'first' | 'firstThree' | 'none' }[] = [
  { name: 'Arrival', at: 0, band: 'gentle', fill: 0, evolve: 0, loops: 'first' },
  { name: 'Build', at: 90 / 420, band: 'gentle', fill: 0.3, evolve: 0, loops: 'firstThree' },
  { name: 'Open', at: 210 / 420, band: 'full', fill: 0.4, evolve: 0.5, loops: 'none' },
  { name: 'Home', at: 360 / 420, band: 'off', fill: 0, evolve: 0, loops: 'first' },
];

/**
 * "Make my plan": four scenes — Arrival, Build, Open, Home — placed in proportion to the
 * piece's length, using the loops that have been saved (the first for the opening and
 * the return, the first three for the build). The sound world, phrases and tempo are the
 * ones set now, so the piece sounds like one instrument throughout.
 */
export function planScenes(
  lengthSec: number, loopSlots: readonly (readonly unknown[] | null)[], base: SceneSettings, idPrefix = `p${Date.now().toString(36)}`,
): Scene[] {
  const saved = Array.from({ length: LAUNCH_SLOTS }, (_, i) => i).filter((i) => (loopSlots[i]?.length ?? 0) > 0);
  const pick = (which: 'first' | 'firstThree' | 'none'): number[] =>
    which === 'none' ? [] : which === 'first' ? saved.slice(0, 1) : saved.slice(0, 3);
  return PLAN.map((p, i) => ({
    id: `${idPrefix}-${i}`,
    name: p.name,
    at: Math.round(p.at * lengthSec),
    loops: pick(p.loops),
    settings: { ...base, band: p.band, fillAmount: p.fill, evolveAmount: p.evolve },
  }));
}
