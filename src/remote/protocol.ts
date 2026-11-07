import { LAUNCH_SLOTS } from '../songs/performance/launcher';
/**
 * The iPad remote: what the iPad and the laptop say to each other, and the maths that
 * turns an imprecise finger into a steady value.
 *
 * The iPad (a page in Safari, joined with a short code) has four slide strips — speed,
 * dynamics, fill, evolve — and four tap pads. It sends what the player does; the laptop
 * applies it and sends back the current values, so the strips always show the truth even
 * when someone changes a setting on the laptop.
 *
 * Built for a player who slides well but can't hold still or hit small targets (Tim is
 * used to ThumbJam): a whole strip is the control, its ends are generous "all the way"
 * zones, values move in steps so a trembling finger doesn't make them flicker, and a tap
 * acts on touch with repeat taps ignored for a moment.
 */

export const REMOTE_PATH = '/admi-remote';
export const REMOTE_INFO_PATH = '/admi-remote-info';

export type RemoteControlName = 'tempo' | 'dynamics' | 'fill' | 'evolve';
export type RemoteTriggerName = 'newIdea' | 'newSound' | 'keep' | 'mute' | 'stopAll' | 'endPiece' | 'capture';
export const REMOTE_CONTROLS: RemoteControlName[] = ['tempo', 'dynamics', 'fill', 'evolve'];
export const REMOTE_TRIGGERS: RemoteTriggerName[] = ['newIdea', 'newSound', 'keep', 'mute', 'stopAll', 'endPiece', 'capture'];
/** The pads of the Play page: the ones a facilitator can show or hide. */
export const PLAY_PADS: RemoteTriggerName[] = ['newIdea', 'newSound', 'keep', 'mute'];

/** A launchable loop as the iPad shows it (the same words as performance/launcher). */
export type RemoteLoopState = 'empty' | 'stopped' | 'playing' | 'starting' | 'stopping';
export const REMOTE_LOOP_STATES: RemoteLoopState[] = ['empty', 'stopped', 'playing', 'starting', 'stopping'];
/** The jobs that play notes (an instrument): the ones the Board button silences. */
export type PartRole = 'drums' | 'bass' | 'chord' | 'melody';
export const PART_ROLES: PartRole[] = ['drums', 'bass', 'chord', 'melody'];
/** How much is played, for the whole piece: Calm (the loops on their main beats, no Extra notes), Normal or Busy (Extra notes round everything). */
export type Feel = 'calm' | 'normal' | 'busy';
export const FEELS: Feel[] = ['calm', 'normal', 'busy'];
/** The four sounds the melody can be given from the iPad (keys of the sound catalogue). */
export type MelodySound = 'piano' | 'flute' | 'trumpet' | 'saxophone';
export const MELODY_SOUNDS: MelodySound[] = ['piano', 'flute', 'trumpet', 'saxophone'];
/** A picture on the Simple page: an instrument, or the melody's sound. */
export type RemotePicture = 'drums' | 'bass' | 'chords' | MelodySound | 'melody';

export interface RemoteLoop { name: string; state: RemoteLoopState }

/**
 * The rows of the Simple page, in page order; the facilitator chooses which are shown. The
 * instruments and the colours only (owner, 7 Nov 2026: "the only buttons we will use are the
 * instruments and the colours"); the Drums and Calm / Busy rows are gone.
 */
export type SimpleRow = 'melody' | 'counters';
export const SIMPLE_ROWS: SimpleRow[] = ['melody', 'counters'];
/**
 * Stored or sent rows made safe: known rows only, once each, in page order. Not a list = all.
 * The Board row of 4 Nov is the Counters row now (K4): one pad per colour. A choice that
 * named only rows that are gone (Drums, Calm / Busy, or an earlier page's) shows both rows,
 * never an empty page; an empty choice stays empty (the facilitator chose nothing).
 */
export function sanitizeSimpleRows(v: unknown): SimpleRow[] {
  if (!Array.isArray(v)) return [...SIMPLE_ROWS];
  const rows = SIMPLE_ROWS.filter((r) => v.includes(r) || (r === 'counters' && v.includes('board')));
  return rows.length === 0 && v.length > 0 ? [...SIMPLE_ROWS] : rows;
}

