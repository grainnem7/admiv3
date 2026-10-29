/**
 * One current chord for the whole instrument (harmony spec, stage 1).
 *
 * Every pitched part plays to the same chord, worked out once per step: the player's and
 * the loops' chord counters (one note or tunes), the band, Extra notes and Evolve's pitch
 * drift. Where it comes from, first match wins:
 *  1. a locked backing song's chord;
 *  2. a chord counter: from its column to the next chord counter, the end of the loop, or
 *     the sequence's next change, whichever comes first, so a counter changes ONE chord
 *     and never stops the music moving. The player's counters win over a loop's;
 *  3. the scene's chord sequence (a named one, or the world's own), each chord lasting 1, 2
 *     or 4 bars from the scene's first pass. "As before" is the world's own four chords
 *     per loop, and only with the band on, exactly as it was.
 *
 * Melody and bass played one note per counter keep their row's note; on a strong beat a
 * note a semitone from a chord note moves to the nearest chord note (fitToChord).
 *
 * Pure: same input, same chord.
 */

import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import { degreeMidi } from '../boardSequencerScale';
import { chordOnDegree, degreeOfNote, harmonyFromChord, parentScale, symbolFor, type Chord, type Harmony } from './harmony';

export type ChordSequenceId = 'asBefore' | 'world' | 'calm' | 'rising' | 'dreamy' | 'tense' | 'home' | 'still';
export const CHORD_SEQUENCE_IDS: ChordSequenceId[] = ['asBefore', 'world', 'calm', 'rising', 'dreamy', 'tense', 'home', 'still'];
export type ChordBars = 1 | 2 | 4;
export const CHORD_BARS: ChordBars[] = [1, 2, 4];
export const BEATS_PER_BAR = 4;

/** A scene's (or the player's) chords: which sequence, and how many bars each chord lasts. */
export interface ChordSetting {
  sequence: ChordSequenceId;
  bars: ChordBars;
}
/** For new players and new scenes: the world's own chords, two bars each, so pads bloom. */
export const DEFAULT_CHORDS: ChordSetting = { sequence: 'world', bars: 2 };
/** Saved before chord sequences existed: exactly as it was. */
export const AS_BEFORE_CHORDS: ChordSetting = { sequence: 'asBefore', bars: 2 };

/** Stored chords made safe: anything unreadable is "As before"; a length not 1, 2 or 4 bars is two. */
export function sanitizeChords(v: unknown): ChordSetting {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const sequence = CHORD_SEQUENCE_IDS.find((id) => id === o.sequence);
  if (!sequence) return { ...AS_BEFORE_CHORDS };
  const bars = CHORD_BARS.find((b) => b === o.bars) ?? 2;
  return { sequence, bars };
}

/** The names and what each sounds like, in the player's words. */
export const CHORD_SEQUENCE_WORDS: Record<ChordSequenceId, { label: string; what: string }> = {
  asBefore: { label: 'As before', what: 'The sound world’s own chords, four to a loop, only with the band on: as it was.' },
  world: { label: 'The world’s own', what: 'The sound world’s own chords, each lasting as long as you choose.' },
  calm: { label: 'Calm', what: 'Two chords, home and the fourth: I–IV.' },
  rising: { label: 'Rising', what: 'Four chords that lift: I–V–vi–IV.' },
  dreamy: { label: 'Dreamy', what: 'Home, then a soft turn to minor: I–iii–IV–iv.' },
  tense: { label: 'Tense', what: 'Starts away from home, with open sus chords: vi–IV–I–V.' },
  home: { label: 'Home', what: 'Leads home every time: IV–V–I.' },
  still: { label: 'Still', what: 'One open chord on the key note that never moves: a drone.' },
};

type Kind = 'plain' | 'sus2' | 'sus4' | 'minor' | 'drone';
interface SeqChord { degree: number; kind: Kind }
const sc = (degree: number, kind: Kind = 'plain'): SeqChord => ({ degree, kind });

/** The named sequences, in degrees of the key (0 = the key note). */
const NAMED: Record<Exclude<ChordSequenceId, 'asBefore' | 'world'>, SeqChord[]> = {
  calm: [sc(0), sc(3)],
  rising: [sc(0), sc(4), sc(5), sc(3)],
  dreamy: [sc(0), sc(2), sc(3), sc(3, 'minor')],
  tense: [sc(5), sc(3, 'sus2'), sc(0, 'sus2'), sc(4, 'sus4')],
  home: [sc(3), sc(4), sc(0)],
  still: [sc(0, 'drone')],
};

