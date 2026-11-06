/**
 * The band's jobs (harmony spec stage 2): Pads, Bass, Drums and Counter-melody, each on
 * or off, per player and per scene. The band keeps its jobs whatever the player plays,
 * fitting around him and the loops instead of leaving (see band.ts):
 *  - pads are voiced away from the register of the chord parts;
 *  - drums play only on the steps the board's and loops' drums leave empty;
 *  - the counter-melody plays in the gaps of the melody, in another register;
 *  - one bass at a time: the band's steps aside while a bass counter (his or a loop's) is down.
 * "As before" keeps the old band: parts from the level, building with his counters and
 * handing him each part he takes.
 *
 * Also here: a scene's lead-in (the last pass before it), as notes. Pure.
 */

import type { BandEvent, Harmony } from './band';

export interface BandJobs {
  /** The band as it was before jobs: the other fields are ignored. */
  asBefore: boolean;
  pads: boolean;
  bass: boolean;
  drums: boolean;
  counter: boolean;
  /**
   * A pedal (Rising Light, 2026-11-06): the band's bass holds the key note whatever the chord,
   * so the chords move above a bass that does not. Absent = off.
   */
  pedal?: boolean;
}
export type BandJob = 'pads' | 'bass' | 'drums' | 'counter';
export const BAND_JOBS: BandJob[] = ['pads', 'bass', 'drums', 'counter'];

/** Saved before jobs existed: exactly as it was. */
export const AS_BEFORE_JOBS: BandJobs = { asBefore: true, pads: true, bass: true, drums: true, counter: false };
/** New players and new scenes: what the band always played, now keeping its jobs. */
export const DEFAULT_JOBS: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: false };

const jobs = (pads: boolean, bass: boolean, drums: boolean, counter: boolean): BandJobs => ({ asBefore: false, pads, bass, drums, counter });
/** "Make my plan", scene by scene: a band that builds. Arrival, Build, Open, Home. */
export const PLAN_JOBS: BandJobs[] = [jobs(true, false, false, false), jobs(true, true, false, false), jobs(true, true, true, true), jobs(true, false, false, false)];

/** The names on screen, in the player's words. */
export const BAND_JOB_WORDS: Record<BandJob, { label: string; what: string }> = {
  pads: { label: 'Pads', what: 'Held chords, kept away from where your chords sit.' },
  bass: { label: 'Bass', what: 'One bass at a time: yours wins, and the band’s comes back when you lift it.' },
  drums: { label: 'Drums', what: 'Fills the beats your drums leave empty, never on top of yours.' },
  counter: { label: 'Counter-melody', what: 'A second tune in the gaps of your melody, higher or lower than yours.' },
};

export function sameJobs(a: BandJobs, b: BandJobs): boolean {
  return a.asBefore === b.asBefore && a.pads === b.pads && a.bass === b.bass && a.drums === b.drums && a.counter === b.counter
    && (a.pedal === true) === (b.pedal === true);
}

/** Stored jobs made safe: unreadable (or saved before jobs) is "As before"; a job left out is off. */
export function sanitizeBandJobs(v: unknown): BandJobs {
  const o = (typeof v === 'object' && v !== null ? v : null) as Record<string, unknown> | null;
  if (!o || o.asBefore !== false) return { ...AS_BEFORE_JOBS };
  return {
    asBefore: false, pads: o.pads === true, bass: o.bass === true, drums: o.drums === true, counter: o.counter === true,
    ...(o.pedal === true ? { pedal: true } : {}),
  };
}

/** "pads, bass, drums", "band parts as before": for a scene's one-line summary. */
export function bandJobsWords(j: BandJobs): string {
  if (j.asBefore) return 'band parts as before';
  const on = BAND_JOBS.filter((k) => j[k]).map((k) => BAND_JOB_WORDS[k].label.toLowerCase());
  return on.length > 0 ? on.join(', ') : 'no band parts';
}

// ---- registers ----------------------------------------------------------------------

/** The lowest and highest note a part has played lately. */
export interface Register {
  lo: number;
  hi: number;
}

/** Where the pads sit with no chord parts to keep away from (as before). */
export const PAD_RANGE: [number, number] = [52, 72];

/** The pads never go below this (C3): lower, they sit on the bass. */
export const PAD_FLOOR = 48;

/**
 * The pads' range, away from the chord parts' notes: below them when there is room above
 * the bass (nine semitones between C3 and their lowest note, so a chord fits), otherwise
 * above them. Always an octave or more.
 */
export function padRangeAway(chords: Register | null): [number, number] {
  if (!chords) return PAD_RANGE;
  if (chords.lo - 2 - 9 >= PAD_FLOOR) return [Math.max(PAD_FLOOR, chords.lo - 18), chords.lo - 2];
  return [chords.hi + 2, chords.hi + 18];
}

