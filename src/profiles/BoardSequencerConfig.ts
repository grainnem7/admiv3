/**
 * Board-sequencer configuration persistence.
 *
 * Mirrors the SurfacePressConfig / BatonAssignments pattern: a dedicated
 * localStorage key, sanitised on load (a corrupt store yields null and the
 * screen falls back to "not yet calibrated"), exposed via InputProfileManager.
 * No change to UserProfile.
 */

import type { PingPongPages } from '../songs/boardSequencerScale';
import { sanitizeFillNotes, type FillNote } from '../songs/generative/rulesFill';
import type { BandLevel } from '../songs/band/band';
import { DEFAULT_CHORDS, sanitizeChords, type ChordSetting } from '../songs/harmony/currentChord';
import { DEFAULT_JOBS, sanitizeBandJobs, type BandJobs } from '../songs/band/bandJobs';
import { KEEP_ON_TOP_DEFAULT_DB, sanitizeKeepOnTopDb } from '../songs/band/keepOnTop';
import { clampLeadMs, type MidiChannelMode, type MidiSends } from '../midi/boardMidi';
import {
  fullReachMap, REMOTE_CONTROLS, sanitizeReachMap, type Reach, type RemoteControlName, type RemoteTriggerName,
  DEFAULT_REMOTE_TOUCH, sanitizeRemoteTouch, type RemoteTouch, sanitizeSimpleRows, SIMPLE_ROWS, type SimpleRow,
} from '../remote/protocol';
import { sanitizeLoopNames, sanitizeScenes, type Scene } from '../songs/performance/launcher';
import { sanitizeColourEntries } from '../songs/performance/colourEntries';
import { sanitizePieces, type SavedPiece } from '../songs/performance/pieces';
import { sanitizeSceneEnergy, type SceneEnergy } from '../songs/performance/energy';
import { sanitizeIdeas } from '../songs/performance/ideas';
import { DEFAULT_PERFORMANCE, sanitizePerformance, type PerformanceSettings } from '../songs/performance/clock';
import { DEFAULT_KEEPING_TIME_LIMITS, KEEPING_TIME_RANGE } from '../songs/keepingTime';
import { DEFAULT_PRESS_AGAIN_SEC, sanitizePressAgainSec } from './pressAgain';
import { isSoundWorldChoice, type SoundWorldChoice } from '../audio/worlds/soundWorlds';
import { quarterTurns, type QuarterTurns } from '../tracking/frameOrientation';
import type { TrackedColor } from '../tracking/ColorTracker';
import type {
  ColourChannel, ColourId, ColourKind, ColourRole, BlackBand, WhiteBand,
} from '../tracking/boardColours';
import { ROLE_LABELS, DEFAULT_BLACK_BAND, DEFAULT_WHITE_BAND } from '../tracking/boardColours';
import { isStoredBoardReference, type StoredBoardReference } from '../tracking/boardReference/boardReference';
import { DEFAULT_CAP_SETTINGS, sanitizeCapSettings, type CapSettings } from '../tracking/cap/capTracker';
import { suggestReadSettings, type BoardSquares } from '../tracking/boardGrid';
import { ANYWHERE, clampZone, NO_ZONE, zoneSlotCount, zonesCollide, type Zone } from '../tracking/zones';

const STORAGE_KEY = 'admi-board-sequencer';

// Bump when a stored-shape change should reset colour channels. v2 dropped the
// fixed palette + its migration: any pre-v2 colour data is wiped (start empty).
const CONFIG_VERSION = 2;

export interface BoardPoint {
  x: number;
  y: number;
}

/**
 * A single settled cell as persisted in a captured page snapshot.
 *
 * Box detail rides along: where the counter sat in its square is what gives that note its
 * loudness and its push or drag, so a saved pattern that dropped it played back flat and
 * dead on the beat next to a live board that didn't.
 */
export interface StoredBoardCell {
  row: number;
  col: number;
  colour: ColourId;
  velocity?: number;
  timingBeats?: number;
}

/**
 * A single cell of a saved loop (StoredBoardCell + the slice-1 variation flag), and since
 * 2026-10-27 what the counter played: its job and sound, so the loop replays as it was made
 * whatever the board's colours are today. Older loops have neither and play as their colour.
 */
export interface StoredLoopCell extends StoredBoardCell {
  conditional?: boolean;
  job?: 'melody' | 'bass' | 'chord' | 'drums';
  /** The colour's instrument (melodic jobs) or kit piece (drums); '' = the default. */
  sound?: string;
}

const LOOP_JOBS = new Set(['melody', 'bass', 'chord', 'drums']);

