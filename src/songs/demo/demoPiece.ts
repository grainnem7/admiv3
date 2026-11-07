/**
 * The demo piece, "Rising Light", version 3: seven minutes that play the same every time.
 *
 * The composition is docs/superpowers/specs/2026-11-06-demo-composition-v3-design.md, built on
 * versions 1 and 2 (2026-11-06-demo-composition-design.md, -v2-design.md). The owner's notes on
 * version 2: a lot better, but dreamy; it needs upbeat, dramatic and exciting sections with
 * drums, more intrigue and more direction.
 *
 * So the drums change feel without the tempo changing (87 BPM throughout): tribal in the
 * opening, a groove, half time for the intrigue, double time for the drop and the summit, a
 * heartbeat in the breakdown. The band's bass drives in eighths in the grooves. Intrigue comes
 * from pedals under moving chords, bells in threes against the fours, and a dominant pedal (F
 * sharp, the fifth of B) under the Tension, so the summit lands as a resolution. Surprise
 * comes from stops (two beats of silence, then a crash), snare rolls into the drop, crashes on
 * new sections. Every section has a job and points at the next.
 *
 * One set of five notes (A major pentatonic, the same notes centred on F# for the shadow), F
 * sharp major pentatonic for the Tension and B major pentatonic for the summit: every written
 * note sits in every chord of its section, and whatever Tim places is in the key. His counters
 * sound on his own track, Tim's glow (MIDI channel 14), over everything.
 *
 * On the usual 8 by 8 board at 87 BPM a pass is two bars of 4/4 (8 beats, about 5.5 s); a
 * drum hit's place in the pass is its step and a fraction of a beat (`timingBeats`), so the
 * kit plays on a sixteenth grid. Every change lands on the downbeat of a pass that is a
 * multiple of four.
 *
 * Ableton, one track per part: each scene has one melody sound, one sound on the Bass track
 * (the brass) and one on the Chords track (the guitar).
 *
 * Pure: the profile code makes the player, this only says what the music is.
 */

import type { BoardSequencerStored, StoredLoopCell } from '../../profiles/BoardSequencerConfig';
import type { Scene, SceneKey, SceneSettings } from '../performance/launcher';
import type { PerformanceSettings } from '../performance/clock';
import type { SavedPiece } from '../performance/pieces';
import type { ChordSetting } from '../harmony/currentChord';
import type { BandJobs } from '../band/bandJobs';
import { loopColourId, type LoopJob } from '../performance/loopSounds';
import type { KeptIdea } from '../performance/ideas';
import { DEMO_FROZEN_IDEAS } from './demoIdeas';

export const DEMO_PLAYER_ID = 'demo';
export const DEMO_PLAYER_NAME = 'Demo piece';
export const DEMO_PIECE_ID = 'demo-piece';
/**
 * The demo's music, by revision: a demo player made from an older one has its music written
 * afresh when opened, so a laptop that has pulled a newer ADMI always plays the newest demo.
 */
export const DEMO_REVISION = 12;

const ROWS = 8;
const COLS = 8;
/** 87: the ending then starts exactly at the end of the last scene's eighth pass, and rings out by 7:00. */
export const DEMO_BPM = 87;
/** The piece's own ideas: every choice the rules make comes from these, so it plays the same. */
export const DEMO_IDEAS = 20261106;

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];
/** The light: A major pentatonic (A, B, C#, E, F#), the key note A4 on the bottom row. */
export const A_MAJOR: SceneKey = { rootMidi: 69, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };
/** The shadow: F sharp minor pentatonic, the same five notes centred on F# (the chords from F sharp natural minor). */
export const F_SHARP_MINOR: SceneKey = { rootMidi: 66, scaleName: 'Minor pentatonic', semitones: MINOR_PENT };
/** The Tension: F sharp major pentatonic (F#, G#, A#, C#, D#), the fifth of B, so the summit lands as a resolution. */
export const F_SHARP_MAJOR: SceneKey = { rootMidi: 66, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };
/** The summit: B major pentatonic (B, C#, D#, F#, G#), a tone above the light. */
export const B_MAJOR: SceneKey = { rootMidi: 71, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };

