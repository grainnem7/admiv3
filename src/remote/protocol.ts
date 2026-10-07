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
export interface RemoteLoop { name: string; state: RemoteLoopState }
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
  /** From the relay: how many of each side are in this room. */
  | { type: 'peers'; hosts: number; remotes: number };

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 64;

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
        ...(reach ? { reach } : {}),
        ...(s.learning === true ? { learning: true } : {}),
        ...(Array.isArray(s.loops) ? { loops: sanitizeLoops(s.loops) } : {}),
        ...(Array.isArray(s.scenes) ? { scenes: sanitizeScenesList(s.scenes) } : {}),
        ...(typeof s.shown === 'object' && s.shown !== null ? { shown: sanitizeShown(s.shown as Record<string, unknown>) } : {}),
        ...(Array.isArray(s.locked) ? { locked: REMOTE_CONTROLS.filter((n) => (s.locked as unknown[]).includes(n)) } : {}),
        ...(s.stripMode === 'follow' || s.stripMode === 'jump' ? { stripMode: s.stripMode } : {}),
        ...(typeof s.loopsFade === 'boolean' ? { loopsFade: s.loopsFade } : {}),
        ...(sanitizeClock(s.clock) ? { clock: sanitizeClock(s.clock)! } : {}),
      },
    };
  }
  return null;
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
