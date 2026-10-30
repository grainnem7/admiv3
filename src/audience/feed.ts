/**
 * The laptop page's side of the audience screen: what it tells the audience window, and
 * when. It sends nothing unless an audience window is open, so a show without one costs
 * nothing. Called from the board's drawing loop, it reads what the screen already keeps
 * (no React state), so the laptop page never re-renders for it.
 */
import type { FiredNote } from '../songs/BoardSequencerEngine';
import type { CapCameraStatus } from '../ui/screens/boardSequencer/useCapTracker';
import type { CapRole } from '../tracking/cap/capTracker';
import { readAudienceMessage, type AudienceHat, type AudienceNote, type AudienceState, type LaptopMessage } from './protocol';

/** What the hat is doing, as the laptop page knows it. */
export interface HatInput {
  /** The hat is switched on. */
  capEnabled: boolean;
  /** The laptop board: no hat is in use. */
  laptop: boolean;
  /** The laptop moves Speed and Brightness with the mouse instead of the hat. */
  mouse: boolean;
  camera: CapCameraStatus;
  seen: boolean;
  /** Holding still: hands on the board, a counter moved, or learning. */
  paused: boolean;
  /** Frozen by the facilitator. */
  locked: boolean;
  /** Learning the reach, the side to side or the hat itself. */
  learning: boolean;
  /** Where the hat is on Tim's learnt range, 0..1 (y up). */
  axes: { x: number | null; y: number | null };
  xRole: CapRole;
  yRole: CapRole;
}

const LOST: AudienceHat = { mode: 'lost', x: null, y: null, warmth: null };

/**
 * The hat for Tim's light. Only the real hat, in sight and steering, moves it: the mouse,
 * a pause or a freeze count as out of sight, so the screen never credits Tim with a change
 * the laptop made. The warmth is the hat's Brightness (whichever way moves it), or, with
 * Brightness on neither, the height of the hat.
 */
export function audienceHat(h: HatInput): AudienceHat {
  if (!h.capEnabled || h.laptop) return { mode: 'free', x: null, y: null, warmth: null };
  if (h.mouse || h.camera !== 'running' || !h.seen || h.paused || h.locked || h.learning) return LOST;
  const { x, y } = h.axes;
  if (x === null || y === null) return LOST;
  const warmth = h.xRole === 'tone' ? x : y;
  return { mode: 'follow', x, y, warmth };
}

/** No frame drawn for this long: the drawing loop has stopped (B6). */
export const DRAW_STALL_MS = 500;

/**
 * Has the laptop page's drawing loop stopped? The browser stops it for a hidden or covered
 * window, and then the audience screen faded while the music played on. A timer feeds it
 * instead whenever this is true. `lastDrawMs` is null before the first frame is drawn.
 */
export function drawStalled(hidden: boolean, nowMs: number, lastDrawMs: number | null): boolean {
  return hidden || lastDrawMs === null || nowMs - lastDrawMs > DRAW_STALL_MS;
}

/** A note heard longer ago than this has missed its bloom (a busy page): it is dropped. */
export const STALE_NOTE_SEC = 0.3;

/** The notes being heard now (audible time), and the ones still to come. */
export function dueNotes(pending: readonly FiredNote[], audible: number): { due: FiredNote[]; rest: FiredNote[] } {
  const due: FiredNote[] = [];
  const rest: FiredNote[] = [];
  for (const n of pending) {
    if (n.audioTime > audible) rest.push(n);
    else if (audible - n.audioTime <= STALE_NOTE_SEC) due.push(n);
  }
  return { due, rest };
}

/** The part of BroadcastChannel used here (a fake one in the tests). */
export interface ChannelLike {
  postMessage(m: LaptopMessage): void;
  onmessage: ((e: MessageEvent) => void) | null;
  close(): void;
}

/** An audience window not heard from for this long has gone (it says so every second). */
const ALIVE_MS = 4000;
/** The state at most this often (it changes every frame while the hat moves). */
const STATE_MS = 60;
/** And at least this often, so a window that missed one catches up. */
const STATE_KEEP_MS = 1000;