/**
 * Steps of the pentatonic scale from the bottom row, written in A major: A4 B4 C#5 E5 F#5 A5
 * B5 C#6. In F sharp minor the same steps are F#4 A4 B4 C#5 E5 F#5.
 */
const A = 0, B = 1, CS = 2, E = 3, FS = 4, A2 = 5;

/**
 * A written note: its step in the pass (0 to 7), its step of the scale, how long it is held in
 * beats, and the passes of every four it plays on (0 to 3; absent, every pass).
 */
type Written = readonly [col: number, degree: number, hold?: number, passes?: readonly number[]];

/** How a loop is played, beyond its notes. */
interface Feel {
  /** An octave or two away from its row's note. */
  octave?: number;
  /** A bass loop playing over the band's bass, which keeps its own note under it. */
  overBass?: boolean;
  /** How far behind the beat it sits, in beats (a player is never exactly on the grid). */
  layBack?: number;
}

/**
 * A loop: its notes, each on the passes of four it is written for, so the phrase grows. Each
 * note sits a touch behind the beat, more between beats than on them, the same every time.
 */
function notes(job: LoopJob, sound: string, line: readonly Written[], velocity: number, feel: Feel = {}): StoredLoopCell[] {
  const colour = loopColourId(job, sound);
  const lay = feel.layBack ?? 0;
  return line.map(([col, degree, hold, passes]): StoredLoopCell => ({
    row: ROWS - 1 - degree, col, colour, job, sound, plays: 'note', velocity,
    ...(passes ? { passes: [...passes] } : {}),
    ...(feel.octave ? { octave: feel.octave } : {}),
    ...(feel.overBass ? { overBass: true as const } : {}),
    ...(hold ? { holdBeats: hold } : {}),
    ...(lay > 0 && col > 0 ? { timingBeats: Math.round((col % 2 === 0 ? lay * 0.5 : lay) * 1000) / 1000 } : {}),
  }));
}

/** From the second pass of every four. */
const LATER = [1, 2, 3] as const;

// ---- the theme: four notes that grow over four passes (version 2's) ---------------------

/**
 * C#, B, A, then up to E (the 1st pass asks); the 2nd answers, B and the F# above; the 3rd
 * adds an E; the 4th the high A, ringing over the turn into the next pass.
 */
const THEME: Written[] = [
  [0, CS, 3], [3, B, 1], [4, A, 2], [6, E, 2],
  [5, B, 1, LATER], [7, FS, 1, LATER],
  [2, E, 1, [2, 3]],
  [1, A2, 7, [3]],
];

/**
 * The bells in threes (the Intrigue, in F sharp minor): C#, B, A, one on every third eighth,
 * so the figure comes round against the fours (written as the steps of C#, B and A there).
 */
const BELLS_IN_THREES: StoredLoopCell[] = [0, 1.5, 3, 4.5, 6, 7.5].map((p, i) => ({
  row: ROWS - 1 - [3, 2, 1][i % 3], col: Math.floor(p), colour: loopColourId('melody', 'synth:bell'), job: 'melody' as const,
  sound: 'synth:bell', plays: 'note' as const, velocity: 0.4, octave: 1, holdBeats: 1.5,
  ...(p % 1 > 0 ? { timingBeats: p % 1 } : {}),
}));

// ---- the brass ----------------------------------------------------------------------------

/** The key note and its fifth, held a whole pass: the opening's pads, and the pedal F# in the Intrigue and the Tension. */
const BRASS_FIFTHS = notes('bass', 'trombone', [[0, A, 8], [0, E, 8]], 0.4, { octave: 1, overBass: true });
/** In the grooves, a swell on the first beat of every bar, held through it. */
const BRASS_SWELLS = notes('bass', 'trombone', [[0, A, 4], [0, E, 4], [4, A, 4], [4, E, 4]], 0.45, { octave: 1, overBass: true });

// ---- the guitar: fingerpicked, every chord rolled string by string -------------------------

const ROLL_UP = 0.09;
const ROLL_DOWN = -0.07;