/** A colour on the player's board, as the Counters row draws its pad (K4). */
export interface RemoteColour {
  id: string;
  /** Its number on the laptop's colour words. */
  number: number;
  name: string;
  swatch: string;
  /** Its job, so a drum colour's pad can say "Drums are off". */
  role: string;
  /** Its job and instrument as the laptop names them ("Chords · Piano"), for the pad's spoken name. */
  words: string;
  /** The picture drawn on its pad in place of the instrument's words (owner, 5 Nov 2026). */
  picture: string;
}

/** The picture a job gets when the laptop sent none (an older build). */
const ROLE_PICTURE: Record<string, string> = { drums: '🥁', bass: '🎸', chord: '🎹', melody: '🎵' };

function sanitizeColours(v: unknown[]): RemoteColour[] {
  const out: RemoteColour[] = [];
  for (const raw of v.slice(0, 16)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length === 0 || typeof o.number !== 'number' || typeof o.name !== 'string' || typeof o.swatch !== 'string' || typeof o.role !== 'string' || typeof o.words !== 'string') continue;
    const picture = typeof o.picture === 'string' && o.picture.length > 0 ? o.picture.slice(0, 8) : ROLE_PICTURE[o.role] ?? '🎵';
    out.push({ id: o.id, number: o.number, name: o.name.slice(0, 40), swatch: o.swatch.slice(0, 40), role: o.role, words: o.words.slice(0, 80), picture });
  }
  return out;
}

/** Pads from the Loops page a facilitator can also put on the Play page, so the player never has to switch page. */
export type RemotePlayExtra = 'endPiece' | 'nextScene' | 'capture' | 'stopAll';
export const REMOTE_PLAY_EXTRAS: RemotePlayExtra[] = ['endPiece', 'nextScene', 'capture', 'stopAll'];

/** How this player's iPad responds to touch — all set on the laptop, per player. */
export interface RemoteTouch {
  /** A pad acts when the finger lands, or only when it lifts (for a finger that lands roughly). */
  actOn: 'touch' | 'lift';
  /** How long the second tap of a two-tap pad (End piece, Stop all, Mute) is waited for, in seconds. */
  confirmSec: number;
  /**
   * The bounce guard: a touch sooner than this (ms) after the pad's latest touch is not the
   * confirming tap. A shaky press often lands as two or more touches 60-250 ms apart.
   */
  secondTapMinMs: number;
  /** Pads added to the Play page. */
  playExtras: RemotePlayExtra[];
  /** Loops (by slot) with a pad on the Play page. */
  playLoops: number[];
  /** Show Next scene on the iPad at all. */
  showNext: boolean;
}
export const DEFAULT_REMOTE_TOUCH: RemoteTouch = { actOn: 'touch', confirmSec: 6, secondTapMinMs: 500, playExtras: [], playLoops: [], showNext: true };
export const CONFIRM_SECONDS = [3, 6, 10] as const;
/** The bounce guard's choices: all well under the shortest second-tap window. */
export const SECOND_TAP_MIN_MS = [300, 500, 800, 1200] as const;

export function sanitizeRemoteTouch(v: unknown): RemoteTouch {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_REMOTE_TOUCH;
  return {
    actOn: o.actOn === 'lift' ? 'lift' : 'touch',
    confirmSec: (CONFIRM_SECONDS as readonly number[]).includes(o.confirmSec as number) ? (o.confirmSec as number) : d.confirmSec,
    secondTapMinMs: (SECOND_TAP_MIN_MS as readonly number[]).includes(o.secondTapMinMs as number) ? (o.secondTapMinMs as number) : d.secondTapMinMs,
    playExtras: Array.isArray(o.playExtras) ? REMOTE_PLAY_EXTRAS.filter((x) => (o.playExtras as unknown[]).includes(x)) : [],
    playLoops: Array.isArray(o.playLoops)
      ? [...new Set((o.playLoops as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < LAUNCH_SLOTS))].sort((a, b) => a - b)
      : [],
    showNext: o.showNext !== false,
  };
}

/** What a two-tap pad remembers: when it was armed (null = not armed), and its latest touch. */
export interface TwoTapPad { armedAt: number | null; lastTouch: number | null }
export const TWO_TAP_IDLE: TwoTapPad = { armedAt: null, lastTouch: null };