/** The counter-melody's range: above a melody in the middle or low, below a high one. */
export function counterRange(melody: Register | null): [number, number] {
  if (!melody) return [67, 79];
  if ((melody.lo + melody.hi) / 2 >= 70) return [melody.lo - 13, melody.lo - 1];
  return [melody.hi + 1, melody.hi + 13];
}

/** Every note in [lo, hi] whose pitch class is one of `pcs`, low to high. */
export function notesIn(pcs: readonly number[], lo: number, hi: number): number[] {
  const set = new Set(pcs.map((p) => ((p % 12) + 12) % 12));
  const out: number[] = [];
  for (let n = Math.ceil(lo); n <= hi; n++) if (set.has(((n % 12) + 12) % 12)) out.push(n);
  return out;
}

// ---- lead-in ------------------------------------------------------------------------

export type LeadIn = 'none' | 'drumFill' | 'rising';
export const LEAD_INS: LeadIn[] = ['none', 'drumFill', 'rising'];
export const LEAD_IN_WORDS: Record<LeadIn, { label: string; what: string }> = {
  none: { label: 'None', what: 'The scene simply comes in.' },
  drumFill: { label: 'Drum fill', what: 'A drum fill in the last bar before the scene, and a cymbal as it lands.' },
  rising: { label: 'Rising', what: 'Notes that climb and grow through the last pass before the scene.' },
};

export function sanitizeLeadIn(v: unknown): LeadIn {
  return LEAD_INS.find((l) => l === v) ?? 'none';
}

/** The longest a Rising lead-in lasts, in beats: the last pass, up to four bars. */
const RISING_MAX_BEATS = 16;

/**
 * The lead-in's notes on one beat, `left` beats before the scene lands (0 = the landing
 * beat itself), in a pass of `cycle` beats.
 *  - Drum fill: the last bar, busier and louder towards the scene, and a crash on landing.
 *  - Rising: through the last pass, the chord's notes climbing and growing, two to a beat
 *    in the last bar.
 */
export function leadInEvents(kind: LeadIn, left: number, cycle: number, harmony: Harmony | null): BandEvent[] {
  // On the last beat before the scene lands, whatever the lead in, the bass steps up to the
  // fifth below the root: an approach the ear hears as an arrival (cadences, S2).
  const approach: BandEvent[] = kind !== 'none' && left === 1 && harmony
    ? [{ part: 'leadIn', offset: 0.5, dur: 0.45, accent: 0.75, midi: bassApproach(harmony) }]
    : [];
  return [...approach, ...leadInKindEvents(kind, left, cycle, harmony)];
}

/** The fifth below the root, in the bass register: the note that leads into the root. */
export function bassApproach(harmony: Harmony): number {
  const root = ((harmony.root % 12) + 12) % 12;
  let n = 36 + ((root + 7 - 36) % 12 + 12) % 12;
  if (n >= 48) n -= 12;
  return n;
}

function leadInKindEvents(kind: LeadIn, left: number, cycle: number, harmony: Harmony | null): BandEvent[] {
  if (kind === 'drumFill') {
    const hit = (offset: number, drum: 'snare' | 'tom' | 'crash' | 'kick', accent: number): BandEvent =>
      ({ part: 'leadIn', offset, dur: 0.25, accent, drum });
    if (left === 4 || left === 3) {
      const a = left === 4 ? 0.4 : 0.5;
      return [hit(0, 'snare', a), hit(0.5, 'snare', a + 0.05)];
    }
    if (left === 2) return [0, 0.25, 0.5, 0.75].map((o, i) => hit(o, 'snare', 0.55 + 0.05 * i));
    if (left === 1) return [hit(0, 'tom', 0.7), hit(0.25, 'tom', 0.75), hit(0.5, 'snare', 0.8), hit(0.75, 'snare', 0.85)];
    if (left === 0) return [hit(0, 'crash', 0.8), hit(0, 'kick', 0.8)];
    return [];
  }
  if (kind === 'rising') {
    const span = Math.min(Math.max(1, cycle), RISING_MAX_BEATS);
    if (!harmony || left < 1 || left > span) return [];
    const perBeat = (l: number): number => (l <= 4 ? 2 : 1);
    let before = 0;
    for (let l = span; l > left; l--) before += perBeat(l);
    let total = 0;
    for (let l = span; l >= 1; l--) total += perBeat(l);
    const ladder = notesIn(harmony.tones, 55, 84);
    if (ladder.length === 0) return [];
    const out: BandEvent[] = [];
    for (let i = 0; i < perBeat(left); i++) {
      const k = before + i;
      const frac = total > 1 ? k / (total - 1) : 1;
      out.push({
        part: 'leadIn', offset: i * 0.5, dur: perBeat(left) === 2 ? 0.45 : 0.9,
        accent: 0.3 + 0.5 * frac, midi: ladder[Math.round(frac * (ladder.length - 1))],
      });
    }
    return out;
  }
  return [];
}
