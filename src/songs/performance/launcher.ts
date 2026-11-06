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
import { GLIDE_MAX_SEC, GLIDE_MIN_SEC } from './speedGlide';
import { sanitizeChords, type ChordSetting } from '../harmony/currentChord';
import { sanitizeBandJobs, sanitizeLeadIn, type BandJobs, type LeadIn } from '../band/bandJobs';
import { sanitizeSceneEnergy, type SceneEnergy } from './energy';
import { sanitizeIdeas, sanitizeKeptIdeas, type KeptIdea } from './ideas';
import { sanitizeSongSection, type SongSectionSpec } from '../song/songSection';

/** How many loops the iPad and the scenes can launch. */
export const LAUNCH_SLOTS = 16;
/** The rail shows its places in columns of this many, so it is never taller than eight. */
export const RAIL_COLUMN = 8;

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
  /** The chord sequence and how long each chord lasts (see harmony/currentChord). */
  chords: ChordSetting;
  /** The band's jobs, kept whatever the player plays (see band/bandJobs). */
  bandJobs: BandJobs;
  /** Energy, 1 to 5 (0 = off, as before): the band's level, busyness and brightness (see energy). */
  sceneEnergy: SceneEnergy;
}
export const SCENE_SETTING_KEYS: (keyof SceneSettings)[] = ['soundWorld', 'band', 'phrases', 'fillAmount', 'evolveAmount', 'bpm', 'chords', 'bandJobs', 'sceneEnergy'];

/** The scene settings as they are in a config now: the player's own, when no run is on. */
export function sceneSettingsOf(c: SceneSettings): SceneSettings {
  return {
    soundWorld: c.soundWorld, band: c.band, phrases: c.phrases, fillAmount: c.fillAmount, evolveAmount: c.evolveAmount, bpm: c.bpm,
    chords: { ...c.chords }, bandJobs: { ...c.bandJobs }, sceneEnergy: c.sceneEnergy,
  };
}

/**
 * What is saved while a run (the piece, a rehearsal, a jump to a scene) holds the player's
 * own settings: theirs, never the scene's, and no scene on. A scene's settings are for the
 * run only, so neither Stop, a reload, a crash nor leaving can leave them behind as the
 * player's (T2-05, T3-17). Everything else is saved as it is.
 */
export function withOwnSettings<T extends SceneSettings & { currentScene: number | null }>(c: T, own: SceneSettings | null): T {
  return own ? { ...c, ...sceneSettingsOf(own), currentScene: null } : c;
}

/**
 * The config once the board stops: the player's own settings back (when a run held them),
 * and no scene on now, whatever put one there. A stopped board has no scene on; one left
 * marked made the next piece open in it and skip every scene before it (R2-T2-01).
 */
export function stoppedConfig<T extends SceneSettings & { currentScene: number | null }>(c: T, own: SceneSettings | null): T {
  return { ...withOwnSettings(c, own), currentScene: null };
}

export interface Scene {
  id: string;
  name: string;
  /** Slots playing in this scene. */
  loops: number[];
  settings: SceneSettings;
  /** When the clock brings this scene in by itself, in seconds from the start; null = only by hand. */
  at?: number | null;
  /**
   * Meant to have no loops: only what the player plays sounds. The check treats a scene
   * with no loops as a problem (the room goes silent unless the player plays) unless it is
   * marked so. Absent on scenes saved before it existed; "Make my plan" never sets it.
   */
  alone?: boolean;
  /**
   * Reach this speed gradually, over this many seconds, when the scene comes in while the
   * board plays (see performance/speedGlide). Absent = at once, as every scene saved before
   * it existed.
   */
  glideSec?: number;
  /**
   * What plays in the last pass before this scene comes in: a drum fill, or rising notes.
   * Absent = none, as every scene saved before it existed.
   */
  leadIn?: Exclude<LeadIn, 'none'>;
  /**
   * This scene's own ideas (see performance/ideas): mixed with the piece's, it seeds every
   * random choice, so the scene plays the same each rehearsal. Absent = none of its own.
   */
  ideas?: number;
  /** Magenta's ideas, kept once made and played again on the next run (the newest few). */
  aiIdeas?: KeptIdea[];
  /**
   * How the piece gets into this scene (K3): loops leaving fade out as the arriving ones
   * fade in; or the arriving ones start at full and the leaving ones carry on for the passes
   * (overlap); or a cut at the pass. Absent on scenes saved before it existed: the piece
   * gives them the player's Loop fade when it loads (withWayIn), so the show sounds as it did.
   */
  wayIn?: WayIn;
  /**
   * The key and mode this scene plays in (a piece can move from A major to A minor and up to
   * B major). It lands on the pass with the loops; the loops' notes are steps of the scale,
   * so they follow it. Absent = the key stays as it is, as every scene saved before.
   */
  key?: SceneKey;
  /**
   * A section of a recorded song that plays in this scene, the record leading the beat
   * (spec 2026-11-06): Elvis's voice for a verse. It starts on the pass the scene lands on.
   */
  song?: SongSectionSpec;
}

