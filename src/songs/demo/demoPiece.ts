/**
 * The demo piece, "Rising Light": seven minutes that play the same every time.
 *
 * The composition is docs/superpowers/specs/2026-11-06-demo-composition-design.md (the owner's
 * brief, 2026-11-06: the old demo was boring and its instruments sounded bad; lean on pads;
 * mainly ambient, Tim's counters included; but never boring, with direction and drama).
 *
 * Cinematic ambient: one four-note theme (C#, B, A, then up to E) born in the dark, carried
 * by a pulse, rising to a summit and resolving into light. F sharp minor pentatonic until the
 * last minute, when it turns major. Every written note is in the pentatonic scale, so it sits
 * in every chord the pads hold (they carry the parent scale's D and G sharp); whatever Tim
 * places is in the key too.
 *
 * Ambient first: soft in, long out; nothing hits (the percussion is a heartbeat felt under the
 * pads, never above 0.6); every tune quieter than the pads, which lead.
 *
 * Never boring: every pass the theme asks or answers; every four bars the chord changes; every
 * scene something arrives, leaves or is transformed; across the piece a shape: dark and close,
 * a body arriving, a first climb, the hush, the long climb to the summit, then light.
 *
 * On the usual 8 by 8 board at 87 BPM a pass is two bars of 4/4 (8 beats, about 5.5 s).
 * Every change lands on the downbeat of a pass that is a multiple of four.
 *
 * Ableton, one track per part: each scene has one melody sound, one sound on the Bass track
 * and one on the Chords track.
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
export const DEMO_REVISION = 10;

const ROWS = 8;
const COLS = 8;
/** 87: the ending then starts exactly at the end of the last scene's eighth pass, and the chord rings out by 7:00. */
export const DEMO_BPM = 87;
/** The piece's own ideas: every choice the rules make comes from these, so it plays the same. */
export const DEMO_IDEAS = 20261106;

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];
/** The key: F sharp minor pentatonic, the key note F#4 on the bottom row (the chords from F sharp natural minor). */
export const F_SHARP_MINOR: SceneKey = { rootMidi: 66, scaleName: 'Minor pentatonic', semitones: MINOR_PENT };
/** The afterglow's light: F sharp major pentatonic (F#, G#, A#, C#, D#). */
export const F_SHARP_MAJOR: SceneKey = { rootMidi: 66, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };

/**
 * Steps of the pentatonic scale from the bottom row. In F sharp minor: F#4 A4 B4 C#5 E5 F#5
 * A5 B5; in F sharp major the same steps are F#4 G#4 A#4 C#5 D#5 F#5.
 */
const FS = 0, A = 1, B = 2, CS = 3, E = 4, FS2 = 5;

/** A written note: its step in the pass (0 to 7), its step of the scale, and how long it is held in beats. */
type Written = readonly [col: number, degree: number, hold?: number];

/** How a loop is played, beyond its notes. */
interface Feel {
  /** An octave or two away from its row's note. */
  octave?: number;
  /** A bass loop playing a line over the band's bass, which keeps its own note under it. */
  overBass?: boolean;
  /** A chord loop playing whatever chord the pads hold. */
  follows?: boolean;
  /** How far behind the beat it sits, in beats (a player is never exactly on the grid). */
  layBack?: number;
  /** Each note held this many beats unless the note says otherwise. */
  hold?: number;
}

/**
 * A loop: its notes on every pass, and its answer on every other pass (the Variation
 * counters), so the second pass answers the first. Each note sits a touch behind the beat,
 * more between beats than on them, the same every time.
 */
function notes(
  job: LoopJob, sound: string, line: readonly Written[], velocity: number, answer: readonly Written[] = [], feel: Feel = {},
): StoredLoopCell[] {
  const colour = loopColourId(job, sound);
  const lay = feel.layBack ?? 0;
  const cell = ([col, degree, hold]: Written, v: number, conditional: boolean): StoredLoopCell => {
    const holdBeats = hold ?? feel.hold;
    return {
      row: ROWS - 1 - degree, col, colour, job, sound, plays: 'note', velocity: v,
      ...(conditional ? { conditional: true } : {}),
      ...(feel.octave ? { octave: feel.octave } : {}),
      ...(feel.overBass ? { overBass: true as const } : {}),
      ...(feel.follows ? { follows: true as const } : {}),
      ...(holdBeats ? { holdBeats } : {}),
      ...(lay > 0 && col > 0 ? { timingBeats: Math.round((col % 2 === 0 ? lay * 0.5 : lay) * 1000) / 1000 } : {}),
    };
  };
  return [
    ...line.map((w) => cell(w, velocity, false)),
    ...answer.map((w) => cell(w, Math.round(velocity * 0.9 * 100) / 100, true)),
  ];
}

