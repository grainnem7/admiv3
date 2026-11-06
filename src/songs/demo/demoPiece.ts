/**
 * The demo piece, "Rising Light", version 2: seven minutes that play the same every time.
 *
 * The composition is docs/superpowers/specs/2026-11-06-demo-composition-v2-design.md, built on
 * version 1's (2026-11-06-demo-composition-design.md), whose ambient rules still hold. The
 * owner's notes on version 1: keep the ambient sound; open light, pentatonic and major-ish but
 * atmospheric, never twee; open with drums alone, then brass pads, a realistic guitar, then
 * wind pads; more development and drama (it was samey: the loops and Magenta never
 * developed); Tim's counters must blend; a build to a big, dramatic ending.
 *
 * One set of five notes, three centres: A major pentatonic (the Light), F sharp minor
 * pentatonic (the Shadow: the same notes, the theme a third lower), B major pentatonic (the
 * Summit, a tone above the Light). Every written note is in the scene's pentatonic scale, so
 * it sits in every chord of its section; whatever Tim places is in the key too.
 *
 * Development at every level: a loop grows over four passes (notes written for the 1st, 2nd,
 * 3rd or 4th pass of every four), a scene lasts four passes (eight for the last two), and
 * Magenta has a new idea every four passes. Tim's counters all sound on his own track, Tim's
 * glow (MIDI channel 14), one soft pad over everything, so he never interrupts a loop.
 *
 * On the usual 8 by 8 board at 87 BPM a pass is two bars of 4/4 (8 beats, about 5.5 s).
 * Every change lands on the downbeat of a pass that is a multiple of four.
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
export const DEMO_REVISION = 11;

const ROWS = 8;
const COLS = 8;
/** 87: the ending then starts exactly at the end of the last scene's eighth pass, and rings out by 7:00. */
export const DEMO_BPM = 87;
/** The piece's own ideas: every choice the rules make comes from these, so it plays the same. */
export const DEMO_IDEAS = 20261106;

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];
/** The Light: A major pentatonic (A, B, C#, E, F#), the key note A4 on the bottom row. */
export const A_MAJOR: SceneKey = { rootMidi: 69, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };
/** The Shadow: F sharp minor pentatonic, the same five notes centred on F# (the chords from F sharp natural minor). */
export const F_SHARP_MINOR: SceneKey = { rootMidi: 66, scaleName: 'Minor pentatonic', semitones: MINOR_PENT };
/** The Summit: B major pentatonic (B, C#, D#, F#, G#), a tone above the Light. */
export const B_MAJOR: SceneKey = { rootMidi: 71, scaleName: 'Major pentatonic', semitones: MAJOR_PENT };

/**
 * Steps of the pentatonic scale from the bottom row, written in A major: A4 B4 C#5 E5 F#5 A5
 * B5 C#6. In F sharp minor the same steps are F#4 A4 B4 C#5 E5 F#5; in B major B4 C#5 D#5 F#5 G#5 B5.
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

// ---- the theme: four notes that grow over four passes ------------------------------------

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
/** The bells' fragment (version 1's, for the Rebuild in F sharp minor): the steps of C# and A there, each held a bar. */
const BELLS_FRAGMENT: Written[] = [[0, 3, 4], [4, 1, 4]];

// ---- the brass: open fifths, held a pass, the third on the later passes -------------------

/** The key note and its fifth (A and E in the light, F# and C# in the shadow), a whole pass. */
const FIFTHS: Written[] = [[0, A, 8], [0, E, 8]];

/** The brass: a bass loop over the band's sub, an octave up from the bass; the third two octaves up, high and open. */
function brass(withThird: boolean): StoredLoopCell[] {
  const fifths = notes('bass', 'trombone', FIFTHS, 0.4, { octave: 1, overBass: true });
  return withThird
    ? [...fifths, ...notes('bass', 'trombone', [[0, CS, 8, [2, 3]]], 0.4, { octave: 2, overBass: true })]
    : fifths;
}

// ---- the guitar: fingerpicked, every chord rolled string by string -------------------------

const ROLL_UP = 0.09;
const ROLL_DOWN = -0.07;