/** A chord the pads hold, rolled: one counter, its own roll and loudness, on its passes. */
function rolled(row: number, col: number, roll: number, velocity: number, extra: Partial<StoredLoopCell> = {}): StoredLoopCell {
  return {
    row, col, colour: loopColourId('chord', 'guitarAcoustic'), job: 'chord', sound: 'guitarAcoustic', plays: 'note',
    velocity, follows: true, roll, ...extra,
  };
}
/** The slow roll: a chord every pass, and one on beat 5 from the second pass. */
const GUITAR_ROLL: StoredLoopCell[] = [rolled(ROWS - 1, 0, ROLL_UP, 0.45), rolled(ROWS - 1, 4, ROLL_UP, 0.4, { passes: [...LATER] })];
/** In the grooves: picked on every eighth, two counters a step, up on the beat and down between. */
const EIGHTH_VELOCITY = [0.5, 0.36, 0.42, 0.34, 0.46, 0.37, 0.41, 0.35];
const GUITAR_EIGHTHS: StoredLoopCell[] = Array.from({ length: COLS }, (_, col) => [
  rolled(ROWS - 1, col, ROLL_UP, EIGHTH_VELOCITY[col]),
  rolled(ROWS - 2, col, ROLL_DOWN, Math.round(EIGHTH_VELOCITY[(col + 3) % COLS] * 0.85 * 100) / 100, { timingBeats: 0.5 }),
]).flat();

// ---- the drums: one kit piece per counter, on a sixteenth grid ----------------------------

type Piece = 'kick' | 'rim' | 'snare' | 'hat' | 'tom' | 'crash' | 'clap';
/** Each kit piece on its own row, so no two counters share a square (the row picks nothing: the loop names its piece). */
const PIECE_ROW: Record<Piece, number> = { kick: 7, rim: 6, snare: 5, hat: 4, tom: 3, crash: 2, clap: 1 };
/** A hit: where in the pass (in beats, 0 to 8), its piece, how loud, and the passes of four it plays on (absent: every pass). */
type Hit = readonly [at: number, piece: Piece, velocity: number, passes?: readonly number[]];

/** Hits as loop cells: a beat position p is step ⌊p⌋, a fraction of a beat late. */
function drums(hits: readonly Hit[]): StoredLoopCell[] {
  const used = new Set<string>();
  return hits.map(([p, piece, velocity, passes]) => {
    const col = Math.floor(p);
    // A second hit on a step that piece's row already holds takes the next free row down.
    let row = PIECE_ROW[piece];
    for (let tries = 0; used.has(`${col}:${row}`); tries++) {
      if (tries >= ROWS) throw new Error(`more than ${ROWS} hits on step ${col}`);
      row = (row + ROWS - 1) % ROWS;
    }
    used.add(`${col}:${row}`);
    const late = Math.round((p - col) * 1000) / 1000;
    return {
      row, col, colour: loopColourId('drums', piece), job: 'drums' as const, sound: piece, plays: 'note' as const, velocity,
      ...(late > 0 ? { timingBeats: late } : {}),
      ...(passes ? { passes: [...passes] } : {}),
    };
  });
}

/** Every eighth, or every sixteenth, of the pass (or a stretch of it). */
const eighths = (from = 0, to = 8): number[] => Array.from({ length: (to - from) * 2 }, (_, i) => from + i / 2);
const sixteenths = (from = 0, to = 8): number[] => Array.from({ length: (to - from) * 4 }, (_, i) => from + i / 4);

/**
 * Tribal (the opening): a soft kick on 1 of each bar, low toms answering it (a pattern that
 * asks a question), a rim click, the shaker on every eighth from the 2nd pass, very soft.
 */
const TRIBAL: Hit[] = [
  [0, 'kick', 0.45], [4, 'kick', 0.42],
  ...[1.5, 2.75, 3.5, 5.5, 6.75, 7.5].map((p, i): Hit => [p, 'tom', [0.38, 0.32, 0.4, 0.36, 0.3, 0.42][i]]),
  [3, 'rim', 0.32], [7, 'rim', 0.34],
  ...eighths().map((p): Hit => [p, 'hat', p % 1 === 0 ? 0.2 : 0.16, LATER]),
];

