/**
 * The piece as a whole: its scenes in time order, what is on now and what comes next,
 * a ready-made plan to start from, and the decision the performance clock makes on each
 * tick. Pure, so the timing of a show is tested without a screen, a clock or a sound.
 */

import type { BandLevel } from '../band/band';
import { cuesCrossed, endingDue, endingLeadSec, scenesDue, type PerformanceSettings } from './clock';
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

/** The scene on at `sec` into the piece: the latest one timed at or before it (-1 = none). */
export function sceneAt(scenes: readonly Scene[], sec: number): number {
  let best = -1;
  scenes.forEach((s, i) => {
    if (typeof s.at === 'number' && s.at <= sec && (best < 0 || (scenes[best].at as number) <= s.at)) best = i;
  });
  return best;
}

/**
 * The scene a piece opens in when its clock starts at `startSec`: the one the plan has on
 * then, or — carrying on after a reload — the scene that was on, when it is later than
 * the plan's (a Next taken before the reload is kept). null = none: Now reads "no scene"
 * and the first timed scene comes in at its time. Every start takes "on now" from here,
 * never from before: a scene left on by an earlier jump made the clock skip every scene
 * up to it (R2-T2-01).
 */
export function openingScene(scenes: readonly Scene[], startSec: number, remembered: number | null = null): number | null {
  const planned = sceneAt(scenes, startSec);
  const carried = remembered !== null && remembered >= 0 && remembered < scenes.length ? remembered : -1;
  const i = Math.max(planned, carried);
  return i >= 0 ? i : null;
}

/**
 * A scene added to the list, kept in time order. The scene on now stays the one on now:
 * adding a scene never marks it, or the clock skipped every scene before it (R2-T2-01).
 */
export function withSceneAdded(scenes: readonly Scene[], current: number | null, scene: Scene): { scenes: Scene[]; current: number | null } {
  return sortScenes([...scenes, scene], current);
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

/**
 * Scenes are in time order, so only those after the one on now can still come in: one
 * brought in early by hand (Next ▶) must not come back at its time, nor an earlier one
 * pull the piece backwards.
 */
const comesLater = (i: number, current: number | null | undefined): boolean => current === null || current === undefined || i > current;

/** For the Now / Next strip: what is on, what the clock brings next and when. */
export function nowNext(scenes: readonly Scene[], current: number | null, elapsedSec: number | null): NowNext {
  const now = current !== null ? scenes[current] ?? null : null;
  if (elapsedSec === null) return { now, next: null };
  let next: { scene: Scene; inSec: number } | null = null;
  for (const [i, s] of scenes.entries()) {
    if (typeof s.at !== 'number' || s.at <= elapsedSec || !comesLater(i, current)) continue;
    if (!next || s.at - elapsedSec < next.inSec) next = { scene: s, inSec: s.at - elapsedSec };
  }
  return { now, next };
}

/**
 * How long before the end time the backstop begins: its fade (0.8 s) and stop (0.9 s) fit
 * inside it, so the piece is silent by its length.
 */
export const HARD_STOP_LEAD_SEC = 1;

/** What the performance clock does on one tick. */
export interface ClockDecision {
  /** Cues crossed (seconds left: 60, 30, 10). */
  cues: number[];
  /** The scene to bring in, if one came due (the latest, when several did at once). */
  scene: number | null;
  /** Start the automatic ending now. */
  end: boolean;
  /** The end time has been reached: whatever is still sounding fades out at once. */
  hardStop: boolean;
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
  /** The scene on now: only scenes after it can come in. */
  current?: number | null;
  performance: PerformanceSettings;
  passSec: number;
  ending: boolean;
  autoEnded: boolean;
}): ClockDecision {
  const cues = cuesCrossed(input.prev.remaining, input.now.remaining);
  const due = scenesDue(input.prev.elapsed, input.now.elapsed, input.scenes).filter((i) => comesLater(i, input.current));
  const scene = due.length > 0 && !input.ending ? due[due.length - 1] : null;
  const end = !input.ending && !input.autoEnded && input.now.elapsed >= 5
    && endingDue(input.performance, input.now.remaining, input.passSec);
  // The backstop: at the end time nothing may still be playing — an ending cancelled, a
  // tempo slowed after the ending was timed, End pressed too late. It starts a moment
  // before the end, so its own short fade and stop are over by the end time too (in
  // Ableton as well as in ADMI).
  const hardStop = input.now.elapsed >= 5 && input.now.remaining <= HARD_STOP_LEAD_SEC;
  return { cues, scene, end, hardStop };
}