// ---- the theme ------------------------------------------------------------------------

/** The question, every pass: C# held three beats, B, A held two, then up to E, left open. */
const THEME_QUESTION: Written[] = [[0, CS, 3], [3, B, 1], [4, A, 2], [6, E, 2]];
/** The answer, every other pass: B and the F# above, falling back to C# as the next pass begins. */
const THEME_ANSWER: Written[] = [[5, B, 1], [7, FS2, 1]];
/** Dawn's distant fragment: the theme's first and third notes, C# and A, each held a bar. */
const BELLS_FRAGMENT: Written[] = [[0, CS, 4], [4, A, 4]];

// ---- the pulse ------------------------------------------------------------------------

/**
 * The pulse, soft eighth notes an octave over the bass: two counters a step, the second half a
 * beat late. F# on every strong beat, a pedal every chord of Tide and Rise welcomes.
 */
const PULSE_BAR: readonly [onBeat: number, offBeat: number][] = [[FS, CS], [A, E], [FS, CS], [A, B]];
function pulse(velocity: number): StoredLoopCell[] {
  const colour = loopColourId('bass', 'synth:pluck');
  const out: StoredLoopCell[] = [];
  for (let col = 0; col < COLS; col++) {
    const [on, off] = PULSE_BAR[col % 4];
    const base = { col, colour, job: 'bass' as const, sound: 'synth:pluck', plays: 'note' as const, octave: 1, overBass: true as const, holdBeats: 0.45 };
    out.push({ ...base, row: ROWS - 1 - on, velocity });
    // Between the beats a touch softer, as a player's hand would be.
    out.push({ ...base, row: ROWS - 1 - off, velocity: Math.round(velocity * 0.85 * 100) / 100, timingBeats: 0.5 });
  }
  return out;
}
/** The afterglow's pulse, in quarter notes: F#, C#, the third, C# (in the major: F#, C#, G#, C#). */
const PULSE_QUARTER: Written[] = [[0, FS], [2, CS], [4, A], [6, CS]];

// ---- the chords' own parts --------------------------------------------------------------

/** One swell a pass, the chord the pads hold, held through. */
const SWELL: Written[] = [[0, FS, 8]];
/** Soft rhythmic chords: 1, the and of 2, and 3 of the second bar; on the answering pass two more. */
const PULSE_CHORDS: Written[] = [[0, FS, 1], [3, FS, 1], [6, FS, 1]];
const PULSE_CHORDS_ANSWER: Written[] = [[4, FS, 1], [7, FS, 1]];

// ---- the percussion: soft, a heartbeat --------------------------------------------------

type Piece = 'kick' | 'rim' | 'snare' | 'hat' | 'tom' | 'crash';
/** Each kit piece on its own row, so no two counters share a square (the row picks nothing: the loop names its piece). */
const PIECE_ROW: Record<Piece, number> = { kick: 7, rim: 6, snare: 5, hat: 4, tom: 3, crash: 2 };
/** A hit: its step, its piece, half a beat late or not, every other pass or every pass, how loud. */
type Hit = readonly [col: number, piece: Piece, offBeat: boolean, everyOther: boolean, velocity: number];

function percussion(hits: readonly Hit[]): StoredLoopCell[] {
  const used = new Set<string>();
  return hits.map(([col, piece, offBeat, everyOther, velocity]) => {
    // The second of two hits of one piece on one step (a tom roll) takes the next row down.
    let row = PIECE_ROW[piece];
    while (used.has(`${col}:${row}`)) row = (row + ROWS - 1) % ROWS;
    used.add(`${col}:${row}`);
    return {
      row, col, colour: loopColourId('drums', piece), job: 'drums' as const, sound: piece, plays: 'note' as const, velocity,
      ...(offBeat ? { timingBeats: 0.5 } : {}),
      ...(everyOther ? { conditional: true } : {}),
    };
  });
}

