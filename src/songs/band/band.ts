/**
 * The band: a pad holding the chord, a bass root under it and a groove, so that one or
 * two counters already sound like music (design part C).
 *
 * The player is always the foreground:
 *  - the band is silent on an empty board, comes in on the pass AFTER the first counter
 *    goes down, and stops once the pass in which the last counter was lifted has finished
 *    (the engine keeps that clock; this module only answers "what plays on this step");
 *  - it makes room: as soon as the player has a counter of a part's role, that part drops
 *    out — placing a bass counter is taking over the bass, never doubling it;
 *  - it builds with the player: one or two counters get only the pad, the bass joins at
 *    BASS_FROM counters and the groove at GROOVE_FROM. Coming in whole, a hat on every
 *    eighth buried a single counter (one note of the player's to some 36 of the band's);
 *  - it follows the player's chords (chord counters, or a backing song), and with none it
 *    plays each world's own gentle progression, which the phrases follow too.
 *
 * Pure: same step, same answer.
 */

import { grooveFor, harmonyFromChord, type DrumHit, type Harmony as PhraseHarmony } from '../phrases/phrases';
import { bassNote, chordOnDegree, leftHand, openVoicing, triadPcs, voiceLead } from '../harmony/harmony';
import { WORLD_PROGRESSION, isStrongBeat } from '../harmony/currentChord';
import { counterRange, notesIn, padRangeAway, PAD_RANGE, type BandJobs, type Register } from './bandJobs';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';

export type BandLevel = 'off' | 'gentle' | 'full';
/** The pad's level when it layers in unison under a chord colour (sound design pass). */
export const PAD_LAYER_GAIN = 0.62;
/** The wide pads' upper layer: from A3 to A4, over the chords' left hand and under the melody. */
export const WIDE_PAD_RANGE: [number, number] = [57, 69];
/** The band's parts; 'counter' only with jobs, 'leadIn' only into a scene. */
export type BandPart = 'pad' | 'bass' | 'groove' | 'counter' | 'leadIn';
export const BAND_PARTS: BandPart[] = ['pad', 'bass', 'groove'];

export type Harmony = PhraseHarmony;

export interface BandInput {
  level: BandLevel;
  /** Step within the loop (0 … loop - 1). */
  step: number;
  loop: number;
  style: SoundWorldId;
  /** The chord on this step; null when there is no harmony at all. */
  harmony: Harmony | null;
  /** True when this step starts a new chord (or the loop): the pad re-sounds, the bass lands. */
  chordChange: boolean;
  /** Steps until the chord changes again (or the loop ends): how long held notes last. */
  chordSpan: number;
  /** Roles the player has counters for: the band's part for each is silent. */
  playerRoles: ReadonlySet<'melody' | 'chord' | 'bass' | 'drums'>;
  /** How many counters the player has down: the band builds with them (see bandParts). */
  playerCounters?: number;
  /** The pad's last voicing, so this chord moves to it by small steps. */
  previousPad?: readonly number[] | null;
  /**
   * Wide pads (the demo piece): while the pad layers under a chord colour, a second layer
   * sustains the chord above it, between the chords and the melody, so the instruments sit
   * inside one wide bed instead of over a thin one.
   */
  widePads?: boolean;
  /** The upper layer's last voicing, to lead the next one from. */
  previousUpper?: readonly number[] | null;
  // ---- with jobs (absent, or "As before": the band as it was) ----
  /** Which parts the band keeps, whatever the player plays. */
  jobs?: BandJobs;
  /** A bass counter (the player's or a loop's) is down: the band's bass steps aside. */
  bassTaken?: boolean;
  /** The board or a loop has a drum on this step: the band's drums leave it to them. */
  drumsHere?: boolean;
  /** Where the player's and the loops' chord parts have been sounding: the pads keep away. */
  chordRegister?: Register | null;
  /** A melody note (the player's or a loop's) starts on this step: the counter-melody rests. */
  melodyHere?: boolean;
  /** Where the melody has been sounding: the counter-melody plays in another register. */
  melodyRegister?: Register | null;
  /** Pitch classes of melody notes sounding now: the counter-melody never plays them. */
  avoidPcs?: readonly number[];
  /** A strong beat (first or third of the bar); unknown = from the step. */
  strong?: boolean;
  /** The counter-melody's last note, so it moves by small steps. */
  previousCounter?: number | null;
  /**
   * A scene's Energy on the band's drums (see performance/energy): grooves busier (+1) or
   * sparser (-1, -2) than its level's usual. 0 or absent = as usual. At -1 or below the
   * counter-melody keeps to the main beats, even at Full.
   */
  busy?: number;
  /**
   * The band's own variation on this bar, from the piece's and the scene's ideas (see
   * performance/ideas): which way the counter-melody goes, and whether the walking bass
   * goes to the fifth or the octave. 0 or absent = as before (no variation).
   */
  vary?: number;
}