/**
 * A two-tap pad (End piece, Stop all, Mute), touched at `now`. A touch within `minMs` of
 * the pad's latest touch (arming, ignored or confirming) is a bounce of the same press: it
 * neither arms nor confirms, and the quiet starts again from it. So a press that chatters
 * for longer than the guard (touches at 0, 200, 400, 600 ms) never confirms, and a touch
 * just after a confirm never arms the pad again. Otherwise the first tap arms it and the
 * next confirms it, if it comes inside the window (timed from the arming tap). Once the
 * window has lapsed, a tap arms again.
 */
export function secondTap(
  pad: TwoTapPad, now: number, rule: { minMs: number; windowMs: number },
): { step: 'arm' | 'confirm' | 'ignore'; pad: TwoTapPad } {
  if (pad.lastTouch !== null && now - pad.lastTouch < rule.minMs) return { step: 'ignore', pad: { ...pad, lastTouch: now } };
  if (pad.armedAt === null || now - pad.armedAt >= rule.windowMs) return { step: 'arm', pad: { armedAt: now, lastTouch: now } };
  return { step: 'confirm', pad: { armedAt: null, lastTouch: now } };
}

export interface RemoteScene { name: string; active: boolean }

/**
 * How far along a strip this player can comfortably reach, as fractions of its length:
 * their reach becomes the whole range, so the extremes never need a stretch (the same
 * rule as the batons' range calibration).
 */
export interface Reach { low: number; high: number }
export const FULL_REACH: Reach = { low: 0, high: 1 };
/** A reach narrower than this would make every value a few millimetres apart. */
export const MIN_REACH_SPAN = 0.2;
/** Kept inside the measured extremes, so "all the way" is reached a little before the end. */
export const REACH_MARGIN = 0.03;

export interface RemoteState {
  /** Each control as 0–1, exactly as its strip shows it. */
  values: Record<RemoteControlName, number>;
  /** What each value means in words ("96 BPM", "Fill 40%"). */
  labels: Record<RemoteControlName, string>;
  kept: boolean;
  muted: boolean;
  playing: boolean;
  /**
   * Play has been pressed and the sound is still starting (the samples can take a few
   * seconds to load): a loop tapped now is taken, and comes in as the sound starts.
   */
  starting?: boolean;
  /**
   * What is starting is the piece (its clock runs once the sound is ready): no loop is made
   * then, so Capture is unavailable, as while the clock runs (F2).
   */
  pieceStarting?: boolean;
  /** This player's reach on each strip (missing = the whole strip). */
  reach?: Record<RemoteControlName, Reach>;
  /** True while the laptop is learning the player's reach: strips report, not control. */
  learning?: boolean;
  /** The launchable loops and the scenes, for the iPad's Loops page. */
  loops?: RemoteLoop[];
  scenes?: RemoteScene[];
  /** Which strips and pads the iPad shows (missing = all); fewer means bigger. */
  shown?: { strips: RemoteControlName[]; pads: RemoteTriggerName[]; loopsPage: boolean };
  /** Strips that ignore touch for now. */
  locked?: RemoteControlName[];
  /** Jump: a touch sets the value where the finger is. Follow: the value moves with the finger. */
  stripMode?: 'jump' | 'follow';
  /** Whether launched loops fade (the pads say "fading" rather than "stopping"). */
  loopsFade?: boolean;
  /** The performance clock, for the big countdown. */
  clock?: { text: string; phase: 'idle' | 'running' | 'lastMinute' | 'lastMoments' | 'ending' | 'over' };
  /** How this player's iPad responds to touch. */
  touch?: RemoteTouch;
  /** Where the piece is: the scene on now, the next one and how soon. */
  piece?: { now: string | null; next: string | null; nextIn: string | null };
  /** Flips each beat while playing: the iPad shows the pulse, so the beat is seen as well as heard. */
  beat?: boolean;
  /**
   * The laptop page's build (see buildId.ts). An iPad page of another build reloads itself
   * to match, once. Missing = a laptop page from before builds were compared.
   */
  build?: string;
  /** Changes whenever the laptop wants every iPad page to say which build it is (a hello). */
  ask?: number;
  /**
   * The laptop page reloaded mid-piece and is offering Carry on: the iPad waits for it,
   * and its touches are refused until then (B19).
   */
  carryOnWaiting?: boolean;
  /**
   * The board's own light or dark for the iPad page (A11): the laptop's ☀/☾, and always dark in
   * Show. Missing = dark, as the page was before.
   */
  theme?: 'dark' | 'light';
  /** The Simple page (spec 2026-11-04). Missing = the full page, as every laptop before it. */
  layout?: 'simple';
  /** Calm, Normal or Busy, for the whole piece. */
  feel?: Feel;
  /** The Simple page: no drums anywhere (the board's, the loops', the band's). */
  drumsSilent?: boolean;
  /** What the melody colour plays: one of the four, or null for something else. Missing = no melody colour. */
  melody?: { sound: MelodySound | null };
  /** The Simple page: the counters on the board are silenced (the loops, band and Extra notes carry on). */
  boardSilent?: boolean;
  /** The Simple page's rows, as chosen on the laptop. Missing = all. */
  rows?: SimpleRow[];
  /** The Counters row (K4): the player's colours that play notes, in board order, one pad each. */
  colours?: RemoteColour[];
  /** The colours whose counters are silenced from the iPad, by id. */
  silentColours?: string[];
}