/**
 * The groove: the kick's pattern, the backbeat, hats on the eighths and ghost sixteenths on
 * the 2nd and 4th passes, a clap with the snare from the 3rd, a crash to open.
 */
const GROOVE: Hit[] = [
  ...[0, 1.5, 2.75, 4, 5.5, 6.5].map((p): Hit => [p, 'kick', p % 4 === 0 ? 0.6 : 0.5]),
  ...[1, 3, 5, 7].map((p): Hit => [p, 'snare', 0.55]),
  ...eighths().map((p): Hit => [p, 'hat', p % 1 === 0 ? 0.48 : 0.4]),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Hit => [p + 0.75, 'hat', 0.3, [1, 3]]),
  ...[1, 3, 5, 7].map((p): Hit => [p, 'clap', 0.45, [2, 3]]),
  [0, 'crash', 0.6, [0]],
];

/** Half time: the kick on 1 and the and of 2, the snare on 3, toms in threes against the fours (3 + 3 + 2 eighths), hats on the beats. */
const HALF_TIME: Hit[] = [
  [0, 'kick', 0.55], [3.5, 'kick', 0.5],
  [2, 'snare', 0.55], [6, 'snare', 0.58],
  ...[0, 1.5, 3, 4, 5.5, 7].map((p, i): Hit => [p, 'tom', i % 3 === 0 ? 0.5 : 0.42]),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Hit => [p, 'hat', 0.35]),
];

/** Double time: the busy kick, the snare on every beat with ghosts, hats on every sixteenth (the eighths louder), a crash on the 1st and 3rd passes. */
const DOUBLE_TIME: Hit[] = [
  ...[0, 0.75, 2, 2.5, 4, 4.75, 6, 6.5].map((p): Hit => [p, 'kick', p % 2 === 0 ? 0.7 : 0.55]),
  ...[1, 3, 5, 7].map((p): Hit => [p, 'snare', 0.65]),
  [2.75, 'snare', 0.35], [6.75, 'snare', 0.35],
  ...sixteenths().map((p): Hit => [p, 'hat', p % 0.5 === 0 ? 0.5 : 0.32]),
  [0, 'crash', 0.6, [0, 2]],
];

/** The toms running down over the last two beats of every 4th pass: the groove's fill, the drop's run. */
const TOM_RUN: Hit[] = sixteenths(6, 8).map((p, i): Hit => [p, 'tom', 0.5 + 0.02 * i, [3]]);

/** The heartbeat (version 1's, soft): a kick on 1 and the and of 2, a rim on 3 of each bar, a shaker breath on every "and". */
const HEARTBEAT: Hit[] = [
  [0, 'kick', 0.45], [1.5, 'kick', 0.35], [4, 'kick', 0.42], [5.5, 'kick', 0.33],
  [2, 'rim', 0.3], [6, 'rim', 0.3],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Hit => [p + 0.5, 'hat', 0.2]),
];

/** The rebuild: the heartbeat's kick and rim; the hats back from the 2nd pass, the snare from the 3rd (the fill on the 4th is the tom run). */
const REBUILD: Hit[] = [
  [0, 'kick', 0.48], [1.5, 'kick', 0.38], [4, 'kick', 0.45], [5.5, 'kick', 0.36],
  [2, 'rim', 0.32], [6, 'rim', 0.32],
  ...eighths().map((p): Hit => [p, 'hat', p % 1 === 0 ? 0.38 : 0.3, LATER]),
  ...[1, 3, 5, 7].map((p): Hit => [p, 'snare', 0.48, [2, 3]]),
];

/**
 * The snare roll, louder each pass: eighths over the second bar on the 1st pass, eighths all
 * through on the 2nd (toms on the last two beats of both); the fast half carries on with
 * sixteenths over the second bar on the 3rd and all through on the 4th.
 */
const SNARE_ROLL: Hit[] = [
  ...eighths(4, 8).map((p): Hit => [p, 'snare', 0.3, [0]]),
  ...eighths().map((p): Hit => [p, 'snare', 0.4, [1]]),
  [6, 'tom', 0.45], [7, 'tom', 0.5],
];
const SNARE_ROLL_FAST: Hit[] = [
  ...[...eighths(0, 4), ...sixteenths(4, 8)].map((p): Hit => [p, 'snare', 0.5, [2]]),
  ...sixteenths().map((p): Hit => [p, 'snare', 0.65, [3]]),
];

