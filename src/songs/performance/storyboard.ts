/**
 * The storyboard (Keep design, 5 Nov 2026, K2): the piece as a row of scene cards, left to
 * right in time order, each showing what plays in it. The pure parts: the cards from the
 * scenes, a time for every scene, a scene's length edited with the later ones moving, the
 * arrow keys over the row, and the words on a card.
 */

import { formatClock, MAX_PIECE_SEC, pieceLengthProblem } from './clock';
import type { Scene, WayIn } from './launcher';
import { nextSceneTime, SCENE_TIME_STEP_SEC } from './piece';
import { sceneLengthSec } from './sceneTools';
import type { SceneEnergy } from './energy';
import { ENERGY_NAMES } from '../../ui/screens/boardSequencer/words';

export interface SceneCard {
  /** The scene's place in the list (0-based), as the editor and the screen know it. */
  index: number;
  id: string;
  name: string;
  /** Null for a scene with no time (no room was left for it): it has a card, so it can be opened and deleted. */
  at: number | null;
  lengthSec: number;
  loops: number[];
  energy: SceneEnergy;
  /** The scene on now. */
  current: boolean;
}

/** One card per scene: the timed ones in time order (the list is kept sorted), then any with no time. */
export function sceneCards(scenes: readonly Scene[], lengthSec: number, currentScene: number | null): SceneCard[] {
  const card = (s: Scene, i: number): SceneCard => ({
    index: i, id: s.id, name: s.name, at: typeof s.at === 'number' ? s.at : null,
    lengthSec: typeof s.at === 'number' ? sceneLengthSec(scenes, i, lengthSec) ?? 0 : 0,
    loops: [...s.loops], energy: s.settings.sceneEnergy, current: currentScene === i,
  });
  const timed: SceneCard[] = [];
  const untimed: SceneCard[] = [];
  scenes.forEach((s, i) => (typeof s.at === 'number' ? timed : untimed).push(card(s, i)));
  return [...timed, ...untimed];
}

/** The earliest timed scene at 0:00 (a deleted first scene, or an older piece that began later): the piece always has an opening scene. */
export function withFirstAtZero(scenes: readonly Scene[]): Scene[] {
  const first = scenes.reduce<number>((best, s, i) => (typeof s.at === 'number' && (best < 0 || (s.at as number) < (scenes[best].at as number)) ? i : best), -1);
  if (first < 0 || scenes[first].at === 0) return [...scenes];
  return scenes.map((s, i) => (i === first ? { ...s, at: 0 } : s));
}

/** "Scene N" for the next scene: one more than there are, and never a name a scene already has (after a delete). */
export function freeSceneName(scenes: readonly Pick<Scene, 'name'>[]): string {
  const taken = new Set(scenes.map((s) => s.name));
  for (let n = scenes.length + 1; ; n++) if (!taken.has(`Scene ${n}`)) return `Scene ${n}`;
}

/**
 * Every scene has a time (K2): one saved without one is given the next free time after the
 * last, by the same gap as before (see nextSceneTime). With no room left it stays as it is,
 * out of the clock, last in the list, and Check says so. Timed scenes keep their order.
 */
export function giveTimes(scenes: readonly Scene[], lengthSec: number): Scene[] {
  // An older piece whose first scene starts later is left as it was made: moving it to 0:00
  // would change the piece behind the owner's back. The editor offers the move instead.
  const timed = scenes.filter((s) => typeof s.at === 'number').sort((a, b) => (a.at as number) - (b.at as number));
  const untimed: Scene[] = [];
  for (const s of scenes) {
    if (typeof s.at === 'number') continue;
    const at = nextSceneTime(timed, lengthSec, null);
    if (at === null) { untimed.push(s); continue; }
    const given = { ...s, at };
    timed.push(given);
    timed.sort((a, b) => (a.at as number) - (b.at as number));
  }
  return [...timed, ...untimed];
}