export interface AudienceFeed {
  /** An audience window is open (heard from lately). */
  alive(nowMs: number): boolean;
  /** Called when one opens or goes. */
  onChange(fn: () => void): void;
  /** Whether a state given now would be looked at (so the caller can skip building one). */
  wantsState(nowMs: number): boolean;
  /** What the board looks like now: sent when it changes. */
  state(s: Omit<AudienceState, 'kind'>, nowMs: number): void;
  /** Notes being heard now. */
  notes(n: AudienceNote[]): void;
  send(m: LaptopMessage): void;
  close(): void;
}

export function createAudienceFeed(ch: ChannelLike): AudienceFeed {
  let heardAt: number | null = null;
  let lastJson = '';
  let lastSentAt = -Infinity;
  let listener: (() => void) | null = null;
  const alive = (nowMs: number): boolean => heardAt !== null && nowMs - heardAt < ALIVE_MS;
  ch.onmessage = (e: MessageEvent) => {
    const m = readAudienceMessage(e.data);
    if (!m) return;
    const was = heardAt !== null;
    if (m.kind === 'here') {
      heardAt = performance.now();
      // A new window (or this page reloaded): it has nothing yet, so the next state goes.
      if (!was) lastJson = '';
    } else heardAt = null;
    if (was !== (heardAt !== null)) listener?.();
  };
  // A laptop page that has just (re)started asks: an audience window already open answers.
  ch.postMessage({ kind: 'hello' });
  return {
    alive,
    onChange(fn) { listener = fn; },
    wantsState: (nowMs) => heardAt !== null && nowMs - lastSentAt >= STATE_MS,
    state(s, nowMs) {
      if (heardAt === null) return;
      if (nowMs - lastSentAt < STATE_MS) return;
      const msg: AudienceState = { kind: 'state', ...s };
      const json = JSON.stringify(msg);
      if (json === lastJson && nowMs - lastSentAt < STATE_KEEP_MS) return;
      lastJson = json;
      lastSentAt = nowMs;
      ch.postMessage(msg);
    },
    notes(n) {
      if (heardAt === null || n.length === 0) return;
      ch.postMessage({ kind: 'notes', notes: n });
    },
    send(m) { ch.postMessage(m); },
    close() { ch.onmessage = null; ch.close(); },
  };
}

/** The parts of the setup the audience screen is told. */
export interface AudienceSetup {
  rows: number;
  cols: number;
  channels: readonly { id: string; swatch: string }[];
  scenes: readonly { name: string }[];
  currentScene: number | null;
  soundWorld: AudienceState['world'];
}

/** What the board looks like now, for the audience: no grid, no words but the scene. */
export function audienceState(
  cfg: AudienceSetup, cells: readonly { row: number; col: number; colour: string }[], playing: boolean, bpm: number,
  hat: AudienceHat,
): Omit<AudienceState, 'kind'> {
  const swatch = new Map(cfg.channels.map((c) => [c.id, c.swatch]));
  return {
    rows: cfg.rows,
    cols: cfg.cols,
    counters: cells.map((c) => ({ row: c.row, col: c.col, colour: swatch.get(c.colour) ?? '#cccccc' })),
    playing,
    scene: playing && cfg.currentScene !== null ? cfg.scenes[cfg.currentScene]?.name ?? null : null,
    world: cfg.soundWorld,
    bpm,
    hat,
  };
}

/**
 * The notes heard now, for the audience: each at its square in its colour, whoever made it
 * (Tim's counter, a loop, an extra note): for the audience a sound is a sound. The band's
 * notes have no square; they lift the band light.
 */
export function audienceNotes(due: readonly FiredNote[], swatchOf: (colour: string) => string): AudienceNote[] {
  return due.map((n) => {
    const band = n.origin === 'band' || n.row < 0 || n.col < 0;
    return band
      ? { row: -1, col: -1, colour: swatchOf(n.colour), band: true }
      : { row: n.row, col: n.col, colour: swatchOf(n.colour), band: false };
  });
}