/** The loops, by slot, with their names. Every tune at or under 0.6; the drums up to 0.7 where they drive. */
export const DEMO_LOOPS: readonly { name: string; cells: StoredLoopCell[] }[] = [
  { name: 'Tribal', cells: drums(TRIBAL) },
  { name: 'Groove', cells: drums(GROOVE) },
  { name: 'Half time', cells: drums(HALF_TIME) },
  { name: 'Double time', cells: drums(DOUBLE_TIME) },
  { name: 'Tom run', cells: drums(TOM_RUN) },
  { name: 'Heartbeat', cells: drums(HEARTBEAT) },
  { name: 'Rebuild', cells: drums(REBUILD) },
  { name: 'Snare roll', cells: drums(SNARE_ROLL) },
  { name: 'Snare roll fast', cells: drums(SNARE_ROLL_FAST) },
  { name: 'Brass fifths', cells: BRASS_FIFTHS },
  { name: 'Brass swells', cells: BRASS_SWELLS },
  { name: 'Guitar roll', cells: GUITAR_ROLL },
  { name: 'Guitar eighths', cells: GUITAR_EIGHTHS },
  { name: 'Winds theme', cells: notes('melody', 'clarinet', THEME, 0.5, { layBack: 0.03 }) },
  { name: 'Winds high', cells: notes('melody', 'clarinet', THEME, 0.55, { layBack: 0.03, octave: 1 }) },
  { name: 'Bells in threes', cells: BELLS_IN_THREES },
];

const SLOT = new Map(DEMO_LOOPS.map((l, i) => [l.name, i]));
const slots = (...names: string[]): number[] => names.map((n) => SLOT.get(n) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);

/** One pass, in seconds: two bars of four beats. */
export const DEMO_PASS_SEC = (COLS * 60) / DEMO_BPM;

/** The band: its pads and its bass (the sub), never its drums or its counter-melody. */
const jobs = (pads: boolean, bass: boolean, how: { pedal?: true; drive?: true } = {}): BandJobs => ({
  asBefore: false, pads, bass, drums: false, counter: false, ...how,
});
const NO_BAND = jobs(false, false);
const PADS_ONLY = jobs(true, false);
const PEDAL = jobs(true, true, { pedal: true });
const ROOTS = jobs(true, true);
const DRIVE = jobs(true, true, { drive: true });

/**
 * The scenes' chords, never a pop progression: Glow (I add9, IV maj7) and Lift (I sus2, ii
 * add9) in the light; Tide (i, VI, iv, i) and Rise (VI, VII, i) in the shadow; a drone on F#
 * for the Tension; Lift again, in B, at the summit. Four bars a chord, two when "moving".
 */
const chords = (sequence: ChordSetting['sequence'], bars: ChordSetting['bars'] = 4): ChordSetting => ({ sequence, bars });

const BASE: SceneSettings = {
  soundWorld: 'warm',
  band: 'full',
  phrases: true,
  fillAmount: 0,
  evolveAmount: 0,
  bpm: DEMO_BPM,
  chords: chords('glow'),
  bandJobs: PADS_ONLY,
  sceneEnergy: 2,
};

interface SceneSpec {
  name: string;
  /** The pass it lands on: a multiple of four. */
  pass: number;
  loops: number[];
  key: SceneKey;
  settings: Partial<SceneSettings>;
  wayIn: NonNullable<Scene['wayIn']>;
  leadIn?: Scene['leadIn'];
}

const CUT: NonNullable<Scene['wayIn']> = { kind: 'cut' };
const FADE: NonNullable<Scene['wayIn']> = { kind: 'fade', passes: 1 };
/** The grooves' band of loops: the kit, the run, the brass swelling each bar, the guitar on every eighth. */
const GROOVE_BAND = ['Groove', 'Tom run', 'Brass swells', 'Guitar eighths'];
const DOUBLE_BAND = ['Double time', 'Tom run', 'Brass swells', 'Guitar eighths', 'Winds high'];