const snap = (sec: number): number => Math.round(sec / SCENE_TIME_STEP_SEC) * SCENE_TIME_STEP_SEC;

export interface LengthEdit {
  scenes: Scene[];
  lengthSec: number;
  /** What else moved, in words, or null. */
  said: string | null;
}

/**
 * Scene `i` made `newLengthSec` long: snapped to 5 s and at least a pass. The later scenes
 * move by the difference, each keeping at least a pass and the last ending a pass before the
 * end, so none is pushed past the end and none share a time; when the room runs out the
 * length is capped and the last scene's new length is said. For the last scene the piece's
 * own length follows, within its limits; past them nothing changes and the problem is said.
 */
export function withLength(scenes: readonly Scene[], i: number, newLengthSec: number, pieceLengthSec: number, minSec: number): LengthEdit {
  const s = scenes[i];
  if (!s || typeof s.at !== 'number') return { scenes: [...scenes], lengthSec: pieceLengthSec, said: null };
  const at0 = s.at;
  const later = scenes.map((_, k) => k).filter((k) => k > i && typeof scenes[k].at === 'number');
  if (later.length === 0) {
    const end = at0 + Math.max(minSec, snap(newLengthSec));
    const problem = pieceLengthProblem(end);
    if (problem) return { scenes: [...scenes], lengthSec: pieceLengthSec, said: problem };
    return { scenes: [...scenes], lengthSec: Math.min(MAX_PIECE_SEC, end), said: null };
  }
  // The room: the later scenes need a pass each, and the last ends a pass before the end.
  const room = pieceLengthSec - later.length * minSec - at0;
  const wanted = Math.min(Math.max(minSec, snap(newLengthSec)), Math.max(minSec, room));
  const capped = wanted < Math.max(minSec, snap(newLengthSec));
  const was = sceneLengthSec(scenes, i, pieceLengthSec) ?? 0;
  const delta = wanted - was;
  let prev = at0 + wanted;
  let moved = false;
  const out = [...scenes];
  later.forEach((k, n) => {
    const x = scenes[k];
    const cap = pieceLengthSec - (later.length - n) * minSec;
    let at = Math.min((x.at as number) + delta, cap);
    if (at < prev) at = prev;
    if (at !== (x.at as number) + delta) moved = true;
    prev = at;
    out[k] = { ...x, at };
  });
  const last = out[later[later.length - 1]];
  const said = capped || moved ? `${last.name} is now ${formatClock(sceneLengthSec(out, later[later.length - 1], pieceLengthSec) ?? 0)} long` : null;
  return { scenes: out, lengthSec: pieceLengthSec, said };
}

/** The way into a scene in a word or two, for the join between cards (K3). */
export function joinWords(w: WayIn): string {
  return w.kind === 'cut' ? 'cut' : `${w.kind} ${w.passes}`;
}

/** What the engine does with a way in: how many steps the fade takes, and how many the leaving loops are held for. */
export function waySteps(w: WayIn, stepsPerPass: number): { fadeSteps: number; holdOutSteps: number } {
  const steps = Math.max(1, Math.round(stepsPerPass));
  if (w.kind === 'fade') return { fadeSteps: w.passes * steps, holdOutSteps: 0 };
  if (w.kind === 'overlap') return { fadeSteps: 0, holdOutSteps: w.passes * steps };
  return { fadeSteps: 0, holdOutSteps: 0 };
}

/** The card the arrow keys land on, from card `i` of `count`; null for any other key. */
export function moveCard(i: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight': return Math.min(count - 1, i + 1);
    case 'ArrowLeft': return Math.max(0, i - 1);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** The words under a card's name: its energy (unless off), the world, then anything else it changes. */
export function cardWords(card: Pick<SceneCard, 'energy'>, worldLabel: string, extra: readonly string[]): string {
  const energy = card.energy > 0 ? [ENERGY_NAMES[card.energy]] : [];
  return [...energy, worldLabel, ...extra].filter((w) => w.length > 0).join(' · ');
}