const SHAKER_SOFT = 0.2;
/** A shaker breath on every "and": eight a pass. */
const shakerAnds = (v: number): Hit[] => Array.from({ length: COLS }, (_, c): Hit => [c, 'hat', true, false, v]);
/** The shaker on every eighth. */
const shakerEighths = (v: number): Hit[] => [
  ...Array.from({ length: COLS }, (_, c): Hit => [c, 'hat', false, false, Math.round(v * 0.8 * 100) / 100]),
  ...shakerAnds(v),
];

/** Heartbeat: a soft kick on 1 and on the and of 2, a rim click on 3 of each bar, the shaker breathing. */
const HEARTBEAT: Hit[] = [
  [0, 'kick', false, false, 0.45], [1, 'kick', true, false, 0.35],
  [4, 'kick', false, false, 0.42], [5, 'kick', true, false, 0.33],
  [2, 'rim', false, false, 0.3], [6, 'rim', false, false, 0.3],
  ...shakerAnds(SHAKER_SOFT),
];
/** Build: the heartbeat, a kick on 3 of bar 2, a brushed snare for the rim, the shaker on every eighth, toms rolling in every other pass. */
const BUILD: Hit[] = [
  [0, 'kick', false, false, 0.48], [1, 'kick', true, false, 0.38],
  [4, 'kick', false, false, 0.45], [5, 'kick', true, false, 0.36], [6, 'kick', false, false, 0.4],
  [2, 'snare', false, false, 0.38], [6, 'snare', false, false, 0.4],
  ...shakerEighths(0.24),
  [7, 'tom', false, true, 0.4], [7, 'tom', true, true, 0.46],
];
/** Summit: kick on 1, the and of 2, 3 and the and of 4; the brushed snare on 3; the shaker on every eighth; a cymbal swell every other pass. */
const SUMMIT: Hit[] = [
  ...[0, 4].flatMap((bar): Hit[] => [
    [bar, 'kick', false, false, 0.55], [bar + 1, 'kick', true, false, 0.45],
    [bar + 2, 'kick', false, false, 0.5], [bar + 3, 'kick', true, false, 0.42],
    [bar + 2, 'snare', false, false, 0.45],
  ]),
  ...shakerEighths(0.28),
  [0, 'crash', false, true, 0.5],
];

/** The loops, by slot, with their names. Every melodic note at or under 0.6: the pads lead. */
export const DEMO_LOOPS: readonly { name: string; cells: StoredLoopCell[] }[] = [
  { name: 'Bells', cells: notes('melody', 'synth:bell', BELLS_FRAGMENT, 0.42, [], { octave: 1 }) },
  { name: 'Piano question', cells: notes('melody', 'piano', THEME_QUESTION, 0.5, [], { layBack: 0.02 }) },
  { name: 'Piano theme', cells: notes('melody', 'piano', THEME_QUESTION, 0.5, THEME_ANSWER, { layBack: 0.02 }) },
  { name: 'Lead theme', cells: notes('melody', 'synth:keys', THEME_QUESTION, 0.5, THEME_ANSWER, { layBack: 0.02 }) },
  { name: 'Lead theme high', cells: notes('melody', 'synth:keys', THEME_QUESTION, 0.55, THEME_ANSWER, { layBack: 0.02, octave: 1 }) },
  { name: 'Pulse', cells: pulse(0.36) },
  { name: 'Pulse quarter', cells: notes('bass', 'synth:pluck', PULSE_QUARTER, 0.32, [], { octave: 1, overBass: true, hold: 1.8 }) },
  { name: 'Swells', cells: notes('chord', 'synth:pad', SWELL, 0.42, [], { follows: true }) },
  { name: 'Pulse chords', cells: notes('chord', 'synth:supersaw', PULSE_CHORDS, 0.34, PULSE_CHORDS_ANSWER, { follows: true }) },
  { name: 'Percussion heartbeat', cells: percussion(HEARTBEAT) },
  { name: 'Percussion build', cells: percussion(BUILD) },
  { name: 'Percussion summit', cells: percussion(SUMMIT) },
];

const SLOT = new Map(DEMO_LOOPS.map((l, i) => [l.name, i]));
const slots = (...names: string[]): number[] => names.map((n) => SLOT.get(n) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);