export interface BoardSequencerStored {
  /** Stored-shape version (see CONFIG_VERSION); pre-v2 colour data is reset. */
  version: number;
  enabled: boolean;
  /** Four board corners (normalised image coords) in TL, TR, BR, BL order. */
  corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint];
  rows: number;
  cols: number;
  scaleRootMidi: number;
  scaleSemitones: number[];
  /** Display name of the selected scale (drives scaleSemitones in the UI). */
  scaleName: string;
  bpm: number;
  /** Swing amount 0..1 — pushes off-beats late for groove. */
  swing: number;
  /** Humanize 0..1 — chance a step is skipped + velocity variation, so loops breathe. */
  humanize: number;
  settleWindowMs: number;
  velocityFloor: number;
  velocitySmoothing: number;
  occupancyGraceMs: number;
  motionConfirmMs: number;
  /** User-calibrated colour channels (click a piece to add one); each has a role. */
  channels: ColourChannel[];
  /** Axis a control-colour piece's position maps to its value ('row' = vertical). */
  faderAxis: 'row' | 'col';
  minFilledFraction: number;
  /** Variation: off-centre pieces play every other pass when enabled. */
  variationEnabled: boolean;
  /** Normalised offset (0=centre, 1=edge) at/above which a piece is conditional. */
  variationOffsetThreshold: number;
  /** Ping-pong playhead: sweep → then ← (repeat-edge) instead of always left→right. */
  pingPong: boolean;
  /** With ping-pong and several pages: each page there and back, or the chain as one strip. */
  pingPongPages: PingPongPages;
  /** Loop bank: the bottom row becomes save/recall slots for layered loops. */
  loopBankEnabled: boolean;
  /** Saved loops per slot (bottom-row column); null = empty slot. */
  loopSlots: (StoredLoopCell[] | null)[];
  noteLengthBeats: number;
  velocity: number;
  /** Overall feel, 0..1 (0.5 = as set): how hard notes play and how busy the drums are. */
  energy: number;
  /** Overall room, 0..1 (0.5 = the world's own): reverb and echo when no counter sets them. */
  space: number;
  /** How much saved loops vary by themselves from pass to pass, 0..1 (0 = exactly as saved). */
  loopVary: number;
  tickEnabled: boolean;
  /**
   * The studio mix (shared master chain, stereo placement, kick ducking, notes that ring
   * on). Off is the board's original mix, kept so the two can be compared by ear.
   */
  studioMix: boolean;
  /**
   * The sound world: one choice that sets every part's sound, the drums and the space.
   * 'none' = the player's own instrument picks, as before. Players set up before worlds
   * existed stay on 'none', so nothing changes under anyone mid-study.
   */
  soundWorld: SoundWorldChoice;
  /** Each counter plays a phrase (groove, bassline, motif, chord change), not one note. */
  phrases: boolean;
  /** How much the instrument adds around the player's notes (0 = nothing, the default). */
  fillAmount: number;
  /** Which idea the fill is: "New idea" picks another. */
  fillSeed: number;
  /** A fill the player kept: these notes play whatever the board does, until let go. */
  fillKept: FillNote[] | null;
  /** Where fill ideas come from: Magenta's pre-trained models, or the simple rules. */
  fillEngine: 'magenta' | 'rules';
  /** Evolve: how far each colour's sound wanders as it plays (0 = never changes). */
  evolveAmount: number;
  /** Evolve: a bigger change (a new scene) every this many loops. */
  evolveSceneLoops: number;
  /** Evolve: which path the sounds take; "New sound" picks another. */
  evolveSeed: number;
  /** Evolve: the loop whose sound is held; null = keep evolving. */
  evolveHoldLap: number | null;
  /**
   * The band: a pad, bass and groove that join on the pass after the first counter goes
   * down and make room for any part the player takes over. Off for players set up
   * before it existed; Gentle for new ones.
   */
  band: BandLevel;
  /**
   * The chord sequence every pitched part plays to, and how long each chord lasts (see
   * harmony/currentChord). "As before" for players set up before it existed.
   */
  chords: ChordSetting;
  /**
   * One-note melody and bass: on a strong beat a note rubbing against the chord moves to
   * the nearest chord note. Off for players set up before it existed.
   */
  clashNudge: boolean;
  /**
   * The band's jobs: Pads, Bass, Drums and Counter-melody, kept whatever the player plays
   * (see band/bandJobs). "As before" for players set up before jobs existed.
   */
  bandJobs: BandJobs;
  /** Keep the player on top: the band, loops and extra notes dip while his notes sound. */
  keepOnTop: boolean;
  /** How far they dip, in dB. */
  keepOnTopDb: number;
  /**
   * Energy, 1 to 5 (0 = off): a scene's, while it plays (see performance/energy). The
   * player's own is off: Energy belongs to the scenes of a piece.
   */
  sceneEnergy: SceneEnergy;
  /**
   * The piece's ideas (see performance/ideas): with each scene's own, it seeds the band,
   * the extra notes and Sounds change, so every rehearsal plays the same. 0 = the player's
   * own seeds, as before. "New ideas for the whole piece" picks another.
   */
  pieceIdeas: number;
  /** Surprise me each time: fresh ideas every run, and Magenta's ideas not kept, as before. */
  surpriseMe: boolean;
  /**
   * A colour added for melody, bass or chords starts playing a tune (a phrase) rather than
   * one note per counter. On for new players; off for players set up before it existed.
   */
  tunesForNewColours: boolean;
  /** How far along each iPad strip this player can comfortably reach (see remote/protocol). */
  remoteReach: Record<RemoteControlName, Reach>;
  /** Names for the launchable loop slots ('' = "Loop n"). */
  loopNames: string[];
  /** Scenes: prepared sets of loops and settings, recalled with one tap (see performance/launcher). */
  scenes: Scene[];
  /** The scene recalled last, for "Next scene"; null = none yet. Never kept past a run. */
  currentScene: number | null;
  /**
   * When each sound colour comes in during the piece, in seconds from its start, by colour id
   * (see performance/colourEntries): its counters are silent until then while the piece's
   * clock runs. No time = from the start. A colour that goes takes its time with it.
   */
  colourComesInAt: Record<ColourId, number>;
  /** How many passes a launched loop takes to come in and go out (0 = at once). */
  loopFadePasses: number;
  /** Scenes leave alone an iPad strip the player has moved since the last scene. */
  sceneRespectsPlayer: boolean;
  /** The performance clock: length, ending, when it starts (see performance/clock). */
  performance: PerformanceSettings;
  /**
   * The player's pieces (producer flow, item 3): each its scenes, its length and ending, and
   * when each colour comes in. `scenes`, `performance` and `colourComesInAt` above are the
   * piece open now, `pieceId`, mirrored into the list on every change (see performance/pieces).
   */
  pieces: SavedPiece[];
  pieceId: string;
  /** The laptop board starts when the first counter goes down (item 1): on for a player who began with Play on the laptop. */
  autoStart: boolean;
  /**
   * Where the counters come from: the camera watching the real board, or a board on the
   * laptop screen (click to place), for testing and planning without setting up the rig.
   */
  boardSource: 'camera' | 'laptop';
  /** The counters on the laptop board, kept so a plan is still there next time. */
  laptopBoard: StoredLoopCell[];
  /**
   * Which iPad page this player has (spec 2026-11-04): the Simple page (New idea, the parts,
   * what the melody plays, the loops) or the full layout the fields below set out. New
   * players get 'simple'; a player saved before it loads as 'custom', exactly as they were.
   */
  remoteLayoutKind: RemoteLayoutKind;
  /** Which rows the Simple page shows (New idea, Board, Parts, Melody plays, Loops); all for a new player. */
  remoteSimpleRows: SimpleRow[];
  /** What the iPad shows: fewer things means bigger things. */
  remoteStrips: RemoteControlName[];
  remotePads: RemoteTriggerName[];
  remoteLoopsPage: boolean;
  /** Strips that ignore touch for now (a speed that must not change mid-piece). */
  remoteLocked: RemoteControlName[];
  /** Jump: the value goes to the finger. Follow: the value moves with the finger from where it was. */
  remoteStripMode: 'jump' | 'follow';
  /** How the iPad responds to this player's touch: act on touch or lift, the two-tap window, the Play page's extra pads. */
  remoteTouch: RemoteTouch;
  /** Global transpose in octaves (applied to all melodic + bass notes). */
  octaveShift: number;
  /** Board output volume (0..1). */
  volume: number;
  /**
   * Polyrhythm: loop length (in steps/columns) per role. 0 = use the full grid
   * width (no polyrhythm). When > 0, that role wraps at its own length, so the
   * roles drift against each other. red = melody, black = drums, blue = bass.
   */
  loopStepsRed: number;
  loopStepsBlack: number;
  loopStepsBlue: number;
  /**
   * Pattern chaining: number of pages the sequence is built from (master loop =
   * numPages * cols steps). The selected page plays live from the camera; the
   * others play from their captured snapshots in `pages`.
   */
  numPages: number;
  /** Captured page snapshots (indexed by page); each is a list of settled cells. */
  pages: StoredBoardCell[][];
  /** Display + sampling orientation. Calibration is captured in this same space. */
  mirrorX: boolean;
  mirrorY: boolean;
  /**
   * Clockwise quarter turns of the camera picture, applied before mirroring — for a camera
   * mounted on its side. Display and sampling both use it, like the mirrors.
   */
  cameraRotation: QuarterTurns;
  /** Chosen camera's deviceId ('' = browser default). Switching invalidates corners. */
  cameraDeviceId: string;
  /** Chosen camera's name, to say which camera is missing when it can't be found. */
  cameraLabel: string;
  /** MIDI out (a setting of this laptop, like the camera): on/off, the output's id, and what is sent. */
  midiEnabled: boolean;
  midiDeviceId: string;
  midiSends: MidiSends;
  /** Keep the built-in sound on while sending MIDI (off = the external instrument is the sound). */
  midiKeepSound: boolean;
  /** One MIDI channel per part, or one fixed channel per colour (each colour's midiChannel). */
  midiChannelMode: MidiChannelMode;
  /** "Send early by", 0 to 40 ms: in Both mode, so ADMI and Ableton land together. */
  midiLeadMs: number;
  /** Each loop's melody, bass and chords on its own channel (4 to 9), for a fader per loop in Ableton. */
  midiLoopChannels: boolean;
  /** Physical squares per side of the board (8 × 8 chess/draughts, 10 × 10 draughts). */
  boardSquares: BoardSquares;
  /** Calm theme mode for the redesigned screens. */
  themeMode: 'dark' | 'light';
  /** Samples per axis per cell (suggested from the grid; passed to BoardReader). */
  samplesPerAxis: number;
  /** True once the user tuned Piece coverage — freezes suggested read settings. */
  readSettingsCustom: boolean;
  /**
   * Which generation of suggested read settings these are. Saved settings are otherwise
   * never re-suggested on load, so without this an improvement to the suggestion could
   * never reach a player who had already saved — untuned settings are moved on once.
   */
  readSettingsRev: number;
  /** Show the "Board moved?" / colour-matches-board hints while playing. */
  boardNudgesEnabled: boolean;
  /** The player's handedness (per player; mirrors the screen layout). */
  handedness: 'left' | 'right';
  /** Which board edge the player sits at (per player; defines "their left"). */
  seatEdge: 'start' | 'end' | 'low' | 'high';
  /** Stillness a control counter needs before its new value is taken (ms). */
  controlStillMs: number;
  /** Glide time for a control change, so a slide never clicks or drops out (s). */
  controlGlideSec: number;
  /** How long 'default' removal waits before returning a control to its default (ms). */
  controlReturnMs: number;
  /**
   * Keeping time (Sound → Advanced): seconds of sound lost to late beats in 20 s before the
   * sound counts as falling behind; how far the sound's clock may drift before it is
   * reported (s); and whether the safety valve drops extras when it falls behind.
   */
  keepTimeBehindSec: number;
  keepTimeDriftSec: number;
  keepTimeValve: boolean;
  /**
   * Time to press again (3, 4, 6 or 10 s): how long the first press of Stop, Exit or Set up
   * waits for its second while the piece plays. Undo and the notices follow it (A7).
   */
  pressAgainSec: number;
  /** Space plays and stops. Off for a switch box that sends Space (A7). */
  spaceKeyOn: boolean;
  /** The letter keys: M mutes, N next scene, E end piece, 1 2 3 the views. Off for a switch box that sends letters. */
  keysOn: boolean;
  /**
   * Usable range per fader control, so a counter can't reach silence or a runaway tempo. The
   * speed's is also the hat's Slowest and Fastest (Cap tab).
   */
  controlRanges: Record<FaderRole, ControlRange>;
  /**
   * Which generation of the control ranges these are. Saved ranges are the player's own and
   * are never re-suggested, so without this the new Fastest could never reach a player who
   * had already saved: rev 2 raised a Fastest left at the old default (160) to 240, once.
   */
  controlRangesRev: number;
  /** What happens to each fader when its counter leaves the board. */
  controlRemoval: Record<FaderRole, ControlRemoval>;
  /** Effect amount a toggle colour switches in (was hard-coded 0.35). */
  toggleAmount: number;
  /** The pattern must be unchanged this long before a loop slot captures it (ms). */
  captureQuietMs: number;
  /** Ignore hands: hold the cells an arm or hand is over instead of reading them. */
  /**
   * OFF by default. The guard drops the cells it thinks a hand is over BEFORE anything is
   * read, so when it is wrong it doesn't degrade the instrument, it blinds it. Its
   * thresholds were only ever tuned on synthetic, noise-free frames; on a real webcam,
   * sensor noise and auto-exposure drift had it holding half an empty board. It stays
   * available, and goes back on by default once it is proven against a real camera.
   */
  /**
   * What this board's own squares look like, learnt when the corners were confirmed with
   * nothing on it. Used to keep counter colours OFF the board: knowing the board first is
   * what makes "not the board" a meaningful test.
   */
  boardColours: { h: number; s: number; v: number }[];
  /**
   * The same learning, kept PER SQUARE and in board order (3 values each).
   *
   * Position is what makes it powerful: a square with unusual grain, or one that sits in
   * a shadow, is compared with its own recorded appearance rather than with the average
   * of its colour family — so its grain stops looking like a counter.
   */
  boardSquareRgb: number[];
  /** The board size it was learnt at; learning is discarded if that changes. */
  boardLearntSquares: number;
  /**
   * The empty board, learnt from many frames exactly as the reader sees them: each spot's
   * colour and how much it naturally varies. With it, counters are found by how they
   * differ from the board (see tracking/boardReference). Belongs to the rig: the camera
   * and the board, not the player.
   */
  boardReference: StoredBoardReference | null;
  /**
   * 'board' = find counters against the learnt board (falls back to the colour ranges
   * until the board is learnt); 'bands' = the colour ranges only, as before.
   */
  counterDetection: 'board' | 'bands';
  /**
   * How tall the counters are, in board squares. A camera at an angle sees their tops
   * shifted towards the far side; the board is read where the tops appear (parallax.ts).
   * 0 = flat (no correction).
   */
  counterHeight: number;
  /** The red cap: a camera facing the player turns where the cap is into control values. */
  cap: CapSettings;
  handGuardEnabled: boolean;
  /** Set once the one-time clearing of an inherited "hand guard on" has happened. */
  handGuardReset?: boolean;
  /** Space kept around a hand, in board squares. */
  handMarginSquares: number;
  /** How long a cell stays held after the hand leaves (ms). */
  handReleaseMs: number;
  /** Settle time while the hand guard is working — shorter, because hands are excluded. */
  settleAfterHandMs: number;
  /** How different a pixel must be from the learnt board to count as an intruder (0–255). */
  intruderSensitivity: number;
  /** Something resting over the same cells this long raises a hint (ms). */
  restNudgeMs: number;
  /** Keep the pattern playing as ghosts when pieces are knocked off. */
  knockGuardEnabled: boolean;
  /** How many counters must go at once to count as a knock. */
  knockMinCount: number;
  /** …and what share of the pattern they must be. */
  knockMinFraction: number;
  /** The window those losses must fall inside (ms). */
  knockWindowMs: number;
  /** Where a counter sits in its box changes how it plays (off by default). */
  boxDetailEnabled: boolean;
  /** How much higher-in-the-box raises the volume (0 = not at all). */
  boxLoudnessAmount: number;
  /** How far right-of-centre pushes a note late, as a share of half a step. */
  boxTimingAmount: number;
  /** What two counters in one box mean. 'off' = the strongest colour wins. */
  twoCounterMode: 'off' | 'both';
  /** Follow the board silently when it is nudged, instead of going off the squares. */
  boardTrackingEnabled: boolean;
  /** How far a nudge may be followed, in board squares, before it needs Find board. */
  boardTrackMaxSquares: number;
  /** Where control counters live: anywhere on the board, or in one row or column. */
  controlZone: Zone;
  /** Where the loop pads live. 'off' = no loop pads. */
  loopZone: Zone;
  /** Hold = the counter must stay; Toggle = on and off with each placement. */
  loopPadMode: 'hold' | 'toggle';
}