/** A chord the pads hold, rolled: one counter, its own roll and loudness, on its passes. */
function rolled(col: number, roll: number, velocity: number, passes?: readonly number[]): StoredLoopCell {
  return {
    row: ROWS - 1, col, colour: loopColourId('chord', 'guitarAcoustic'), job: 'chord', sound: 'guitarAcoustic', plays: 'note',
    velocity, follows: true, roll, ...(passes ? { passes: [...passes] } : {}),
  };
}
/** A chord every pass, and one on beat 5 from the second pass. */
const GUITAR_ROLL: StoredLoopCell[] = [rolled(0, ROLL_UP, 0.45), rolled(4, ROLL_UP, 0.4, LATER)];
/** The picking: every beat, up on the strong beats and down between; the between-beats from the second pass. */
const PICK_VELOCITY = [0.5, 0.38, 0.42, 0.36, 0.44, 0.37, 0.41, 0.39];
const GUITAR_PICKING: StoredLoopCell[] = PICK_VELOCITY.map((v, col) =>
  rolled(col, col % 2 === 0 ? ROLL_UP : ROLL_DOWN, v, col % 2 === 0 ? undefined : LATER));

// ---- the percussion: soft, a heartbeat ---------------------------------------------------

type Piece = 'kick' | 'rim' | 'snare' | 'hat' | 'tom' | 'crash';
/** Each kit piece on its own row, so no two counters share a square (the row picks nothing: the loop names its piece). */
const PIECE_ROW: Record<Piece, number> = { kick: 7, rim: 6, snare: 5, hat: 4, tom: 3, crash: 2 };
/** A hit: its step, its piece, half a beat late or not, the passes of four it plays on (null: every pass), how loud. */
type Hit = readonly [col: number, piece: Piece, offBeat: boolean, passes: readonly number[] | null, velocity: number];

function percussion(hits: readonly Hit[]): StoredLoopCell[] {
  const used = new Set<string>();
  return hits.map(([col, piece, offBeat, passes, velocity]) => {
    // The second of two hits of one piece on one step (a tom roll) takes the next row down.
    let row = PIECE_ROW[piece];
    while (used.has(`${col}:${row}`)) row = (row + ROWS - 1) % ROWS;
    used.add(`${col}:${row}`);
    return {
      row, col, colour: loopColourId('drums', piece), job: 'drums' as const, sound: piece, plays: 'note' as const, velocity,
      ...(offBeat ? { timingBeats: 0.5 } : {}),
      ...(passes ? { passes: [...passes] } : {}),
    };
  });
}

const SHAKER_SOFT = 0.2;
const EVERY_OTHER = [1, 3] as const;
/** A shaker breath on every "and": eight a pass. */
const shakerAnds = (v: number, passes: readonly number[] | null = null): Hit[] =>
  Array.from({ length: COLS }, (_, c): Hit => [c, 'hat', true, passes, v]);
/** The shaker on every eighth. */
const shakerEighths = (v: number): Hit[] => [
  ...Array.from({ length: COLS }, (_, c): Hit => [c, 'hat', false, null, Math.round(v * 0.8 * 100) / 100]),
  ...shakerAnds(v),
];

/**
 * The heartbeat: a soft kick on 1 and on the and of 2; it grows over four passes: the shaker
 * breathing on every "and" from the 2nd pass, a rim click on 3 of each bar from the 3rd.
 */
const HEARTBEAT: Hit[] = [
  [0, 'kick', false, null, 0.45], [1, 'kick', true, null, 0.35],
  [4, 'kick', false, null, 0.42], [5, 'kick', true, null, 0.33],
  [2, 'rim', false, [2, 3], 0.3], [6, 'rim', false, [2, 3], 0.3],
  ...shakerAnds(SHAKER_SOFT, LATER),
];
/** Build: the heartbeat, a kick on 3 of bar 2, a brushed snare for the rim, the shaker on every eighth, toms rolling in every other pass. */
const BUILD: Hit[] = [
  [0, 'kick', false, null, 0.48], [1, 'kick', true, null, 0.38],
  [4, 'kick', false, null, 0.45], [5, 'kick', true, null, 0.36], [6, 'kick', false, null, 0.4],
  [2, 'snare', false, null, 0.38], [6, 'snare', false, null, 0.4],
  ...shakerEighths(0.24),
  [7, 'tom', false, EVERY_OTHER, 0.4], [7, 'tom', true, EVERY_OTHER, 0.46],
];
/** Summit: kick on 1, the and of 2, 3 and the and of 4; the brushed snare on 3; the shaker on every eighth; a cymbal swell every other pass. */
const SUMMIT: Hit[] = [
  ...[0, 4].flatMap((bar): Hit[] => [
    [bar, 'kick', false, null, 0.55], [bar + 1, 'kick', true, null, 0.45],
    [bar + 2, 'kick', false, null, 0.5], [bar + 3, 'kick', true, null, 0.42],
    [bar + 2, 'snare', false, null, 0.45],
  ]),
  ...shakerEighths(0.28),
  [0, 'crash', false, [0, 2], 0.5],
];

