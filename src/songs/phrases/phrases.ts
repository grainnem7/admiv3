/**
 * Phrases: each counter plays a musical idea, not one note.
 *
 * A counter starts its idea on its own column and owns the beats up to the next counter
 * of the same colour (wrapping round the loop), so ONE counter fills the whole loop and a
 * second one divides it. A counter a square out still makes a whole phrase — it just
 * starts a beat later or a step higher — which is what makes the board tolerant.
 *
 *  - Drums: a whole groove. The row sets how busy it is (bottom sparse, top busy).
 *  - Bass: a bassline on the current chord's root (the counter's own row when no chord
 *    counter is down).
 *  - Melody: a short motif from the counter's pitch, answered (turned upside down) on
 *    every second pass through it. On the beat it lands on a chord note.
 *  - Chord: sets the harmony from its column on — so chord counters write the
 *    progression — and comps it in the world's rhythm.
 *
 * Pure: the engine asks for one beat's events and schedules them. Same board, same
 * events, every time. See the design (part B).
 */

import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import { degreeMidi } from '../boardSequencerScale';
import { bassNote, chordOnDegree, degreeOfNote, voiceNear, type Chord } from '../harmony/harmony';

export type PhraseRole = 'melody' | 'bass' | 'drums' | 'chord';

export interface PhraseCell {
  row: number;
  col: number;
  colour: string;
  role: PhraseRole;
  conditional?: boolean;
}

export interface PhraseEvent {
  role: PhraseRole;
  colour: string;
  /** The counter whose phrase this note belongs to — where its light is drawn. */
  owner: { row: number; col: number; conditional: boolean };
  /** When, in beats after this step starts (0 ≤ offset < 1). */
  offset: number;
  /** How long, in beats. */
  dur: number;
  /** Loudness relative to the counter's own (0–1): accents and ghost notes. */
  accent: number;
  midi?: number;
  drum?: KitDrum;
}

export interface PhraseInput {
  cells: readonly PhraseCell[];
  /** This beat's column for a role (each role can loop at its own length). */
  stepFor(role: PhraseRole): number;
  /** A role's loop length in steps. */
  loopFor(role: PhraseRole): number;
  rows: number;
  rootMidi: number;
  semitones: readonly number[];
  /** The backing song's chord right now, when locked to one: it wins over chord counters. */
  songChord?: readonly number[] | null;
  style: SoundWorldId;
  /**
   * Evolve's variation for a colour this scene: `variant` picks another motif and the
   * other bassline / chord rhythm; `busy` moves the drum groove a step busier or sparser.
   */
  evolveOf?(colour: string): { variant: number; busy: number };
  /**
   * The harmony when no chord counter and no song sets one — the band's own progression,
   * so melody and bass fit what the band is playing. Without it, no chord counter means
   * no harmony: pitches come from the rows alone.
   */
  defaultHarmony?(step: number): Harmony | null;
  /** Which time round the loop this is (0 = the first): fills land on every fourth. */
  lap?: number;
}

/** A chord as the phrases use it: its root and tones as MIDI, and its symbol when known. */
export interface Harmony {
  root: number;
  tones: number[];
  symbol?: string;
}

/** A Harmony from a chord of the key, voiced in the middle of the keyboard. */
export function harmonyFromChord(chord: Chord): Harmony {
  const tones = voiceNear(chord, 62);
  return { root: bassNote(chord, 48), tones, symbol: chord.symbol };
}

// ---------------------------------------------------------------------------------------
// Pattern banks. Times are in beats within a 4-beat bar (drums in sixteenths 0–15).
// ---------------------------------------------------------------------------------------

export interface DrumHit { at: number; drum: KitDrum; accent: number }
/** Four grooves per style, sparse → busy. Sixteenth positions within the bar. */
type DrumBank = DrumHit[][];

const h = (at: number, drum: KitDrum, accent = 1): DrumHit => ({ at, drum, accent });
const eighthHats = (accent: number): DrumHit[] => [0, 2, 4, 6, 8, 10, 12, 14].map((at) => h(at, 'hat', at % 4 === 0 ? accent : accent * 0.7));
const sixteenthHats = (accent: number): DrumHit[] => Array.from({ length: 16 }, (_, at) => h(at, 'hat', at % 2 === 0 ? accent : accent * 0.5));

