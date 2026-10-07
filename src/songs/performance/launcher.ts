/**
 * Launching for a performance: loops and scenes prepared beforehand, brought in with one
 * tap, on time.
 *
 * The loop bank's pads need a counter on a pad for a loop to play. Here a saved loop can
 * be launched from the laptop or the iPad with nothing on the board, and it starts — or
 * stops — at the next pass, so a tap a little early or late lands exactly on the loop.
 * A scene is a named set of loops plus the sound settings that go with them, recalled in
 * one go; "Next scene" walks a set list. Pure: the engine does the timing, the screen the
 * storage.
 */

import type { BandLevel } from '../band/band';
import type { SoundWorldChoice } from '../../audio/worlds/soundWorlds';

/** How many loops the iPad and the scenes can launch. */
export const LAUNCH_SLOTS = 8;

export type LoopSlotState = 'empty' | 'stopped' | 'playing' | 'starting' | 'stopping';

/**
 * What a slot is doing, from what the player wants (`wanted`) and what the engine has
 * applied (`applied`): the two differ for up to one pass, which is the "starting" and
 * "stopping" the pads show.
 */
export function slotState(
  slot: number, hasLoop: boolean, wanted: ReadonlySet<number>, applied: ReadonlySet<number>,
): LoopSlotState {
  if (!hasLoop) return 'empty';
  const w = wanted.has(slot);
  const a = applied.has(slot);
  if (w && a) return 'playing';
  if (w && !a) return 'starting';
  if (!w && a) return 'stopping';
  return 'stopped';
}

/** The slots after toggling one; a slot with no loop cannot be wanted. */
export function toggleSlot(wanted: ReadonlySet<number>, slot: number, hasLoop: boolean): Set<number> {
  const next = new Set(wanted);
  if (next.has(slot)) next.delete(slot);
  else if (hasLoop) next.add(slot);
  return next;
}

/** The settings a scene carries: the ones that change the sound and the feel. */
export interface SceneSettings {
  soundWorld: SoundWorldChoice;
  band: BandLevel;
  phrases: boolean;
  fillAmount: number;
  evolveAmount: number;
  bpm: number;
}
export const SCENE_SETTING_KEYS: (keyof SceneSettings)[] = ['soundWorld', 'band', 'phrases', 'fillAmount', 'evolveAmount', 'bpm'];

export interface Scene {
  id: string;
  name: string;
  /** Slots playing in this scene. */
  loops: number[];
  settings: SceneSettings;
}

export const MAX_SCENES = 12;
const MAX_NAME = 24;

/** A scene from how things are now. */
export function sceneFromNow(name: string, wanted: ReadonlySet<number>, settings: SceneSettings, id = `s${Date.now().toString(36)}`): Scene {
  return {
    id,
    name: cleanName(name) || `Scene`,
    loops: [...wanted].filter((s) => s >= 0 && s < LAUNCH_SLOTS).sort((a, b) => a - b),
    settings: { ...settings },
  };
}

/** The scene after this one in the set list, wrapping; null when there are none. */
export function nextSceneIndex(current: number | null, count: number): number | null {
  if (count <= 0) return null;
  if (current === null || current < 0 || current >= count) return 0;
  return (current + 1) % count;
}

export function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const unit = (v: unknown, d: number): number => (isNum(v) ? Math.max(0, Math.min(1, v)) : d);
const WORLDS = new Set(['none', 'warm', 'lofi', 'ambient', 'electronic']);

export function sanitizeSceneSettings(v: unknown, d: SceneSettings): SceneSettings {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    soundWorld: typeof o.soundWorld === 'string' && WORLDS.has(o.soundWorld) ? (o.soundWorld as SoundWorldChoice) : d.soundWorld,
    band: o.band === 'gentle' || o.band === 'full' || o.band === 'off' ? o.band : d.band,
    phrases: typeof o.phrases === 'boolean' ? o.phrases : d.phrases,
    fillAmount: unit(o.fillAmount, d.fillAmount),
    evolveAmount: unit(o.evolveAmount, d.evolveAmount),
    bpm: isNum(o.bpm) ? Math.max(20, Math.min(400, Math.round(o.bpm))) : d.bpm,
  };
}

/** Stored scenes made safe: a bad one is dropped, never half-kept. */
export function sanitizeScenes(v: unknown, defaults: SceneSettings): Scene[] {
  if (!Array.isArray(v)) return [];
  const out: Scene[] = [];
  const ids = new Set<string>();
  for (const raw of v.slice(0, MAX_SCENES)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' && o.id.length > 0 && o.id.length < 40 ? o.id : `s${out.length}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const loops = Array.isArray(o.loops)
      ? [...new Set(o.loops.filter((s): s is number => isNum(s) && Number.isInteger(s) && s >= 0 && s < LAUNCH_SLOTS))].sort((a, b) => a - b)
      : [];
    out.push({ id, name: cleanName(o.name) || `Scene ${out.length + 1}`, loops, settings: sanitizeSceneSettings(o.settings, defaults) });
  }
  return out;
}

/** Stored loop names made safe, one per launch slot. */
export function sanitizeLoopNames(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : [];
  return Array.from({ length: LAUNCH_SLOTS }, (_, i) => cleanName(arr[i]) || '');
}

/** What a slot is called on a pad: its name, or its number. */
export function loopLabel(names: readonly string[], slot: number): string {
  return names[slot] && names[slot].length > 0 ? names[slot] : `Loop ${slot + 1}`;
}
