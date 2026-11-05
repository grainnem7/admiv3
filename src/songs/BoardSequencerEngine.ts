/**
 * BoardSequencerEngine — standalone audio engine for the board sequencer.
 *
 * Owns: an internal look-ahead step clock (off the audio-context clock, NOT
 * Tone.Transport, so it never clashes with a song), a sampled voice per row,
 * an optional confirmation tick, and the current active-cell matrix. Routes
 * into the shared effects bus (EffectChainManager.getInput()).
 *
 * The board is standalone: own tempo, fixed pentatonic scale, no song / no
 * chordLookup. "Next loop pass" semantics are emergent — each step reads the
 * CURRENT active set via notesForStep.
 */

import { playsTune } from './beyondLoop';
import { humanFactor, shapedVelocity } from './dynamics';
import { admitLoopNote, admitPlayerNote, LANE_TOP, loopLaneShift, loopNoteCap, newStepTally, type StepTally } from './density';
import { breathGain, breathPhase, breathRest } from './breath';
import * as Tone from 'tone';
import { BoardSequencerVoice } from './voices/BoardSequencerVoice';
import { voicingForCells, degreeMidi, chordDegreeMidi, drumForRow, DEFAULT_DRUM_ROWS, loopLen, lapIndex, strictlyAfter, firesThisLap, firesThisLapPaged, sweepAt, type PingPongPages, type Sweep } from './boardSequencerScale';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { ColourChannel, ColourId, ColourRole } from '../tracking/boardColours';
import { DEFAULT_NOTE_VARY } from '../tracking/boardColours';
import type { FaderRole } from '../profiles/BoardSequencerConfig';
import { getEffectChainManager } from '../effects';
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
import { audibleTime } from './audibleTime';
import type { KitDrum } from '../audio/instruments/RoundRobinDrumKit';
import { MasterChain } from '../audio/MasterChain';
import { DEFAULT_BOARD_MIX } from '../audio/audioConfig';
import { channelPan, ducksForKick, legatoBeats } from '../audio/boardMix';
import { voiceSpecFor, worldLevelGain, worldOf, type SoundWorldChoice } from '../audio/worlds/soundWorlds';
import { layerPhraseCells, LIVE_LAYER, melodyLeader, phraseEventsAtStep, ANSWER_LEVEL, type PhraseCell, type PhraseInput, type PhraseRole } from './phrases/phrases';
import { generateFill, type FillContext, type FillNote, type SoundingNote } from './generative/rulesFill';
import { loadMagenta, magentaFill, magentaStatus } from './generative/magentaFill';
import { describeEvolve, evolveState, NEUTRAL, type EvolveState } from '../audio/evolve/evolve';
import {
  BAND_GAIN, bandEventsAtStep, bandParts, type BandEvent, type BandLevel, type BandPart, type Harmony,
} from './band/band';
import { AS_BEFORE_JOBS, leadInEvents, type BandJobs, type LeadIn, type Register } from './band/bandJobs';
import {
  KEEP_ON_TOP_ATTACK_TC, KEEP_ON_TOP_DEFAULT_DB, KEEP_ON_TOP_RELEASE_TC, dipGain, noteDip, pruneWindows, type SoundingWindow,
} from './band/keepOnTop';
import {
  AS_BEFORE_CHORDS, currentChord, fitToChord, isStrongBeat, sequenceAt,
  type ChordCounter, type ChordSetting, type CurrentChord,
} from './harmony/currentChord';
import {
  BoardMidiSender, channelsInUse, EXPRESSION_STEP_SEC, gainToCc, loopChannel, loopSlotOf, LOOP_CHANNELS, type BoardMidiOptions,
} from '../midi/boardMidi';
import {
  abletonPlan, changedControls, controlKey, counterControls, CC_BRIGHT, CC_SPACE,
  type AbletonControl, type AbletonPlan,
} from '../midi/abletonSounds';
import type { NamedVoice } from '../audio/evolve/evolve';
import { GainTrack } from './gainTrack';
import type { EndingStyle } from './performance/clock';
import { bassNote, chordOnDegree, degreeOfNote, voiceNear } from './harmony/harmony';
import {
  LATE_TOLERANCE_SEC, nextValveStep, TimeKeeper, type KeepingTimeLimits, type KeepingTimeReport, type ValveStep,
} from './keepingTime';
import { energyBandGain, energyBrightHz, energyExtras, energyMixGain, energyShape } from './performance/energy';
import { freshIdeas, hashChance, ideaKey, keepIdea, mixHash, mixSeeds, withIdeas, type KeptIdea } from './performance/ideas';

/** A note the engine actually scheduled (drives note pops / "Now:" — never inferred from the playhead). */
export interface FiredNote {
  row: number;
  col: number;
  colour: ColourId;
  role: ColourRole;
  audioTime: number;
  durSec: number;
  source: 'live' | 'page' | 'loop';
  /**
   * Who made the note: the player's counter itself, or the phrase it started. Lets a
   * session log tell what the player placed from what the instrument played for it.
   */
  origin?: 'placed' | 'phrase' | 'fill' | 'band';
  /** What sounded, for MIDI out and the session log. A chord stab lists all its notes. */
  midi?: number;
  midis?: number[];
  drum?: KitDrum;
  velocity?: number;
  /** A saved loop's note: which loop (0 based), so MIDI can give each loop its own channel and fader. */
  loopSlot?: number;
}

/** How loud the fill is next to the player's own notes: about -6 dB. */
export const FILL_LEVEL = 0.5;

/**
 * How long the board has to stay still before the AI is asked for a new idea. Asking on
 * every move while a hand is placing counters would only throw ideas away.
 */
const AI_SETTLE_SEC = 0.6;

/** Where the fill comes from, as the player is told it. */
export type FillSourceStatus = 'rules' | 'loading' | 'thinking' | 'ai' | 'offline';

/** Mute ramps this fast: short enough to read as a cut, long enough not to click. */
const MUTE_GLIDE_SEC = 0.02;

/**
 * The most missed beats to replay after a stall. Long enough to cover a heavy camera
 * frame or a GC pause, short enough that coming back to a tab left open for an hour
 * doesn't dump a wall of notes.
 */
const MAX_CATCHUP_BEATS = 4;

export const FIRED_NOTE_CAP = 256;

/** Minimal chord shape the board needs for chord-locked pitch. */
export interface BoardChord {
  notes: number[];
}

/**
 * Optional sync to a backing song. When present (with beats), the board stops
 * using its internal clock and instead fires a step on each of the song's beats
 * (tempo + phase lock), and melodic pitch is taken from the song's CURRENT
 * chord (chord-lock) instead of the standalone pentatonic.
 */
export interface BoardSyncSource {
  /** Current song playback time in seconds. */
  getTime(): number;
  /** Beat timestamps (seconds from song start), ascending. */
  beats: number[];
  /** The chord active at a given song time, or null. */
  chordAt(timeSec: number): BoardChord | null;
}

export interface BoardEngineConfig {
  bpm: number;
  rows: number;
  cols: number;
  scaleRootMidi: number;
  scaleSemitones: number[];
  swing: number;
  humanize: number;
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  octaveShift: number;
  volume: number;
  /** The user's colour channels: each carries its role + (for sounds) instrument. */
  channels: ColourChannel[];
  /** Axis a control-colour piece's position maps to its value ('row' = vertical). */
  faderAxis: 'row' | 'col';
  /** Off means every counter plays every pass — including inside saved loops. */
  variationEnabled?: boolean;
  /** Polyrhythm: per-role loop length in steps (0 = full grid width). */
  loopStepsRed: number;
  loopStepsBlack: number;
  loopStepsBlue: number;
  /** Pattern chaining: number of pages (master loop = numPages * cols steps). */
  numPages: number;
  /** Ping-pong playhead: sweep → then ← (repeat-edge) instead of always left→right. */
  pingPong?: boolean;
  /** How ping-pong goes through several pages (see sweepAt). */
  pingPongPages?: PingPongPages;
  /** Effect amount a toggle colour switches in (default 0.35). */
  toggleAmount?: number;
  /** Glide time for control-counter changes, so a slide never clicks (default 0.3 s). */
  controlGlideSec?: number;
  /**
   * The studio mix: the shared master chain, stereo placement, kick ducking and notes that
   * ring into the next one. Off is the board's original mix, kept for A/B listening.
   * Default on.
   */
  studioMix?: boolean;
  /** The sound world parts without an instrument of their own use ('none' = old defaults). */
  soundWorld?: SoundWorldChoice;
  /** Each counter plays a phrase (groove, bassline, motif, chord change), not one note. */
  phrases?: boolean;
  /** Where fill ideas come from: Magenta's models, or the simple rules. */
  fillEngine?: 'magenta' | 'rules';
  /** The band: pad, bass and groove that join once the first counter is down. */
  band?: BandLevel;
  /** The chord sequence every pitched part plays to (absent = "As before"). */
  chords?: ChordSetting;
  /** One-note melody and bass: a note rubbing against the chord on a strong beat moves to it. */
  clashNudge?: boolean;
  /** The band's jobs (absent = "As before"). */
  bandJobs?: BandJobs;
  /** Keep the player on top: the rest dips while his own notes sound (absent = on). */
  keepOnTop?: boolean;
  /** How far the rest dips, in dB. */
  keepOnTopDb?: number;
  /** A scene's Energy, 1 to 5 (absent or 0 = off, as before): see performance/energy. */
  sceneEnergy?: number;
}

/**
 * The ideas the AI plays with (see performance/ideas): the seed of every random choice, and
 * whose they are (a scene's id, for keeping Magenta's ideas; null = plain Play, none kept).
 */
export interface IdeasSetting {
  seed: number;
  owner: string | null;
}

/** A scene's sound settings that wait for the pass, as its loops do (see landOnNextPass). */
export interface PassSettings {
  soundWorld?: SoundWorldChoice;
  band?: BandLevel;
  phrases?: boolean;
  fillAmount?: number;
  evolveAmount?: number;
  chords?: ChordSetting;
  bandJobs?: BandJobs;
  sceneEnergy?: number;
  ideas?: IdeasSetting;
}

/** Evolve: how each colour's sound keeps changing as it plays (see audio/evolve). */
export interface EvolveSettings {
  amount: number;
  sceneLoops: number;
  seed: number;
  /** Hold the sound of this loop; null = keep evolving. */
  holdLap: number | null;
}

/** How long a drift step glides, in seconds: slow enough to be heard as movement, not a jump. */
const EVOLVE_GLIDE_SEC = 0.8;

/** How quickly the mix switch crossfades, so flipping it mid-loop never clicks. */
const MIX_SWITCH_TC = 0.03;
/** How quickly a scene's Energy moves the band's level and the brightness: a short glide, no jump. */
const ENERGY_GLIDE_TC = 0.12;

/** A cell from a saved loop (a launched slot or a pad's bank), not the player's board. */
function sameChords(a: ChordSetting, b: ChordSetting): boolean {
  return a.sequence === b.sequence && a.bars === b.bars;
}

/** Two values of one scene setting are the same (chords and jobs compared by what they are). */
function passValueEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) return false;
    return true;
  }
  return a === b;
}

function isLoopLayer(layer: string | undefined): boolean {
  return layer !== undefined && (layer.startsWith('slot') || layer.startsWith('bank'));
}

/** Busy's Extra notes, at the least: the level New idea starts them at. */
const BUSY_FILL = 0.5;

/** Simplify's bed: the first loop still playing (not one fading out), or none. */
function bedOf(launched: readonly LaunchedLoop[]): LaunchedLoop[] {
  const bed = launched.find((l) => l.fade?.dir !== 'out');
  return bed ? [bed] : [];
}

/** A loop launched without a pad, and the fade it is in, if any. */
/** A cell on its way to being played, with the layer it belongs to (absent = the player's board). */
type LayeredCell = ActiveCell & { layer?: string; /** A loop answering the leading melody: an octave up (S2). */ answerUp?: boolean };

interface LaunchedLoop {
  slot: number;
  cells: ActiveCell[];
  fade?: { dir: 'in' | 'out'; start: number; beats: number };
  /** The loop colours its cells play through (what it was kept as). */
  colours?: ColourChannel[];
}

/**
 * The way a launch lands (K3): how many beats the arriving loops fade in and the leaving
 * ones fade out (0 = at once), and how many beats the leaving ones are held at full first
 * (an overlap). A scene's way in; a launch without one uses the player's own fade.
 */
export interface LaunchWay { fadeSteps: number; holdOutSteps: number }

/** How long a replaced voice is kept so its last notes ring out. */
const VOICE_RETIRE_MS = 4000;
/** silenceNow: how fast what is ringing falls away (time constant, s), quick but without a click. */
const CUT_FADE_TC = 0.006;
/** silenceNow: when the emptied reverb and echo are freed, well after their fade. */
const CUT_FREE_MS = 250;
/**
 * silenceNow over MIDI: Expression stays at 0 this long, past the look-ahead and the
 * second release (RELEASE_REPEAT_MS), so a note already queued at the port never sounds.
 */
const CUT_MIDI_HOLD_SEC = 0.25;
/** silenceNow: the kit dips first and stops this much later, so its hits end without a click. */
const CUT_KIT_SEC = 0.03;
/** How often a loading instrument is checked, and how long it is waited for at most. */
const VOICE_READY_POLL_MS = 100;
const VOICE_READY_MAX_MS = 15000;

const LOOKAHEAD_SEC = 0.1;
/** The shared echo: its time and how much of it comes round again. */
const DELAY_TIME_SEC = 0.25;
const DELAY_FEEDBACK = 0.32;
/** How long Play waits for the instruments' samples before starting without them. */
const START_READY_MAX_MS = 4000;
const TICK_INTERVAL_MS = 25;
/** How long Play waits for the board's first reading before starting anyway. */
const BOARD_WAIT_MAX_SEC = 0.5;