const DRUMS: Record<SoundWorldId, DrumBank> = {
  warm: [
    [h(0, 'kick'), h(8, 'kick', 0.85), h(4, 'snare', 0.8), h(12, 'snare', 0.8)],
    [h(0, 'kick'), h(8, 'kick', 0.85), h(4, 'snare', 0.85), h(12, 'snare', 0.85), ...eighthHats(0.45)],
    [h(0, 'kick'), h(8, 'kick', 0.85), h(10, 'kick', 0.6), h(4, 'snare'), h(12, 'snare'), ...eighthHats(0.5)],
    [h(0, 'kick'), h(7, 'kick', 0.6), h(10, 'kick', 0.75), h(4, 'snare'), h(12, 'snare'), h(14, 'snare', 0.3), ...sixteenthHats(0.45)],
  ],
  lofi: [
    [h(0, 'kick'), h(10, 'kick', 0.8), h(4, 'snare', 0.85), h(12, 'snare', 0.85)],
    [h(0, 'kick'), h(10, 'kick', 0.8), h(4, 'snare', 0.9), h(12, 'snare', 0.9), ...eighthHats(0.4)],
    [h(0, 'kick'), h(7, 'kick', 0.65), h(10, 'kick', 0.8), h(4, 'snare'), h(9, 'snare', 0.25), h(12, 'snare'), ...eighthHats(0.45)],
    [h(0, 'kick'), h(3, 'kick', 0.5), h(7, 'kick', 0.65), h(10, 'kick', 0.8), h(4, 'snare'), h(9, 'snare', 0.25), h(12, 'snare'), h(14, 'rim', 0.4), ...sixteenthHats(0.35)],
  ],
  ambient: [
    [h(0, 'kick', 0.7)],
    [h(0, 'kick', 0.7), h(8, 'kick', 0.55), ...eighthHats(0.25)],
    [h(0, 'kick', 0.7), h(8, 'kick', 0.55), h(6, 'rim', 0.3), h(14, 'rim', 0.3), ...eighthHats(0.3)],
    [h(0, 'kick', 0.7), h(8, 'kick', 0.55), h(6, 'rim', 0.3), h(14, 'rim', 0.3), ...sixteenthHats(0.25)],
  ],
  electronic: [
    [h(0, 'kick'), h(4, 'kick'), h(8, 'kick'), h(12, 'kick')],
    [h(0, 'kick'), h(4, 'kick'), h(8, 'kick'), h(12, 'kick'), h(2, 'hat', 0.6), h(6, 'hat', 0.6), h(10, 'hat', 0.6), h(14, 'hat', 0.6)],
    [h(0, 'kick'), h(4, 'kick'), h(8, 'kick'), h(12, 'kick'), h(4, 'clap', 0.85), h(12, 'clap', 0.85), h(2, 'hat', 0.6), h(6, 'hat', 0.6), h(10, 'hat', 0.6), h(14, 'hat', 0.6)],
    [h(0, 'kick'), h(4, 'kick'), h(8, 'kick'), h(12, 'kick'), h(14, 'kick', 0.5), h(4, 'clap', 0.85), h(12, 'clap', 0.85), ...sixteenthHats(0.45)],
  ],
};

type BassNote = 'root' | 'third' | 'fifth' | 'octave';
interface BassHit { t: number; n: BassNote; d: number; accent: number }
const b = (t: number, n: BassNote, d: number, accent = 1): BassHit => ({ t, n, d, accent });
/** Two basslines per style: the second is what Evolve alternates to. */
const BASS: Record<SoundWorldId, BassHit[][]> = {
  warm: [
    [b(0, 'root', 1.4), b(1.5, 'root', 0.5, 0.7), b(2, 'fifth', 1, 0.85), b(3, 'root', 1, 0.8)],
    [b(0, 'root', 0.9), b(1, 'third', 0.9, 0.8), b(2, 'fifth', 0.9, 0.85), b(3, 'octave', 0.9, 0.75)],
  ],
  lofi: [
    [b(0, 'root', 1.2), b(1.75, 'octave', 0.25, 0.6), b(2.5, 'root', 0.9, 0.85), b(3.5, 'fifth', 0.5, 0.7)],
    [b(0, 'root', 0.7), b(0.75, 'root', 0.25, 0.55), b(1.5, 'third', 1, 0.8), b(3, 'fifth', 0.5, 0.7), b(3.5, 'octave', 0.5, 0.6)],
  ],
  ambient: [
    [b(0, 'root', 3.9, 0.8)],
    [b(0, 'root', 1.9, 0.8), b(2, 'fifth', 1.9, 0.7)],
  ],
  electronic: [
    [b(0.5, 'root', 0.4), b(1.5, 'root', 0.4), b(2.5, 'root', 0.4), b(3.5, 'octave', 0.4, 0.85)],
    [b(0, 'root', 0.25), b(0.5, 'octave', 0.25, 0.8), b(1, 'root', 0.25), b(1.75, 'root', 0.25, 0.7), b(2.5, 'fifth', 0.4), b(3.5, 'octave', 0.4, 0.85)],
  ],
};