export interface BandEvent {
  part: BandPart;
  /** For the pad: the voicing this chord took, to lead the next one from. */
  voicing?: number[];
  /** The wide pads' upper layer (see `widePads`), led from its own last voicing. */
  upper?: true;
  /** Beats after the step starts (0 ≤ offset < 1). */
  offset: number;
  /** Length in beats. */
  dur: number;
  /** Loudness 0–1, before the band's own level. */
  accent: number;
  midi?: number;
  drum?: KitDrum;
}

/** The band's level under the player's notes, per setting (linear gain). */
export const BAND_GAIN: Record<BandLevel, number> = { off: 0, gentle: 0.32, full: 0.45 };

/** The part a player's role takes over. */
const PART_OF_ROLE: Record<'melody' | 'chord' | 'bass' | 'drums', BandPart | null> = {
  melody: null, chord: 'pad', bass: 'bass', drums: 'groove',
};

/** The bass joins once the player has this many counters down. */
export const BASS_FROM = 3;
/** The groove joins once the player has this many counters down. */
export const GROOVE_FROM = 5;

/**
 * Which of the band's parts play, given what the player has taken over and how many
 * counters they have down (unknown = all of them, as before).
 */
export function bandParts(
  level: BandLevel, playerRoles: ReadonlySet<string>, playerCounters = Infinity, jobs?: BandJobs, bassTaken = false,
): BandPart[] {
  if (level === 'off') return [];
  if (jobs && !jobs.asBefore) {
    // Jobs: the band keeps them whatever the player plays; only the bass steps aside.
    const out: BandPart[] = [];
    if (jobs.pads) out.push('pad');
    if (jobs.bass && !bassTaken) out.push('bass');
    if (jobs.drums) out.push('groove');
    if (jobs.counter) out.push('counter');
    return out;
  }
  const taken = new Set<BandPart>();
  for (const [role, part] of Object.entries(PART_OF_ROLE)) if (part && playerRoles.has(role)) taken.add(part);
  if (playerCounters < BASS_FROM) taken.add('bass');
  if (playerCounters < GROOVE_FROM) taken.add('groove');
  return BAND_PARTS.filter((p) => !taken.has(p));
}

/** The chord of the world's own progression on `step`. */
export function defaultHarmonyAt(
  style: SoundWorldId, step: number, loop: number, rootMidi: number, semitones: readonly number[],
): Harmony {
  const prog = WORLD_PROGRESSION[style];
  const span = Math.max(1, Math.floor(loop / prog.length));
  const i = Math.min(prog.length - 1, Math.floor((((step % loop) + loop) % loop) / span));
  // The progression is written in sevenths of the key, whatever the board's scale.
  const degree = Math.round(prog[i] * 7) % 7;
  return harmonyFromChord(chordOnDegree(degree, rootMidi, semitones, style));
}

