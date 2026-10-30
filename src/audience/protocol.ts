/**
 * The audience screen (spec 2026-10-29): what the laptop page and the audience window say
 * to each other.
 *
 * The audience window is its own small page (audience.html), opened by the laptop page and
 * put on the projector. It is not another copy of ADMI: it never saves, never takes the tab
 * lock and never asks for the camera or the microphone. The two talk over a channel of
 * their own (never the tabs' channel, so the laptop never shows "open in another tab"):
 *  - the laptop says what to show: the board, the scene, the speed, the sound world and
 *    where the hat is (a few times a second, only when it changes), and each note as it is
 *    heard;
 *  - the audience window says it is there (now and then), so the laptop only sends while
 *    one is open, and finds it again after the laptop page reloads.
 */
import type { SoundWorldChoice } from '../audio/worlds/soundWorlds';

export const AUDIENCE_CHANNEL = 'admi-audience';
/** The audience window's page. */
export const AUDIENCE_PATH = '/audience.html';

/** A counter on Tim's board, in its colour (a CSS colour). */
export interface AudienceCounter { row: number; col: number; colour: string }

/**
 * Where the hat is, for Tim's light.
 * - follow: the real hat, in sight and steering: x and y are where it is on Tim's learnt
 *   range (0..1, y up), warmth the Brightness it gives (0..1).
 * - lost: the hat is in use but not steering now (out of sight, paused, the laptop's mouse):
 *   the light holds where it was and dims a little.
 * - free: no hat in use (off, or the laptop board): the light drifts on its own.
 */
export interface AudienceHat {
  mode: 'follow' | 'lost' | 'free';
  x: number | null;
  y: number | null;
  warmth: number | null;
}

export interface AudienceState {
  kind: 'state';
  rows: number;
  cols: number;
  counters: AudienceCounter[];
  /** The board is playing. */
  playing: boolean;
  /** The scene playing now, or null. */
  scene: string | null;
  world: SoundWorldChoice;
  /** The speed playing now. */
  bpm: number;
  hat: AudienceHat;
}

/** A note being heard now: at its square, or (row -1) the band's. */
export interface AudienceNote { row: number; col: number; colour: string; band: boolean }

export type LaptopMessage =
  | AudienceState
  | { kind: 'notes'; notes: AudienceNote[] }
  /** The laptop page has (re)started: any audience window says it is there. */
  | { kind: 'hello' }
  /** Move to this place on the screens (the browser may place windows). */
  | { kind: 'place'; left: number; top: number; width: number; height: number }
  | { kind: 'close' };

/** `filled`: the window now fills the projector (A17), so the laptop can drop its "drag it there" notice. */
export type AudienceMessage = { kind: 'here' } | { kind: 'bye' } | { kind: 'filled' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const WORLDS: readonly string[] = ['none', 'warm', 'lofi', 'ambient', 'electronic'];

function readHat(v: unknown): AudienceHat | null {
  if (!isObj(v)) return null;
  if (v.mode !== 'follow' && v.mode !== 'lost' && v.mode !== 'free') return null;
  if (!numOrNull(v.x) || !numOrNull(v.y) || !numOrNull(v.warmth)) return null;
  return { mode: v.mode, x: v.x, y: v.y, warmth: v.warmth };
}

function readCell<T extends { row: number; col: number; colour: string }>(v: unknown): v is T {
  return isObj(v) && isNum(v.row) && isNum(v.col) && typeof v.colour === 'string';
}

/** What the audience window reads from the channel: only well-formed laptop messages. */
export function readLaptopMessage(v: unknown): LaptopMessage | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case 'state': {
      const hat = readHat(v.hat);
      if (!isNum(v.rows) || !isNum(v.cols) || !Array.isArray(v.counters) || !hat) return null;
      if (typeof v.playing !== 'boolean' || !isNum(v.bpm)) return null;
      if (v.scene !== null && typeof v.scene !== 'string') return null;
      if (typeof v.world !== 'string' || !WORLDS.includes(v.world)) return null;
      const counters = v.counters.filter((c): c is AudienceCounter => readCell<AudienceCounter>(c))
        .map((c) => ({ row: c.row, col: c.col, colour: c.colour }));
      return {
        kind: 'state', rows: v.rows, cols: v.cols, counters, playing: v.playing, scene: v.scene,
        world: v.world as SoundWorldChoice, bpm: v.bpm, hat,
      };
    }
    case 'notes': {
      if (!Array.isArray(v.notes)) return null;
      const notes = v.notes.filter((n): n is AudienceNote => readCell<AudienceNote>(n) && typeof (n as { band?: unknown }).band === 'boolean')
        .map((n) => ({ row: n.row, col: n.col, colour: n.colour, band: n.band }));
      return { kind: 'notes', notes };
    }
    case 'hello': return { kind: 'hello' };
    case 'close': return { kind: 'close' };
    case 'place':
      return isNum(v.left) && isNum(v.top) && isNum(v.width) && isNum(v.height)
        ? { kind: 'place', left: v.left, top: v.top, width: v.width, height: v.height }
        : null;
    default: return null;
  }
}

/** What the laptop page reads from the channel: only the audience window's messages. */
export function readAudienceMessage(v: unknown): AudienceMessage | null {
  if (!isObj(v)) return null;
  if (v.kind === 'here') return { kind: 'here' };
  if (v.kind === 'bye') return { kind: 'bye' };
  if (v.kind === 'filled') return { kind: 'filled' };
  return null;
}