/** Fader-role controls, whose value comes from a counter's position. */
export type FaderRole = 'volume' | 'reverb' | 'delay' | 'tone' | 'tempo' | 'fill' | 'evolve';
export interface ControlRange { min: number; max: number }
/** What a fader does when its counter leaves: keep it, drop to zero, or drift back. */
export type ControlRemoval = 'hold' | 'zero' | 'default';

const FADER_ROLE_LIST: FaderRole[] = ['volume', 'reverb', 'delay', 'tone', 'tempo', 'fill', 'evolve'];

/**
 * The furthest a control's range may go: what the sound can safely take. Everything but
 * the speed is a gain or an amount from 0 to 1; a typed-in 8 went straight into a send.
 */
export const CONTROL_RANGE_LIMITS: Record<FaderRole, ControlRange> = {
  volume: { min: 0, max: 1 },
  reverb: { min: 0, max: 1 },
  delay: { min: 0, max: 1 },
  tone: { min: 0, max: 1 },
  tempo: { min: 20, max: 400 },
  fill: { min: 0, max: 1 },
  evolve: { min: 0, max: 1 },
};

/** A value held within a control's limits. */
export function clampToControl(role: FaderRole, v: number): number {
  const l = CONTROL_RANGE_LIMITS[role];
  return Math.max(l.min, Math.min(l.max, v));
}