/** The form, in passes (a pass is about 5.5 s): thirteen scenes, then the Big finish, seven minutes. */
export const DEMO_SCENES: readonly SceneSpec[] = [
  // 0:00 Low toms and a soft kick, a pattern that asks a question; the shaker from the 2nd pass.
  { name: 'Drums', pass: 0, loops: slots('Tribal'), key: A_MAJOR, settings: { band: 'off', bandJobs: NO_BAND, chords: chords('glow'), sceneEnergy: 2 }, wayIn: CUT },
  // 0:22 The brass pads swell in over the toms, over a held A.
  { name: 'Brass', pass: 4, loops: slots('Tribal', 'Brass fifths'), key: A_MAJOR, settings: { chords: chords('glow'), sceneEnergy: 2, bandJobs: PEDAL }, wayIn: FADE },
  // 0:44 The fingerpicked guitar; the pads open.
  { name: 'Guitar', pass: 8, loops: slots('Tribal', 'Brass fifths', 'Guitar roll'), key: A_MAJOR, settings: { chords: chords('glow'), sceneEnergy: 3, bandJobs: PEDAL }, wayIn: FADE },
  // 1:06 A fill, a crash: the kit locks into a groove, the bass drives in eighths, the guitar picks every eighth; the chords lift every two bars.
  { name: 'Groove', pass: 12, loops: slots(...GROOVE_BAND), key: A_MAJOR, settings: { chords: chords('lift', 2), sceneEnergy: 4, bandJobs: DRIVE }, wayIn: CUT, leadIn: 'drumFill' },
  // 1:50 The winds play the theme over the groove; Magenta answers.
  { name: 'Winds hook', pass: 20, loops: slots(...GROOVE_BAND, 'Winds theme'), key: A_MAJOR, settings: { chords: chords('lift', 2), sceneEnergy: 4, bandJobs: DRIVE, fillAmount: 0.25 }, wayIn: CUT },
  // 2:12 A stop, then the centre drops to F#: toms in threes, the brass on a pedal F# under moving chords, bells in threes; a snare roll builds.
  { name: 'Intrigue', pass: 24, loops: slots('Half time', 'Snare roll fast', 'Brass fifths', 'Bells in threes'), key: F_SHARP_MINOR, settings: { chords: chords('tide'), sceneEnergy: 3, bandJobs: PEDAL, fillAmount: 0.15 }, wayIn: CUT, leadIn: 'stop' },
  // 2:56 A crash: double time, the bass driving, the winds an octave up, Magenta at its busiest.
  { name: 'Drop', pass: 32, loops: slots(...DOUBLE_BAND), key: F_SHARP_MINOR, settings: { chords: chords('rise', 2), sceneEnergy: 5, bandJobs: DRIVE, fillAmount: 0.4 }, wayIn: CUT },
  // 3:18 Everything falls away but the pads, a heartbeat, the winds and Tim's glow.
  { name: 'Breakdown', pass: 36, loops: slots('Heartbeat', 'Winds theme'), key: F_SHARP_MINOR, settings: { chords: chords('tide'), sceneEnergy: 1, bandJobs: PADS_ONLY }, wayIn: CUT },
  // 3:40 Over four passes the kit returns piece by piece: kick, then hats, then snare, then the fill.
  { name: 'Rebuild', pass: 40, loops: slots('Rebuild', 'Tom run', 'Brass fifths', 'Guitar roll'), key: F_SHARP_MINOR, settings: { chords: chords('rise'), sceneEnergy: 3, bandJobs: ROOTS, fillAmount: 0.15 }, wayIn: CUT, leadIn: 'rising' },
  // 4:02 A stop, then the light breaks back to A: the full groove, the driving bass, the brass on every bar, the guitar, the winds.
  { name: 'Groove II', pass: 44, loops: slots(...GROOVE_BAND, 'Winds theme'), key: A_MAJOR, settings: { chords: chords('glow', 2), sceneEnergy: 4, bandJobs: DRIVE, fillAmount: 0.25 }, wayIn: CUT, leadIn: 'stop' },
  // 4:46 A pedal on F#, the fifth of B: the chords hover, the snare rolls in eighths then sixteenths, louder each pass; it must
  // land. No extra notes: the rolls fill every sixteenth, and there is no room for the AI's.
  { name: 'Tension', pass: 52, loops: slots('Half time', 'Snare roll', 'Snare roll fast', 'Brass fifths', 'Guitar roll'), key: F_SHARP_MAJOR, settings: { chords: chords('still'), sceneEnergy: 4, bandJobs: PEDAL }, wayIn: CUT },
  // 5:08 A stop, then B major: a crash, the full kit, the bass driving, the brass, the winds high, the guitar on every eighth.
  { name: 'Summit', pass: 56, loops: slots(...DOUBLE_BAND), key: B_MAJOR, settings: { chords: chords('lift', 2), sceneEnergy: 5, bandJobs: DRIVE, fillAmount: 0.35 }, wayIn: CUT, leadIn: 'stop' },
  // 5:52 More: the snare rolling into every fourth pass, the toms, Magenta busiest.
  { name: 'Final ascent', pass: 64, loops: slots(...DOUBLE_BAND, 'Snare roll fast'), key: B_MAJOR, settings: { chords: chords('lift', 2), sceneEnergy: 5, bandJobs: DRIVE, fillAmount: 0.4 }, wayIn: CUT },
];