/** The chord's fifth above `root` (its tone nearest a perfect fifth), or the perfect fifth. */
function fifthAbove(root: number, tones: readonly number[]): number {
  let best = root + 7;
  let gap = Infinity;
  for (const t of tones) {
    const iv = (((t - root) % 12) + 12) % 12;
    if (iv >= 6 && iv <= 8 && Math.abs(iv - 7) < gap) { gap = Math.abs(iv - 7); best = root + iv; }
  }
  return best;
}

/** The band's notes on one step. */
export function bandEventsAtStep(input: BandInput): BandEvent[] {
  const withJobs = input.jobs !== undefined && !input.jobs.asBefore;
  const parts = bandParts(input.level, input.playerRoles, input.playerCounters, input.jobs, input.bassTaken ?? false);
  if (parts.length === 0 || input.loop <= 0) return [];
  const out: BandEvent[] = [];
  const h = input.harmony;
  const span = Math.max(1, input.chordSpan);
  const full = input.level === 'full';

  if (h && parts.includes('pad') && input.chordChange) {
    // Led from the last voicing, so the pad moves by small steps and never jumps; with
    // jobs, away from where the chord parts sit.
    // While a chord colour is sounding (the player's or a loop's), the pad layers under it in
    // unison: the plain triad in the same left-hand voicing the chord colour plays, so it adds
    // warmth and sustain without a register of its own. Placed away from the chords it ended
    // up at E6 on a busy board, shrill and above the melody (sound design pass).
    const allPcs = [...new Set(h.tones.map((t) => ((t % 12) + 12) % 12))];
    const layered = withJobs && input.chordRegister ? leftHand(triadPcs(h)) : null;
    const [lo, hi] = withJobs ? padRangeAway(input.chordRegister ?? null) : PAD_RANGE;
    const led = layered ?? voiceLead({ pcs: allPcs }, input.previousPad ?? null, lo, hi);
    // Folded into its range the voicing can close up again (a ninth back beside its root), so it is opened once more (S2).
    const voiced = layered ?? (withJobs ? openVoicing(intoRange(led, lo, hi)) : led);
    // A layer sits under what it layers: about 4 dB down when it doubles the chords in unison.
    // Wide pads (the demo) lead: the bed is louder, and its unison layer is not dipped.
    const padAccent = input.widePads ? (full ? 0.9 : 0.75) : (full ? 0.7 : 0.55) * (layered ? PAD_LAYER_GAIN : 1);
    for (const midi of voiced) out.push({ part: 'pad', offset: 0, dur: span - 0.05, accent: padAccent, midi, voicing: voiced });
    if (layered && input.widePads) {
      // Between the chords' left hand and the melody, moving by the smallest steps.
      const upper = openVoicing(voiceLead({ pcs: triadPcs(h) }, input.previousUpper ?? null, WIDE_PAD_RANGE[0], WIDE_PAD_RANGE[1]));
      const accent = full ? 0.9 : 0.75;
      for (const midi of upper) out.push({ part: 'pad', offset: 0, dur: span - 0.05, accent, midi, voicing: upper, upper: true });
    }
  }

  if (h && parts.includes('bass')) {
    const root = bassNote({ rootPc: ((h.root % 12) + 12) % 12 }, 36);
    if (input.chordChange) out.push({ part: 'bass', offset: 0, dur: full ? Math.min(span, 1.9) : span - 0.05, accent: 0.8, midi: root });
    if (full) {
      // A walk under the chord: the fifth halfway through, the octave leading into the next.
      const into = (input.step % input.loop);
      const changeIn = span; // steps until the next change, counted from this step when chordChange
      if (!input.chordChange && changeIn === 1) out.push({ part: 'bass', offset: 0.5, dur: 0.45, accent: 0.6, midi: root + 12 });
      // The chord's own fifth: a diminished chord's is a semitone below a perfect one.
      else if (!input.chordChange && into % 2 === 0) {
        // A varied bar may walk to the octave instead: a chord note either way.
        const octave = (input.vary ?? 0) !== 0 && ((input.vary ?? 0) >>> 5) % 3 === 0;
        out.push({ part: 'bass', offset: 0, dur: 0.9, accent: 0.65, midi: octave ? root + 12 : fifthAbove(root, h.tones) });
      }
    }
  }

  const busy = Math.round(input.busy ?? 0);
  if (parts.includes('groove') && !(withJobs && input.drumsHere)) {
    const beat = input.step % 4;
    for (const hit of grooveHits(input.style, full, busy)) {
      if (Math.floor(hit.at / 4) !== beat) continue;
      out.push({ part: 'groove', offset: (hit.at % 4) / 4, dur: 0.25, accent: hit.accent * (full ? 0.85 : 1), drum: hit.drum });
    }
  }

  // The counter-melody: in the gaps of the melody (every gap at Full, the strong beats at
  // Quiet, or at a low Energy), on a note of the chord, never one the melody is sounding.
  const strong = input.strong ?? isStrongBeat(input.step);
  if (h && parts.includes('counter') && !input.melodyHere && ((full && busy >= 0) || strong)) {
    const midi = counterNote(h, counterRange(input.melodyRegister ?? null), input.avoidPcs ?? [], input.previousCounter ?? null, input.step, input.vary ?? 0);
    if (midi !== null) out.push({ part: 'counter', offset: 0, dur: 0.9, accent: full ? 0.55 : 0.45, midi });
  }
  return out;
}

