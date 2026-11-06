/**
 * Harmony: real chords, voiced smoothly, with a name.
 *
 * The board's pitches come from a chosen scale — often a pentatonic, which has no thirds
 * to stack — so chords used to be every-other-note of that scale: thin and odd. Here a
 * chord is built from the scale's seven-note PARENT (major pentatonic → major, minor
 * pentatonic → natural minor, blues → minor, suspended → mixolydian), stacked in real
 * thirds, with each sound world's colour on top (sevenths and ninths for Lo-fi, add9 and
 * sus for Ambient, plain triads for Electronic). Voicings are chosen near a register
 * centre so one chord moves to the next by small steps. Every chord has a symbol
 * Magenta's chord-conditioned models understand ("Am7", "Gsus2").
 */

import type { SoundWorldId } from '../../audio/worlds/soundWorlds';

export interface Chord {
  /** The root as a pitch class (0 = C). */
  rootPc: number;
  /** Pitch classes of the chord, root first, in thirds. */
  pcs: number[];
  /** "Am7", "Csus2", "G" — a symbol Magenta parses. */
  symbol: string;
  /** Scale degree in the parent scale (0 = the key note). */
  degree: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** The seven-note scale a board scale belongs to. Already seven notes: itself. */
export function parentScale(semitones: readonly number[]): number[] {
  const set = new Set(semitones.map((s) => ((s % 12) + 12) % 12));
  if (set.size >= 7) return [...set].sort((a, b) => a - b);
  const fits = (scale: number[]): boolean => [...set].every((s) => scale.includes(s));
  // Order matters where more than one fits: a major pentatonic is in major AND mixolydian.
  for (const scale of [MAJOR, MINOR, DORIAN, MIXOLYDIAN]) if (fits(scale)) return scale;
  if (set.has(3) && !set.has(4)) return MINOR;
  return MAJOR;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The chord's name from its intervals above the root. */
export function symbolFor(rootPc: number, intervals: readonly number[]): string {
  const name = NOTE_NAMES[((rootPc % 12) + 12) % 12];
  const has = (...ivs: number[]) => ivs.every((i) => intervals.includes(i));
  const third = intervals.includes(4) ? 'maj' : intervals.includes(3) ? 'min' : intervals.includes(2) ? 'sus2' : intervals.includes(5) ? 'sus4' : 'maj';
  const fifth = intervals.includes(7) ? 'p' : intervals.includes(6) ? 'dim' : 'p';
  if (third === 'min' && fifth === 'dim') return has(10) ? `${name}m7b5` : `${name}dim`;
  if (third === 'sus2') return `${name}sus2`;
  if (third === 'sus4') return `${name}sus4`;
  if (third === 'maj') {
    if (has(11)) return `${name}maj7`;
    if (has(10)) return `${name}7`;
    if (has(14) || has(2)) return `${name}add9`;
    return name;
  }
  if (has(10) && (has(14) || has(2))) return `${name}m9`;
  if (has(10)) return `${name}m7`;
  if (has(14) || has(2)) return `${name}madd9`;
  return `${name}m`;
}

/**
 * The chord on a degree of the key, in the world's colour. Intervals are stacked thirds
 * from the parent scale, so the quality (major, minor, diminished) is the key's own.
 */
export function chordOnDegree(degree: number, rootMidi: number, semitones: readonly number[], style: SoundWorldId): Chord {
  const parent = parentScale(semitones);
  const len = parent.length;
  const d = ((degree % len) + len) % len;
  const at = (i: number): number => parent[((d + i) % len + len) % len] + 12 * Math.floor((d + i) / len);
  const rootPc = ((rootMidi + at(0)) % 12 + 12) % 12;
  const rel = (i: number): number => ((at(i) - at(0)) % 12 + 12) % 12;
  const intervals = [0, rel(2), rel(4)];
  const isTriadMajor = intervals[1] === 4;
  const isDim = intervals[2] === 6;
  // A ninth is only a ninth when it is a whole tone above the root: a semitone above (the
  // iii chord's) would clash, and is not what the symbol would say.
  const ninthOk = rel(1) === 2;
  if (style === 'lofi') {
    // Sevenths everywhere, a ninth on minor chords: the dusty jazz colour.
    intervals.push(rel(6));
    if (!isTriadMajor && !isDim && ninthOk) intervals.push(rel(8) + 12);
  } else if (style === 'ambient') {
    // Open and unresolved: the third drops out for a second on the tonic and fourth; add9 elsewhere.
    if ((d === 0 || d === 3) && ninthOk) { intervals[1] = rel(1); }
    else if (!isDim && ninthOk) intervals.push(rel(8) + 12);
  } else if (style === 'warm') {
    // A seventh only where the ear expects one: on the fifth degree.
    if (d === 4) intervals.push(rel(6));
  }
  // Electronic: plain triads.
  const pcs = intervals.map((i) => (rootPc + i) % 12);
  return { rootPc, pcs: [...new Set(pcs)], symbol: symbolFor(rootPc, intervals), degree: d };
}

/** The nearest degree of the parent scale to a MIDI note (for a counter's row). */
export function degreeOfNote(midi: number, rootMidi: number, semitones: readonly number[]): number {
  const parent = parentScale(semitones);
  const pc = ((midi - rootMidi) % 12 + 12) % 12;
  let best = 0;
  let gap = 99;
  parent.forEach((s, i) => {
    const g = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc));
    if (g < gap) { gap = g; best = i; }
  });
  return best;
}

