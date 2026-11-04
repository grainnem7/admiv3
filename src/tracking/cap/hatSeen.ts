/**
 * How well the hat is being seen, over the last few seconds: for the Cap tab, Show's status
 * row and the Ready check, so whoever is running the show can see at a glance whether the
 * camera is finding the hat, instead of guessing from how the music behaves (owner,
 * 4 Nov 2026: "the hat still doesn't work very reliably"). The frames are kept as a short
 * list of (time, what the position came from); nothing here touches the sound.
 */

import type { FusedSighting } from './capTracker';

export interface SeenSample { t: number; source: FusedSighting['source'] }

export interface HatSeenReport {
  /** The share of pictures (0..1) in which the hat itself was found. */
  cap: number;
  /** The share in which the face stood in for a hidden hat. */
  face: number;
  /** How many times the hat went out of sight (hat → not hat). */
  lost: number;
  /** Pictures a second from the camera. */
  fps: number;
  /** How many seconds the report covers (up to the window). */
  seconds: number;
}

export const HAT_SEEN_WINDOW_MS = 10_000;
/** Under this share of pictures, Show's row and the Ready check say the hat is not seen well. */
export const HAT_SEEN_LOW = 0.9;
/** Under a second of pictures there is nothing to say yet. */
const MIN_MS = 1000;

/** The samples still inside the window ending at `now`. */
export function trimSeen(samples: readonly SeenSample[], now: number, windowMs = HAT_SEEN_WINDOW_MS): SeenSample[] {
  const from = now - windowMs;
  let i = 0;
  while (i < samples.length && samples[i].t < from) i++;
  return i === 0 ? [...samples] : samples.slice(i);
}

/** The report for the window ending at `now`, or null while there is under a second of pictures. */
export function hatSeenOver(samples: readonly SeenSample[], now: number, windowMs = HAT_SEEN_WINDOW_MS): HatSeenReport | null {
  const s = trimSeen(samples, now, windowMs);
  if (s.length < 2) return null;
  const span = s[s.length - 1].t - s[0].t;
  if (span < MIN_MS) return null;
  let cap = 0;
  let face = 0;
  let lost = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i].source === 'cap') cap++;
    else if (s[i].source === 'face') face++;
    if (i > 0 && s[i - 1].source === 'cap' && s[i].source !== 'cap') lost++;
  }
  // The window's length, not the span: ten seconds of pictures at 30 a second is 300, and the
  // first sits at the window's edge.
  const seconds = Math.min(windowMs, span + 1000 / Math.max(1, (s.length - 1) / (span / 1000))) / 1000;
  return { cap: cap / s.length, face: face / s.length, lost, fps: (s.length - 1) / (span / 1000), seconds: Math.round(seconds) };
}

/** The report in a line: "Hat seen 96% of the last 10 s · out of sight once · 28 pictures a second". */
export function hatSeenWords(r: HatSeenReport, what: 'Hat' | 'Face' = 'Hat'): string {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  // The face standing in now and then is normal; a tenth of the time is worth knowing.
  // Following the head, it is the hat that stands in (in a bow).
  const face = r.face >= 0.1 ? ` (the ${what === 'Hat' ? 'face' : 'hat'} stood in ${pct(r.face)})` : '';
  const lost = r.lost === 0 ? 'never out of sight' : r.lost === 1 ? 'out of sight once' : `out of sight ${r.lost} times`;
  return `${what} seen ${pct(r.cap)} of the last ${r.seconds} s${face} · ${lost} · ${Math.round(r.fps)} pictures a second`;
}
