/**
 * The demo piece: a ready-made piece of seven minutes, written note by note, that plays the
 * same every time.
 *
 * On the usual 8 by 8 board at 87 BPM a pass is two bars of 4/4 (8 beats, about 5.5 s).
 * The chords are I V vi IV, two beats each (in A major: A, E, F sharp minor, D): the guitar
 * plays them, the trombone carries the bass, the harp and the clarinet take turns with the
 * tune. Every note is a step of the scale, so when a scene changes the key the same loops
 * sing in the new mode.
 *
 * The tunes are four bars long: each loop plays plain on one pass and decorated on the next
 * (its Variation counters: a passing note, a second harp note, an extra strum), so a phrase
 * is stated and then answered, and never just repeats.
 *
 * The plan, in twelve scenes: the drums alone; the trombone; the guitar; the harp (A major);
 * a shimmer over a drone, the harp in the pentatonic scale; the clarinet in A mixolydian,
 * then answering higher over the driving guitar; a breakdown in A minor, guitar and harp;
 * a lament, the clarinet in A minor over soft drums; back home to A major with a walking
 * trombone; up a tone to B major with the harp over everything; and the clarinet soaring
 * over the full band into the Big finish.
 *
 * Every change lands on the downbeat of a pass that is a multiple of four, so the drums'
 * fill (the last bar of every fourth pass) or a lead-in fill announces it, and every note on
 * a strong beat is a note of its chord. The joins between keys are the classic ones: D major
 * opening onto the A drone and onto A minor, D minor into A major (the minor iv to I), and
 * the trombone's E under D major falling to B (IV to I of the new key).
 *
 * The same every time: the drums play the warm world's grooves, every other note is
 * written here, and the extra notes and the band's pads come from the rules with fixed
 * ideas (Magenta's ideas can't be fixed, so the demo doesn't use them).
 *
 * Ableton, one track per part: the harp and the clarinet are both melody, so they never
 * play at the same moment (each change between them is a cut at the pass, so the Melody
 * track's instrument switches cleanly).
 *
 * Pure: the profile code makes the player, this only says what the music is.
 */

import type { BoardSequencerStored, StoredLoopCell } from '../../profiles/BoardSequencerConfig';
import type { Scene, SceneKey, SceneSettings } from '../performance/launcher';
import type { PerformanceSettings } from '../performance/clock';
import type { SavedPiece } from '../performance/pieces';
import { loopColourId, type LoopJob } from '../performance/loopSounds';

export const DEMO_PLAYER_ID = 'demo';
export const DEMO_PLAYER_NAME = 'Demo piece';
export const DEMO_PIECE_ID = 'demo-piece';

const ROWS = 8;
const COLS = 8;
/** 87, not 90: the Big finish then starts exactly at the end of the last scene's eighth pass, and ends by 7:00. */
export const DEMO_BPM = 87;
/** The piece's own ideas: every choice the rules make comes from these, so it plays the same. */
export const DEMO_IDEAS = 20261106;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** The melody's bottom row is the key note: A4 (the trombone two octaves under, from A2). */
export const A_MAJOR: SceneKey = { rootMidi: 69, scaleName: 'Major', semitones: MAJOR };
export const A_MIXOLYDIAN: SceneKey = { rootMidi: 69, scaleName: 'Mixolydian', semitones: [0, 2, 4, 5, 7, 9, 10] };
export const A_MINOR: SceneKey = { rootMidi: 69, scaleName: 'Minor', semitones: [0, 2, 3, 5, 7, 8, 10] };
export const A_PENTATONIC: SceneKey = { rootMidi: 69, scaleName: 'Major pentatonic', semitones: [0, 2, 4, 7, 9] };
export const B_MAJOR: SceneKey = { rootMidi: 71, scaleName: 'Major', semitones: MAJOR };

/** Steps of the scale from the bottom row (in A major: A B C# D E F# G# A). */
const I = 0, II = 1, III = 2, IV = 3, V = 4, VI = 5, VII = 6, VIII = 7;

/** A written note: its step in the pass (0 to 7) and its step of the scale (0 to 7). */
type Written = readonly [col: number, degree: number];

/**
 * A loop: its notes on every pass, and its decorations on every other pass (the Variation
 * counters), a little softer, so the second pass answers the first.
 */
