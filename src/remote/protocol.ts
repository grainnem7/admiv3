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
export type RemoteTriggerName = 'newIdea' | 'newSound' | 'keep' | 'mute';
export const REMOTE_CONTROLS: RemoteControlName[] = ['tempo', 'dynamics', 'fill', 'evolve'];
export const REMOTE_TRIGGERS: RemoteTriggerName[] = ['newIdea', 'newSound', 'keep', 'mute'];

export interface RemoteState {
  /** Each control as 0–1, exactly as its strip shows it. */
  values: Record<RemoteControlName, number>;
  /** What each value means in words ("96 BPM", "Fill 40%"). */
  labels: Record<RemoteControlName, string>;
  kept: boolean;
  muted: boolean;
  playing: boolean;
}

export type RemoteMessage =
  | { type: 'control'; name: RemoteControlName; value: number }
  | { type: 'trigger'; name: RemoteTriggerName }
  | { type: 'state'; state: RemoteState }
  /** From the relay: how many of each side are in this room. */
  | { type: 'peers'; hosts: number; remotes: number };

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

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
  if (o.type === 'peers' && typeof o.hosts === 'number' && typeof o.remotes === 'number') {
    return { type: 'peers', hosts: o.hosts, remotes: o.remotes };
  }
  if (o.type === 'state' && typeof o.state === 'object' && o.state !== null) {
    const s = o.state as Record<string, unknown>;
    const values = s.values as Record<string, unknown> | undefined;
    const labels = s.labels as Record<string, unknown> | undefined;
    if (!values || !labels || !REMOTE_CONTROLS.every((k) => isUnit(values[k]) && typeof labels[k] === 'string')) return null;
    return {
      type: 'state',
      state: {
        values: values as Record<RemoteControlName, number>,
        labels: labels as Record<RemoteControlName, string>,
        kept: s.kept === true,
        muted: s.muted === true,
        playing: s.playing === true,
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