/** A motif: scale steps from the counter's pitch, within two beats. */
interface MotifNote { t: number; deg: number; d: number }
const m = (t: number, deg: number, d: number): MotifNote => ({ t, deg, d });
const MOTIFS: Record<SoundWorldId, MotifNote[][]> = {
  warm: [
    [m(0, 0, 0.5), m(0.5, 1, 0.5), m(1, 2, 1)],
    [m(0, 2, 0.75), m(0.75, 1, 0.25), m(1, 0, 1)],
    [m(0, 0, 0.5), m(0.5, 2, 0.5), m(1, 4, 0.5), m(1.5, 2, 0.5)],
    [m(0, 0, 1), m(1, -1, 0.5), m(1.5, 0, 0.5)],
    [m(0, 4, 0.5), m(0.5, 3, 0.5), m(1, 2, 0.5), m(1.5, 1, 0.5)],
    [m(0, 0, 0.75), m(0.75, 2, 0.25), m(1, 3, 0.5), m(1.5, 2, 0.5)],
  ],
  lofi: [
    [m(0, 0, 0.75), m(0.75, 2, 0.75), m(1.5, 1, 0.5)],
    [m(0.5, 0, 0.5), m(1, -1, 0.5), m(1.5, 0, 0.5)],
    [m(0, 2, 0.5), m(0.75, 0, 0.25), m(1, 1, 1)],
    [m(0.25, 0, 0.5), m(1, 2, 0.5), m(1.75, 1, 0.25)],
    [m(0, 4, 0.75), m(0.75, 3, 0.25), m(1, 2, 0.5), m(1.5, 0, 0.5)],
    [m(0, 0, 0.5), m(0.5, 0, 0.25), m(1.25, 2, 0.75)],
  ],
  ambient: [
    [m(0, 0, 2)],
    [m(0, 0, 1), m(1, 2, 1)],
    [m(0, 4, 1.5), m(1.5, 2, 0.5)],
    [m(0, 2, 2)],
    [m(0, 0, 1.5), m(1.5, 1, 0.5)],
    [m(0.5, 4, 1.5)],
  ],
  electronic: [
    [m(0, 0, 0.25), m(0.25, 2, 0.25), m(0.5, 4, 0.25), m(0.75, 2, 0.25), m(1, 0, 0.25), m(1.25, 2, 0.25), m(1.5, 4, 0.25), m(1.75, 5, 0.25)],
    [m(0, 0, 0.5), m(0.5, 0, 0.25), m(0.75, 2, 0.5), m(1.5, 1, 0.5)],
    [m(0, 4, 0.25), m(0.25, 2, 0.25), m(0.5, 0, 0.5), m(1, 2, 0.25), m(1.25, 4, 0.25), m(1.5, 2, 0.5)],
    [m(0, 0, 0.25), m(0.5, 0, 0.25), m(1, 2, 0.25), m(1.5, 2, 0.25)],
    [m(0, 0, 0.25), m(0.25, 4, 0.25), m(0.5, 0, 0.25), m(0.75, 4, 0.25), m(1, 2, 0.25), m(1.25, 5, 0.25), m(1.5, 2, 0.25), m(1.75, 5, 0.25)],
    [m(0, 2, 0.75), m(0.75, 0, 0.25), m(1, -1, 0.5), m(1.5, 0, 0.5)],
  ],
};

/** The groove's fill: the last bar of every fourth pass, per world. Sixteenths within the bar. */
const FILLS: Record<SoundWorldId, DrumHit[]> = {
  warm: [h(8, 'snare', 0.7), h(10, 'snare', 0.6), h(12, 'tom', 0.8), h(13, 'tom', 0.6), h(14, 'tom', 0.9), h(15, 'crash', 0.7)],
  lofi: [h(10, 'snare', 0.45), h(11, 'snare', 0.35), h(12, 'snare', 0.7), h(14, 'tom', 0.7), h(15, 'rim', 0.5)],
  ambient: [h(12, 'tom', 0.4), h(14, 'tom', 0.5)],
  electronic: [h(8, 'snare', 0.6), h(10, 'snare', 0.6), h(12, 'snare', 0.7), h(13, 'snare', 0.7), h(14, 'snare', 0.8), h(15, 'snare', 0.9)],
};
const MOTIF_BEATS = 2;