const DEFAULT_CONTROL_RANGES: Record<FaderRole, ControlRange> = {
  volume: { min: 0.2, max: 1 },
  reverb: { min: 0, max: 0.6 },
  delay: { min: 0, max: 0.6 },
  tone: { min: 0, max: 1 },
  // Fastest 240: the hat moves the speed around the scene's, and has to reach well above it.
  tempo: { min: 60, max: 240 },
  fill: { min: 0, max: 1 },
  evolve: { min: 0, max: 1 },
};

/** The current generation of the control ranges (see `controlRangesRev`). */
export const CONTROL_RANGES_REV = 2;
/** Fastest as it was by default before rev 2. */
const OLD_DEFAULT_FASTEST = 160;

const DEFAULT_CONTROL_REMOVAL: Record<FaderRole, ControlRemoval> = {
  volume: 'hold', reverb: 'hold', delay: 'hold', tone: 'hold', tempo: 'hold', fill: 'hold', evolve: 'hold',
};

const ZERO_CORNERS: [BoardPoint, BoardPoint, BoardPoint, BoardPoint] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

// A neutral hue band used only as a sanitisation fallback for a stored channel
// whose band is missing/corrupt — NOT a predefined colour (fresh boards have none).
const FALLBACK_HUE_BAND: TrackedColor = {
  id: 'board-hue', hue: 0, hueTolerance: 22, minSaturation: 35, minValue: 25, minArea: 0.0005,
};

/** The current generation of suggested read settings (see `readSettingsRev`). */
export const READ_SETTINGS_REV = 2;

/**
 * What a NEW player starts with on the Sound tab: Extra notes and Sounds change off, so
 * what they hear is what their counters do. (Both used to start a little on, and the
 * instrument added notes and changed its sound by itself before the player knew what
 * their own counters did.) Only for a player made now or a first run: a saved player keeps
 * exactly what it had (the sanitiser never fills these in).
 */
export const NEW_PLAYER_SOUND = { fillAmount: 0, evolveAmount: 0 } as const;

/** The iPad's page: the Simple page, or the full layout set out by the remote fields. */
export type RemoteLayoutKind = 'simple' | 'custom';

/** Whether the player's iPad shows the Simple page. */
export function isSimpleLayout(c: Pick<BoardSequencerStored, 'remoteLayoutKind'>): boolean {
  return c.remoteLayoutKind === 'simple';
}

/** What the iPad shows and how it behaves for a player: the settings the safe show layout sets. */
export type RemoteLayout = Pick<BoardSequencerStored, 'remoteStrips' | 'remotePads' | 'remoteLoopsPage' | 'remoteLocked' | 'remoteTouch'>;

/**
 * The safe show layout for a player's iPad (show decision F3): only the Extra notes strip,
 * New idea and End piece (two taps, bounce-proof). Mute, the loop pads and pages, the scene
 * pads, Next scene, Capture and Stop all are hidden, and Speed is locked, so no stray touch
 * can silence, jump, stop or speed up the show. How the player's touch is read (on landing
 * or lifting, the second-tap window, the bounce guard) is theirs and is kept.
 */
export function safeShowLayout(touch: RemoteTouch): RemoteLayout {
  return {
    remoteStrips: ['fill'],
    remotePads: ['newIdea'],
    remoteLoopsPage: false,
    remoteLocked: ['tempo'],
    remoteTouch: { ...touch, playExtras: ['endPiece'], playLoops: [], showNext: false },
  };
}

/** Whether the iPad is set out as the safe show layout (nothing added back, Speed still locked). */
export function isSafeShowLayout(c: RemoteLayout): boolean {
  const safe = safeShowLayout(c.remoteTouch);
  const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
  return same(c.remoteStrips, safe.remoteStrips)
    && same(c.remotePads, safe.remotePads)
    && c.remoteLoopsPage === safe.remoteLoopsPage
    && c.remoteLocked.includes('tempo') && !c.remoteLocked.includes('fill')
    && same(c.remoteTouch.playExtras, safe.remoteTouch.playExtras)
    && c.remoteTouch.playLoops.length === 0
    && c.remoteTouch.showNext === safe.remoteTouch.showNext;
}