/**
 * Each world's own progression, as positions along the scale (0 = the key note, 1 = an
 * octave up), so it is in key whatever the scale's size.
 */
export const WORLD_PROGRESSION: Record<SoundWorldId, number[]> = {
  warm: [0, 5 / 7, 3 / 7, 4 / 7],        // I  vi  IV  V
  lofi: [1 / 7, 4 / 7, 0, 0],            // ii V  I   I
  ambient: [0, 3 / 7, 0, 5 / 7],         // I  IV  I   vi
  electronic: [0, 5 / 7, 3 / 7, 6 / 7],  // I  vi  IV  VII
};

/** The chords of a sequence, in order (the world's own for 'asBefore' and 'world'). */
function chordsOf(sequence: ChordSequenceId, style: SoundWorldId): SeqChord[] {
  if (sequence === 'asBefore' || sequence === 'world') return WORLD_PROGRESSION[style].map((p) => sc(Math.round(p * 7) % 7));
  return NAMED[sequence];
}

/**
 * One chord of a sequence, in the world's colour. A sus chord is used only where the key
 * has the note for it (a perfect fourth or a whole tone, and a perfect fifth), so it never
 * brings in a note from outside; otherwise the plain chord.
 */
export function sequenceChord(spec: SeqChord, rootMidi: number, semitones: readonly number[], style: SoundWorldId): Chord {
  const base = chordOnDegree(spec.degree, rootMidi, semitones, style);
  if (spec.kind === 'plain') return base;
  const parent = parentScale(semitones);
  const len = parent.length;
  const d = ((spec.degree % len) + len) % len;
  const rel = (i: number): number => ((parent[(d + i) % len] - parent[d]) % 12 + 12) % 12;
  const r = base.rootPc;
  const make = (intervals: number[], symbol: string): Chord => ({
    rootPc: r, pcs: intervals.map((i) => (r + i) % 12), symbol, degree: base.degree,
  });
  if (spec.kind === 'drone') return make([0, 7], symbolFor(r, [0, 7]));
  if (spec.kind === 'minor') return make([0, 3, 7], symbolFor(r, [0, 3, 7]));
  if (rel(4) !== 7) return base;
  if (spec.kind === 'sus2' && rel(1) === 2) return make([0, 2, 7], symbolFor(r, [0, 2, 7]));
  if (spec.kind === 'sus4' && rel(3) === 5) return make([0, 5, 7], symbolFor(r, [0, 5, 7]));
  return base;
}

/** Where a sequence is, on one beat. */
export interface SequenceInput {
  setting: ChordSetting;
  style: SoundWorldId;
  rootMidi: number;
  semitones: readonly number[];
  /** Beats since the sequence started (its scene's first pass). */
  beatsIn: number;
  /** For "As before": this beat's column in the melodic loop, and the loop's length. */
  step: number;
  loop: number;
  /** For "As before": whether the band plays (it was the band's own progression). */
  bandOn: boolean;
}

/** The sequence's chord on a beat, and which chord of it that is (it changes when `n` does). */
export interface SequenceChord {
  harmony: Harmony | null;
  /** Counts up at each change of chord; the same while one chord lasts. */
  n: number;
}

/** The sequence's chord on one beat. */
export function sequenceAt(input: SequenceInput): SequenceChord {
  const chords = chordsOf(input.setting.sequence, input.style);
  if (input.setting.sequence === 'asBefore') {
    // As it was: the world's four chords, one per quarter of the loop, with the band only.
    if (!input.bandOn) return { harmony: null, n: 0 };
    const loop = Math.max(1, input.loop);
    const span = Math.max(1, Math.floor(loop / chords.length));
    const step = ((input.step % loop) + loop) % loop;
    const i = Math.min(chords.length - 1, Math.floor(step / span));
    return { harmony: harmonyFromChord(sequenceChord(chords[i], input.rootMidi, input.semitones, input.style)), n: i };
  }
  const len = Math.max(1, input.setting.bars * BEATS_PER_BAR);
  const k = Math.floor(input.beatsIn / len);
  const i = ((k % chords.length) + chords.length) % chords.length;
  return {
    harmony: harmonyFromChord(sequenceChord(chords[i], input.rootMidi, input.semitones, input.style)),
    // A one-chord sequence never changes.
    n: chords.length === 1 ? 0 : k,
  };
}

