/**
 * The demo piece: a ready-made piece of seven minutes that plays the same every time.
 *
 * On the usual 8 by 8 board at 87 BPM a pass is two bars of 4/4 (8 beats, about 5.5 s).
 *
 * The sound (the owner's listening, 2026-11-06: the first version's pop chords and tunes
 * were cheesy and twee; the shimmer, a drone with the harp in the pentatonic scale, was the
 * best of it; more pads, quieter instruments; no pop progression, no plain triads): the pads
 * lead. The harmony is a drone or a pair of colour chords (ninths, suspensions) per scene,
 * each held two or four bars, held by two layers of pads and the band's bass. Every tune is in the pentatonic scale, so it sits
 * in any of those chords as colour (a ninth, a sixth, a major seventh) and never rubs. The
 * guitar strums whatever chord the pads hold; the trombone plays long soft notes; the harp
 * and the clarinet take turns with the tune; all of them quiet, inside the pads.
 *
 * The plan, in twelve scenes: drums and pads (the pads alone hold the opening for eight
 * passes); the trombone; the guitar; the harp; a shimmer over a drone; the clarinet; the
 * clarinet rising over the driving guitar; a breakdown in A minor over a drone; a lament,
 * the clarinet in A minor; home to A major; up a tone to B major with the harp; and the
 * clarinet soaring over the full band into the Big finish.
 *
 * Each tune is stated on one pass and decorated on the next (its Variation counters), so a
 * phrase is four bars. Every change lands on the downbeat of a pass that is a multiple of
 * four, after the drums' fill (the last bar of every fourth pass) or a lead-in fill.
 *
 * The same every time: the drums play the warm world's grooves, every other note is
 * written here, and the extra notes and the band come from the rules with fixed ideas.
 *
 * Ableton, one track per part: the harp and the clarinet are both melody, so they never
 * play at the same moment (each change between them is a cut at the pass).
 *
 * Pure: the profile code makes the player, this only says what the music is.
 */

import type { BoardSequencerStored, StoredLoopCell } from '../../profiles/BoardSequencerConfig';
import type { Scene, SceneKey, SceneSettings } from '../performance/launcher';
import type { PerformanceSettings } from '../performance/clock';
import type { SavedPiece } from '../performance/pieces';
import type { ChordSetting } from '../harmony/currentChord';
import { loopColourId, type LoopJob } from '../performance/loopSounds';

export const DEMO_PLAYER_ID = 'demo';
export const DEMO_PLAYER_NAME = 'Demo piece';
export const DEMO_PIECE_ID = 'demo-piece';
/**
 * The demo's music, by revision: a demo player made from an older one has its music written
 * afresh when opened, so a laptop that has pulled a newer ADMI always plays the newest demo.
 */
export const DEMO_REVISION = 8;

const ROWS = 8;
const COLS = 8;
/** 87: the Big finish then starts exactly at the end of the last scene's eighth pass, and ends by 7:00. */
export const DEMO_BPM = 87;
/** The piece's own ideas: every choice the rules make comes from these, so it plays the same. */
export const DEMO_IDEAS = 20261106;

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];
/** The melody's bottom row is the key note: A4 (the bass two octaves under). */
export const A_MAJOR: SceneKey = { rootMidi: 69, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };
export const A_MINOR: SceneKey = { rootMidi: 69, scaleName: 'Minor pentatonic', semitones: MINOR_PENT };
export const B_MAJOR: SceneKey = { rootMidi: 71, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };

/** Steps of the pentatonic scale from the bottom row (in A major: A B C# E F# A' B' C#'). */
const S1 = 0, S2 = 1, S3 = 2, S5 = 3, S6 = 4, S8 = 5, S9 = 6, S10 = 7;

/** A written note: its step in the pass (0 to 7) and its step of the scale (0 to 7). */
type Written = readonly [col: number, degree: number];

/** How a loop is played, beyond its notes. */
interface Feel {
  /** A bass loop playing a line over the band's bass, which keeps the roots under it. */
  overBass?: boolean;
  /** A chord loop strumming whatever chord the pads hold. */
  follows?: boolean;
  /** How far behind the beat it sits, in beats (a player is never exactly on the grid). */
  layBack?: number;
  /** Each note held this many beats, whatever comes next. */
  hold?: number;
}