/** A scene's key: the key note (the melody's bottom row) and the scale. */
export interface SceneKey {
  rootMidi: number;
  scaleName: string;
  semitones: number[];
}

/** The config's own key fields. */
export interface KeyFields {
  scaleRootMidi: number;
  scaleName: string;
  scaleSemitones: number[];
}

export function keyOf(c: KeyFields): SceneKey {
  return { rootMidi: c.scaleRootMidi, scaleName: c.scaleName, semitones: [...c.scaleSemitones] };
}

export function keyFields(k: SceneKey): KeyFields {
  return { scaleRootMidi: k.rootMidi, scaleName: k.scaleName, scaleSemitones: [...k.semitones] };
}

/** The config with a scene's key, or as it is when the scene has none. */
export function withSceneKey<T extends KeyFields>(c: T, scene: { key?: SceneKey } | null | undefined): T {
  return scene?.key ? { ...c, ...keyFields(scene.key) } : c;
}

/** The player's own key back (when a run held it), as withOwnSettings does for the rest. */
export function withOwnKey<T extends KeyFields>(c: T, own: SceneKey | null): T {
  return own ? { ...c, ...keyFields(own) } : c;
}

/** The key in force in scene `i`: its own, else the nearest earlier scene's; null = none set. */
export function keyAt(scenes: readonly { key?: SceneKey }[], i: number | null): SceneKey | null {
  if (i === null) return null;
  for (let k = Math.min(i, scenes.length - 1); k >= 0; k--) {
    const key = scenes[k]?.key;
    if (key) return key;
  }
  return null;
}

/** A stored key made safe, or null: a key note in reach, and a scale that starts on it. */
export function sanitizeSceneKey(v: unknown): SceneKey | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.rootMidi) || !Number.isInteger(o.rootMidi) || o.rootMidi < 36 || o.rootMidi > 84) return null;
  if (typeof o.scaleName !== 'string' || o.scaleName.length === 0 || o.scaleName.length > 40) return null;
  if (!Array.isArray(o.semitones)) return null;
  const semis = o.semitones.filter((x): x is number => isNum(x) && Number.isInteger(x) && x >= 0 && x < 12);
  const clean = [...new Set(semis)].sort((a, b) => a - b);
  if (clean.length < 5 || clean.length !== o.semitones.length || clean[0] !== 0) return null;
  return { rootMidi: o.rootMidi, scaleName: o.scaleName, semitones: clean };
}

/** The way into a scene (K3). A loop in both scenes carries on untouched whatever the way. */
export type WayIn = { kind: 'fade'; passes: 1 | 2 } | { kind: 'overlap'; passes: 1 | 2 } | { kind: 'cut' };

/** A stored way in made safe, or null. */
export function sanitizeWayIn(v: unknown): WayIn | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === 'cut') return { kind: 'cut' };
  if ((o.kind === 'fade' || o.kind === 'overlap') && (o.passes === 1 || o.passes === 2)) return { kind: o.kind, passes: o.passes };
  return null;
}