export type RemoteMessage =
  | { type: 'control'; name: RemoteControlName; value: number }
  | { type: 'trigger'; name: RemoteTriggerName }
  /** While learning reach: where the finger is on a strip, before any mapping. */
  | { type: 'reach'; name: RemoteControlName; fraction: number }
  /** Start or stop a launchable loop (it takes effect at the next pass). */
  | { type: 'loop'; index: number }
  /** Recall a scene, or the next one in the set list. */
  | { type: 'scene'; index: number | 'next' }
  | { type: 'state'; state: RemoteState }
  /**
   * The iPad page's build, in answer to the laptop's `ask`. A page too old to know about
   * builds sends none, and silence counts as "older"; whatever is missing is null. With
   * `ask` null it answers nothing: the iPad sends it every second as its heartbeat, so the
   * laptop knows it is reaching (see linkReach).
   */
  | { type: 'hello'; build: string | null; ask: number | null }
  /** The Simple page: no drums anywhere, or the drums back. The state wanted, not a toggle. */
  | { type: 'drumsSound'; silent: boolean }
  /** The Simple page: Calm, Normal or Busy. The state wanted, not a toggle. */
  | { type: 'feel'; feel: Feel }
  /** The Simple page: the board's counters silenced, or playing again. The state wanted. */
  | { type: 'boardSound'; silent: boolean }
  /** The Counters row (K4): one colour's counters silenced, or playing again. The state wanted. */
  | { type: 'colourSound'; id: string; silent: boolean }
  /** The Simple page: what the melody colour plays. */
  | { type: 'melodySound'; sound: MelodySound }
  /** The iPad's End piece is waiting for its second tap (on), or no longer is (off). */
  | { type: 'armed'; name: 'endPiece'; on: boolean }
  /** From the relay: how many of each side are in this room. */
  | { type: 'peers'; hosts: number; remotes: number };

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 64;
/** A build id as Vite makes it: short, letters, digits and dashes only. */
const isBuildId = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,40}$/.test(v);
const isAsk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 2 ** 31;

function sanitizeLoops(v: unknown[]): RemoteLoop[] {
  return v.slice(0, 64).map((x) => {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name.slice(0, 40) : '',
      state: REMOTE_LOOP_STATES.includes(o.state as RemoteLoopState) ? (o.state as RemoteLoopState) : 'empty',
    };
  });
}


function sanitizeShown(o: Record<string, unknown>): { strips: RemoteControlName[]; pads: RemoteTriggerName[]; loopsPage: boolean } {
  return {
    strips: Array.isArray(o.strips) ? REMOTE_CONTROLS.filter((n) => (o.strips as unknown[]).includes(n)) : [...REMOTE_CONTROLS],
    pads: Array.isArray(o.pads) ? PLAY_PADS.filter((n) => (o.pads as unknown[]).includes(n)) : [...PLAY_PADS],
    loopsPage: o.loopsPage !== false,
  };
}