/**
 * A loop: its notes on every pass, and its decorations on every other pass (the Variation
 * counters), a little softer, so the second pass answers the first. Each note sits a touch
 * behind the beat, more between beats than on them, the same every time.
 */
function notes(
  job: LoopJob, sound: string, line: readonly Written[], velocity: number, decorations: readonly Written[] = [], feel: Feel = {},
): StoredLoopCell[] {
  const colour = loopColourId(job, sound);
  const lay = feel.layBack ?? 0;
  const cell = (col: number, degree: number, v: number, conditional: boolean): StoredLoopCell => ({
    row: ROWS - 1 - degree, col, colour, job, sound, plays: 'note', velocity: v,
    ...(conditional ? { conditional: true } : {}),
    ...(feel.overBass ? { overBass: true as const } : {}),
    ...(feel.follows ? { follows: true as const } : {}),
    ...(feel.hold ? { holdBeats: feel.hold } : {}),
    ...(lay > 0 && col > 0 ? { timingBeats: Math.round((col % 2 === 0 ? lay * 0.5 : lay) * 1000) / 1000 } : {}),
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

/** The guitar: a gentle strum of whatever chord the pads hold, on 1, the and of 2, and 4 of each bar. */
const GUITAR_LINE: Written[] = [[0, S1], [3, S1], [6, S1]];
/** ...and on the answering pass two more, so the second pass moves. */
const GUITAR_ANSWER: Written[] = [[4, S1], [7, S1]];
/** The driving guitar: a strum on every beat. */
const GUITAR_DRIVE: Written[] = Array.from({ length: 8 }, (_, c) => [c, S1] as const);
/**
 * The trombone as a brass pad, not a tune (the owner, 2026-11-06: its melody sounded cheesy
 * whatever the notes; a pad-like trombone instead): an open fifth (A and E in A) held under
 * the pads for half a pass, then a breath; on the second pass it is held through. Both notes
 * sit in every chord the pads hold, the band's bass under them.
 */
const TROMBONE_LINE: Written[] = [[0, S1], [0, S5]];
/** ...the second pass held through: the fifth sounded again halfway. */
const TROMBONE_ANSWER: Written[] = [[4, S1], [4, S5]];
/** The trombone's pedal: a soft low note held under the shimmer. */
const TROMBONE_PEDAL: Written[] = [[0, S1]];
/** The harp: a flowing pentatonic figure, one note a beat, rising and turning. */
const HARP_LINE: Written[] = [[0, S1], [1, S5], [2, S2], [3, S6], [4, S3], [5, S8], [6, S5], [7, S2]];
/** ...answered with a second note on the strong beats. */
const HARP_ANSWER: Written[] = [[0, S3], [2, S5], [4, S6]];
/** The clarinet: up to the sixth and back to the fifth, held, a pickup leading round. */
const CLARINET_LINE: Written[] = [[0, S3], [2, S5], [3, S6], [4, S5], [7, S2]];
/** ...answered with a step between. */
const CLARINET_FILLED: Written[] = [[6, S3]];
/** The clarinet rising: an octave higher, up to the top and turning. */
const CLARINET_ANSWER: Written[] = [[0, S8], [2, S6], [3, S5], [4, S6], [6, S9], [7, S8]];
/** ...answered with the step up into the top. */
const CLARINET_ANSWER_PASSING: Written[] = [[5, S8]];
/** The clarinet in the last scene: high, held, the top note again and again. */
const CLARINET_SOARS: Written[] = [[0, S8], [2, S10], [3, S9], [4, S8], [6, S6], [7, S8]];
/** ...answered with a step into the top. */
const CLARINET_SOARS_ANSWER: Written[] = [[1, S9]];

/** The trombone: over the band's bass, a little behind the beat. */
const HORN: Feel = { overBass: true, layBack: 0.03 };
/** Held a whole pass, sounded again at the top of the next: one long swell (the owner, 2026-11-06: more atmosphere). */
const HORN_HELD: Feel = { ...HORN, hold: 8 };
const STRUM: Feel = { follows: true };

/** The loops, by slot, with their names. Quiet: they sit inside the pads. */
export const DEMO_LOOPS: readonly { name: string; cells: StoredLoopCell[] }[] = [
  { name: 'Drums', cells: groove(1, 0.6) },
  { name: 'Trombone', cells: notes('bass', 'trombone', TROMBONE_LINE, 0.38, TROMBONE_ANSWER, HORN) },
  { name: 'Guitar', cells: notes('chord', 'guitarAcoustic', GUITAR_LINE, 0.4, GUITAR_ANSWER, STRUM) },
  { name: 'Harp', cells: notes('melody', 'harp', HARP_LINE, 0.44, HARP_ANSWER, { layBack: 0.02 }) },
  { name: 'Clarinet', cells: notes('melody', 'clarinet', CLARINET_LINE, 0.5, CLARINET_FILLED, { layBack: 0.035 }) },
  { name: 'Drums busier', cells: groove(2, 0.66) },
  { name: 'Big drums', cells: groove(3, 0.78) },
  { name: 'Guitar drive', cells: notes('chord', 'guitarAcoustic', GUITAR_DRIVE, 0.44, [], STRUM) },
  { name: 'Clarinet soars', cells: notes('melody', 'clarinet', CLARINET_SOARS, 0.6, CLARINET_SOARS_ANSWER, { layBack: 0.03 }) },
  { name: 'Clarinet answer', cells: notes('melody', 'clarinet', CLARINET_ANSWER, 0.54, CLARINET_ANSWER_PASSING, { layBack: 0.035 }) },
  { name: 'Trombone pedal', cells: notes('bass', 'trombone', TROMBONE_PEDAL, 0.32, [], HORN_HELD) },
  { name: 'Drums soft', cells: groove(0, 0.5) },
  { name: 'Trombone held', cells: notes('bass', 'trombone', TROMBONE_LINE, 0.36, [], HORN_HELD) },
];

const SLOT = new Map(DEMO_LOOPS.map((l, i) => [l.name, i]));
const slots = (...names: string[]): number[] => names.map((n) => SLOT.get(n) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);

/** One pass, in seconds: two bars of four beats. */
export const DEMO_PASS_SEC = (COLS * 60) / DEMO_BPM;

/** The band: its pads and bass, never its drums or tunes. */
const PADS_AND_BASS = { asBefore: false, pads: true, bass: true, drums: false, counter: false };
const PADS_ONLY = { asBefore: false, pads: true, bass: false, drums: false, counter: false };

/**
 * The scenes' chords, slow and never a pop progression (the owner, 2026-11-06: I V vi IV,
 * and the same four reordered, were cheesy and boring): a drone, or a pair of colour chords
 * (with ninths, suspended), each held two or four bars. Lift: the key note suspended, then ii.
 * Float: home, then vi. Shade: vi, then ii, wistful. In A minor only Float (ii is diminished).
 */
const DRONE: ChordSetting = { sequence: 'still', bars: 2 };
const LIFT: ChordSetting = { sequence: 'lift', bars: 4 };
const LIFT_MOVING: ChordSetting = { sequence: 'lift', bars: 2 };
const FLOAT: ChordSetting = { sequence: 'float', bars: 4 };
const FLOAT_MOVING: ChordSetting = { sequence: 'float', bars: 2 };
const SHADE: ChordSetting = { sequence: 'shade', bars: 2 };

const BASE: SceneSettings = {
  soundWorld: 'warm',
  band: 'full',
  phrases: true,
  fillAmount: 0,
  evolveAmount: 0,
  bpm: DEMO_BPM,
  chords: DRONE,
  bandJobs: PADS_AND_BASS,
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
  // The drums and the pads: the pads lifting slowly between A (suspended) and B minor, alone
  // with the groove for eight passes.
  { name: 'Drums and pads', pass: 0, loops: slots('Drums'), key: A_MAJOR, settings: { chords: LIFT }, wayIn: { kind: 'cut' } },
  // The trombone enters holding its open fifth a whole pass at a time over the pads' drone.
  { name: 'Trombone', pass: 8, loops: slots('Drums', 'Trombone held'), key: A_MAJOR, settings: { chords: DRONE }, wayIn: { kind: 'cut' } },
  // The guitar strums the pads' chords, which float between A and F# minor; the trombone still
  // holds whole passes.
  {
    name: 'Guitar', pass: 12, loops: slots('Drums busier', 'Trombone held', 'Guitar'), key: A_MAJOR,
    settings: { chords: FLOAT, sceneEnergy: 3 }, wayIn: { kind: 'fade', passes: 1 },
  },
  // The harp drifts in over a pass, a few extra notes around it; the trombone begins to breathe.
  {
    name: 'Harp', pass: 16, loops: slots('Drums busier', 'Trombone', 'Guitar', 'Harp'), key: A_MAJOR,
    settings: { chords: FLOAT, sceneEnergy: 3, fillAmount: 0.08 }, wayIn: { kind: 'fade', passes: 1 },
  },
  // A shimmer: the harp over the trombone's held note and the pads' drone.
  { name: 'Shimmer', pass: 24, loops: slots('Harp', 'Trombone pedal'), key: A_MAJOR, settings: { chords: DRONE, sceneEnergy: 1 }, wayIn: { kind: 'cut' } },
  // A fill, and the clarinet takes the tune over the lifting chords.
  {
    name: 'Clarinet', pass: 28, loops: slots('Drums busier', 'Trombone', 'Guitar', 'Clarinet'), key: A_MAJOR,
    settings: { chords: LIFT, sceneEnergy: 3, fillAmount: 0.1 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // The clarinet rises, an octave up, over the guitar strumming every beat and the two minor
  // chords: the build before the breakdown.
  {
    name: 'Clarinet rises', pass: 36, loops: slots('Drums busier', 'Trombone', 'Guitar drive', 'Clarinet answer'), key: A_MAJOR,
    settings: { chords: SHADE, sceneEnergy: 4, fillAmount: 0.12 }, wayIn: { kind: 'cut' },
  },
  // The breakdown: the guitar and the harp in A minor over the pads' drone.
  {
    name: 'Breakdown', pass: 40, loops: slots('Guitar', 'Harp'), key: A_MINOR,
    settings: { chords: DRONE, sceneEnergy: 1, band: 'gentle', bandJobs: PADS_ONLY }, wayIn: { kind: 'cut' },
  },
  // A lament: the clarinet in A minor over A minor and F, the trombone's held A under it, the
  // softest groove.
  {
    name: 'Lament', pass: 44, loops: slots('Drums soft', 'Trombone pedal', 'Guitar', 'Clarinet'), key: A_MINOR,
    settings: { chords: FLOAT, sceneEnergy: 2 }, wayIn: { kind: 'cut' },
  },
  // A fill, and home to A major, the harp again.
  {
    name: 'Home', pass: 48, loops: slots('Drums', 'Trombone', 'Guitar', 'Harp'), key: A_MAJOR,
    settings: { chords: LIFT, sceneEnergy: 3, fillAmount: 0.08 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // Up a tone to B major after a fill, the biggest drums, the guitar driving, the harp
  // ringing over the floating chords.
  {
    name: 'Up to B major', pass: 56, loops: slots('Big drums', 'Trombone', 'Guitar drive', 'Harp'), key: B_MAJOR,
    settings: { chords: FLOAT_MOVING, sceneEnergy: 4, fillAmount: 0.15 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // The clarinet soars over the full band and the lifting chords, into the Big finish.
  {
    name: 'Clarinet soars', pass: 64, loops: slots('Big drums', 'Trombone', 'Guitar drive', 'Clarinet soars'), key: B_MAJOR,
    settings: { chords: LIFT_MOVING, sceneEnergy: 5, fillAmount: 0.2 }, wayIn: { kind: 'cut' },
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
    // A bigger room than the world's own, shared by every part, so the instruments sit in the pads.
    space: 0.75,
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
    // under 0.25, where Vary starts lifting and thinning the tunes.
    loopVary: 0.2,
    band: 'full',
    // The band's pads join the loops (there may be no counter on the board in the demo).
    bandWithLoops: true,
    // Two pad layers, louder than usual: the pads lead.
    widePads: true,
    chords: { ...LIFT },
    // The written notes are played as written: pentatonic, they sit in every chord.
    clashNudge: false,
    bandJobs: { ...PADS_AND_BASS },
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