function notes(job: LoopJob, sound: string, line: readonly Written[], velocity: number, decorations: readonly Written[] = []): StoredLoopCell[] {
  const colour = loopColourId(job, sound);
  const cell = (col: number, degree: number, v: number, conditional: boolean): StoredLoopCell => ({
    row: ROWS - 1 - degree, col, colour, job, sound, plays: 'note', velocity: v, ...(conditional ? { conditional: true } : {}),
  });
  return [
    ...line.map(([col, degree]) => cell(col, degree, velocity, false)),
    ...decorations.map(([col, degree]) => cell(col, degree, Math.round(velocity * 0.88 * 100) / 100, true)),
  ];
}

/**
 * A drum groove: one counter at the start of the pass plays the warm world's groove for the
 * whole pass (a fill in the last bar of every fourth pass). Its row says how busy, 0 to 3.
 */
function groove(level: 0 | 1 | 2 | 3, velocity: number): StoredLoopCell[] {
  // The groove's level is the counter's height in quarters of the board (see phrases).
  const degree = level * 2 + 1;
  return [{ row: ROWS - 1 - degree, col: 0, colour: loopColourId('drums', ''), job: 'drums', sound: '', plays: 'tune', velocity }];
}

/** The chords, I V vi IV, two beats each: a strum on 1, 3 and 4 of each bar, each held to the next. */
const GUITAR_LINE: Written[] = [[0, I], [2, V], [3, V], [4, VI], [6, IV], [7, IV]];
/** ...and on the answering pass, a strum on the second beat of each bar too. */
const GUITAR_ANSWER: Written[] = [[1, I], [5, VI]];
/** The driving guitar: a strum on every beat. */
const GUITAR_DRIVE: Written[] = [[0, I], [1, I], [2, V], [3, V], [4, VI], [5, VI], [6, IV], [7, IV]];
/** The trombone: from the low root up to the V, through vi and IV (F#, E, D by step), the V leading home. */
const TROMBONE_LINE: Written[] = [[0, I], [2, V], [4, VI], [5, V], [6, IV], [7, V]];
/** ...answered with passing notes up to the E and down to the B. */
const TROMBONE_ANSWER: Written[] = [[1, III], [3, II]];
/** The trombone walking: a note on every beat. */
const TROMBONE_WALK: Written[] = [[0, I], [1, III], [2, V], [3, II], [4, VI], [5, III], [6, IV], [7, V]];
/** The trombone's pedal: the low A held under the shimmer. */
const TROMBONE_PEDAL: Written[] = [[0, I]];
/** The harp: broken chords on every beat, up through the A chord, the high A, and down to D. */
const HARP_LINE: Written[] = [[0, I], [1, III], [2, V], [3, II], [4, III], [5, VIII], [6, VI], [7, IV]];
/** ...answered with a second note on each strong beat, a fifth, a third, a fourth and a third above. */
const HARP_ANSWER: Written[] = [[0, V], [2, VII], [4, VI], [6, VIII]];
/** The clarinet: long notes, up a third to the V chord's third, and gently down by step. */
const CLARINET_LINE: Written[] = [[0, V], [2, VII], [4, VI], [5, V], [6, IV]];
/** ...answered with the steps between filled in. */
const CLARINET_FILLED: Written[] = [[1, VI], [3, V], [7, VI]];
/** The clarinet's answer: it climbs (C#, E, then the third of the V chord) to the high A, and comes down to E. */
const CLARINET_ANSWER: Written[] = [[0, III], [1, V], [2, VII], [4, VIII], [6, VI], [7, V]];
/** ...answered with passing notes into the high A and out of it. */
const CLARINET_ANSWER_PASSING: Written[] = [[3, VI], [5, VII]];
/** The clarinet in the last scene: an octave above its start, singing from the top. */
const CLARINET_SOARS: Written[] = [[0, VIII], [2, VII], [3, V], [4, VI], [5, VIII], [6, VI]];
/** ...answered with the leading note pulling up to the top again. */
const CLARINET_SOARS_ANSWER: Written[] = [[1, VI], [7, VII]];