/** The pass the Big finish begins on: right after the last scene's eighth pass. */
export const DEMO_END_PASS = 72;

/** Each scene's own ideas: fixed, so each plays the same every time. */
const sceneIdeas = (i: number): number => 7001 + i * 101;

/**
 * When a scene is due: a second before its pass begins, so it lands exactly on that pass (a
 * scene's loops come in at the next pass), and its lead-in plays in the pass before.
 */
export function demoDueAt(pass: number): number {
  return pass === 0 ? 0 : Math.max(0, Math.floor(pass * DEMO_PASS_SEC) - 1);
}

/**
 * The demo's scenes, each with Magenta's ideas frozen for it (see demoIdeas.ts; one for every
 * four passes), so every run replays them from the first, whoever plays.
 */
export function demoScenes(frozen: Readonly<Record<string, readonly KeptIdea[]>> = DEMO_FROZEN_IDEAS): Scene[] {
  return DEMO_SCENES.map((s, i) => ({
    id: `demo-${i + 1}`,
    name: s.name,
    loops: [...s.loops],
    settings: {
      ...BASE, ...s.settings,
      chords: { ...(s.settings.chords ?? BASE.chords) },
      bandJobs: { ...(s.settings.bandJobs ?? BASE.bandJobs) },
    },
    at: demoDueAt(s.pass),
    wayIn: s.wayIn,
    ideas: sceneIdeas(i),
    key: { ...s.key, semitones: [...s.key.semitones] },
    ...(s.leadIn ? { leadIn: s.leadIn } : {}),
    ...(frozen[`demo-${i + 1}`]?.length ? { aiIdeas: frozen[`demo-${i + 1}`].map((k) => ({ key: k.key, notes: k.notes.map((n) => ({ ...n, cell: { ...n.cell } })) })) } : {}),
  }));
}

/**
 * 7:00, the longest a piece can be, ending by itself with the Big finish: asked for during the
 * last scene's eighth pass, it builds over two passes from pass 72, the drums roll, the band
 * broadens into one huge B major chord across every instrument, and it rings out by 7:00.
 */
export const DEMO_PERFORMANCE: PerformanceSettings = {
  lengthSec: 420, ending: 'auto', style: 'big', fadePasses: 2, startOn: 'play', countIn: false,
};

/** A colour's sound settings, as a player keeps them (only the fields the demo changes). */
export interface DemoVoiceSettings {
  role: string;
  instrument?: string;
  plays?: 'note' | 'tune';
  reverbSend?: number;
}

/** How far each of Tim's colours sends to the shared room in the demo: his notes ring in the pads' space. */
export const DEMO_COLOUR_REVERB = 0.5;
/** Tim's own track in Ableton, "Tim's glow": every one of his counters plays there. */
export const DEMO_PLAYER_TRACK = 14;