/**
 * MIDI notes for the chord, voiced close to `centre` so that successive chords move by
 * small steps: each pitch class takes the octave nearest the centre, then the lowest is
 * dropped by an octave only if everything sits above the centre.
 */
export function voiceNear(chord: Pick<Chord, 'pcs'>, centre: number): number[] {
  const notes = chord.pcs.map((pc) => {
    const base = centre - ((centre - pc) % 12 + 12) % 12; // the pc at or below the centre
    return centre - base <= 6 ? base : base + 12;
  });
  return openVoicing([...new Set(notes)].sort((a, b) => a - b));
}

/**
 * An open voicing (sound investigation, S2): a ninth, a sus2 or a seventh sat a tone or a
 * semitone from the chord tone under it, in the same octave, and on a pad or a wide
 * sound that rubbed. Any note within two semitones of the one below it goes up an octave,
 * so add9 is voiced F A C G rather than F G A C. Pure; the pitch classes are unchanged.
 */
export function openVoicing(sorted: readonly number[]): number[] {
  // From the bottom up: a note within two semitones of the last note kept goes up an octave
  // and waits its turn again higher up, so F G A C becomes F A C G and C D G becomes C G D.
  const pending = [...sorted].sort((a, b) => a - b);
  const kept: number[] = [];
  let raises = 0;
  while (pending.length > 0) {
    const n = pending.shift() as number;
    if (kept.length > 0 && n - kept[kept.length - 1] <= 2 && raises < 8) {
      raises += 1;
      pending.push(n + 12);
      pending.sort((a, b) => a - b);
    } else if (!kept.includes(n)) {
      kept.push(n);
    }
  }
  return kept;
}

/** Where a chord colour is voiced: a pianist's left hand, under the melody (sound design pass). */
export const LEFT_HAND_CENTRE = 57;
/** The highest note of a left-hand voicing: the melody's register starts above it. */
export const LEFT_HAND_TOP = 69;

/**
 * A chord voiced as a left hand: near A3, open (no two tones a tone or less apart), and
 * nothing above A4, so the chords sit under the melody instead of through it. A tone above
 * folds down an octave; where two tones then rub, a colour tone (a seventh, a ninth) gives
 * way, never the root, third or fifth (the first three pitch classes given). Pure.
 */