/** One pass, in seconds: two bars of four beats. */
export const DEMO_PASS_SEC = (COLS * 60) / DEMO_BPM;

/** The band: its pads and its bass (the sub), never its drums or its counter-melody. */
const jobs = (bass: boolean, pedal = false): BandJobs => ({
  asBefore: false, pads: true, bass, drums: false, counter: false, ...(pedal ? { pedal: true } : {}),
});
const PADS_ONLY = jobs(false);
const PADS_AND_PEDAL = jobs(true, true);
const PADS_AND_ROOTS = jobs(true);

/**
 * The scenes' chords, never a pop progression: a drone for the dawn; Tide, the night (i, VI,
 * iv, i, each with its colour); Rise, the climb (VI, VII, i); Float, in the major, the
 * afterglow. Each chord four bars, two when "moving".
 */
const DRONE: ChordSetting = { sequence: 'still', bars: 4 };
const TIDE: ChordSetting = { sequence: 'tide', bars: 4 };
const RISE: ChordSetting = { sequence: 'rise', bars: 4 };
const RISE_MOVING: ChordSetting = { sequence: 'rise', bars: 2 };
const FLOAT: ChordSetting = { sequence: 'float', bars: 4 };

const BASE: SceneSettings = {
  soundWorld: 'warm',
  band: 'full',
  phrases: true,
  fillAmount: 0,
  evolveAmount: 0,
  bpm: DEMO_BPM,
  chords: DRONE,
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

/** The form, in passes (a pass is about 5.5 s): ten scenes, then the final chord, seven minutes. */
export const DEMO_SCENES: readonly SceneSpec[] = [
  // 0:00 The pads rise out of silence on a drone; glass bells breathe the theme's first notes.
  {
    name: 'Dawn', pass: 0, loops: slots('Bells'), key: F_SHARP_MINOR,
    settings: { chords: DRONE, sceneEnergy: 1, bandJobs: PADS_ONLY }, wayIn: { kind: 'cut' },
  },
  // 0:44 The felt piano states the theme; the chords begin to turn; the sub holds F#.
  {
    name: 'Theme', pass: 8, loops: slots('Piano question'), key: F_SHARP_MINOR,
    settings: { chords: TIDE, sceneEnergy: 2, bandJobs: PADS_AND_PEDAL }, wayIn: { kind: 'fade', passes: 1 },
  },
  // 1:28 The pulse begins underneath; the piano answers itself; Magenta's first sparkles.
  {
    name: 'Pulse', pass: 16, loops: slots('Piano theme', 'Pulse'), key: F_SHARP_MINOR,
    settings: { chords: TIDE, sceneEnergy: 2, bandJobs: PADS_AND_PEDAL, fillAmount: 0.08 }, wayIn: { kind: 'cut' },
  },
  // 2:12 A rising lead in; the soft heartbeat enters; the swells breathe with it; the bass lets go of the pedal.
  {
    name: 'Heartbeat', pass: 24, loops: slots('Piano theme', 'Pulse', 'Swells', 'Percussion heartbeat'), key: F_SHARP_MINOR,
    settings: { chords: TIDE, sceneEnergy: 3, bandJobs: PADS_AND_ROOTS, fillAmount: 0.1 }, wayIn: { kind: 'cut' }, leadIn: 'rising',
  },
  // 2:56 The chords turn twice as often (Rise); brushed snare, rolling toms, pulse chords; more sparkles.
  {
    name: 'Build', pass: 32, loops: slots('Piano theme', 'Pulse', 'Pulse chords', 'Percussion build'), key: F_SHARP_MINOR,
    settings: { chords: RISE_MOVING, sceneEnergy: 4, bandJobs: PADS_AND_ROOTS, fillAmount: 0.15 }, wayIn: { kind: 'cut' },
  },
  // 3:18 Everything falls away but the pads and the piano, alone with the theme.
  {
    name: 'Hush', pass: 36, loops: slots('Piano theme'), key: F_SHARP_MINOR,
    settings: { chords: TIDE, sceneEnergy: 1, bandJobs: PADS_ONLY }, wayIn: { kind: 'cut' },
  },
  // 3:40 A soft roll, and the pulse and heartbeat return; the theme moves to the singing lead.
  {
    name: 'Ascent', pass: 40, loops: slots('Lead theme', 'Pulse', 'Swells', 'Percussion heartbeat'), key: F_SHARP_MINOR,
    settings: { chords: RISE, sceneEnergy: 3, bandJobs: PADS_AND_ROOTS, fillAmount: 0.1 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // 4:24 Build's percussion and the pulse chords under the lead; the pads open.
  {
    name: 'Lift', pass: 48, loops: slots('Lead theme', 'Pulse', 'Pulse chords', 'Percussion build'), key: F_SHARP_MINOR,
    settings: { chords: RISE, sceneEnergy: 4, bandJobs: PADS_AND_ROOTS, fillAmount: 0.15 }, wayIn: { kind: 'cut' },
  },
  // 5:08 The lead an octave up, the fullest percussion and pads, Magenta at its busiest: a wall of light, not of noise.
  {
    name: 'Summit', pass: 56, loops: slots('Lead theme high', 'Pulse', 'Pulse chords', 'Percussion summit'), key: F_SHARP_MINOR,
    settings: { chords: RISE_MOVING, sceneEnergy: 5, bandJobs: PADS_AND_ROOTS, fillAmount: 0.25 }, wayIn: { kind: 'cut' }, leadIn: 'drumFill',
  },
  // 5:52 F sharp major: the piano plays the theme in the major over a quiet pulse and warm pads.
  {
    name: 'Afterglow', pass: 64, loops: slots('Piano theme', 'Pulse quarter', 'Swells'), key: F_SHARP_MAJOR,
    settings: { chords: FLOAT, sceneEnergy: 2, bandJobs: PADS_AND_ROOTS, fillAmount: 0.08 }, wayIn: { kind: 'cut' },
  },
];

/** The pass the final chord's ending begins on: right after the last scene's eighth pass. */
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
 * The demo's scenes, each with Magenta's ideas frozen for it (see demoIdeas.ts), so every
 * run replays them from the first, whoever plays.
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
 * 7:00, the longest a piece can be, ending by itself with the final chord: the ending is
 * asked for during the last scene's eighth pass, thins over two passes from pass 72, and the
 * tonic chord, F sharp major, rings out by 7:00.
 */
export const DEMO_PERFORMANCE: PerformanceSettings = {
  lengthSec: 420, ending: 'auto', style: 'chord', fadePasses: 2, startOn: 'play', countIn: false,
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

/**
 * Tim's counters as ambient voices (the composition, 2026-11-06): his colours keep their jobs
 * and which colour is which, but in the demo a melody colour plays the soft lead (a second one
 * the bells), a chord colour a soft pad, a bass colour the sub; a drums colour keeps its kit
 * piece. Each plays one note per counter, with a big reverb send. In the key's pentatonic
 * scale, whatever he places sounds well. Pure: his own player is never touched.
 */
export function demoColourVoices<T extends DemoVoiceSettings>(colours: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  let melodies = 0;
  for (const [id, c] of Object.entries(colours)) {
    const voice = c.role === 'melody' ? (melodies++ % 2 === 0 ? 'synth:keys' : 'synth:bell')
      : c.role === 'chord' ? 'synth:pad'
        : c.role === 'bass' ? 'synth:sub'
          : null;
    if (voice) out[id] = { ...c, instrument: voice, plays: 'note', reverbSend: DEMO_COLOUR_REVERB };
    else if (c.role === 'drums') out[id] = { ...c, plays: 'note', reverbSend: DEMO_COLOUR_REVERB };
    else out[id] = { ...c };
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
    scaleRootMidi: F_SHARP_MINOR.rootMidi,
    scaleSemitones: [...F_SHARP_MINOR.semitones],
    scaleName: F_SHARP_MINOR.scaleName,
    octaveShift: 0,
    bpm: DEMO_BPM,
    swing: 0,
    humanize: 0,
    // The answers play on every other pass: the theme asks on one pass and answers on the next.
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
    // Magenta's extra notes: the AI's sparkles around the theme.
    fillEngine: 'magenta',
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
    chords: { ...DRONE },
    // The written notes are played as written: pentatonic, they sit in every chord.
    clashNudge: false,
    bandJobs: { ...PADS_ONLY },
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