/**
 * Tim's counters as one soft voice (the composition, version 2): in the demo every one of his
 * colours plays the soft pad, one note per counter, with a big reverb send, and over MIDI on
 * his own track, Tim's glow (DEMO_PLAYER_TRACK). A bass or drums colour becomes a melody pad
 * too, so it sounds in the glow's register, in the key, not two octaves down or as a drum
 * hit; a chord colour keeps its chord. His control colours are untouched, and so is his own
 * player. In the key's pentatonic scale, whatever he places sounds well.
 */
export function demoColourVoices<T extends DemoVoiceSettings>(colours: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, c] of Object.entries(colours)) {
    const role = c.role === 'chord' ? 'chord'
      : c.role === 'melody' || c.role === 'bass' || c.role === 'drums' ? 'melody'
        : null;
    out[id] = role ? { ...c, role, instrument: 'synth:pad', plays: 'note', reverbSend: DEMO_COLOUR_REVERB } : { ...c };
  }
  return out;
}

/** The demo as one of the player's pieces. */
export function demoPieceEntry(): SavedPiece {
  return { id: DEMO_PIECE_ID, name: DEMO_PLAYER_NAME, scenes: demoScenes(), performance: { ...DEMO_PERFORMANCE }, colourComesInAt: {} };
}

/**
 * The demo's music, as the settings it sets on its player. Everything else (the colours,
 * the cap, the iPad, the hand, the ranges, the mix) is the player's it was made from.
 */
export function demoMusic(): Partial<BoardSequencerStored> {
  const piece = demoPieceEntry();
  return {
    rows: ROWS,
    cols: COLS,
    numPages: 1,
    pages: [],
    pingPong: false,
    loopStepsRed: 0,
    loopStepsBlack: 0,
    loopStepsBlue: 0,
    scaleRootMidi: A_MAJOR.rootMidi,
    scaleSemitones: [...A_MAJOR.semitones],
    scaleName: A_MAJOR.scaleName,
    octaveShift: 0,
    bpm: DEMO_BPM,
    swing: 0,
    humanize: 0,
    // Tim's own counters, nudged off-centre, still play every other pass.
    variationEnabled: true,
    // Long notes, so every note (Tim's included) rings into the pads.
    noteLengthBeats: 2,
    studioMix: true,
    energy: 0.5,
    // A bigger room than the world's own, shared by every part, so everything sits in one space.
    space: 0.75,
    soundWorld: 'warm',
    phrases: true,
    fillAmount: 0,
    fillSeed: 1,
    fillKept: null,
    // Magenta's extra notes: the AI's answers around the theme, a new idea every four passes.
    fillEngine: 'magenta',
    aiEvolves: true,
    evolveAmount: 0,
    evolveSeed: 1,
    evolveHoldLap: null,
    // A little life, the same every time: the loops breathe in loudness over four passes.
    // Kept under 0.25, where Vary starts lifting and thinning the tunes.
    loopVary: 0.2,
    band: 'full',
    // The band's pads join the loops (there may be no counter on the board in the demo).
    bandWithLoops: true,
    // Two pad layers, louder than usual: the pads lead.
    widePads: true,
    chords: chords('glow'),
    // The written notes are played as written: pentatonic, they sit in every chord.
    clashNudge: false,
    bandJobs: { ...NO_BAND },
    sceneEnergy: 0,
    pieceIdeas: DEMO_IDEAS,
    surpriseMe: false,
    loopSlots: DEMO_LOOPS.map((l) => l.cells.map((c) => ({ ...c }))),
    loopNames: DEMO_LOOPS.map((l) => l.name),
    loopFadePasses: 1,
    scenes: piece.scenes,
    currentScene: null,
    colourComesInAt: {},
    performance: { ...DEMO_PERFORMANCE },
    pieces: [piece],
    pieceId: DEMO_PIECE_ID,
    laptopBoard: [],
    autoStart: false,
    // One track per part in Ableton, and Tim's counters on their own track above the loops.
    midiChannelMode: 'part',
    midiLoopChannels: false,
    playerTrack: DEMO_PLAYER_TRACK,
  };
}