/**
 * How long before the end the ending begins (endingLeadSec), at the slowest tempo the piece
 * can be at: the player's own or any scene's (`bpms`), never below the 20 BPM the clock
 * counts with. After a reload, Carry on is offered only while the ending is further off
 * than this: taken at a faster tempo, it could be offered into the ending itself.
 */
export function pieceEndingLeadSec(performance: PerformanceSettings, beatsPerPass: number, bpms: readonly number[]): number {
  const slowest = Math.max(20, Math.min(...bpms));
  return endingLeadSec(performance, (beatsPerPass * 60) / slowest);
}

/** The plan's four sections, in proportion to the piece: 0:00, 1:30, 3:30, 6:00 of 7:00. */
const PLAN: { name: string; at: number; band: BandLevel; fill: number; evolve: number; loops: 1 | 2 | 3 }[] = [
  { name: 'Arrival', at: 0, band: 'gentle', fill: 0, evolve: 0, loops: 1 },
  { name: 'Build', at: 90 / 420, band: 'gentle', fill: 0.3, evolve: 0, loops: 3 },
  { name: 'Open', at: 210 / 420, band: 'full', fill: 0.4, evolve: 0.5, loops: 2 },
  { name: 'Home', at: 360 / 420, band: 'off', fill: 0, evolve: 0, loops: 1 },
];

/**
 * "Make my plan": four scenes — Arrival, Build, Open, Home — placed in proportion to the
 * piece's length, using the loops that have been saved (the first for the opening and
 * the return, the first three for the build, the first two for Open). No scene is left
 * without loops while one is saved: the band and Extra notes only play while a counter
 * is down, so a scene with none was minutes of silence. The sound world, phrases and
 * tempo are the ones set now, so the piece sounds like one instrument throughout.
 */
export function planScenes(
  lengthSec: number, loopSlots: readonly (readonly unknown[] | null)[], base: SceneSettings, idPrefix = `p${Date.now().toString(36)}`,
): Scene[] {
  const saved = Array.from({ length: LAUNCH_SLOTS }, (_, i) => i).filter((i) => (loopSlots[i]?.length ?? 0) > 0);
  const pick = (n: number): number[] => saved.slice(0, n);
  return PLAN.map((p, i) => ({
    id: `${idPrefix}-${i}`,
    name: p.name,
    at: Math.round(p.at * lengthSec),
    loops: pick(p.loops),
    settings: { ...base, band: p.band, fillAmount: p.fill, evolveAmount: p.evolve },
  }));
}

/**
 * A scene with a change made to it. An emptied time makes it "by hand" only. Marking it
 * to play alone takes its loops out; giving it a loop again, or unticking it, ends that.
 */
export function editedScene(scene: Scene, patch: Partial<Scene>): Scene {
  const { at, alone, ...rest } = { ...scene, ...patch };
  const isAlone = patch.alone === true || (alone === true && patch.alone !== false && rest.loops.length === 0);
  return {
    ...rest,
    ...(typeof at === 'number' ? { at } : {}),
    ...(isAlone ? { alone: true, loops: [] } : {}),
  };
}

/** The scenes with one loop taken out of every scene that uses it (an empty loop, say). */
export function takeLoopOut(scenes: readonly Scene[], slot: number): Scene[] {
  return scenes.map((s) => (s.loops.includes(slot) ? { ...s, loops: s.loops.filter((x) => x !== slot) } : s));
}

/**
 * Undo of a clear: the loop goes back into the scenes that had it (by id), once each. A
 * scene marked to play alone since then has a loop again, so it no longer is.
 */
export function putLoopBack(scenes: readonly Scene[], slot: number, sceneIds: readonly string[]): Scene[] {
  return scenes.map((s) => (sceneIds.includes(s.id) && !s.loops.includes(slot)
    ? editedScene(s, { loops: [...s.loops, slot].sort((a, b) => a - b) })
    : s));
}