export function leftHand(pcs: readonly number[]): number[] {
  const all = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))];
  const triad = new Set(all.slice(0, 3));
  let notes = openVoicing(voiceNear({ pcs: all }, LEFT_HAND_CENTRE)).map((n) => (n > LEFT_HAND_TOP ? n - 12 : n));
  notes = [...new Set(notes)].sort((a, b) => a - b);
  for (let i = 1; i < notes.length;) {
    if (notes[i] - notes[i - 1] > 2) { i++; continue; }
    const lower = triad.has(notes[i - 1] % 12);
    const upper = triad.has(notes[i] % 12);
    // A colour tone gives way. Two of the chord's own tones (a sus2's root and second) keep
    // both: the higher goes an octave down if it has room above C3, else up if it stays
    // under the top, else it goes (Csus2 becomes D3 G3 C4, a quartal left hand).
    if (!upper) { notes.splice(i, 1); continue; }
    if (!lower) { notes.splice(i - 1, 1); continue; }
    const n = notes[i];
    const free = (m: number): boolean => notes.every((o) => o === n || Math.abs(o - m) > 2);
    notes.splice(i, 1);
    if (n - 12 >= 48 && free(n - 12)) notes.push(n - 12);
    else if (n + 12 <= LEFT_HAND_TOP && free(n + 12)) notes.push(n + 12);
    notes.sort((a, b) => a - b);
    i = 1;
  }
  return notes;
}

/**
 * The voicing of `chord` that moves least from `previous` (each note of the previous
 * voicing to its nearest note of the new chord), within a register.
 */
export function voiceLead(chord: Pick<Chord, 'pcs'>, previous: readonly number[] | null, lo: number, hi: number): number[] {
  if (!previous || previous.length === 0) return voiceNear(chord, Math.round((lo + hi) / 2));
  const centre = previous.reduce((s, n) => s + n, 0) / previous.length;
  const candidates: number[][] = [];
  for (let c = Math.round(centre) - 5; c <= Math.round(centre) + 5; c++) candidates.push(voiceNear(chord, c));
  const cost = (v: number[]): number => {
    if (v.some((n) => n < lo || n > hi)) return Infinity;
    // Each previous note walks to its nearest new note; big leaps cost more.
    return previous.reduce((sum, p) => sum + Math.min(...v.map((n) => Math.abs(n - p))), 0);
  };
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (const v of candidates) {
    const k = cost(v);
    if (k < bestCost) { bestCost = k; best = v; }
  }
  // No voicing near the last one fits the register (the last one had wandered out of it):
  // start again in the middle of the register. Returning the nearest anyway fed the next
  // chord a lower start each time, and a pad ran away down to the bottom of MIDI.
  return best ?? voiceNear(chord, Math.round((lo + hi) / 2));
}

/** The root in the bass register. */
export function bassNote(chord: Pick<Chord, 'rootPc'>, lo = 36): number {
  let n = lo + ((chord.rootPc - lo) % 12 + 12) % 12;
  if (n >= lo + 12) n -= 12;
  return n;
}

/** A chord as the parts play it: a bass root, its notes in the middle of the keyboard, its name. */
export interface Harmony {
  root: number;
  tones: number[];
  symbol?: string;
  /**
   * The chord's pitch classes in chord order: root, third, fifth, then its colour tones.
   * `tones` are in keyboard order, so their first three are not the triad when the root is
   * not the lowest (E7 voiced near D4 is G#3 B3 D4 E4). Absent for a backing song's chord.
   */
  pcs?: number[];
}

/** A Harmony from a chord of the key, voiced in the middle of the keyboard. */
export function harmonyFromChord(chord: Chord): Harmony {
  const tones = voiceNear(chord, 62);
  return { root: bassNote(chord, 48), tones, symbol: chord.symbol, pcs: [...chord.pcs] };
}

/** A harmony's pitch classes in chord order (root, third, fifth, colours); a song's chord as it is. */
export function chordPcs(h: Harmony): number[] {
  return h.pcs ? [...h.pcs] : h.tones.map((t) => ((t % 12) + 12) % 12);
}

/** A harmony's plain triad: root, third and fifth (a song's chord: its lowest three). */
export function triadPcs(h: Harmony): number[] {
  return chordPcs(h).slice(0, 3);
}