/**
 * The band's drums over a bar (16 sixteenths), at its level and how busy a scene's Energy
 * makes them: Full plays the world's groove (busier or sparser by `busy`); Quiet a soft
 * pulse, sparser below, a soft groove above.
 */
export function grooveHits(style: SoundWorldId, full: boolean, busy = 0): DrumHit[] {
  if (full) return grooveFor(style, 2 + busy);
  if (busy >= 1) return grooveFor(style, 1).map((x) => ({ ...x, accent: x.accent * 0.75 }));
  // Quiet: a soft pulse, hats on the eighths (on the beats only, a little sparser; on the
  // first and third, sparser still) and a quiet kick on the one.
  const hats = busy <= -2 ? [0, 8] : busy === -1 ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12, 14];
  return [
    { at: 0, drum: 'kick', accent: 0.5 },
    ...hats.map((at): DrumHit => ({ at, drum: 'hat', accent: at % 4 === 0 ? 0.35 : 0.25 })),
  ];
}

/** Each note moved by octaves into [lo, hi] (a voicing led from another register). */
function intoRange(notes: readonly number[], lo: number, hi: number): number[] {
  return notes.map((n) => {
    let m = n;
    while (m < lo) m += 12;
    while (m > hi && m - 12 >= lo) m -= 12;
    return m;
  }).sort((a, b) => a - b);
}

/**
 * The counter-melody's note: a chord note in its range, not one the melody is sounding,
 * a step along from its last note (up for a bar, then down), so it makes a line.
 */
export function counterNote(
  h: Harmony, range: readonly [number, number], avoidPcs: readonly number[], previous: number | null, step: number, vary = 0,
): number | null {
  const avoid = new Set(avoidPcs.map((p) => ((p % 12) + 12) % 12));
  const ladder = notesIn(h.tones.filter((t) => !avoid.has(((t % 12) + 12) % 12)), range[0], range[1]);
  if (ladder.length === 0) return null;
  if (previous === null) return ladder[Math.floor(ladder.length / 2)];
  let near = 0;
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - previous) < Math.abs(ladder[near] - previous)) near = i;
  // Up for a bar, then down; a varied bar picks its own way.
  const dir = vary !== 0 ? ((vary >>> 3) % 2 === 0 ? 1 : -1) : Math.floor(step / 4) % 2 === 0 ? 1 : -1;
  const next = near + dir >= 0 && near + dir < ladder.length ? near + dir : near - dir;
  return ladder[Math.max(0, Math.min(ladder.length - 1, next))];
}