/** Largest index whose beats[idx] <= t, or -1 if none. Binary search. */
function lastIndexLEQ(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export class BoardSequencerEngine {
  private ctx: AudioContext;
  private cfg: BoardEngineConfig;
  // One sampled voice per melody/chord/bass channel (keyed by channel id), each
  // with its own gain + reverb/delay sends into the shared buses.
  /** Calm, Normal or Busy (see setFeel). */
  private feel: 'calm' | 'normal' | 'busy' = 'normal';
  /** Jobs silent everywhere, loops and band included (see setSilentParts). */
  private silentParts: ReadonlySet<ColourRole> = new Set();
  private voiceByChannel = new Map<string, {
    voice: BoardSequencerVoice; gain: GainNode; rev: GainNode; del: GainNode;
    /** The channel's own send/tone settings; control counters scale these, never replace them. */
    revBase: number; delBase: number; toneBase: number;
    /** Stereo placement (studio mix); null where the browser has no StereoPanner. */
    pan?: StereoPannerNode | null; panBase?: number;
    /** What Evolve has this colour sounding like now, and which instrument that is. */
    evo?: EvolveState; voiceName?: string | null;
    /** A new instrument still loading its samples; the old one plays until it is ready. */
    pending?: { voice: BoardSequencerVoice; timer: ReturnType<typeof setInterval> } | null;
  }>();
  /**
   * How much of each effect is returned to the mix, when a control counter owns it.
   * One writer: a fader beats its toggle before either reaches the bus.
   */
  private reverbAmount = 1;
  private delayAmount = 1;
  private toneScale = 1;
  private channelById = new Map<string, ColourChannel>();
  private drumKit: RoundRobinDrumKit | null = null;
  private tick: Tone.MembraneSynth | null = null;
  private mix: GainNode | null = null;
  private reverb: Tone.Reverb | null = null;
  private reverbBus: GainNode | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private delayBus: GainNode | null = null;
  private limiter: Tone.Limiter | null = null;
  // Two outputs from the mix, crossfaded by the Studio mix switch: the original path
  // (limiter -> shared effects bus) and the studio path (the shared MasterChain).
  private classicOut: GainNode | null = null;
  private studioOut: GainNode | null = null;
  private masterChain: MasterChain | null = null;
  /** Bass, chords and pads pass through here and dip on each kick. */
  private duckBus: GainNode | null = null;
  /** The world's colour over the whole mix (Lo-fi's dusty top end), and over the kit. */
  private mixTone: BiquadFilterNode | null = null;
  private drumTone: BiquadFilterNode | null = null;
  private drumLevel: GainNode | null = null;
  private active: ActiveCell[] = [];
  // Layered loops from the loop bank; each plays on top of the live pattern.
  private activeLoops: ActiveCell[][] = [];
  // Loops launched from the laptop, the iPad or a scene (no counter on a pad). A launch
  // or a stop takes effect at the next pass, so a tap is never off-beat; `pendingLaunch`
  // holds what is wanted until then.
  private launched: LaunchedLoop[] = [];
  private launchedSlots: number[] = [];
  private pendingLaunch: { slots: number[]; loops: ActiveCell[][]; colours: ColourChannel[]; way?: LaunchWay | null } | null = null;
  /** How many beats a launched loop takes to fade in or out; 0 = it starts and stops dead. */
  private launchFadeBeats = 0;
  // The ending: everything fades over `beats` from the pass boundary after `finish()` is
  // called, then `onFinished` fires so the screen can stop. 0 beats = stop at the boundary.
  private endGain: GainNode | null = null;
  private finishing: {
    beats: number; style: EndingStyle; startBeat: number | null;
    /** 'slow': the tempo the ritardando started from. 'chord': the beat the final chord lands on. */
    startBpm?: number; chordAt?: number;
  } | null = null;
  private onFinished: (() => void) | null = null;
  /** 'thin' and 'chord': the band and the fill are out for the rest of the piece. */
  private thinning = false;
  /** The ending has run its course: nothing more is scheduled while the last sound rings. */
  private ended = false;
  /**
   * The end-time backstop has begun its fade (fadeOutNow): from then until the board stops
   * nothing raises the ending gain again — not an ending starting at a pass boundary, not
   * the final chord, not Cancel the ending (R2-T3-01: a chord swelled after the end time).
   */
  private backstop = false;
  // Pattern chaining: captured page snapshots (the selected page plays live from
  // `active`; other pages play from their stored snapshot here).
  private pages: ActiveCell[][] = [];
  private selectedPage = 0;
  private lastFiredPage = 0;
  private startSec = 0;
  private lastInternalBeat = -1;
  /** Play waits for the board: set once the screen hands over the counters. */
  private boardArrived = false;
  /** While waiting for the board: the latest the first beat may start (null = not waiting). */
  private boardWaitUntil: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  private syncSource: BoardSyncSource | null = null;
  private lastBeatIndex = -1;
  private lastTickTime = 0;
  private fired: FiredNote[] = [];
  // The fill: how much, which idea (seed), and a kept fill that no longer follows the board.
  private fillAmount = 0;
  private fillSeed = 1;
  private fillKept: FillNote[] | null = null;
  private fillNotes: FillNote[] = [];
  private fillKey = '';
  // The AI path: the board as last described to it, when that last changed, and which
  // board an idea has been asked for and received.
  private fillCtx: FillContext | null = null;
  private fillChangedAt = 0;
  private aiAskedKey = '';
  private aiAnsweredKey = '';
  /** Sixteenths each part plays right now: fill never sounds on one, even an older idea. */
  private fillTaken: Record<'melody' | 'bass' | 'drums', Set<number>> = {
    melody: new Set(), bass: new Set(), drums: new Set(),
  };
  private evolve: EvolveSettings = { amount: 0, sceneLoops: 8, seed: 1, holdLap: null };
  /** Amounts set by a fill or evolve counter on the board; null = the saved setting. */
  private fillOverride: number | null = null;
  private evolveOverride: number | null = null;
  /** The saved amounts underneath, so a counter lifted off hands back to them at once. */
  private fillSetting = 0;
  private evolveSetting = 0;
  private evolveLap = -1;
  private evolveKey = '';
  /** The kit's Evolve state (one kit, shared by every drum colour). */
  private drumEvo: EvolveState = NEUTRAL;
  /** The drums' send into the shared reverb: none without Evolve, some room with it. */
  private drumRev: GainNode | null = null;
  /** The scene Evolve is in, so the fill can have a fresh idea for each one. */
  private evolveScene = 0;
  // The band (see band.ts): its level, its own voices, and the clock that makes it wait
  // for the player — the lap it may play from, and the last lap a counter was seen in.
  private band: BandLevel = 'off';
  /**
   * The band's voices. `gain` is its level; `lead` (the counter-melody and a Rising
   * lead-in) has its own fixed level, as a lead-in plays with the band off. Both go
   * through `top`, which dips while the player's notes sound (keep him on top).
   */
  private bandVoices: {
    pad: BoardSequencerVoice; bass: BoardSequencerVoice; gain: GainNode; rev: GainNode;
    lead?: BoardSequencerVoice; leadGain?: GainNode; top?: GainNode;
  } | null = null;
  private bandFromLap: number | null = null;
  private bandLastCounterLap = -1;
  private bandPlaying = false;
  private bandPartsNow: BandPart[] = [];
  private bandPrevHarmonyKey = '';
  /** The band pad's last voicing, so each chord is led from the one before. */
  private bandPadVoicing: number[] | null = null;
  // Band jobs (band/bandJobs): what it keeps, its counter-melody's last note, and a
  // scene's lead-in, waiting for the beat its scene lands on.
  private bandJobs: BandJobs = AS_BEFORE_JOBS;
  private bandCounterLast: number | null = null;
  private leadIn: { kind: LeadIn; landBeat: number } | null = null;
  // What the band hears on this beat, from the notes the board and the loops have just
  // played (they fire first): a drum, a melody note, and the drum hits themselves.
  private heardDrums = false;
  private heardMelody = false;
  private heardDrumHits = new Set<string>();
  private firingBeat = 0;
  /** Melody notes sounding lately (the player's and the loops'): the counter-melody avoids them. */
  private melodyWindows: (SoundingWindow & { pcs: number[] })[] = [];
  /** Where the chord parts and the melody have sounded, until a pass goes by without them. */
  private heardRegister: Record<'chord' | 'melody', (Register & { beat: number }) | null> = { chord: null, melody: null };
  // Keep the player on top (band/keepOnTop): on, how far, and when his notes sound.
  private keepOnTop = true;
  private keepOnTopDb = KEEP_ON_TOP_DEFAULT_DB;
  private timWindows: SoundingWindow[] = [];
  /** The player's notes that started on this beat: the band's dip is scheduled from them. */
  private timThisBeat: SoundingWindow[] = [];
  // One shared harmony (harmony/currentChord): the beat the chord sequence started on (its
  // scene's first pass), the chord counters on this beat, and the chord they make.
  private chordOrigin = 0;
  private chordCounters: ChordCounter[] = [];
  private chordNow: CurrentChord = { harmony: null, from: 'none' };
  /** A scene's sound settings waiting for the next pass, as its loops do. */
  private passPending: PassSettings | null = null;
  // MIDI out: every logged note is also sent, when the player has switched it on.
  private midi: BoardMidiSender | null = null;
  private midiOpts: BoardMidiOptions = { enabled: false, sends: 'player' };
  /** The channels the board may be sounding on, for releases and CC 11. */
  private midiChannels: number[] = channelsInUse();
  /**
   * The ending gain as numbers (see gainTrack.ts): endGain's automation, mirrored so MIDI
   * can follow ADMI's fades. Every change to endGain goes through endAuto().
   */
  private endTrack = new GainTrack(1);
  /** CC 11: the last value sent, and the audio time it has been sent up to. */
  private exprLast = new Map<number, number>();
  private exprUntil = 0;
  /** Until this audio time Expression stays at 0: notes queued before silenceNow stay silent. */
  private cutUntil = 0;
  /** Phase 2: every chain and macro value last sent to Ableton, by channel and CC. */
  private abletonSent = new Map<string, number>();
  /** The plan last worked out, for the screen. */
  private abletonLast: AbletonPlan | null = null;
  /** The Space setting as the player chose it (0 to 1), for CC 22. */
  private spaceSetting = 0.5;
  /** Which control counters are on the board: they own CC 25, 26 and 27 while there. */
  private counterOwns = { tone: false, reverb: false, delay: false };
  /** Each fading loop's loudness over time (by slot), for its channel's CC 11. */
  private loopFades = new Map<number, GainTrack>();
  /** The layer of the cell being played, so its notes know which loop they belong to. */
  private firingLayer: string | undefined = undefined;
  /** This step's tally of what has sounded (density, S2): the player's pitches and the loops' count. */
  private stepTally: StepTally = newStepTally();
  /** The most pitched loop notes this step may carry, from Energy. */
  private stepLoopCap = 6;
  /** The player's melody is on the board this pass: a loop's melody plays an octave up (the lane). */
  private stepLaneUp = false;
  /** CC 7: the last Volume value sent (-1 = none yet). */
  private volumeSent = -1;
  /** False when the player wants MIDI only: the built-in sound is silenced, the log and the lights carry on. */
  private internalSound = true;
  /** The band level the settings ask for; `band` is what plays (off while simplified). */
  private bandSetting: BandLevel = 'off';
  // Keeping time (keepingTime.ts): the meter, the wall clock it reads against, and what
  // the safety valve has dropped this run, from when.
  private keeper = new TimeKeeper();
  private wallNow: () => number = () => performance.now();
  private valveTaken: ValveStep[] = [];
  private valveFromMs = 0;
  /**
   * Simplify (the owner's button): the player and the scene's first loop only, no band,
   * no Extra notes, no Sounds change. 'leaving' = Back to full, waiting for the next pass.
   */
  private simplify: 'off' | 'on' | 'leaving' = 'off';
  /** The whole board's level: the world's (see soundWorlds levelDb), and a scene's Energy. */
  private worldGain: GainNode | null = null;
  /** A scene's Energy, 1 to 5 (0 = off): the band's level and busyness, the extras, the brightness. */
  private sceneEnergy = 0;
  // The same AI each rehearsal (performance/ideas): the ideas playing now, the beat (a pass
  // boundary) they began on, so a scene plays the same however it was reached, and a run's
  // own salt under "Surprise me each time" (0 otherwise).
  private ideas: IdeasSetting = { seed: 0, owner: null };
  private ideasFromBeat = 0;
  private surprise = false;
  private runSalt = 0;
  /** Magenta's ideas kept per scene (by owner, then by the board they were made for). */
  private keptIdeas = new Map<string, readonly KeptIdea[]>();
  private keptIdeasSource: unknown = null;
  private onIdeaKept: ((owner: string, idea: KeptIdea) => void) | null = null;

  constructor(cfg: BoardEngineConfig) {
    this.cfg = cfg;
    this.bandJobs = cfg.bandJobs ?? AS_BEFORE_JOBS;
    this.keepOnTop = cfg.keepOnTop !== false;
    this.keepOnTopDb = cfg.keepOnTopDb ?? KEEP_ON_TOP_DEFAULT_DB;
    this.sceneEnergy = cfg.sceneEnergy ?? 0;
    // Matches the codebase's standard AudioContext acquisition
    // (see SongPresetEngine.loadSong). BoardSequencerVoice / ToneVoiceBase
    // construct their raw Web Audio nodes against this same context.
    this.ctx = Tone.getContext().rawContext as AudioContext;
  }

  async init(): Promise<void> {
    const fx = getEffectChainManager();
    await fx.initialize();
    // Shared effects-bus input: a Tone.Gain. Its `.input` is the underlying
    // native GainNode, so the voices' native outputGain can connect to it
    // directly via the inherited connect(destination: AudioNode). The tick is
    // a Tone node and connects to the Tone.Gain directly.
    const dest = fx.getInput();
    const ctx = this.ctx;
    // Mix bus → limiter → shared effects bus. Shared reverb + delay buses return
    // into the mix; per-row sends feed them. Limiter stops stacked voices clipping.
    const mix = ctx.createGain();
    // Sound from Ableton (set before init): the mix starts silent, never a blip of ADMI.
    mix.gain.value = this.muted || !this.internalSound ? 0 : this.cfg.volume;
    const studio = this.studioOn();
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const mixTone = ctx.createBiquadFilter();
    mixTone.type = 'lowpass';
    mixTone.frequency.value = energyBrightHz(this.sceneEnergy, world?.mixToneHz ?? 20000);
    mixTone.Q.value = 0.5;
    // The world's level, so no world is louder than another.
    const worldGain = ctx.createGain();
    worldGain.gain.value = this.levelGain();
    mix.connect(worldGain);
    this.worldGain = worldGain;
    // The ending's fade sits after the mix, so Mute and volume keep working underneath it.
    const endGain = ctx.createGain();
    endGain.gain.value = 1;
    worldGain.connect(endGain);
    endGain.connect(mixTone);
    this.endGain = endGain;
    this.mixTone = mixTone;
    const classicOut = ctx.createGain();
    classicOut.gain.value = studio ? 0 : 1;
    mixTone.connect(classicOut);
    const limiter = new Tone.Limiter(-2);
    Tone.connect(classicOut, limiter);
    if (dest) limiter.connect(dest);
    // The studio path: the same EQ -> glue compressor -> saturation -> limiter that Song
    // and Remix go through. The board was left off it when they were overhauled.
    const studioOut = ctx.createGain();
    studioOut.gain.value = studio ? 1 : 0;
    mixTone.connect(studioOut);
    const masterChain = new MasterChain(ctx);
    studioOut.connect(masterChain.input);
    this.classicOut = classicOut;
    this.studioOut = studioOut;
    this.masterChain = masterChain;
    const duckBus = ctx.createGain();
    duckBus.gain.value = 1;
    duckBus.connect(mix);
    this.duckBus = duckBus;

    const reverb = new Tone.Reverb({ decay: world?.reverbDecay ?? 2.5, preDelay: world?.reverbPreDelay ?? 0.01, wet: 1 });
    await reverb.ready;
    const reverbBus = ctx.createGain();
    Tone.connect(reverbBus, reverb);
    reverb.connect(mix);

    const delay = new Tone.FeedbackDelay({ delayTime: DELAY_TIME_SEC, feedback: DELAY_FEEDBACK, wet: 1 });
    const delayBus = ctx.createGain();
    Tone.connect(delayBus, delay);
    delay.connect(mix);

    this.mix = mix;
    this.limiter = limiter;
    this.reverb = reverb;
    this.reverbBus = reverbBus;
    this.delay = delay;
    this.delayBus = delayBus;

    // Index channels for fast role/instrument lookup during scheduling.
    this.rebuildChannelIndex();
    const needsDrums = this.cfg.channels.some((c) => c.role === 'drums') || (this.cfg.band ?? 'off') !== 'off';
    if (needsDrums) await this.buildDrumKit();
    this.bandSetting = this.cfg.band ?? 'off';
    this.band = this.simplify === 'off' ? this.bandSetting : 'off';
    if (this.band !== 'off') this.buildBandVoices();
    // One sampled voice per melody/chord/bass channel → its own gain + FX sends.
    for (const ch of this.cfg.channels) this.buildVoice(ch);
    // The first beats must sound. The samples load in the background and a voice says
    // nothing until they arrive, while the lights, the pops and "Now:" (and the session
    // log) report every note — so the opening seconds of a piece were silent on screen
    // only. Wait for them, up to a limit: a slow connection still gets to play, late.
    await this.voicesReady(START_READY_MAX_MS);
    // Always built so the tick can be switched on live (setTickEnabled).
    this.tick = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
      volume: -14,
    });
    this.tick.connect(mix);
  }

  /**
   * A colour's own voice: sampler → channel gain → (pan) → mix or duck bus, with reverb and
   * delay sends tapping the gain. Nothing for a colour that is not melodic, or that has a
   * voice already; nothing before init has made the buses.
   */
  private buildVoice(ch: ColourChannel): void {
    if (ch.role !== 'melody' && ch.role !== 'chord' && ch.role !== 'bass') return;
    if (this.voiceByChannel.has(ch.id)) return;
    const { mix, duckBus, reverbBus, delayBus } = this;
    if (!mix || !duckBus || !reverbBus || !delayBus) return;
    const ctx = this.ctx;
    const studio = this.studioOn();
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const v = new BoardSequencerVoice(this.ctx, voiceSpecFor(ch, this.cfg.soundWorld ?? 'none'));
    v.setBrightness((ch.tone ?? 1) * this.toneScale);
    const gain = ctx.createGain();
    gain.gain.value = ch.volume ?? 1;
    v.connect(gain);
    // Placement and ducking sit after the channel gain; the effect sends tap the gain
    // itself, so a reverb tail neither pumps nor jumps sides.
    const out = ducksForKick(ch) ? duckBus : mix;
    const panBase = channelPan(this.cfg.channels, ch.id);
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = studio ? panBase : 0;
      gain.connect(pan);
      pan.connect(out);
    } else {
      gain.connect(out);
    }
    const revBase = ch.reverbSend ?? world?.reverbSend ?? 0.18;
    const delBase = ch.delaySend ?? world?.delaySend ?? 0;
    const rev = ctx.createGain();
    rev.gain.value = revBase * this.reverbAmount;
    gain.connect(rev);
    rev.connect(reverbBus);
    const del = ctx.createGain();
    del.gain.value = delBase * this.delayAmount;
    gain.connect(del);
    del.connect(delayBus);
    this.voiceByChannel.set(ch.id, {
      voice: v, gain, rev, del, revBase, delBase, toneBase: ch.tone ?? 1, pan, panBase,
    });
  }

  /** The kit, its colour/level/room nodes, loaded. Shared by drum colours and the band. */
  private async buildDrumKit(): Promise<void> {
    if (this.drumKit || !this.mix || !this.reverbBus) return;
    const ctx = this.ctx;
    const kit = new RoundRobinDrumKit(ctx, 'studio-kit');
    kit.setPans(this.studioOn() ? DEFAULT_BOARD_MIX.drumPans : {});
    const drumTone = ctx.createBiquadFilter();
    drumTone.type = 'lowpass';
    drumTone.Q.value = 0.5;
    const drumLevel = ctx.createGain();
    drumTone.connect(drumLevel);
    drumLevel.connect(this.mix);
    this.drumTone = drumTone;
    this.drumLevel = drumLevel;
    const drumRev = ctx.createGain();
    drumRev.gain.value = 0;
    drumLevel.connect(drumRev);
    drumRev.connect(this.reverbBus);
    this.drumRev = drumRev;
    this.drumKit = kit;
    this.applyDrumColour();
    kit.connect(drumTone);
    await kit.whenReady();
  }

  /** The band's own pad and bass, under the player's parts and ducked by the kick. */
  private buildBandVoices(): void {
    if (!this.mix || !this.reverbBus) return;
    const ctx = this.ctx;
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    // Keep the player on top: everything the band plays goes through `top`, which dips
    // while his notes sound.
    const top = ctx.createGain();
    top.gain.value = 1;
    top.connect(this.duckBus ?? this.mix);
    const gain = ctx.createGain();
    gain.gain.value = this.bandLevel();
    gain.connect(top);
    const pad = new BoardSequencerVoice(ctx, world?.voices.chord ?? { synth: 'pad', synthLevel: 0.8 });
    const bass = new BoardSequencerVoice(ctx, world?.voices.bass ?? { synth: 'sub', synthLevel: 0.8 });
    pad.setBrightness(0.6);
    pad.connect(gain);
    bass.connect(gain);
    // The counter-melody and a Rising lead-in: the world's melody sound, at the Full
    // band's level (its notes carry the band's level themselves, as a lead-in can play
    // with the band off).
    const leadGain = ctx.createGain();
    leadGain.gain.value = BAND_GAIN.full;
    leadGain.connect(top);
    const lead = new BoardSequencerVoice(ctx, world?.voices.melody ?? { synth: 'pluck', synthLevel: 0.8 });
    lead.connect(leadGain);
    // The band sits a little further back than the player: a touch more room.
    const rev = ctx.createGain();
    rev.gain.value = (world?.reverbSend ?? 0.18) * 1.3;
    top.connect(rev);
    rev.connect(this.reverbBus);
    this.bandVoices = { pad, bass, gain, rev, lead, leadGain, top };
  }

  /** Every node and voice of a band, let go. */
  private static releaseBand(v: NonNullable<BoardSequencerEngine['bandVoices']>): void {
    v.pad.dispose();
    v.bass.dispose();
    v.lead?.dispose();
    v.gain.disconnect();
    v.rev.disconnect();
    v.leadGain?.disconnect();
    v.top?.disconnect();
  }

  /** The band's jobs, live; a scene's wait for the pass (landOnNextPass). */
  setBandJobs(jobs: BandJobs): void {
    if (this.heldForPass('bandJobs', jobs, this.bandJobs)) return;
    this.bandJobs = { ...jobs };
    this.cfg.bandJobs = { ...jobs };
  }

  /** Keep the player on top: on or off, and how far the rest dips (dB). */
  setKeepOnTop(on: boolean, db: number): void {
    this.keepOnTop = on;
    this.keepOnTopDb = db;
    this.cfg.keepOnTop = on;
    this.cfg.keepOnTopDb = db;
    if (!on) {
      const g = this.bandVoices?.top?.gain;
      if (g) {
        g.cancelScheduledValues(Tone.immediate());
        g.setTargetAtTime(1, Tone.immediate(), MIX_SWITCH_TC);
      }
    }
  }

  /**
   * A scene's lead-in (None, Drum fill, Rising), into the pass its scene lands on. From the
   * clock, `inSec` before the scene is due: it lands on the first pass after then, and a
   * lead-in already waiting is kept. Without `inSec` (the scene has just been called): the
   * next pass, whatever was waiting.
   */
  cueLeadIn(kind: LeadIn, inSec?: number): void {
    if (this.timer === null || this.finishing) return;
    if (kind === 'none') {
      if (inSec === undefined) this.leadIn = null;
      return;
    }
    const now = this.lastInternalBeat;
    if (inSec !== undefined && this.leadIn && this.leadIn.landBeat > now) return;
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    const from = now + Math.max(0, inSec ?? 0) / (60 / this.cfg.bpm);
    const landBeat = (Math.floor(from / cycle) + 1) * cycle;
    // A scene the piece opens with has no pass before it to lead in from.
    if (landBeat <= 0) return;
    this.leadIn = { kind, landBeat };
    // Its sounds, ready: the kit and the band's lead (the band itself may be off).
    if (!this.drumKit) void this.buildDrumKit();
    if (!this.bandVoices) this.buildBandVoices();
  }

  /** The lead-in waiting, if any: what, and the beat its scene lands on. */
  getLeadIn(): { kind: LeadIn; landBeat: number } | null {
    return this.leadIn;
  }

  /** The band's level, live. Off is silent at once; a level change glides. */
  setBand(level: BandLevel): void {
    if (this.heldForPass('band', level, this.bandSetting)) return;
    this.bandSetting = level;
    this.cfg.band = level;
    this.applyBand();
  }

  /** The band that plays: the setting, or none while simplified. */
  private applyBand(): void {
    const level: BandLevel = this.simplify === 'off' ? this.bandSetting : 'off';
    if (this.band === level) return;
    this.band = level;
    if (level !== 'off') {
      if (!this.drumKit) void this.buildDrumKit();
      if (!this.bandVoices) this.buildBandVoices();
    }
    this.bandVoices?.gain.gain.setTargetAtTime(this.bandLevel(), Tone.immediate(), MIX_SWITCH_TC);
  }

  /** The band's level as it plays: its own (Quiet, Full), moved by a scene's Energy. */
  private bandLevel(): number {
    return BAND_GAIN[this.band] * energyBandGain(this.sceneEnergy);
  }

  /** What the band is doing now, for the legend and the board's pulse. */
  getBandStatus(): { level: BandLevel; playing: boolean; parts: BandPart[] } {
    return { level: this.band, playing: this.bandPlaying, parts: this.bandPartsNow };
  }

  /** The kit's colour and level for the current world (open and full without one). */
  private applyDrumColour(): void {
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const t = Tone.immediate();
    this.drumTone?.frequency.setTargetAtTime(world?.drums.toneHz ?? 20000, t, MIX_SWITCH_TC);
    this.drumLevel?.gain.setTargetAtTime(world?.drums.level ?? 1, t, MIX_SWITCH_TC);
  }

  /**
   * Change sound world, live. Parts with an instrument the player picked keep it; the
   * rest swap to the new world's sound from their next note (the old voice is let ring
   * out, then freed). Sends follow the world unless the part has its own.
   */
  setSoundWorld(choice: SoundWorldChoice): void {
    if (this.heldForPass('soundWorld', choice, this.cfg.soundWorld ?? 'none')) return;
    if ((this.cfg.soundWorld ?? 'none') === choice) return;
    this.cfg.soundWorld = choice;
    this.syncAbleton();
    const world = worldOf(choice);
    const t = Tone.immediate();
    this.mixTone?.frequency.setTargetAtTime(energyBrightHz(this.sceneEnergy, world?.mixToneHz ?? 20000), t, MIX_SWITCH_TC);
    this.worldGain?.gain.setTargetAtTime(this.levelGain(), t, MIX_SWITCH_TC);
    // The room changes with the world: a short plate for Lo-fi, a long hall for Ambient.
    if (this.reverb) {
      this.reverb.decay = world?.reverbDecay ?? 2.5;
      this.reverb.preDelay = world?.reverbPreDelay ?? 0.01;
      void this.reverb.generate();
    }
    this.applyDrumColour();
    // The player's colours and every launched loop's colours: a loop kept with the default
    // sound follows the World like the colour it was made with did.
    for (const ch of this.channelById.values()) {
      const e = this.voiceByChannel.get(ch.id);
      if (!e) continue;
      if (!(ch.instrument && ch.instrument.length > 0)) {
        const next = new BoardSequencerVoice(this.ctx, voiceSpecFor(ch, choice));
        next.setBrightness(e.toneBase * this.toneScale);
        next.connect(e.gain);
        e.voiceName = null;
        this.swapVoiceWhenReady(e, next);
      }
      if (ch.reverbSend === undefined) {
        e.revBase = world?.reverbSend ?? 0.18;
        e.rev.gain.setTargetAtTime(e.revBase, t, MIX_SWITCH_TC);
      }
      if (ch.delaySend === undefined) {
        e.delBase = world?.delaySend ?? 0;
        e.del.gain.setTargetAtTime(e.delBase, t, MIX_SWITCH_TC);
      }
    }
    if (this.bandVoices) {
      const old = this.bandVoices;
      this.bandVoices = null;
      this.buildBandVoices();
      setTimeout(() => BoardSequencerEngine.releaseBand(old), VOICE_RETIRE_MS);
    }
  }

  /**
   * The fill: `amount` 0 = off. A new `seed` is a new idea for the same board. `kept`
   * freezes a fill: those notes play whatever the board does, until it is let go.
   */
  setFill(amount: number, seed: number, kept: FillNote[] | null): void {
    if (!this.heldForPass('fillAmount', amount, this.fillSetting)) this.fillSetting = amount;
    this.fillSeed = seed;
    this.fillKept = kept;
    this.applyAmounts();
  }

  /**
   * The fill and Evolve amounts that play: a counter's value, else the setting — or none
   * while simplified or dropped by the safety valve.
   */
  private applyAmounts(): void {
    const fillOff = this.simplify !== 'off' || this.valveTaken.includes('fill') || this.feel === 'calm';
    const evolveOff = this.simplify !== 'off' || this.valveTaken.includes('evolve');
    // A scene's Energy makes the extra notes sparser or busier; a counter's amount is its own.
    const fill = Math.max(0, Math.min(1, this.fillOverride ?? energyExtras(this.fillSetting, this.sceneEnergy)));
    // Busy: Extra notes round everything, at least at half (New idea's level).
    this.fillAmount = fillOff ? 0 : this.feel === 'busy' ? Math.max(BUSY_FILL, fill) : fill;
    this.evolve = { ...this.evolve, amount: evolveOff ? 0 : Math.max(0, Math.min(1, this.evolveOverride ?? this.evolveSetting)) };
  }

  /** Where fill ideas come from (switchable while playing). */
  setFillEngine(engine: 'magenta' | 'rules'): void {
    if ((this.cfg.fillEngine ?? 'magenta') === engine) return;
    this.cfg.fillEngine = engine;
    this.fillKey = ''; // rebuild from the new source on the next beat
  }

  /** Where fill ideas come from now: the simple rules once the safety valve has paused Magenta. */
  private fillEngineNow(): 'magenta' | 'rules' {
    return this.valveTaken.includes('magenta') ? 'rules' : (this.cfg.fillEngine ?? 'magenta');
  }

  /** What the player is told about where the fill is coming from. */
  getFillStatus(): FillSourceStatus {
    if (this.fillEngineNow() === 'rules') return 'rules';
    const st = magentaStatus();
    if (st === 'failed') return 'offline';
    if (st !== 'ready') return 'loading';
    return this.aiAnsweredKey === this.fillKey ? 'ai' : 'thinking';
  }

  /** The fill playing now (kept or following the board), for drawing and for Keep. */
  getFillNotes(): FillNote[] {
    if (this.fillAmount <= 0) return [];
    return this.fillKept ?? this.fillNotes;
  }

  /** Evolve settings (safe while playing). Applied from the next beat. */
  setEvolve(settings: EvolveSettings): void {
    const held = this.heldForPass('evolveAmount', settings.amount, this.evolveSetting);
    if (!held) this.evolveSetting = settings.amount;
    this.evolve = { ...settings, amount: this.evolve.amount };
    this.applyAmounts();
  }

  /** The loop Evolve is on now (for Hold). */
  getEvolveLap(): number {
    return Math.max(0, this.evolveLap);
  }

  /** What each colour sounds like now, in words, and which scene that is. */
  getEvolveLabels(): Map<string, { label: string; scene: number }> {
    const out = new Map<string, { label: string; scene: number }>();
    for (const ch of this.cfg.channels) {
      const e = this.voiceByChannel.get(ch.id);
      if (e) {
        const own = ch.instrument && ch.instrument.length > 0 ? ch.instrument : null;
        out.set(ch.id, { label: describeEvolve(e.evo ?? NEUTRAL, own ?? worldOf(this.cfg.soundWorld ?? 'none')?.name ?? 'Default', this.cfg.phrases === true), scene: e.evo?.scene ?? 0 });
      } else if (ch.role === 'drums') {
        const kit = this.drumEvo.variant > 0 ? `Drums, kit ${(this.drumEvo.variant % 4) + 1}` : 'Drums';
        out.set(ch.id, { label: describeEvolve(this.drumEvo, kit, this.cfg.phrases === true), scene: this.drumEvo.scene });
      }
    }
    return out;
  }

  /**
   * Whether a colour plays a whole tune (a phrase) or one note per counter. Its own
   * choice when it has made one; otherwise by part — the melody plays the notes placed
   * (which "Sounds change" moves about, see noteDrift), while drums, bass and chords play
   * a groove, a bassline and the chords.
   * With phrases switched off (Advanced) every colour plays one note.
   */
  private playsTune(colour: string): boolean {
    return playsTune(this.channelById.get(colour), this.cfg.phrases ?? false);
  }

  /** 0..1, 0.5 = as set. Louder, busier drums above; softer, sparser below. */
  private energy = 0.5;
  setEnergy(e: number): void {
    this.energy = Math.max(0, Math.min(1, e));
    this.syncAbleton();
  }
  /**
   * Density (S2): the player's note is always admitted and remembered; a loop's note is
   * admitted unless it doubles the player's or the step already carries the cap.
   */
  private admit(source: FiredNote['source'], midis: readonly number[], group?: string): boolean {
    if (source !== 'loop') { admitPlayerNote(this.stepTally, midis); return true; }
    return admitLoopNote(this.stepTally, midis, this.stepLoopCap, group);
  }
  /** How hard notes play at this Energy: 0.7 at the bottom, 1 at the middle, 1.3 at the top. */
  private energyGain(): number {
    return 0.7 + 0.6 * this.energy;
  }
  /** Drum busyness added by Energy: one groove sparser low down, one busier near the top. */
  private energyBusy(): number {
    return this.energy < 0.3 ? -1 : this.energy > 0.7 ? 1 : 0;
  }

  /** How roomy the whole instrument is, when no control counter owns the reverb or echo. */
  private spaceAmount = 1;
  /** Whether a reverb / echo counter is on the board right now (it then owns that bus). */
  private reverbOwned = false;
  private delayOwned = false;
  setSpace(space: number): void {
    this.spaceSetting = Math.max(0, Math.min(1, space));
    this.syncAbleton();
    // 0 = dry, 0.5 = the world's own room, 1 = twice as much.
    const amount = 0.15 + 1.7 * Math.max(0, Math.min(1, space));
    if (amount === this.spaceAmount) return;
    this.spaceAmount = amount;
    const t = Tone.immediate();
    if (!this.reverbOwned) {
      this.reverbAmount = amount;
      this.reverbBus?.gain.setTargetAtTime(amount, t, 0.3);
    }
    if (!this.delayOwned) {
      this.delayAmount = amount;
      this.delayBus?.gain.setTargetAtTime(amount, t, 0.3);
    }
  }

  /**
   * A one-note counter wandering: on some passes it plays a neighbouring note of the scale
   * instead of its own, so a placed note doesn't sound stuck. How often is the colour's own
   * "Notes wander" (on by default), raised by "Sounds change"; a saved loop's notes follow
   * "Loops vary" instead. More = more passes moved. Every fourth pass it is home again, so the player's note stays the
   * anchor. The same seed, pass and counter always give the same note, so Freeze holds it
   * and Previous brings it back. A colour with "Changes over time" off never moves.
   */
  noteDrift(cell: { row: number; col: number; colour: string; layer?: string }, beat: number): number {
    const ch = this.channelById.get(cell.colour);
    if (!ch || ch.changes === false) return 0;
    // A saved loop varies by itself ("Loops vary"); the player's own counters by their
    // colour's "Notes wander". Either way, "Sounds change" can only add to it.
    const own = isLoopLayer(cell.layer) ? this.loopVaryChance() : (ch.noteVary ?? DEFAULT_NOTE_VARY);
    const amount = Math.max(this.evolve.amount, own);
    if (amount <= 0) return 0;
    const lap = this.evolve.holdLap ?? this.ideaLap(beat);
    if (lap % 4 === 0) return 0;
    const x = mixHash(this.evolveSeed(), lap, cell.row, cell.col, `${cell.layer ?? ''}|${cell.colour}`);
    if ((x % 1000) / 1000 >= amount) return 0;
    // Mostly a step away, sometimes two; up and down equally.
    const pick = (x >>> 10) % 6;
    return [1, -1, 1, -1, 2, -2][pick];
  }

  /** How much saved loops vary by themselves, 0..1 (0 = they replay exactly as saved). */
  private loopVary = 0.35;
  setLoopVary(v: number): void {
    this.loopVary = Math.max(0, Math.min(1, v));
  }
  /** The chance a loop is varied on a pass (not counting every 4th, which is always as saved). */
  private loopVaryChance(): number {
    return Math.min(0.95, this.loopVary * 1.4);
  }

  /**
   * A one-note loop counter, on some varied passes, adds a passing note half a beat later:
   * a step towards where the tune goes next. Null = not this pass.
   */
  private loopOrnament(cell: { row: number; col: number; colour: string; layer?: string }, beat: number): number | null {
    if (!isLoopLayer(cell.layer) || this.loopVary <= 0) return null;
    if (this.channelById.get(cell.colour)?.changes === false) return null;
    const lap = this.evolve.holdLap ?? this.ideaLap(beat);
    if (lap % 4 === 0) return null;
    const x = mixHash(this.evolveSeed() + 101, lap, cell.row, cell.col, `${cell.layer}|${cell.colour}`);
    if ((x % 1000) / 1000 >= this.loopVaryChance() * 0.5) return null;
    return (x >>> 10) % 2 === 0 ? 1 : -1;
  }

  /**
   * A saved loop that plays tunes: on some passes it plays another version of its phrase
   * (another motif or bassline), and a drum loop goes a groove busier or sparser. Home
   * every fourth pass, like the note drift. The player's own counters are left alone.
   */
  private loopVariation(colour: string, layer: string | undefined, beat: number, drums: boolean): { variant: number; busy: number } {
    if (!isLoopLayer(layer) || this.loopVary <= 0) return { variant: 0, busy: 0 };
    if (this.channelById.get(colour)?.changes === false) return { variant: 0, busy: 0 };
    const lap = this.evolve.holdLap ?? this.ideaLap(beat);
    if (lap % 4 === 0) return { variant: 0, busy: 0 };
    const x = mixHash(this.evolveSeed() + 17, lap, 0, 0, `${layer}|${colour}`);
    if ((x % 1000) / 1000 >= this.loopVaryChance()) return { variant: 0, busy: 0 };
    if (drums) return { variant: 0, busy: (x >>> 11) % 2 === 0 ? 1 : -1 };
    return { variant: 1 + ((x >>> 11) % 5), busy: 0 };
  }

  /** `midi` moved `steps` notes along the scale (from an off-scale note, the first step lands on it). */
  private scaleStep(midi: number, steps: number): number {
    if (steps === 0) return midi;
    const pcs = new Set(this.cfg.scaleSemitones.map((s) => (((this.cfg.scaleRootMidi + s) % 12) + 12) % 12));
    if (pcs.size === 0) return midi;
    const dir = steps > 0 ? 1 : -1;
    let m = midi;
    for (let k = 0; k < Math.abs(steps); k++) {
      do { m += dir; } while (!pcs.has(((m % 12) + 12) % 12));
    }
    return m;
  }

  /** The Evolve state for a colour (neutral when it has none). */
  private evoFor(id: string): EvolveState {
    return this.voiceByChannel.get(id)?.evo ?? NEUTRAL;
  }

  /**
   * Move every colour's sound to where Evolve has it on this loop: glide the drift, swap
   * the instrument at a scene change. Runs once per loop (or when the settings change).
   */
  private applyEvolve(beat: number): void {
    const lap = this.ideaLap(beat);
    const ev = this.evolve;
    const seed = this.evolveSeed();
    const key = `${ev.amount}|${ev.sceneLoops}|${seed}|${ev.holdLap}|${this.cfg.soundWorld}|${this.cfg.channels.map((c) => (c.changes === false ? 0 : 1)).join('')}`;
    if (lap === this.evolveLap && key === this.evolveKey) return;
    this.evolveLap = lap;
    this.evolveKey = key;
    const world = this.cfg.soundWorld ?? 'none';
    const at = ev.holdLap ?? lap;
    this.evolveScene = ev.amount > 0 ? Math.floor(at / Math.max(1, ev.sceneLoops)) : 0;
    const t = Tone.immediate();
    const studio = this.studioOn();
    for (const ch of this.cfg.channels) {
      const role = ch.role;
      // A colour can opt out: it keeps its own sound while the others change.
      const amount = ch.changes === false ? 0 : ev.amount;
      if (role === 'drums') {
        this.drumEvo = evolveState({ colour: ch.id, role, lap: at, seed, amount, sceneLoops: ev.sceneLoops, world, ownInstrument: true });
        const w = worldOf(world);
        const on = amount > 0;
        // Without a world the kit is wide open, so a drift brighter could never be heard:
        // under Evolve it starts from a little below the top to have room both ways.
        const base = w?.drums.toneHz ?? (on ? 12000 : 20000);
        this.drumTone?.frequency.setTargetAtTime(Math.min(20000, base * this.drumEvo.brightness), t, EVOLVE_GLIDE_SEC);
        // Some room around the kit, growing and shrinking with the scene.
        this.drumRev?.gain.setTargetAtTime(on ? 0.12 * this.drumEvo.reverb : 0, t, EVOLVE_GLIDE_SEC);
        // Another kick and snare from the kit for this scene.
        this.drumKit?.setFixedVariant?.(this.drumEvo.variant > 0 ? this.drumEvo.variant : null);
        continue;
      }
      const e = this.voiceByChannel.get(ch.id);
      if (!e || (role !== 'melody' && role !== 'chord' && role !== 'bass')) continue;
      const own = !!(ch.instrument && ch.instrument.length > 0);
      const state = evolveState({ colour: ch.id, role, lap: at, seed, amount, sceneLoops: ev.sceneLoops, world, ownInstrument: own });
      // A scene's instrument: swap the voice, letting the old one ring out.
      const wanted = state.voice?.name ?? null;
      if (wanted !== (e.voiceName ?? null)) {
        const next = new BoardSequencerVoice(this.ctx, state.voice?.spec ?? voiceSpecFor(ch, world));
        next.connect(e.gain);
        e.voiceName = wanted;
        this.swapVoiceWhenReady(e, next);
      }
      e.evo = state;
      e.voice.setBrightness(e.toneBase * this.toneScale * state.brightness);
      e.rev.gain.setTargetAtTime(e.revBase * state.reverb, t, EVOLVE_GLIDE_SEC);
      e.del.gain.setTargetAtTime(e.delBase + state.delay, t, EVOLVE_GLIDE_SEC);
      if (studio && e.pan) e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (e.panBase ?? 0) + state.pan)), t, EVOLVE_GLIDE_SEC);
    }
    // Evolve's instrument for this scene switches Ableton's chain too (only when it changed).
    this.syncAbleton();
  }

  /**
   * Change a part's instrument without a gap. A sampled instrument is silent until its
   * samples have loaded, so the old one keeps playing until the new one can sound; then
   * the new one takes over and the old one rings out before it is freed. A newer change
   * replaces one still loading.
   */
  private swapVoiceWhenReady(
    e: { voice: BoardSequencerVoice; pending?: { voice: BoardSequencerVoice; timer: ReturnType<typeof setInterval> } | null },
    next: BoardSequencerVoice,
  ): void {
    if (e.pending) {
      clearInterval(e.pending.timer);
      e.pending.voice.dispose();
      e.pending = null;
    }
    const take = (): void => {
      if (e.pending) clearInterval(e.pending.timer);
      e.pending = null;
      const old = e.voice;
      e.voice = next;
      setTimeout(() => old.dispose(), VOICE_RETIRE_MS);
    };
    if (next.isReady()) { take(); return; }
    const started = Date.now();
    const timer = setInterval(() => {
      if (next.isReady() || Date.now() - started > VOICE_READY_MAX_MS) take();
    }, VOICE_READY_POLL_MS);
    e.pending = { voice: next, timer };
  }

  /**
   * The colours changed while playing: a part's instrument or a drum colour's kit piece.
   * The drum choice is read note by note, so it applies at once; a new instrument comes
   * in without a gap, once its samples have loaded. Jobs (roles) don't change while
   * playing — the screen stops first — so no part appears or disappears here.
   */
  setChannels(channels: ColourChannel[]): void {
    if (channels === this.cfg.channels) return;
    const before = this.channelById;
    this.cfg.channels = channels;
    this.rebuildChannelIndex();
    for (const ch of channels) {
      const e = this.voiceByChannel.get(ch.id);
      const old = before.get(ch.id);
      if (!e) { this.buildVoice(ch); continue; }
      if (!old || (old.instrument ?? '') === (ch.instrument ?? '')) continue;
      const next = new BoardSequencerVoice(this.ctx, voiceSpecFor(ch, this.cfg.soundWorld ?? 'none'));
      next.setBrightness(e.toneBase * this.toneScale);
      next.connect(e.gain);
      e.voiceName = null;
      this.swapVoiceWhenReady(e, next);
    }
    this.syncAbleton();
  }

  /**
   * The colour index: the player's channels, then the loop colours of every loop that is
   * launched (fading out included) or about to be. A loop keeps its colours until it has
   * really left, so a fade-out is heard to the end.
   */
  private rebuildChannelIndex(): void {
    const loopColours = [...this.launched.flatMap((l) => l.colours ?? []), ...(this.pendingLaunch?.colours ?? [])];
    this.channelById = new Map([...this.cfg.channels, ...loopColours].map((c) => [c.id, c]));
  }

  /** Counters play phrases (on) or one note each (off), from the next beat. */
  setPhrases(on: boolean): void {
    if (this.heldForPass('phrases', on, this.cfg.phrases ?? false)) return;
    this.cfg.phrases = on;
  }

  /**
   * A scene's Energy (see performance/energy), 0 = off. While playing, a scene's waits for
   * the pass (landOnNextPass); then the band's level, its drums, the extra notes and the
   * brightness all move together, gliding so nothing jumps.
   */
  setSceneEnergy(e: number): void {
    const v = Math.max(0, Math.min(5, Math.round(e)));
    if (this.heldForPass('sceneEnergy', v, this.sceneEnergy)) return;
    if (v === this.sceneEnergy) return;
    this.sceneEnergy = v;
    this.cfg.sceneEnergy = v;
    const t = Tone.immediate();
    this.bandVoices?.gain.gain.setTargetAtTime(this.bandLevel(), t, ENERGY_GLIDE_TC);
    this.worldGain?.gain.setTargetAtTime(this.levelGain(), t, ENERGY_GLIDE_TC);
    this.mixTone?.frequency.setTargetAtTime(energyBrightHz(v, worldOf(this.cfg.soundWorld ?? 'none')?.mixToneHz ?? 20000), t, ENERGY_GLIDE_TC);
    this.applyAmounts();
  }

  /** The whole board's level: the world's (every world as loud), moved by a scene's Energy. */
  private levelGain(): number {
    return worldLevelGain(this.cfg.soundWorld ?? 'none') * energyMixGain(this.sceneEnergy);
  }

  /** The Energy playing now (0 = off). */
  getSceneEnergy(): number {
    return this.sceneEnergy;
  }

  /**
   * The ideas the AI plays with (see performance/ideas). A scene's wait for its pass; from
   * that pass on, every random choice is counted from it, so the scene plays the same
   * however it was reached. Set while stopped, they start with the run.
   */
  setIdeas(ideas: IdeasSetting): void {
    if (this.heldForPass('ideas', ideas, this.ideas)) return;
    if (passValueEqual(ideas, this.ideas)) return;
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    this.applyIdeas(ideas, this.timer === null ? 0 : Math.floor((this.lastInternalBeat + 1) / cycle) * cycle);
  }

  private applyIdeas(ideas: IdeasSetting, fromBeat: number): void {
    this.ideas = { ...ideas };
    this.ideasFromBeat = Math.max(0, fromBeat);
    this.fillKey = ''; // the extra notes from the new ideas, from the next beat
  }

  /** "Surprise me each time": fresh ideas every run and Magenta's ideas not kept (as before). */
  setSurprise(on: boolean): void {
    if (on === this.surprise) return;
    this.surprise = on;
    this.runSalt = on ? freshIdeas() : 0;
    this.fillKey = '';
  }

  /**
   * Magenta's ideas kept with the piece, by scene id (the screen's copy; read, never kept
   * by reference past the next call). Called with the same object again, nothing is done.
   */
  setKeptIdeas(source: unknown, byOwner: ReadonlyMap<string, readonly KeptIdea[]>): void {
    if (source === this.keptIdeasSource) return;
    this.keptIdeasSource = source;
    this.keptIdeas = new Map(byOwner);
  }

  /** Told each time Magenta makes an idea worth keeping: for which scene, and the idea. */
  setOnIdeaKept(cb: ((owner: string, idea: KeptIdea) => void) | null): void {
    this.onIdeaKept = cb;
  }

  /** The seed every random choice starts from now: the ideas, and the run's own under Surprise me. */
  private ideaSeed(): number {
    return mixSeeds(this.ideas.seed, this.runSalt);
  }

  /** Which time round the loop `beat` is, counted from when the ideas began (as before with none). */
  private ideaLap(beat: number): number {
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    return lapIndex(Math.max(0, beat - this.ideasFromBeat), cycle);
  }

  /** Sounds change's seed with the ideas in it. */
  private evolveSeed(): number {
    return withIdeas(this.evolve.seed, this.ideaSeed());
  }

  /** The band's variation on this bar, from the ideas (0 = none, as before ideas existed). */
  private bandVary(beat: number, step: number): number {
    const seed = this.ideaSeed();
    return seed === 0 ? 0 : (mixHash(seed, this.ideaLap(beat), Math.floor(step / 4), 0, 'band') | 1) >>> 0;
  }

  /** The extra notes' seed with the ideas in it. */
  private fillSeedNow(): number {
    return withIdeas(this.fillSeed, this.ideaSeed());
  }

  /**
   * A number in [0, 1) for one of the groove's loose choices (a note rested, how hard it
   * plays): seeded, so a rehearsal plays back the same, or fresh under Surprise me.
   */
  private looseChance(beat: number, row: number, col: number, what: string): number {
    if (this.surprise) return Math.random();
    return hashChance(withIdeas(0x5eed, this.ideaSeed()), beat - this.ideasFromBeat, row, col, what);
  }

  /**
   * The chord sequence. While playing, a new one starts at the next pass (its first chord
   * on the pass), as a scene's loops do; stopped, at once.
   */
  setChords(chords: ChordSetting): void {
    const now = this.cfg.chords ?? AS_BEFORE_CHORDS;
    if (this.heldForPass('chords', chords, now)) return;
    if (sameChords(now, chords)) return;
    if (this.timer === null) {
      this.cfg.chords = { ...chords };
      this.chordOrigin = 0;
      return;
    }
    this.passPending = { ...(this.passPending ?? {}), chords: { ...chords } };
  }

  /** The clash nudge for one-note melody and bass, from the next note. */
  setClashNudge(on: boolean): void {
    this.cfg.clashNudge = on;
  }

  /** The chord every pitched part is playing to now (null = none set). */
  getCurrentChord(): Harmony | null {
    return this.chordNow.harmony;
  }

  /**
   * A scene's sound lands on the pass, with its loops: these settings wait for the next
   * pass boundary while the board plays (stopped, they are set at once). Meanwhile the
   * screen may push the same values again (they keep waiting) or the player may pick
   * something else (that wins, at once). The speed is not here: it glides as it always has.
   */
  landOnNextPass(p: PassSettings): void {
    if (this.timer === null) {
      this.applyPassSettings(p, 0);
      return;
    }
    const cur: PassSettings = {
      soundWorld: this.cfg.soundWorld ?? 'none', band: this.bandSetting, phrases: this.cfg.phrases ?? false,
      fillAmount: this.fillSetting, evolveAmount: this.evolveSetting, chords: this.cfg.chords ?? AS_BEFORE_CHORDS,
      bandJobs: this.bandJobs, sceneEnergy: this.sceneEnergy, ideas: this.ideas,
    };
    const next: PassSettings = { ...(this.passPending ?? {}) };
    for (const k of Object.keys(p) as (keyof PassSettings)[]) {
      const v = p[k];
      if (v === undefined) continue;
      if (passValueEqual(v, cur[k])) delete next[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    this.passPending = Object.keys(next).length > 0 ? next : null;
  }

  /**
   * A setter called while a scene's value waits for the pass: the same value as waiting, or
   * the one playing now (the screen catching up), changes nothing yet; anything else is the
   * player's own choice, which wins at once.
   */
  private heldForPass<K extends keyof PassSettings>(key: K, value: NonNullable<PassSettings[K]>, current: NonNullable<PassSettings[K]>): boolean {
    const waiting = this.passPending?.[key];
    if (waiting === undefined || !this.passPending) return false;
    if (passValueEqual(value, waiting) || passValueEqual(value, current)) return true;
    delete this.passPending[key];
    if (Object.keys(this.passPending).length === 0) this.passPending = null;
    return false;
  }

  /** Put a scene's settings in now: on the pass boundary at `beat` (or at once, stopped). */
  private applyPassSettings(p: PassSettings, beat: number): void {
    if (p.soundWorld !== undefined) this.setSoundWorld(p.soundWorld);
    if (p.band !== undefined) this.setBand(p.band);
    if (p.bandJobs !== undefined) this.setBandJobs(p.bandJobs);
    if (p.phrases !== undefined) this.setPhrases(p.phrases);
    if (p.fillAmount !== undefined) { this.fillSetting = p.fillAmount; this.applyAmounts(); }
    if (p.evolveAmount !== undefined) { this.evolveSetting = p.evolveAmount; this.applyAmounts(); }
    if (p.chords !== undefined) {
      this.cfg.chords = { ...p.chords };
      this.chordOrigin = beat;
    }
    if (p.sceneEnergy !== undefined) this.setSceneEnergy(p.sceneEnergy);
    if (p.ideas !== undefined) this.applyIdeas(p.ideas, beat);
  }

  private studioOn(): boolean {
    return this.cfg.studioMix !== false;
  }

  /**
   * Switch between the studio mix and the original one, live, for A/B listening. The two
   * outputs crossfade; placement and ducking follow; note lengths change from the next
   * note on.
   */
  setStudioMix(on: boolean): void {
    if (on === this.studioOn()) return;
    this.cfg.studioMix = on;
    const t = Tone.immediate();
    this.studioOut?.gain.setTargetAtTime(on ? 1 : 0, t, MIX_SWITCH_TC);
    this.classicOut?.gain.setTargetAtTime(on ? 0 : 1, t, MIX_SWITCH_TC);
    this.voiceByChannel.forEach((e) => {
      e.pan?.pan.setTargetAtTime(on ? (e.panBase ?? 0) : 0, t, MIX_SWITCH_TC);
    });
    this.drumKit?.setPans(on ? DEFAULT_BOARD_MIX.drumPans : {});
    if (!on && this.duckBus) {
      this.duckBus.gain.cancelScheduledValues(t);
      this.duckBus.gain.setTargetAtTime(1, t, MIX_SWITCH_TC);
    }
  }

  /** Dip the ducked parts for a kick at `time` (studio mix only). */
  private duckForKick(time: number): void {
    const g = this.duckBus?.gain;
    if (!g || !this.studioOn()) return;
    const d = DEFAULT_BOARD_MIX.duck;
    const depth = worldOf(this.cfg.soundWorld ?? 'none')?.duck ?? d.depth;
    if (depth <= 0) return;
    // Kicks are scheduled in time order, so anything already queued past this one is a
    // recovery that this kick supersedes.
    g.cancelScheduledValues(time);
    g.setTargetAtTime(1 - depth, time, d.attackTc);
    g.setTargetAtTime(1, time + d.holdSec, d.releaseTc);
  }

  /**
   * MIDI out, live. Any change to where notes go (on/off, the port, the channels) first
   * releases everything the receiving instrument may still hold, so nothing sticks.
   * Turning it on sends the current Expression and Volume, so Ableton starts in step.
   */
  setMidiOut(opts: BoardMidiOptions, portKey = ''): void {
    const was = this.midiOpts;
    const channels = channelsInUse(opts.colourChannels, opts.loopChannels);
    const routeChanged = was.enabled !== opts.enabled || this.midiPortKey !== portKey
      || (was.channelMode ?? 'part') !== (opts.channelMode ?? 'part')
      || !!was.loopChannels !== !!opts.loopChannels
      || channels.join(',') !== this.midiChannels.join(',');
    if (opts.enabled && !this.midi) this.midi = new BoardMidiSender(this.ctx);
    if (routeChanged && was.enabled) this.midi?.releaseAll(this.midiChannels);
    this.midiOpts = opts;
    this.midiPortKey = portKey;
    this.midiChannels = channels;
    if (routeChanged && opts.enabled) {
      this.exprLast.clear();
      this.exprUntil = 0;
      this.volumeSent = -1;
      this.sendExpressionNow();
      this.sendVolume();
      this.syncAbleton(true);
    }
    if (!opts.enabled) this.abletonSent.clear();
  }

  private midiPortKey = '';

  /**
   * Phase 2: tell Ableton which chain each channel plays and how its macros sit. Only the
   * values that changed go out; `full` sends everything (Play, a new route, the button).
   * A control counter on the board owns its macro while it is there.
   */
  private syncAbleton(full = false): void {
    if (!this.midiOpts.enabled || !this.midi) return;
    const evolveVoices = new Map<string, NamedVoice | null>();
    this.voiceByChannel.forEach((e, id) => evolveVoices.set(id, e.evo?.voice ?? null));
    const plan = abletonPlan({
      channels: this.cfg.channels,
      world: this.cfg.soundWorld ?? 'none',
      channelMode: this.midiOpts.channelMode ?? 'part',
      colourChannels: this.midiOpts.colourChannels,
      evolveVoices,
      energy: this.energy,
      space: this.spaceSetting,
      swing: this.cfg.swing,
      loopChannels: this.midiOpts.loopChannels,
    });
    this.abletonLast = plan;
    const owned = new Set<number>([
      ...(this.counterOwns.tone ? [CC_BRIGHT] : []), ...(this.counterOwns.reverb ? [CC_SPACE] : []),
    ]);
    const mine = new Map([...plan.controls].filter(([, c]) => !owned.has(c.cc)));
    this.sendAbleton(changedControls(mine, this.abletonSent, full));
  }

  private sendAbleton(list: readonly AbletonControl[]): void {
    if (list.length === 0 || !this.midi || !this.midiOpts.enabled) return;
    this.midi.sendControls(list);
    for (const c of list) this.abletonSent.set(controlKey(c.channel, c.cc), c.value);
  }

  /** "Send sound choices to Ableton": everything again, for after Ableton is restarted. */
  resendAbleton(): void {
    this.syncAbleton(true);
  }

  /** What the screen shows: each channel's chain now, every value last sent, and shared channels. */
  abletonState(): { chains: ReadonlyMap<number, number>; sent: ReadonlyMap<string, number>; shares: AbletonPlan['shares'] } {
    return {
      chains: this.abletonLast?.chains ?? new Map(),
      sent: this.abletonSent,
      shares: this.abletonLast?.shares ?? new Map(),
    };
  }

  /** Panic: every note off and all sound off, on all 16 channels. The piece carries on. */
  panicMidi(): void {
    this.midi?.panic();
    this.exprLast.clear();
    this.exprUntil = 0;
  }

  /**
   * The latency check: one MIDI note and ADMI's own click at the same scheduled moment.
   * In Both mode a double hit (a flam) means "Send early by" needs moving.
   */
  playTestNote(): boolean {
    if (this.muted) return false;
    const t = Tone.now() + 0.05;
    if (this.tick && this.internalSound) {
      const tt = strictlyAfter(t, this.lastTickTime);
      this.lastTickTime = tt;
      this.tick.triggerAttackRelease('C2', 0.05, tt);
    }
    if (this.midiOpts.enabled) this.midi?.testNote(t, this.midiOpts.leadMs);
    return true;
  }

  /** Every change to the ending gain goes to the audio and to its copy for MIDI alike. */
  private endAuto(): {
    set(v: number, t: number): void; linear(v: number, t: number): void;
    target(v: number, t: number, tc: number): void; cancel(t: number): void;
  } {
    const g = this.endGain?.gain;
    const track = this.endTrack;
    // After the backstop's fade, the level is left where it took it: at 0.
    if (this.backstop) return { set: () => {}, linear: () => {}, target: () => {}, cancel: () => {} };
    return {
      set: (v, t) => { g?.setValueAtTime(v, t); track.setValueAtTime(v, t); },
      linear: (v, t) => { g?.linearRampToValueAtTime(v, t); track.linearRampToValueAtTime(v, t); },
      target: (v, t, tc) => { g?.setTargetAtTime(v, t, tc); track.setTargetAtTime(v, t, tc); },
      cancel: (t) => { g?.cancelScheduledValues(t); track.cancelScheduledValues(t); },
    };
  }

  /**
   * CC 11 on a channel as the receiving end should hear it: 0 while muted, else the ending
   * gain, and on a loop's own channel also where that loop's fade has got to.
   */
  private expressionFor(channel: number, audioTime: number): number {
    if (this.muted || audioTime < this.cutUntil) return 0;
    return gainToCc(this.endTrack.valueAt(audioTime) * this.loopGain(channel, audioTime));
  }

  /** A loop channel's loudness: 1 while a loop plays on it un-faded, else its fading loop's level. */
  private loopGain(channel: number, audioTime: number): number {
    if (!this.midiOpts.loopChannels || !LOOP_CHANNELS.includes(channel)) return 1;
    let fading: number | null = null;
    for (const l of this.launched) {
      if (loopChannel(l.slot) !== channel) continue;
      const track = this.loopFades.get(l.slot);
      if (!track) return 1;
      const v = track.valueAt(audioTime);
      fading = fading === null ? v : Math.max(fading, v);
    }
    // A loop that has finished fading out has left; its channel stays where it ended.
    if (fading === null) {
      for (const [slot, track] of this.loopFades) if (loopChannel(slot) === channel) return track.valueAt(audioTime);
      return 1;
    }
    return fading;
  }

  private sendExpressionNow(): void {
    if (!this.midiOpts.enabled || !this.midi) return;
    const now = Tone.immediate();
    for (const ch of this.midiChannels) {
      const v = this.expressionFor(ch, now);
      this.midi.expression(v, [ch]);
      this.exprLast.set(ch, v);
    }
    this.exprUntil = now;
  }

  /**
   * Called from the scheduler: CC 11 for the look ahead in 50 ms steps, sent only when it
   * changes. Never queued further ahead than the notes, so Cancel the ending, Stop or
   * Mute take effect within one tick rather than leaving a fade already sent to the port.
   */
  private tickExpression(): void {
    if (!this.midiOpts.enabled || !this.midi) return;
    const now = Tone.immediate();
    const horizon = now + LOOKAHEAD_SEC;
    let t = Math.max(this.exprUntil + EXPRESSION_STEP_SEC, now);
    while (t <= horizon) {
      for (const ch of this.midiChannels) {
        const v = this.expressionFor(ch, t);
        if (v === this.exprLast.get(ch)) continue;
        this.midi.expression(v, [ch], t);
        this.exprLast.set(ch, v);
      }
      this.exprUntil = t;
      t += EXPRESSION_STEP_SEC;
    }
  }

  /** The Volume counter as CC 7 on channel 16, sent only when its value changes. */
  private sendVolume(): void {
    if (!this.midiOpts.enabled || !this.midi) return;
    const v = gainToCc(this.cfg.volume);
    if (v === this.volumeSent) return;
    this.midi.volume(this.cfg.volume);
    this.volumeSent = v;
  }

  /**
   * The built-in sound on or off (off = MIDI only). Everything else carries on. Off, the
   * voices aren't played at all (silent notes piled up in the synths: "Max polyphony
   * exceeded"); every note is still logged, drawn and sent. Can be set before init.
   */
  setInternalSound(on: boolean): void {
    if (this.internalSound === on) return;
    this.internalSound = on;
    this.applyMixGain(MUTE_GLIDE_SEC);
  }

  /** Resolves once every channel's voice (and the band's) can sound, or after `maxMs`. */
  private async voicesReady(maxMs: number): Promise<void> {
    const ready = (): boolean => {
      const voices = [...this.voiceByChannel.values()].map((e) => e.voice);
      if (this.bandVoices) voices.push(this.bandVoices.pad, this.bandVoices.bass);
      return voices.every((v) => typeof v.isReady !== 'function' || v.isReady());
    };
    const until = performance.now() + maxMs;
    while (!ready() && performance.now() < until) {
      await new Promise((r) => setTimeout(r, VOICE_READY_POLL_MS));
    }
  }

  private recordFired(n: FiredNote): void {
    if (n.loopSlot === undefined && (n.origin === 'placed' || n.origin === 'phrase')) {
      const slot = loopSlotOf(this.firingLayer);
      if (slot !== null) n.loopSlot = slot;
    }
    if (n.origin === 'placed' || n.origin === 'phrase') this.hear(n);
    // MIDI notes fade with the ending, by velocity, which every instrument hears with no
    // set-up. Read a moment after the note, so the final chord (which lifts the gain back
    // up over 30 ms) arrives at full strength.
    if (this.midi && this.midiOpts.enabled) {
      const scale = Math.min(1, Math.max(0, this.endTrack.valueAt(n.audioTime + 0.05)));
      this.midi.send(n, this.muted, scale >= 1 ? this.midiOpts : { ...this.midiOpts, velocityScale: (this.midiOpts.velocityScale ?? 1) * scale });
    }
    this.fired.push(n);
    if (this.fired.length > FIRED_NOTE_CAP) this.fired.splice(0, this.fired.length - FIRED_NOTE_CAP);
  }

  /**
   * A note of the board's or a loop's, as the band hears it: a drum on this beat, a melody
   * note (and its pitch, while it sounds), where the chord parts and the melody sit, and,
   * for the player's own notes, when they sound (keep him on top). A few sums per note.
   */
  private hear(n: FiredNote): void {
    if (n.drum) {
      this.heardDrums = true;
      this.heardDrumHits.add(`${n.drum}@${n.audioTime}`);
      return;
    }
    const midis = n.midis ?? (n.midi !== undefined ? [n.midi] : []);
    if (midis.length === 0) return;
    const end = n.audioTime + n.durSec;
    if (n.role === 'chord' || n.role === 'melody') {
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      const lo = Math.min(...midis) - this.cfg.octaveShift * 12;
      const hi = Math.max(...midis) - this.cfg.octaveShift * 12;
      const r = this.heardRegister[n.role];
      this.heardRegister[n.role] = r && this.firingBeat - r.beat <= cycle
        ? { lo: Math.min(r.lo, lo), hi: Math.max(r.hi, hi), beat: this.firingBeat }
        : { lo, hi, beat: this.firingBeat };
    }
    if (n.role === 'melody') {
      this.heardMelody = true;
      this.melodyWindows.push({ start: n.audioTime, end, pcs: midis.map((m) => ((m % 12) + 12) % 12) });
    }
    if (n.source !== 'loop' && this.keepOnTop) {
      const w = { start: n.audioTime, end };
      this.timWindows.push(w);
      this.timThisBeat.push(w);
    }
  }

  /** A new beat: what the band heard on the last one is forgotten; old notes let go. */
  private beginHearing(beat: number, cellTime: number): void {
    this.firingBeat = beat;
    this.heardDrums = false;
    this.heardMelody = false;
    this.heardDrumHits.clear();
    this.timThisBeat = [];
    if (this.timWindows.length > 0) this.timWindows = pruneWindows(this.timWindows, cellTime);
    if (this.melodyWindows.length > 0) this.melodyWindows = this.melodyWindows.filter((w) => w.end > cellTime);
  }

  private resetHeard(): void {
    this.beginHearing(0, Infinity);
    this.heardRegister = { chord: null, melody: null };
    this.bandCounterLast = null;
    this.leadIn = null;
  }

  /** Where a part has sounded, unless a whole pass has gone by without it. */
  private registerOf(part: 'chord' | 'melody'): Register | null {
    const r = this.heardRegister[part];
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    return r && this.firingBeat - r.beat <= cycle ? { lo: r.lo, hi: r.hi } : null;
  }

  /** How loud everything but the player is at `t` (1, or less while his notes sound). */
  private topFactor(t: number): number {
    return this.keepOnTop && this.timWindows.length > 0 ? noteDip(t, this.timWindows, this.keepOnTopDb) : 1;
  }

  /**
   * The band's own gain dips under the player's notes that started on this beat, with the
   * same curve as topFactor: down at the first, back up after the last still sounding.
   */
  private dipBandForPlayer(): void {
    const g = this.bandVoices?.top?.gain;
    if (!g || !this.keepOnTop || this.timThisBeat.length === 0) return;
    const start = Math.min(...this.timThisBeat.map((w) => w.start));
    const end = Math.max(...this.timWindows.map((w) => w.end));
    g.cancelScheduledValues(start);
    g.setTargetAtTime(dipGain(this.keepOnTopDb), start, KEEP_ON_TOP_ATTACK_TC);
    g.setTargetAtTime(1, end, KEEP_ON_TOP_RELEASE_TC);
  }

  /** Take (and clear) the notes scheduled since the last call. Polled from rAF. */
  drainFiredNotes(): FiredNote[] {
    const out = this.fired;
    this.fired = [];
    return out;
  }

  setActiveCells(cells: ActiveCell[]): void {
    this.active = cells;
    this.boardArrived = true;
  }

  /** Set the layered loops (from the loop bank) that play atop the live pattern. */
  setActiveLoops(loops: ActiveCell[][]): void {
    this.activeLoops = loops;
  }

  /**
   * The loops wanted from the launcher, by slot. While the clock runs they take effect at
   * the next pass (starting and stopping alike); while stopped, at once, so Play begins
   * with them.
   */
  setLaunchedLoops(slots: number[], loops: ActiveCell[][], loopColours: ColourChannel[] = [], way?: LaunchWay): void {
    for (const ch of loopColours) this.buildVoice(ch);
    // A drums loop needs the kit, which init builds only when the player has drums or a band.
    if (!this.drumKit && loopColours.some((c) => c.role === 'drums')) void this.buildDrumKit();
    if (!this.timer) {
      this.launched = slots.map((slot, i) => ({ slot, cells: loops[i] ?? [], colours: loopColours }));
      this.launchedSlots = slots;
      this.pendingLaunch = null;
      this.rebuildChannelIndex();
      return;
    }
    const playing = this.launched.filter((l) => l.fade?.dir !== 'out').map((l) => l.slot);
    const same = slots.length === playing.length && slots.every((s, i) => s === playing[i]);
    // A scene's way in (K3) is kept until it lands: a hand press in the same pass inherits it,
    // so a cut is never softened into the player's fade by a counter in the loop zone.
    this.pendingLaunch = same ? null : { slots, loops, colours: loopColours, way: way ?? this.pendingLaunch?.way ?? null };
    // A loop still fading out keeps its colours; the ones coming in need theirs now.
    this.rebuildChannelIndex();
  }

  /**
   * End the piece: from the next pass boundary everything fades over `beats` (0 = stop at
   * the boundary), then `onFinished` is called. Visuals and the log carry on through the
   * fade — the lights go down with the sound.
   */
  finish(beats: number, onFinished: () => void, style: EndingStyle = beats === 0 ? 'stop' : 'fade'): void {
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    const n = style === 'stop' ? 0 : Math.max(cycle, Math.round(beats));
    // The chord rings for one more pass after the texture has thinned.
    this.finishing = { beats: style === 'chord' ? n + cycle : n, style, startBeat: null };
    this.onFinished = onFinished;
    this.ended = false;
  }

  /**
   * The end time has come: everything fades out over `sec`, whatever else is going on, and
   * nothing brings the sound back until the board stops.
   */
  fadeOutNow(sec: number): void {
    const t = Tone.immediate();
    const end = this.endAuto();
    end.cancel(t);
    end.target(0, t, Math.max(0.02, sec / 4));
    this.backstop = true;
  }

  /**
   * Silence now, as Stop gives it, while the step, the board and the clock carry on (New
   * loop: "everything stops at once"). Stop throws the engine away; this keeps it, so it
   * cuts everything itself: every note still ringing or already queued (each voice starts
   * afresh, the kit stops, the reverb and echo empty), every loop leaves at once rather
   * than fading over a pass, and over MIDI every note is released with Expression held at
   * 0 until the notes queued ahead have gone. What sounds next is what the board and the
   * settings ask for, from the next note on.
   */
  silenceNow(): void {
    const t = Tone.immediate();
    for (const e of this.voiceByChannel.values()) {
      e.voice.cut();
      e.pending?.voice.cut();
    }
    this.bandVoices?.pad.cut();
    this.bandVoices?.bass.cut();
    if (this.drumKit) {
      const level = this.drumLevel?.gain;
      level?.cancelScheduledValues(t);
      level?.setTargetAtTime(0, t, CUT_FADE_TC);
      this.drumKit.stopAll(t + CUT_KIT_SEC);
      level?.setTargetAtTime(worldOf(this.cfg.soundWorld ?? 'none')?.drums.level ?? 1, t + CUT_KIT_SEC, CUT_FADE_TC);
    }
    this.freshTails();
    if (this.timer) {
      // Loops: gone now. One still wanted (none, in a new loop) comes in at the next pass.
      const on = this.launched.filter((l) => l.fade?.dir !== 'out');
      const next = this.pendingLaunch ?? {
        slots: on.map((l) => l.slot),
        loops: on.map((l) => l.cells),
        colours: [...new Map(on.flatMap((l) => l.colours ?? []).map((c) => [c.id, c])).values()],
      };
      this.launched = [];
      this.launchedSlots = [];
      this.loopFades.clear();
      this.pendingLaunch = next.slots.length > 0 ? next : null;
      this.rebuildChannelIndex();
    }
    if (this.midiOpts.enabled && this.midi) {
      this.cutUntil = t + CUT_MIDI_HOLD_SEC;
      this.exprUntil = 0;
      this.sendExpressionNow();
      this.midi.releaseAll(this.midiChannels);
    }
  }

  /**
   * These colours go silent now: every note of theirs still ringing or already queued falls
   * away (their voices are cut), and nothing else is touched. For the piece starting while
   * the board plays (Tim warming up): a colour that waits for its time must not ring on into
   * it. Its counters have already left the active cells; this only clears what was sent.
   */
  /**
   * Calm, Normal or Busy, for the whole piece (the iPad's Simple page, spec 2026-11-04). Calm:
   * the loops play only their notes on the main beats (the player's own counters are untouched)
   * and no Extra notes. Busy: Extra notes at least at BUSY_FILL, round everything that plays.
   * From the next beat; nothing to undo but this setting.
   */
  setFeel(feel: 'calm' | 'normal' | 'busy'): void {
    this.feel = feel;
    this.applyAmounts();
  }

  /**
   * Jobs silent everywhere (the iPad's Drums button, spec 2026-11-04: only drums is offered):
   * no loop plays a note of them, whichever loop it is (the loop bank's, a launched one, an
   * older one that plays as the player's colour), and nor does the band, which would otherwise
   * step in with its own. The player's own counters are left out before they reach here
   * (cellsSoundingAt). Silenced, the job's loop voices lose what they still had ringing.
   * Extra notes are not touched.
   */
  setSilentParts(roles: readonly ColourRole[]): void {
    const added = roles.filter((r) => !this.silentParts.has(r));
    this.silentParts = new Set(roles);
    if (added.length === 0) return;
    for (const ch of this.channelById.values()) {
      if (!added.includes(ch.role)) continue;
      const e = this.voiceByChannel.get(ch.id);
      e?.voice.cut?.();
      e?.pending?.voice.cut?.();
    }
  }

  silenceColours(ids: readonly ColourId[]): void {
    for (const id of ids) {
      const e = this.voiceByChannel.get(id);
      e?.voice.cut();
      e?.pending?.voice.cut();
    }
  }

  /**
   * The shared reverb and echo start empty: what was ringing in them falls away within a
   * few milliseconds and the old ones are freed after. A tail is sound too.
   */
  private freshTails(): void {
    const { mix, reverbBus, delayBus } = this;
    if (!mix) return;
    const t = Tone.immediate();
    if (this.reverb && reverbBus) {
      const old = this.reverb;
      const world = worldOf(this.cfg.soundWorld ?? 'none');
      const fresh = new Tone.Reverb({ decay: world?.reverbDecay ?? 2.5, preDelay: world?.reverbPreDelay ?? 0.01, wet: 1 });
      reverbBus.disconnect();
      Tone.connect(reverbBus, fresh);
      fresh.connect(mix);
      old.wet.cancelScheduledValues(t);
      old.wet.setTargetAtTime(0, t, CUT_FADE_TC);
      this.reverb = fresh;
      setTimeout(() => old.dispose(), CUT_FREE_MS);
    }
    if (this.delay && delayBus) {
      const old = this.delay;
      const fresh = new Tone.FeedbackDelay({ delayTime: DELAY_TIME_SEC, feedback: DELAY_FEEDBACK, wet: 1 });
      delayBus.disconnect();
      Tone.connect(delayBus, fresh);
      fresh.connect(mix);
      old.wet.cancelScheduledValues(t);
      old.wet.setTargetAtTime(0, t, CUT_FADE_TC);
      this.delay = fresh;
      setTimeout(() => old.dispose(), CUT_FREE_MS);
    }
  }

  /** Change of mind: the ending is cancelled and the sound comes back. */
  cancelFinish(): void {
    const f = this.finishing;
    this.finishing = null;
    this.onFinished = null;
    this.thinning = false;
    if (f?.style === 'slow' && f.startBpm !== undefined) this.applyBpm(f.startBpm);
    const t = Tone.immediate();
    const end = this.endAuto();
    end.cancel(t);
    end.target(1, t, MUTE_GLIDE_SEC);
  }

  /** The final chord: the key note's chord on the band's pad and bass, and a crash. */
  private playFinalChord(time: number, durSec: number): void {
    if (!this.bandVoices) this.buildBandVoices();
    const semis = this.cfg.scaleSemitones;
    const style = worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm';
    const chord = chordOnDegree(0, this.cfg.scaleRootMidi, semis, style);
    const oct = this.cfg.octaveShift * 12;
    const midis = voiceNear(chord, 62).map((n) => n + oct);
    const root = bassNote(chord, 36) + oct;
    this.bandVoices?.gain.gain.setTargetAtTime(1, time, 0.01);
    // The final chord is the band's own moment: no dip under it.
    this.bandVoices?.top?.gain.cancelScheduledValues(time);
    this.bandVoices?.top?.gain.setTargetAtTime(1, time, 0.01);
    if (this.internalSound) {
      for (const m of midis) this.bandVoices?.pad.play(m, 0.9, durSec, time);
      this.bandVoices?.bass.play(root, 0.9, durSec, time);
      this.drumKit?.play('crash', 0.9, time);
    }
    // Logged as the three things that sound, so MIDI sends each where the band's own go:
    // the chord with the band's chords, the root with its bass, the crash with the drums.
    const base = { row: -1, col: -1, colour: 'band:final', audioTime: time, durSec, source: 'live', origin: 'band', velocity: 0.9 } as const;
    this.recordFired({ ...base, role: 'chord', midis });
    this.recordFired({ ...base, role: 'bass', midi: root });
    if (this.drumKit) this.recordFired({ ...base, role: 'drums', drum: 'crash' });
  }

  isFinishing(): boolean {
    return this.finishing !== null;
  }

  /** How long a launched loop takes to come in and go out, in beats (0 = at once). */
  setLaunchFade(beats: number): void {
    this.launchFadeBeats = Math.max(0, Math.round(beats));
  }

  /** The slots the engine is playing now — a loop fading out is still among them. */
  getLaunchedSlots(): number[] {
    return this.launchedSlots;
  }

  /**
   * Bring the wanted loops in at a pass boundary. A loop that was playing and is no longer
   * wanted fades out over the fade length (or stops dead at 0); one that is new fades in.
   */
  private applyPendingLaunch(beat: number, atTime = Tone.now(), secPerBeat = 60 / this.cfg.bpm): void {
    const next = this.pendingLaunch;
    if (!next) return;
    // The launch's own way (a scene's, K3), else the player's fade for hand starts and stops.
    const fade = next.way ? Math.max(0, Math.round(next.way.fadeSteps)) : this.launchFadeBeats;
    const hold = next.way ? Math.max(0, Math.round(next.way.holdOutSteps)) : 0;
    const out: LaunchedLoop[] = [];
    const stopped: number[] = [];
    // A loop's fade over time, for its own channel's CC 11 (velocity fades the notes too).
    const fadeTrack = (dir: 'in' | 'out'): GainTrack => {
      const g = new GainTrack(dir === 'out' ? 1 : 0);
      g.setValueAtTime(dir === 'out' ? 1 : 0, atTime);
      g.linearRampToValueAtTime(dir === 'out' ? 0 : 1, atTime + fade * secPerBeat);
      return g;
    };
    // An overlap: held at full for the beats, then let go on the last of them.
    const holdTrack = (): GainTrack => {
      const g = new GainTrack(1);
      g.setValueAtTime(1, atTime + (hold - 1) * secPerBeat);
      g.linearRampToValueAtTime(0, atTime + hold * secPerBeat);
      return g;
    };
    for (const l of this.launched) {
      if (next.slots.includes(l.slot)) continue;
      if (l.fade?.dir === 'out') out.push(l); // already going: let it finish
      else if (hold > 0) {
        out.push({ slot: l.slot, cells: l.cells, colours: l.colours, fade: { dir: 'out', start: beat + hold - 1, beats: 1 } });
        this.loopFades.set(l.slot, holdTrack());
      } else if (fade > 0) {
        out.push({ slot: l.slot, cells: l.cells, colours: l.colours, fade: { dir: 'out', start: beat, beats: fade } });
        this.loopFades.set(l.slot, fadeTrack('out'));
      } else stopped.push(l.slot);
    }
    next.slots.forEach((slot, i) => {
      const was = this.launched.find((l) => l.slot === slot);
      // Re-wanted while fading out, or still playing: carry on at full strength.
      if (was) {
        out.push({ slot, cells: next.loops[i] ?? was.cells, colours: next.colours });
        this.loopFades.delete(slot);
      } else {
        out.push({ slot, cells: next.loops[i] ?? [], colours: next.colours, fade: fade > 0 ? { dir: 'in', start: beat, beats: fade } : undefined });
        if (fade > 0) this.loopFades.set(slot, fadeTrack('in'));
        else this.loopFades.delete(slot);
      }
    });
    this.launched = out;
    this.launchedSlots = out.map((l) => l.slot);
    this.pendingLaunch = null;
    this.rebuildChannelIndex();
    this.releaseLoopChannels(stopped);
  }

  /** Loops that have stopped: their own channels' notes end now, unless another loop still plays there. */
  private releaseLoopChannels(slots: readonly number[]): void {
    if (slots.length === 0 || !this.midiOpts.enabled || !this.midiOpts.loopChannels) return;
    const busy = new Set(this.launched.map((l) => loopChannel(l.slot)));
    const free = [...new Set(slots.map(loopChannel))].filter((ch) => !busy.has(ch));
    if (free.length > 0) this.midi?.releaseChannels(free);
  }

  /** The loudness of a launched loop on this beat: 1, or where its fade has got to. */
  private launchFactor(l: LaunchedLoop, beat: number): number {
    if (!l.fade) return 1;
    const k = beat - l.fade.start;
    // Held at full before its fade starts (an overlap, K3).
    if (l.fade.dir === 'out') return Math.min(1, Math.max(0, 1 - k / l.fade.beats));
    return Math.min(1, (k + 1) / l.fade.beats);
  }

  isLaunchPending(): boolean {
    return this.pendingLaunch !== null;
  }

  /**
   * Apply the values read from the control counters this frame. Already ranged and
   * debounced by `stepControls`, so this only routes them. A fader wins over its toggle,
   * so the two can never fight over the same parameter, and a control that isn't present
   * simply isn't in `values` — its parameter is left exactly as it was.
   */
  setControlValues(
    values: Partial<Record<FaderRole, number>>,
    toggles: Partial<Record<ColourRole, boolean>> = {},
  ): void {
    const glide = this.cfg.controlGlideSec ?? 0.3;
    const amt = this.cfg.toggleAmount ?? 0.35;
    if (values.volume !== undefined) this.setVolume(values.volume, glide);
    if (values.tempo !== undefined) this.setBpm(values.tempo);

    const toggleAmount = (on: boolean | undefined): number | undefined =>
      (on === undefined ? undefined : (on ? amt : 0));
    // A reverb or echo counter owns its bus while present. When it goes, its last amount
    // stays (a knocked counter changes nothing) until Space is moved.
    const reverb = values.reverb ?? toggleAmount(toggles.reverbToggle);
    const delay = values.delay ?? toggleAmount(toggles.delayToggle);
    this.reverbOwned = reverb !== undefined;
    this.delayOwned = delay !== undefined;
    const t = Tone.immediate();
    if (reverb !== undefined && reverb !== this.reverbAmount) {
      this.reverbAmount = reverb;
      this.reverbBus?.gain.setTargetAtTime(reverb, t, glide);
    }
    if (delay !== undefined && delay !== this.delayAmount) {
      this.delayAmount = delay;
      this.delayBus?.gain.setTargetAtTime(delay, t, glide);
    }

    // A fill or evolve counter owns its amount while present; when its channel is gone the
    // value is absent here and the saved setting is back in charge.
    this.fillOverride = values.fill ?? null;
    this.evolveOverride = values.evolve ?? null;
    // At once, from the saved setting underneath: the settings are applied only when they
    // change, so waiting for that left a fill or evolve counter doing nothing while playing.
    this.applyAmounts();
    // In Ableton: Tone, Reverb and Delay counters as CC 25, 26 and 27 on every sounding
    // channel, sent on change; while one is on the board it owns that macro.
    this.counterOwns = { tone: values.tone !== undefined, reverb: reverb !== undefined, delay: delay !== undefined };
    if (this.midiOpts.enabled) {
      const list = counterControls(this.midiChannels, { tone: values.tone, reverb, delay })
        .filter((c) => this.abletonSent.get(controlKey(c.channel, c.cc)) !== c.value);
      this.sendAbleton(list);
      if (!this.counterOwns.tone || !this.counterOwns.reverb) this.syncAbleton();
    }
    if (values.tone !== undefined && values.tone !== this.toneScale) {
      this.toneScale = values.tone;
      // Scale each channel's own Tone rather than overwriting it, so a bright lead and a
      // dark bass keep their relationship.
      this.voiceByChannel.forEach((e) => e.voice.setBrightness(e.toneBase * this.toneScale * (e.evo?.brightness ?? 1)));
    }
  }

  /**
   * Set the standalone BPM live, rebasing the clock so the beat position stays
   * continuous (no skipped/repeated beats). Ignored while locked to a song with
   * beats (the song owns tempo).
   */
  setBpm(bpm: number): void {
    // Once an ending is asked for its timing is fixed — it was timed at this speed, the fade
    // is scheduled in seconds and the ritardando owns the tempo — so a scene, its glide, the
    // hat or the iPad cannot pull it out of shape. Slowed while it waited for the pass, the
    // pass outgrew the time left before the end. Cancel the ending and they move it again.
    if (this.finishing) return;
    this.applyBpm(bpm);
  }

  private applyBpm(bpm: number): void {
    if (this.syncSource && this.syncSource.beats.length > 0) return;
    const clamped = Math.max(20, Math.min(400, bpm));
    if (Math.abs(clamped - this.cfg.bpm) < 0.05) return;
    const now = Tone.now();
    const elapsedBeats = (now - this.startSec) / (60 / this.cfg.bpm);
    this.startSec = now - elapsedBeats * (60 / clamped);
    this.cfg.bpm = clamped;
  }

  /** The tempo actually in effect: the song's (from beat spacing) when synced, else cfg.bpm. */
  getBpm(): number {
    const beats = this.syncSource?.beats;
    if (beats && beats.length > 1) {
      const i = Math.min(Math.max(this.lastBeatIndex, 0), beats.length - 2);
      const spacing = beats[i + 1] - beats[i];
      if (spacing > 0) return 60 / spacing;
    }
    return this.cfg.bpm;
  }

  /** Context time of the sound being heard now (visuals use this, not Tone.now()). */
  audibleNow(): number {
    return audibleTime(this.ctx, performance.now());
  }

  /** The beat being heard now (synced: the last fired song beat). */
  private visualBeat(): number {
    return this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((this.audibleNow() - this.startSec) / (60 / this.cfg.bpm));
  }

  /** The beat being heard now, for the pulse dot. The engine rebases its own clock on a
   *  tempo change and follows the song's beats when synced, so nothing outside can
   *  reconstruct this from a start time. */
  getVisualBeat(): number {
    return this.visualBeat();
  }

  /** The column the playhead is on right now (drives the visual playhead). */
  getPlayheadCol(cols: number): number {
    const beat = this.visualBeat();
    return sweepAt(beat, 0, cols, this.sweep()).col;
  }

  /** Whether the lap being heard is a variation (B) lap — drives the A/B cue. */
  isVariationLap(): boolean {
    const beat = this.visualBeat();
    return firesThisLap(true, beat, this.cfg.cols, this.cfg.pingPong ?? false);
  }

  /**
   * Pause/resume all sound. The clock, the detection and the whole step keep running and
   * only the output is silenced, so the lights, the "Now:" line and the playhead carry on
   * — players who rely on watching rather than hearing must not lose the pattern the
   * moment someone presses Mute.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    // Over MIDI: Expression to 0 at once, then every note released; back on, Expression
    // returns to wherever the ending has it.
    this.exprUntil = 0;
    this.sendExpressionNow();
    if (muted) this.midi?.releaseAll(this.midiChannels);
    // Always its own short ramp: Mute has to cut, not fade. A volume counter glides over
    // controlGlideSec (0.3 s by default), and borrowing that made Mute take about a
    // second, with every note still firing underneath it.
    this.applyMixGain(MUTE_GLIDE_SEC);
  }

  /** Live sound controls (safe to call while running). */
  setVolume(v: number, glideSec = 0.02): void {
    this.cfg.volume = v;
    this.sendVolume();
    // Remembered for when the sound comes back; while muted the bus stays where it is,
    // so a volume counter being moved can neither un-mute nor restart the fade.
    if (this.muted) return;
    this.applyMixGain(glideSec);
  }

  private applyMixGain(glideSec = 0.02): void {
    const level = this.muted || !this.internalSound ? 0 : this.cfg.volume;
    if (this.mix) this.mix.gain.setTargetAtTime(level, Tone.immediate(), glideSec);
  }

  /** Live per-channel mixer (no-op if that channel has no voice). */
  setChannelVolume(id: string, v: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) e.gain.gain.setTargetAtTime(v, Tone.immediate(), 0.02);
  }

  setChannelTone(id: string, t: number): void {
    const e = this.voiceByChannel.get(id);
    if (!e) return;
    e.toneBase = t;
    e.voice.setBrightness(t * this.toneScale * (e.evo?.brightness ?? 1));
  }

  setChannelReverbSend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.revBase = s;
      e.rev.gain.setTargetAtTime(s * (e.evo?.reverb ?? 1), Tone.immediate(), 0.03);
    }
  }

  setChannelDelaySend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.delBase = s;
      e.del.gain.setTargetAtTime(s + (e.evo?.delay ?? 0), Tone.immediate(), 0.03);
    }
  }

  /** How hard counters play when they have no loudness of their own (live). */
  setVelocity(v: number): void {
    this.cfg.velocity = Math.max(0, Math.min(1, v));
  }

  setOctaveShift(octaves: number): void {
    this.cfg.octaveShift = octaves;
  }

  setNoteLength(beats: number): void {
    this.cfg.noteLengthBeats = beats;
  }

  setScale(rootMidi: number, semitones: number[]): void {
    this.cfg.scaleRootMidi = rootMidi;
    this.cfg.scaleSemitones = semitones;
  }

  setSwing(swing: number): void {
    this.cfg.swing = swing;
    this.syncAbleton();
  }

  setHumanize(h: number): void {
    this.cfg.humanize = h;
  }

  /** Set a role's polyrhythm loop length live (0 = full grid width). */
  setLoopSteps(role: 'red' | 'black' | 'blue', steps: number): void {
    if (role === 'red') this.cfg.loopStepsRed = steps;
    else if (role === 'black') this.cfg.loopStepsBlack = steps;
    else this.cfg.loopStepsBlue = steps;
  }

  /** Set the number of chained pages live (master loop = numPages * cols). */
  setNumPages(n: number): void {
    this.cfg.numPages = Math.max(1, Math.floor(n));
  }

  /** Toggle the ping-pong playhead live (safe while running). */
  setPingPong(on: boolean): void {
    this.cfg.pingPong = on;
  }

  /** How ping-pong goes through several pages (safe while running). */
  setPingPongPages(mode: PingPongPages): void {
    this.cfg.pingPongPages = mode;
  }

  /** Ping-pong and pages, for sweepAt: the one rule sound, playhead and page follow. */
  private sweep(): Sweep {
    return { pingPong: this.cfg.pingPong ?? false, pages: this.cfg.numPages, mode: this.cfg.pingPongPages ?? 'each' };
  }

  /** Current sweep direction for the overlay arrow: +1 forward (→), -1 return (←). */
  getPlayheadDirection(): 1 | -1 {
    if (!this.cfg.pingPong) return 1;
    return sweepAt(this.visualBeat(), 0, this.cfg.cols, this.sweep()).dir;
  }

  /** Choose which page is bound to the live camera board (others play snapshots). */
  setSelectedPage(i: number): void {
    this.selectedPage = Math.max(0, Math.floor(i));
  }

  /** Replace all captured page snapshots (e.g. on start or after a capture). */
  setPages(pages: ActiveCell[][]): void {
    this.pages = pages.map((p) => [...p]);
  }

  /** Store a snapshot into a single page slot. */
  setPageSnapshot(i: number, cells: ActiveCell[]): void {
    if (i < 0) return;
    while (this.pages.length <= i) this.pages.push([]);
    this.pages[i] = [...cells];
  }

  /** The page the sequencer last fired (for UI highlight); 0 when single-page. */
  getCurrentPage(): number {
    return this.lastFiredPage;
  }

  /** Attach (or clear) a backing song to lock tempo/beat + chords to. */
  setSyncSource(src: BoardSyncSource | null): void {
    this.syncSource = src;
    this.lastBeatIndex = -1;
  }

  /** Turn the settle tick on/off live. */
  setTickEnabled(on: boolean): void {
    this.cfg.tickEnabled = on;
  }

  /** Turn Variation on/off live. Off means every counter plays every pass, loops too. */
  setVariationEnabled(on: boolean): void {
    this.cfg.variationEnabled = on;
  }

  /** Fire the confirmation tick immediately (distinct from a sequenced note). */
  fireTick(): void {
    if (this.muted || !this.internalSound || !this.tick || !this.cfg.tickEnabled) return;
    // The tick is a monophonic MembraneSynth; Tone requires strictly increasing
    // start times. Two cells settling in the same audio quantum repeat Tone.now(),
    // so guard against a non-increasing time (was throwing "Start time must be
    // strictly greater than previous start time").
    const t = strictlyAfter(Tone.immediate(), this.lastTickTime);
    this.lastTickTime = t;
    this.tick.triggerAttackRelease('C2', 0.05, t);
  }

  /**
   * `waitForBoard`: hold the first beat (and the playhead) until the screen hands over the
   * board's counters, up to BOARD_WAIT_MAX_SEC, so step 1 isn't played before they are known.
   */
  start(opts: { waitForBoard?: boolean } = {}): void {
    this.startSec = Tone.now();
    // Beats count from 0 again: the chord sequence starts with them.
    this.chordOrigin = 0;
    this.boardArrived = false;
    this.boardWaitUntil = opts.waitForBoard ? this.startSec + BOARD_WAIT_MAX_SEC : null;
    this.lastInternalBeat = -1;
    this.lastBeatIndex = -1;
    this.lastTickTime = 0;
    this.fired = [];
    this.resetHeard();
    // A new run: the meter starts again, and nothing is dropped.
    this.keeper.start(this.startSec, this.wallNow());
    this.valveTaken = [];
    this.valveFromMs = this.wallNow();
    this.applyAmounts();
    // Surprise me: this run's own ideas. Otherwise every run plays the same, the ideas
    // counted from the run's first beat.
    this.runSalt = this.surprise ? freshIdeas() : 0;
    this.ideasFromBeat = 0;
    this.fillKey = '';
    // Play: nothing is fading, and the receiving end hears full Expression again.
    this.backstop = false;
    this.endTrack.reset(1);
    this.exprLast.clear();
    this.exprUntil = 0;
    this.loopFades.clear();
    this.sendExpressionNow();
    this.syncAbleton(true);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.scheduleTick(), TICK_INTERVAL_MS);
  }

  private scheduleTick(): void {
    if (this.syncSource && this.syncSource.beats.length > 0) {
      this.scheduleSynced(this.syncSource);
    } else {
      this.scheduleInternal();
    }
    this.tickExpression();
  }

  /** Standalone clock: advance one step per beat at the configured BPM. */
  private scheduleInternal(): void {
    const secPerBeat = 60 / this.cfg.bpm;
    const now = Tone.now();
    if (this.boardWaitUntil !== null) {
      // Beat 0 starts when the board arrives: the clock slides along with the wait.
      this.startSec = now;
      if (!this.boardArrived && now < this.boardWaitUntil) return;
      this.boardWaitUntil = null;
    }
    const target = Math.floor((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    if (target === this.lastInternalBeat) return;
    // Catch up over EVERY beat that was missed, the way the song-locked path already does.
    // Jumping straight to the newest one deleted the beats in between: one heavy camera
    // frame dropped a column, and a backgrounded tab (setInterval clamped to 1 Hz) played
    // exactly half the pattern — while the playhead, which is time-derived, swept on and
    // lit the columns that never sounded.
    if (target < this.lastInternalBeat) {
      // The look-ahead is a fixed number of SECONDS, so it spans fewer beats after a
      // slow-down and the target can step back over beats that have already been sent.
      // Wait for it to catch up: lowering the mark here sent the same beat again, a flam
      // 33 ms after itself, every time the tempo counter, the cap or a "slow" ending
      // slowed down. (setBpm keeps the beat continuous, so it steps back by one at most.)
      return;
    }
    const owed = this.lastInternalBeat + 1;
    const first = Math.max(owed, target - MAX_CATCHUP_BEATS);
    // Keeping time: how late the oldest beat owed is (swing included: a pushed off-beat
    // is on time). A few sums per pass, nothing per note.
    const dueAt = this.startSec + owed * secPerBeat + (owed % 2 === 1 ? this.cfg.swing * secPerBeat * 0.5 : 0);
    let late = 0;
    for (let beatIdx = first; beatIdx <= target; beatIdx++) {
      let stepTime = this.startSec + beatIdx * secPerBeat;
      if (beatIdx % 2 === 1) stepTime += this.cfg.swing * secPerBeat * 0.5; // groove off-beats
      if (stepTime < now - LATE_TOLERANCE_SEC) late++;
      // A stall can leave a beat's time already behind us; Tone would clamp it anyway, but
      // saying so here keeps the fired-note log honest about when it really sounds.
      this.fireStep(beatIdx, Math.max(now, stepTime), secPerBeat, null);
    }
    this.lastInternalBeat = target;
    if (now - dueAt > LATE_TOLERANCE_SEC) this.noteLate(now - dueAt, late, first - owed);
  }

  /** A scheduler pass was late: the meter counts it, and the safety valve may step. */
  private noteLate(lagSec: number, late: number, skipped: number): void {
    const wall = this.wallNow();
    this.keeper.late(wall, lagSec, late, skipped);
    // A hidden tab has its timers slowed by the browser: dropping extras can't help that.
    if (typeof document !== 'undefined' && document.hidden) return;
    const step = nextValveStep({
      behind: this.keeper.behindSince(wall, this.valveFromMs),
      enabled: this.keeper.getLimits().valve,
      taken: this.valveTaken,
      inUse: this.extrasInUse(),
    });
    if (step === null) return;
    this.valveTaken = [...this.valveTaken, step];
    this.valveFromMs = wall;
    if (step === 'magenta') this.fillKey = ''; // the rules take over from the next beat
    this.applyAmounts();
  }

  /** What the valve could drop now (what the settings and counters ask for). */
  private extrasInUse(): Record<ValveStep, boolean> {
    const fill = this.simplify === 'off' && (this.fillOverride ?? this.fillSetting) > 0;
    const evolve = this.simplify === 'off' && (this.evolveOverride ?? this.evolveSetting) > 0;
    return {
      magenta: fill && (this.cfg.fillEngine ?? 'magenta') === 'magenta' && magentaStatus() !== 'failed',
      fill,
      evolve,
    };
  }

  /** Locked to a song: fire a step on each of the song's beats, chord-locked. */
  private scheduleSynced(src: BoardSyncSource): void {
    const beats = src.beats;
    const t = src.getTime();
    const now = Tone.immediate();
    // Re-align the beat pointer on start / seek / loop (when it no longer
    // straddles the current song time).
    const cur = this.lastBeatIndex;
    const aligned = cur >= 0 && cur < beats.length
      && beats[cur] <= t + 0.2
      && (cur + 1 >= beats.length || beats[cur + 1] >= t - 0.2);
    if (!aligned) this.lastBeatIndex = lastIndexLEQ(beats, t);

    const horizon = t + LOOKAHEAD_SEC;
    let i = this.lastBeatIndex + 1;
    let lag = 0;
    let late = 0;
    while (i < beats.length && beats[i] <= horizon) {
      const beatTime = beats[i];
      if (t - beatTime > LATE_TOLERANCE_SEC) { late++; lag = Math.max(lag, t - beatTime); }
      const spacing = i + 1 < beats.length
        ? Math.max(0.05, beats[i + 1] - beatTime)
        : (i > 0 ? Math.max(0.05, beatTime - beats[i - 1]) : 0.5);
      // `t` is the song's AUDIBLE position (ctx.currentTime), so the base has to be the
      // same clock. Tone.now() is currentTime + lookAhead, which put every board note a
      // whole look-ahead (100 ms) behind the song's beat — a constant, obvious flam.
      let audioTime = now + Math.max(0, beatTime - t);
      if (i % 2 === 1) audioTime += this.cfg.swing * spacing * 0.5; // groove off-beats
      this.fireStep(i, audioTime, spacing, src.chordAt(beatTime));
      this.lastBeatIndex = i;
      i++;
    }
    if (late > 0) this.noteLate(lag, late, 0);
  }

  /** The role a cell plays, from its colour channel. */
  private roleFor(colour: ColourId): ColourRole {
    return this.channelById.get(colour)?.role ?? 'off';
  }

  /** The polyrhythm-loop category for a role (melody/chord share the melody loop). */
  private loopCategory(role: ColourRole): 'melodic' | 'drum' | 'bass' {
    if (role === 'drums') return 'drum';
    if (role === 'bass') return 'bass';
    return 'melodic';
  }

  /**
   * Notes for a chord-stab cell: the song chord (when locked), else the one current chord —
   * its own where it names it, the player's over a loop's — voiced near where the row sits.
   */
  private chordStack(cell: ActiveCell, chord: BoardChord | null, axis: 'row' | 'col', plain = false): number[] {
    if (chord && chord.notes.length > 0) return chord.notes;
    const degree = axis === 'row' ? this.cfg.rows - 1 - cell.row : cell.col;
    const root = this.cfg.scaleRootMidi;
    const semis = this.cfg.scaleSemitones;
    const note = degreeMidi(degree, root, semis);
    const now = this.chordNow.harmony;
    // A loop's chord is plain (root, third, fifth): the colour tones, the ninths and sevenths
    // that reach up into the melody's octave, belong to the player's own chords (density, S2).
    const tones = plain ? now?.tones.slice(0, 3) : now?.tones;
    if (now && tones) return voiceNear({ pcs: [...new Set(tones.map((t) => ((t % 12) + 12) % 12))] }, note);
    // A real chord of the key on the row's note.
    const style = worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm';
    return voiceNear(chordOnDegree(degreeOfNote(note, root, semis), root, semis, style), note);
  }

  /** A role's configured polyrhythm loop-length setting (0 = full grid width). */
  private rawLoop(role: 'melodic' | 'drum' | 'bass'): number {
    return role === 'drum' ? this.cfg.loopStepsBlack
      : role === 'bass' ? this.cfg.loopStepsBlue
        : this.cfg.loopStepsRed;
  }

  /**
   * Play every active cell whose role-step matches `beat` at `stepTime`.
   * `beat` is the GLOBAL beat index; each role wraps it at its own loop length
   * (polyrhythm), so a cell fires when cell.col === (beat mod roleLength).
   * chord locks melodic pitch.
   */
  private fireStep(beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null): void {
    if (this.ended) return;
    // The ending, aligned to the pass like everything else.
    if (this.finishing) {
      const f = this.finishing;
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      const atBoundary = ((beat % cycle) + cycle) % cycle === 0;
      if (f.startBeat === null && atBoundary) {
        f.startBeat = beat;
        const end = this.endAuto();
        const t0 = cellTime;
        if (f.style === 'fade') {
          end.cancel(t0);
          end.set(1, t0);
          end.linear(0, t0 + f.beats * secPerBeat);
        } else if (f.style === 'slow') {
          f.startBpm = this.cfg.bpm;
        } else if (f.style === 'thin') {
          // The band and the fill leave now; the player's own notes carry on, and fade
          // over the last pass.
          this.thinning = true;
          end.cancel(t0);
          end.set(1, t0);
          end.set(1, t0 + Math.max(0, f.beats - cycle) * secPerBeat);
          end.linear(0, t0 + f.beats * secPerBeat);
        } else if (f.style === 'chord') {
          this.thinning = true;
          f.chordAt = beat + f.beats - cycle;
          end.cancel(t0);
          end.set(1, t0);
          end.linear(0.35, t0 + (f.beats - cycle) * secPerBeat);
        }
      }
      if (f.startBeat !== null) {
        if (beat >= f.startBeat + f.beats) {
          const done = this.onFinished;
          this.finishing = null;
          this.onFinished = null;
          this.thinning = false;
          this.ended = true;
          // This beat is scheduled ahead of the sound. Hand over only once the piece has
          // really finished sounding — the final chord rings half a pass past the end —
          // or stopping would cut the last notes off.
          const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
          const ringSec = f.style === 'chord' ? 0.5 * cycle * secPerBeat + 1.2 : 0.8;
          const waitMs = Math.max(0, (cellTime - Tone.now() + ringSec) * 1000);
          setTimeout(() => done?.(), waitMs);
          return;
        }
        if (f.style === 'slow' && f.startBpm !== undefined) {
          // A ritardando: down to a little over half speed by the end.
          const k = Math.min(1, (beat - f.startBeat) / Math.max(1, f.beats));
          this.applyBpm(f.startBpm * (1 - 0.45 * k));
        }
        if (f.style === 'chord' && f.chordAt !== undefined) {
          if (beat === f.chordAt && !this.backstop) {
            const end = this.endAuto();
            end.cancel(cellTime);
            end.set(0.35, cellTime);
            end.linear(1, cellTime + 0.03);
            this.playFinalChord(cellTime, cycle * secPerBeat * 1.5);
          }
          if (beat >= f.chordAt) return; // only the chord rings now
        }
      }
    }
    // Back to full lands on the pass boundary too: the scene comes back whole.
    if (this.simplify === 'leaving') {
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      if (((beat % cycle) + cycle) % cycle === 0) this.endSimplify();
    }
    // A scene's sound lands on the pass boundary too, with its loops.
    if (this.passPending) {
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      if (((beat % cycle) + cycle) % cycle === 0) {
        const p = this.passPending;
        this.passPending = null;
        this.applyPassSettings(p, beat);
      }
    }
    // A launch lands on the pass boundary — the first beat of the whole cycle.
    if (this.pendingLaunch) {
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      if (((beat % cycle) + cycle) % cycle === 0) this.applyPendingLaunch(beat, cellTime, secPerBeat);
    }
    // Fades that have run their course: a faded-out loop leaves, a faded-in one is simply playing.
    if (this.launched.some((l) => l.fade)) {
      const gone = this.launched.filter((l) => l.fade?.dir === 'out' && beat - l.fade.start >= l.fade.beats).map((l) => l.slot);
      this.launched = this.launched
        .filter((l) => !(l.fade?.dir === 'out' && beat - l.fade.start >= l.fade.beats))
        .map((l) => (l.fade?.dir === 'in' && beat - l.fade.start + 1 >= l.fade.beats ? { slot: l.slot, cells: l.cells, colours: l.colours } : l));
      this.launchedSlots = this.launched.map((l) => l.slot);
      // A loop that has faded out is gone, and its colours with it (and not before).
      if (gone.length > 0) this.rebuildChannelIndex();
      this.releaseLoopChannels(gone);
    }
    try {
      this.applyEvolve(beat);
    } catch (err) {
      console.warn('[BoardSequencer] Evolve could not change the sound:', err);
    }
    const durSec = this.cfg.noteLengthBeats * secPerBeat;
    const melodicLoop = loopLen(this.rawLoop('melodic'), this.cfg.cols);
    // Pattern chaining: pick this beat's page. The selected page plays live from
    // the camera (`active`); other pages play from their captured snapshot.
    const page = sweepAt(beat, 0, this.cfg.cols, this.sweep()).page;
    this.lastFiredPage = page;
    const cells = page === this.selectedPage ? this.active : (this.pages[page] ?? []);
    // Loop bank: active saved loops layer on top of the live/page cells. Pitch is
    // per-row-absolute, so a plain concat never disturbs voicing.
    const liveSource: FiredNote['source'] = page === this.selectedPage ? 'live' : 'page';
    // Saved loops and pages outlive the grid they were made on, so a player who shrinks
    // Rows or Steps can hold cells that no longer fit. Those must be silent, not wrong:
    // a row past the top gives a negative degree and sounds an octave BELOW the root —
    // a note nobody ever placed.
    const onGrid = (c: ActiveCell): boolean =>
      c.row >= 0 && c.row < this.cfg.rows && c.col >= 0 && c.col < this.cfg.cols;
    // Calm: a loop plays only its notes on the main beats. A job silent everywhere: none of
    // its notes from any loop. No cost while neither is on.
    const partIn = (c: ActiveCell): boolean => (this.feel !== 'calm' || isStrongBeat(c.col))
      && (this.silentParts.size === 0 || !this.silentParts.has(this.roleFor(c.colour)));
    // Each cell knows its layer — the player's board, or which loop — so a loop's phrase
    // plays under the player's instead of being cut into by it (see layerPhraseCells).
    const tagged: { cell: LayeredCell; source: FiredNote['source'] }[] = [
      ...cells.filter(onGrid).map((c) => ({ cell: c, source: liveSource })),
      ...this.activeLoops.flatMap((loopCells, i) => loopCells.filter((c) => onGrid(c) && partIn(c)).map((c) => ({ cell: { ...c, layer: `bank${i}` }, source: 'loop' as const }))),
      ...(this.simplify === 'off' ? this.launched : bedOf(this.launched)).flatMap((l) => {
        // A fade is in the loudness of each note, so it works for every part alike.
        const f = this.launchFactor(l, beat);
        return l.cells.filter((c) => onGrid(c) && partIn(c)).map((c) => ({
          cell: { ...c, layer: `slot${l.slot}`, ...(f < 1 ? { velocity: (c.velocity ?? this.cfg.velocity) * f } : {}) },
          source: 'loop' as const,
        }));
      }),
    ];
    const playCells = tagged.map((t) => t.cell);
    // The one current chord, worked out once for this beat: every pitched part plays to it.
    this.chordCounters = this.chordCountersOf(playCells);
    this.chordNow = this.chordAt(beat, chord);
    // The board and the loops play first, the player's own notes before the loops', so the
    // band hears what they played on this beat (it fits around them) and the loops and
    // extras know whether his notes sound (keep him on top).
    this.beginHearing(beat, cellTime);
    // Each colour plays a tune (a phrase) or one note per counter — its own choice.
    const tuneTagged = tagged.filter((t) => this.playsTune(t.cell.colour));
    // Density (S2): a fresh tally for the step, the loops' cap from Energy, and whether the
    // player's melody is on the board, so loops' melodies take the octave above.
    this.stepTally = newStepTally();
    // The cap makes room for the player: with the player's counters on the board the loops
    // keep to it; with the board empty the loops play whole, so a loop that is on is heard.
    const playerOn = tagged.some((t) => t.source !== 'loop');
    this.stepLoopCap = playerOn ? loopNoteCap(this.energy, worldOf(this.cfg.soundWorld ?? 'none')?.density ?? 0) : Number.POSITIVE_INFINITY;
    this.stepLaneUp = tagged.some((t) => t.source !== 'loop' && this.roleFor(t.cell.colour) === 'melody');
    const loopPhrases = tuneTagged.length > 0 ? this.firePhrases(beat, cellTime, secPerBeat, chord, tuneTagged) : null;
    let noteTagged = tuneTagged.length === 0 ? tagged : tagged.filter((t) => !this.playsTune(t.cell.colour));
    // Layered one-note melodies take turns too: the one leading this pass plays its note,
    // another melody's note on the same step rests, and answers softer where it's alone.
    {
      const isMelody = (c: LayeredCell): boolean => this.roleFor(c.colour) === 'melody';
      const layerOf = (c: LayeredCell): string => c.layer ?? LIVE_LAYER;
      const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
      const leader = melodyLeader(noteTagged.filter((t) => isMelody(t.cell)).map((t) => layerOf(t.cell)), lapIndex(beat, cycle));
      if (leader !== null) {
        const step = sweepAt(beat, this.rawLoop('melodic'), this.cfg.cols, this.sweep()).col;
        const leaderHere = noteTagged.some((t) => isMelody(t.cell) && layerOf(t.cell) === leader && t.cell.col === step);
        noteTagged = noteTagged
          .filter((t) => !(leaderHere && isMelody(t.cell) && layerOf(t.cell) !== leader && t.cell.col === step))
          // The answer is softer, and a loop's answer sits an octave above the leader (S2).
          .map((t) => (isMelody(t.cell) && layerOf(t.cell) !== leader
            ? { ...t, cell: { ...t.cell, velocity: (t.cell.velocity ?? this.cfg.velocity) * ANSWER_LEVEL, answerUp: t.source === 'loop' } }
            : t));
      }
    }
    if (noteTagged.length > 0) {
      const noteCells = noteTagged.map((t) => t.cell);
      // Voice ALL active melodic cells together so pitch is a complementary
      // spread that depends on the whole board (re-voices as pieces change /
      // follows the chord when locked); then play only this column's cells. A
      // "melodic" cell is one whose colour role is melody or chord.
      const melodic = noteCells.filter((c) => {
        const r = this.roleFor(c.colour);
        return (r === 'melody' || r === 'chord') && this.voiceByChannel.has(c.colour);
      });
      // Pitch is always by ABSOLUTE row position (bottom = low, top = high);
      // column = time. The instrument/role come from the cell's colour channel.
      const voicing = voicingForCells(
        melodic, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
        chord && chord.notes.length > 0 ? chord.notes : null, 'row', this.cfg.rows,
      );
      const oct = this.cfg.octaveShift * 12;
      const h = this.cfg.humanize;
      // The same drum piece hit twice at the same instant. Three kit pieces (hat, crash,
      // rim) have a single sample, so round robin reuses one Player, and Tone THROWS if a
      // Player is restarted at a time it is already playing. The exception escaped the loop
      // and every cell after it in this beat was silently dropped — which reads as "the
      // board randomly forgets notes". Two identical hits at one instant are one hit anyway.
      const drumHits = new Set<string>();
      // Where each colour plays, for letting a note ring up to the next one.
      const colsByColour = new Map<ColourId, number[]>();
      for (const c of noteCells) {
        const list = colsByColour.get(c.colour);
        if (list) list.push(c.col);
        else colsByColour.set(c.colour, [c.col]);
      }
      const fireAll = (list: typeof noteTagged): void => {
        for (const { cell, source } of list) {
          try {
            this.firingLayer = cell.layer;
            this.fireCell(cell, source, beat, cellTime, secPerBeat, chord, voicing, oct, h, melodicLoop, durSec, drumHits, colsByColour);
          } catch (err) {
            // One cell must never take the rest of the beat with it.
            console.warn('[BoardSequencer] a cell failed to play:', err);
          } finally {
            this.firingLayer = undefined;
          }
        }
      };
      fireAll(noteTagged.filter((t) => t.source !== 'loop'));
      loopPhrases?.();
      // The loops' notes under the cap (density, S2): the foundation first, chords then bass,
      // so when a step is full it is a third melody line that waits, never the harmony.
      const order: Record<string, number> = { chord: 0, bass: 1, drums: 2, melody: 3 };
      fireAll(noteTagged.filter((t) => t.source === 'loop').sort((a, b) => (order[this.roleFor(a.cell.colour) ?? ''] ?? 4) - (order[this.roleFor(b.cell.colour) ?? ''] ?? 4)));
    } else {
      loopPhrases?.();
    }
    this.dipBandForPlayer();
    // The band answers the PLAYER: it comes in after their first counter (and, as before,
    // hands them a part when they take it). Loops don't bring it in — with loops covering
    // every part the band fell silent for a whole section, and a loop alone brought it in
    // before the player had touched the board — but with jobs it fits around them too.
    this.fireBand(beat, cellTime, secPerBeat, chord, playCells, playCells.filter((c) => !c.layer));
    this.fireLeadIn(beat, cellTime, secPerBeat);
    this.fireFill(beat, cellTime, secPerBeat, chord, playCells);
  }

  /** The phrase engine's view of the cells, for both playing and fitting a fill around. */
  private phraseCells(cells: readonly LayeredCell[]): PhraseCell[] {
    const out: PhraseCell[] = [];
    for (const c of cells) {
      if (!this.playsTune(c.colour)) continue;
      const role = this.roleFor(c.colour);
      if (role !== 'melody' && role !== 'chord' && role !== 'drums' && role !== 'bass') continue;
      if (role !== 'drums' && !this.voiceByChannel.has(c.colour)) continue;
      out.push({ row: c.row, col: c.col, colour: c.colour, role, conditional: c.conditional, ...(c.layer ? { layer: c.layer } : {}) });
    }
    return layerPhraseCells(out);
  }

  private phraseInput(cells: PhraseCell[], beat: number, chord: BoardChord | null, pingPong: boolean): PhraseInput {
    return {
      cells,
      stepFor: (role: PhraseRole) => sweepAt(beat, this.rawLoop(this.loopCategory(role)), this.cfg.cols, { ...this.sweep(), pingPong }).col,
      loopFor: (role: PhraseRole) => loopLen(this.rawLoop(this.loopCategory(role)), this.cfg.cols),
      rows: this.cfg.rows,
      rootMidi: this.cfg.scaleRootMidi,
      semitones: this.cfg.scaleSemitones,
      songChord: chord && chord.notes.length > 0 ? chord.notes : null,
      style: worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm',
      lap: lapIndex(beat, Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages))),
      evolveOf: (colour: string, layer?: string) => {
        const drums = this.roleFor(colour) === 'drums';
        const evo = drums ? this.drumEvo : this.evoFor(colour);
        const lv = this.loopVariation(colour, layer, beat, drums);
        return { variant: evo.variant + lv.variant, busy: evo.busy + lv.busy + (drums ? this.energyBusy() : 0) };
      },
    };
  }

  /** The chord counters among these cells (one note or tunes, the player's and the loops'). */
  private chordCountersOf(cells: readonly LayeredCell[]): ChordCounter[] {
    const loop = loopLen(this.rawLoop('melodic'), this.cfg.cols);
    const out: ChordCounter[] = [];
    for (const c of cells) {
      if (c.col >= loop || this.roleFor(c.colour) !== 'chord') continue;
      if (!this.voiceByChannel.has(c.colour)) continue;
      out.push({ row: c.row, col: c.col, live: !c.layer });
    }
    return out;
  }

  /**
   * The one current chord on `beat` (see harmony/currentChord), from this beat's chord
   * counters: the song's when locked to one, a chord counter's for its own part of the loop,
   * else the scene's sequence. A few sums: cheap enough to look ahead with.
   */
  private chordAt(beat: number, chord: BoardChord | null): CurrentChord {
    const style = worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm';
    const loop = loopLen(this.rawLoop('melodic'), this.cfg.cols);
    const step = sweepAt(beat, this.rawLoop('melodic'), this.cfg.cols, { ...this.sweep(), pingPong: false }).col;
    const setting = this.cfg.chords ?? AS_BEFORE_CHORDS;
    const bandOn = this.band !== 'off';
    return currentChord({
      step, counters: this.chordCounters, rows: this.cfg.rows, rootMidi: this.cfg.scaleRootMidi,
      semitones: this.cfg.scaleSemitones, style, songChord: chord && chord.notes.length > 0 ? chord.notes : null,
      sequence: (back) => sequenceAt({
        setting, style, rootMidi: this.cfg.scaleRootMidi, semitones: this.cfg.scaleSemitones,
        beatsIn: beat - back - this.chordOrigin, step: step - back, loop, bandOn,
      }),
    });
  }

  /** The step's place in the pass is a strong beat (the first or third of a bar). */
  private strongBeat(beat: number): boolean {
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    return isStrongBeat(((beat % cycle) + cycle) % cycle);
  }

  /**
   * A one-note melody or bass note on this beat, fitted to the chord: on a strong beat a
   * note rubbing against the chord moves to the nearest chord note, when the nudge is on,
   * or always when Evolve moved it (then it isn't the player's note).
   */
  private fitted(midi: number, beat: number, drifted: boolean): number {
    const h = this.chordNow.harmony;
    if (!h || !(drifted || this.cfg.clashNudge === true) || !this.strongBeat(beat)) return midi;
    return fitToChord(midi, h.tones);
  }

  /**
   * The band on this beat. It waits for the player: silent until the pass after the
   * first counter goes down, and silent again once the pass the last counter left in has
   * finished. As before, a part whose role the player has taken over is left out; with
   * jobs, it keeps its parts and fits around what the board and the loops have just
   * played on this beat (they fire first): its drums leave their drum steps, its pads
   * keep away from their chords, its counter-melody plays in the gaps of their melody,
   * and its bass steps aside while a bass counter (his or a loop's) is down.
   */
  private fireBand(
    beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null, cells: readonly LayeredCell[],
    playerCells: readonly ActiveCell[] = cells,
  ): void {
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    const lap = lapIndex(beat, cycle);
    const roles = new Set<'melody' | 'chord' | 'bass' | 'drums'>();
    let counters = 0;
    for (const c of playerCells) {
      const r = this.roleFor(c.colour);
      if (r === 'melody' || r === 'chord' || r === 'bass' || r === 'drums') { roles.add(r); counters++; }
    }
    if (roles.size > 0) {
      this.bandLastCounterLap = lap;
      if (this.bandFromLap === null) this.bandFromLap = lap + 1; // in on the NEXT pass
    } else if (this.bandFromLap !== null && lap > this.bandLastCounterLap) {
      this.bandFromLap = null; // the pass the last counter left in has finished
    }
    const jobs = this.bandJobs;
    // One bass at a time: the player's or a loop's bass counter, while it is down.
    const bassTaken = !jobs.asBefore && cells.some((c) => this.roleFor(c.colour) === 'bass');
    const playing = this.band !== 'off' && !this.thinning && this.bandFromLap !== null && lap >= this.bandFromLap;
    this.bandPlaying = playing;
    this.bandPartsNow = playing ? bandParts(this.band, roles, counters, jobs, bassTaken) : [];
    if (!playing || !this.bandVoices) return;
    const loop = loopLen(this.rawLoop('melodic'), this.cfg.cols);
    const step = ((beat % loop) + loop) % loop;
    const keyOf = (h: Harmony | null): string => (h ? h.tones.join(',') : '');
    const harmony = this.chordNow.harmony;
    const key = keyOf(harmony);
    const chordChange = step === 0 || key !== this.bandPrevHarmonyKey;
    this.bandPrevHarmonyKey = key;
    let chordSpan = 1;
    while (step + chordSpan < loop && keyOf(this.chordAt(beat + chordSpan, chord).harmony) === key) chordSpan++;
    // The melody's notes still sounding while a counter-melody note would: never those.
    const counterEnd = cellTime + 0.9 * secPerBeat;
    const avoidPcs = jobs.counter && !jobs.asBefore
      ? [...new Set(this.melodyWindows.filter((w) => w.start < counterEnd && w.end > cellTime).flatMap((w) => w.pcs))]
      : [];
    const events = bandEventsAtStep({
      level: this.band, step, loop, style: worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm',
      harmony, chordChange, chordSpan, playerRoles: roles, playerCounters: counters, previousPad: this.bandPadVoicing,
      jobs, bassTaken, drumsHere: this.heardDrums, chordRegister: this.registerOf('chord'),
      melodyHere: this.heardMelody, melodyRegister: this.registerOf('melody'), avoidPcs,
      strong: this.strongBeat(beat), previousCounter: this.bandCounterLast,
      busy: energyShape(this.sceneEnergy)?.drumsBusy ?? 0,
      vary: this.bandVary(beat, step),
    });
    const padEvent = events.find((ev) => ev.part === 'pad' && ev.voicing);
    if (padEvent?.voicing) this.bandPadVoicing = padEvent.voicing;
    const counterEvent = events.find((ev) => ev.part === 'counter');
    if (counterEvent?.midi !== undefined) this.bandCounterLast = counterEvent.midi;
    // The counter-melody's voice has a level of its own: its notes carry the band's.
    const levelOfLead = BAND_GAIN[this.band] / BAND_GAIN.full;
    for (const ev of events) this.playBandEvent(ev, cellTime, secPerBeat, ev.part === 'counter' ? levelOfLead : 1);
  }

  /** One band note (or a lead-in's): played, dipped under the player, and logged. */
  private playBandEvent(ev: BandEvent, cellTime: number, secPerBeat: number, level = 1): void {
    if (!this.bandVoices) return;
    // A job silent everywhere is silent in the band too: hearing no drums from the player, the
    // band would otherwise step in and play its own.
    if (this.silentParts.size > 0) {
      const job: ColourRole = ev.drum ? 'drums' : ev.part === 'pad' ? 'chord' : ev.part === 'bass' ? 'bass' : 'melody';
      if (this.silentParts.has(job)) return;
    }
    try {
      const world = worldOf(this.cfg.soundWorld ?? 'none');
      const swing = Math.min(0.9, this.cfg.swing + (world?.phraseSwing ?? 0));
      const shifted = ev.offset === 0.5 ? ev.offset + swing / 6
        : (ev.offset === 0.25 || ev.offset === 0.75) ? ev.offset + swing / 12 : ev.offset;
      const time = Math.max(Tone.now(), cellTime + shifted * secPerBeat);
      const durSec = ev.dur * secPerBeat;
      // The band's level is in its gain node; for the kit (shared) and for MIDI it is in
      // the velocity, as is the dip under the player (the voices' is in their `top` node).
      // A lead-in plays at the Full band's level whatever the band's.
      const bandGain = ev.part === 'leadIn' ? BAND_GAIN.full : BAND_GAIN[this.band];
      // A scene's Energy moves the band's level: in the voices' gain node, and here for the
      // counter-melody's notes (its voice has its own level), the kit (in dB, as the kit
      // reads velocity) and MIDI. A lead-in plays at the Full band's level whatever it is.
      const energyDb = ev.part === 'leadIn' ? 0 : (energyShape(this.sceneEnergy)?.bandDb ?? 0);
      const energyGain = 10 ** (energyDb / 20);
      const base = Math.min(1, ev.accent * level * bandGain * 1.6);
      const vel = (ev.drum ? Math.max(0, Math.min(1, base + energyDb / 24)) : Math.min(1, base * energyGain)) * this.topFactor(time);
      let role: ColourRole;
      let midi: number | undefined;
      if (ev.drum) {
        if (!this.drumKit) return;
        // Never the same drum at the same moment twice: one Player can't restart there.
        const hit = `${ev.drum}@${time}`;
        if (this.heardDrumHits.has(hit)) return;
        this.heardDrumHits.add(hit);
        if (this.internalSound) this.drumKit.play(ev.drum, vel, time);
        if (ev.drum === 'kick' && this.band === 'full') this.duckForKick(time);
        role = 'drums';
      } else if (ev.midi !== undefined) {
        midi = ev.midi + this.cfg.octaveShift * 12;
        const voice = ev.part === 'pad' ? this.bandVoices.pad : ev.part === 'bass' ? this.bandVoices.bass : this.bandVoices.lead;
        // The pads' and the bass's level is in the band's gain node; the counter's is here.
        const own = ev.part === 'counter' ? energyGain : 1;
        if (this.internalSound) voice?.play(midi, ev.accent * level * own, durSec, time);
        role = ev.part === 'pad' ? 'chord' : ev.part === 'bass' ? 'bass' : 'melody';
      } else return;
      // Logged for the session, never drawn: a band note has no counter.
      this.recordFired({
        row: -1, col: -1, colour: `band:${ev.part}`, role, audioTime: time, durSec, source: 'live', origin: 'band',
        midi, drum: ev.drum, velocity: vel,
      });
    } catch (err) {
      console.warn('[BoardSequencer] a band note failed to play:', err);
    }
  }

  /**
   * A scene's lead-in, in the beats before the pass its scene lands on (see cueLeadIn).
   * Not while the piece is ending or simplified; gone once its scene has landed.
   */
  private fireLeadIn(beat: number, cellTime: number, secPerBeat: number): void {
    const li = this.leadIn;
    if (!li) return;
    if (beat > li.landBeat || this.finishing || this.thinning) {
      this.leadIn = null;
      return;
    }
    if (this.simplify !== 'off') return;
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    for (const ev of leadInEvents(li.kind, li.landBeat - beat, cycle, this.chordNow.harmony)) this.playBandEvent(ev, cellTime, secPerBeat);
  }

  /**
   * Everything the board plays over one time round the loop, for the fill to fit around.
   * Uses exactly the rules that play it — phrases or one note per counter.
   */
  private soundingOverLoop(cells: readonly ActiveCell[], chord: BoardChord | null, passStart = 0): SoundingNote[] {
    const out: SoundingNote[] = [];
    const cols = this.cfg.cols;
    const pc = this.phraseCells(cells);
    if (pc.length > 0) {
      for (let b = 0; b < cols; b++) {
        const input = { ...this.phraseInput(pc, passStart + b, chord, false), chord: this.chordAt(passStart + b, chord).harmony };
        for (const ev of phraseEventsAtStep(input)) {
          out.push({ step: b, offset: ev.offset, role: ev.role, colour: ev.colour, midi: ev.midi, drum: ev.drum });
        }
      }
    }
    for (const c of cells) {
      if (this.playsTune(c.colour)) continue;
      const ch = this.channelById.get(c.colour);
      if (!ch) continue;
      const degree = this.cfg.rows - 1 - c.row;
      const midi = degreeMidi(degree, this.cfg.scaleRootMidi, this.cfg.scaleSemitones);
      if (ch.role === 'melody') out.push({ step: c.col, offset: 0, role: 'melody', colour: c.colour, midi });
      else if (ch.role === 'bass') out.push({ step: c.col, offset: 0, role: 'bass', colour: c.colour, midi: midi - 12 });
      else if (ch.role === 'chord') out.push({ step: c.col, offset: 0, role: 'chord', colour: c.colour, midi });
      else if (ch.role === 'drums') {
        const drum = ch.drum && ch.drum.length > 0 ? ch.drum : drumForRow(c.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum) out.push({ step: c.col, offset: 0, role: 'drums', colour: c.colour, drum: drum as KitDrum });
      }
    }
    return out;
  }

  /**
   * Play the fill notes that fall in this beat. The fill is rebuilt only when the board,
   * the amount or the idea changes, never per beat, and a kept fill is never rebuilt.
   */
  private fireFill(
    beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null, cells: readonly ActiveCell[],
  ): void {
    if (this.fillAmount <= 0 || this.thinning) return;
    if (!this.fillKept) {
      const key = JSON.stringify([
        cells.map((c) => `${c.row},${c.col},${c.colour}`).sort(), this.fillAmount, this.fillSeedNow(), this.evolveScene,
        this.cfg.phrases, this.cfg.channels.map((ch) => `${ch.id}:${this.playsTune(ch.id) ? 't' : 'n'}`).join(), this.cfg.soundWorld, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
        this.cfg.rows, this.cfg.cols, chord?.notes ?? null,
      ]);
      const useAi = this.fillEngineNow() === 'magenta';
      const fullKey = `${key}|${useAi ? 'ai' : 'rules'}`;
      if (fullKey !== this.fillKey) {
        this.fillKey = fullKey;
        this.fillChangedAt = cellTime;
        // A scene's Magenta idea for this very board, kept from an earlier run: played again,
        // and not asked for afresh (so the rehearsal is the piece). Not under Surprise me.
        const owner = this.surprise ? null : this.ideas.owner;
        const kept = useAi && owner !== null ? this.keptIdeas.get(owner)?.find((k) => k.key === ideaKey(fullKey)) : undefined;
        if (kept) {
          this.fillNotes = kept.notes;
          this.aiAskedKey = fullKey;
          this.aiAnsweredKey = fullKey;
        }
        // The chords of this time round the loop; on later passes the sequence may have moved
        // on, and each note is fitted to the chord as it plays (below).
        const passStart = beat - (((beat % this.cfg.cols) + this.cfg.cols) % this.cfg.cols);
        const ctx: FillContext = {
          sounding: this.soundingOverLoop(cells, chord, passStart),
          loop: this.cfg.cols,
          rows: this.cfg.rows,
          rootMidi: this.cfg.scaleRootMidi,
          semitones: this.cfg.scaleSemitones,
          harmonyAt: (step) => this.chordAt(passStart + step, chord).harmony?.tones ?? null,
          // The chord's name, for Magenta's chord-conditioned model.
          chordSymbolAt: (step) => this.chordAt(passStart + step, chord).harmony?.symbol ?? null,
          amount: this.fillAmount,
          // Each Evolve scene brings a fresh idea, so the fill moves on with the sound.
          seed: this.fillSeedNow() + this.evolveScene * 7919,
        };
        this.fillCtx = kept ? null : ctx;
        this.fillTaken = { melody: new Set(), bass: new Set(), drums: new Set() };
        for (const n of ctx.sounding) {
          if (n.role !== 'chord') this.fillTaken[n.role].add(n.step * 4 + Math.round(n.offset * 4));
        }
        if (kept) {
          // Kept: nothing to work out.
        } else if (!useAi || magentaStatus() === 'failed') {
          this.fillNotes = generateFill(ctx);
        } else {
          void loadMagenta();
          // Until the models are ready the simple rules play; once they are, the last AI
          // idea plays on (minus anything now under the player's notes) until the next
          // one arrives.
          if (magentaStatus() !== 'ready' || this.aiAnsweredKey === '') this.fillNotes = generateFill(ctx);
        }
      }
      // Ask the AI once the board has been still for a moment.
      if (useAi && this.fillCtx && this.aiAskedKey !== this.fillKey
        && magentaStatus() !== 'failed' && cellTime - this.fillChangedAt >= AI_SETTLE_SEC) {
        const askedKey = this.fillKey;
        const ctx = this.fillCtx;
        // Whose idea it will be: kept for that scene, for the next run (not under Surprise me).
        const owner = this.surprise ? null : this.ideas.owner;
        this.aiAskedKey = askedKey;
        magentaFill(ctx, askedKey).then((notes) => {
          if (owner !== null && notes.length > 0) {
            const idea: KeptIdea = { key: ideaKey(askedKey), notes };
            this.keptIdeas.set(owner, keepIdea(this.keptIdeas.get(owner) ?? [], idea));
            this.onIdeaKept?.(owner, idea);
          }
          if (this.fillKey !== askedKey) return;
          this.fillNotes = notes;
          this.aiAnsweredKey = askedKey;
        }).catch(() => {
          if (this.fillKey === askedKey) this.fillNotes = generateFill(ctx);
        });
      }
    }
    const notes = this.fillKept ?? this.fillNotes;
    if (notes.length === 0) return;
    const step = ((beat % this.cfg.cols) + this.cfg.cols) % this.cfg.cols;
    // Counted from when the ideas began (a pass boundary), so a scene's pattern is its own.
    const lap = lapIndex(Math.max(0, beat - this.ideasFromBeat), this.cfg.cols);
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const swing = Math.min(0.9, this.cfg.swing + (world?.phraseSwing ?? 0));
    const oct = this.cfg.octaveShift * 12;
    const hits = new Set<string>();
    for (const n of notes) {
      if (n.step !== step) continue;
      if (n.everyNthLap && lap % n.everyNthLap !== n.everyNthLap - 1) continue;
      // Never under a note the player is making now — an older idea may predate it.
      if (!this.fillKept && this.fillTaken[n.role].has(n.step * 4 + Math.round(n.offset * 4))) continue;
      try {
        const shifted = n.offset === 0.5 ? n.offset + swing / 6
          : (n.offset === 0.25 || n.offset === 0.75) ? n.offset + swing / 12 : n.offset;
        const time = Math.max(Tone.now(), cellTime + shifted * secPerBeat);
        // The fill sits under the player's notes: FILL_LEVEL is applied once, here.
        // ... and dips while the player's own notes sound (keep him on top).
        const vel = Math.max(0, Math.min(1, this.cfg.velocity * n.accent)) * FILL_LEVEL * this.topFactor(time);
        let midi: number | undefined;
        let dur = n.dur * secPerBeat;
        if (n.drum) {
          if (!this.drumKit) continue;
          const hit = `${n.drum}@${time}`;
          if (hits.has(hit)) continue;
          hits.add(hit);
          if (this.internalSound) this.drumKit.play(n.drum, vel, time);
        } else if (n.midi !== undefined) {
          const voice = this.voiceByChannel.get(n.colour)?.voice;
          if (!voice) continue;
          const evo = this.evoFor(n.colour);
          // On a strong beat an extra note never rubs against the chord sounding now.
          const h = this.chordNow.harmony;
          const fit = h && n.offset === 0 && this.strongBeat(beat) ? fitToChord(n.midi, h.tones) : n.midi;
          midi = fit + oct + 12 * evo.octave;
          dur *= evo.length;
          if (this.internalSound) voice.play(midi, vel, dur, time);
        } else continue;
        this.recordFired({
          row: n.cell.row, col: n.cell.col, colour: n.colour, role: n.role,
          audioTime: time, durSec: dur, source: 'live', origin: 'fill', midi, drum: n.drum, velocity: vel,
        });
      } catch (err) {
        console.warn('[BoardSequencer] a fill note failed to play:', err);
      }
    }
  }

  /**
   * Phrase mode: every sequenced counter plays the idea it started (see phrases.ts), on
   * sub-steps inside this beat. Each note lights the counter that started it.
   */
  private firePhrases(
    beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null,
    tagged: { cell: LayeredCell; source: FiredNote['source'] }[],
  ): (() => void) | null {
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const cells = this.phraseCells(tagged.map((t) => t.cell));
    if (cells.length === 0) return null;
    const byKey = new Map<string, { cell: LayeredCell; source: FiredNote['source'] }>();
    for (const t of tagged) byKey.set(`${t.cell.layer ?? ''}|${t.cell.row},${t.cell.col},${t.cell.colour}`, t);
    const events = phraseEventsAtStep({ ...this.phraseInput(cells, beat, chord, this.cfg.pingPong ?? false), chord: this.chordNow.harmony });
    const oct = this.cfg.octaveShift * 12;
    const h = this.cfg.humanize;
    // Swing on the off-beats inside the beat: the player's own plus the world's feel.
    const swing = Math.min(0.9, this.cfg.swing + (world?.phraseSwing ?? 0));
    const drumHits = new Set<string>();
    const notesHere = new Set<string>();
    const tagOf = (ev: (typeof events)[number]) => byKey.get(`${ev.layer ?? ''}|${ev.owner.row},${ev.owner.col},${ev.colour}`);
    const playAll = (list: typeof events): void => { for (const ev of list) {
      try {
        const varies = ev.owner.conditional && this.cfg.variationEnabled !== false;
        if (!firesThisLapPaged(varies, beat, this.cfg.cols, this.cfg.numPages, this.cfg.pingPong ?? false)) continue;
        const tag = tagOf(ev);
        // A phrase has its own accents; its counter only adds its own slight loudness (S2).
        const base = (tag?.cell.velocity ?? this.cfg.velocity) * this.energyGain()
          * humanFactor(ev.owner.row, ev.owner.col, `${ev.layer ?? ''}|${ev.colour}`);
        const shifted = ev.offset === 0.5 ? ev.offset + swing / 6
          : (ev.offset === 0.25 || ev.offset === 0.75) ? ev.offset + swing / 12 : ev.offset;
        const time = Math.max(Tone.now(), cellTime + (shifted + (tag?.cell.timingBeats ?? 0)) * secPerBeat);
        // A loop's note dips while the player's own sound (keep him on top).
        const top = tag?.source === 'loop' ? this.topFactor(time) : 1;
        const loose = h > 0 ? this.looseChance(beat, ev.owner.row, ev.owner.col, `p|${ev.layer ?? ''}|${ev.colour}|${ev.offset}`) : 0;
        // A loop's tune breathes over four passes too, and lifts its last note on pass four (S2).
        const lapP = lapIndex(beat, Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages)));
        const breathP = tag?.source === 'loop' ? breathGain(breathPhase(lapP), this.loopVary) : 1;
        if (tag?.source === 'loop' && breathRest(breathPhase(lapP), ((beat % this.cfg.cols) + this.cfg.cols) % this.cfg.cols, this.cfg.cols, this.loopVary, ev.role)) continue;
        const vel = Math.max(0, Math.min(1, base * ev.accent * top * (h > 0 ? 1 - loose * h * 0.3 : 1) * breathP));
        let durSec = ev.dur * secPerBeat;
        let midi: number | undefined;
        if (ev.drum) {
          if (!this.drumKit) continue;
          const hit = `${ev.drum}@${time}`;
          if (drumHits.has(hit)) continue;
          drumHits.add(hit);
          if (this.internalSound) this.drumKit.play(ev.drum, vel, time);
          if (ev.drum === 'kick') this.duckForKick(time);
        } else if (ev.midi !== undefined) {
          const voice = this.voiceByChannel.get(ev.colour)?.voice;
          if (!voice) continue;
          const evo = this.evoFor(ev.colour);
          midi = ev.midi + oct + 12 * evo.octave;
          // Density (S2): the player's pitches are remembered; a loop's melody takes the lane
          // above them, and a loop's note that doubles the player's, or that the step has no
          // room for, is not played.
          const loopNote = tag?.source === 'loop';
          // A loop's chord is plain (root, third, fifth), as in chordStack: its colour tones are the player's.
          if (loopNote && ev.role === 'chord' && this.chordNow.harmony) {
            const plain = new Set(this.chordNow.harmony.tones.slice(0, 3).map((t) => ((t % 12) + 12) % 12));
            if (!plain.has(((midi % 12) + 12) % 12)) continue;
          }
          if (loopNote) midi += loopLaneShift(ev.role, this.stepLaneUp, midi);
          // A chord's notes arrive one by one here: the same owner at the same moment is one chord, counted once.
          if (!this.admit(loopNote ? 'loop' : 'live', [midi], ev.role === 'chord' ? `${ev.layer ?? ''}|${ev.owner.row},${ev.owner.col}@${time}` : undefined)) continue;
          // The same note on the same instrument at the same moment from two layers (a
          // loop just captured from counters still on the board) is one note, not a
          // doubled, louder one.
          const same = `${ev.colour}:${midi}@${time}`;
          if (notesHere.has(same)) continue;
          notesHere.add(same);
          durSec *= evo.length;
          if (this.internalSound) voice.play(midi, vel, durSec, time);
        } else continue;
        this.firingLayer = tag?.cell.layer ?? ev.layer;
        this.recordFired({
          row: ev.owner.row, col: ev.owner.col, colour: ev.colour, role: ev.role,
          audioTime: time, durSec, source: tag?.source ?? 'live', origin: 'phrase', midi, drum: ev.drum, velocity: vel,
        });
        this.firingLayer = undefined;
      } catch (err) {
        console.warn('[BoardSequencer] a phrase note failed to play:', err);
      }
    } };
    // The player's own now; the loops' once his one-note counters have played too.
    const own: typeof events = [];
    const loops: typeof events = [];
    for (const ev of events) (tagOf(ev)?.source === 'loop' ? loops : own).push(ev);
    // The loops' notes under the cap (density, S2): chords and bass before melodies.
    const order: Record<string, number> = { chord: 0, bass: 1, drums: 2, melody: 3 };
    loops.sort((a, b) => (order[a.role] ?? 4) - (order[b.role] ?? 4));
    playAll(own);
    return loops.length > 0 ? () => playAll(loops) : null;
  }

  /* eslint-disable-next-line max-params */
  private fireCell(
    cell: ActiveCell, source: FiredNote['source'], beat: number, cellTime: number,
    secPerBeat: number, chord: BoardChord | null, voicing: Map<string, number>,
    oct: number, h: number, melodicLoop: number, durSec: number, drumHits: Set<string>,
    colsByColour: Map<ColourId, number[]>,
  ): void {
    {
      const ch = this.channelById.get(cell.colour);
      if (!ch) return;
      const role = ch.role;
      // Control roles (faders/toggles) and 'off' are not sequenced.
      if (role !== 'melody' && role !== 'chord' && role !== 'drums' && role !== 'bass') return;
      // Per-role polyrhythm: a cell fires when its column matches the role's
      // own playhead (beat wrapped at that role's loop length).
      const cat = this.loopCategory(role);
      if (cell.col !== sweepAt(beat, this.rawLoop(cat), this.cfg.cols, this.sweep()).col) return;
      // Variation: an off-centre ("conditional") cell plays only on variation laps,
      // so the loop alternates a full pass and a full-plus-variations pass.
      // A saved loop keeps the Variation flags it was captured with. Once Variation is
      // switched off the live board plays every counter every pass, so a loop that went
      // on dropping notes on alternate laps had nothing on screen explaining why.
      const varies = (cell.conditional ?? false) && this.cfg.variationEnabled !== false;
      if (!firesThisLapPaged(varies, beat, this.cfg.cols, this.cfg.numPages, this.cfg.pingPong ?? false)) return;
      // Humanize: occasionally skip a step + vary velocity, so loops breathe.
      const looseName = `${(cell as LayeredCell).layer ?? ''}|${cell.colour}`;
      if (h > 0 && this.looseChance(beat, cell.row, cell.col, `rest|${looseName}`) < h * 0.5) return;
      // Box detail: where the counter sits gives it its own loudness and timing. The
      // shift can never reach into the past — a late note is fine, a missed one is not.
      // The first step of the pass is the strongest, off-beats softer, and each square has its
      // own slight loudness, so a counter's note is not a machine's (S2). Never moved in time,
      // and never different from pass to pass: a scene plays the same however it is reached.
      const base = shapedVelocity(
        Math.min(1, (cell.velocity ?? this.cfg.velocity) * this.energyGain()), cell.col, this.cfg.cols,
        cell.row, `${(cell as LayeredCell).layer ?? ''}|${cell.colour}`,
      );
      const stepTime = cell.timingBeats
        ? Math.max(Tone.now(), cellTime + cell.timingBeats * secPerBeat)
        : cellTime;
      // A loop's note dips while the player's own sound (keep him on top).
      const top = source === 'loop' ? this.topFactor(stepTime) : 1;
      // A loop breathes over four passes (S2): a little louder, the peak, softer, as kept.
      const lap = lapIndex(beat, Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages)));
      const breath = source === 'loop' ? breathGain(breathPhase(lap), this.loopVary) : 1;
      const vel = (h > 0 ? base * (1 - this.looseChance(beat, cell.row, cell.col, `vel|${looseName}`) * h * 0.4) : base) * top * breath;
      if (role === 'drums') {
        // The drum varies by row (kick→…→crash bottom→top), unless the channel
        // pins a specific kit piece.
        const drum = ch.drum && ch.drum.length > 0
          ? ch.drum
          : drumForRow(cell.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum && this.drumKit) {
          const hit = `${drum}@${stepTime}`;
          if (drumHits.has(hit)) return;
          drumHits.add(hit);
          if (this.internalSound) this.drumKit.play(drum as KitDrum, vel, stepTime);
          if (drum === 'kick' || drum === 'kickCrash') this.duckForKick(stepTime);
          this.recordFired({
            row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source,
            origin: 'placed', drum: drum as KitDrum, velocity: vel,
          });
        }
        return;
      }
      const voice = this.voiceByChannel.get(ch.id)?.voice;
      if (!voice) return;
      // Studio mix: a note rings on towards the channel's next note instead of stopping
      // dead after Note length, the single biggest cause of the board sounding plinky.
      // Note length stays the floor, so a player who chose long notes keeps them. Not with
      // ping-pong, where "the next note" depends on which way the playhead is going.
      const ringSec = (loop: number): number => {
        if (!this.studioOn() || this.cfg.pingPong) return durSec;
        const cols = colsByColour.get(cell.colour) ?? [];
        const beats = legatoBeats(cell.col, cols, loop, DEFAULT_BOARD_MIX.legatoMaxBeats);
        return Math.max(durSec, beats * secPerBeat);
      };
      if (role === 'bass') {
        // Bass pitch follows the row like melody (bottom = low), an octave down.
        const drift = this.noteDrift(cell, beat);
        const degree = Math.max(0, this.cfg.rows - 1 - cell.row + drift);
        const base = this.fitted(chord && chord.notes.length > 0
          ? chordDegreeMidi(degree, chord.notes)
          : degreeMidi(degree, this.cfg.scaleRootMidi, this.cfg.scaleSemitones), beat, drift !== 0);
        const dur = ringSec(loopLen(this.rawLoop('bass'), this.cfg.cols)) * this.evoFor(ch.id).length;
        if (!this.admit(source, [base - 12 + oct])) return;
        if (this.internalSound) voice.play(base - 12 + oct, vel, dur, stepTime);
        this.recordFired({
          row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: dur, source,
          origin: 'placed', midi: base - 12 + oct, velocity: vel,
        });
      } else if (role === 'chord' || ch.instrument === 'chord') {
        // Chord stab: play a stack (the song chord, or a scale triad) at once.
        const evo = this.evoFor(ch.id);
        const midis = this.chordStack(cell, chord, 'row', source === 'loop').map((n) => n + oct + 12 * evo.octave);
        if (!this.admit(source, midis)) return;
        // A chord counter holds its chord towards the colour's next counter, as the band's
        // pad holds its chord, instead of stabbing it for one note length: on a sustained
        // instrument a stab every bar was the "stabby" the owner heard (S2). Note length
        // stays the floor, so a chosen short length still plays short.
        const chordDur = ringSec(loopLen(this.rawLoop('melodic'), this.cfg.cols)) * evo.length;
        if (this.internalSound) for (const n of midis) voice.play(n, vel, chordDur, stepTime);
        this.recordFired({
          row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: chordDur, source,
          origin: 'placed', midis, velocity: vel,
        });
      } else {
        const placed = voicing.get(`${cell.row},${cell.col}`);
        const drift = placed === undefined ? 0 : this.noteDrift(cell, beat);
        const midi = placed === undefined ? undefined : this.fitted(this.scaleStep(placed, drift), beat, drift !== 0);
        if (midi !== undefined) {
          // A 'pad' instrument sustains a whole loop (re-triggered each pass) as a
          // held harmonic bed; others play the short note length.
          const evo = this.evoFor(ch.id);
          const dur = (ch.instrument === 'pad' ? secPerBeat * melodicLoop : ringSec(melodicLoop)) * evo.length;
          // Density (S2): a loop's melody takes the lane above the player's, and is not played
          // where it doubles the player's note or the step is full.
          // The breath: on pass four a loop's melody lifts a note (S2).
          if (source === 'loop' && breathRest(breathPhase(lap), cell.col, this.cfg.cols, this.loopVary, 'melody')) return;
          const base12 = midi + oct + 12 * evo.octave;
          const answer = (cell as LayeredCell).answerUp && base12 + 12 <= LANE_TOP ? 12 : 0;
          const laned = base12 + answer + (source === 'loop' && answer === 0 ? loopLaneShift('melody', this.stepLaneUp, base12) : 0);
          if (!this.admit(source, [laned])) return;
          if (this.internalSound) voice.play(laned, vel, dur, stepTime);
          this.recordFired({
            row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: dur, source,
            origin: 'placed', midi: laned, velocity: vel,
          });
          const orn = this.loopOrnament(cell, beat);
          if (orn !== null) {
            const passing = this.scaleStep(midi, orn) + oct + 12 * evo.octave;
            const at = stepTime + 0.5 * secPerBeat;
            if (this.internalSound) voice.play(passing, vel * 0.7, Math.min(dur, 0.45 * secPerBeat), at);
            this.recordFired({
              row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: at, durSec: 0.45 * secPerBeat, source,
              origin: 'placed', midi: passing, velocity: vel * 0.7,
            });
          }
        }
      }
    }
  }

  /** Keeping time so far this run: drift against the wall clock, late and skipped beats. */
  getKeepingTime(): KeepingTimeReport {
    return this.keeper.report(Tone.now(), this.wallNow());
  }

  /** The thresholds and the valve switch (Sound → Advanced). */
  setKeepingTimeLimits(limits: KeepingTimeLimits): void {
    this.keeper.setLimits(limits);
  }

  /** What the safety valve has dropped this run, in order. */
  getValveSteps(): readonly ValveStep[] {
    return this.valveTaken;
  }

  /** The owner switches the extras back on: the valve starts afresh from now. */
  resetValve(): void {
    if (this.valveTaken.includes('magenta')) this.fillKey = '';
    this.valveTaken = [];
    this.valveFromMs = this.wallNow();
    this.applyAmounts();
  }

  /**
   * Simplify: on at once (the band, Extra notes and Sounds change off; only the first loop
   * plays under the player). Off = Back to full, from the next pass while playing.
   */
  setSimplified(on: boolean): void {
    if (on) {
      this.simplify = 'on';
      this.applyBand();
      this.applyAmounts();
      return;
    }
    if (this.simplify === 'off') return;
    if (this.timer) this.simplify = 'leaving';
    else this.endSimplify();
  }

  getSimplify(): 'off' | 'on' | 'leaving' {
    return this.simplify;
  }

  /** While simplified, the loop still playing under the player (its slot), or null: for its name (B23). */
  getSimplifyBed(): number | null {
    if (this.simplify === 'off') return null;
    return bedOf(this.launched)[0]?.slot ?? null;
  }

  private endSimplify(): void {
    this.simplify = 'off';
    this.applyBand();
    this.applyAmounts();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // A scene's sound still waiting for its pass is the sound now: never left behind.
    if (this.passPending) {
      const p = this.passPending;
      this.passPending = null;
      this.applyPassSettings(p, 0);
    }
    this.chordOrigin = 0;
    this.fired = [];
    this.resetHeard();
    // Stop ends Simplify, and whatever the safety valve dropped. Nothing is built here
    // (dispose() comes through stop()): the band's own voices only glide back up.
    this.valveTaken = [];
    this.simplify = 'off';
    this.band = this.bandSetting;
    this.bandVoices?.gain.gain.setTargetAtTime(this.bandLevel(), Tone.immediate(), MIX_SWITCH_TC);
    this.applyAmounts();
    this.loopFades.clear();
    // Over MIDI, notes are already queued at the port up to ~200 ms (and a phrase's
    // offsets) ahead, and a queued message can't be taken back. Expression to 0 first, so
    // they come out silent; Play sends it back up.
    if (this.midiOpts.enabled && this.midi) this.midi.expression(0, this.midiChannels);
    this.midi?.releaseAll(this.midiChannels);
  }

  dispose(): void {
    this.stop();
    this.voiceByChannel.forEach((e) => {
      if (e.pending) { clearInterval(e.pending.timer); e.pending.voice.dispose(); e.pending = null; }
      e.voice.dispose();
      e.gain.disconnect();
      e.rev.disconnect();
      e.del.disconnect();
      e.pan?.disconnect();
    });
    this.voiceByChannel.clear();
    this.channelById.clear();
    this.limiter?.dispose();
    this.limiter = null;
    this.classicOut?.disconnect();
    this.classicOut = null;
    this.studioOut?.disconnect();
    this.studioOut = null;
    this.masterChain?.dispose();
    this.masterChain = null;
    this.duckBus?.disconnect();
    this.duckBus = null;
    this.endGain?.disconnect();
    this.endGain = null;
    this.mixTone?.disconnect();
    this.mixTone = null;
    this.drumTone?.disconnect();
    this.drumTone = null;
    this.drumLevel?.disconnect();
    this.drumLevel = null;
    this.reverb?.dispose();
    this.reverb = null;
    this.reverbBus?.disconnect();
    this.reverbBus = null;
    this.delay?.dispose();
    this.delay = null;
    this.delayBus?.disconnect();
    this.delayBus = null;
    this.mix?.disconnect();
    this.mix = null;
    this.drumKit?.dispose();
    this.drumKit = null;
    this.tick?.dispose();
    this.tick = null;
    if (this.bandVoices) {
      BoardSequencerEngine.releaseBand(this.bandVoices);
      this.bandVoices = null;
    }
    this.drumRev?.disconnect();
    this.drumRev = null;
  }
}