export const DEFAULT_BOARD_SEQUENCER_CONFIG: BoardSequencerStored = {
  version: CONFIG_VERSION,
  enabled: false,
  corners: ZERO_CORNERS,
  // One counter per square of an 8 x 8 board, and an 8-step loop: long enough to shape
  // a piece (a 4-step loop at 90 BPM is under three seconds).
  rows: 8,
  cols: 8,
  scaleRootMidi: 60,
  scaleSemitones: [0, 2, 4, 7, 9],
  scaleName: 'Major pentatonic',
  bpm: 90,
  swing: 0,
  humanize: 0,
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
  // No predefined colours — the user calibrates their own by clicking a piece.
  channels: [],
  faderAxis: 'row',
  minFilledFraction: suggestReadSettings(8, 8, 8).minFilledFraction,
  variationEnabled: false,
  variationOffsetThreshold: 0.6,
  pingPong: false,
  pingPongPages: 'each',
  loopBankEnabled: false,
  loopSlots: [],
  noteLengthBeats: 0.9,
  velocity: 0.7,
  energy: 0.5,
  space: 0.5,
  // Saved loops play exactly as saved until the player asks them to vary.
  loopVary: 0,
  octaveShift: 0,
  volume: 0.6,
  tickEnabled: true,
  studioMix: true,
  // A new player starts with the full experience; see `soundWorld` for existing ones.
  soundWorld: 'warm',
  phrases: true,
  // The instrument adding notes is something a player turns on, never a surprise.
  fillAmount: 0,
  fillSeed: 1,
  fillKept: null,
  fillEngine: 'magenta',
  // New players hear the sound move a little; existing ones are left as they were.
  evolveAmount: 0.4,
  evolveSceneLoops: 8,
  evolveSeed: 1,
  evolveHoldLap: null,
  band: 'gentle',
  chords: { ...DEFAULT_CHORDS },
  clashNudge: true,
  bandJobs: { ...DEFAULT_JOBS },
  keepOnTop: true,
  keepOnTopDb: KEEP_ON_TOP_DEFAULT_DB,
  sceneEnergy: 0,
  pieceIdeas: 0,
  surpriseMe: false,
  tunesForNewColours: true,
  remoteReach: fullReachMap(),
  loopNames: sanitizeLoopNames([]),
  scenes: [],
  currentScene: null,
  loopFadePasses: 1,
  sceneRespectsPlayer: true,
  colourComesInAt: {},
  performance: DEFAULT_PERFORMANCE,
  pieces: [{ id: 'piece-1', name: 'Piece 1', scenes: [], performance: DEFAULT_PERFORMANCE, colourComesInAt: {} }],
  pieceId: 'piece-1',
  autoStart: false,
  boardSource: 'camera',
  laptopBoard: [],
  // New players start with the Simple page on the iPad (spec 2026-11-04); their full layout,
  // should a box be ticked, starts as the safe show layout. A player saved before either keeps
  // what they had (sanitize fills a missing field with "everything shown", and 'custom').
  remoteLayoutKind: 'simple',
  remoteSimpleRows: [...SIMPLE_ROWS],
  ...safeShowLayout(DEFAULT_REMOTE_TOUCH),
  remoteStripMode: 'jump',
  loopStepsRed: 0,
  loopStepsBlack: 0,
  loopStepsBlue: 0,
  numPages: 1,
  pages: [],
  mirrorX: true,
  mirrorY: false,
  cameraRotation: 0,
  midiEnabled: false,
  midiDeviceId: '',
  midiSends: 'player',
  midiKeepSound: true,
  midiChannelMode: 'part',
  midiLeadMs: 0,
  midiLoopChannels: false,
  cameraDeviceId: '',
  cameraLabel: '',
  boardSquares: 8,
  themeMode: 'dark',
  samplesPerAxis: suggestReadSettings(8, 8, 8).samplesPerAxis,
  readSettingsCustom: false,
  readSettingsRev: READ_SETTINGS_REV,
  boardNudgesEnabled: true,
  handedness: 'right',
  seatEdge: 'low',
  controlStillMs: 150,
  controlGlideSec: 0.3,
  controlReturnMs: 3000,
  keepTimeBehindSec: DEFAULT_KEEPING_TIME_LIMITS.behindSec,
  keepTimeDriftSec: DEFAULT_KEEPING_TIME_LIMITS.driftSec,
  keepTimeValve: DEFAULT_KEEPING_TIME_LIMITS.valve,
  pressAgainSec: DEFAULT_PRESS_AGAIN_SEC,
  spaceKeyOn: true,
  keysOn: true,
  controlRanges: DEFAULT_CONTROL_RANGES,
  controlRangesRev: CONTROL_RANGES_REV,
  controlRemoval: DEFAULT_CONTROL_REMOVAL,
  toggleAmount: 0.35,
  captureQuietMs: 500,
  boardColours: [],
  boardSquareRgb: [],
  boardLearntSquares: 0,
  boardReference: null,
  counterDetection: 'board',
  counterHeight: 0.2,
  cap: DEFAULT_CAP_SETTINGS,
  handGuardEnabled: false,
  handGuardReset: true,
  handMarginSquares: 0.75,
  handReleaseMs: 250,
  settleAfterHandMs: 300,
  intruderSensitivity: 18,
  restNudgeMs: 4000,
  knockGuardEnabled: true,
  knockMinCount: 3,
  knockMinFraction: 0.4,
  knockWindowMs: 300,
  boxDetailEnabled: false,
  boxLoudnessAmount: 0.5,
  boxTimingAmount: 0.35,
  twoCounterMode: 'off',
  boardTrackingEnabled: true,
  boardTrackMaxSquares: 0.6,
  controlZone: ANYWHERE,
  loopZone: NO_ZONE,
  loopPadMode: 'hold',
};

/** Board colours are only ever written by the app; drop anything malformed. */
function sanitizeBoardColours(v: unknown): { h: number; s: number; v: number }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
    if (!isNum(o.h) || !isNum(o.s) || !isNum(o.v)) return [];
    return [{ h: o.h, s: o.s, v: o.v }];
  }).slice(0, 256);
}

function sanitizeZone(v: unknown, fallback: Zone): Zone {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const mode = o.mode === 'row' || o.mode === 'col' || o.mode === 'off' || o.mode === 'anywhere'
    ? o.mode
    : fallback.mode;
  return { mode, index: Math.max(0, Math.round(num(o.index, fallback.index))) };
}

function sanitizeControlRanges(v: unknown): Record<FaderRole, ControlRange> {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const out = {} as Record<FaderRole, ControlRange>;
  for (const role of FADER_ROLE_LIST) {
    const d = DEFAULT_CONTROL_RANGES[role];
    const r = (typeof o[role] === 'object' && o[role] !== null ? o[role] : {}) as Record<string, unknown>;
    out[role] = { min: clampToControl(role, num(r.min, d.min)), max: clampToControl(role, num(r.max, d.max)) };
  }
  return out;
}

/**
 * The ranges, moved on to this generation once (rev 2: a Fastest left at the old default 160
 * becomes 240). Any other saved value is the player's own, and is kept.
 */
function migratedControlRanges(o: Record<string, unknown>): Record<FaderRole, ControlRange> {
  const ranges = sanitizeControlRanges(o.controlRanges);
  if (num(o.controlRangesRev, 1) >= CONTROL_RANGES_REV || ranges.tempo.max !== OLD_DEFAULT_FASTEST) return ranges;
  return { ...ranges, tempo: { ...ranges.tempo, max: DEFAULT_CONTROL_RANGES.tempo.max } };
}

function sanitizeControlRemoval(v: unknown): Record<FaderRole, ControlRemoval> {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const out = {} as Record<FaderRole, ControlRemoval>;
  for (const role of FADER_ROLE_LIST) {
    const r = o[role];
    out[role] = r === 'zero' || r === 'default' ? r : 'hold';
  }
  return out;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Sensible ceilings, so a corrupt file can't ask for a million pages. */
export const MAX_PAGES = 8;
export const MAX_LOOP_STEPS = 64;

function num(v: unknown, fallback: number): number {
  return isNum(v) ? v : fallback;
}

/** A whole number in range — anything that isn't one falls back rather than surviving. */
function wholeCount(v: unknown, lo: number, hi: number, fallback: number): number {
  if (!isNum(v)) return fallback;
  const n = Math.round(v);
  return n < lo || n > hi ? fallback : n;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  return Math.max(lo, Math.min(hi, num(v, fallback)));
}

function sanitizeCorners(v: unknown): [BoardPoint, BoardPoint, BoardPoint, BoardPoint] {
  if (!Array.isArray(v) || v.length !== 4) return ZERO_CORNERS;
  const pts = v.map((p) => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    return { x: num(o.x, 0), y: num(o.y, 0) };
  });
  return [pts[0], pts[1], pts[2], pts[3]];
}

function sanitizePages(v: unknown): StoredBoardCell[][] {
  if (!Array.isArray(v)) return [];
  return v.map((page) => {
    if (!Array.isArray(page)) return [];
    return page.flatMap((c) => {
      const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
      if (!isNum(o.row) || !isNum(o.col) || typeof o.colour !== 'string' || !o.colour) return [];
      return [withBoxDetail({ row: o.row, col: o.col, colour: o.colour }, o)];
    });
  });
}

/** Carry a stored cell's box detail through, when it has any and it is in range. */
function withBoxDetail<T extends StoredBoardCell>(cell: T, o: Record<string, unknown>): T {
  if (isNum(o.velocity) && o.velocity > 0 && o.velocity <= 1) cell.velocity = o.velocity;
  if (isNum(o.timingBeats) && Math.abs(o.timingBeats) <= 1) cell.timingBeats = o.timingBeats;
  return cell;
}