/** The way in that sounds as the player's Loop fade did on every scene change before K3. */
export function wayInFromFade(loopFadePasses: number): WayIn {
  if (loopFadePasses <= 0) return { kind: 'cut' };
  return { kind: 'fade', passes: loopFadePasses >= 2 ? 2 : 1 };
}

/** Every scene with a way in: one saved without reads the player's Loop fade. */
export function withWayIn(scenes: readonly Scene[], loopFadePasses: number): Scene[] {
  return scenes.map((s) => (s.wayIn ? s : { ...s, wayIn: wayInFromFade(loopFadePasses) }));
}

export const MAX_SCENES = 12;
const MAX_NAME = 24;

/** The player's iPad strips a scene can set. */
export type PlayerStrip = 'tempo' | 'fill' | 'evolve';
const STRIP_SETTING: Record<PlayerStrip, keyof SceneSettings> = { tempo: 'bpm', fill: 'fillAmount', evolve: 'evolveAmount' };

/**
 * What a scene changes when it comes in. A scene sets the stage — loops, sound, band —
 * but a strip the player has moved since the last scene is theirs: it is left as they
 * set it (when `respectPlayer` is on). Otherwise a scene at 3:30 reset Tim's Fill under
 * his finger.
 */
export function sceneSettingsToApply(
  settings: SceneSettings, touched: ReadonlySet<PlayerStrip>, respectPlayer: boolean,
): Partial<SceneSettings> {
  const out: Partial<SceneSettings> = { ...settings };
  if (respectPlayer) for (const s of touched) delete out[STRIP_SETTING[s]];
  return out;
}

/** A scene from how things are now. */
export function sceneFromNow(name: string, wanted: ReadonlySet<number>, settings: SceneSettings, id = `s${Date.now().toString(36)}`): Scene {
  return {
    id,
    name: cleanName(name) || `Scene`,
    loops: [...wanted].filter((s) => s >= 0 && s < LAUNCH_SLOTS).sort((a, b) => a - b),
    settings: { ...settings },
  };
}

/**
 * The scene after this one in the set list; null when there are none, or at the last
 * one. It does not wrap: a stray "Next" at the end of a piece must not throw the whole
 * sound back to the opening.
 */
export function nextSceneIndex(current: number | null, count: number): number | null {
  if (count <= 0) return null;
  if (current === null || current < 0 || current >= count) return 0;
  return current + 1 < count ? current + 1 : null;
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
    // A scene saved before chord sequences (or band jobs) existed plays as it did.
    chords: sanitizeChords(o.chords),
    bandJobs: sanitizeBandJobs(o.bandJobs),
    // Saved before Energy existed: off, as it played.
    sceneEnergy: sanitizeSceneEnergy(o.sceneEnergy),
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
    const leadIn = sanitizeLeadIn(o.leadIn);
    const ideas = sanitizeIdeas(o.ideas);
    const aiIdeas = sanitizeKeptIdeas(o.aiIdeas);
    const wayIn = sanitizeWayIn(o.wayIn);
    const key = sanitizeSceneKey(o.key);
    const song = sanitizeSongSection(o.song);
    out.push({
      id, name: cleanName(o.name) || `Scene ${out.length + 1}`, loops, settings: sanitizeSceneSettings(o.settings, defaults),
      ...(isNum(o.at) && o.at >= 0 ? { at: Math.round(o.at) } : {}),
      ...(o.alone === true ? { alone: true } : {}),
      ...(isNum(o.glideSec) && Math.round(o.glideSec) >= GLIDE_MIN_SEC && Math.round(o.glideSec) <= GLIDE_MAX_SEC
        ? { glideSec: Math.round(o.glideSec) } : {}),
      ...(leadIn !== 'none' ? { leadIn } : {}),
      ...(ideas !== 0 ? { ideas } : {}),
      ...(aiIdeas.length > 0 ? { aiIdeas } : {}),
      ...(wayIn ? { wayIn } : {}),
      ...(key ? { key } : {}),
      ...(song ? { song } : {}),
    });
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