/** A chord counter, on the board or in a loop. */
export interface ChordCounter {
  row: number;
  col: number;
  /** The player's own (true) or a loop's (false). */
  live: boolean;
}

export interface CurrentChordInput {
  /** This beat's column in the melodic loop. */
  step: number;
  /** Chord counters inside the melodic loop. */
  counters: readonly ChordCounter[];
  rows: number;
  rootMidi: number;
  semitones: readonly number[];
  style: SoundWorldId;
  /** A locked backing song's chord right now: it wins over everything. */
  songChord?: readonly number[] | null;
  /** The sequence `back` beats ago (0 = now). */
  sequence(back: number): SequenceChord;
}

export interface CurrentChord {
  harmony: Harmony | null;
  from: 'song' | 'counter' | 'sequence' | 'none';
  /** The counter that names it, when one does. */
  owner?: ChordCounter;
}

/** The chord a counter names: its row is a note of the board's scale, the chord the key's own on it. */
export function counterChord(row: number, rows: number, rootMidi: number, semitones: readonly number[], style: SoundWorldId): Harmony {
  const note = degreeMidi(rows - 1 - row, rootMidi, [...semitones]);
  return harmonyFromChord(chordOnDegree(degreeOfNote(note, rootMidi, semitones), rootMidi, semitones, style));
}

/** The one chord sounding on this step. */
export function currentChord(input: CurrentChordInput): CurrentChord {
  if (input.songChord && input.songChord.length > 0) {
    const tones = [...input.songChord].sort((x, y) => x - y);
    return { harmony: { root: tones[0], tones }, from: 'song' };
  }
  const now = input.sequence(0);
  for (const live of [true, false]) {
    const set = input.counters.filter((c) => c.live === live);
    // The last column at or before this step (no wrapping round: before the first counter,
    // the sequence plays).
    let col = -1;
    for (const c of set) if (c.col <= input.step && c.col > col) col = c.col;
    if (col < 0) continue;
    // Its chord lasts until the sequence moves on.
    if (input.step > col && input.sequence(input.step - col).n !== now.n) continue;
    // Two in one column: the lower one names the chord.
    const owner = set.filter((c) => c.col === col).reduce((a, b) => (b.row > a.row ? b : a));
    return { harmony: counterChord(owner.row, input.rows, input.rootMidi, input.semitones, input.style), from: 'counter', owner };
  }
  return now.harmony ? { harmony: now.harmony, from: 'sequence' } : { harmony: null, from: 'none' };
}

/** Strong beats: the first and third of each bar, counted from the start of the pass. */
export function isStrongBeat(stepInPass: number): boolean {
  const b = ((stepInPass % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  return b === 0 || b === 2;
}

const pcOf = (n: number): number => ((n % 12) + 12) % 12;

/** Whether a note rubs against the chord: not a chord note, and a semitone from one. */
export function clashes(midi: number, tones: readonly number[]): boolean {
  const pc = pcOf(midi);
  const pcs = tones.map(pcOf);
  if (pcs.includes(pc)) return false;
  return pcs.some((t) => pcOf(t - pc) === 1 || pcOf(pc - t) === 1);
}

/**
 * The clash nudge: a note that rubs against the chord (a semitone from a chord note) moves
 * to the nearest chord note, the lower one when two are as near; any other note is left as
 * it is, so the player's choice still sounds as theirs.
 */
export function fitToChord(midi: number, tones: readonly number[]): number {
  if (tones.length === 0 || !clashes(midi, tones)) return midi;
  let best = midi;
  let gap = Infinity;
  for (const t of tones) {
    const pc = pcOf(t);
    for (const cand of [midi - 12, midi, midi + 12].map((x) => x - pcOf(x) + pc)) {
      const g = Math.abs(cand - midi);
      if (g < gap || (g === gap && cand < best)) { best = cand; gap = g; }
    }
  }
  return best;
}