const CLOCK_PHASES = ['idle', 'running', 'lastMinute', 'lastMoments', 'ending', 'over'] as const;
function sanitizeClock(v: unknown): RemoteState['clock'] | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text !== 'string' || !CLOCK_PHASES.includes(o.phase as (typeof CLOCK_PHASES)[number])) return null;
  return { text: o.text.slice(0, 12), phase: o.phase as (typeof CLOCK_PHASES)[number] };
}

function sanitizeScenesList(v: unknown[]): RemoteScene[] {
  return v.slice(0, 64).map((x) => {
    const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
    return { name: typeof o.name === 'string' ? o.name.slice(0, 40) : '', active: o.active === true };
  });
}

function sanitizePiece(o: Record<string, unknown>): { now: string | null; next: string | null; nextIn: string | null } {
  const str = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null);
  return { now: str(o.now, 40), next: str(o.next, 40), nextIn: str(o.nextIn, 12) };
}

/** Parse and check a message; anything malformed is ignored, never half-applied. */
export function parseRemoteMessage(raw: unknown): RemoteMessage | null {
  let m: unknown;
  try {
    m = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  if (o.type === 'control' && REMOTE_CONTROLS.includes(o.name as RemoteControlName) && isUnit(o.value)) {
    return { type: 'control', name: o.name as RemoteControlName, value: o.value };
  }
  if (o.type === 'trigger' && REMOTE_TRIGGERS.includes(o.name as RemoteTriggerName)) {
    return { type: 'trigger', name: o.name as RemoteTriggerName };
  }
  if (o.type === 'reach' && REMOTE_CONTROLS.includes(o.name as RemoteControlName) && isUnit(o.fraction)) {
    return { type: 'reach', name: o.name as RemoteControlName, fraction: o.fraction };
  }
  if (o.type === 'loop' && isIndex(o.index)) return { type: 'loop', index: o.index };
  if (o.type === 'scene' && (o.index === 'next' || isIndex(o.index))) return { type: 'scene', index: o.index as number | 'next' };
  if (o.type === 'peers' && typeof o.hosts === 'number' && typeof o.remotes === 'number') {
    return { type: 'peers', hosts: o.hosts, remotes: o.remotes };
  }
  if (o.type === 'drumsSound' && typeof o.silent === 'boolean') return { type: 'drumsSound', silent: o.silent };
  if (o.type === 'feel' && FEELS.includes(o.feel as Feel)) return { type: 'feel', feel: o.feel as Feel };
  if (o.type === 'boardSound' && typeof o.silent === 'boolean') return { type: 'boardSound', silent: o.silent };
  if (o.type === 'colourSound' && typeof o.id === 'string' && o.id.length > 0 && o.id.length < 64 && typeof o.silent === 'boolean') return { type: 'colourSound', id: o.id, silent: o.silent };
  if (o.type === 'melodySound' && MELODY_SOUNDS.includes(o.sound as MelodySound)) return { type: 'melodySound', sound: o.sound as MelodySound };
  if (o.type === 'armed' && o.name === 'endPiece' && typeof o.on === 'boolean') return { type: 'armed', name: 'endPiece', on: o.on };
  if (o.type === 'hello') return { type: 'hello', build: isBuildId(o.build) ? o.build : null, ask: isAsk(o.ask) ? o.ask : null };
  if (o.type === 'state' && typeof o.state === 'object' && o.state !== null) {
    const s = o.state as Record<string, unknown>;
    const values = s.values as Record<string, unknown> | undefined;
    const labels = s.labels as Record<string, unknown> | undefined;
    if (!values || !labels || !REMOTE_CONTROLS.every((k) => isUnit(values[k]) && typeof labels[k] === 'string')) return null;
    const reach = typeof s.reach === 'object' && s.reach !== null ? sanitizeReachMap(s.reach as Record<string, unknown>) : undefined;
    return {
      type: 'state',
      state: {
        values: values as Record<RemoteControlName, number>,
        labels: labels as Record<RemoteControlName, string>,
        kept: s.kept === true,
        muted: s.muted === true,
        playing: s.playing === true,
        ...(s.starting === true ? { starting: true } : {}),
        ...(s.pieceStarting === true ? { pieceStarting: true } : {}),
        ...(reach ? { reach } : {}),
        ...(s.learning === true ? { learning: true } : {}),
        ...(Array.isArray(s.loops) ? { loops: sanitizeLoops(s.loops) } : {}),
        ...(Array.isArray(s.scenes) ? { scenes: sanitizeScenesList(s.scenes) } : {}),
        ...(typeof s.shown === 'object' && s.shown !== null ? { shown: sanitizeShown(s.shown as Record<string, unknown>) } : {}),
        ...(Array.isArray(s.locked) ? { locked: REMOTE_CONTROLS.filter((n) => (s.locked as unknown[]).includes(n)) } : {}),
        ...(s.stripMode === 'follow' || s.stripMode === 'jump' ? { stripMode: s.stripMode } : {}),
        ...(typeof s.loopsFade === 'boolean' ? { loopsFade: s.loopsFade } : {}),
        ...(sanitizeClock(s.clock) ? { clock: sanitizeClock(s.clock)! } : {}),
        ...(typeof s.touch === 'object' && s.touch !== null ? { touch: sanitizeRemoteTouch(s.touch) } : {}),
        ...(typeof s.piece === 'object' && s.piece !== null ? { piece: sanitizePiece(s.piece as Record<string, unknown>) } : {}),
        ...(typeof s.beat === 'boolean' ? { beat: s.beat } : {}),
        ...(isBuildId(s.build) ? { build: s.build } : {}),
        ...(isAsk(s.ask) ? { ask: s.ask } : {}),
        ...(s.carryOnWaiting === true ? { carryOnWaiting: true } : {}),
        ...(s.theme === 'light' || s.theme === 'dark' ? { theme: s.theme } : {}),
        ...(s.layout === 'simple' ? { layout: 'simple' as const } : {}),
        ...(FEELS.includes(s.feel as Feel) ? { feel: s.feel as Feel } : {}),
        ...(typeof s.drumsSilent === 'boolean' ? { drumsSilent: s.drumsSilent } : {}),
        ...(typeof s.boardSilent === 'boolean' ? { boardSilent: s.boardSilent } : {}),
        ...(Array.isArray(s.rows) ? { rows: sanitizeSimpleRows(s.rows) } : {}),
        ...(Array.isArray(s.colours) ? { colours: sanitizeColours(s.colours) } : {}),
        ...(Array.isArray(s.silentColours) ? { silentColours: s.silentColours.filter((x): x is string => typeof x === 'string').slice(0, 16) } : {}),
        ...(typeof s.melody === 'object' && s.melody !== null && !Array.isArray(s.melody) ? {
          melody: { sound: MELODY_SOUNDS.includes((s.melody as Record<string, unknown>).sound as MelodySound) ? (s.melody as Record<string, unknown>).sound as MelodySound : null },
        } : {}),
      },
    };
  }
  return null;
}

// ---- builds: an iPad page kept open from before an update ---------------------------

/**
 * The laptop: are the iPad pages connected now of its build? Each answers the laptop's
 * latest ask with its build (`answers`). Any other build, or none, is out of date at once;
 * a page that has not answered once `waited` is too old to answer, so out of date too.
 */
export function ipadPages(
  connected: number, answers: readonly (string | null)[], mine: string, waited: boolean,
): 'current' | 'outdated' | 'waiting' {
  if (connected === 0) return 'waiting';
  if (answers.some((b) => b !== mine)) return 'outdated';
  if (answers.length >= connected) return 'current';
  return waited ? 'outdated' : 'waiting';
}

/**
 * The iPad: reload to get the laptop's build? Only when the laptop says a different one,
 * and at most once for each (`reloadedFor`, kept for the tab): a laptop page that is
 * itself out of date can then never set the iPad reloading over and over.
 */
export function shouldReloadFor(mine: string, laptop: string | undefined, reloadedFor: string | null): boolean {
  return laptop !== undefined && laptop !== mine && laptop !== reloadedFor;
}

/** A 4-digit code that pairs one iPad with one laptop screen. */
export function makeRemoteCode(rand: () => number = Math.random): string {
  return String(1000 + Math.floor(rand() * 9000));
}

export function isRemoteCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{4}$/.test(code);
}