/** The loops, by slot, with their names. */
export const DEMO_LOOPS: readonly { name: string; cells: StoredLoopCell[] }[] = [
  { name: 'Drums', cells: groove(1, 0.75) },
  { name: 'Trombone', cells: notes('bass', 'trombone', TROMBONE_LINE, 0.76, TROMBONE_ANSWER) },
  { name: 'Guitar', cells: notes('chord', 'guitarAcoustic', GUITAR_LINE, 0.6, GUITAR_ANSWER) },
  { name: 'Harp', cells: notes('melody', 'harp', HARP_LINE, 0.64, HARP_ANSWER) },
  { name: 'Clarinet', cells: notes('melody', 'clarinet', CLARINET_LINE, 0.74, CLARINET_FILLED) },
  { name: 'Drums busier', cells: groove(2, 0.8) },
  { name: 'Big drums', cells: groove(3, 0.9) },
  { name: 'Guitar drive', cells: notes('chord', 'guitarAcoustic', GUITAR_DRIVE, 0.66) },
  { name: 'Clarinet soars', cells: notes('melody', 'clarinet', CLARINET_SOARS, 0.84, CLARINET_SOARS_ANSWER) },
  { name: 'Clarinet answer', cells: notes('melody', 'clarinet', CLARINET_ANSWER, 0.78, CLARINET_ANSWER_PASSING) },
  { name: 'Trombone pedal', cells: notes('bass', 'trombone', TROMBONE_PEDAL, 0.6) },
  { name: 'Trombone walk', cells: notes('bass', 'trombone', TROMBONE_WALK, 0.74) },
  { name: 'Drums soft', cells: groove(0, 0.6) },
];

const SLOT = new Map(DEMO_LOOPS.map((l, i) => [l.name, i]));
const slots = (...names: string[]): number[] => names.map((n) => SLOT.get(n) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);

/** One pass, in seconds: two bars of four beats. */
export const DEMO_PASS_SEC = (COLS * 60) / DEMO_BPM;

const BASE: SceneSettings = {
  soundWorld: 'warm',
  band: 'off',
  phrases: true,
  fillAmount: 0,
  evolveAmount: 0,
  bpm: DEMO_BPM,
  // One chord that never moves under the loops: the guitar's counters name every chord.
  chords: { sequence: 'still', bars: 2 },
  bandJobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false },
  sceneEnergy: 2,
};

interface SceneSpec {
  name: string;
  /** The pass it lands on: a multiple of four, right after a fill. */
  pass: number;
  loops: number[];
  key: SceneKey;
  settings: Partial<SceneSettings>;
  wayIn: NonNullable<Scene['wayIn']>;
  leadIn?: Scene['leadIn'];
}