/** A world's groove at a busyness level 0 (sparse) … 3 (busy), for the band to share. */
export function grooveFor(style: SoundWorldId, level: number): DrumHit[] {
  const bank = DRUMS[style];
  return bank[Math.max(0, Math.min(bank.length - 1, Math.round(level)))];
}

/** Chord comping: when the chord sounds within the bar, and for how long. Two per style. */
const c = (t: number, d: number, accent: number) => ({ t, d, accent });
const COMP: Record<SoundWorldId, { t: number; d: number; accent: number }[][]> = {
  warm: [
    [c(0, 1.9, 0.9), c(2, 1.9, 0.75)],
    [c(0, 0.9, 0.85), c(1.5, 0.5, 0.6), c(2, 1.9, 0.75)],
  ],
  lofi: [
    [c(0, 1.25, 0.85), c(1.5, 0.5, 0.6), c(2.5, 1.25, 0.75)],
    [c(0, 0.75, 0.8), c(0.75, 0.75, 0.65), c(2, 1.5, 0.75)],
  ],
  ambient: [
    [c(0, 3.9, 0.8)],
    [c(0, 1.9, 0.75), c(2, 1.9, 0.7)],
  ],
  electronic: [
    [0.5, 1.5, 2.5, 3.5].map((t) => c(t, 0.3, 0.8)),
    [c(0, 0.25, 0.85), c(0.75, 0.25, 0.7), c(1.5, 0.25, 0.75), c(2.5, 0.25, 0.75), c(3, 0.25, 0.7)],
  ],
};

// ---------------------------------------------------------------------------------------

/** Which column owns `step` among `cols`: the last one at or before it, wrapping. */
function ownerCol(cols: readonly number[], step: number): number | null {
  if (cols.length === 0) return null;
  let best: number | null = null;
  for (const c of cols) if (c <= step && (best === null || c > best)) best = c;
  return best ?? Math.max(...cols);
}

/** Notes within one beat of a bar-based pattern: those whose start falls in beat `k`. */
function inBeat<T extends { t: number }>(pattern: readonly T[], k: number, barBeats = 4): T[] {
  const beat = k % barBeats;
  return pattern.filter((p) => Math.floor(p.t) === beat);
}

/** Move a note into [lo, lo + 12). */
function intoOctave(midi: number, lo: number): number {
  let n = midi;
  while (n >= lo + 12) n -= 12;
  while (n < lo) n += 12;
  return n;
}

/** The nearest note of `tones` (any octave) to `midi`. */
function nearestTone(midi: number, tones: readonly number[]): number {
  let best = midi;
  let bestGap = Infinity;
  for (const t of tones) {
    const pc = ((t % 12) + 12) % 12;
    for (const cand of [midi - 12, midi, midi + 12].map((x) => x - (((x % 12) + 12) % 12) + pc)) {
      const gap = Math.abs(cand - midi);
      if (gap < bestGap || (gap === bestGap && cand < best)) { best = cand; bestGap = gap; }
    }
  }
  return best;
}

/** The chord sounding at the chord role's current step, or null for "no chord set". */
export function harmonyAt(input: PhraseInput): Harmony | null {
  if (input.songChord && input.songChord.length > 0) {
    const tones = [...input.songChord].sort((x, y) => x - y);
    return { root: tones[0], tones };
  }
  const loop = input.loopFor('chord');
  const chords = input.cells.filter((c) => c.role === 'chord' && c.col < loop);
  const owner = ownerCol(chords.map((c) => c.col), input.stepFor('chord'));
  if (owner === null) return input.defaultHarmony?.(input.stepFor('chord')) ?? null;
  // Two chord counters in one column: the lower one names the chord. The row is a note
  // of the board's scale; the chord is built on the nearest degree of the key.
  const rowDegree = Math.min(...chords.filter((c) => c.col === owner).map((c) => input.rows - 1 - c.row));
  const note = degreeMidi(rowDegree, input.rootMidi, [...input.semitones]);
  return harmonyFromChord(chordOnDegree(degreeOfNote(note, input.rootMidi, input.semitones), input.rootMidi, input.semitones, input.style));
}