// ---- reach ---------------------------------------------------------------------------

/** A stored reach made safe: inside 0–1, low before high, never narrower than MIN_REACH_SPAN. */
export function sanitizeReach(v: unknown): Reach {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  let low = isUnit(o.low) ? o.low : 0;
  let high = isUnit(o.high) ? o.high : 1;
  if (high < low) [low, high] = [high, low];
  if (high - low < MIN_REACH_SPAN) {
    const mid = (low + high) / 2;
    low = Math.max(0, mid - MIN_REACH_SPAN / 2);
    high = Math.min(1, low + MIN_REACH_SPAN);
    low = high - MIN_REACH_SPAN;
  }
  return { low, high };
}

export function sanitizeReachMap(v: unknown): Record<RemoteControlName, Reach> {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const out = {} as Record<RemoteControlName, Reach>;
  for (const name of REMOTE_CONTROLS) out[name] = sanitizeReach(o[name]);
  return out;
}

export function fullReachMap(): Record<RemoteControlName, Reach> {
  const out = {} as Record<RemoteControlName, Reach>;
  for (const name of REMOTE_CONTROLS) out[name] = { ...FULL_REACH };
  return out;
}

/** Where the finger is, as a share of the player's reach rather than of the strip. */
export function mapReach(fraction: number, reach: Reach): number {
  const span = Math.max(1e-6, reach.high - reach.low);
  return Math.max(0, Math.min(1, (fraction - reach.low) / span));
}