/** The loops, by slot, with their names. Every melodic note at or under 0.6: the pads lead. */
export const DEMO_LOOPS: readonly { name: string; cells: StoredLoopCell[] }[] = [
  { name: 'Percussion heartbeat', cells: percussion(HEARTBEAT) },
  { name: 'Brass fifths', cells: brass(false) },
  { name: 'Brass pad', cells: brass(true) },
  { name: 'Guitar roll', cells: GUITAR_ROLL },
  { name: 'Guitar picking', cells: GUITAR_PICKING },
  { name: 'Winds theme', cells: notes('melody', 'clarinet', THEME, 0.5, { layBack: 0.03 }) },
  { name: 'Winds high', cells: notes('melody', 'clarinet', THEME, 0.55, { layBack: 0.03, octave: 1 }) },
  { name: 'Bells', cells: notes('melody', 'synth:bell', BELLS_FRAGMENT, 0.42, { octave: 1 }) },
  { name: 'Percussion build', cells: percussion(BUILD) },
  { name: 'Percussion summit', cells: percussion(SUMMIT) },
];

const SLOT = new Map(DEMO_LOOPS.map((l, i) => [l.name, i]));
const slots = (...names: string[]): number[] => names.map((n) => SLOT.get(n) ?? -1).filter((i) => i >= 0).sort((a, b) => a - b);

/** One pass, in seconds: two bars of four beats. */
export const DEMO_PASS_SEC = (COLS * 60) / DEMO_BPM;

/** The band: its pads and its bass (the sub), never its drums or its counter-melody. */
const jobs = (pads: boolean, bass: boolean, pedal = false): BandJobs => ({
  asBefore: false, pads, bass, drums: false, counter: false, ...(pedal ? { pedal: true } : {}),
});
const NO_BAND = jobs(false, false);
const PADS_ONLY = jobs(true, false);
const PADS_AND_PEDAL = jobs(true, true, true);
const PADS_AND_ROOTS = jobs(true, true);