/** The plan, in passes (a pass is about 5.5 s): twelve scenes, seven minutes. */
export const DEMO_SCENES: readonly SceneSpec[] = [
  // The groove alone, its fill on the fourth pass calling the trombone in.
  { name: 'Drums', pass: 0, loops: slots('Drums'), key: A_MAJOR, settings: { sceneEnergy: 2 }, wayIn: { kind: 'cut' } },
  // The trombone lands on the one, right after the fill.
  { name: 'Trombone', pass: 4, loops: slots('Drums', 'Trombone'), key: A_MAJOR, settings: { sceneEnergy: 2 }, wayIn: { kind: 'cut' } },
  // The guitar swells in over a pass as the drums open up.
  { name: 'Guitar', pass: 8, loops: slots('Drums busier', 'Trombone', 'Guitar'), key: A_MAJOR, settings: { sceneEnergy: 3 }, wayIn: { kind: 'fade', passes: 1 } },
  // The harp drifts in over a pass, a few extra notes around it.
  {
    name: 'Harp', pass: 16, loops: slots('Drums busier', 'Trombone', 'Guitar', 'Harp'), key: A_MAJOR,
    settings: { sceneEnergy: 3, fillAmount: 0.1 }, wayIn: { kind: 'fade', passes: 1 },
  },
  // A shimmer: everything falls away but the harp, now in the pentatonic scale, over the
  // trombone's low A and the band's open fifth (the D chord that ended the pass opens onto it).
  {
    name: 'Shimmer', pass: 24, loops: slots('Harp', 'Trombone pedal'), key: A_PENTATONIC,
    settings: { sceneEnergy: 1, band: 'gentle' }, wayIn: { kind: 'cut' },
  },
  // A fill brings the drums back, and the clarinet takes the tune in A mixolydian: the G
  // natural softens the V chord to E minor.
  {
    name: 'Clarinet', pass: 28, loops: slots('Drums busier', 'Trombone', 'Guitar', 'Clarinet'), key: A_MIXOLYDIAN,
    settings: { sceneEnergy: 3, fillAmount: 0.12, band: 'gentle' }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // It answers higher, up to the top A, over the guitar strumming every beat: the build
  // before the breakdown.
  {
    name: 'Clarinet answers', pass: 36, loops: slots('Drums busier', 'Trombone', 'Guitar drive', 'Clarinet answer'), key: A_MIXOLYDIAN,
    settings: { sceneEnergy: 4, fillAmount: 0.15, band: 'gentle' }, wayIn: { kind: 'cut' },
  },
  // The breakdown: after the fill everything drops away but the guitar and the harp, in A
  // minor (the D major chord that ended the pass opens onto A minor).
  { name: 'Breakdown', pass: 40, loops: slots('Guitar', 'Harp'), key: A_MINOR, settings: { sceneEnergy: 1 }, wayIn: { kind: 'cut' } },
  // A lament: the clarinet's tune in A minor (E, G, F, E, D), the trombone under it and the
  // softest groove.
  {
    name: 'Lament', pass: 44, loops: slots('Drums soft', 'Trombone', 'Guitar', 'Clarinet'), key: A_MINOR,
    settings: { sceneEnergy: 2 }, wayIn: { kind: 'cut' },
  },
  // A fill, and home to A major from D minor (the minor iv into I): the harp again, the
  // trombone walking.
  {
    name: 'Home', pass: 48, loops: slots('Drums', 'Trombone walk', 'Guitar', 'Harp'), key: A_MAJOR,
    settings: { sceneEnergy: 3, fillAmount: 0.1 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // Up a tone to B major after a fill (the trombone's E under D major falls to B: IV to I of
  // the new key), the biggest drums, the guitar driving, the harp ringing over the top.
  {
    name: 'Up to B major', pass: 56, loops: slots('Big drums', 'Trombone', 'Guitar drive', 'Harp'), key: B_MAJOR,
    settings: { sceneEnergy: 4, fillAmount: 0.2, band: 'gentle' }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // The clarinet soars over the full band, the trombone walking, into the Big finish.
  {
    name: 'Clarinet soars', pass: 64, loops: slots('Big drums', 'Trombone walk', 'Guitar drive', 'Clarinet soars'), key: B_MAJOR,
    settings: { sceneEnergy: 5, fillAmount: 0.3, band: 'full' }, wayIn: { kind: 'cut' },
  },
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

export function demoScenes(): Scene[] {
  return DEMO_SCENES.map((s, i) => ({
    id: `demo-${i + 1}`,
    name: s.name,
    loops: [...s.loops],
    settings: { ...BASE, ...s.settings, chords: { ...BASE.chords }, bandJobs: { ...BASE.bandJobs } },
    at: demoDueAt(s.pass),
    wayIn: s.wayIn,
    ideas: sceneIdeas(i),
    key: { ...s.key, semitones: [...s.key.semitones] },
    ...(s.leadIn ? { leadIn: s.leadIn } : {}),
  }));
}

/**
 * 7:00, the longest a piece can be, ending by itself with the Big finish: the ending is
 * asked for during the last scene's eighth pass, builds over two passes from pass 72,
 * broadens, and the last chord rings out by 7:00.
 */
export const DEMO_PERFORMANCE: PerformanceSettings = {
  lengthSec: 420, ending: 'auto', style: 'big', fadePasses: 2, startOn: 'play', countIn: false,
};

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
    // The decorations play on every other pass: the tunes are four bars, stated and answered.
    variationEnabled: true,
    noteLengthBeats: 0.9,
    studioMix: true,
    energy: 0.5,
    soundWorld: 'warm',
    phrases: true,
    fillAmount: 0,
    fillSeed: 1,
    fillKept: null,
    fillEngine: 'rules',
    evolveAmount: 0,
    evolveSeed: 1,
    evolveHoldLap: null,
    // A little life, the same every time: the loops breathe in loudness over four passes, the
    // drums go a little busier or sparser now and then, a tune adds the odd passing note. Kept
    // under 0.25, where Vary starts lifting and thinning the tunes, so every written note on a
    // strong beat stays the chord's.
    loopVary: 0.2,
    band: 'off',
    chords: { ...BASE.chords },
    // The written notes are played as written: nothing moves them onto the chord.
    clashNudge: false,
    bandJobs: { ...BASE.bandJobs },
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
  };
}