function sanitizeLoopSlots(v: unknown): (StoredLoopCell[] | null)[] {
  if (!Array.isArray(v)) return [];
  return v.map((slot) => {
    if (!Array.isArray(slot)) return null; // null = empty (never-saved) slot
    return slot.flatMap((c) => {
      const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
      if (!isNum(o.row) || !isNum(o.col) || typeof o.colour !== 'string' || !o.colour) return [];
      const cell = withBoxDetail<StoredLoopCell>({ row: o.row, col: o.col, colour: o.colour }, o);
      if (o.conditional === true) cell.conditional = true;
      if (typeof o.job === 'string' && LOOP_JOBS.has(o.job)) {
        cell.job = o.job as StoredLoopCell['job'];
        cell.sound = typeof o.sound === 'string' ? o.sound : '';
      }
      return [cell];
    });
  });
}

function sanitizeBlackBand(v: unknown): BlackBand {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    maxValue: num(o.maxValue, DEFAULT_BLACK_BAND.maxValue),
    maxSaturation: num(o.maxSaturation, DEFAULT_BLACK_BAND.maxSaturation),
  };
}

function sanitizeWhiteBand(v: unknown): WhiteBand {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    minValue: num(o.minValue, DEFAULT_WHITE_BAND.minValue),
    maxSaturation: num(o.maxSaturation, DEFAULT_WHITE_BAND.maxSaturation),
  };
}

/** Validate a stored channel object; null if unusable. */
function sanitizeChannel(v: unknown): ColourChannel | null {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const kind: ColourKind = o.kind === 'black' ? 'black' : o.kind === 'white' ? 'white' : 'hue';
  const role: ColourRole = typeof o.role === 'string' && o.role in ROLE_LABELS ? (o.role as ColourRole) : 'off';
  const swatch = typeof o.swatch === 'string' ? o.swatch : '#888888';
  const ch: ColourChannel = { id: o.id, kind, role, swatch };
  if (kind === 'hue') ch.band = sanitizeColour(o.band, FALLBACK_HUE_BAND);
  else if (kind === 'black') ch.blackBand = sanitizeBlackBand(o.blackBand);
  else ch.whiteBand = sanitizeWhiteBand(o.whiteBand);
  if (typeof o.instrument === 'string') ch.instrument = o.instrument;
  if (typeof o.drum === 'string') ch.drum = o.drum;
  if (isNum(o.loopSlot) && Number.isInteger(o.loopSlot) && o.loopSlot >= 0) ch.loopSlot = o.loopSlot;
  if (isNum(o.volume)) ch.volume = o.volume;
  if (isNum(o.tone)) ch.tone = o.tone;
  if (isNum(o.reverbSend)) ch.reverbSend = o.reverbSend;
  if (isNum(o.delaySend)) ch.delaySend = o.delaySend;
  if (o.plays === 'note' || o.plays === 'tune') ch.plays = o.plays;
  if (o.changes === false) ch.changes = false;
  if (isNum(o.noteVary) && o.noteVary >= 0 && o.noteVary <= 1) ch.noteVary = o.noteVary;
  if (isNum(o.midiChannel) && Number.isInteger(o.midiChannel) && o.midiChannel >= 1 && o.midiChannel <= 16) ch.midiChannel = o.midiChannel;
  return ch;
}

/**
 * The user's colour channels — only ever from the stored `channels` array. There
 * is NO migration from any fixed palette: colours exist solely because the user
 * calibrated them. An empty board (no colours) is valid.
 */
function sanitizeChannels(v: unknown): ColourChannel[] {
  if (!Array.isArray(v)) return [];
  return v.map(sanitizeChannel).filter((c): c is ColourChannel => c !== null);
}

function sanitizeColour(v: unknown, fallback: TrackedColor): TrackedColor {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' ? o.id : fallback.id,
    hue: num(o.hue, fallback.hue),
    hueTolerance: num(o.hueTolerance, fallback.hueTolerance),
    minSaturation: num(o.minSaturation, fallback.minSaturation),
    minValue: num(o.minValue, fallback.minValue),
    minArea: num(o.minArea, fallback.minArea),
  };
}