/**
 * The scenes' chords, never a pop progression: Glow (I add9, IV maj7, over a held key note),
 * Lift (I sus2, ii add9), Float (I add9, vi add9: the light clouding over); in the shadow
 * Tide (i, VI, iv, i) and Rise (VI, VII, i); at the summit Lift again, in B. Each chord four
 * bars, two when "moving".
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
  bandJobs: PADS_AND_PEDAL,
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

/** The form, in passes (a pass is about 5.5 s): sixteen scenes, then the Big finish, seven minutes. */
export const DEMO_SCENES: readonly SceneSpec[] = [
  // 0:00 The heartbeat alone, softly, out of silence: the kicks, then the shaker, then the rim.
  {
    name: 'Drums', pass: 0, loops: slots('Percussion heartbeat'), key: A_MAJOR,
    settings: { band: 'off', bandJobs: NO_BAND, chords: chords('glow'), sceneEnergy: 2 }, wayIn: CUT,
  },
  // 0:22 Brass pads swell in on A and E; the band's pads under them, over a held A.
  {
    name: 'Brass', pass: 4, loops: slots('Percussion heartbeat', 'Brass fifths'), key: A_MAJOR,
    settings: { chords: chords('glow'), sceneEnergy: 2, bandJobs: PADS_AND_PEDAL }, wayIn: FADE,
  },
  // 0:44 The brass adds the third; the pads open to full.
  {
    name: 'Brass bloom', pass: 8, loops: slots('Percussion heartbeat', 'Brass pad'), key: A_MAJOR,
    settings: { chords: chords('glow'), sceneEnergy: 2, bandJobs: PADS_AND_PEDAL }, wayIn: CUT,
  },
  // 1:06 The guitar rolls in, a chord every pass, then two.
  {
    name: 'Guitar', pass: 12, loops: slots('Percussion heartbeat', 'Brass pad', 'Guitar roll'), key: A_MAJOR,
    settings: { chords: chords('glow'), sceneEnergy: 3, bandJobs: PADS_AND_PEDAL }, wayIn: FADE,
  },
  // 1:28 The guitar rolls every beat; the chords lift.
  {
    name: 'Guitar picking', pass: 16, loops: slots('Percussion heartbeat', 'Brass pad', 'Guitar picking'), key: A_MAJOR,
    settings: { chords: chords('lift'), sceneEnergy: 3, bandJobs: PADS_AND_PEDAL }, wayIn: CUT,
  },
  // 1:50 The wind pads breathe the theme, growing over the four passes.
  {
    name: 'Winds', pass: 20, loops: slots('Percussion heartbeat', 'Brass pad', 'Guitar picking', 'Winds theme'), key: A_MAJOR,
    settings: { chords: chords('lift'), sceneEnergy: 3, bandJobs: PADS_AND_PEDAL }, wayIn: FADE,
  },
  // 2:12 Magenta's first ideas answer the winds; the light clouds over.
  {
    name: 'Winds answer', pass: 24, loops: slots('Percussion heartbeat', 'Brass pad', 'Guitar picking', 'Winds theme'), key: A_MAJOR,
    settings: { chords: chords('float'), sceneEnergy: 3, bandJobs: PADS_AND_PEDAL, fillAmount: 0.15 }, wayIn: CUT,
  },
  // 2:34 The centre drops to F#: the theme a third lower, the brass on F#, the guitar rolling.
  {
    name: 'Shadow', pass: 28, loops: slots('Percussion heartbeat', 'Brass pad', 'Guitar roll', 'Winds theme'), key: F_SHARP_MINOR,
    settings: { chords: chords('tide'), sceneEnergy: 3, bandJobs: PADS_AND_PEDAL, fillAmount: 0.15 }, wayIn: CUT,
  },
  // 2:56 A rising lead in; the percussion builds; the guitar picks every beat; the bass lets go of the pedal.
  {
    name: 'Heartbeat', pass: 32, loops: slots('Percussion build', 'Brass pad', 'Guitar picking', 'Winds theme'), key: F_SHARP_MINOR,
    settings: { chords: chords('tide'), sceneEnergy: 4, bandJobs: PADS_AND_ROOTS, fillAmount: 0.15 }, wayIn: CUT, leadIn: 'rising',
  },
  // 3:18 Everything falls away but the pads and the winds (and Tim).
  {
    name: 'Hush', pass: 36, loops: slots('Winds theme'), key: F_SHARP_MINOR,
    settings: { chords: chords('tide'), sceneEnergy: 1, bandJobs: PADS_ONLY }, wayIn: CUT,
  },
  // 3:40 A soft roll; the bells and the heartbeat return; the guitar.
  {
    name: 'Rebuild', pass: 40, loops: slots('Percussion heartbeat', 'Guitar roll', 'Bells'), key: F_SHARP_MINOR,
    settings: { chords: chords('rise'), sceneEnergy: 3, bandJobs: PADS_AND_ROOTS, fillAmount: 0.15 }, wayIn: CUT, leadIn: 'drumFill',
  },
  // 4:02 The chords move every two bars; the brass, the winds an octave up, Magenta busier.
  {
    name: 'Climb', pass: 44, loops: slots('Percussion build', 'Brass pad', 'Guitar roll', 'Winds high'), key: F_SHARP_MINOR,
    settings: { chords: chords('rise', 2), sceneEnergy: 4, bandJobs: PADS_AND_ROOTS, fillAmount: 0.2 }, wayIn: CUT,
  },
  // 4:24 A roll, and the light breaks: back to A, everything at once, the guitar driving.
  {
    name: 'Light breaks', pass: 48, loops: slots('Percussion build', 'Brass pad', 'Guitar picking', 'Winds high'), key: A_MAJOR,
    settings: { chords: chords('glow', 2), sceneEnergy: 4, bandJobs: PADS_AND_ROOTS, fillAmount: 0.2 }, wayIn: CUT, leadIn: 'drumFill',
  },
  // 4:46 The summit kit begins, Magenta at its busiest, the pads widest.
  {
    name: 'Gathering', pass: 52, loops: slots('Percussion summit', 'Brass pad', 'Guitar picking', 'Winds high'), key: A_MAJOR,
    settings: { chords: chords('lift', 2), sceneEnergy: 5, bandJobs: PADS_AND_ROOTS, fillAmount: 0.3 }, wayIn: CUT,
  },
  // 5:08 A roll, and up a tone to B: the winds high, the brass, the guitar, the full kit.
  {
    name: 'Summit', pass: 56, loops: slots('Percussion summit', 'Brass pad', 'Guitar picking', 'Winds high'), key: B_MAJOR,
    settings: { chords: chords('lift'), sceneEnergy: 5, bandJobs: PADS_AND_ROOTS, fillAmount: 0.3 }, wayIn: CUT, leadIn: 'drumFill',
  },
  // 5:52 The same, everything climbing: the chords moving every two bars, the cymbal swells.
  {
    name: 'Final ascent', pass: 64, loops: slots('Percussion summit', 'Brass pad', 'Guitar picking', 'Winds high'), key: B_MAJOR,
    settings: { chords: chords('lift', 2), sceneEnergy: 5, bandJobs: PADS_AND_ROOTS, fillAmount: 0.3 }, wayIn: CUT,
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