/** The inverse: where on the strip a value sits, so the strip's fill matches the finger. */
export function unmapReach(value: number, reach: Reach): number {
  return reach.low + Math.max(0, Math.min(1, value)) * (reach.high - reach.low);
}

/**
 * A reach from the extremes the finger touched while learning. Pulled in by a margin so
 * the ends are reached before the finger runs out, and never narrower than the minimum.
 * No samples, or hardly any movement, keeps the reach that was there.
 */
export function reachFromSamples(samples: readonly number[], previous: Reach): Reach {
  if (samples.length < 2) return previous;
  let min = Math.min(...samples);
  let max = Math.max(...samples);
  if (max - min < MIN_REACH_SPAN) return previous;
  min = Math.min(1, min + REACH_MARGIN);
  max = Math.max(0, max - REACH_MARGIN);
  return sanitizeReach({ low: min, high: max });
}

// ---- finger → value ----------------------------------------------------------------

/** The end of a strip that counts as "all the way", as a share of its length. */
export const STRIP_END_ZONE = 0.1;
/** Values move in steps of this, so a trembling finger doesn't make them flicker. */
export const STRIP_STEP = 0.05;
/** Ignore a tap that comes this soon after the last one on the same pad (tremor, bounce). */
export const TAP_REPEAT_MS = 700;

/**
 * Where a finger is on a strip (0 = bottom, 1 = top) → the control's value. The ends are
 * generous: anywhere in the bottom or top 10% is 0 or 1, so the extremes never need
 * precision. In between, values move in 5% steps.
 */
export function stripValue(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  const usable = 1 - 2 * STRIP_END_ZONE;
  const v = Math.max(0, Math.min(1, (f - STRIP_END_ZONE) / usable));
  return Math.round(v / STRIP_STEP) * STRIP_STEP;
}

// ---- value ↔ setting ---------------------------------------------------------------

export const TEMPO_MIN = 60;
export const TEMPO_MAX = 140;

export function tempoFromValue(v: number): number {
  return Math.round(TEMPO_MIN + Math.max(0, Math.min(1, v)) * (TEMPO_MAX - TEMPO_MIN));
}
export function valueFromTempo(bpm: number): number {
  return Math.max(0, Math.min(1, (bpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN)));
}

/**
 * Dynamics: how hard everything plays AND how loud, together — one gesture for "softer"
 * or "stronger". Never fully silent: Mute is the way to silence.
 */
export function dynamicsFromValue(v: number): { velocity: number; volume: number } {
  const x = Math.max(0, Math.min(1, v));
  return { velocity: 0.3 + 0.7 * x, volume: 0.25 + 0.65 * x };
}
export function valueFromVelocity(velocity: number): number {
  return Math.max(0, Math.min(1, (velocity - 0.3) / 0.7));
}