function sanitize(input: unknown): BoardSequencerStored | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  const d = DEFAULT_BOARD_SEQUENCER_CONFIG;
  const semis = Array.isArray(o.scaleSemitones) && o.scaleSemitones.every(isNum)
    ? (o.scaleSemitones as number[])
    : d.scaleSemitones;
  const rows = Math.round(Math.min(10, Math.max(2, num(o.rows, d.rows))));
  const cols = Math.round(Math.min(16, Math.max(2, num(o.cols, d.cols))));
  const boardSquares: BoardSquares = o.boardSquares === 10 ? 10 : 8;
  const storedFill = isNum(o.minFilledFraction) ? o.minFilledFraction : null;
  // Legacy configs have no flag: a min fill left at the old 0.1 default counts as untuned.
  const readSettingsCustom = typeof o.readSettingsCustom === 'boolean'
    ? o.readSettingsCustom
    : storedFill !== null && Math.abs(storedFill - 0.1) > 1e-9;
  // The lane is authoritative when it names one; otherwise the old bottom-row bank flag
  // still turns it on, so nothing changes for anyone already using it.
  const storedZone = o.loopZone !== undefined
    ? sanitizeZone(o.loopZone, DEFAULT_BOARD_SEQUENCER_CONFIG.loopZone)
    : null;
  const loopZone: Zone = storedZone !== null && storedZone.mode !== 'off'
    ? storedZone
    : (o.loopBankEnabled === true ? { mode: 'row', index: rows - 1 } : NO_ZONE);
  const controlZone = clampZone(sanitizeZone(o.controlZone, d.controlZone), rows, cols);
  const clampedLoopZone = clampZone(loopZone, rows, cols);
  // Two lanes over the same cells leave the loop pads dead but still drawn as pads.
  // Controls win, so a colliding loop lane is switched off where the player can see it
  // rather than left looking like a bank that simply doesn't work.
  const resolvedLoopZone = zonesCollide(controlZone, clampedLoopZone) ? NO_ZONE : clampedLoopZone;
  let samplesPerAxis = isNum(o.samplesPerAxis) ? Math.round(Math.min(15, Math.max(3, o.samplesPerAxis))) : NaN;
  let minFilledFraction = storedFill ?? d.minFilledFraction;
  if (!Number.isFinite(samplesPerAxis)) {
    // Pre-redesign config: one-time suggestion (existing 4 × 4 boards get the coverage fix).
    const s = suggestReadSettings(boardSquares, rows, cols);
    samplesPerAxis = s.samplesPerAxis;
    if (!readSettingsCustom) minFilledFraction = s.minFilledFraction;
  } else if (!readSettingsCustom && num(o.readSettingsRev, 1) < READ_SETTINGS_REV) {
    // Rev 2: denser sampling and the measured counter size. Untuned settings saved under
    // rev 1 read a centred counter at exactly the minimum, so cyan and purple counters
    // with shaded rims went undetected. Tuned settings are the player's and are kept.
    const s = suggestReadSettings(boardSquares, rows, cols);
    samplesPerAxis = s.samplesPerAxis;
    minFilledFraction = s.minFilledFraction;
  }
  // Pre-v2 colour data (the old fixed palette + its migration) is discarded so the board
  // starts with no predefined colours.
  const channels = num(o.version, 1) >= CONFIG_VERSION ? sanitizeChannels(o.channels) : [];
  // Never coarser than suggested. Nothing on screen sets the sampling — "custom" is the
  // player's coverage — yet a player who had moved that slider kept 5 x 5 for good. On the
  // real board, at an angle, 5 x 5 lost counters that 9 x 9 read in every frame.
  samplesPerAxis = Math.max(samplesPerAxis, suggestReadSettings(boardSquares, rows, cols).samplesPerAxis);
  // The piece open now (item 3): made safe here, then mirrored into the list below.
  const sceneDefaults = {
    soundWorld: d.soundWorld, band: d.band, phrases: d.phrases, fillAmount: d.fillAmount, evolveAmount: d.evolveAmount, bpm: d.bpm,
    chords: d.chords, bandJobs: d.bandJobs, sceneEnergy: 0 as const,
  };
  const scenes = sanitizeScenes(o.scenes, sceneDefaults);
  const performance = sanitizePerformance(o.performance);
  const channelIds = new Set(channels.map((c) => c.id));
  // Only for colours that still exist: a time left behind would land on a new colour.
  const colourComesInAt = sanitizeColourEntries(o.colourComesInAt, channelIds);
  return {
    version: CONFIG_VERSION,
    enabled: o.enabled === true,
    corners: sanitizeCorners(o.corners),
    rows,
    cols,
    scaleRootMidi: num(o.scaleRootMidi, d.scaleRootMidi),
    scaleSemitones: semis,
    scaleName: typeof o.scaleName === 'string' ? o.scaleName : d.scaleName,
    bpm: num(o.bpm, d.bpm),
    swing: num(o.swing, d.swing),
    humanize: num(o.humanize, d.humanize),
    settleWindowMs: num(o.settleWindowMs, d.settleWindowMs),
    velocityFloor: num(o.velocityFloor, d.velocityFloor),
    velocitySmoothing: num(o.velocitySmoothing, d.velocitySmoothing),
    occupancyGraceMs: num(o.occupancyGraceMs, d.occupancyGraceMs),
    motionConfirmMs: num(o.motionConfirmMs, d.motionConfirmMs),
    channels,
    faderAxis: o.faderAxis === 'col' ? 'col' : 'row',
    minFilledFraction,
    variationEnabled: o.variationEnabled === true,
    variationOffsetThreshold: num(o.variationOffsetThreshold, d.variationOffsetThreshold),
    pingPong: o.pingPong === true,
    pingPongPages: o.pingPongPages === 'chain' ? 'chain' : 'each',
    loopBankEnabled: zoneSlotCount(resolvedLoopZone, rows, cols) > 0,
    loopSlots: sanitizeLoopSlots(o.loopSlots),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    energy: Math.max(0, Math.min(1, num(o.energy, d.energy))),
    space: Math.max(0, Math.min(1, num(o.space, d.space))),
    loopVary: Math.max(0, Math.min(1, num(o.loopVary, d.loopVary))),
    octaveShift: num(o.octaveShift, d.octaveShift),
    volume: num(o.volume, d.volume),
    tickEnabled: o.tickEnabled !== false,
    studioMix: o.studioMix !== false,
    soundWorld: isSoundWorldChoice(o.soundWorld) ? o.soundWorld : 'none',
    phrases: o.phrases === true,
    fillAmount: Math.max(0, Math.min(1, num(o.fillAmount, 0))),
    fillSeed: Math.round(num(o.fillSeed, 1)),
    fillKept: sanitizeFillNotes(o.fillKept),
    fillEngine: o.fillEngine === 'rules' ? 'rules' : 'magenta',
    evolveAmount: Math.max(0, Math.min(1, num(o.evolveAmount, 0))),
    evolveSceneLoops: [4, 8, 16].includes(num(o.evolveSceneLoops, 8)) ? num(o.evolveSceneLoops, 8) : 8,
    evolveSeed: Math.round(num(o.evolveSeed, 1)),
    evolveHoldLap: isNum(o.evolveHoldLap) && o.evolveHoldLap >= 0 ? Math.round(o.evolveHoldLap) : null,
    band: o.band === 'gentle' || o.band === 'full' ? o.band : 'off',
    chords: sanitizeChords(o.chords),
    clashNudge: o.clashNudge === true,
    bandJobs: sanitizeBandJobs(o.bandJobs),
    // On by default (owner), for every player: a dip of a few dB, and a switch to turn it off.
    keepOnTop: o.keepOnTop !== false,
    keepOnTopDb: sanitizeKeepOnTopDb(o.keepOnTopDb),
    sceneEnergy: sanitizeSceneEnergy(o.sceneEnergy),
    pieceIdeas: sanitizeIdeas(o.pieceIdeas),
    surpriseMe: o.surpriseMe === true,
    // Players set up before it existed keep one note for every colour they add.
    tunesForNewColours: o.tunesForNewColours === true,
    remoteReach: sanitizeReachMap(o.remoteReach),
    loopNames: sanitizeLoopNames(o.loopNames),
    scenes,
    // A saved board is a stopped board, and a stopped board has no scene on now: one left
    // marked (a scene added while stopped, a save from before) made the next piece open in
    // it and skip every scene before it (R2-T2-01). A reload carries on from pieceRunning.
    currentScene: null,
    loopFadePasses: [0, 0.5, 1, 2].includes(num(o.loopFadePasses, 1)) ? num(o.loopFadePasses, 1) : 1,
    sceneRespectsPlayer: o.sceneRespectsPlayer !== false,
    // Only for colours that still exist: a time left behind would land on a new colour.
    colourComesInAt,
    performance,
    ...sanitizePieces(o.pieces, o.pieceId, { scenes, performance, colourComesInAt }, sceneDefaults, channelIds),
    autoStart: o.autoStart === true,
    boardSource: o.boardSource === 'laptop' ? 'laptop' : 'camera',
    laptopBoard: Array.isArray(o.laptopBoard) ? (sanitizeLoopSlots([o.laptopBoard])[0] ?? []) : [],
    remoteLayoutKind: o.remoteLayoutKind === 'simple' ? 'simple' : 'custom',
    // A player saved before the rows could be chosen sees them all.
    remoteSimpleRows: sanitizeSimpleRows(o.remoteSimpleRows),
    remoteStrips: Array.isArray(o.remoteStrips)
      ? REMOTE_CONTROLS.filter((n) => (o.remoteStrips as unknown[]).includes(n))
      : [...REMOTE_CONTROLS],
    remotePads: Array.isArray(o.remotePads)
      ? (['newIdea', 'newSound', 'keep', 'mute'] as RemoteTriggerName[]).filter((n) => (o.remotePads as unknown[]).includes(n))
      : ['newIdea', 'newSound', 'keep', 'mute'],
    remoteLoopsPage: o.remoteLoopsPage !== false,
    remoteLocked: Array.isArray(o.remoteLocked) ? REMOTE_CONTROLS.filter((n) => (o.remoteLocked as unknown[]).includes(n)) : [],
    remoteStripMode: o.remoteStripMode === 'follow' ? 'follow' : 'jump',
    remoteTouch: sanitizeRemoteTouch(o.remoteTouch),
    // Whole counts. A stored 0, 2.5 or -1 used to survive: Array.from({length: numPages})
    // throws on a fraction, and the page picker showed nothing selected.
    loopStepsRed: wholeCount(o.loopStepsRed, 0, MAX_LOOP_STEPS, d.loopStepsRed),
    loopStepsBlack: wholeCount(o.loopStepsBlack, 0, MAX_LOOP_STEPS, d.loopStepsBlack),
    loopStepsBlue: wholeCount(o.loopStepsBlue, 0, MAX_LOOP_STEPS, d.loopStepsBlue),
    numPages: wholeCount(o.numPages, 1, MAX_PAGES, d.numPages),
    pages: sanitizePages(o.pages),
    mirrorX: o.mirrorX !== false,
    mirrorY: o.mirrorY === true,
    cameraRotation: quarterTurns(o.cameraRotation),
    cameraDeviceId: typeof o.cameraDeviceId === 'string' ? o.cameraDeviceId : d.cameraDeviceId,
    cameraLabel: typeof o.cameraLabel === 'string' ? o.cameraLabel : d.cameraLabel,
    midiEnabled: o.midiEnabled === true,
    midiDeviceId: typeof o.midiDeviceId === 'string' ? o.midiDeviceId : '',
    midiSends: o.midiSends === 'all' ? 'all' : 'player',
    midiKeepSound: o.midiKeepSound !== false,
    midiChannelMode: o.midiChannelMode === 'colour' ? 'colour' : 'part',
    midiLeadMs: clampLeadMs(o.midiLeadMs),
    midiLoopChannels: o.midiLoopChannels === true,
    boardSquares,
    themeMode: o.themeMode === 'light' ? 'light' : 'dark',
    samplesPerAxis,
    readSettingsCustom,
    readSettingsRev: READ_SETTINGS_REV,
    boardNudgesEnabled: o.boardNudgesEnabled !== false,
    handedness: o.handedness === 'left' ? 'left' : 'right',
    seatEdge: o.seatEdge === 'start' || o.seatEdge === 'end' || o.seatEdge === 'high' ? o.seatEdge : 'low',
    controlStillMs: clampNum(o.controlStillMs, 0, 2000, d.controlStillMs),
    controlGlideSec: clampNum(o.controlGlideSec, 0, 2, d.controlGlideSec),
    controlReturnMs: clampNum(o.controlReturnMs, 0, 30000, d.controlReturnMs),
    keepTimeBehindSec: clampNum(o.keepTimeBehindSec, KEEPING_TIME_RANGE.behindSec.min, KEEPING_TIME_RANGE.behindSec.max, d.keepTimeBehindSec),
    keepTimeDriftSec: clampNum(o.keepTimeDriftSec, KEEPING_TIME_RANGE.driftSec.min, KEEPING_TIME_RANGE.driftSec.max, d.keepTimeDriftSec),
    keepTimeValve: o.keepTimeValve !== false,
    // Players saved before these existed keep today's behaviour: 4 s, and Space on.
    pressAgainSec: sanitizePressAgainSec(o.pressAgainSec),
    spaceKeyOn: o.spaceKeyOn !== false,
    keysOn: o.keysOn !== false,
    controlRanges: migratedControlRanges(o),
    controlRangesRev: CONTROL_RANGES_REV,
    controlRemoval: sanitizeControlRemoval(o.controlRemoval),
    toggleAmount: clampNum(o.toggleAmount, 0, 1, d.toggleAmount),
    captureQuietMs: clampNum(o.captureQuietMs, 0, 5000, d.captureQuietMs),
    // A saved "on" from before it was switched off by default is cleared ONCE. It was on
    // by default and is known to blind the board on a real camera, so leaving it set would
    // hand the fault to exactly the people who hit it first and never chose it. Turning it
    // back on after this migration sticks.
    boardColours: sanitizeBoardColours(o.boardColours),
    boardSquareRgb: Array.isArray(o.boardSquareRgb) && o.boardSquareRgb.every(isNum)
      ? (o.boardSquareRgb as number[]).slice(0, 10 * 10 * 3)
      : [],
    boardLearntSquares: isNum(o.boardLearntSquares) ? Math.round(o.boardLearntSquares) : 0,
    boardReference: isStoredBoardReference(o.boardReference) ? o.boardReference : null,
    counterDetection: o.counterDetection === 'bands' ? 'bands' : 'board',
    counterHeight: typeof o.counterHeight === 'number' && Number.isFinite(o.counterHeight)
      ? Math.max(0, Math.min(0.6, o.counterHeight)) : d.counterHeight,
    cap: sanitizeCapSettings(o.cap),
    handGuardEnabled: o.handGuardEnabled === true && o.handGuardReset === true,
    handGuardReset: true,
    handMarginSquares: clampNum(o.handMarginSquares, 0.25, 2, d.handMarginSquares),
    handReleaseMs: clampNum(o.handReleaseMs, 100, 1000, d.handReleaseMs),
    settleAfterHandMs: clampNum(o.settleAfterHandMs, 150, 1000, d.settleAfterHandMs),
    intruderSensitivity: clampNum(o.intruderSensitivity, 8, 40, d.intruderSensitivity),
    restNudgeMs: clampNum(o.restNudgeMs, 2000, 15000, d.restNudgeMs),
    knockGuardEnabled: o.knockGuardEnabled !== false,
    knockMinCount: Math.round(clampNum(o.knockMinCount, 2, 8, d.knockMinCount)),
    knockMinFraction: clampNum(o.knockMinFraction, 0.2, 0.8, d.knockMinFraction),
    knockWindowMs: clampNum(o.knockWindowMs, 150, 1000, d.knockWindowMs),
    boxDetailEnabled: o.boxDetailEnabled === true,
    boxLoudnessAmount: clampNum(o.boxLoudnessAmount, 0, 1, d.boxLoudnessAmount),
    boxTimingAmount: clampNum(o.boxTimingAmount, 0, 1, d.boxTimingAmount),
    twoCounterMode: o.twoCounterMode === 'both' ? 'both' : 'off',
    boardTrackingEnabled: o.boardTrackingEnabled !== false,
    boardTrackMaxSquares: clampNum(o.boardTrackMaxSquares, 0.2, 1.5, d.boardTrackMaxSquares),
    controlZone,
    loopZone: resolvedLoopZone,
    loopPadMode: o.loopPadMode === 'toggle' ? 'toggle' : 'hold',
  };
}

/** Sanitise any stored/merged object into a valid config (null if not an object). */
export function sanitizeBoardSequencerConfig(input: unknown): BoardSequencerStored | null {
  return sanitize(input);
}

/** Channel ids referenced by saved pages and loop slots (never reuse these for new colours). */
export function referencedChannelIds(cfg: Pick<BoardSequencerStored, 'pages' | 'loopSlots'> & Partial<Pick<BoardSequencerStored, 'laptopBoard'>>): Set<string> {
  const ids = new Set<string>();
  for (const page of cfg.pages) for (const c of page) ids.add(c.colour);
  for (const slot of cfg.loopSlots) if (slot) for (const c of slot) ids.add(c.colour);
  // Counters on the laptop board too: reusing a deleted colour's id would turn them into
  // the new colour, with its job.
  for (const c of cfg.laptopBoard ?? []) ids.add(c.colour);
  return ids;
}

export function loadBoardSequencerConfig(): BoardSequencerStored | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    return sanitize(JSON.parse(raw) as unknown);
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to load:', error);
    return null;
  }
}

export function saveBoardSequencerConfig(config: BoardSequencerStored): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitize(config);
    if (!clean) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to save:', error);
  }
}

export function clearBoardSequencerConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to clear:', error);
  }
}