/** Every note the phrases play on this beat. */
export function phraseEventsAtStep(input: PhraseInput): PhraseEvent[] {
  const out: PhraseEvent[] = [];
  const harmony = harmonyAt(input);
  const byColour = new Map<string, PhraseCell[]>();
  for (const c of input.cells) {
    const list = byColour.get(c.colour);
    if (list) list.push(c);
    else byColour.set(c.colour, [c]);
  }

  for (const [colour, cells] of byColour) {
    const role = cells[0].role;
    const loop = input.loopFor(role);
    const inLoop = cells.filter((c) => c.col < loop);
    const step = input.stepFor(role);
    const col = ownerCol(inLoop.map((c) => c.col), step);
    if (col === null) continue;
    const k = (step - col + loop) % loop;        // beats into this counter's phrase
    const evo = input.evolveOf?.(colour) ?? { variant: 0, busy: 0 };
    const alt = evo.variant % 2;
    for (const owner of inLoop.filter((c) => c.col === col)) {
      const who = { row: owner.row, col: owner.col, conditional: owner.conditional ?? false };
      const base = { role, colour, owner: who };
      const degree = input.rows - 1 - owner.row;
      if (role === 'drums') {
        const level = Math.max(0, Math.min(3, Math.floor((degree / Math.max(1, input.rows)) * 4) + evo.busy));
        const beat = k % 4;
        // The last bar of every fourth time round gets a fill instead of the groove's
        // second half — the thing that tells the ear a phrase is ending.
        const lastBar = input.lap !== undefined && input.lap % 4 === 3 && step >= loop - 4;
        const fill = lastBar ? FILLS[input.style] : [];
        const fillStart = fill.length > 0 ? Math.min(...fill.map((f) => f.at)) : 16;
        for (const hit of DRUMS[input.style][level]) {
          if (Math.floor(hit.at / 4) !== beat) continue;
          if (lastBar && hit.at >= fillStart && hit.drum !== 'kick') continue;
          out.push({ ...base, offset: (hit.at % 4) / 4, dur: 0.25, accent: hit.accent, drum: hit.drum });
        }
        for (const hit of fill) {
          if (Math.floor(hit.at / 4) !== (step - (loop - 4)) % 4) continue;
          out.push({ ...base, offset: (hit.at % 4) / 4, dur: 0.25, accent: hit.accent, drum: hit.drum });
        }
      } else if (role === 'bass') {
        const root = intoOctave(
          harmony ? harmony.root : degreeMidi(degree, input.rootMidi, [...input.semitones]),
          36,
        );
        // The third and fifth come from the chord itself, so a minor chord gets a minor third.
        const third = harmony ? nearestTone(root + 4, harmony.tones.filter((t) => t % 12 !== harmony.root % 12)) : root + 4;
        const fifth = harmony ? nearestTone(root + 7, harmony.tones) : root + 7;
        for (const n of inBeat(BASS[input.style][alt], k)) {
          const midi = n.n === 'root' ? root : n.n === 'third' ? third : n.n === 'fifth' ? fifth : root + 12;
          out.push({ ...base, offset: n.t % 1, dur: n.d, accent: n.accent, midi });
        }
      } else if (role === 'chord') {
        // The chord this counter names (or the song's), voiced near the middle of the keyboard.
        const voiced = input.songChord && input.songChord.length > 0
          ? [...input.songChord].map((t) => intoOctave(t, 55)).sort((x, y) => x - y)
          : voiceNear(chordOnDegree(
            degreeOfNote(degreeMidi(degree, input.rootMidi, [...input.semitones]), input.rootMidi, input.semitones),
            input.rootMidi, input.semitones, input.style,
          ), 62);
        for (const hit of inBeat(COMP[input.style][alt], k)) {
          for (const midi of voiced) out.push({ ...base, offset: hit.t % 1, dur: hit.d, accent: hit.accent, midi });
        }
      } else {
        const bank = MOTIFS[input.style];
        const motif = bank[(owner.row + owner.col + evo.variant) % bank.length];
        // Every second time through, the motif answers itself: same rhythm, upside down.
        const answer = Math.floor(k / MOTIF_BEATS) % 2 === 1;
        const beatInMotif = k % MOTIF_BEATS;
        for (const n of motif) {
          if (Math.floor(n.t) !== beatInMotif) continue;
          let midi = degreeMidi(degree + (answer ? -n.deg : n.deg), input.rootMidi, [...input.semitones]);
          // On the beat, land on the chord: off it, any scale note passes.
          if (harmony && n.t % 1 === 0) midi = nearestTone(midi, harmony.tones);
          out.push({ ...base, offset: n.t % 1, dur: n.d, accent: n.t % 1 === 0 ? 1 : 0.8, midi });
        }
      }
    }
  }
  return out;
}
