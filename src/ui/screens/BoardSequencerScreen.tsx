/**
 * BoardSequencerScreen — standalone "physical board → step sequencer" mode.
 *
 * Place red pieces on a physical grid in view of the camera; each settled piece
 * activates a cell. A playhead sweeps the columns at the chosen tempo and sounds
 * the active cells (rows = a fixed pentatonic scale, or a drum kit). Reached by
 * explicit navigation from the Welcome screen; OFF by default. It does not touch
 * any other mode/screen.
 *
 * A single rAF loop runs whenever the board is calibrated: it reads the frame,
 * draws the detection overlay (our grid + per-cell red/active state) onto the
 * camera, and — while running — steps slide-and-settle and drives the audio
 * engine. The UI only calls Tone.start() (audio unlock) and Tone.now() (playhead);
 * all note/tick audio goes through the engine.
 *
 * Orientation (mirrorX/mirrorY) is applied to BOTH the displayed video and the
 * sampled frame, and calibration is captured in that same space — so changing
 * orientation invalidates calibration (you re-click the corners), which prevents
 * a saved calibration from silently mismatching the orientation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager, type CameraTrackInfo } from '../../tracking/CameraManager';
import { nextColourlessState } from '../../tracking/cameraCheck';
import { describeLighting, nextLightingProblem, type LightingProblem } from '../../tracking/lightingCheck';
import {
  useBoardRuntime, applyEngineSettings, NOOP_RUNTIME_CALLBACKS, type BoardRuntimeCallbacks, type RuntimeFrame,
  type MidiPortState,
} from './boardSequencer/useBoardRuntime';
import { homographyForCorners } from './boardSequencer/homographyForCorners';
import { applyGridChange } from '../../tracking/boardGrid';
import { suggestRole } from './boardSequencer/roles';
import { controlOwners, disabledReason, legendValue } from './boardSequencer/controlOwnership';
import './boardSequencer/theme/boardTheme.css';
import { BOARD_TOKENS } from './boardSequencer/theme/boardTokens';
import { BoardHeader } from './boardSequencer/BoardHeader';
import { headerNoticeFor } from './boardSequencer/headerNotice';
import { CameraSurface } from './boardSequencer/CameraSurface';
import { PlayerChooser } from './boardSequencer/PlayerChooser';
import { StepIndicator } from './boardSequencer/ui/StepIndicator';
import { SetupFlow, STEP_LABELS, SETUP_HEADINGS, SETUP_HINTS } from './boardSequencer/setup/SetupFlow';
import { CameraStep } from './boardSequencer/setup/CameraStep';
import { BoardStep } from './boardSequencer/setup/BoardStep';
import { ColoursStep } from './boardSequencer/setup/ColoursStep';
import { ReadyStep } from './boardSequencer/setup/ReadyStep';
import { BoardCornerEditor } from './boardSequencer/components/BoardCornerEditor';
import { cellMap, LiveBoardView } from './boardSequencer/components/BoardView';
import { createSessionArchive, indexedDbTakeStore, MAX_TAKES, type SessionArchive, type TakeSummary } from '../../storage/sessionArchive';
import {
  forgetPieceRunning, readPieceRunning, rememberEnding, rememberPieceRunning, rememberScene, rememberShowing, reloadOffer, type PieceRunning,
} from '../../songs/performance/pieceRunning';
import { drawCells, keepCells, loopChannelsFor, loopColourLabel, loopSwatch } from '../../songs/performance/loopSounds';
import { boardSeen, chooseFromEmpty, engineSettingsFor, hearWith, loopsToPlay, playerCellsFor, slotForKeep, startNewLoop, startWithThese, stopHearing, type NewLoopState } from '../../songs/performance/newLoop';
import { NewLoopPanel, liftLine, newLoopStatusLine, type NewLoopStopped } from './boardSequencer/play/NewLoopPanel';
import { LinkQr } from './boardSequencer/components/LinkQr';
import { createPopStore, soundingKey, type PopStore } from './boardSequencer/popStore';
import { beyondLoopNote, beyondLoopSquares, playsTune, withTuneDefault } from '../../songs/beyondLoop';
import { cellsKey, controlsKey, frameKey } from './boardSequencer/runtimeKeys';
import { describeBoard, phraseSpans, popsAt, pruneFired, type Pop } from './boardSequencer/components/boardViewModel';
import { isSequencedRole, isControlRole, isLoopRole } from '../../tracking/boardColours';
import { placeLaptopCounter } from '../../tracking/laptopBoard';
import { LaptopBoardBar } from './boardSequencer/components/LaptopBoardBar';
import { learnBoardReference, loadBoardReference, orientSquareGrid, storeBoardReference, type FrameRGBA } from '../../tracking/boardReference/boardReference';
import { findCounterBlobs } from '../../tracking/boardReference/findCounters';
import { captureReaderFrames, READER_DOWNSCALE } from './boardSequencer/captureReaderFrames';
import { detectionSetup } from '../../tracking/boardReference/detectionSetup';
import { LoopThumb, PieceSteps, type PieceLoop, type PieceStep } from './boardSequencer/play/PieceSteps';
import { NowNextStrip } from './boardSequencer/play/NowNextStrip';
import { nextSceneUndo, nextUndoOffered, type NextSceneUndo } from './boardSequencer/play/nextSceneUndo';
import { ShowStatusRow } from './boardSequencer/play/ShowStatusRow';
import {
  escLeavesShow, showStatusItems, simplifiedLine, stopGuarded, type ShowHatState, type ShowStatusAction, type ShowStatusInput,
} from './boardSequencer/play/showStatus';
import { PLACE_WORDS, type CheckPlace, type ReadyItem } from './boardSequencer/play/ReadyCheck';
import { PlayPanel, type PlayTab } from './boardSequencer/play/PlayPanel';
import { forgetSoundsBefore } from './boardSequencer/play/ColourTable';
import { WORDS } from './boardSequencer/words';
import { HeaderMore } from './boardSequencer/ui/HeaderMore';
import { ExplainSwitch, Note } from './boardSequencer/ui/explain';
import { CapPanel, CAP_ROLE_LABELS, CAP_PAUSE_TEXT, capHudText, capValueText, hatJobsLine, hatResultText } from './boardSequencer/play/CapPanel';
import { useCapTracker } from './boardSequencer/useCapTracker';
import { audienceNoticeText, useAudienceWindow } from '../../audience/useAudienceWindow';
import { audienceHat, audienceNotes, audienceState, drawStalled, dueNotes } from '../../audience/feed';
import { useEmptyBoardWait } from './boardSequencer/useEmptyBoardWait';
import type { BoardActivity, CapSettings } from '../../tracking/cap/capTracker';
import { BoardLegend } from './boardSequencer/components/BoardLegend';
import { soundNameFor } from './boardSequencer/soundOptions';
import { SoundTab, type ChannelSoundPatch } from './boardSequencer/play/SoundTab';
import { NudgeBanner } from './boardSequencer/play/NudgeBanner';
import { SwatchChip } from './boardSequencer/ui/SwatchChip';
import { Switch } from './boardSequencer/ui/Switch';
import { SegmentedControl } from './boardSequencer/ui/SegmentedControl';
import { clampZone, describeZone, NO_ZONE, zoneSlotCount, zonesCollide, type Zone, type ZoneMode } from '../../tracking/zones';
import { LabeledSlider } from './boardSequencer/ui/LabeledSlider';
import { Button } from './boardSequencer/ui/Button';
import { focusDropped, focusWhenGone, PLAY_STOP_ID } from './boardSequencer/ui/focusNext';
import { inertOutside, Modal } from './boardSequencer/ui/Modal';
import { cameraDebugEnabled } from '../../tracking/cameraDebugFlag';
import { loadCameraChoice, saveCameraChoice } from '../../tracking/cameraChoice';
import { CameraDebugPanel } from '../components/camera/CameraDebugPanel';
import { ConfirmDialog } from './boardSequencer/ui/ConfirmDialog';
import { colourMatchesBoardRaw, type NudgeSignal } from './boardSequencer/playNudge';
import { noticeMs, pressAgainMs, PRESS_AGAIN_CHOICES, undoMs } from '../../profiles/pressAgain';
import { START_AFTER_PIECE_MS, simplifyKey, spaceAction, spaceTogglesPlay, startTooSoon, type BoardScreenView } from './boardSequencer/spaceKey';
import { ghostsForSave } from '../../tracking/handGuard/knockGuard';
import { TRACK_SAVE_MS } from '../../tracking/handGuard/boardTrack';
import { detectBoard, type BoardDetection } from '../../tracking/boardDetect/detectBoard';
import { consensus, AGREE_COUNT } from '../../tracking/boardDetect/consensus';
import { boardStillThere } from '../../tracking/boardDetect/boardStillThere';
import { autoLearnAllowed, learntSquares } from './boardSequencer/learnGuard';
import { runFrameBurst } from './boardSequencer/useFrameBurst';
import {
  buildSquareModel, modelHsv, warpToBoard, type SquareModel,
} from '../../tracking/boardColourDetect/squareModel';
import { bandKeeps, coloursFromBlobs, fitSafeBand } from '../../tracking/boardColourDetect/detectColours';
import { detectColours, type DetectedColour } from '../../tracking/boardColourDetect/detectColours';
import type { FiredNote } from '../../songs/BoardSequencerEngine';
import {
  setupSteps, canOpenStep, canPlay, resolveEntry, stepIndicator,
  setupRequestedOnOpen, clearSetupRequest, laptopRequestedOnOpen, stepOnBoard, configForNewPlayer, askWhoIsPlaying, openingView, viewAfterPick, shouldCheckBoard,
  type CameraStatus, type SetupStep,
} from './boardSequencer/boardSetupFlow';
import {
  listBoardPlayers, getActiveBoardPlayer, rememberedBoardPlayerId, createBoardPlayer, updateBoardPlayer, setActiveBoardPlayer,
  type BoardPlayerProfile,
} from '../../profiles/BoardProfiles';
import { layoutFor } from './boardSequencer/layout';
import { isConvexQuad, squareCentreToImage } from './boardSequencer/cornerEditor';
import { drawOriented, orientedSize, reorientPoints, type FrameOrientation, type QuarterTurns } from '../../tracking/frameOrientation';
import { SOUND_WORLDS, SOUND_WORLD_IDS, worldOf } from '../../audio/worlds/soundWorlds';
import type { FillSourceStatus } from '../../songs/BoardSequencerEngine';
import type { BandLevel, BandPart } from '../../songs/band/band';
import { BoardMidiPanel } from './boardSequencer/components/BoardMidiPanel';
import { planFromConfig } from './boardSequencer/components/AbletonSoundsPanel';
import { useBoardMidiPort } from './boardSequencer/useBoardMidiPort';
import { abletonReadyItem, abletonTracksItem } from './boardSequencer/abletonReady';
import { aloneLine, backupItem, boardItem, ipadCheckItems, keepingTimeCheckItems, listNames, pieceCheckItems, playerWords, updatedFromNowLine } from './boardSequencer/pieceCheck';
import {
  keepingTimeIndicator, keepingTimeNews, KEEPING_TIME_RANGE, TIME_SEEN_NONE, type KeepingTimeReport, type TimeSeen, type ValveStep,
} from '../../songs/keepingTime';
import { colourUses, type ColourUses } from './boardSequencer/colourRemoval';
import { aiOffLine } from './boardSequencer/aiStatus';
import { bandLine } from './boardSequencer/bandLine';
import { BoardMidiSender, channelFor, colourChannelMap, configToSoundFrom, effectiveSound } from '../../midi/boardMidi';
import { ABLETON_CHAINS, chainOnChannel, previewEvents } from '../../midi/abletonSounds';
import { MIDIManager } from '../../midi/MIDIManager';
import { previewChainCc, previewNotesFor, previewRoute, SoundAuditioner } from '../../audio/soundPreview';
import { LoopEditor } from './boardSequencer/components/LoopEditor';
import {
  LAUNCH_SLOTS, MAX_SCENES, loopLabel, nextSceneIndex, sceneFromNow, sceneSettingsOf, sceneSettingsToApply, slotState, stoppedConfig, toggleSlot, withOwnSettings,
  type PlayerStrip, type Scene, type SceneSettings,
} from '../../songs/performance/launcher';
import { freshIdeas, ideasFor, keepIdea } from '../../songs/performance/ideas';
import {
  clockView, cueText, describeEnding, formatClock, CLOCK_NOT_STARTED,
  type ClockView,
} from '../../songs/performance/clock';
import {
  decideClockTick, editedScene, nowNext, type ScenePatch, openingScene, pieceEndingLeadSec, pieceSpeeds, planScenes, putLoopBack, sortScenes, takeLoopOut, withSceneAdded,
} from '../../songs/performance/piece';
import {
  cellsSoundingAt, comesInLine, holdsBack, waitingColours, waitingLine, withColourEntry,
} from '../../songs/performance/colourEntries';
import { glideBpmAt, glideDone, startGlide, GLIDE_STEP_MS, type SpeedGlide } from '../../songs/performance/speedGlide';
import { DEFAULT_LOOP_COLOUR_OPTIONS, initialLoopColourState, stepLoopColours } from '../../songs/performance/loopColours';
import { SessionLog, sessionFileName, type LogActor } from '../../songs/sessionLog';
import { diskState, onDiskState, restoreFromFile, scheduleDiskSave } from '../../storage/diskSync';
import { savingGuarded } from '../../storage/tabSaving';
import { TABS_CHANNEL } from '../components/OtherTabNotice';
import { backupFileName, parseBoardBackup, snapshotStorage, summariseBackup, type BoardBackup } from '../../storage/boardBackup';
import { useRemoteLink } from '../../remote/useRemoteLink';
import {
  dynamicsFromValue, fullReachMap, ipadPages, makeRemoteCode, reachFromSamples, REMOTE_CONTROLS, REMOTE_INFO_PATH,
  SECOND_TAP_MIN_MS, tempoFromValue, valueFromTempo, valueFromVelocity,
  type RemoteControlName, type RemoteMessage, type RemoteState, type RemoteTriggerName,
} from '../../remote/protocol';
import { BUILD_ID } from '../../remote/buildId';
import { rotateCorners } from '../../tracking/boardDetect/orientation';
import { alikePairs, applyDetectedColours } from './boardSequencer/applyDetectedColours';
import type { BoardSquares } from '../../tracking/boardGrid';
import type { ControlsResult } from '../../tracking/controlCounters';
import type { FaderRole, ControlRemoval } from '../../profiles/BoardSequencerConfig';

/**
 * How close two swatches must be to be the same counter colour. Comfortably inside the
 * distance between, say, red and orange counters, so re-running Find colours updates a
 * colour rather than duplicating it.
 */

/** Reserved space under a control, so a disabled reason never shifts the layout. */
/** How the camera picture is turned and flipped, from the saved settings. */
const orientationOf = (c: Pick<BoardSequencerStored, 'mirrorX' | 'mirrorY' | 'cameraRotation'>): FrameOrientation => ({
  mirrorX: c.mirrorX, mirrorY: c.mirrorY, rotation: c.cameraRotation,
});

const REASON_STYLE = { display: 'block', minHeight: 14, fontSize: 14, opacity: 0.7 } as const;

const REMOVAL_LABELS: { value: ControlRemoval; label: string }[] = [
  { value: 'hold', label: 'Hold the last value' },
  { value: 'zero', label: 'Drop to the lowest value' },
  { value: 'default', label: 'Return to the saved value' },
];
import { BoardSequencerMode, type PieceColour, type ActiveCell } from '../../tracking/BoardSequencerMode';
import { counterColourFromRegion, rgbToHsv } from '../../tracking/ColorTracker';
import {
  calibrationFromHsv,
  describeChannel, freshChannelId, recalibratedChannel, isFaderRole, hueName, ROLE_LABELS,
  type ColourChannel, type ColourId, type ColourKind, type ColourRole,
} from '../../tracking/boardColours';
import { BoardSequencerEngine } from '../../songs/BoardSequencerEngine';
import { SongPresetEngine } from '../../songs/SongPresetEngine';
import { SONG_LIBRARY, type SongConfig } from '../../songs/songLibrary';
import { getChordAtTime } from '../../songs/voices/chordLookup';
import { applyHomography, type Mat3 } from '../../utils/homography';
import { SCALE_PRESETS, NOTE_NAMES } from '../../songs/boardSequencerScale';
import { clearLoopSlot, emptyLoopBank, seedLoopBank } from '../../songs/loopBank';
import {
  CONTROL_RANGE_LIMITS, clampToControl, DEFAULT_BOARD_SEQUENCER_CONFIG, NEW_PLAYER_SOUND, type BoardSequencerStored, type BoardPoint, type StoredLoopCell,
  isSafeShowLayout, safeShowLayout,
} from '../../profiles/BoardSequencerConfig';
import {
  loadActiveBoardConfig as loadBoardSequencerConfig, saveActiveBoardConfig as saveBoardSequencerConfig,
  allReferencedChannelIds, savedPlayersWork,
} from '../../profiles/BoardProfiles';
import LoopBankView from '../components/board/LoopBankView';
import HelpDialog from './boardSequencer/components/HelpDialog';

// Polyrhythm roles: each colour/role can loop at its own length (0 = full grid).
const POLY_ROLES: {
  role: 'red' | 'black' | 'blue';
  field: 'loopStepsRed' | 'loopStepsBlack' | 'loopStepsBlue';
  label: string;
}[] = [
  { role: 'red', field: 'loopStepsRed', label: 'Melody' },
  { role: 'black', field: 'loopStepsBlack', label: 'Drums' },
  { role: 'blue', field: 'loopStepsBlue', label: 'Bass' },
];

/** Overlay tint from a channel swatch hex at a strong/weak alpha. */
/** The settings the engine plays with: the player's own, or only what a New loop allows. */
function forEngine(cfg: BoardSequencerStored, nl: NewLoopState | null): BoardSequencerStored {
  if (!nl) return cfg;
  const s = engineSettingsFor(nl, cfg);
  return { ...cfg, band: s.band, fillAmount: s.fillAmount, evolveAmount: s.evolveAmount };
}

function colourTint(hex: string, strong: boolean): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  const r = m ? parseInt(m[1], 16) : 200;
  const g = m ? parseInt(m[2], 16) : 200;
  const b = m ? parseInt(m[3], 16) : 200;
  return `rgba(${r},${g},${b},${strong ? 0.6 : 0.32})`;
}

/** Average RGB → CSS hex (for a channel swatch). */
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface DetStats {
  /** Live count of settled pieces per colour channel id. */
  byColour: Partial<Record<ColourId, number>>;
  settled: number;
}

/** What the next camera click calibrates: a brand-new channel, or an existing one. */
type ColourCalibTarget = { mode: 'new' } | { mode: 'recal'; id: ColourId };

/** The colour the last calibration click read, shown in the camera check readout. */
interface LastColourSample {
  hex: string;
  /** Where on the picture it was read from, so the player can SEE what was sampled. */
  at?: { x: number; y: number };
  h: number;
  s: number;
  v: number;
  kind: ColourKind;
  /** True when the band can't be narrowed enough to stop matching the board itself. */
  unsafe?: boolean;
  /** The counter's own pixels around the tap, so its band is fitted to all of it. */
  pixels?: { h: number; s: number; v: number }[];
  /** Share of those pixels the fitted band recognises. */
  keeps?: number;
}

/** No camera frame for this long while playing: the camera has stopped. */
const CAMERA_STALL_MS = 1500;
/** How long a cue stays large in the Now / Next strip. */
const CUE_SHOWN_MS = 5000;
/** Config saves are gathered over this long (and written at once when the page closes). */
const SAVE_GATHER_MS = 400;
/** How long Show says "Keep this window in front" once the audience screen is open. */
const KEEP_IN_FRONT_MS = 12_000;
/**
 * A start that runs the piece's clock: from where (seconds into the piece) and, carrying on
 * after a reload, when the piece first started (Date.now()) and the scene that was on.
 */
interface PieceStart { fromSec: number; startedAt?: number; scene?: number | null }
/**
 * How long before its end this piece's ending begins, at the slowest tempo it can be at: the
 * player's own, any scene's, and the hat's Slowest when the hat is on Speed.
 */
const endingLeadOf = (c: BoardSequencerStored): number => pieceEndingLeadSec(
  c.performance, c.cols * Math.max(1, c.numPages), pieceSpeeds(c),
);
/** The side panel: 400 px, growing with the window to 480 px (A3). */
const SIDE_PANEL_WIDTH = 'clamp(400px, 30vw, 480px)';
/** The status lines' fixed strip under the board: three short lines (A3). */
const STATUS_LINES_HEIGHT = 56;
/** Where Play / Make a piece is remembered. */
const WORKSPACE_KEY = 'admi-board-workspace';
/** How often a take being played is kept (storage/sessionArchive). */
const TAKE_SAVE_MS = 5000;
const REMOTE_ENABLED_KEY = 'admi-remote-enabled';
const REMOTE_CODE_KEY = 'admi-remote-code';
const REMOTE_CONTROL_WORDS: Record<RemoteControlName, string> = {
  // The laptop's words, so the iPad, the laptop and Help say the same thing.
  tempo: 'Speed', dynamics: 'Dynamics', fill: 'Extra notes', evolve: 'Sounds change',
};
const REMOTE_TRIGGER_WORDS: Record<RemoteTriggerName, string> = {
  newIdea: WORDS.newIdea, newSound: WORDS.newSound, keep: WORDS.keep, mute: 'Mute', stopAll: WORDS.stopLoops,
  endPiece: 'End piece', capture: 'Capture',
};
/** How often the performance clock is read. */
const CLOCK_TICK_MS = 250;
/** How long "iPad: Speed 96 BPM" stays on screen (a notice: at least 5 s, A7). */
const REMOTE_NOTE_MS = noticeMs(2500);
/**
 * How long an iPad page has to say which build it is. One that says nothing by then is too
 * old to know about builds (from before they were compared), so it is out of date.
 */
const HELLO_WAIT_MS = 4000;
/** How long "New sounds" / "Band joins" stays on the board (at least 5 s, A7). */
const BOARD_NOTICE_MS = noticeMs(2500);

/** What the player is told about where the fill is coming from. */
const FILL_STATUS_TEXT: Record<FillSourceStatus, string> = {
  rules: 'Ideas from the simple rules.',
  loading: 'Loading the AI (first time only, a few seconds)… simple rules play meanwhile.',
  thinking: 'The AI is thinking of an idea for this board…',
  ai: 'Ideas from Magenta AI, fitted around your notes.',
  offline: 'The AI could not load (no internet?), so the simple rules are playing.',
};

/** Radius, in camera pixels, of the disc around a tap taken as "the counter's pixels". */
const TAP_PIXEL_RADIUS = 6;

/** Keeping time: how often the laptop looks at the meter, and how often the log gets a sample. */
const KEEPING_TIME_POLL_MS = 500;
const TIMING_SAMPLE_MS = 30_000;
/** A run shorter than this says nothing about keeping time: the Ready check keeps the last longer one. */
const KEEPING_TIME_MIN_RUN_SEC = 5;

/** Keeping time as the screen shows it: the meter, and what the safety valve has paused. */
interface TimeView { report: KeepingTimeReport; valve: readonly ValveStep[] }

/** Only what the screen shows: a healthy run never re-renders the screen for this. */
function timeViewKey(v: TimeView | null): string {
  if (v === null) return '';
  const r = v.report;
  return `${r.behind}|${r.everBehind}|${r.drifting}|${r.lateBeats}|${r.skippedBeats}|${r.lostSec.toFixed(1)}|${r.driftSec.toFixed(1)}|${v.valve.join()}`;
}

/** A camera message: the saved camera is missing, or the camera was just changed. */
interface CameraNotice {
  kind: 'fallback' | 'changed';
  text: string;
}

export default function BoardSequencerScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const uiSize = useAppStore((s) => s.uiSize);
  const setUISize = useAppStore((s) => s.setUISize);
  const announce = useAppStore((s) => s.announce);
  // The red cap: its own camera facing the player; its values merge into the controls.
  const capValuesRef = useRef<Partial<Record<FaderRole, number>>>({});
  const capPointerRef = useRef<{ x: number; y: number } | null>(null);
  // What the board is doing, so the cap holds still while counters are being moved.
  const boardActivityRef = useRef<BoardActivity>({ lastChangeMs: null, handSinceMs: null });
  /** New loop in progress (state further down); the runtime reads it every frame to silence leftover counters. */
  const newLoopRef = useRef<NewLoopState | null>(null);
  /**
   * The performance clock: when it started (performance.now(); null = not running). Here, as
   * the runtime reads it every frame: a colour that comes in later is silent until its time.
   */
  const clockStartRef = useRef<number | null>(null);
  /** When the piece's clock last started on this page (performance.now), for ■ Stop's 2 s guard (B3). */
  const pieceStartedAtRef = useRef<number | null>(null);
  /**
   * The speed a scene (or the start of the piece, or the player) set lately, maybe still
   * gliding to it; null = the config's. What the hat on Speed moves around.
   */
  const speedGlideRef = useRef<SpeedGlide | null>(null);
  /** The glide's last step has been sent (or there is nothing to step). */
  const glideLandedRef = useRef(true);
  /** The speed in force without the hat, now: a glide's, or the config's (the scene's in a run, else the player's own). */
  const tempoCentreRef = useRef<() => number>(() => DEFAULT_BOARD_SEQUENCER_CONFIG.bpm);
  /** The colours waiting for their time at the last clock tick (null = not looked yet this run). */
  const waitingIdsRef = useRef<Set<string> | null>(null);
  // The board camera actually in use: the cap must never take it.
  const [camInfo, setCamInfo] = useState<CameraTrackInfo | null>(null);
  const [capMouse, setCapMouse] = useState(false);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const startSecRef = useRef(0);

  const storedRef = useRef<BoardSequencerStored | null>(loadBoardSequencerConfig());
  const [config, setConfig] = useState<BoardSequencerStored>(
    // A first run is a new player: it starts generative (NEW_PLAYER_SOUND). A saved one keeps
    // its own. "Play on the laptop" on Welcome opens on the laptop board, whichever was last.
    () => {
      const start = storedRef.current ?? { ...DEFAULT_BOARD_SEQUENCER_CONFIG, ...NEW_PLAYER_SOUND };
      return laptopRequestedOnOpen() ? { ...start, boardSource: 'laptop' } : start;
    },
  );
  // Corners the board tracker has moved since the last save. They must survive a render,
  // so they are merged into the ref the runtime reads rather than living in React state
  // (which is only written every few seconds).
  const trackedCornersRef = useRef<BoardSequencerStored['corners'] | null>(null);
  const configRef = useRef(config);
  configRef.current = trackedCornersRef.current
    ? { ...config, corners: trackedCornersRef.current }
    : config;
  tempoCentreRef.current = () => {
    const g = speedGlideRef.current;
    return g ? glideBpmAt(g, performance.now()) : configRef.current.bpm;
  };

  // One place writes the config to storage. Doing it inside the state updaters made them
  // impure — React may run an updater twice, or discard its result, and the write would
  // happen anyway.
  const savedConfigRef = useRef(config);
  // Set while a backup file is being restored: the page reloads into it, and saving the
  // config still on screen in the meantime would write the old setup back over it.
  const restoringRef = useRef(false);
  // Which player this screen shows, set during render, so a save always lands on them.
  const activePlayerIdRef = useRef<string | null>(getActiveBoardPlayer()?.id ?? null);
  // Saves are gathered: an iPad strip changes the config many times a second, and writing
  // every player's loops each time competed with the sound for the main thread.
  const pendingSaveRef = useRef<{ config: BoardSequencerStored; playerId: string | null } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const flushSave = useCallback((): void => {
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const p = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!p || restoringRef.current) return;
    setSaveFailed(!saveBoardSequencerConfig(p.config, p.playerId));
    scheduleDiskSave();
  }, []);
  useEffect(() => {
    if (savedConfigRef.current === config || restoringRef.current) return;
    savedConfigRef.current = config;
    const playerId = activePlayerIdRef.current;
    // A change for a different player (a switch) writes the last one's first.
    if (pendingSaveRef.current && pendingSaveRef.current.playerId !== playerId) flushSave();
    // While a run holds the player's own settings, theirs are saved, never the scene's.
    pendingSaveRef.current = { config: withOwnSettings(config, homeSettingsRef.current), playerId };
    if (saveTimerRef.current === null) saveTimerRef.current = window.setTimeout(flushSave, SAVE_GATHER_MS);
  }, [config, flushSave]);
  // Another tab of ADMI is open. Only one tab saves (src/storage/tabSaving.ts): any other
  // shows why and nothing else. Each tab says hello on a shared channel; this one hears
  // the other and says so on screen. (Without Web Locks both would save: then it warns.)
  const [otherTab, setOtherTab] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(TABS_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      if (e.data === 'hello') { setOtherTab(true); ch.postMessage('here'); }
      else if (e.data === 'here') setOtherTab(true);
      else if (e.data === 'bye') setOtherTab(false);
    };
    ch.postMessage('hello');
    const bye = (): void => ch.postMessage('bye');
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); bye(); ch.close(); };
  }, []);
  useEffect(() => {
    window.addEventListener('pagehide', flushSave);
    return () => { window.removeEventListener('pagehide', flushSave); flushSave(); };
  }, [flushSave]);

  // True while the chosen camera couldn't be found and the default is standing in.
  const fellBackRef = useRef(false);
  // Bumped by "Try again" to reopen the saved camera without changing the choice
  // (it's already selected, so the dropdown can't re-pick it).
  const [cameraRetry, setCameraRetry] = useState(0);
  // The requested picture size. Kept with the camera choice (a property of this DEVICE,
  // not of the player), because which size works is part of "which camera setup works".
  const [resolution, setResolution] = useState(() => {
    const c = loadCameraChoice();
    return { width: c.width, height: c.height };
  });

  // Not-yet-calibrated is a first-class state. It comes from the config itself
  // (`enabled` is only true once corners have been clicked and saved), so a
  // setting saved before calibrating can't make the board look ready.
  const calibrated = config.enabled;
  // The laptop board: counters placed by clicking, no camera and no physical board.
  const laptop = config.boardSource === 'laptop';
  // The camera stopped sending pictures mid-piece (unplugged, crashed, asleep): the music
  // plays on from the last pattern, but the board is no longer being read — say so.
  const [cameraStalled, setCameraStalled] = useState(false);
  // The page reloaded (a crash, a mistaken refresh) while a piece was playing: offer to
  // pick it up where the clock would be now, in the scene on at that moment — only while
  // its ending has not begun and is still more than a few seconds off. Otherwise the piece
  // has ended: a fade can't be picked up where it was, and starting it again was louder
  // and ran past the end (R2-T3-01), or forgot End (R2-T3-02).
  const [reloadAtOpen] = useState(() => {
    const p = readPieceRunning();
    return { p, offer: reloadOffer(p, Date.now(), endingLeadOf(storedRef.current ?? DEFAULT_BOARD_SEQUENCER_CONFIG)) };
  });
  const [resumeFrom, setResumeFrom] = useState<PieceRunning | null>(() => (reloadAtOpen.offer === 'carryOn' ? reloadAtOpen.p : null));
  const [endedNotice, setEndedNotice] = useState(() => reloadAtOpen.offer === 'ended');
  const carryOnRef = useRef<HTMLButtonElement | null>(null);
  const endedLineRef = useRef<HTMLDivElement | null>(null);
  // How the corner editor was opened: 'tap' starts from nothing, 'review' checks corners
  // that already exist. "Tap corners myself" must mean tapping, even for a board that is
  // already set up.
  const [calibrating, setCalibrating] = useState<'tap' | 'review' | null>(null);

  // The runtime owns the camera, the per-camera-frame detection loop and the rAF draw
  // loop; this screen supplies the callbacks below and drives start/stop through its refs.
  const callbacksRef = useRef<BoardRuntimeCallbacks>(NOOP_RUNTIME_CALLBACKS);
  const {
    videoRef, cameraRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef, activeCellsRef,
    dismiss, letGoGhosts, knockRef, latestFrameRef, lastFrameAtRef,
  } = useBoardRuntime({
    cameraDeviceId: config.cameraDeviceId, cameraRetry, calibrated, laptop, configRef, callbacksRef, capValuesRef, boardActivityRef, newLoopRef,
    pieceClockRef: clockStartRef,
  });
  /** Something else sets the speed now: a Speed counter on the board, or the hat on Speed. */
  const speedOwnedElsewhere = (): boolean =>
    capValuesRef.current.tempo !== undefined || latestFrameRef.current?.controls.values.tempo !== undefined;
  /**
   * A scene's speed (or the opening's): at once, or gradually over `glideSec` while the board
   * plays, from the speed in force now. The hat on Speed moves around the gliding speed; a
   * Speed counter on the board still wins. So the engine is set here only when neither does.
   */
  const setSceneSpeed = (to: number, glideSec: number | undefined): void => {
    const now = performance.now();
    const engine = engineRef.current;
    const owned = speedOwnedElsewhere();
    const from = owned || !engine ? tempoCentreRef.current() : engine.getBpm();
    speedGlideRef.current = startGlide(from, to, runningRef.current ? glideSec : 0, now);
    glideLandedRef.current = false;
    if (!owned) engine?.setBpm(glideBpmAt(speedGlideRef.current, now));
  };
  /** The player's own speed, set on the laptop or the iPad: it holds from now, and a glide under way ends. */
  const holdSpeed = (bpm: number): void => {
    speedGlideRef.current = startGlide(bpm, bpm, 0, performance.now());
    glideLandedRef.current = true;
  };
  const cap = useCapTracker({
    settings: config.cap,
    ranges: config.controlRanges,
    startValues: { volume: config.volume, tempo: config.bpm, fill: config.fillAmount, evolve: config.evolveAmount },
    mouse: capMouse,
    pointerRef: capPointerRef,
    valuesRef: capValuesRef,
    onReachLearnt: (reachX, reachY) => {
      update({ cap: { ...configRef.current.cap, reachX, reachY } });
      announce(reachX || reachY ? 'Your range is learnt.' : 'The cap hardly moved, so the whole picture stays the range. Try again, moving a little further.');
    },
    boardCameraId: (!laptop && camInfo?.deviceId) || config.cameraDeviceId,
    activityRef: boardActivityRef,
    tempoCentreRef,
    onSideLearnt: (sideArc) => {
      if (sideArc) update({ cap: { ...configRef.current.cap, sideArc } });
      announce(sideArc ? 'Your side to side is learnt.' : 'The cap didn\u2019t move far enough sideways to learn it. Try again, a little further each way.');
    },
    // Learn the hat: a hat good enough to use is kept for this player; otherwise nothing changes.
    onHatLearnt: (result, learntHat) => {
      if (learntHat) update({ cap: { ...configRef.current.cap, learntHat } });
      announce(hatResultText(result));
    },
  });
  // Colour calibration armed for the next camera click: add a new channel, or
  // recalibrate an existing one (null = not calibrating).
  const [colourCalib, setColourCalib] = useState<ColourCalibTarget | null>(null);
  const colourCalibRef = useRef<ColourCalibTarget | null>(null);
  colourCalibRef.current = colourCalib;
  const [active, setActive] = useState<ActiveCell[]>([]);
  // Live control-counter values, for the legend (‖ = the counter is away, value held).
  const [controlState, setControlState] = useState<ControlsResult | null>(null);

  // Guided Set up vs Play, resolved once from the config alone: routing never moves the
  // player on its own. A board that is set up opens on Play (a reload mid-piece too, where
  // "Carry on" is); the Welcome screen can ask for Set up instead.
  const [view, setView] = useState<BoardScreenView>(() => {
    const v = openingView(
      storedRef.current,
      { setupRequested: setupRequestedOnOpen(), pieceRunning: reloadAtOpen.p !== null, laptopRequested: laptopRequestedOnOpen() },
    );
    // A piece that has ended across the reload comes back where it was: Show, if Show was open.
    return v === 'play' && reloadAtOpen.offer === 'ended' && reloadAtOpen.p?.show === true ? 'bigBoard' : v;
  });
  // The counter a click on the laptop board puts down.
  const [laptopColour, setLaptopColour] = useState('');
  const [chosenStep, setStep] = useState<SetupStep>(() => resolveEntry(
    { enabled: storedRef.current?.enabled ?? false, channels: storedRef.current?.channels ?? [] },
    storedRef.current !== null,
  ));
  // The laptop board has no camera or board step: whatever sent it to one (a new player,
  // a switch of board), it shows the colours.
  const step = stepOnBoard(chosenStep, laptop);
  useEffect(() => {
    // "Play on the laptop" for a saved player: keep the switch, as the header's would. (A
    // first run saves it with the first change, once the player is named.)
    if (laptopRequestedOnOpen() && storedRef.current !== null && storedRef.current.boardSource !== 'laptop') {
      setConfig((prev) => ({ ...prev, boardSource: 'laptop' }));
    }
    clearSetupRequest();
  }, []);
  const [players, setPlayers] = useState<BoardPlayerProfile[]>(() => listBoardPlayers());
  const [activePlayer, setActivePlayerState] = useState<BoardPlayerProfile | null>(() => getActiveBoardPlayer());
  activePlayerIdRef.current = activePlayer?.id ?? activePlayerIdRef.current;
  // Who's playing: asked on the very first run — name and hand — rather than silently
  // making a right-handed "Player 1" (Tim is left-handed), and when no player is
  // remembered. Otherwise the last player plays again; the header's button switches.
  const [chooserOpen, setChooserOpen] = useState(() => askWhoIsPlaying(
    listBoardPlayers().map((p) => p.id), rememberedBoardPlayerId(),
  ));
  // The chooser covers the screen: what's behind it is out of reach while it is open.
  const chooserRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => (chooserOpen && chooserRef.current ? inertOutside(chooserRef.current) : undefined), [chooserOpen]);
  // The first save creates an implicit "Player 1". Without picking it up, the Player button
  // never appears and every screen keeps calling them "the player".
  useEffect(() => {
    if (activePlayer !== null) return;
    const active = getActiveBoardPlayer();
    if (!active) return;
    setPlayers(listBoardPlayers());
    setActivePlayerState(active);
  }, [config, activePlayer]);

  const [pendingColour, setPendingColour] = useState<LastColourSample | null>(null);
  const [squarePicker, setSquarePicker] = useState<{ row: number; col: number } | null>(null);
  const [handCheck, setHandCheck] = useState<{ checking: boolean; result: string | null }>(
    { checking: false, result: null },
  );
  // Find board: a short burst, then a proposal the player confirms. Never while playing.
  const [finding, setFinding] = useState(false);
  const [proposal, setProposal] = useState<BoardDetection | null>(null);
  const findAbortRef = useRef<AbortController | null>(null);
  // A returning session's quiet look at the board: is it where its corners say?
  const boardCheckAbortRef = useRef<AbortController | null>(null);
  const boardCheckedRef = useRef(false);
  const [boardCheck, setBoardCheck] = useState<'checking' | 'found' | 'moved' | 'unsure' | null>(null);
  // Find colours: detected colours the player confirms, never saved on their own.
  const [findingColours, setFindingColours] = useState(false);
  const [colourProposal, setColourProposal] = useState<{ colours: DetectedColour[]; message: string } | null>(null);
  // A ref, so the sampling interval always reads the current colours.
  const channelNameRef = useRef<(id: ColourId) => string>((id) => id);
  const [showHelp, setShowHelp] = useState(false);
  /** Non-null while an engine is being built, so Play can't be pressed twice. */
  const startingRef = useRef<number | null>(null);
  const lastCornerSaveRef = useRef(0);
  /** The running hand-check poll, so it can be stopped on unmount or a re-run. */
  const handCheckRef = useRef<number | null>(null);
  const bigBoardRef = useRef<HTMLDivElement | null>(null);
  const bigBoardButtonRef = useRef<HTMLButtonElement | null>(null);
  // Play-side visuals, all read from audible time so they match what is heard.
  // The notes sounding now: every frame for the board drawing, through a store (see
  // popStore.ts); the screen itself only hears when WHAT is sounding changes.
  const popStoreRef = useRef<PopStore | null>(null);
  if (!popStoreRef.current) popStoreRef.current = createPopStore();
  const popStore = popStoreRef.current;
  const [pops, setPops] = useState<Pop[]>([]);
  const [latestFrame, setLatestFrame] = useState<RuntimeFrame | null>(null);
  const shownKeysRef = useRef({ frame: '', controls: '', active: '', stats: '' });
  const [liveBpm, setLiveBpm] = useState(0);
  /** A scene gliding to its speed: the speed it is on its way to, for the status line. */
  const [glideTo, setGlideTo] = useState<number | null>(null);
  /** The colours waiting for their time in the piece now, earliest first (from the clock's tick). */
  const [waitingNow, setWaitingNow] = useState<string[]>([]);
  const [beatOn, setBeatOn] = useState(false);
  const [isVarLap, setIsVarLap] = useState(false);
  const [pingDir, setPingDir] = useState(0);
  const [nudge, setNudge] = useState<NudgeSignal | null>(null);
  const firedRef = useRef<FiredNote[]>([]);
  // The audience screen (src/audience): a window of its own for the projector. Notes wait
  // here until they are heard, then bloom there.
  const audience = useAudienceWindow();
  const audiencePendingRef = useRef<FiredNote[]>([]);
  // The drawing loop feeds the audience screen; when the browser stops that loop (the window
  // covered or minimised) a timer does, so blooms, the scene and the hat keep coming (B6).
  const lastDrawAtRef = useRef<number | null>(null);
  const lastAudienceFrameRef = useRef<RuntimeFrame['frame'] | null>(null);
  const feedAudienceRef = useRef<(frame: RuntimeFrame['frame'] | null, drained: FiredNote[], nowMs: number) => void>(() => {});
  useEffect(() => {
    const id = window.setInterval(() => {
      const nowMs = performance.now();
      if (!drawStalled(document.hidden, nowMs, lastDrawAtRef.current)) return;
      if (!audience.feedRef.current?.alive(nowMs)) return;
      // The notes the engine scheduled since: kept in the session log as the drawing loop would.
      const engine = engineRef.current;
      const drained = engine ? engine.drainFiredNotes() : [];
      if (drained.length > 0) sessionLogRef.current.addNotes(drained);
      feedAudienceRef.current(lastAudienceFrameRef.current, drained, nowMs);
    }, 50);
    return () => window.clearInterval(id);
  }, [audience.feedRef, engineRef]);
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [playheadCol, setPlayheadCol] = useState(0);
  // Pattern chaining: which page the live camera edits, and which is playing now.
  const [selectedPage, setSelectedPage] = useState(0);
  const selectedPageRef = useRef(0);
  selectedPageRef.current = selectedPage;
  const [playingPage, setPlayingPage] = useState(0);
  const [running, setRunning] = useState(false);
  // Play pressed, the sound still starting (samples loading): the iPad takes loop taps now.
  const [starting, setStarting] = useState(false);
  // The MIDI port (Ableton), watched for the whole screen; see "Sound from Ableton" below.
  const midiPort = useBoardMidiPort(config.midiEnabled, config.midiDeviceId);
  const [midiHold, setMidiHold] = useState(false);
  const midiPortRef = useRef<MidiPortState>({ portConnected: false, holdOnAdmi: false });
  midiPortRef.current = { portConnected: midiPort.connected, holdOnAdmi: midiHold };
  const midiPortLive = `${midiPort.connected}|${midiHold}`;
  /**
   * New loop: composing from silence. While it is set the engine plays only what
   * engineSettingsFor allows (never the player's band, Extra notes or Sounds change), and
   * the loop being heard alongside goes through pushLaunch. Never saved.
   */
  const [newLoop, setNewLoop] = useState<NewLoopState | null>(null);
  newLoopRef.current = newLoop;
  // The running engine follows the config whenever it changes — a scene, the iPad, a
  // tab — whether or not camera frames are arriving.
  useEffect(() => {
    if (engineRef.current) applyEngineSettings(engineRef.current, forEngine(configRef.current, newLoop), midiPortRef.current);
  }, [config, running, engineRef, configRef, midiPortLive, newLoop]);
  // Watchdog: no camera frame for a moment while playing means the camera has stopped.
  useEffect(() => {
    if (!running || laptop) { setCameraStalled(false); return; }
    lastFrameAtRef.current = performance.now();
    const id = window.setInterval(() => {
      setCameraStalled(performance.now() - lastFrameAtRef.current > CAMERA_STALL_MS);
    }, 500);
    return () => window.clearInterval(id);
  }, [running, laptop, lastFrameAtRef]);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** A sound problem (backing song, audio engine). Never a camera problem. */
  const [soundError, setSoundError] = useState<string | null>(null);
  /** Glare / too dark / uneven — the faults that make the board's own colour look like a counter. */
  const [lighting, setLighting] = useState<LightingProblem>(null);
  /** A saved loop the player has asked to clear, waiting on the confirmation. */
  const [clearSlotTarget, setClearSlotTarget] = useState<number | null>(null);
  // Camera choice + camera check: available cameras, what the running one delivers,
  // a notice (chosen camera missing / just switched), how colourful the frames the
  // app READS are, and the colour the last calibration click captured.
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [camNotice, setCamNotice] = useState<CameraNotice | null>(null);
  const [feedSaturation, setFeedSaturation] = useState<number | null>(null);
  // Latched (hysteresis) so the black-and-white warning can't flicker/re-announce.
  const [feedColourless, setFeedColourless] = useState(false);
  const [lastSample, setLastSample] = useState<LastColourSample | null>(null);
  // The fill as the board draws it, and the idea before the last "New idea" (for Back).
  const [fillMarks, setFillMarks] = useState<{ row: number; col: number; colour: ColourId }[]>([]);
  const [fillCount, setFillCount] = useState(0);
  const [fillStatus, setFillStatus] = useState<FillSourceStatus>('rules');
  const [bandStatus, setBandStatus] = useState<{ level: BandLevel; playing: boolean; parts: BandPart[] }>({ level: 'off', playing: false, parts: [] });
  // The session log: kept while the board runs, saved when the facilitator asks.
  const sessionLogRef = useRef(new SessionLog());
  // Every take kept in the browser as it is played (storage/sessionArchive): a reload,
  // Exit or a new Play no longer throws the research data away.
  const archiveRef = useRef<SessionArchive | null>(null);
  if (!archiveRef.current) archiveRef.current = createSessionArchive(indexedDbTakeStore());
  const [takes, setTakes] = useState<TakeSummary[]>([]);
  const keepTake = useCallback(async (): Promise<void> => {
    const archive = archiveRef.current;
    if (!archive) return;
    await archive.save(sessionLogRef.current.toJSON());
    setTakes(await archive.list());
  }, []);
  useEffect(() => {
    // After a reload: the last take is back, ready to save, until the next Play.
    let alive = true;
    void (async () => {
      const archive = archiveRef.current;
      if (!archive) return;
      const list = await archive.list();
      if (!alive) return;
      setTakes(list);
      const log = sessionLogRef.current;
      if (list.length > 0 && !log.isRunning() && log.counts().notes === 0) {
        const data = await archive.load(list[0].key);
        if (!alive || !data || sessionLogRef.current.isRunning()) return;
        sessionLogRef.current = SessionLog.fromJSON(data);
        setLogCounts(sessionLogRef.current.counts());
      }
    })();
    // While playing, the take is kept every few seconds.
    const id = window.setInterval(() => { if (sessionLogRef.current.isRunning()) void keepTake(); }, TAKE_SAVE_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [keepTake]);
  const logActorRef = useRef<LogActor>('laptop');
  const [logCounts, setLogCounts] = useState({ notes: 0, placed: 0, added: 0, events: 0 });
  // A change that was only heard, shown on the board for a moment (deaf and HoH players).
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const bandPlayingRef = useRef(false);
  // Keeping time (spec 2026-10-28): the meter while the board plays, the last run's result
  // for the Ready check, what has been said this run, and the owner's Simplify.
  const [timeNow, setTimeNow] = useState<TimeView | null>(null);
  const [lastRunTime, setLastRunTime] = useState<TimeView | null>(null);
  const timeSeenRef = useRef<TimeSeen>(TIME_SEEN_NONE);
  const timingLoggedAtRef = useRef(0);
  const [simplify, setSimplify] = useState<'off' | 'on' | 'leaving'>('off');
  // The loop still playing under the player while simplified, by its slot (B23).
  const [simplifyBed, setSimplifyBed] = useState<number | null>(null);
  // Launched loops (no pad needed): what is wanted, and what the engine has applied so far.
  const wantedRef = useRef<Set<number>>(new Set());
  const [wantedSlots, setWantedSlots] = useState<number[]>([]);
  const [appliedSlots, setAppliedSlots] = useState<number[]>([]);
  const [editSlot, setEditSlot] = useState<number | null>(null);
  /** The edit window's Copy the board button, pressed once over a loop that has notes. */
  const [copyArmed, setCopyArmed] = useState(false);
  // The laptop's copy of the saved loops (src/storage/diskSync.ts), and a backup file
  // waiting for "Restore" to be confirmed.
  const [disk, setDisk] = useState(diskState);
  useEffect(() => onDiskState(() => setDisk(diskState())), []);
  const [restoreTarget, setRestoreTarget] = useState<BoardBackup | null>(null);
  // Undo for anything that throws work away — the board cleared, a loop cleared, the
  // scenes replaced by a plan — for a while afterwards, the same way every time.
  const [undoOffer, setUndoOffer] = useState<{ text: string; restore: () => void } | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  /**
   * The Undo line goes, pressed or run out: focus on its Undo moves first to ▶ Play / ■ Stop
   * (Show itself in Show), so it never falls to the page with the line.
   */
  const dropUndoOffer = (): void => {
    const undo = undoButtonRef.current;
    if (undo !== null && document.activeElement === undo) (document.getElementById(PLAY_STOP_ID) ?? bigBoardRef.current)?.focus();
    setUndoOffer(null);
  };
  useEffect(() => {
    if (!undoOffer) return;
    const id = window.setTimeout(dropUndoOffer, undoMs(configRef.current.pressAgainSec));
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dropUndoOffer reads refs only
  }, [undoOffer]);
  // "Clear it" in the question about clearing a loop: the question goes, and so does the ✕
  // that asked it. Focus goes to Undo, its opposite, as after Delete scene, not to the
  // heading at the top of the page (R2-T1-04). Set on Clear it, read once the question has
  // gone (its own focus-return runs first).
  const focusUndoRef = useRef(false);
  useEffect(() => {
    if (!focusUndoRef.current || clearSlotTarget !== null) return;
    focusUndoRef.current = false;
    undoButtonRef.current?.focus();
  }, [clearSlotTarget, undoOffer]);
  // The scene just deleted, for Undo: one tap next to Go must be reversible.
  const [deletedScene, setDeletedScene] = useState<{ scene: BoardSequencerStored['scenes'][number]; index: number; wasCurrent: boolean } | null>(null);
  useEffect(() => {
    if (!deletedScene) return;
    const id = window.setTimeout(() => setDeletedScene(null), undoMs(configRef.current.pressAgainSec));
    return () => window.clearTimeout(id);
  }, [deletedScene]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  /** A backup file was saved this session (for the Ready check). */
  const backedUpRef = useRef(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  // The iPad strips the player has moved since the last scene: theirs until then.
  const stripsTouchedRef = useRef<Set<PlayerStrip>>(new Set());
  // The performance clock: what it shows, and what it has already done (cues given, scenes
  // brought in, the ending triggered). When it started is clockStartRef, near the top.
  const [clock, setClock] = useState<ClockView | null>(null);
  const clockPrevRef = useRef<{ remaining: number; elapsed: number }>({ remaining: Infinity, elapsed: 0 });
  const endingRef = useRef(false);
  // The automatic ending fires once per run: after "Cancel the ending" it must not fire again.
  const autoEndedRef = useRef(false);
  /** The end-time backstop has fired this run. */
  const hardStoppedRef = useRef(false);
  /** When the board last stopped, for ▶ Play's bounce guard. */
  const stoppedAtRef = useRef(-Infinity);
  /** When the piece last ended by itself (its ending rang out, or the end time came). */
  const pieceEndedAtRef = useRef(-Infinity);
  /** The piece has ended and no new one has started: the strip says "Ended" (A17). */
  const [pieceEnded, setPieceEnded] = useState(false);
  /**
   * A start pressed too soon starts nothing (startTooSoon): a bounce of Stop, or the second
   * press of a Stop the piece's own end overtook. Straight after the end it says so.
   */
  const startRefused = (): boolean => {
    const now = performance.now();
    if (!startTooSoon(now - stoppedAtRef.current, now - pieceEndedAtRef.current)) return false;
    if (now - pieceEndedAtRef.current < START_AFTER_PIECE_MS) announce('The piece has just ended.');
    return true;
  };
  /**
   * A start of the piece is loading (▶ Start the piece, ▶ Rehearse from here, Carry on): its
   * clock runs only once the sound is ready, and no loop is made meanwhile either (F2).
   */
  const pieceStartingRef = useRef(false);
  const [pieceStarting, setPieceStarting] = useState(false);
  // The player's own settings from before the piece (or a jump to a scene) began. Scenes
  // change tempo, sound and band as the piece runs; when it is over they come back, so a
  // rehearsal never leaves the player's settings wherever the last scene put them. While
  // it is set, these are what is saved (withOwnSettings), so a reload or a crash can't either.
  const homeSettingsRef = useRef<SceneSettings | null>(null);
  const [ending, setEnding] = useState(false);
  const clockTickRef = useRef<() => void>(() => {});
  // Counters as loops: the debounced view of each loop colour, and the slots they want.
  const loopColourRef = useRef(initialLoopColourState());
  const counterWantedRef = useRef<Set<number>>(new Set());
  const loopTickRef = useRef<number | null>(null);
  const pushLaunchRef = useRef<() => void>(() => {});
  /** Stop silences every loop too; stopAllLoops is defined further down, so Stop reaches it here. */
  const stopAllLoopsRef = useRef<() => void>(() => {});
  // What each colour sounds like now (Evolve), and the seed before "New sound" (for Back).
  const [evolveLabels, setEvolveLabels] = useState<Map<string, { label: string; scene: number }>>(new Map());
  const evolveSigRef = useRef('');
  const [prevEvolveSeed, setPrevEvolveSeed] = useState<number | null>(null);
  // The iPad remote: on/off and its pairing code belong to this laptop, not to a player.
  const [remoteEnabled, setRemoteEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(REMOTE_ENABLED_KEY) === '1'; } catch { return false; }
  });
  const [remoteCode, setRemoteCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(REMOTE_CODE_KEY);
      if (saved && /^\d{4}$/.test(saved)) return saved;
      // Kept from the first moment: a reload making a new code broke the iPad's link.
      const fresh = makeRemoteCode();
      localStorage.setItem(REMOTE_CODE_KEY, fresh);
      return fresh;
    } catch { /* storage unavailable: a fresh code each time */ }
    return makeRemoteCode();
  });
  const [remoteInfo, setRemoteInfo] = useState<{ addresses: string[]; port: number | null; lan: boolean } | null>(null);
  /** The last thing the iPad did, shown on screen for a moment so it is seen, not only heard. */
  const [remoteNote, setRemoteNote] = useState<{ text: string; at: number } | null>(null);
  /** "Use the safe show layout" was just pressed: say what it did. */
  const [safeLayoutSet, setSafeLayoutSet] = useState(false);
  // Learning the player's reach: the strips report raw finger positions until Done.
  const [reachLearning, setReachLearning] = useState(false);
  const reachSamplesRef = useRef<Record<RemoteControlName, number[]>>({ tempo: [], dynamics: [], fill: [], evolve: [] });
  // The link itself. Messages go to the handler defined with the Sound tab, through a ref,
  // so the hook always calls the current one.
  const remoteMsgRef = useRef<(msg: RemoteMessage) => void>(() => {});
  // The laptop's heartbeat is its latest state, said again every second, so the iPad knows
  // the laptop is reaching it even when nothing changes (B2).
  const remoteStateRef = useRef<RemoteState | null>(null);
  const remoteHeartbeat = useCallback((): RemoteMessage | null => (
    remoteStateRef.current ? { type: 'state', state: remoteStateRef.current } : null
  ), []);
  const remoteLink = useRemoteLink('host', remoteCode, remoteEnabled, (msg) => remoteMsgRef.current(msg), remoteHeartbeat);
  /** The iPad's End piece is waiting for its second tap (B20). */
  const [ipadEndArmed, setIpadEndArmed] = useState(false);
  // Is each iPad page this build? Whenever the number of iPad pages changes, the laptop
  // asks again (a new `ask` in its state) and waits for every page's hello. A page left
  // open in Safari from before an update reloads itself if it can; if it is still out of
  // date (or too old to answer), the laptop says so, never the iPad.
  const helloAskRef = useRef(0);
  const [helloAsk, setHelloAsk] = useState(0);
  const helloAnswersRef = useRef<(string | null)[]>([]);
  const [ipadPagesNow, setIpadPagesNow] = useState<'current' | 'outdated' | 'waiting'>('waiting');
  useEffect(() => {
    helloAnswersRef.current = [];
    setIpadPagesNow('waiting');
    if (!remoteEnabled || remoteLink.others === 0) return undefined;
    helloAskRef.current += 1;
    setHelloAsk(helloAskRef.current);
    const others = remoteLink.others;
    const t = window.setTimeout(() => setIpadPagesNow(ipadPages(others, helloAnswersRef.current, BUILD_ID, true)), HELLO_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [remoteEnabled, remoteLink.others]);
  const ipadOutOfDate = remoteEnabled && remoteLink.others > 0 && ipadPagesNow === 'outdated';
  useEffect(() => {
    if (!remoteEnabled) { setRemoteInfo(null); return; }
    let live = true;
    fetch(REMOTE_INFO_PATH)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { addresses: string[]; port: number | null; lan: boolean } | null) => { if (live && j) setRemoteInfo(j); })
      .catch(() => { if (live) setRemoteInfo({ addresses: [], port: null, lan: false }); });
    return () => { live = false; };
  }, [remoteEnabled]);
  useEffect(() => {
    if (!remoteNote) return;
    const id = setTimeout(() => setRemoteNote(null), REMOTE_NOTE_MS);
    return () => clearTimeout(id);
  }, [remoteNote]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => clockTickRef.current(), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (!boardNotice) return;
    const id = setTimeout(() => setBoardNotice(null), BOARD_NOTICE_MS);
    return () => clearTimeout(id);
  }, [boardNotice]);
  // Tell the iPad the real values, so its strips match even when the laptop changes them.
  useEffect(() => {
    if (!remoteEnabled || remoteLink.others === 0) return;
    const state: RemoteState = {
      values: {
        tempo: valueFromTempo(config.bpm),
        dynamics: valueFromVelocity(config.velocity),
        fill: config.fillAmount,
        evolve: config.evolveAmount,
      },
      labels: remoteLabels(config),
      kept: config.fillKept !== null || config.evolveHoldLap !== null,
      muted,
      playing: running,
      ...(starting && !running ? { starting: true } : {}),
      ...(pieceStarting && !running ? { pieceStarting: true } : {}),
      reach: config.remoteReach,
      ...(reachLearning ? { learning: true } : {}),
      loops: Array.from({ length: LAUNCH_SLOTS }, (_, i) => ({
        name: config.loopNames[i] ?? '',
        state: slotState(i, (config.loopSlots[i] ?? null) !== null, new Set(wantedSlots), new Set(appliedSlots)),
      })),
      scenes: config.scenes.map((s, i) => ({ name: s.name, active: config.currentScene === i })),
      shown: { strips: config.remoteStrips, pads: config.remotePads, loopsPage: config.remoteLoopsPage },
      locked: config.remoteLocked,
      stripMode: config.remoteStripMode,
      loopsFade: config.loopFadePasses > 0,
      ...(clock ? { clock: { text: clock.text, phase: clock.phase } } : {}),
      touch: config.remoteTouch,
      piece: (() => {
        const nn = nowNext(config.scenes, config.currentScene, clock && clock.phase !== 'idle' ? clock.elapsedSec : null);
        return { now: nn.now?.name ?? null, next: nn.next?.scene.name ?? null, nextIn: nn.next ? formatClock(nn.next.inSec) : null };
      })(),
      beat: running ? beatOn : false,
      build: BUILD_ID,
      ask: helloAsk,
      // Reloaded mid-piece: the iPad waits for Carry on, and nothing from it is taken (B19).
      ...(resumeFrom !== null && !running ? { carryOnWaiting: true } : {}),
      // The board's light or dark (A11); Show is always dark.
      theme: view === 'bigBoard' ? 'dark' : config.themeMode,
    };
    remoteStateRef.current = state;
    remoteLink.send({ type: 'state', state });
  }, [remoteEnabled, remoteLink.others, config.bpm, config.velocity, config.fillAmount, config.evolveAmount,
    config.fillKept, config.evolveHoldLap, muted, running, starting, pieceStarting, config.remoteReach, reachLearning,
    config.loopSlots, config.loopNames, config.scenes, config.currentScene, wantedSlots, appliedSlots,
    config.remoteStrips, config.remotePads, config.remoteLoopsPage, config.remoteLocked, config.remoteStripMode, config.loopFadePasses, clock,
    config.remoteTouch, beatOn, helloAsk, resumeFrom, view, config.themeMode]);
  // The iPad's End piece waits for at most its window (and a little for the link); it is
  // over when the piece stops or the iPad goes.
  useEffect(() => {
    if (!running || !remoteEnabled || remoteLink.others === 0) { setIpadEndArmed(false); return undefined; }
    if (!ipadEndArmed) return undefined;
    const t = window.setTimeout(() => setIpadEndArmed(false), config.remoteTouch.confirmSec * 1000 + 1000);
    return () => window.clearTimeout(t);
  }, [ipadEndArmed, running, remoteEnabled, remoteLink.others, config.remoteTouch.confirmSec]);
  const fillSigRef = useRef('');
  const [prevFillSeed, setPrevFillSeed] = useState<number | null>(null);

  // Optional backing song (Song Preset engine) the board can lock to.
  const songEngineRef = useRef<SongPresetEngine | null>(null);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [songStatus, setSongStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const songStatusRef = useRef<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  songStatusRef.current = songStatus;
  const [stats, setStats] = useState<DetStats>({ byColour: {}, settled: 0 });
  // Which controls-rail sections are expanded. Colours open by default (primary
  // task); Camera also opens first run so the corner-calibration step is visible.

  /** Patch the config and persist it (rig fields and player fields are routed on save). */
  const update = useCallback((patch: Partial<BoardSequencerStored>) => {
    sessionLogRef.current.setting(logActorRef.current, patch as Record<string, unknown>);
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
  }, []);

  // ---- Sound from Ableton: the MIDI port, watched all the time, and the fallback ----
  // A show can never go silent because of Ableton. If the port is not there while the
  // piece plays, ADMI's own sound takes over at once (applyEngineSettings applies the
  // rule) and stays until someone presses "Switch to Ableton", so the sound never jumps
  // twice in a piece.
  const soundFrom = configToSoundFrom(config);
  const [midiBanner, setMidiBanner] = useState<'lost' | 'back' | null>(null);
  useEffect(() => {
    if (soundFrom === 'admi') {
      setMidiHold(false);
      setMidiBanner(null);
      return;
    }
    // 'off' is the render just after Sound from changes to Ableton or Both, before MIDI is
    // asked for: the port is not lost, it simply has not been looked at yet.
    if (midiPort.support === 'unknown' || midiPort.support === 'off') return;
    if (!midiPort.connected) {
      if (running && !midiHold) {
        setMidiHold(true);
        setMidiBanner('lost');
        sessionLogRef.current.action('laptop', 'Ableton port gone: ADMI plays its own sound');
        announce("Ableton's port has gone, so ADMI is playing its own sound.");
      }
      return;
    }
    if (!midiHold) return;
    if (running) {
      setMidiBanner((b) => {
        if (b !== 'back') sessionLogRef.current.action('laptop', 'Ableton port back');
        return 'back';
      });
    } else {
      // Nothing is playing, so there is no jump to avoid.
      setMidiHold(false);
      setMidiBanner(null);
    }
  }, [soundFrom, midiPort.connected, midiPort.support, running, midiHold, announce]);
  const switchBackToAbleton = useCallback(() => {
    setMidiHold(false);
    setMidiBanner(null);
    sessionLogRef.current.action(logActorRef.current, 'switched back to Ableton');
    announce('Ableton is playing again.');
  }, [announce]);
  const midiPanic = useCallback(() => {
    // Works stopped too: a note can be left hanging in Ableton after Stop. Panic needs no
    // clock, so a sender with none will do.
    if (engineRef.current) engineRef.current.panicMidi();
    else new BoardMidiSender({ currentTime: 0 }).panic();
    sessionLogRef.current.action(logActorRef.current, 'MIDI panic');
    announce('Panic sent: every note off.');
  }, [announce, engineRef]);
  /**
   * What a colour chip under the board says it sounds like: ADMI's sound, or in Ableton
   * mode the MIDI channel and Ableton's chain ("MIDI ch 1 · Harp"); in Both, both.
   */
  const chipSound = (c: ColourChannel): string => {
    const own = soundNameFor(c, config.soundWorld);
    if (soundFrom === 'admi') return own;
    const ch = channelFor({ role: c.role, origin: 'placed', colour: c.id }, {
      channelMode: config.midiChannelMode,
      colourChannels: config.midiChannelMode === 'colour' ? colourChannelMap(config.channels) : undefined,
    });
    if (ch === null) return own;
    const chain = chainOnChannel(c, ch, config.soundWorld, { channelMode: config.midiChannelMode, loopChannels: config.midiLoopChannels });
    const ableton = `MIDI ch ${ch}${chain !== null ? ` · ${ABLETON_CHAINS[chain].name}` : ''}`;
    return soundFrom === 'both' && own ? `${own} · ${ableton}` : ableton;
  };

  // The fallback, said on screen: in Play and in Show alike.
  const midiBannerView = midiBanner === null ? null : (
    <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--bs-radius-md)', background: midiBanner === 'lost' ? 'var(--bs-warn)' : 'var(--bs-elev)', color: midiBanner === 'lost' ? 'var(--bs-bg)' : 'var(--bs-fg)', fontWeight: 600 }}>
      <span style={{ flex: '1 1 240px' }}>
        {midiBanner === 'lost'
          ? "Ableton's port has gone, so ADMI is playing its own sound."
          : 'Ableton is back. ADMI is still playing its own sound until you switch.'}
      </span>
      {midiBanner === 'back' && <Button tone="primary" onClick={switchBackToAbleton}>Switch to Ableton</Button>}
      <Button tone="secondary" onClick={() => setMidiBanner(null)}>{midiBanner === 'lost' ? 'OK' : 'Not now'}</Button>
    </div>
  );

  // Phase 2: the engine's chains while playing, and "Send sound choices to Ableton".
  const getAbletonLive = useCallback(() => engineRef.current?.abletonState() ?? null, [engineRef]);
  const sendSoundsToAbleton = useCallback(() => {
    const eng = engineRef.current;
    if (eng) eng.resendAbleton();
    // Stopped: the same plan from the settings, straight to the port.
    else new BoardMidiSender({ currentTime: 0 }).sendControls([...planFromConfig(configRef.current).controls.values()]);
    sessionLogRef.current.action(logActorRef.current, 'sent sound choices to Ableton');
  }, [engineRef, configRef]);

  // Grid changes re-suggest the read settings (unless the user has tuned them).
  const updateGrid = useCallback((patch: Partial<Pick<BoardSequencerStored, 'rows' | 'cols' | 'boardSquares'>>) => {
    setConfig((prev) => {
      const grid = applyGridChange(prev, patch);
      // A smaller grid can leave a lane pointing at a row or step that no longer exists,
      // which would quietly stop every control counter working.
      const controlZone = clampZone(grid.controlZone, grid.rows, grid.cols);
      const loopZone = clampZone(grid.loopZone, grid.rows, grid.cols);
      // Clamping them separately can land both on the same line — controls row 4 and pads
      // row 6 both become row 3 on a 4-row grid. Storage resolves that by switching the
      // pads off, so resolving it the same way here keeps the screen and the saved config
      // telling the player the same story.
      // Laptop-board counters off the new grid are lifted, not kept out of sight.
      const laptopBoard = prev.laptopBoard.filter((c) => c.row < grid.rows && c.col < grid.cols);
      return { ...grid, controlZone, loopZone: zonesCollide(controlZone, loopZone) ? NO_ZONE : loopZone, laptopBoard };
    });
  }, []);

  // Patch one field of a colour channel (instrument/drum/volume/tone/sends).
  const patchChannel = useCallback((id: string, patch: Partial<ColourChannel>) => {
    setConfig((prev) => {
      const next = { ...prev, channels: prev.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      return next;
    });
  }, []);

  // Live per-channel mixer; persists + applies to the running engine.
  type ChannelMixField = 'volume' | 'tone' | 'reverbSend' | 'delaySend';
  const setChannelMix = useCallback((id: string, field: ChannelMixField, value: number) => {
    patchChannel(id, { [field]: value });
    const eng = engineRef.current;
    if (!eng) return;
    if (field === 'volume') eng.setChannelVolume(id, value);
    else if (field === 'tone') eng.setChannelTone(id, value);
    else if (field === 'reverbSend') eng.setChannelReverbSend(id, value);
    else eng.setChannelDelaySend(id, value);
  }, [patchChannel]);

  /** A colour card's change: saved for the player, and heard straight away. */
  const setChannelSound = useCallback((id: string, patch: ChannelSoundPatch) => {
    patchChannel(id, patch);
    const eng = engineRef.current;
    if (!eng) return;
    const w = worldOf(configRef.current.soundWorld);
    // Back to the world's own level when a card is reset.
    if ('volume' in patch) eng.setChannelVolume(id, patch.volume ?? 1);
    if ('tone' in patch) eng.setChannelTone(id, patch.tone ?? 1);
    if ('reverbSend' in patch) eng.setChannelReverbSend(id, patch.reverbSend ?? w?.reverbSend ?? 0.18);
    if ('delaySend' in patch) eng.setChannelDelaySend(id, patch.delaySend ?? w?.delaySend ?? 0);
  }, [patchChannel]);

  // ▶ Hear: a colour's sound on its own, at once, playing or stopped — in Ableton when
  // Ableton is the whole sound (and its port is there), otherwise ADMI's own.
  const auditionerRef = useRef<SoundAuditioner | null>(null);
  const [hearing, setHearing] = useState<string | null>(null);
  useEffect(() => () => { auditionerRef.current?.dispose(); auditionerRef.current = null; }, []);
  // Shown on the colour's row, not only spoken: a sighted facilitator, and a deaf or
  // hard-of-hearing player, see that the sound played or why it didn't.
  const [hearNote, setHearNote] = useState<{ id: string; text: string } | null>(null);
  const hearNoteTimer = useRef<number | null>(null);
  const showHearNote = useCallback((id: string, text: string, ms: number) => {
    if (hearNoteTimer.current !== null) window.clearTimeout(hearNoteTimer.current);
    setHearNote({ id, text });
    announce(text);
    hearNoteTimer.current = window.setTimeout(() => setHearNote((n) => (n?.id === id ? null : n)), ms);
  }, [announce]);
  useEffect(() => () => { if (hearNoteTimer.current !== null) window.clearTimeout(hearNoteTimer.current); }, []);
  const hearColour = useCallback((c: ColourChannel) => {
    const cfg = configRef.current;
    const name = describeChannel(c);
    const key = { rootMidi: cfg.scaleRootMidi, semitones: cfg.scaleSemitones };
    if (previewRoute(cfg, midiPortRef.current) === 'ableton') {
      const out = MIDIManager.getConnectedSelectedOutput();
      const channel = channelFor({ role: c.role, origin: 'placed', colour: c.id }, {
        channelMode: cfg.midiChannelMode,
        colourChannels: cfg.midiChannelMode === 'colour' ? colourChannelMap(cfg.channels) : undefined,
      });
      if (!out) { showHearNote(c.id, 'No MIDI port to Ableton: check the Connections tab.', 5000); return; }
      if (channel === null) return;
      const now = performance.now();
      const chainCc = previewChainCc(planFromConfig(cfg), channel, runningRef.current);
      for (const ev of previewEvents(channel, chainCc, previewNotesFor(c, key), { wake: !runningRef.current })) out.send(ev.data, now + ev.atMs);
      showHearNote(c.id, `♪ Playing ${name} in Ableton…`, 1500);
      return;
    }
    setHearing(c.id);
    void Tone.start().then(() => {
      auditionerRef.current ??= new SoundAuditioner();
      return auditionerRef.current.hear(c, cfg.soundWorld, key);
    }).then((result) => {
      if (result === 'timeout') showHearNote(c.id, `${name}'s sound didn't load in time. Try again in a moment.`, 6000);
      else showHearNote(c.id, `♪ Playing ${name}…`, 1500);
    }).catch(() => {
      showHearNote(c.id, `${name}'s sound couldn't play.`, 6000);
    }).finally(() => setHearing((h) => (h === c.id ? null : h)));
  }, [showHearNote, announce]);

  // Pattern chaining: select which page the live camera edits.
  const selectPage = useCallback((i: number) => {
    setSelectedPage(i);
    engineRef.current?.setSelectedPage(i);
  }, []);

  // The page the camera edits has to be inside THIS player's number of pages. Switching
  // profiles swaps numPages without touching the selection, and a selection past the end
  // made the engine play an empty snapshot instead of the live board: every counter
  // silent, nothing on screen saying why. Clamping here covers every path, not just the
  // Pages control.
  useEffect(() => {
    if (selectedPage >= config.numPages) selectPage(0);
  }, [config.numPages, selectedPage, selectPage]);

  // Change how many pages the sequence chains across; clamp the selection.
  const setPagesCount = useCallback((n: number) => {
    setConfig((prev) => {
      const next = { ...prev, numPages: n };
      return next;
    });
    engineRef.current?.setNumPages(n);
    if (selectedPageRef.current >= n) selectPage(0);
  }, [selectPage]);

  /**
   * A cell as it is saved. Box detail comes too: where the counter sat is what gives the
   * note its loudness and its push or drag, and dropping it made a reloaded loop play
   * flat and dead on the beat beside a live board that still swung.
   */
  const storedCell = useCallback((c: ActiveCell): StoredLoopCell => {
    const out: StoredLoopCell = { row: c.row, col: c.col, colour: c.colour };
    if (c.velocity !== undefined) out.velocity = c.velocity;
    if (c.timingBeats !== undefined) out.timingBeats = c.timingBeats;
    return out;
  }, []);

  // Freeze the current live board into the selected page, then auto-advance so
  // the next page can be laid down.
  const capturePage = useCallback(() => {
    const i = selectedPageRef.current;
    const cells = activeCellsRef.current.map(storedCell);
    setConfig((prev) => {
      const pages = prev.pages.map((p) => [...p]);
      while (pages.length <= i) pages.push([]);
      pages[i] = cells;
      const next = { ...prev, pages };
      return next;
    });
    engineRef.current?.setPageSnapshot(i, activeCellsRef.current.map(storedCell));
    const n = Math.max(1, configRef.current.numPages);
    const nextPage = (i + 1) % n;
    setSelectedPage(nextPage);
    engineRef.current?.setSelectedPage(nextPage);
  }, []);

  // Persist the loop bank's saved slots into config (called when a slot captures or clears).
  const persistLoopSlots = useCallback((saved: (ActiveCell[] | null)[]) => {
    setConfig((prev) => {
      const kept = prev.loopSlots.slice(saved.length);
      const loopSlots = saved.map((s) => (s == null
        ? null
        : s.map((c) => (c.conditional ? { ...storedCell(c), conditional: true as const } : storedCell(c)))));
      return { ...prev, loopSlots: [...loopSlots, ...kept] };
    });
  }, []);

  // Clear a bank slot (screen "Clear" button on a mini-view).
  /** "Save as loop": the knocked pattern plus what is still down, into the first free slot. */
  const saveGhostsAsLoop = useCallback(() => {
    const cfg = configRef.current;
    const slots = loopBankRef.current.saved;
    const slot = slots.findIndex((sl) => sl == null);
    if (slot < 0) return;
    const cells = ghostsForSave(
      knockRef.current, activeCellsRef.current, configRef.current.twoCounterMode === 'both',
    );
    loopBankRef.current = {
      ...loopBankRef.current,
      saved: slots.map((sl, i) => (i === slot ? cells.map((c) => ({ ...c })) : sl)),
    };
    persistLoopSlots(loopBankRef.current.saved);
    letGoGhosts();
    announce(`Saved to slot ${slot + 1} — put a counter on slot ${slot + 1} to play it.`);
    void cfg;
  }, [persistLoopSlots, letGoGhosts, announce, activeCellsRef, knockRef, loopBankRef, configRef]);

  /** The detected counters as cells, for the word list when nothing is playing yet. */
  const cellsFromOccupied = useCallback((occ: ReadonlyMap<string, PieceColour>): ActiveCell[] => (
    [...occ].map(([key, colour]) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col, colour };
    })
  ), []);

  const clearLoopSlotAt = useCallback((slot: number) => {
    // The bank may not exist yet (nothing has been played this session), so the saved
    // loops in the config are the thing being cleared.
    loopBankRef.current = clearLoopSlot(loopBankRef.current, slot);
    setConfig((prev) => ({
      ...prev,
      loopSlots: prev.loopSlots.map((s, i) => (i === slot ? null : s)),
    }));
  }, [loopBankRef]);

  // Draw our sampling grid onto the camera, tinting cells by detection state +
  // colour (red vs black).
  const drawOverlay = useCallback(
    (
      occupied: Map<string, PieceColour>,
      activeMap: Map<string, PieceColour>,
      cfg: BoardSequencerStored,
      playCol: number,
      swatchById: Map<ColourId, string>,
      conditional: Set<string>,
      isVarLap: boolean,
      pingDir: number,
      bankCells: ReadonlyMap<string, 'empty' | 'paused' | 'active'>,
    ) => {
      const cv = overlayRef.current;
      const video = videoRef.current;
      if (!cv || !video) return;
      // The overlay fills the surface. Not the video's own box: with the picture turned a
      // quarter, the video element is laid out on its side.
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (W <= 0 || H <= 0) return;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      let hn: Mat3;
      try {
        // Corners are normalised, so scaling by the element size draws in CSS pixels.
        hn = homographyForCorners(cfg.corners, W, H);
      } catch {
        return;
      }
      const toPx = (ux: number, uy: number) => applyHomography(hn, { x: ux, y: uy });
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          const a = toPx(c / cfg.cols, r / cfg.rows);
          const b = toPx((c + 1) / cfg.cols, r / cfg.rows);
          const d = toPx((c + 1) / cfg.cols, (r + 1) / cfg.rows);
          const e = toPx(c / cfg.cols, (r + 1) / cfg.rows);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(d.x, d.y);
          ctx.lineTo(e.x, e.y);
          ctx.closePath();
          const key = `${r},${c}`;
          const activeColour = activeMap.get(key);
          const occColour = occupied.get(key);
          const colour = activeColour ?? occColour;
          const strong = activeColour !== undefined;
          const hex = colour ? swatchById.get(colour) : undefined;
          ctx.fillStyle = hex ? colourTint(hex, strong) : 'rgba(0,0,0,0)';
          ctx.fill();
          ctx.lineWidth = c === playCol && runningRef.current ? 3 : 1;
          ctx.strokeStyle = c === playCol && runningRef.current ? 'rgba(80,200,255,0.95)' : 'rgba(80,200,255,0.4)';
          const st = bankCells.get(key);
          const isBankCell = st !== undefined;
          if (isBankCell) {
            ctx.save();
            if (st === 'active') { ctx.fillStyle = 'rgba(80,200,255,0.5)'; ctx.fill(); }
            else if (st === 'paused') { ctx.fillStyle = 'rgba(80,200,255,0.18)'; ctx.fill(); }
            // 'empty' → leave as outline only
            ctx.strokeStyle = 'rgba(80,200,255,0.8)';
            ctx.lineWidth = 2;
          }
          ctx.stroke();
          if (isBankCell) ctx.restore();
          if (conditional.has(key)) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = isVarLap ? 'rgba(255,210,80,0.95)' : 'rgba(255,210,80,0.5)';
            ctx.stroke(); // re-stroke the current cell quad, dashed
            ctx.restore();
          }
        }
      }
      if (runningRef.current) {
        ctx.save();
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = isVarLap ? 'rgba(255,210,80,0.95)' : 'rgba(80,200,255,0.85)';
        ctx.fillText(isVarLap ? 'B' : 'A', 12, 30);
        ctx.restore();
      }
      if (pingDir !== 0) {
        ctx.save();
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = 'rgba(80,200,255,0.9)';
        ctx.fillText(pingDir > 0 ? '→' : '←', 40, 30);
        ctx.restore();
      }
    },
    [],
  );

  // Audio teardown on leaving the screen.
  useEffect(() => () => {
    // Clearing the generation is what makes an engine still loading its samples throw
    // itself away when it finishes. Without it the abort check passed, the engine started
    // its scheduler after the screen had gone, and nothing was left holding a reference
    // able to stop it — notes for the rest of the page's life.
    startingRef.current = null;
    runningRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    songEngineRef.current?.dispose();
    songEngineRef.current = null;
    // A frame burst can still be sampling; it would set state on a screen that has gone.
    findAbortRef.current?.abort();
    findAbortRef.current = null;
    boardCheckAbortRef.current?.abort();
    if (handCheckRef.current !== null) window.clearInterval(handCheckRef.current);
  }, [engineRef, runningRef, startingRef]);

  // The camera list (names are only available once camera permission is granted,
  // so it's refreshed after each start attempt, and whenever a camera or phone app
  // appears). It never switches camera by itself — that would swap the feed under
  // saved corners, possibly mid-performance; the user picks or presses Try again.
  const refreshCameras = useCallback(async () => {
    try {
      const list = await CameraManager.listDevices();
      setCameras(list.filter((d) => d.deviceId !== ''));
    } catch {
      /* enumerateDevices unsupported — the dropdown just offers the default */
    }
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => { void refreshCameras(); };
    md.addEventListener('devicechange', handler);
    return () => md.removeEventListener('devicechange', handler);
  }, [refreshCameras]);

  // Reset the camera readout whenever the camera is (re)opened.
  useEffect(() => {
    setCamInfo(null);
    setError(null);
  }, [config.cameraDeviceId, cameraRetry]);

  // Show asks for full screen, but stays when full screen ends: clicking the projector
  // window, or the browser's own Esc, ended it and dropped Show mid-piece (B5). Show closes
  // on Leave Show, or on an Esc of its own (see escLeavesShow).
  const fullscreenEndedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (view !== 'bigBoard') return;
    const root = bigBoardRef.current;
    root?.focus();
    void root?.requestFullscreen?.().catch(() => {
      // Refused (or unsupported): the view still fills the window, which is the point.
    });
    const onChange = (): void => {
      if (document.fullscreenElement === null) fullscreenEndedAtRef.current = performance.now();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement !== null) void document.exitFullscreen?.().catch(() => {});
      bigBoardButtonRef.current?.focus();
    };
  }, [view]);
  // Show: ▶ Start the piece gives way to the Now / Next strip, and focus goes with it, never
  // to the page (T4-09) and never onto ■ Stop, where a repeated Enter stopped the piece it
  // had just started (B3). Back onto Start when it stops (the second press of Stop, the end
  // of the piece, or the iPad's End piece).
  const showStartRef = useRef<HTMLButtonElement | null>(null);
  const showStopRef = useRef<HTMLButtonElement | null>(null);
  const showNowNextRef = useRef<HTMLDivElement | null>(null);
  // Started or stopped by Space, focus was on Show itself: it moves the same way.
  const wasRunningRef = useRef(running);
  useEffect(() => {
    const changed = wasRunningRef.current !== running;
    wasRunningRef.current = running;
    if (view !== 'bigBoard') return;
    if (focusDropped() || (changed && document.activeElement === bigBoardRef.current)) {
      (running ? showNowNextRef : showStartRef).current?.focus();
    }
  }, [view, running]);
  // In Show, with the audience screen open: say once to keep this window in front (B6).
  const [keepInFront, setKeepInFront] = useState(false);
  const keepInFrontDue = view === 'bigBoard' && audience.open && (!laptop || config.cap.enabled);
  useEffect(() => {
    if (!keepInFrontDue) { setKeepInFront(false); return undefined; }
    setKeepInFront(true);
    const t = window.setTimeout(() => setKeepInFront(false), KEEP_IN_FRONT_MS);
    return () => window.clearTimeout(t);
  }, [keepInFrontDue]);
  // "Close the audience screen" waits this long for its second press (B4).
  const [closeAudienceArmed, setCloseAudienceArmed] = useState(false);
  useEffect(() => {
    if (!closeAudienceArmed) return undefined;
    const t = window.setTimeout(() => setCloseAudienceArmed(false), pressAgainMs(configRef.current.pressAgainSec));
    return () => window.clearTimeout(t);
  }, [closeAudienceArmed]);

  /**
   * Find the board: take a few frames, ask each one where the board is, and trust the
   * answer only when several agree. Nothing is saved — the editor opens with the
   * proposal and the player confirms it, so a wrong guess costs one tap.
   */
  const findBoard = useCallback(async () => {
    const video = videoRef.current;
    if (!video || runningRef.current) return;
    const cfg = configRef.current;
    const controller = new AbortController();
    findAbortRef.current = controller;
    setFinding(true);
    setProposal(null);
    try {
      const detections: BoardDetection[] = [];
      await runFrameBurst<BoardDetection>({
        video,
        mirrorX: cfg.mirrorX,
        mirrorY: cfg.mirrorY,
        rotation: cfg.cameraRotation,
        signal: controller.signal,
        detect: (frame) => {
          const d = detectBoard(frame.data, frame.width, frame.height);
          detections.push(d);
          return d;
        },
        enough: (results) => results.filter((r) => r.status === 'high').length >= AGREE_COUNT,
      });
      if (controller.signal.aborted) return;
      const result = consensus(detections);
      setProposal(result);
      announce(result.reasons[0] ?? '');
      if (result.corners) {
        // Show it in the editor for review; Looks right is what saves it.
        setCalibrating('review');
      }
    } finally {
      if (findAbortRef.current === controller) findAbortRef.current = null;
      setFinding(false);
    }
  }, [announce, configRef, runningRef, videoRef]);

  /**
   * On arriving at Play: Find board's own look, silently, compared with the saved corners.
   * Never blocks playing (▶ Play cancels it) and never says "moved" without seeing the board.
   */
  const checkBoard = useCallback(async () => {
    const video = videoRef.current;
    if (!video || runningRef.current) return;
    const cfg = configRef.current;
    const controller = new AbortController();
    boardCheckAbortRef.current = controller;
    setBoardCheck('checking');
    try {
      const detections: BoardDetection[] = [];
      await runFrameBurst<BoardDetection>({
        video,
        mirrorX: cfg.mirrorX,
        mirrorY: cfg.mirrorY,
        rotation: cfg.cameraRotation,
        signal: controller.signal,
        detect: (frame) => {
          const d = detectBoard(frame.data, frame.width, frame.height);
          detections.push(d);
          return d;
        },
        enough: (results) => results.filter((r) => r.status === 'high').length >= AGREE_COUNT,
      });
      if (controller.signal.aborted) return;
      const result = consensus(detections);
      setBoardCheck(boardStillThere(cfg.corners, result.status === 'high' ? result.corners ?? null : null, cfg.boardSquares));
    } finally {
      if (boardCheckAbortRef.current === controller) boardCheckAbortRef.current = null;
    }
  }, [configRef, runningRef, videoRef]);

  /**
   * Find colours: take a few frames of the board with the counters on it, learn what the
   * board itself looks like, and offer each counter colour with a band that has been
   * CHECKED against the board — the thing tapping a counter never did.
   */
  const findColours = useCallback(async () => {
    const video = videoRef.current;
    const cfg = configRef.current;
    if (!video || runningRef.current || !cfg.enabled) return;
    const controller = new AbortController();
    findAbortRef.current = controller;
    setFindingColours(true);
    setColourProposal(null);
    try {
      const burst = await runFrameBurst({
        video,
        mirrorX: cfg.mirrorX,
        mirrorY: cfg.mirrorY,
        rotation: cfg.cameraRotation,
        signal: controller.signal,
        maxFrames: 5,
        enough: () => false,
      });
      if (controller.signal.aborted) return;
      if (burst.frames.length === 0) {
        // Saying nothing here looked exactly like a colour search that found nothing.
        setColourProposal({
          colours: [],
          message: 'I couldn’t get a picture from the camera. Check it is still connected, then try again.',
        });
        return;
      }
      // Against the learnt board when there is one: the same pictures, the same light
      // correction and the same test play uses, so bare wood is never offered as a colour.
      const reference = loadBoardReference(cfg.boardReference);
      if (reference && reference.squares === cfg.boardSquares && video.videoWidth > 0) {
        const got = await captureReaderFrames(video, orientationOf(cfg), 5, 120, controller.signal);
        if (controller.signal.aborted) return;
        const hRef = homographyForCorners(cfg.corners, got.shown.width, got.shown.height);
        const blobs = findCounterBlobs(got.frames, hRef, reference, READER_DOWNSCALE);
        const foundRef = coloursFromBlobs(blobs, cfg.boardColours);
        if (!foundRef.ok) {
          setColourProposal({
            colours: [],
            message: 'I couldn’t see any counters. Put one of each on the board and try again. (If the light has changed a lot since the board was learnt, learn it again first.)',
          });
          return;
        }
        const unsafeRef = foundRef.colours.filter((c) => c.unsafe).length;
        // Colours this close may be mixed up while playing: say so now, not mid-piece.
        const offered = foundRef.colours.filter((c) => !c.unsafe);
        const alike = alikePairs(offered.map((c) => c.swatch))
          .map(([a, b]) => `${hueName(offered[a].hsv.h)} and ${hueName(offered[b].hsv.h)}`);
        setColourProposal({
          colours: foundRef.colours,
          message: `Found ${foundRef.colours.length} ${foundRef.colours.length === 1 ? 'colour' : 'colours'} on ${blobs.length} ${blobs.length === 1 ? 'counter' : 'counters'}, against the learnt board.${unsafeRef > 0 ? ` ${unsafeRef} look close to the board's colours: they start switched off.` : ''}${alike.length > 0 ? ` ${alike.join('; ')} look alike in this light and may be mixed up while playing: more even light helps, or use just one of them.` : ''}`,
        });
        return;
      }
      const frame = burst.frames[burst.frames.length - 1];
      const h = homographyForCorners(cfg.corners, frame.width, frame.height);
      const warped = warpToBoard(frame.data, frame.width, frame.height, h, cfg.boardSquares);
      const model = buildSquareModel(warped);
      if (!model.ok) {
        setColourProposal({
          colours: [],
          message: 'Too much of the board is covered to tell squares from counters. Clear it and press Find board first.',
        });
        return;
      }
      // Judge every candidate against the board we learnt when it was empty, not against
      // one inferred from this frame — which has counters all over it.
      const found = detectColours(warped, model.model, {
        boardColours: cfg.boardColours,
        learntSquares: {
          squares: cfg.boardLearntSquares,
          // Learnt with the same corners as the learnt board: turned with the board since.
          rgb: orientSquareGrid(cfg.boardSquareRgb, cfg.boardLearntSquares, cfg.boardReference?.corners, cfg.corners),
        },
      });
      if (!found.ok) {
        setColourProposal({
          colours: [],
          message: 'I couldn’t see any counters. Put one of each on the board and try again.',
        });
        return;
      }
      const unsafe = found.colours.filter((c) => c.unsafe).length;
      setColourProposal({
        colours: found.colours,
        message: unsafe > 0
          ? `Found ${found.colours.length} colours. ${unsafe} of them look like the board itself, so they start switched off.`
          : `Found ${found.colours.length} ${found.colours.length === 1 ? 'colour' : 'colours'}, and none of them match the board.`,
      });
    } finally {
      if (findAbortRef.current === controller) findAbortRef.current = null;
      setFindingColours(false);
    }
  }, [configRef, runningRef, videoRef]);

  /**
   * Accept the detected colours. A colour the player already had keeps its identity —
   * its id, job, instrument and mix — and only takes the new band and swatch, because
   * the id is what saved pages and loops point at. Nothing is removed here: a colour
   * that simply wasn't on the board this time is not a colour the player wanted deleted.
   */
  const useDetectedColours = useCallback(() => {
    const found = colourProposal?.colours;
    if (!found || found.length === 0) return;
    setConfig((prev) => ({
      ...prev,
      channels: applyDetectedColours(prev.channels, found, allReferencedChannelIds()).map((c) => withTuneDefault(c, prev.tunesForNewColours)),
    }));
    setColourProposal(null);
  }, [colourProposal]);

  /**
   * "Check my hand": hold a hand over the board for two seconds and find out what the
   * guard makes of it, and whether any counter colour lights up under a sleeve. It only
   * reports — a sleeve that isn't a counter colour is advice, not a setting.
   */
  const startHandCheck = useCallback(() => {
    if (handCheckRef.current !== null) window.clearInterval(handCheckRef.current);
    setHandCheck({ checking: true, result: null });
    const started = performance.now();
    let maxHeld = 0;
    const lit = new Set<ColourId>();
    const id = window.setInterval(() => {
      const f = latestFrameRef.current;
      if (f) {
        maxHeld = Math.max(maxHeld, f.held.size);
        for (const r of f.readings) {
          if (r.occupied && r.colour && f.held.has(`${r.row},${r.col}`)) lit.add(r.colour);
        }
      }
      if (performance.now() - started < 2000) return;
      window.clearInterval(id);
      handCheckRef.current = null;
      const names = [...lit].map((cid) => channelNameRef.current(cid));
      setHandCheck({
        checking: false,
        result: maxHeld === 0
          ? "Nothing was held. Move your hand further over the board, or raise Hand sensitivity."
          : names.length === 0
            ? `Held ${maxHeld} ${maxHeld === 1 ? 'square' : 'squares'}. No counter colour lit up under your hand.`
            : `Held ${maxHeld} ${maxHeld === 1 ? 'square' : 'squares'}. ${names.join(' and ')} lights up under your hand — the guard will hold those squares, but a sleeve that isn't a counter colour helps.`,
      });
    }, 100);
    handCheckRef.current = id;
  }, [latestFrameRef]);

  // A camera tool belongs to the step that opened it, wherever it was opened FROM. Keying
  // this on the step alone wasn't enough: picking a camera opens the corner editor, and on
  // the Camera step no step change followed, so the player was asked to tap the board's
  // corners over a picture they hadn't got working yet.
  useEffect(() => {
    if (view === 'setup' && step === 'board') return;
    if (calibrating !== null) setCalibrating(null);
  }, [view, step, calibrating]);

  useEffect(() => {
    if (view === 'setup' && step === 'colours') return;
    if (colourCalib === null && pendingColour === null && squarePicker === null) return;
    setColourCalib(null);
    setPendingColour(null);
    setSquarePicker(null);
  }, [view, step, colourCalib, pendingColour, squarePicker]);

  // The handedness layout switches at a breakpoint, so the width has to be watched.
  useEffect(() => {
    const onResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Runtime callbacks, re-assigned on every render so they always see fresh state.
  callbacksRef.current = {
    onCameraStarted: (fellBack, trackInfo) => {
      setCamInfo(trackInfo);
      fellBackRef.current = fellBack;
      if (fellBack) {
        const name = configRef.current.cameraLabel || 'the chosen camera';
        setCamNotice({
          kind: 'fallback',
          text: `Couldn't find "${name}", so the browser's default camera is being used. Connect it (or start its phone app), then press Try again.`,
        });
        setView('setup');
        setStep('camera');
      } else {
        setCamNotice((n) => (n?.kind === 'fallback' ? null : n));
      }
      void refreshCameras();
    },
    onCameraError: (message) => {
      // On the laptop board there is no camera to complain about.
      if (configRef.current.boardSource === 'laptop') return;
      setError(message);
      // Permission may be granted even though this camera is busy/broken, so load the
      // list — the user can then pick a different camera.
      void refreshCameras();
    },
    onCameraCheck: (sat, trackInfo, lighting) => {
      setFeedSaturation(sat);
      setFeedColourless((prev) => nextColourlessState(prev, sat));
      setLighting((prev) => nextLightingProblem(prev, lighting));
      setCamInfo(trackInfo);
    },
    onLoopSlotsCaptured: (saved) => persistLoopSlots(saved),
    // A followed nudge is silent: the corners move, the music carries on, and the new
    // position is saved every few seconds so the next session starts where the board is.
    onCornersTracked: (corners) => {
      // Both of these matter: the ref so THIS frame reads the moved corners, and the
      // tracked ref so the next render doesn't rebuild configRef from the older saved
      // corners and undo the correction. Without it every pass measured its shift from a
      // stale position and the sampling grid twitched twice a second.
      trackedCornersRef.current = corners;
      configRef.current = { ...configRef.current, corners };
      const now = performance.now();
      if (now - lastCornerSaveRef.current < TRACK_SAVE_MS) return;
      lastCornerSaveRef.current = now;
      setConfig((prev) => {
        const next = { ...prev, corners };
          return next;
      });
    },
    draw: ({ frame, nudge: signal }: RuntimeFrame) => {
      const cfg = configRef.current;
      const engine = engineRef.current;
      const playing = runningRef.current && !!engine;
      const playCol = playing && engine ? engine.getPlayheadCol(cfg.cols) : 0;
      const varLap = playing && engine && cfg.numPages <= 1 ? engine.isVariationLap() : false;
      const ping = playing && engine && cfg.pingPong ? engine.getPlayheadDirection() : 0;
      const swatchById = new Map(cfg.channels.map((c) => [c.id, c.swatch]));
      drawOverlay(
        frame.occupied, frame.activeMap, cfg, playCol, swatchById, frame.conditional, varLap, ping, frame.bankCells,
      );
      // Note pops come from what the engine actually scheduled, matched against audible
      // time, so a cell never lights before its sound.
      let drainedForAudience: FiredNote[] = [];
      if (engine) {
        const audible = engine.audibleNow();
        const drained = engine.drainFiredNotes();
        drainedForAudience = drained;
        sessionLogRef.current.addNotes(drained);
        firedRef.current = pruneFired([...firedRef.current, ...drained], audible);
        // Only when something is sounding (or just stopped): an empty list every frame
        // re-rendered this whole screen 60 times a second for nothing, on the same thread
        // as the colour detection and the sound scheduler.
        const next = popsAt(firedRef.current, audible);
        popStore.set(next);
        setPops((prev) => (soundingKey(prev) === soundingKey(next) ? prev : next));
      } else if (firedRef.current.length > 0) {
        firedRef.current = [];
        popStore.set([]);
        setPops((prev) => (prev.length === 0 ? prev : []));
      }
      // The audience screen, only while one is open (also fed from a timer when this loop stops).
      const nowMs = performance.now();
      lastDrawAtRef.current = nowMs;
      lastAudienceFrameRef.current = frame;
      feedAudienceRef.current(frame, drainedForAudience, nowMs);
      setNudge((prev) => (prev === signal || (prev !== null && signal !== null && JSON.stringify(prev) === JSON.stringify(signal)) ? prev : signal));
    },
    onThrottledState: (rf: RuntimeFrame) => {
      const { frame, controls } = rf;
      const cfg = configRef.current;
      const engine = engineRef.current;
      // A counter of a loop colour on the board wants its loop (hold or toggle, like the pads).
      if (runningRef.current && rf.loopColours.size > 0) {
        const dt = loopTickRef.current === null ? 100 : Math.max(0, Math.min(1000, rf.atMs - loopTickRef.current));
        loopTickRef.current = rf.atMs;
        const r = stepLoopColours(loopColourRef.current, rf.loopColours, { ...DEFAULT_LOOP_COLOUR_OPTIONS, mode: cfg.loopPadMode }, dt);
        loopColourRef.current = r.state;
        const prev = counterWantedRef.current;
        if (prev.size !== r.wanted.size || [...r.wanted].some((s) => !prev.has(s))) {
          counterWantedRef.current = r.wanted;
          pushLaunchRef.current();
        }
      }
      // Only what changed reaches the screen: this runs ten times a second, always with
      // new objects, and re-rendered the whole screen each time with nothing moving.
      const fk = frameKey(rf);
      if (fk !== shownKeysRef.current.frame) { shownKeysRef.current.frame = fk; setLatestFrame(rf); }
      const ck = controlsKey(controls);
      if (ck !== shownKeysRef.current.controls) { shownKeysRef.current.controls = ck; setControlState(controls); }
      // Settled pattern cells only exist while playing, so in Set up (and when stopped)
      // this falls back to what the camera can see. Otherwise "On the board now" and
      // Describe board told the player the board was empty with counters all over it.
      const nextActive = runningRef.current ? frame.patternCells : cellsFromOccupied(frame.occupied);
      const ak = cellsKey(nextActive);
      if (ak !== shownKeysRef.current.active) { shownKeysRef.current.active = ak; setActive(nextActive); }
      if (runningRef.current) {
        // What the engine hears: a colour still waiting for its time is not on the log's board.
        sessionLogRef.current.board(rf.sounding);
        const counts = sessionLogRef.current.counts();
        setLogCounts((prev) => (prev.notes === counts.notes && prev.events === counts.events ? prev : counts));
      }
      setPlayheadCol(runningRef.current && engine ? engine.getPlayheadCol(cfg.cols) : 0);
      if (cfg.numPages > 1 && engine) setPlayingPage(engine.getCurrentPage());
      const sk = `${JSON.stringify(frame.byColour)}|${frame.activeMap.size}`;
      if (sk !== shownKeysRef.current.stats) { shownKeysRef.current.stats = sk; setStats({ byColour: frame.byColour, settled: frame.activeMap.size }); }
      if (engine) {
        setLiveBpm(engine.getBpm());
        // A scene gliding to its speed, heard as it is (nothing else setting the speed): where it is going.
        const g = speedGlideRef.current;
        const to = g && !glideLandedRef.current && !glideDone(g, performance.now()) && !speedOwnedElsewhere() ? Math.round(g.to) : null;
        setGlideTo((prev) => (prev === to ? prev : to));
        setIsVarLap(cfg.numPages <= 1 ? engine.isVariationLap() : false);
        setPingDir(cfg.pingPong ? engine.getPlayheadDirection() : 0);
        // A beat dot that flips with the beat: every audio event has a visual cue.
        setBeatOn(Math.abs(engine.getVisualBeat()) % 2 === 0);
        // Fill marks: one per square, refreshed only when the fill itself changes.
        const fill = engine.getFillNotes();
        const marks = new Map<string, { row: number; col: number; colour: ColourId }>();
        for (const n of fill) marks.set(`${n.cell.row},${n.cell.col}`, { row: n.cell.row, col: n.cell.col, colour: n.colour });
        const fs = engine.getFillStatus();
        setFillStatus((prev) => (JSON.stringify(prev) === JSON.stringify(fs) ? prev : fs));
        const applied = engine.getLaunchedSlots();
        setAppliedSlots((prev) => (prev.length === applied.length && prev.every((s, i) => s === applied[i]) ? prev : applied));
        const bs = engine.getBandStatus();
        setBandStatus((prev) => (prev.level === bs.level && prev.playing === bs.playing && prev.parts.join() === bs.parts.join() ? prev : bs));
        if (bandPlayingRef.current !== bs.playing) {
          bandPlayingRef.current = bs.playing;
          if (cfg.band !== 'off') setBoardNotice(bs.playing ? 'Band joins' : 'Band stops');
        }
        // Evolve labels: refreshed only when a colour's sound actually changes.
        const labels = engine.getEvolveLabels();
        const evoSig = [...labels.entries()].map(([id, l]) => `${id}:${l.scene}:${l.label}`).join('|');
        if (evoSig !== evolveSigRef.current) {
          const before = evolveSigRef.current;
          evolveSigRef.current = evoSig;
          setEvolveLabels(labels);
          // A new scene is announced, so it is never only heard.
          if (before && cfg.evolveAmount > 0) {
            const prevScenes = new Map(before.split('|').map((x) => [x.split(':')[0], x.split(':')[1]]));
            const moved = [...labels.entries()].filter(([id, l]) => prevScenes.get(id) !== String(l.scene));
            const nameOfColour = (id: string): string => {
              const ch = cfg.channels.find((c) => c.id === id);
              return ch ? describeChannel(ch) : id;
            };
            if (moved.length > 0) {
              announce(`New sounds: ${moved.map(([id, l]) => `${nameOfColour(id)} ${l.label}`).join('; ')}`);
              setBoardNotice('New sounds');
            }
          }
        }
        const sig = `${fill.length}|${[...marks.keys()].join(';')}`;
        if (sig !== fillSigRef.current) {
          fillSigRef.current = sig;
          setFillMarks([...marks.values()]);
          setFillCount(fill.length);
        }
      } else {
        setLiveBpm(cfg.bpm);
      }
    },
  };

  /**
   * Turn the board a quarter turn, from Play.
   *
   * The screen shows the board the way the CAMERA sees it, which is only the way the
   * player sees it when they are sitting at the edge the camera calls the bottom. Someone
   * sitting along the side — common in a wheelchair, where the table can't be approached
   * head on — reads the whole thing rotated. Turning the corners is exactly what the
   * corner editor's Turn does; it just was not reachable once you were playing.
   */
  const turnBoard = useCallback(() => {
    trackedCornersRef.current = null;
    homographyRef.current = null;
    setConfig((prev) => (prev.enabled ? { ...prev, corners: rotateCorners(prev.corners, 1) } : prev));
    announce('Board turned a quarter turn.');
  }, [announce, homographyRef]);

  /**
   * A model of the board from a fresh frame: what each square looks like, and which
   * squares have something on them. Null when it can't be read (no corners yet, no
   * picture, or too much of the board covered to tell squares from counters).
   */
  const boardModelNow = useCallback((
    cornersOverride?: BoardSequencerStored['corners'],
  ): SquareModel | null => {
    const cfg = configRef.current;
    const video = videoRef.current;
    if ((!cfg.enabled && !cornersOverride) || !video || video.videoWidth <= 0) return null;
    try {
      const cv = document.createElement('canvas');
      const shown = orientedSize(video.videoWidth, video.videoHeight, cfg.cameraRotation);
      cv.width = shown.width;
      cv.height = shown.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      drawOriented(ctx, video, cv.width, cv.height, orientationOf(cfg));
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      const h = homographyForCorners(cornersOverride ?? cfg.corners, cv.width, cv.height);
      const warped = warpToBoard(data, cv.width, cv.height, h, cfg.boardSquares);
      const model = buildSquareModel(warped);
      return model.ok ? model.model : null;
    } catch {
      return null;
    }
  }, [configRef, videoRef]);

  /** The board's own colours as they look RIGHT NOW (the fallback when none are stored). */
  const boardColoursNow = useCallback((
    cornersOverride?: BoardSequencerStored['corners'],
  ): { h: number; s: number; v: number }[] | null => {
    const model = boardModelNow(cornersOverride);
    return model ? modelHsv(model) : null;
  }, [boardModelNow]);


  const [learnMessage, setLearnMessage] = useState<string | null>(null);
  const [testPicturesMessage, setTestPicturesMessage] = useState<string | null>(null);
  /**
   * Real pictures of the board, for testing counter detection away from the rig: ten
   * frames over about three seconds at half size, with everything needed to read them
   * the way the app does (corners, orientation, board size, colours, the learnt board).
   */
  const saveTestPictures = useCallback((note: string) => {
    const cfg = configRef.current;
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) { setTestPicturesMessage('No camera picture yet.'); return; }
    setTestPicturesMessage('Taking pictures… keep still.');
    void (async () => {
      const shown = orientedSize(video.videoWidth, video.videoHeight, cfg.cameraRotation);
      const cv = document.createElement('canvas');
      cv.width = Math.floor(shown.width / 2);
      cv.height = Math.floor(shown.height / 2);
      const ctx = cv.getContext('2d');
      const pictures: string[] = [];
      for (let i = 0; ctx && i < 10; i++) {
        drawOriented(ctx, video, cv.width, cv.height, orientationOf(cfg));
        pictures.push(cv.toDataURL('image/png'));
        await new Promise((r) => { setTimeout(r, 300); });
      }
      const file = {
        kind: 'admi-board-test-pictures',
        version: 1,
        takenAt: new Date().toISOString(),
        note,
        video: { width: shown.width, height: shown.height, pictureScale: 2 },
        camera: cfg.cameraLabel,
        corners: cfg.corners,
        boardSquares: cfg.boardSquares,
        rows: cfg.rows,
        cols: cfg.cols,
        channels: cfg.channels.map((c) => ({ id: c.id, kind: c.kind, role: c.role, swatch: c.swatch, band: c.band, blackBand: c.blackBand, whiteBand: c.whiteBand })),
        boardReference: cfg.boardReference,
        counterDetection: cfg.counterDetection,
        pictures,
      };
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `admi-board-pictures-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTestPicturesMessage(`Saved ${pictures.length} pictures${note ? ` (“${note}”)` : ''}.`);
    })();
  }, [configRef, videoRef]);

  /**
   * Learn what the EMPTY board looks like.
   *
   * It used to REFUSE when many squares looked unlike the rest of their colour, taking that
   * as counters left on the board. On a real board that blocked an empty board: walnut
   * squares cut from lighter wood and a brighter corner looked "covered", and there was no
   * way past. The facilitator can see the board; the app can only guess. So it trusts
   * them: it learns, and if some squares stood out it says which way to check, plainly.
   * (Learning each square exactly as it is, golden walnut and all, is the whole point of
   * the board reference.)
   */
  const learnBoard = useCallback((opts: { auto?: boolean } = {}) => {
    const cfg = configRef.current;
    if (!cfg.enabled) {
      setLearnMessage('Find the board and confirm its corners first.');
      return;
    }
    if (opts.auto && !autoLearnAllowed({ hasLearnt: cfg.boardReference !== null, running: runningRef.current })) {
      if (cfg.boardReference !== null) setLearnMessage('✓ Board found. The empty board learnt before is kept: More → Learn it again if the light has changed.');
      return;
    }
    const model = boardModelNow();
    if (!model) {
      setLearnMessage('Couldn’t read the board just now. Check the camera picture and try again.');
      return;
    }
    const total = model.squares * model.squares;
    let covered = 0;
    for (let i = 0; i < total; i++) if (model.covered[i]) covered += 1;
    const unusual = covered > total * 0.12
      ? ` ${covered} squares look different from the others of their colour: lighter wood or a bright patch is fine. If anything is on them, take it off and learn it again.`
      : '';
    const colours = modelHsv(model);
    if (colours.length === 0) {
      setLearnMessage('Couldn’t make out the squares. Try more even light.');
      return;
    }
    update({
      boardColours: colours,
      boardSquareRgb: Array.from(model.rgb),
      boardLearntSquares: model.squares,
    });
    setLearnMessage('Learning the board… keep hands off it for a second.');
    // The reference counters are found against: about a second of frames, taken exactly
    // as the reader will see them (the same size, the same orientation), so the board's
    // own grain, noise and flicker are what counts as "the board".
    const video = videoRef.current;
    void (async () => {
      let frames: FrameRGBA[] = [];
      let learnt = false;
      if (video && video.videoWidth > 0) {
        const got = await captureReaderFrames(video, orientationOf(cfg), 12, 90);
        frames = got.frames;
        const shown = got.shown;
        try {
          const hm = homographyForCorners(cfg.corners, shown.width, shown.height);
          const ref = learnBoardReference(frames, hm, cfg.boardSquares, READER_DOWNSCALE);
          // With the corners it was learnt with: a later Turn or Flip turns it too.
          if (ref) update({ boardReference: { ...storeBoardReference(ref), corners: cfg.corners.map((c) => ({ x: c.x, y: c.y })) } });
          learnt = ref !== null;
        } catch {
          // Degenerate corners: the colour model above still stands.
        }
      }
      if (!learnt) {
        setLearnMessage('Couldn’t learn the board: all of it must be in the camera picture, with nothing on it. Check the corners and try again.');
        announce('The board could not be learnt.');
        return;
      }
      // Say so, with the time on it. Learning a second time usually finds the same number
      // of squares, so a bare count is indistinguishable from the button doing nothing —
      // and a control that gives no sign it ran is a control you cannot trust.
      const at = new Date().toLocaleTimeString();
      setLearnMessage(`${opts.auto ? '✓ Board found and learnt' : 'Learnt'} at ${at}.${unusual}`);
      announce(`Board learnt from ${colours.length} squares.`);
    })();
  }, [configRef, boardModelNow, update, announce, videoRef, runningRef]);

  const handleCalibrated = useCallback(
    (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint], patch: Partial<BoardSequencerStored> = {}) => {
      // Dragging a handle across the board makes a bow-tie, which still solves — every
      // cell maps to the same pixel or to NaN — so the board reads nothing for ever,
      // silently, including after a reload. Only the four-tap path used to check.
      if (!isConvexQuad(corners)) {
        announce('Those corners cross over each other. Drag them back so the outline is a proper four-sided shape.');
        return;
      }
      // The Board step asks for the board EMPTY, so this is the one moment we can see what
      // the board itself looks like with nothing in the way. Learning it here is what
      // makes "doesn't match the board" mean anything later: inferring it from a frame
      // with counters all over it means guessing which squares are board, and a square
      // that guess gets wrong becomes a counter colour that lights up bare wood.
      const learnt = boardColoursNow(corners) ?? [];
      // The tracker's corrections are superseded by corners the player just confirmed.
      trackedCornersRef.current = null;
      const adoptCamera = fellBackRef.current;
      // Confirming corners is the step the "camera changed" notice asks for, so it has
      // been done — otherwise the banner (and the Change camera button beside it) stayed
      // up for the rest of the session.
      setCamNotice((n) => (n?.kind === 'changed' ? null : n));
      if (adoptCamera) {
        fellBackRef.current = false;
        setCamNotice(null);
      }
      const info = adoptCamera ? cameraRef.current?.getTrackInfo() : null;
      setConfig((prev) => {
        // One functional update, so anything else queued in the same event survives and
        // only one config is ever written.
        let next: BoardSequencerStored = { ...prev, ...patch, corners, enabled: true };
        // Keep what we already knew if this frame was too covered to learn from.
        if (learnt.length > 0) next = { ...next, boardColours: learnt };
        if (patch.boardSquares !== undefined || patch.rows !== undefined || patch.cols !== undefined) {
          next = applyGridChange(next, {});
        }
        if (adoptCamera) {
          // These corners were clicked on the stand-in camera, so make it the saved
          // choice — otherwise a Try again / reload would pair them with the missing one.
          next = { ...next, cameraDeviceId: info?.deviceId ?? '', cameraLabel: info?.label ?? '' };
        }
        return next;
      });
      const video = videoRef.current;
      // Convexity has already been checked, so this can't throw on the corners we just
      // saved; guard anyway rather than leave the editor stuck open on an exception.
      try {
        if (video) {
          const shown = orientedSize(video.videoWidth, video.videoHeight, configRef.current.cameraRotation);
          homographyRef.current = homographyForCorners(corners, shown.width, shown.height);
        }
      } catch {
        homographyRef.current = null;
      }
      setCalibrating(null);
      // The board was asked for empty: learn it, once these corners are saved. A count,
      // not a flag: corners confirmed unchanged still ask, and nothing is left armed.
      setLearnRequest((n) => n + 1);
      setBoardCheck(null);
    },
    [homographyRef, videoRef, announce, boardColoursNow],
  );
  const [learnRequest, setLearnRequest] = useState(0);
  useEffect(() => {
    if (learnRequest > 0) learnBoard({ auto: true });
    // Only a new request learns: learnBoard's identity changing must not.
  }, [learnRequest]);

  const stop = useCallback(() => {
    stoppedAtRef.current = performance.now();
    startingRef.current = null;
    setStarting(false);
    pieceStartingRef.current = false;
    setPieceStarting(false);
    runningRef.current = false;
    // How the sound kept time in this run, for the log and the Ready check, before the
    // engine goes. Stop also ends Simplify (a new engine starts full).
    const finished = engineRef.current;
    if (finished) {
      const report = finished.getKeepingTime();
      sessionLogRef.current.timing(report);
      if (report.runSec >= KEEPING_TIME_MIN_RUN_SEC) setLastRunTime({ report, valve: finished.getValveSteps() });
    }
    setTimeNow(null);
    setSimplify('off');
    engineRef.current?.dispose();
    engineRef.current = null;
    modeRef.current = null;
    songEngineRef.current?.stopPlayback();
    sessionLogRef.current.stop();
    setLogCounts(sessionLogRef.current.counts());
    void keepTake();
    clockStartRef.current = null;
    setClock(null);
    endingRef.current = false;
    setEnding(false);
    forgetPieceRunning();
    // Stop ends a glide (the player's own speed comes back with their settings), and no
    // colour waits any more: ▶ Play plays every colour.
    speedGlideRef.current = null;
    glideLandedRef.current = true;
    setGlideTo(null);
    waitingIdsRef.current = null;
    setWaitingNow([]);
    // The piece is over (or stopped): the player's own settings come back, and no scene is
    // on now, whatever put one there (R2-T2-01).
    const home = homeSettingsRef.current;
    homeSettingsRef.current = null;
    setConfig((prev) => stoppedConfig(prev, home));
    // Stop means silence: no loop is left waiting to start with Play.
    stopAllLoopsRef.current();
    setWantedSlots([]);
    // A new loop's "Hear it with…" ends with Stop too, or Play brought that loop back
    // while its row said "fading in…" (T4-07). Set now as well: Play reads the ref.
    if (newLoopRef.current) newLoopRef.current = stopHearing(newLoopRef.current);
    setNewLoop((n) => (n ? stopHearing(n) : n));
    setAppliedSlots([]);
    setRunning(false);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      engineRef.current?.setMuted(next);
      sessionLogRef.current.action(logActorRef.current, next ? 'mute' : 'unmute');
      const se = songEngineRef.current;
      if (se && songStatusRef.current === 'loaded') {
        if (next) se.pause();
        else se.resume();
      }
      return next;
    });
  }, []);

  /**
   * Simplify, the owner's safety net: one press strips the sound to the player and the
   * scene's first loop (no band, no Extra notes, no Sounds change); again, Back to full
   * from the next pass. Laptop only, never the iPad.
   */
  const playerNameRef = useRef<string | null>(null);
  playerNameRef.current = activePlayer?.name ?? null;
  const toggleSimplify = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !runningRef.current) return;
    const on = engine.getSimplify() !== 'on';
    engine.setSimplified(on);
    const now = engine.getSimplify();
    setSimplify(now);
    const bed = engine.getSimplifyBed();
    setSimplifyBed(bed);
    const line = on
      ? `${simplifiedLine(playerNameRef.current, bed === null ? null : loopLabel(configRef.current.loopNames, bed))}.`
      : now === 'off' ? 'Back to full.' : 'Back to full from the next pass.';
    announce(line);
    setBoardNotice(on ? 'Simplified' : 'Back to full');
    sessionLogRef.current.action(logActorRef.current, on ? 'simplify' : 'back to full');
  }, [announce, engineRef, runningRef]);
  const toggleSimplifyRef = useRef(toggleSimplify);
  toggleSimplifyRef.current = toggleSimplify;

  // Keeping time, looked at twice a second while the board plays: a problem is said once
  // and shown quietly on the laptop; nothing is shown while all is well. The log gets a
  // sample every 30 s.
  useEffect(() => {
    if (!running) return undefined;
    timeSeenRef.current = TIME_SEEN_NONE;
    timingLoggedAtRef.current = performance.now();
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const view: TimeView = { report: engine.getKeepingTime(), valve: engine.getValveSteps() };
      const news = keepingTimeNews(timeSeenRef.current, view.report, view.valve);
      timeSeenRef.current = news.seen;
      if (news.say.length > 0) {
        announce(news.say.join(' '));
        for (const line of news.say) sessionLogRef.current.action('laptop', line);
      }
      if (performance.now() - timingLoggedAtRef.current >= TIMING_SAMPLE_MS) {
        timingLoggedAtRef.current = performance.now();
        sessionLogRef.current.timing(view.report);
      }
      setTimeNow((prev) => (timeViewKey(prev) === timeViewKey(view) ? prev : view));
      const sim = engine.getSimplify();
      setSimplify((prev) => (prev === sim ? prev : sim));
      const bed = engine.getSimplifyBed();
      setSimplifyBed((prev) => (prev === bed ? prev : bed));
    }, KEEPING_TIME_POLL_MS);
    return () => window.clearInterval(id);
  }, [running, announce, engineRef]);

  const handleSelectSong = useCallback(async (id: string) => {
    setSelectedSongId(id);
    if (!id) {
      songEngineRef.current?.stopPlayback();
      setSongStatus('idle');
      return;
    }
    const song: SongConfig | undefined = SONG_LIBRARY.find((s) => s.id === id);
    if (!song) {
      setSongStatus('idle');
      return;
    }
    if (!songEngineRef.current) songEngineRef.current = new SongPresetEngine();
    setSongStatus('loading');
    try {
      await Tone.start();
      await songEngineRef.current.loadSong(song);
      setSongStatus('loaded');
    } catch (err) {
      // NOT setError: that one means the camera, and reporting a song problem there told
      // the player their camera was broken and locked every set-up step behind it.
      setSoundError(err instanceof Error ? err.message : 'Song failed to load');
      setSongStatus('error');
    }
  }, []);

  const startEngine = useCallback(async (generation: number, piece: PieceStart | null) => {
    await Tone.start();
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    // The opening scene (at 0:00), when the clock starts with Play, is in place BEFORE the
    // first note: its loops play from the first beat and its sound is the one the engine
    // is built with. Applied on the first clock tick instead, its loops waited a whole pass.
    const home = configRef.current;
    // ▶ Play just plays: the piece (its clock, scenes, band and loops) starts only from
    // Show's "Start the piece", "Rehearse from here" or Carry on — each of which passes
    // `piece`. Play used to start the piece whenever one existed, so making a loop or trying
    // drums alone got the opening scene's band and loops, and loops changing at 1:30.
    // Rehearsing from a scene, or carrying on, the clock starts part-way.
    const clockOn = piece !== null;
    const startSec = piece?.fromSec ?? 0;
    // "On now" comes from the plan at every start, never from before (R2-T2-01); carrying
    // on, the scene that was on wins when it is later than the plan's.
    const openingIndex = piece !== null ? openingScene(home.scenes, startSec, piece.scene ?? null) : null;
    const opening = openingIndex !== null ? home.scenes[openingIndex] ?? null : null;
    const cfg: BoardSequencerStored = opening ? { ...home, ...opening.settings, currentScene: openingIndex }
      : clockOn ? { ...home, currentScene: null } : home;
    if (opening) {
      // Wanted and shown together, before the sound loads: the iPad (and the loop list) show
      // the opening loops on while it does. Shown off, a tap meant to turn one on turned it
      // off, and the scene opened without its loop.
      wantedRef.current = new Set(opening.loops.filter((sl) => (home.loopSlots[sl] ?? null) !== null));
      setWantedSlots([...wantedRef.current].sort((a, b) => a - b));
    }
    const video = videoRef.current;
    // The laptop board has no camera picture to map, and a laptop that has never seen
    // the real board has no corners to map it with.
    if (cfg.boardSource !== 'laptop' && video && !homographyRef.current) {
      const shown = orientedSize(video.videoWidth, video.videoHeight, cfg.cameraRotation);
      homographyRef.current = homographyForCorners(cfg.corners, shown.width, shown.height);
    }
    modeRef.current = new BoardSequencerMode({
      settleWindowMs: cfg.settleWindowMs,
      velocityFloor: cfg.velocityFloor,
      velocitySmoothing: cfg.velocitySmoothing,
      occupancyGraceMs: cfg.occupancyGraceMs,
      motionConfirmMs: cfg.motionConfirmMs,
      variationEnabled: cfg.variationEnabled,
      variationOffsetThreshold: cfg.variationOffsetThreshold,
    });
    // Counters already on the board play from step 1 of the first pass: they were placed
    // before Play, so they don't have to settle all over again.
    modeRef.current.setTwoCounters(cfg.twoCounterMode === 'both');
    modeRef.current.primeSettled(latestFrameRef.current?.readings ?? []);
    const engine = new BoardSequencerEngine({
      bpm: cfg.bpm, rows: cfg.rows, cols: cfg.cols,
      scaleRootMidi: cfg.scaleRootMidi, scaleSemitones: cfg.scaleSemitones, swing: cfg.swing,
      humanize: cfg.humanize,
      noteLengthBeats: cfg.noteLengthBeats, velocity: cfg.velocity,
      tickEnabled: cfg.tickEnabled, studioMix: cfg.studioMix,
      soundWorld: cfg.soundWorld, phrases: cfg.phrases, fillEngine: cfg.fillEngine, band: cfg.band,
      chords: cfg.chords, clashNudge: cfg.clashNudge, bandJobs: cfg.bandJobs, keepOnTop: cfg.keepOnTop, keepOnTopDb: cfg.keepOnTopDb,
      sceneEnergy: cfg.sceneEnergy,
      channels: cfg.channels, faderAxis: cfg.faderAxis, variationEnabled: cfg.variationEnabled,
      loopStepsRed: cfg.loopStepsRed, loopStepsBlack: cfg.loopStepsBlack,
      loopStepsBlue: cfg.loopStepsBlue, numPages: cfg.numPages,
      octaveShift: cfg.octaveShift, volume: cfg.volume,
      pingPong: cfg.pingPong, pingPongPages: cfg.pingPongPages,
      toggleAmount: cfg.toggleAmount, controlGlideSec: cfg.controlGlideSec,
    });
    // Sound from Ableton: ADMI's own sound is off from the very start, not switched off
    // a moment after Play (that let a blip of it through).
    const port = midiPortRef.current;
    engine.setInternalSound(effectiveSound(cfg, port.portConnected, port.holdOnAdmi).internal);
    // Magenta's ideas, kept with the scene they were made in, for the next run.
    engine.setOnIdeaKept((owner, idea) => {
      setConfig((prev) => {
        if (!prev.scenes.some((sc) => sc.id === owner)) return prev;
        return { ...prev, scenes: prev.scenes.map((sc) => (sc.id === owner ? { ...sc, aiIdeas: keepIdea(sc.aiIdeas ?? [], idea) } : sc)) };
      });
    });
    await engine.init();
    // Stop — or Stop then Play again — may have been pressed while the samples loaded. This
    // start is then no longer wanted: drop its engine before it is started or put where
    // Stop can find it, and touch nothing else. Checked later, a newer start could already
    // be playing, and clearing engineRef would leave that one with nothing able to stop it.
    if (startingRef.current !== generation) {
      engine.dispose();
      return;
    }
    // Every setting (where the sound goes included) before start(), which sends the
    // receiving end its opening Expression.
    applyEngineSettings(engine, forEngine(cfg, newLoopRef.current), midiPortRef.current);
    engine.setMuted(mutedRef.current);
    // Pattern chaining: load captured page snapshots + the live (selected) page.
    engine.setPages(cfg.pages as ActiveCell[][]);
    engine.setSelectedPage(selectedPageRef.current);
    // Lock to the backing song (tempo/beat + chords) if one is loaded.
    const songEngine = songEngineRef.current;
    if (songEngine && songStatusRef.current === 'loaded') {
      const loaded = songEngine.getSong();
      const prog = loaded?.chordProgression ?? null;
      engine.setSyncSource({
        getTime: () => songEngine.getCurrentTime(),
        beats: loaded?.beats ?? [],
        chordAt: (tt) => (prog && prog.length ? getChordAtTime(prog, tt) : null),
      });
      songEngine.stopPlayback();
      songEngine.play();
    } else {
      engine.setSyncSource(null);
    }
    // The first beat waits for the board's first reading (a frame or so): until then the
    // engine doesn't know which counters are down, and step 1 went by in silence.
    engine.start({ waitForBoard: true });
    engineRef.current = engine;
    // One pad per cell of the loop lane — a row of steps or a column of rows.
    loopBankRef.current = seedLoopBank(
      zoneSlotCount(cfg.loopZone, cfg.rows, cfg.cols), cfg.loopSlots, loopBankRef.current,
    );
    engine.setActiveLoops([]);
    {
      engine.setLaunchFade(Math.round(cfg.loopFadePasses * cfg.cols * Math.max(1, cfg.numPages)));
      const slots = loopsToPlay(newLoopRef.current, wantedRef.current, cfg).filter((s) => (cfg.loopSlots[s] ?? null) !== null);
      const played = slots.map((s) => loopChannelsFor(cfg.loopSlots[s] ?? [], cfg.channels));
      const loopColours = [...new Map(played.flatMap((l) => l.channels).map((c) => [c.id, c])).values()];
      engine.setLaunchedLoops(slots, played.map((l) => l.cells), loopColours);
    }
    // Stop may have been pressed while the samples were loading; the engine that is no
    // longer wanted is disposed rather than left playing with nothing able to stop it.
    if (startingRef.current !== generation) {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      return;
    }
    startSecRef.current = Tone.now();
    // The speed starts where the engine is built: the opening scene's, at once (there is
    // nothing to glide from). Which colours wait is looked at afresh on the first tick, so
    // one already in at the start (Rehearse from here) is never said to come in.
    speedGlideRef.current = startGlide(cfg.bpm, cfg.bpm, 0, performance.now());
    glideLandedRef.current = true;
    waitingIdsRef.current = null;
    runningRef.current = true;
    // Carrying on keeps the piece's first start, so its end never moves: started again once
    // the sound was ready, every Carry on ran the piece over by the time that took.
    const firstStart = piece?.startedAt ?? Date.now() - startSec * 1000;
    clockStartRef.current = clockOn ? performance.now() - (Date.now() - firstStart) : null;
    if (clockOn) pieceStartedAtRef.current = performance.now();
    if (clockOn) rememberPieceRunning(firstStart, home.performance.lengthSec);
    if (clockStartRef.current !== null) homeSettingsRef.current = sceneSettingsOf(home);
    // The opening scene sets everything: a strip the player moved before the piece is no
    // longer theirs to keep from the next scene.
    if (clockOn) stripsTouchedRef.current = new Set();
    // The opening scene is already in: the clock must not bring it in again.
    // From part-way: the scenes and cues before that moment are already past, not due; any
    // that came due while the sound loaded come in on the first tick.
    clockPrevRef.current = startSec > 0
      ? { remaining: home.performance.lengthSec - startSec, elapsed: startSec }
      : { remaining: Infinity, elapsed: opening ? 0 : CLOCK_NOT_STARTED };
    if (opening) {
      setConfig((prev) => ({ ...prev, ...opening.settings, currentScene: openingIndex }));
      setBoardNotice(`Scene: ${opening.name}`);
    } else if (clockOn) setConfig((prev) => (prev.currentScene === null ? prev : { ...prev, currentScene: null }));
    autoEndedRef.current = false;
    hardStoppedRef.current = false;
    endingRef.current = false;
    setEnding(false);
    setClock(clockView(clockStartRef.current, performance.now(), cfg.performance.lengthSec, false));
    loopColourRef.current = initialLoopColourState();
    counterWantedRef.current = new Set();
    loopTickRef.current = null;
    sessionLogRef.current.start(activePlayer?.name ?? 'Player', cfg as unknown as Record<string, unknown>, engine.audibleNow());
    if (opening) sessionLogRef.current.action(logActorRef.current, `scene ${opening.name}`);
    setLogCounts(sessionLogRef.current.counts());
    setRunning(true);
  }, [engineRef, homographyRef, loopBankRef, modeRef, runningRef, startingRef, videoRef]);

  // Whether Show is open, for the piece remembered across a reload (when there is one).
  useEffect(() => { if (running) rememberShowing(view === 'bigBoard'); }, [view, running]);
  // And which scene is on, so a Next taken before a reload isn't lost.
  useEffect(() => { if (running) rememberScene(config.currentScene); }, [config.currentScene, running]);
  // The reload banner's times count on while it waits (they were frozen at the reload).
  // Once Carry on would come too close to the ending, the offer changes at once to the
  // piece having ended; once the piece would be over, it goes: carrying on from the end is
  // no piece.
  const [, setBannerTick] = useState(0);
  useEffect(() => {
    if (!resumeFrom || running) return undefined;
    const id = window.setInterval(() => {
      const offer = reloadOffer(readPieceRunning(), Date.now(), endingLeadOf(configRef.current));
      if (offer === 'carryOn') { setBannerTick((n) => n + 1); return; }
      setResumeFrom(null);
      if (offer === 'ended') setEndedNotice(true);
    }, 250);
    return () => window.clearInterval(id);
  }, [resumeFrom, running]);
  // Space does nothing while the offer (or the line saying the piece has ended) is on screen.
  const reloadNoticeRef = useRef(false);
  reloadNoticeRef.current = (resumeFrom !== null || endedNotice) && !running;
  // The offer takes focus when it appears, so Space or Enter on it is ▶ Carry on; the line
  // that the piece has ended is read out, and Space there does nothing. Only from the page
  // or Show itself: focus somewhere else is left where it is.
  const reloadKind = running ? null : resumeFrom !== null ? 'carryOn' : endedNotice ? 'ended' : null;
  useEffect(() => {
    if (reloadKind === null) return;
    if (!focusDropped() && document.activeElement !== bigBoardRef.current) return;
    (reloadKind === 'carryOn' ? carryOnRef.current : endedLineRef.current)?.focus();
  }, [reloadKind]);

  /** Rehearse from a point in the piece: Play, with the clock already at `sec`. */
  const rehearseFrom = (sec: number): void => {
    if (runningRef.current) return;
    // The piece and a new loop never run together (F2): starting the piece ends it.
    if (newLoopRef.current) leaveNewLoop();
    announce(`Rehearsing from ${formatClock(sec)}.`);
    void start({ fromSec: sec });
  };

  /** ▶ Play (no `piece`: plain play), or a start of the piece, its clock from `piece.fromSec`. */
  const start = useCallback(async (piece: PieceStart | null = null) => {
    if (startingRef.current) return;
    boardCheckAbortRef.current?.abort();
    setBoardCheck(null);
    startingRef.current = performance.now();
    const generation = startingRef.current;
    setStarting(true);
    pieceStartingRef.current = piece !== null;
    setPieceStarting(piece !== null);
    if (piece !== null) {
      // A new start of the piece takes the place of the one remembered across a reload.
      setResumeFrom(null);
      setEndedNotice(false);
    }
    setSoundError(null);
    try {
      await startEngine(generation, piece);
    } catch (err) {
      // Without this the button simply did nothing: no sound, no error, no reason — and
      // the player presses it again and again.
      const text = err instanceof Error ? err.message : 'The sound could not be started.';
      setSoundError(text);
      announce(`Could not start. ${text}`);
      stop();
    } finally {
      if (startingRef.current === generation) {
        startingRef.current = null;
        pieceStartingRef.current = false;
      }
      setStarting(startingRef.current !== null);
      setPieceStarting(pieceStartingRef.current);
    }
  }, [startEngine, startingRef, stop, announce]);

  // Anything that stops a piece: while the performance clock runs, one press (or one
  // Space) only arms it, and a second press of the same button within a few seconds does
  // it. A stray key or tap — Stop, ← Exit or ⚙ Set up — must not end the show.
  const [armed, setArmed] = useState<'stop' | 'exit' | 'setup' | null>(null);
  const armedRef = useRef<{ what: 'stop' | 'exit' | 'setup'; at: number } | null>(null);
  const confirmThen = useCallback((what: 'stop' | 'exit' | 'setup', act: () => void): void => {
    const a = armedRef.current;
    const pieceRunning = runningRef.current && clockStartRef.current !== null;
    // Just started: a press now is Enter landing again after Start, never a wish to stop (B3).
    if (what === 'stop' && pieceRunning && stopGuarded(pieceStartedAtRef.current, performance.now())) return;
    if (pieceRunning && (a === null || a.what !== what || performance.now() - a.at > pressAgainMs(configRef.current.pressAgainSec))) {
      const at = performance.now();
      armedRef.current = { what, at };
      setArmed(what);
      announce(what === 'stop' ? 'The piece is running. Press Stop again to stop it.'
        : what === 'exit' ? 'The piece is running. Press Exit again to stop it and leave.'
          : 'The piece is running. Press Set up again to stop it and set up.');
      window.setTimeout(() => {
        if (armedRef.current?.at === at) {
          armedRef.current = null;
          setArmed(null);
        }
      }, pressAgainMs(configRef.current.pressAgainSec));
      return;
    }
    armedRef.current = null;
    setArmed(null);
    act();
  }, [announce, runningRef]);
  const requestStop = useCallback((): void => confirmThen('stop', stop), [confirmThen, stop]);
  const stopArmed = armed === 'stop';

  // Space starts and stops the board in Play and Show (spaceAction says what it does). The
  // global handler in App.tsx stands down on this screen, so this is the only one listening.
  const startThePieceRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || e.repeat) return;
      if (!spaceTogglesPlay(view, e.target, configRef.current.spaceKeyOn)) return;
      e.preventDefault();
      const act = spaceAction(view, e.target, {
        running: runningRef.current, offerShowing: reloadNoticeRef.current,
        msSinceStop: performance.now() - stoppedAtRef.current,
        msSincePieceEnded: performance.now() - pieceEndedAtRef.current,
        pieceOn: clockStartRef.current !== null || endingRef.current || pieceStartingRef.current,
        spaceOn: configRef.current.spaceKeyOn,
      });
      if (act === 'none' && !runningRef.current) startRefused();
      if (act === 'stop') requestStop();
      else if (act === 'play') void start();
      else if (act === 'startPiece') startThePieceRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, start, requestStop, runningRef]);
  // Shift+S: Simplify and Back to full, in Play and Show (never by accident, never while typing).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!simplifyKey(e, view, e.target, runningRef.current)) return;
      e.preventDefault();
      toggleSimplifyRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, runningRef]);

  // Changing orientation or camera invalidates calibration (it was captured in the
  // old view), so force a fresh corner click in the new space.
  /**
   * Turn the camera picture a quarter turn, for a camera mounted on its side. Unlike the
   * mirrors this keeps the board: the saved corners are turned with the picture, so they
   * stay on the same physical corners and nothing has to be tapped again.
   */
  const turnCamera = useCallback(() => {
    homographyRef.current = null;
    trackedCornersRef.current = null;
    setConfig((prev) => {
      const from = orientationOf(prev);
      const cameraRotation = (((prev.cameraRotation + 1) % 4) as QuarterTurns);
      const corners = prev.enabled
        ? reorientPoints(prev.corners, from, { ...from, rotation: cameraRotation }) as BoardSequencerStored['corners']
        : prev.corners;
      return { ...prev, cameraRotation, corners };
    });
    announce('Picture turned a quarter turn.');
  }, [announce, homographyRef]);

  const changeView = useCallback((patch: Partial<BoardSequencerStored>) => {
    // This turns detection off (enabled: false tears down the frame loop). Leaving the
    // engine running would loop the last settled pattern with no camera behind it, and
    // Set up has no Stop button to escape with.
    stop();
    homographyRef.current = null;
    trackedCornersRef.current = null;
    setConfig((prev) => {
      const next = {
        ...prev, ...patch,
        corners: DEFAULT_BOARD_SEQUENCER_CONFIG.corners,
        enabled: false,
      };
      return next;
    });
    setCalibrating('tap');
  }, [stop]);

  // Pick a different camera (external webcam, phone app, …). A new camera sees the
  // board from a different place, so the corners are re-clicked; colours are kept
  // but usually need recalibrating because each camera renders colour differently.
  const changeCamera = useCallback((deviceId: string) => {
    // Tapping the camera that is already chosen is not a change. It used to run the whole
    // "new camera" path anyway, which throws the board calibration away — so opening
    // Camera just to check the picture and touching the selected row destroyed it.
    if (deviceId === configRef.current.cameraDeviceId) return;
    const label = cameras.find((c) => c.deviceId === deviceId)?.label ?? '';
    fellBackRef.current = false; // an explicit choice supersedes any fallback
    setLastSample(null);
    setFeedSaturation(null);
    setFeedColourless(false);
    setCamNotice(configRef.current.channels.length > 0
      ? {
        kind: 'changed',
        text: 'Camera changed: click the four board corners, then press ⟳ on each colour and click its piece again.',
      }
      : null);
    changeView({ cameraDeviceId: deviceId, cameraLabel: label });
  }, [cameras, changeView, configRef]);

  // Average HSV under a click (in displayed space). Draws the frame with the
  // same mirror transforms so a click on the displayed video samples the right
  // pixels.
  const sampleAvgHsvAt = useCallback((nx: number, ny: number): {
    h: number; s: number; v: number; hex: string; pixels: { h: number; s: number; v: number }[];
  } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) return null;
    const cfg = configRef.current;
    const { width: w, height: h } = orientedSize(video.videoWidth, video.videoHeight, cfg.cameraRotation);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    drawOriented(ctx, video, w, h, orientationOf(cfg));
    const px = Math.min(w - 1, Math.max(0, Math.round(nx * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(ny * h)));
    const R = 10;
    const x0 = Math.max(0, px - R);
    const y0 = Math.max(0, py - R);
    const sw = Math.min(2 * R, w - x0);
    const sh = Math.min(2 * R, h - y0);
    const { data } = ctx.getImageData(x0, y0, sw, sh);
    // Seed the sample from the CENTRAL patch (the click lands on the counter), so
    // vivid tan wood at the region's edges — or a washed-out external webcam —
    // can't hijack it. Then average the counter's hue for a clean swatch.
    const c = counterColourFromRegion(data, sw, sh);
    if (!c) return null;
    // The disc right under the tap: on a counter, every one of these is the counter.
    const pixels: { h: number; s: number; v: number }[] = [];
    const cx = px - x0;
    const cy = py - y0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > TAP_PIXEL_RADIUS ** 2) continue;
        const i = (y * sw + x) * 4;
        pixels.push(rgbToHsv(data[i], data[i + 1], data[i + 2]));
      }
    }
    return { h: c.h, s: c.s, v: c.v, hex: rgbToHex(c.r, c.g, c.b), pixels };
  }, []);

  // A camera click while calibrating: sample the piece's colour, then either add
  // a new channel or update the one being recalibrated. The kind (hue/black/
  // white) is inferred from the sample, and the swatch shows the real colour.

  const sampleColourClick = useCallback((nx: number, ny: number) => {
    if (!colourCalibRef.current) return;
    const s = sampleAvgHsvAt(nx, ny);
    if (!s) return;
    // Same treatment the automatic search gets: tighten the band until it stops matching
    // the board, and say so if it can't be separated from it.
    const board = knownBoardColours();
    const fitted = board ? fitSafeBand({ h: s.h, s: s.s, v: s.v }, board, s.pixels) : null;
    const cal = fitted?.band ?? calibrationFromHsv({ h: s.h, s: s.s, v: s.v });
    // Nothing is saved on a tap: the sample is shown first, so a mis-tap on the wood
    // doesn't quietly become a colour.
    const sample = {
      hex: s.hex, h: s.h, s: s.s, v: s.v, kind: cal.kind,
      unsafe: fitted?.unsafe === true,
      at: { x: nx, y: ny },
      pixels: s.pixels,
      keeps: bandKeeps(cal, s.pixels),
    };
    setLastSample(sample);
    setPendingColour(sample);
  }, [sampleAvgHsvAt, boardColoursNow]);

  /** Sample the centre of the square the keyboard picker is on (no pointer needed). */
  const sampleSquare = useCallback(() => {
    const pick = squarePicker;
    if (!pick) return;
    const cfg = configRef.current;
    const p = squareCentreToImage(cfg.corners, cfg.boardSquares, pick.row, pick.col);
    sampleColourClick(p.x, p.y);
  }, [squarePicker, sampleColourClick]);

  /**
   * The board's own colours: the ones learnt from the EMPTY board if we have them, and
   * otherwise whatever can be inferred from the picture as it is now.
   *
   * The stored ones are much better evidence. Inferring from a frame with counters on it
   * means guessing which squares are board in the first place, and a square the guess
   * gets wrong becomes a "counter colour" that lights up bare wood.
   */
  const knownBoardColours = useCallback((): { h: number; s: number; v: number }[] | null => {
    const stored = configRef.current.boardColours;
    return stored.length > 0 ? stored : boardColoursNow();
  }, [configRef, boardColoursNow]);

  /** Apply the sample the player accepted, as a new colour or a recalibration. */
  const commitPendingColour = useCallback(() => {
    const target = colourCalibRef.current;
    const sample = pendingColour;
    if (!target || !sample) return;
    // Re-fit against the board at commit time too, so the band that is SAVED is the one
    // the player was shown as safe.
    const board = knownBoardColours();
    const cal = board
      ? fitSafeBand({ h: sample.h, s: sample.s, v: sample.v }, board, sample.pixels).band
      : calibrationFromHsv({ h: sample.h, s: sample.s, v: sample.v });
    setConfig((prev) => {
      let channels: ColourChannel[];
      if (target.mode === 'new') {
        // Skip ids still named by any player's saved pages/loops, or those cells
        // would silently adopt the new colour.
        const id = freshChannelId(prev.channels.map((c) => c.id), allReferencedChannelIds());
        channels = [...prev.channels, {
          id, kind: cal.kind, role: suggestRole(prev.channels, { kind: cal.kind }), swatch: sample.hex,
          band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand,
        }];
      } else {
        channels = prev.channels.map((c) => (c.id === target.id ? recalibratedChannel(c, cal, sample.hex) : c));
      }
      // A new player's new melody, bass or chords colour plays a tune.
      const next = { ...prev, channels: channels.map((c) => withTuneDefault(c, prev.tunesForNewColours)) };
      return next;
    });
    setPendingColour(null);
    setColourCalib(null);
    setSquarePicker(null);
  }, [pendingColour]);

  /** Arming the picker also puts the square cursor in the middle, so the no-pointer
   *  path (arrows + Sample this square) is available without hunting for it. */
  const armPicker = useCallback(() => {
    const mid = Math.floor(configRef.current.boardSquares / 2);
    setPendingColour(null);
    setSquarePicker({ row: mid, col: mid });
  }, []);
  const addColour = useCallback(() => {
    armPicker();
    setColourCalib({ mode: 'new' });
  }, [armPicker]);
  const recalibrateChannel = useCallback((id: ColourId) => {
    armPicker();
    setColourCalib((t) => (t && t.mode === 'recal' && t.id === id ? null : { mode: 'recal', id }));
  }, [armPicker]);
  const setChannelRole = useCallback((id: ColourId, role: ColourRole) => {
    setConfig((prev) => {
      // Given melody, bass or chords by a player who starts with tunes: a tune, unless chosen.
      const next = { ...prev, channels: prev.channels.map((c) => (c.id === id ? withTuneDefault({ ...c, role }, prev.tunesForNewColours) : c)) };
      return next;
    });
  }, []);
  const setChannelBlackDarkness = useCallback((id: ColourId, maxValue: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        channels: prev.channels.map((c) => (c.id === id
          ? { ...c, blackBand: { maxValue, maxSaturation: c.blackBand?.maxSaturation ?? 45 } }
          : c)),
      };
      return next;
    });
  }, []);
  const removeChannel = useCallback((id: ColourId) => {
    setColourCalib((t) => {
      if (t && t.mode === 'recal' && t.id === id) {
        // Its pending sample has nowhere to go now, so it must not sit there with a
        // dead Add button.
        setPendingColour(null);
        setSquarePicker(null);
        return null;
      }
      return t;
    });
    setConfig((prev) => {
      const next = {
        ...prev, channels: prev.channels.filter((c) => c.id !== id), colourComesInAt: withColourEntry(prev.colourComesInAt, id, null),
      };
      return next;
    });
  }, []);
  const clearChannels = useCallback(() => {
    setColourCalib(null);
    setPendingColour(null);
    setSquarePicker(null);
    setConfig((prev) => {
      const next = { ...prev, channels: [], colourComesInAt: {} };
      return next;
    });
  }, []);
  /** What removing these colours does to every player's loops and pages: this player's as they are now. */
  const colourUsesNow = (ids: readonly ColourId[]): ColourUses => colourUses([
    { player: null, work: configRef.current },
    ...savedPlayersWork().filter((w) => w.id !== activePlayer?.id).map((w) => ({ player: w.name, work: w.work })),
  ], new Set(ids));

  // Per-render derived: the calibrated channels, whether any drums (drives the
  // per-row drum picker), and a colour-id → channel lookup for labels/swatches.
  const channels = config.channels;
  const channelById = new Map(channels.map((c) => [c.id, c]));
  // Every drawn cell: a colour as itself, a loop's colour as today's colour for that sound,
  // and a colour that is gone as grey — never a colour that means something else.
  const swatchFor = useCallback((id: string): string => loopSwatch(id, channels), [channels]);
  // Which beats each counter playing a tune owns — recomputed only when the board changes.
  // A one-note counter owns only its own step, so it gets no band.
  const spans = useMemo(
    () => (config.phrases
      ? phraseSpans(active, config.cols, (id) => {
        const ch = config.channels.find((c) => c.id === id);
        return isSequencedRole(ch?.role ?? 'off') && playsTune(ch, true);
      })
      : []),
    [config.phrases, active, config.cols, config.channels],
  );
  const labelForId = (id: ColourId) => {
    const c = channelById.get(id);
    return c ? describeChannel(c) : loopColourLabel(id) ?? id;
  };
  channelNameRef.current = labelForId;
  const calibLabel = colourCalib === null ? ''
    : colourCalib.mode === 'new' ? 'a new colour'
      : labelForId(colourCalib.id);

  // ---- Redesigned frame: player, theme, view routing --------------------------------
  const palette = BOARD_TOKENS.calm[config.themeMode];
  const layout = layoutFor(config.handedness, viewportWidth, uiSize === 'large' ? 'large' : 'standard');

  // Sound problems (a backing song, the audio engine) are reported apart from camera
  // problems, because they block completely different things.
  const camera: CameraStatus = {
    phase: error !== null ? 'error'
      : fellBackRef.current ? 'fallback'
        : camInfo !== null ? 'running' : 'starting',
    colourless: feedSaturation === null ? null : feedColourless,
  };
  // On the laptop board there is no camera or board to find: both count as done.
  const setupCfg = { enabled: config.enabled || laptop, channels: config.channels };
  const cameraGate: typeof camera = laptop ? { phase: 'running', colourless: false } : camera;
  // Once per visit, when the camera is up: is the board still where it was?
  const cameraUp = camera.phase === 'running' || camera.phase === 'fallback';
  useEffect(() => {
    if (!shouldCheckBoard({ checked: boardCheckedRef.current, view, laptop, enabled: config.enabled, cameraUp, running, chooserOpen })) return;
    boardCheckedRef.current = true;
    void checkBoard();
  }, [view, laptop, config.enabled, cameraUp, running, chooserOpen, checkBoard]);
  // The header's one notice, most urgent first; Change camera only beside a camera problem.
  const { notice: headerNotice, changeCamera: cameraHeaderNotice } = headerNoticeFor({
    saveFailed, otherTab, guarded: savingGuarded(), error, soundError, laptop, camNotice,
  });

  const playReason = canPlay(setupCfg, cameraGate)
    ? null
    : !config.enabled ? 'Find the board first.'
      : camera.phase === 'error' ? "The camera isn't working."
        : 'Give at least one colour a job first.';

  // One writer per parameter: a control counter disables the matching screen control.
  const owners = controlOwners(config.channels);
  const volumeReason = disabledReason('volume', owners);
  const fillReason = disabledReason('fill', owners);
  const evolveReason = disabledReason('evolve', owners);
  const tempoReason = disabledReason('tempo', owners, songStatus === 'loaded' && selectedSongId !== '');
  const controlChannels = config.channels.filter((c) => isFaderRole(c.role));


  // The Play tabs: the same controls as the old rail, grouped by what the player is
  // thinking about — the feel, the sounds, and the loops.
  // While playing, the grid can't change under the playhead: said, not just greyed out.
  const gridReason = running ? 'Stop playing to change this.' : null;
  const grooveTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
      <LabeledSlider
        label={WORDS.speed} min={50} max={300} value={config.bpm} display={`${config.bpm} BPM`}
        reason={tempoReason}
        onChange={(v) => { update({ bpm: v }); holdSpeed(v); engineRef.current?.setBpm(v); /* live, not only on the next start */ }}
      />
      {/* One swing, said once (A2): Sound → Groove sets these two in one step, here they are fine. */}
      <Note>
        Sound → Overall feel → Groove (Straight, Swung, Lazy) sets Swing and Loose timing in one step. Here they are set finely.
      </Note>
      <LabeledSlider
        label="Swing" min={0} max={60} value={Math.round(config.swing * 100)} display={`${Math.round(config.swing * 100)}%`}
        onChange={(v) => { update({ swing: v / 100 }); engineRef.current?.setSwing(v / 100); }}
      />
      <LabeledSlider
        label={WORDS.looseTiming} min={0} max={100} value={Math.round(config.humanize * 100)} display={`${Math.round(config.humanize * 100)}%`}
        onChange={(v) => { update({ humanize: v / 100 }); engineRef.current?.setHumanize(v / 100); }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Loop length per part</span>
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
          Off = all {config.cols} steps. A shorter loop drifts against the others.
        </span>
        {config.phrases && (
          <span role="note" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>
            Colours playing a tune (Sound tab) fill the whole loop: leave their part Off, or the parts fight each other.
          </span>
        )}
        {POLY_ROLES.map(({ role, field, label }) => (
          <div key={role} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>{label}</span>
            <SegmentedControl<number>
              label={`${label} loop length`}
              value={config[field]}
              onChange={(n) => {
                update({ [field]: n } as Partial<BoardSequencerStored>);
                engineRef.current?.setLoopSteps(role, n);
              }}
              options={[{ value: 0, label: 'Off' }, ...[2, 3, 4, 5, 6, 7, 8].filter((n) => n <= config.cols).map((n) => ({ value: n, label: String(n) }))]}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 600 }}>The grid</span>
        {([
          { label: 'Rows', value: config.rows, choices: [2, 3, 4, 5, 6, 7, 8], set: (n: number) => updateGrid({ rows: n }) },
          { label: 'Steps', value: config.cols, choices: [2, 3, 4, 5, 6, 7, 8, 10, 12, 16], set: (n: number) => updateGrid({ cols: n }) },
          { label: WORDS.pages, value: config.numPages, choices: [1, 2, 4], set: (n: number) => setPagesCount(n) },
        ]).map((g) => (
          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>{g.label}</span>
            <SegmentedControl<number>
              label={g.label} value={g.value} disabled={gridReason !== null}
              onChange={g.set}
              options={g.choices.map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
        ))}
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
          {`${WORDS.pages}: 1 is the board alone. 2 or 4 keeps the board as pages A, B…, played one after another.`}
        </span>
        <span style={REASON_STYLE}>{gridReason ?? ''}</span>
      </div>

      {config.numPages > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
            The selected page (●) plays live; Capture freezes it and moves on. The loop is {config.numPages * config.cols} steps.
          </span>
          <div role="group" aria-label="Pages" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Array.from({ length: config.numPages }, (_, i) => {
              const isSel = i === selectedPage;
              const isPlaying = running && i === playingPage;
              const hasSnapshot = (config.pages[i]?.length ?? 0) > 0;
              return (
                <Button
                  key={i}
                  tone={isSel ? 'primary' : 'secondary'}
                  aria-pressed={isSel}
                  aria-label={`Page ${String.fromCharCode(65 + i)}${isSel ? ', selected' : ''}${isPlaying ? ', playing' : ''}${hasSnapshot ? '' : ', empty'}`}
                  onClick={() => selectPage(i)}
                  style={{ outline: isPlaying ? '3px solid var(--bs-ok)' : undefined, opacity: hasSnapshot || isSel ? 1 : 0.6 }}
                >
                  {`${String.fromCharCode(65 + i)}${isSel ? ' ●' : ''}${isPlaying ? ' ▶' : ''}`}
                </Button>
              );
            })}
          </div>
          <Button tone="secondary" onClick={capturePage} reason={running ? null : 'Play first, then capture the board.'}>
            {`Capture board → Page ${String.fromCharCode(65 + selectedPage)}`}
          </Button>
        </div>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
        <span style={{ fontWeight: 600 }}>Backing song</span>
        <select
          value={selectedSongId} disabled={running}
          onChange={(e) => void handleSelectSong(e.target.value)}
          style={{ minHeight: 'var(--bs-target)' }}
        >
          <option value="">None</option>
          {SONG_LIBRARY.map((sg) => (
            <option key={sg.id} value={sg.id}>{sg.title}</option>
          ))}
        </select>
        <span style={REASON_STYLE}>{running ? 'Stop playing to change the song.' : ''}</span>
      </label>
      {selectedSongId && (
        <p style={{ fontSize: 14, color: 'var(--bs-fg2)', margin: 0 }}>
          {songStatus === 'loading' && 'Loading song…'}
          {songStatus === 'loaded' && 'Song ready: the board locks to its tempo and chords.'}
          {songStatus === 'error' && 'The song failed to load.'}
        </p>
      )}
    </div>
  );


  // ---- actions shared by the Sound tab and the iPad remote ----

  const newFillIdea = (): void => {
    const c = configRef.current;
    setPrevFillSeed(c.fillSeed);
    // A new idea for the board as it is now, so it follows the board again.
    update({ fillSeed: Math.floor(Math.random() * 2 ** 31), fillKept: null, fillAmount: c.fillAmount > 0 ? c.fillAmount : 0.5 });
    sessionLogRef.current.action(logActorRef.current, 'new idea');
    announce('New idea.');
  };
  const newEvolveSound = (): void => {
    const c = configRef.current;
    setPrevEvolveSeed(c.evolveSeed);
    update({ evolveSeed: Math.floor(Math.random() * 2 ** 31), evolveHoldLap: null, evolveAmount: c.evolveAmount > 0 ? c.evolveAmount : 0.5 });
    sessionLogRef.current.action(logActorRef.current, 'new sound');
    announce('New sound.');
  };
  /** Keep (from the iPad): freeze the fill AND the sounds together; tap again to let go. */
  const toggleKeepAll = (): void => {
    const c = configRef.current;
    if (c.fillKept !== null || c.evolveHoldLap !== null) {
      update({ fillKept: null, evolveHoldLap: null });
      sessionLogRef.current.action(logActorRef.current, 'let go');
      announce('Let go: the extra notes and the sounds move again.');
      return;
    }
    const notes = engineRef.current?.getFillNotes() ?? [];
    update({
      fillKept: notes.length > 0 ? notes : null,
      evolveHoldLap: c.evolveAmount > 0 ? (engineRef.current?.getEvolveLap() ?? 0) : null,
    });
    sessionLogRef.current.action(logActorRef.current, 'keep');
    announce('Kept: the extra notes and the sounds stay as they are.');
  };

  /**
   * The counters on the board right now. Playing: what the engine is playing. Stopped on
   * the laptop board: the counters as placed — a click is certain, it needn't wait for
   * the settle like a camera reading (Save was refused for half a second after a click).
   */
  const boardCellsNow = (): ActiveCell[] => {
    if (runningRef.current) return activeCellsRef.current;
    const c = configRef.current;
    if (c.boardSource === 'laptop') return laptopCellsNow(c);
    return active;
  };
  /** The laptop board's counters as placed: a click is certain. */
  const laptopCellsNow = (c: BoardSequencerStored): ActiveCell[] => {
    const known = new Set(c.channels.map((ch) => ch.id));
    return c.laptopBoard.filter((x) => x.row < c.rows && x.col < c.cols && known.has(x.colour)).map((x) => ({ ...x }));
  };
  /**
   * The counters on the board that would sound (not control counters), as New loop counts
   * them. On the laptop board what is placed counts at once, and so does a counter just
   * lifted until the playing board has let it go, so nothing lifted can still sound.
   */
  const soundingOnBoard = (): number => {
    const c = configRef.current;
    const seen = keepCells(boardCellsNow(), c.channels).length;
    return c.boardSource === 'laptop' ? Math.max(seen, keepCells(laptopCellsNow(c), c.channels).length) : seen;
  };

  // ---- performing: loops launched without a pad, and scenes ----

  /** Tell the engine which loops are wanted; it brings them in at the next pass. */
  const pushLaunch = (extra?: { slot: number; cells: StoredLoopCell[] }, nl: NewLoopState | null = newLoopRef.current): void => {
    const cfg = configRef.current;
    const want = new Set(loopsToPlay(nl, [...wantedRef.current, ...counterWantedRef.current, ...(extra ? [extra.slot] : [])], cfg));
    const cellsOf = (s: number): StoredLoopCell[] | null => (extra && extra.slot === s ? extra.cells : (cfg.loopSlots[s] ?? null));
    const slots = [...want].filter((s) => cellsOf(s) !== null).sort((a, b) => a - b);
    setWantedSlots(slots);
    // Each loop plays through its own loop colours (what it was kept as), beside the player's.
    const played = slots.map((s) => loopChannelsFor(cellsOf(s) ?? [], cfg.channels));
    const loopColours = [...new Map(played.flatMap((l) => l.channels).map((c) => [c.id, c])).values()];
    engineRef.current?.setLaunchedLoops(slots, played.map((l) => l.cells), loopColours);
  };
  pushLaunchRef.current = pushLaunch;
  // Entering, leaving and "Hear it with…" all change what plays through this one effect,
  // after the state is set, so nothing reads it stale.
  useEffect(() => { pushLaunch(undefined, newLoop); }, [newLoop]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleLoop = (slot: number): void => {
    const has = (configRef.current.loopSlots[slot] ?? null) !== null;
    if (!has) return;
    wantedRef.current = toggleSlot(wantedRef.current, slot, has);
    pushLaunch();
    const on = wantedRef.current.has(slot);
    sessionLogRef.current.action(logActorRef.current, `${on ? 'launch' : 'stop'} loop ${slot + 1}`);
    announce(`${loopLabel(configRef.current.loopNames, slot)} ${on ? 'starts' : 'stops'} on the next pass.`);
  };
  const stopAllLoops = (): void => {
    if (wantedRef.current.size === 0) return;
    wantedRef.current = new Set();
    pushLaunch();
    sessionLogRef.current.action(logActorRef.current, 'stop all loops');
    announce('All loops stop on the next pass.');
  };
  stopAllLoopsRef.current = stopAllLoops;
  /** The board as it is now (settled while playing, seen otherwise), into a slot. */
  const saveBoardToSlot = (slot: number): void => {
    const cfg = configRef.current;
    const cells = keepCells(boardCellsNow(), cfg.channels);
    if (cells.length === 0) return;
    setConfig((prev) => {
      const loopSlots = prev.loopSlots.slice();
      while (loopSlots.length <= slot) loopSlots.push(null);
      loopSlots[slot] = cells;
      return { ...prev, loopSlots };
    });
    // The pads' bank holds its own copy of the slots it covers.
    if (slot < loopBankRef.current.saved.length) {
      loopBankRef.current = { ...loopBankRef.current, saved: loopBankRef.current.saved.map((s, i) => (i === slot ? cells.map((c) => ({ ...c })) : s)) };
    }
    sessionLogRef.current.action(logActorRef.current, `save board to loop ${slot + 1}`);
    announce(`Saved ${cells.length} notes to ${loopLabel(cfg.loopNames, slot)}.`);
  };
  const renameLoop = (slot: number, name: string): void => {
    update({ loopNames: configRef.current.loopNames.map((n, i) => (i === slot ? name.slice(0, 24) : n)) });
  };
  const sceneSettingsNow = (c: BoardSequencerStored): SceneSettings => ({
    soundWorld: c.soundWorld, band: c.band, phrases: c.phrases, fillAmount: c.fillAmount, evolveAmount: c.evolveAmount, bpm: c.bpm, chords: c.chords,
    bandJobs: c.bandJobs, sceneEnergy: c.sceneEnergy,
  });
  const saveScene = (name: string): void => {
    const c = configRef.current;
    // Storage keeps twelve; a thirteenth would play now and vanish on the next reload.
    if (c.scenes.length >= MAX_SCENES) { announce('Twelve scenes is the most. Delete one first.'); return; }
    const scene = sceneFromNow(name || `Scene ${c.scenes.length + 1}`, wantedRef.current, sceneSettingsNow(c));
    // Never marked on now: that made the next piece open in it (R2-T2-01).
    const added = withSceneAdded(c.scenes, c.currentScene, scene);
    update({ scenes: added.scenes, currentScene: added.current });
    sessionLogRef.current.action(logActorRef.current, `save scene ${scene.name}`);
    announce(`Scene saved: ${scene.name}.`);
  };
  /** The scenes in time order, with the scene that is on still pointed at. */
  const scenesInOrder = (scenes: BoardSequencerStored['scenes'], current: number | null): Pick<BoardSequencerStored, 'scenes' | 'currentScene'> => {
    const r = sortScenes(scenes, current);
    return { scenes: r.scenes, currentScene: r.current };
  };
  /** A scene put back exactly as it was (Undo), wherever the list has it now. */
  const restoreScene = (old: BoardSequencerStored['scenes'][number]): void => {
    const c = configRef.current;
    if (!c.scenes.some((x) => x.id === old.id)) return;
    update(scenesInOrder(c.scenes.map((x) => (x.id === old.id ? old : x)), c.currentScene));
  };
  /** A change to one scene, made where it is listed. The list stays in time order. */
  /** New ideas for one scene: its own ideas number, and Magenta's kept ideas let go. */
  const newIdeasForScene = (i: number): void => {
    const c = configRef.current;
    const old = c.scenes[i];
    if (!old) return;
    const fresh: Scene = { ...old, ideas: freshIdeas() };
    delete fresh.aiIdeas;
    update({ scenes: c.scenes.map((x, k) => (k === i ? fresh : x)) });
    sessionLogRef.current.action(logActorRef.current, `new ideas for scene ${old.name}`);
    announce(`New ideas for ${old.name}: its band, extra notes and sound changes will play differently${runningRef.current && c.currentScene === i ? ', from the next pass' : ''}.`);
  };
  /** New ideas for the whole piece: every scene plays differently, and no AI idea is kept. */
  const newIdeasForPiece = (): void => {
    const c = configRef.current;
    update({
      pieceIdeas: freshIdeas(),
      scenes: c.scenes.map((x) => { const n: Scene = { ...x }; delete n.aiIdeas; return n; }),
    });
    sessionLogRef.current.action(logActorRef.current, 'new ideas for the whole piece');
    announce('New ideas for the whole piece: every scene will play its band, extra notes and sound changes differently.');
  };
  const editScene = (i: number, patch: ScenePatch): void => {
    const c = configRef.current;
    const old = c.scenes[i];
    if (!old) return;
    const scenes = c.scenes.map((x, k) => (k === i ? editedScene(x, patch) : x));
    update(scenesInOrder(scenes, c.currentScene));
    sessionLogRef.current.action(logActorRef.current, `edit scene ${scenes[i].name}`);
    // Ticking "alone" takes the scene's loops out (WP-B): said, with Undo, which puts them
    // back and unticks it. Unticking alone left them gone (R2-T2-03).
    if (patch.alone === true && old.alone !== true && old.loops.length > 0) {
      const text = aloneLine(old.name, activePlayer?.name ?? null, old.loops.map((sl) => loopLabel(c.loopNames, sl)));
      setUndoOffer({ text, restore: () => restoreScene(old) });
      announce(text);
    }
  };
  /** The check's "Take it out": an empty loop out of every scene that uses it, with Undo. */
  const takeEmptyLoopOut = (slot: number): void => {
    const c = configRef.current;
    const using = c.scenes.filter((sc) => sc.loops.includes(slot)).map((sc) => sc.name);
    if (using.length === 0) return;
    const before = c.scenes;
    update({ scenes: takeLoopOut(c.scenes, slot) });
    const text = `${loopLabel(c.loopNames, slot)} taken out of ${listNames(using)}.`;
    setUndoOffer({ text, restore: () => update({ scenes: before }) });
    sessionLogRef.current.action(logActorRef.current, `take loop ${slot + 1} out of the scenes`);
    announce(text);
  };
  /**
   * Clear a loop: its notes, its name, and its place in every scene that used it. A scene
   * left naming an empty loop got the next kept loop in its place, silently, under the old
   * name (T2-01); now the check names any scene left with no loops instead. A loop playing
   * stops. Undo puts all of it back, unless a new loop has been kept there since.
   */
  const clearLoopEverywhere = (slot: number): void => {
    const c = configRef.current;
    const before = { cells: c.loopSlots[slot] ?? null, name: c.loopNames[slot] ?? '' };
    const label = loopLabel(c.loopNames, slot);
    const using = c.scenes.filter((sc) => sc.loops.includes(slot));
    clearLoopSlotAt(slot);
    update({ loopNames: c.loopNames.map((n, i) => (i === slot ? '' : n)), scenes: takeLoopOut(c.scenes, slot) });
    if (wantedRef.current.has(slot)) {
      wantedRef.current = new Set([...wantedRef.current].filter((x) => x !== slot));
      pushLaunch();
    }
    const text = using.length > 0 ? `${label} cleared, and taken out of ${listNames(using.map((sc) => sc.name))}.` : `${label} cleared.`;
    sessionLogRef.current.action(logActorRef.current, `clear loop ${slot + 1}`);
    announce(text);
    if (!before.cells) return;
    const cells = before.cells;
    setUndoOffer({
      text,
      restore: () => {
        const now = configRef.current;
        if ((now.loopSlots[slot]?.length ?? 0) > 0) { announce(`Loop ${slot + 1} has a new loop in it now: the old one was not put back.`); return; }
        const slots = now.loopSlots.map((sl, i) => (i === slot ? cells : sl));
        setConfig((prev) => ({
          ...prev,
          loopSlots: prev.loopSlots.map((sl, i) => (i === slot ? cells : sl)),
          loopNames: prev.loopNames.map((n, i) => (i === slot ? before.name : n)),
          scenes: putLoopBack(prev.scenes, slot, using.map((sc) => sc.id)),
        }));
        loopBankRef.current = seedLoopBank(loopBankRef.current.saved.length, slots, loopBankRef.current);
      },
    });
  };
  /**
   * Update from now: the scene gets the loops wanted now and the sound now (sound world,
   * band, Extra notes, Sounds change, tempo), with Undo, which puts it back exactly. Only
   * while the board plays: stopped, it emptied the scene's loops and swapped its sound for
   * the player's own, with no way back (R2-T2-02).
   */
  const updateSceneFromNow = (i: number): void => {
    if (!runningRef.current) return;
    const c = configRef.current;
    const old = c.scenes[i];
    if (!old) return;
    const fresh = sceneFromNow(old.name, wantedRef.current, sceneSettingsNow(c), old.id);
    editScene(i, { loops: fresh.loops, settings: fresh.settings });
    const text = updatedFromNowLine(old.name, fresh.loops.map((sl) => loopLabel(c.loopNames, sl)), fresh.settings.band);
    setUndoOffer({ text, restore: () => restoreScene(old) });
    sessionLogRef.current.action(logActorRef.current, `update scene ${old.name} from now`);
    announce(text);
  };
  const [planConfirm, setPlanConfirm] = useState(false);
  // A cue ("30 seconds left") stays large in the Now / Next strip for a few seconds, so
  // it is seen by anyone who can't hear it.
  const [cueShown, setCueShown] = useState<string | null>(null);
  useEffect(() => {
    if (!cueShown) return;
    const t = window.setTimeout(() => setCueShown(null), CUE_SHOWN_MS);
    return () => window.clearTimeout(t);
  }, [cueShown]);
  // Play (just play the board) or Make a piece (the guided steps); Show is the big board.
  // Remembered on this laptop: coming back to the board, you are where you were working.
  const [workspace, setWorkspaceState] = useState<'play' | 'piece'>(() => {
    try { return localStorage.getItem(WORKSPACE_KEY) === 'piece' ? 'piece' : 'play'; } catch { return 'play'; }
  });
  const setWorkspace = (w: 'play' | 'piece'): void => {
    setWorkspaceState(w);
    try { localStorage.setItem(WORKSPACE_KEY, w); } catch { /* not remembered */ }
  };
  const [pieceStep, setPieceStep] = useState<PieceStep>('loops');
  const [playTab, setPlayTab] = useState<PlayTab>('sound');
  const countersNow = boardCellsNow().length;
  // "Lift the counters to start from silence": the wait ends once the board is empty (on a
  // camera board, empty for the settle window). Each look reads this render's board: on a
  // stopped camera board that is `active`, which the look from when the wait began never saw
  // change (useEmptyBoardWait).
  useEmptyBoardWait(
    newLoop?.phase === 'waitEmpty',
    () => ({ sounding: soundingOnBoard(), settleMs: configRef.current.boardSource === 'laptop' ? null : configRef.current.settleWindowMs }),
    (n) => setNewLoop((s) => (s ? boardSeen(s, n) : s)),
  );
  /**
   * New loop: composing from silence. While it is set the engine plays only what
   * engineSettingsFor allows (never the player's band, Extra notes or Sounds change), and
   * the loop being heard alongside goes through pushLaunch. Never saved.
   */
  const [keptLoop, setKeptLoop] = useState<{ slot: number; name: string } | null>(null);
  const beginNewLoop = (): void => {
    // New loop silences everything, so never while the piece plays (F2), nor while a start
    // of the piece is loading (the piece would open with a new loop in it).
    if (clockStartRef.current !== null || pieceStartingRef.current) { announce('Stop the piece to make a loop.'); return; }
    // Nowhere to keep it: said before the board is cleared for a loop that can't be kept.
    const now = configRef.current;
    if (slotForKeep(now.loopSlots, now.scenes) === null) { announce('Every loop is full: clear one first.'); return; }
    const count = soundingOnBoard();
    const nl = startNewLoop(count);
    newLoopRef.current = nl;
    setNewLoop(nl);
    setKeptLoop(null);
    // Silence first: every loop stops along with the band and Extra notes.
    wantedRef.current = new Set();
    // And at once, as Stop does (T1-02): the engine hears it now rather than after the next
    // render and frame, then cuts what is still ringing or already queued.
    const engine = engineRef.current;
    if (engine && runningRef.current) {
      applyEngineSettings(engine, forEngine(configRef.current, nl), midiPortRef.current);
      pushLaunch(undefined, nl);
      engine.setActiveCells(playerCellsFor(nl, activeCellsRef.current));
      engine.silenceNow();
    }
    // On a stopped board it starts the board as ▶ Play does: plain play, with no clock, no
    // scene and no loops, and the New loop rules from the first beat (the counters already
    // down wait to be lifted). Pressed after a Stop it was silent while it said "only the
    // counters sound" (R2-T1-01). If the board can't start, the panel says why.
    if (!runningRef.current && startingRef.current === null && playReason === null) void start();
    sessionLogRef.current.action(logActorRef.current, 'new loop');
    announce(`${count > 0 ? `New loop. ${count} ${count === 1 ? 'counter is' : 'counters are'} on the board: keep what's on the board, or start from empty.` : 'New loop: silent until a counter goes down.'}${playReason ? ` ${playReason}` : ''}`);
  };
  const leaveNewLoop = (): void => {
    newLoopRef.current = null;
    setNewLoop(null);
    setKeptLoop(null);
    wantedRef.current = new Set();
  };
  const keepNewLoop = (): void => {
    const c = configRef.current;
    // Never a loop a scene still uses, even an empty one: the new loop would play there
    // in its place, unasked (T2-01).
    const slot = slotForKeep(c.loopSlots, c.scenes);
    if (slot === null) { announce('Every loop is full: clear one first.'); return; }
    // Control counters are not a loop: nothing is kept, and nothing is said to be.
    if (keepCells(boardCellsNow(), c.channels).length === 0) { announce('Nothing to keep yet: only control counters are down.'); return; }
    saveBoardToSlot(slot);
    // A new loop starts with no name: a name left on an empty loop was a loop that is gone.
    if ((c.loopNames[slot] ?? '') !== '') renameLoop(slot, '');
    setKeptLoop({ slot, name: '' });
    announce(`Kept: Loop ${slot + 1}. Give it a name.`);
  };
  /** "Make my plan": the four-scene plan across the piece's length, from the saved loops. */
  const makePlan = (): void => {
    const c = configRef.current;
    const scenes = planScenes(c.performance.lengthSec, c.loopSlots, sceneSettingsNow(c));
    const before = { scenes: c.scenes, currentScene: c.currentScene };
    update({ scenes, currentScene: null });
    if (before.scenes.length > 0) setUndoOffer({ text: `Plan made: your ${before.scenes.length} ${before.scenes.length === 1 ? 'scene was' : 'scenes were'} replaced.`, restore: () => update(before) });
    setPlanConfirm(false);
    sessionLogRef.current.action(logActorRef.current, 'make my plan');
    announce('Plan made: Arrival, Build, Open and Home, placed across the piece. Open a scene to change it.');
  };
  const undoDeleteScene = (): void => {
    const d = deletedScene;
    if (!d) return;
    const c = configRef.current;
    const scenes = [...c.scenes];
    scenes.splice(Math.min(d.index, scenes.length), 0, d.scene);
    const at = Math.min(d.index, scenes.length - 1);
    update(scenesInOrder(scenes, d.wasCurrent ? at : c.currentScene !== null && c.currentScene >= at ? c.currentScene + 1 : c.currentScene));
    setDeletedScene(null);
    announce(`Scene ${d.scene.name} is back.`);
  };
  const goScene = (i: number): void => {
    // A scene's settings are for a run. While stopped there is nothing to hear, and a jump
    // changed the player's own settings for good (T2-05): the laptop offers ▶ Rehearse from
    // here instead, and the iPad says "Press Play on the laptop first".
    if (!runningRef.current) return;
    const c = configRef.current;
    const scene = c.scenes[i];
    if (!scene) return;
    // The player's own settings, kept for Stop (and saved meanwhile in place of the scene's).
    if (homeSettingsRef.current === null) homeSettingsRef.current = sceneSettingsOf(c);
    const apply = sceneSettingsToApply(scene.settings, stripsTouchedRef.current, c.sceneRespectsPlayer);
    const kept = [...stripsTouchedRef.current].filter(() => c.sceneRespectsPlayer);
    stripsTouchedRef.current = new Set();
    // The scene's sound lands on the pass, with its loops (the speed glides as before).
    engineRef.current?.landOnNextPass({
      soundWorld: apply.soundWorld, band: apply.band, phrases: apply.phrases,
      fillAmount: apply.fillAmount, evolveAmount: apply.evolveAmount, chords: apply.chords, bandJobs: apply.bandJobs,
      sceneEnergy: apply.sceneEnergy, ideas: ideasFor({ ...c, currentScene: i }),
    });
    // Its lead-in, into that same pass (a scene with none clears one waiting).
    engineRef.current?.cueLeadIn(scene.leadIn ?? 'none');
    update({ ...apply, currentScene: i });
    if (apply.bpm !== undefined) setSceneSpeed(apply.bpm, scene.glideSec);
    const glide = apply.bpm !== undefined ? speedGlideRef.current : null;
    const glideWords = glide && glide.durMs > 0 && Math.round(glide.from) !== Math.round(glide.to)
      ? ` ${glide.to > glide.from ? 'Speeding up' : 'Slowing down'} to ${Math.round(glide.to)} BPM over ${Math.round(glide.durMs / 1000)} seconds.`
      : '';
    if (kept.length > 0) sessionLogRef.current.action(logActorRef.current, `scene ${scene.name} left the player's ${kept.join(', ')}`);
    wantedRef.current = new Set(scene.loops.filter((s) => (c.loopSlots[s] ?? null) !== null));
    pushLaunch();
    setBoardNotice(`Scene: ${scene.name}`);
    sessionLogRef.current.action(logActorRef.current, `scene ${scene.name}`);
    announce(`Scene ${scene.name}: ${scene.loops.length} ${scene.loops.length === 1 ? 'loop' : 'loops'} and its sound, from the next pass.${glideWords}`);
  };
  // A scene gliding to its speed: a step every GLIDE_STEP_MS, each through setBpm, which keeps
  // the beat continuous. Never while a Speed counter or the hat sets the speed: the hat moves
  // around the gliding speed itself (tempoCentreRef), and a counter wins as it always has.
  const glideTickRef = useRef<() => void>(() => {});
  glideTickRef.current = () => {
    const g = speedGlideRef.current;
    const engine = engineRef.current;
    if (!g || glideLandedRef.current || !engine) return;
    const now = performance.now();
    if (!speedOwnedElsewhere()) engine.setBpm(glideBpmAt(g, now));
    if (glideDone(g, now)) glideLandedRef.current = true;
  };
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => glideTickRef.current(), GLIDE_STEP_MS);
    return () => window.clearInterval(id);
  }, [running]);
  // For one pass after Next scene: ↶ Back to the scene before (B13).
  const [undoNext, setUndoNext] = useState<NextSceneUndo | null>(null);
  const nextScene = (): void => {
    const c = configRef.current;
    const i = nextSceneIndex(c.currentScene, c.scenes.length);
    if (i !== null) {
      const passMs = ((c.cols * Math.max(1, c.numPages) * 60) / Math.max(20, c.bpm)) * 1000;
      const offer = nextSceneUndo(c.currentScene, i, c.scenes, performance.now(), passMs);
      goScene(i);
      setUndoNext(offer);
    } else if (c.scenes.length > 0) { setBoardNotice('Last scene'); announce('That was the last scene.'); }
  };
  const undoNextScene = (): void => {
    const u = undoNext;
    setUndoNext(null);
    if (!u || !nextUndoOffered(u, performance.now(), configRef.current.currentScene)) return;
    goScene(u.backTo);
    announce(`Back to ${u.name}.`);
  };
  // The offer goes after its pass, or as soon as another scene comes in.
  useEffect(() => {
    if (!undoNext) return undefined;
    if (!nextUndoOffered(undoNext, performance.now(), config.currentScene) || !running) { setUndoNext(null); return undefined; }
    const id = window.setTimeout(() => setUndoNext(null), Math.max(0, undoNext.untilMs - performance.now()));
    return () => window.clearTimeout(id);
  }, [undoNext, config.currentScene, running]);
  /**
   * ▶ Start the piece: always the piece from 0:00. Stopped, the board starts with it.
   * Playing (Tim warming up), the sound carries on with no restart and no gap: a scene
   * jumped to is dropped, the player's own settings come back, and the piece opens over
   * them exactly as from stopped — the clock at the full length, the scene at 0:00 in at
   * once (its settings now, its loops from the next pass), every other loop fading out.
   * "⏱ Start clock" opened in whatever scene was marked on now and skipped every scene
   * before it (R2-T2-01).
   */
  const startThePiece = (): void => {
    if (!runningRef.current) {
      // As ▶ Play: a press straight after Stop is a bounce (focus lands here after the
      // second press of Stop), never a new start of the piece.
      if (startRefused()) return;
      // The piece and a new loop never run together (F2): starting the piece ends it.
      if (newLoopRef.current) leaveNewLoop();
      void start({ fromSec: 0 });
      return;
    }
    // Already the piece, or an ending still under way: nothing to start.
    if (clockStartRef.current !== null || endingRef.current) return;
    if (newLoopRef.current) leaveNewLoop();
    const c = configRef.current;
    // The player's own settings: from before a jump to a scene, if there was one.
    const own = homeSettingsRef.current ?? sceneSettingsOf(c);
    homeSettingsRef.current = own;
    const openingIndex = openingScene(c.scenes, 0);
    const opening = openingIndex !== null ? c.scenes[openingIndex] ?? null : null;
    const settings = opening ? { ...own, ...opening.settings } : own;
    stripsTouchedRef.current = new Set();
    update({ ...settings, currentScene: openingIndex });
    setSceneSpeed(settings.bpm, 0);
    wantedRef.current = new Set((opening?.loops ?? []).filter((sl) => (c.loopSlots[sl] ?? null) !== null));
    pushLaunch();
    clockStartRef.current = performance.now();
    pieceStartedAtRef.current = clockStartRef.current;
    setPieceEnded(false);
    // A colour that waits for its time goes silent now, not on the next frame: what it still
    // had ringing or queued from the warm-up is cut too, so it is never heard in the piece early.
    const waiting = waitingColours(c.channels, c.colourComesInAt, 0).map((ch) => ch.id);
    const playing = engineRef.current;
    if (playing && waiting.length > 0) {
      playing.setActiveCells(cellsSoundingAt(activeCellsRef.current, c.channels, c.colourComesInAt, 0));
      playing.silenceColours(waiting);
    }
    waitingIdsRef.current = null;
    rememberPieceRunning(Date.now(), c.performance.lengthSec, view === 'bigBoard', openingIndex ?? undefined);
    // The opening scene is in: the clock must not bring it in again.
    clockPrevRef.current = { remaining: Infinity, elapsed: opening ? 0 : CLOCK_NOT_STARTED };
    autoEndedRef.current = false;
    hardStoppedRef.current = false;
    setClock(clockView(clockStartRef.current, performance.now(), c.performance.lengthSec, false));
    setResumeFrom(null);
    setEndedNotice(false);
    sessionLogRef.current.action(logActorRef.current, 'start the piece');
    if (opening) {
      setBoardNotice(`Scene: ${opening.name}`);
      sessionLogRef.current.action(logActorRef.current, `scene ${opening.name}`);
    }
    announce(`The piece has started${opening ? `, in ${opening.name}` : ''}: ${formatClock(c.performance.lengthSec)}.`);
    // The button pressed gives way to the clock: focus goes on to the Now / Next strip in
    // Show (never onto ■ Stop, B3), to ■ Stop on Play.
    void focusWhenGone(() => (view === 'bigBoard' ? showNowNextRef.current : document.getElementById(PLAY_STOP_ID)));
  };
  startThePieceRef.current = startThePiece;
  /** The chosen ending, now: a fade over the fade passes (or a stop at the end of the pass). */
  const endPiece = (): void => {
    const engine = engineRef.current;
    const c = configRef.current;
    if (!engine || !runningRef.current || endingRef.current) return;
    const cycle = c.cols * Math.max(1, c.numPages);
    const style = c.performance.style;
    const beats = style === 'stop' ? 0 : c.performance.fadePasses * cycle;
    endingRef.current = true;
    setEnding(true);
    // Remembered across a reload: once the ending has begun, a reload ends the piece.
    rememberEnding(true);
    engine.finish(beats, () => {
      // Said once the sound has rung out; by then the player may have pressed Stop and
      // Play again, and a new run must not be stopped by the old one finishing.
      if (engineRef.current !== engine) return;
      sessionLogRef.current.action('laptop', 'piece ended');
      stop();
      pieceEndedAtRef.current = performance.now();
      setPieceEnded(true);
      // The piece is over: nothing stays armed, and the next run starts from the top.
      wantedRef.current = new Set();
      setWantedSlots([]);
      update({ currentScene: null });
      announce('The piece has ended.');
    }, style);
    const what = describeEnding(c.performance);
    setBoardNotice(style === 'stop' ? 'Ending at the end of this pass' : `Ending: ${what}`);
    sessionLogRef.current.action(logActorRef.current, `end piece: ${what}`);
    announce(`Ending: ${what}.`);
  };
  const cancelEnding = (): void => {
    engineRef.current?.cancelFinish();
    endingRef.current = false;
    setEnding(false);
    rememberEnding(false);
    sessionLogRef.current.action(logActorRef.current, 'ending cancelled');
    announce('Ending cancelled: carrying on.');
  };
  /** Capture: what is on the board now into the first free slot, and start it. */
  const captureLoop = (): void => {
    const cfg = configRef.current;
    // The same place Keep would use: never a loop a scene still uses (T2-01).
    const slot = slotForKeep(cfg.loopSlots, cfg.scenes);
    if (slot === null) { announce('Every loop is full: clear one first.'); return; }
    const sequenced = new Set(cfg.channels.filter((c) => isSequencedRole(c.role)).map((c) => c.id));
    const source = boardCellsNow();
    const cells = source.filter((c) => sequenced.has(c.colour))
      .map((c) => (c.conditional ? { ...storedCell(c), conditional: true as const } : storedCell(c)));
    if (cells.length === 0) { announce('Nothing on the board to capture.'); return; }
    setConfig((prev) => {
      const loopSlots = prev.loopSlots.slice();
      while (loopSlots.length <= slot) loopSlots.push(null);
      loopSlots[slot] = cells;
      return { ...prev, loopSlots };
    });
    wantedRef.current = new Set([...wantedRef.current, slot]);
    pushLaunch({ slot, cells });
    sessionLogRef.current.action(logActorRef.current, `capture to loop ${slot + 1}`);
    setBoardNotice(`Captured: ${loopLabel(cfg.loopNames, slot)}`);
    announce(`Captured ${cells.length} notes as ${loopLabel(cfg.loopNames, slot)}; it starts on the next pass.`);
  };
  // The clock, read every quarter second while running: cues, scheduled scenes, the ending.
  clockTickRef.current = () => {
    const c = configRef.current;
    const engine = engineRef.current;
    if (!engine || !runningRef.current) return;
    const now = performance.now();
    const view = clockView(clockStartRef.current, now, c.performance.lengthSec, engine.isFinishing());
    setClock((prev) => (prev && prev.text === view.text && prev.phase === view.phase ? prev : view));
    if (clockStartRef.current === null) return;
    const prev = clockPrevRef.current;
    clockPrevRef.current = { remaining: view.remainingSec, elapsed: view.elapsedSec };
    // What to do is decided by one tested rule (performance/piece.ts); this only does it.
    const d = decideClockTick({
      prev, now: { remaining: view.remainingSec, elapsed: view.elapsedSec }, scenes: c.scenes, current: c.currentScene,
      performance: c.performance, passSec: (c.cols * Math.max(1, c.numPages)) * 60 / Math.max(20, engine.getBpm()),
      ending: endingRef.current, autoEnded: autoEndedRef.current,
    });
    for (const cue of d.cues) {
      setBoardNotice(cueText(cue));
      setCueShown(cueText(cue));
      announce(cueText(cue));
    }
    // A lead-in plays in the last pass before its scene: told ahead, once the scene is less
    // than a pass away, so it can start at the beginning of that pass.
    if (!endingRef.current) {
      const coming = nowNext(c.scenes, c.currentScene, view.elapsedSec).next;
      const passSec = (c.cols * Math.max(1, c.numPages)) * 60 / Math.max(20, engine.getBpm());
      if (coming?.scene.leadIn && coming.inSec <= passSec * 1.5) engine.cueLeadIn(coming.scene.leadIn, coming.inSec);
    }
    if (d.scene !== null) goScene(d.scene);
    // A colour comes in: on the board and said, as otherwise it is only heard. (The runtime
    // has already let it through, on the first frame at or after its time.)
    const waitingChs = waitingColours(c.channels, c.colourComesInAt, view.elapsedSec);
    const waitingIds = waitingChs.map((ch) => ch.id);
    const waitedBefore = waitingIdsRef.current;
    const waitingSet = new Set(waitingIds);
    waitingIdsRef.current = waitingSet;
    if (waitedBefore !== null) {
      const came = c.channels.filter((ch) => holdsBack(ch) && waitedBefore.has(ch.id) && !waitingSet.has(ch.id));
      if (came.length > 0) {
        const line = comesInLine(came.map(describeChannel));
        setBoardNotice(line);
        announce(`${line}.`);
        sessionLogRef.current.action('laptop', line);
      }
    }
    setWaitingNow((prev) => (prev.join('|') === waitingIds.join('|') ? prev : waitingIds));
    if (d.end) {
      autoEndedRef.current = true;
      endPiece();
    }
    if (d.hardStop && !hardStoppedRef.current) {
      // The piece cannot run over its length: fade whatever is left and stop.
      hardStoppedRef.current = true;
      engine.fadeOutNow(0.8);
      sessionLogRef.current.action('laptop', 'end time reached: stopped');
      setBoardNotice('The end time: stopped');
      setTimeout(() => {
        if (engineRef.current !== engine) return;
        stop();
        pieceEndedAtRef.current = performance.now();
        setPieceEnded(true);
        wantedRef.current = new Set();
        setWantedSlots([]);
        update({ currentScene: null });
        announce('The piece has reached its end time and stopped.');
      }, 900);
    }
  };

  const deleteScene = (i: number): void => {
    const c = configRef.current;
    const gone = c.scenes[i];
    if (gone) setDeletedScene({ scene: gone, index: i, wasCurrent: c.currentScene === i });
    update({
      scenes: c.scenes.filter((_, k) => k !== i),
      currentScene: c.currentScene === null ? null : c.currentScene === i ? null : c.currentScene > i ? c.currentScene - 1 : c.currentScene,
    });
  };

  /** Hand the facilitator the session as a file. Nothing leaves the machine otherwise. */
  const saveSession = (ext: 'json' | 'csv', log: SessionLog = sessionLogRef.current): void => {
    const data = log.toJSON();
    const text = ext === 'json' ? JSON.stringify(data, null, 1) : log.toCsv();
    const blob = new Blob([text], { type: ext === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sessionFileName(data.player, new Date(data.startedAt), ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Session saved: ${data.notes.length} notes.`);
  };

  /** Every player, loop, scene and the board setup, as a file to keep somewhere safe. */
  const backupToFile = (): void => {
    backedUpRef.current = true;
    const b = snapshotStorage(localStorage);
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const sum = summariseBackup(b);
    announce(`Backed up ${sum.loops} loops and ${sum.scenes} scenes for ${sum.players} ${sum.players === 1 ? 'player' : 'players'}.`);
  };
  const pickRestoreFile = async (file: File | undefined): Promise<void> => {
    setRestoreError(null);
    if (!file) return;
    let parsed: BoardBackup | null = null;
    try { parsed = parseBoardBackup(JSON.parse(await file.text())); } catch { parsed = null; }
    if (!parsed) { setRestoreError(`${file.name} is not an ADMI board backup.`); return; }
    setRestoreTarget(parsed);
  };
  const confirmRestore = async (b: BoardBackup): Promise<void> => {
    restoringRef.current = true;
    stop();
    try {
      await restoreFromFile(b);
      window.location.reload();
    } catch (err) {
      // Nothing was changed (the restore puts everything back if it fails part-way), so
      // saving carries on as before.
      restoringRef.current = false;
      setRestoreError(`The backup could not be restored: ${err instanceof Error ? err.message : 'the browser refused'}. Nothing was changed.`);
    }
  };
  const diskLine = disk.state === 'saved' && disk.savedAt > 0
    ? `Saved in this browser, with a copy on this laptop (the .admi-data folder), last at ${new Date(disk.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
    : disk.state === 'unavailable'
      ? 'Saved in this browser only — this page has no laptop copy. Back up to a file before the performance.'
      : 'Saved in this browser. A copy goes to this laptop at the next change.';

  const remoteLabels = (c: BoardSequencerStored): Record<RemoteControlName, string> => ({
    tempo: `${Math.round(c.bpm)} BPM`,
    dynamics: `${Math.round(valueFromVelocity(c.velocity) * 100)}%`,
    fill: c.fillAmount <= 0 ? 'Off' : `${Math.round(c.fillAmount * 100)}%`,
    evolve: c.evolveAmount <= 0 ? 'Off' : `${Math.round(c.evolveAmount * 100)}%`,
  });

  /** One press sets the iPad out for the show (decision F3), from the iPad settings or the check. */
  const applySafeShowLayout = (): void => {
    update(safeShowLayout(configRef.current.remoteTouch));
    setSafeLayoutSet(true);
  };
  /** An iPad page from before an update, in the player's name: said on the laptop only. */
  const ipadOutOfDateText = `${playerWords(activePlayer?.name ?? null).Name}'s iPad page is out of date: reload it on the iPad.`;

  const onRemoteMessage = (msg: RemoteMessage): void => {
    const c = configRef.current;
    logActorRef.current = 'ipad';
    try {
      onRemoteMessageInner(msg, c);
    } finally {
      logActorRef.current = 'laptop';
    }
  };
  const onRemoteMessageInner = (msg: RemoteMessage, c: BoardSequencerStored): void => {
    if (msg.type === 'armed') {
      setIpadEndArmed(msg.on && runningRef.current);
      return;
    }
    // Waiting for Carry on after a reload: nothing from the iPad is taken (B19). Today's
    // iPad says so and refuses its touches; this is for one that is behind.
    if (!runningRef.current && resumeFrom !== null && msg.type !== 'hello' && msg.type !== 'reach') {
      setRemoteNote({ text: 'iPad: not taken (waiting for Carry on)', at: performance.now() });
      return;
    }
    if (msg.type === 'hello') {
      // An answer to an older question is from before the last page came or went.
      if (msg.ask !== helloAskRef.current) return;
      helloAnswersRef.current = [...helloAnswersRef.current, msg.build];
      const pages = ipadPages(remoteLink.others, helloAnswersRef.current, BUILD_ID, false);
      if (pages !== 'waiting') setIpadPagesNow(pages);
      return;
    }
    if (msg.type === 'control' && c.remoteLocked.includes(msg.name)) return;
    if (msg.type === 'control') {
      if (msg.name !== 'dynamics') stripsTouchedRef.current.add(msg.name as PlayerStrip);
      if (msg.name === 'tempo') {
        const bpm = tempoFromValue(msg.value);
        update({ bpm });
        holdSpeed(bpm);
        engineRef.current?.setBpm(bpm);
        // The cap would put its own value straight back: it takes the iPad's instead.
        cap.handOver('tempo', bpm);
      } else if (msg.name === 'dynamics') {
        const { velocity, volume } = dynamicsFromValue(msg.value);
        update({ velocity, volume });
        engineRef.current?.setVelocity(velocity);
        engineRef.current?.setVolume(volume);
        cap.handOver('volume', volume);
      } else if (msg.name === 'fill') {
        update({ fillAmount: msg.value });
        cap.handOver('fill', msg.value);
      } else {
        update({ evolveAmount: msg.value });
        cap.handOver('evolve', msg.value);
      }
      const next = { ...c, ...(msg.name === 'tempo' ? { bpm: tempoFromValue(msg.value) } : {}),
        ...(msg.name === 'dynamics' ? { velocity: dynamicsFromValue(msg.value).velocity } : {}),
        ...(msg.name === 'fill' ? { fillAmount: msg.value } : {}),
        ...(msg.name === 'evolve' ? { evolveAmount: msg.value } : {}) };
      setRemoteNote({ text: `iPad: ${REMOTE_CONTROL_WORDS[msg.name]} ${remoteLabels(next)[msg.name]}`, at: performance.now() });
    } else if (msg.type === 'reach') {
      reachSamplesRef.current[msg.name].push(msg.fraction);
    } else if (msg.type === 'loop') {
      // Refused while stopped: it would wait in silence and start by itself with Play. The
      // iPad says "Press Play on the laptop first"; this is for an iPad that is behind.
      // While Play is starting (the sound loading) it is taken and comes in with the sound.
      if (!runningRef.current && startingRef.current === null) {
        setRemoteNote({ text: `iPad: ${loopLabel(c.loopNames, msg.index)} not started (press ▶ Play the board first)`, at: performance.now() });
        return;
      }
      toggleLoop(msg.index);
      setRemoteNote({ text: `iPad: ${loopLabel(c.loopNames, msg.index)}`, at: performance.now() });
    } else if (msg.type === 'scene') {
      if (msg.index === 'next') nextScene();
      else goScene(msg.index);
      setRemoteNote({ text: 'iPad: scene', at: performance.now() });
    } else if (msg.type === 'trigger') {
      if (msg.name === 'newIdea') {
        // Stopped, New idea would switch Extra notes on by itself and change how the piece
        // opens (B18). While Play is starting it is taken, like a loop.
        if (!runningRef.current && startingRef.current === null) {
          setRemoteNote({ text: 'iPad: New idea not taken (press ▶ Play the board first)', at: performance.now() });
          return;
        }
        newFillIdea();
      } else if (msg.name === 'newSound') newEvolveSound();
      // From the iPad, Keep only keeps: a second, accidental tap must not let go of what
      // the player chose to keep. Letting go is on the laptop.
      else if (msg.name === 'keep') { if (c.fillKept === null && c.evolveHoldLap === null) toggleKeepAll(); }
      else if (msg.name === 'mute') toggleMuted();
      else if (msg.name === 'stopAll') stopAllLoops();
      else if (msg.name === 'endPiece') { setIpadEndArmed(false); endPiece(); }
      else if (clockStartRef.current !== null || pieceStartingRef.current) {
        // Capture makes a loop, and no loop is made while the piece plays (F2), nor while a
        // start of it is loading (the clock not set yet). Today's iPad greys its Capture out
        // then; this is for one that is behind.
        setRemoteNote({ text: 'iPad: Capture not taken (stop the piece to make a loop)', at: performance.now() });
        return;
      } else captureLoop();
      setRemoteNote({ text: `iPad: ${REMOTE_TRIGGER_WORDS[msg.name]}`, at: performance.now() });
    }
  };
  remoteMsgRef.current = onRemoteMessage;

  // Connections: the iPad and MIDI out, set up once per rig — their own tab, so the Sound
  // tab is about the sound.
  const connectionsTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
    {/* The iPad remote: a second controller in the performance (see src/remote). */}
    <div role="group" aria-label="iPad controls" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--bs-radius-md)', border: '1px solid var(--bs-border)' }}>
      <Switch
        label="iPad controls"
        checked={remoteEnabled}
        onChange={(on) => {
          setRemoteEnabled(on);
          try { localStorage.setItem(REMOTE_ENABLED_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
        }}
      />
      {remoteEnabled && (
        <>
          <span role="status" style={{ fontSize: 14, fontWeight: 600, color: remoteLink.others > 0 ? (remoteLink.reaching ? 'var(--bs-ok)' : 'var(--bs-warn)') : 'var(--bs-fg2)' }}>
            {remoteLink.others > 0 ? (remoteLink.reaching ? '✓ iPad connected' : '! iPad not reaching')
              : remoteLink.status === 'open' ? 'Waiting for the iPad…'
                : remoteLink.status === 'lost' ? 'Link lost — reconnecting…' : 'Starting…'}
          </span>
          {ipadOutOfDate && <span role="alert" style={{ fontSize: 14, fontWeight: 600, color: 'var(--bs-warn)' }}>{ipadOutOfDateText}</span>}
          {remoteLink.others > 0 ? null : remoteInfo && !remoteInfo.lan ? (
            <span style={{ fontSize: 14, color: 'var(--bs-warn)' }}>
              The iPad can&apos;t reach this laptop yet: ADMI was started without the local
              network. Close ADMI&apos;s server and start it with <code>npm run show</code> (for a
              performance) or <code>npm run dev:ipad</code> (for testing), then turn this on again.
            </span>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              On the iPad (same Wi-Fi), open the Camera and point it at the code, then tap the
              link that appears. Or type the address into Safari.
            </span>
          )}
          {remoteInfo?.lan && remoteInfo.addresses.map((ip) => {
            // The page's own http or https: the server the iPad reaches is this same one.
            const url = `${window.location.protocol}//${ip}:${remoteInfo.port ?? window.location.port}/?remote=${remoteCode}`;
            return (
              <div key={ip} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <LinkQr url={url} />
                <code style={{ fontSize: 16, fontWeight: 700, userSelect: 'all' }}>{url}</code>
              </div>
            );
          })}
          <Button
            tone="quiet"
            onClick={() => {
              const code = makeRemoteCode();
              setRemoteCode(code);
              try { localStorage.setItem(REMOTE_CODE_KEY, code); } catch { /* not remembered */ }
            }}
          >
            New code
          </Button>
          {/* Reach: the player's comfortable slide becomes the whole range of each strip. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Reach</span>
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              {REMOTE_CONTROLS.map((n) => `${REMOTE_CONTROL_WORDS[n]} ${Math.round(config.remoteReach[n].low * 100)}–${Math.round(config.remoteReach[n].high * 100)}%`).join(' · ')}
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!reachLearning ? (
                <Button
                  tone="secondary"
                  onClick={() => {
                    reachSamplesRef.current = { tempo: [], dynamics: [], fill: [], evolve: [] };
                    setReachLearning(true);
                    announce('Learning reach. On the iPad, slide each strip as far as is comfortable, then press Done.');
                  }}
                  reason={remoteLink.others === 0 ? 'Connect the iPad first.' : null}
                >
                  Learn reach
                </Button>
              ) : (
                <>
                  <span role="status" style={{ fontSize: 14, fontWeight: 600 }}>
                    On the iPad: slide each strip as far as is comfortable, then press Done here.
                  </span>
                  <Button
                    tone="primary"
                    onClick={() => {
                      const prev = configRef.current.remoteReach;
                      const next = { ...prev };
                      for (const n of REMOTE_CONTROLS) next[n] = reachFromSamples(reachSamplesRef.current[n], prev[n]);
                      update({ remoteReach: next });
                      setReachLearning(false);
                      announce('Reach learnt.');
                    }}
                  >
                    Done
                  </Button>
                  <Button tone="quiet" onClick={() => setReachLearning(false)}>Cancel</Button>
                </>
              )}
              <Button
                tone="quiet"
                onClick={() => update({ remoteReach: fullReachMap() })}
                reason={REMOTE_CONTROLS.every((n) => config.remoteReach[n].low === 0 && config.remoteReach[n].high === 1) ? 'Already the whole strip.' : null}
              >
                Reset reach
              </Button>
            </div>
          </div>
          {/* For the show: one button sets out the iPad so a stray touch cannot stop, jump,
              silence or speed up the piece (show decision F3). New players start with it. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>For the show</span>
            <Note>
              The safe show layout: the iPad shows only the Extra notes strip, New idea and End piece (two taps).
              {`Mute, the loop and scene pads, Next scene, Capture and ${WORDS.stopLoops} are hidden, and Speed is locked.`}
            </Note>
            <div>
              <Button tone="secondary" onClick={applySafeShowLayout}>
                Use the safe show layout
              </Button>
            </div>
            <span role="status" style={{ fontSize: 14, fontWeight: 600, color: 'var(--bs-ok)' }}>
              {!isSafeShowLayout(config) ? ''
                : safeLayoutSet
                  ? `Done: the iPad now shows only the Extra notes strip, New idea and End piece. Speed is locked. Mute, the loops, the scenes, Next scene, Capture and ${WORDS.stopLoops} are hidden.`
                  : '✓ The iPad has the safe show layout.'}
            </span>
          </div>
          {/* Fewer, bigger targets: the facilitator chooses what the iPad shows. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>What the iPad shows</span>
            <Note>Fewer things means bigger things. Untick what this player will not use.</Note>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {REMOTE_CONTROLS.map((n) => (
                <label key={`show-${n}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <input
                    type="checkbox" checked={config.remoteStrips.includes(n)}
                    onChange={(e) => update({ remoteStrips: REMOTE_CONTROLS.filter((x) => (x === n ? e.target.checked : config.remoteStrips.includes(x))) })}
                  />
                  {REMOTE_CONTROL_WORDS[n]}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['newIdea', 'newSound', 'keep', 'mute'] as RemoteTriggerName[]).map((n) => (
                <label key={`showpad-${n}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <input
                    type="checkbox" checked={config.remotePads.includes(n)}
                    onChange={(e) => update({ remotePads: (['newIdea', 'newSound', 'keep', 'mute'] as RemoteTriggerName[]).filter((x) => (x === n ? e.target.checked : config.remotePads.includes(x))) })}
                  />
                  {REMOTE_TRIGGER_WORDS[n]}
                </label>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                <input type="checkbox" checked={config.remoteLoopsPage} onChange={(e) => update({ remoteLoopsPage: e.target.checked })} />
                {/* One tick brings back all of these: said, so it is never a surprise (R2-T3-06). */}
                {`Loops & scenes page (also shows Capture, ${WORDS.stopLoops} and End piece)`}
              </label>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Locked strips</span>
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>A locked strip ignores touch — for a speed that must not change mid-piece.</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {REMOTE_CONTROLS.map((n) => (
                <label key={`lock-${n}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <input
                    type="checkbox" checked={config.remoteLocked.includes(n)}
                    onChange={(e) => update({ remoteLocked: REMOTE_CONTROLS.filter((x) => (x === n ? e.target.checked : config.remoteLocked.includes(x))) })}
                  />
                  {`🔒 ${REMOTE_CONTROL_WORDS[n]}`}
                </label>
              ))}
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>A touch on a strip</span>
            <SegmentedControl<'jump' | 'follow'>
              label="A touch on a strip"
              value={config.remoteStripMode}
              onChange={(v) => update({ remoteStripMode: v })}
              options={[{ value: 'jump', label: 'Jumps to the finger' }, { value: 'follow', label: 'Follows the movement' }]}
            />
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              {config.remoteStripMode === 'jump'
                ? 'Where the finger lands is the value.'
                : 'Landing changes nothing; sliding moves the value from where it was. For a finger that lands roughly.'}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>A pad acts</span>
            <SegmentedControl<'touch' | 'lift'>
              label="A pad acts"
              value={config.remoteTouch.actOn}
              onChange={(actOn) => update({ remoteTouch: { ...config.remoteTouch, actOn } })}
              options={[{ value: 'touch', label: 'When the finger lands' }, { value: 'lift', label: 'When the finger lifts' }]}
            />
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              {config.remoteTouch.actOn === 'touch'
                ? 'Quickest. A resting palm is always ignored.'
                : 'Nothing happens until the finger comes off the pad it started on, so sliding onto a pad by accident does nothing.'}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{`Time for the second tap (End piece, ${WORDS.stopLoops}, Mute)`}</span>
            <SegmentedControl<number>
              label="Time for the second tap"
              value={config.remoteTouch.confirmSec}
              onChange={(confirmSec) => update({ remoteTouch: { ...config.remoteTouch, confirmSec } })}
              options={[{ value: 3, label: '3 seconds' }, { value: 6, label: '6 seconds' }, { value: 10, label: '10 seconds' }]}
            />
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>A second touch sooner than this is a bounce</span>
            <SegmentedControl<number>
              label="A second touch sooner than this is a bounce"
              value={config.remoteTouch.secondTapMinMs}
              onChange={(secondTapMinMs) => update({ remoteTouch: { ...config.remoteTouch, secondTapMinMs } })}
              options={SECOND_TAP_MIN_MS.map((ms) => ({ value: ms, label: `${ms / 1000} seconds` }))}
            />
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              A shaky press can land as several quick touches. A touch this soon after the one before it is ignored, so
              {`a press never counts as its own second tap: End piece, ${WORDS.stopLoops} and Mute wait for a real second tap.`}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Also on the Play page</span>
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              Put what the player needs during the piece on the page they play on, so they never have to switch page.
            </span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([['endPiece', 'End piece'], ['nextScene', 'Next scene'], ['capture', 'Capture'], ['stopAll', WORDS.stopLoops]] as const).map(([x, word]) => (
                <label key={x} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={config.remoteTouch.playExtras.includes(x)}
                    onChange={(e) => update({ remoteTouch: { ...config.remoteTouch, playExtras: e.target.checked ? [...config.remoteTouch.playExtras, x] : config.remoteTouch.playExtras.filter((y) => y !== x) } })}
                  />
                  {word}
                </label>
              ))}
              {Array.from({ length: LAUNCH_SLOTS }, (_, slot) => slot).filter((slot) => (config.loopSlots[slot]?.length ?? 0) > 0).map((slot) => (
                <label key={`pl${slot}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={config.remoteTouch.playLoops.includes(slot)}
                    onChange={(e) => update({ remoteTouch: { ...config.remoteTouch, playLoops: e.target.checked ? [...config.remoteTouch.playLoops, slot].sort((a, b) => a - b) : config.remoteTouch.playLoops.filter((y) => y !== slot) } })}
                  />
                  {loopLabel(config.loopNames, slot)}
                </label>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={config.remoteTouch.showNext}
                onChange={(e) => update({ remoteTouch: { ...config.remoteTouch, showNext: e.target.checked } })}
              />
              Show Next scene on the iPad (untick if a brush against it could change the whole sound)
            </label>
          </div>
        </>
      )}
    </div>
    <BoardMidiPanel
      config={config}
      port={midiPort}
      running={running}
      holdOnAdmi={midiHold}
      onChange={(patch) => update(patch)}
      onSwitchBack={switchBackToAbleton}
      onTestNote={() => engineRef.current?.playTestNote() ?? false}
      onPanic={midiPanic}
      getAbletonLive={getAbletonLive}
      onSendSounds={sendSoundsToAbleton}
    />
    </div>
  );

  /** Advanced sound: what most sessions never change, under the Sound tab's last fold. */
  const soundAdvanced = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontWeight: 600 }}>Counters play tunes</span>
      <SegmentedControl<'phrase' | 'note'>
        label="Counters play tunes"
        value={config.phrases ? 'phrase' : 'note'}
        onChange={(v) => update({ phrases: v === 'phrase' })}
        options={[{ value: 'phrase', label: 'Each colour chooses' }, { value: 'note', label: 'Always one note' }]}
      />
      <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
        {config.phrases
          ? 'Each colour card says whether its counters play one note or a tune (a groove, a bassline, the chords).'
          : 'Every counter plays one note on its step, whatever the cards say.'}
      </span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontWeight: 600 }}>Extra notes come from</span>
      <SegmentedControl<'magenta' | 'rules'>
        label="Extra notes come from"
        value={config.fillEngine}
        onChange={(v) => update({ fillEngine: v })}
        options={[{ value: 'magenta', label: 'Magenta AI' }, { value: 'rules', label: 'Simple rules' }]}
      />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontWeight: 600 }}>Sounds change instrument every</span>
      <SegmentedControl<number>
        label="Sounds change instrument every"
        value={config.evolveSceneLoops}
        onChange={(v) => update({ evolveSceneLoops: v })}
        options={[{ value: 4, label: '4 loops' }, { value: 8, label: '8 loops' }, { value: 16, label: '16 loops' }]}
      />
    </div>
    <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <legend style={{ fontWeight: 600, padding: 0 }}>Pressing</legend>
      <span style={{ fontSize: 14 }}>Time to press again</span>
      <SegmentedControl<number>
        label="Time to press again"
        value={config.pressAgainSec}
        onChange={(pressAgainSec) => update({ pressAgainSec })}
        options={PRESS_AGAIN_CHOICES.map((sec) => ({ value: sec, label: `${sec} seconds` }))}
      />
      <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
        While the piece plays, Stop, Exit and Set up need a second press within this time. Undo and the notices stay up
        for longer to match.
      </span>
      <label>
        <input
          type="checkbox" checked={config.spaceKeyOn}
          onChange={(e) => update({ spaceKeyOn: e.target.checked })}
        />
        Space plays and stops
      </label>
      <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
        Switch it off if a switch box sends Space. Shift+S still simplifies.
      </span>
    </fieldset>
    <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <legend style={{ fontWeight: 600, padding: 0 }}>Keeping time</legend>
      <label>
        <input
          type="checkbox" checked={config.keepTimeValve}
          onChange={(e) => update({ keepTimeValve: e.target.checked })}
        />
        Pause the extras when the sound falls behind
      </label>
      <label>
        {`Falling behind means ${config.keepTimeBehindSec.toFixed(1)} s lost in 20 s`}
        <input
          type="range"
          min={Math.round(KEEPING_TIME_RANGE.behindSec.min * 10)} max={Math.round(KEEPING_TIME_RANGE.behindSec.max * 10)} step={1}
          value={Math.round(config.keepTimeBehindSec * 10)}
          onChange={(e) => update({ keepTimeBehindSec: Number(e.target.value) / 10 })}
        />
      </label>
      <label>
        {`Warn when the sound's clock is ${config.keepTimeDriftSec.toFixed(1)} s slow`}
        <input
          type="range"
          min={Math.round(KEEPING_TIME_RANGE.driftSec.min * 10)} max={Math.round(KEEPING_TIME_RANGE.driftSec.max * 10)} step={1}
          value={Math.round(config.keepTimeDriftSec * 10)}
          onChange={(e) => update({ keepTimeDriftSec: Number(e.target.value) / 10 })}
        />
      </label>
      <span style={REASON_STYLE}>
        Lower numbers warn sooner. The extras are paused heaviest first: Magenta, then Extra notes, then Sounds change.
      </span>
    </fieldset>
              <label>
                Key
                <select
                  value={config.scaleRootMidi}
                  onChange={(e) => {
                    const root = Number(e.target.value);
                    update({ scaleRootMidi: root });
                    engineRef.current?.setScale(root, configRef.current.scaleSemitones);
                  }}
                >
                  {NOTE_NAMES.map((n, i) => (
                    <option key={n} value={60 + i}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Scale
                <select
                  value={config.scaleName}
                  onChange={(e) => {
                    const preset = SCALE_PRESETS.find((s) => s.name === e.target.value) ?? SCALE_PRESETS[0];
                    update({ scaleName: preset.name, scaleSemitones: preset.semitones });
                    engineRef.current?.setScale(configRef.current.scaleRootMidi, preset.semitones);
                  }}
                >
                  {SCALE_PRESETS.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Octave {config.octaveShift > 0 ? `+${config.octaveShift}` : config.octaveShift}
                <input
                  type="range" min={-2} max={2} step={1} value={config.octaveShift}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    update({ octaveShift: v });
                    engineRef.current?.setOctaveShift(v);
                  }}
                />
              </label>
              <label>
                Note length {config.noteLengthBeats.toFixed(1)} beats
                <input
                  type="range" min={1} max={40} value={Math.round(config.noteLengthBeats * 10)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 10;
                    update({ noteLengthBeats: v });
                    engineRef.current?.setNoteLength(v);
                  }}
                />
              </label>
              <label>
                Volume {Math.round(config.volume * 100)}%
                <input
                  type="range" min={0} max={100} value={Math.round(config.volume * 100)}
                  disabled={volumeReason !== null}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    update({ volume: v });
                    engineRef.current?.setVolume(v);
                  }}
                />
                <span style={REASON_STYLE}>{volumeReason ?? ''}</span>
              </label>
              <label>
                <input
                  type="checkbox" checked={config.tickEnabled}
                  onChange={(e) => update({ tickEnabled: e.target.checked })}
                />
                Confirmation tick
              </label>
              <label>
                <input
                  type="checkbox" checked={config.studioMix}
                  onChange={(e) => update({ studioMix: e.target.checked })}
                />
                Studio mix
                <span style={REASON_STYLE}>
                  {config.studioMix
                    ? 'Fuller sound: stereo, notes ring on, bass and chords make room for the kick.'
                    : 'The original mix, for comparing.'}
                </span>
              </label>
              {controlChannels.length > 0 && (
              <div>
                <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Fader reads</span>
                <SegmentedControl<'row' | 'col'>
                  label="Fader reads"
                  value={config.faderAxis}
                  onChange={(axis) => update({ faderAxis: axis })}
                  options={[
                    { value: 'row', label: 'Up and down' },
                    { value: 'col', label: 'Left and right' },
                  ]}
                />
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--bs-fg2)' }}>
                  Which way a control counter is read when it isn&apos;t in a lane. A lane always
                  reads along itself.
                </p>
              </div>
            )}
            {controlChannels.map((c) => {
                const role = c.role as FaderRole;
                const range = config.controlRanges[role];
                return (
                  <div key={`ctl-${c.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 12, height: 12, borderRadius: '50%', background: c.swatch, border: '1px solid #0008' }}
                      />
                      <span style={{ flex: 1 }}>{describeChannel(c)}</span>
                      <span aria-live="off">
                        {legendValue(role, controlState?.values[role], controlState?.held ?? new Set())}
                      </span>
                    </div>
                    <label>
                      When it leaves the board
                      <select
                        value={config.controlRemoval[role]}
                        onChange={(e) => update({
                          controlRemoval: { ...config.controlRemoval, [role]: e.target.value as ControlRemoval },
                        })}
                      >
                        {REMOVAL_LABELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label style={{ flex: 1 }}>
                        Lowest
                        <input
                          type="number" step={role === 'tempo' ? 5 : 0.05} value={range.min}
                          min={CONTROL_RANGE_LIMITS[role].min} max={CONTROL_RANGE_LIMITS[role].max}
                          // The speed is typed digit by digit ("1", "12", "120"): held to its limits
                          // when the box is left, not while typing.
                          onChange={(e) => update({
                            controlRanges: { ...config.controlRanges, [role]: { ...range, min: role === 'tempo' ? Number(e.target.value) || 0 : clampToControl(role, Number(e.target.value) || 0) } },
                          })}
                          onBlur={() => update({
                            controlRanges: { ...configRef.current.controlRanges, [role]: { ...configRef.current.controlRanges[role], min: clampToControl(role, configRef.current.controlRanges[role].min) } },
                          })}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        Highest
                        <input
                          type="number" step={role === 'tempo' ? 5 : 0.05} value={range.max}
                          min={CONTROL_RANGE_LIMITS[role].min} max={CONTROL_RANGE_LIMITS[role].max}
                          // The speed is typed digit by digit ("1", "12", "120"): held to its limits
                          // when the box is left, not while typing.
                          onChange={(e) => update({
                            controlRanges: { ...config.controlRanges, [role]: { ...range, max: role === 'tempo' ? Number(e.target.value) || 0 : clampToControl(role, Number(e.target.value) || 0) } },
                          })}
                          onBlur={() => update({
                            controlRanges: { ...configRef.current.controlRanges, [role]: { ...configRef.current.controlRanges[role], max: clampToControl(role, configRef.current.controlRanges[role].max) } },
                          })}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {channels.filter((c) => c.role === 'melody' || c.role === 'chord' || c.role === 'bass').length === 0 ? (
                <span style={{ fontSize: 14, opacity: 0.6 }}>Add a melody/chord/bass colour to mix it.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 4, fontSize: 14, opacity: 0.7 }}>
                    <span style={{ width: 20 }} />
                    <span style={{ width: 48, textAlign: 'center' }}>Vol</span>
                    <span style={{ width: 48, textAlign: 'center' }}>Tone</span>
                    <span style={{ width: 48, textAlign: 'center' }}>Rev</span>
                    <span style={{ width: 48, textAlign: 'center' }}>Dly</span>
                  </div>
                  {channels.filter((c) => c.role === 'melody' || c.role === 'chord' || c.role === 'bass').map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                        background: c.swatch, border: '1px solid #0008',
                      }}
                      />
                      {([
                        ['volume', c.volume ?? 1],
                        ['tone', c.tone ?? 1],
                        ['reverbSend', c.reverbSend ?? 0.18],
                        ['delaySend', c.delaySend ?? 0],
                      ] as const).map(([field, val]) => (
                        <input
                          key={field} type="range" min={0} max={100} style={{ width: 48 }}
                          value={Math.round(val * 100)}
                          onChange={(e) => setChannelMix(c.id, field, Number(e.target.value) / 100)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
    </div>
  );

  const soundTab = (
    <SoundTab
      config={config}
      palette={palette}
      running={running}
      abletonShares={soundFrom === 'admi' ? undefined : planFromConfig(config).shares}
      update={update}
      setChannelSound={setChannelSound}
      onRole={setChannelRole}
      onLoopSlot={(id, slot) => patchChannel(id, { loopSlot: slot })}
      onHear={hearColour}
      hearing={hearing}
      hearNote={hearNote}
      setGroove={(swing, humanize) => {
        update({ swing, humanize });
        engineRef.current?.setSwing(swing);
        engineRef.current?.setHumanize(humanize);
      }}
      fill={{
        reason: fillReason,
        count: fillCount,
        status: config.fillEngine === 'magenta' && config.fillAmount > 0 && running ? FILL_STATUS_TEXT[fillStatus] : null,
        onTry: newFillIdea,
        onPrevious: () => {
          if (prevFillSeed === null) return;
          update({ fillSeed: prevFillSeed, fillKept: null });
          setPrevFillSeed(null);
          announce('Back to the previous extra notes.');
        },
        canPrevious: prevFillSeed !== null,
        frozen: config.fillKept !== null,
        freezeReason: !running || fillCount === 0 ? 'Play with some extra notes to freeze them.' : null,
        onFreeze: () => {
          if (config.fillKept) {
            update({ fillKept: null });
            announce('The extra notes follow the board again.');
            return;
          }
          const notes = engineRef.current?.getFillNotes() ?? [];
          if (notes.length === 0) return;
          update({ fillKept: notes });
          announce('Extra notes frozen.');
        },
      }}
      evolve={{
        reason: evolveReason,
        lastChange: running && config.evolveAmount > 0 && evolveLabels.size > 0
          ? `Now: ${config.channels.filter((c) => evolveLabels.has(c.id)).map((c) => `${describeChannel(c)} ${evolveLabels.get(c.id)!.label}`).join(' · ')}`
          : null,
        onTry: newEvolveSound,
        onPrevious: () => {
          if (prevEvolveSeed === null) return;
          update({ evolveSeed: prevEvolveSeed, evolveHoldLap: null });
          setPrevEvolveSeed(null);
          announce('Back to the previous sounds.');
        },
        canPrevious: prevEvolveSeed !== null,
        frozen: config.evolveHoldLap !== null,
        freezeReason: config.evolveAmount <= 0 ? 'Turn "Sounds change" on first.' : null,
        onFreeze: () => {
          if (config.evolveHoldLap !== null) {
            update({ evolveHoldLap: null });
            announce('The sounds change again.');
            return;
          }
          update({ evolveHoldLap: engineRef.current?.getEvolveLap() ?? 0 });
          announce('Sounds frozen.');
        },
      }}
      band={{ playing: bandStatus.playing, parts: bandStatus.parts }}
      liveValue={(c) => (isFaderRole(c.role)
        ? `Now: ${legendValue(c.role as FaderRole, controlState?.values[c.role as FaderRole], controlState?.held ?? new Set())}`
        : null)}
      advanced={soundAdvanced}
    />
  );

  /**
   * Move a lane, refusing a move that would put it over the other one. Controls win that
   * argument, so an overlapping loop lane is simply dead pads — better to say why than to
   * let the player set it and wonder which pad broke.
   */
  const setLane = (which: 'controlZone' | 'loopZone', zone: Zone): void => {
    const other = which === 'controlZone' ? config.loopZone : config.controlZone;
    if (zonesCollide(zone, other)) {
      announce(which === 'controlZone'
        ? `${describeZone(zone)} is already the loop pads. Pick another, or turn the pads off.`
        : `${describeZone(zone)} is already the controls. Pick another, or move the controls.`);
      return;
    }
    update({ [which]: zone } as Partial<BoardSequencerStored>);
  };

  const loopSlotCount = zoneSlotCount(config.loopZone, config.rows, config.cols);
  // The Loop bank (counters on the bottom row as save slots) is the old way to make a
  // loop. New loop replaces it; it is shown only for a profile that already saved into it.
  const loopBankInUse = loopBankRef.current.saved.some((s) => s !== null && s.length > 0);

  // ---- the Perform tab: the whole piece in one place ----
  const passSecNow = (config.cols * Math.max(1, config.numPages) * 60) / Math.max(20, config.bpm);
  const performLoops: PieceLoop[] = Array.from({ length: LAUNCH_SLOTS }, (_, slot) => {
    const cells = config.loopSlots[slot] ?? null;
    return {
      slot, name: config.loopNames[slot] ?? '', notes: cells?.length ?? 0, cells: drawCells(cells ?? []),
      state: slotState(slot, cells !== null && cells.length > 0, new Set(wantedSlots), new Set(appliedSlots)),
    };
  });
  const worldOptions: { value: BoardSequencerStored['soundWorld']; label: string }[] = [
    ...SOUND_WORLD_IDS.map((id) => ({ value: id, label: SOUND_WORLDS[id].name })),
    { value: 'none', label: 'My picks' },
  ];
  /** Where a Ready-check fix is made, as the press that goes there. */
  const goToPlace = (place: CheckPlace) => (): void => {
    const tab = (t: PlayTab): void => { setWorkspace('play'); setPlayTab(t); };
    switch (place) {
      case 'scenes': setWorkspace('piece'); setPieceStep('scenes'); return;
      case 'sound': tab('sound'); return;
      case 'cap': tab('cap'); return;
      case 'connections': tab('connections'); return;
      case 'cameraBoard': {
        const pressed = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
        switchBoardSource('camera', pressed);
        return;
      }
      default:
        if (running) stop();
        setView('setup');
        setStep(place === 'setupColours' ? 'colours' : place === 'setupBoard' ? 'board' : 'camera');
    }
  };
  /** The pre-show checklist, checked by the app wherever it can be. */
  const readyItems = (): ReadyItem[] => {
    const c = config;
    const items: ReadyItem[] = [];
    items.push(boardItem({ laptop, cameraOk: c.enabled && (camera.phase === 'running' || camera.phase === 'fallback') }));
    if (c.cap.enabled) {
      items.push(cap.view.camera === 'no-camera'
        ? { label: 'Red cap: its camera could not be opened', state: 'problem', fix: 'Cap tab: choose the camera facing the player, or switch the cap off.', place: 'cap' }
        : cap.view.camera === 'only-board'
          ? { label: 'Red cap: no camera of its own (the only one is the board’s)', state: 'problem', fix: 'Connect a second camera facing the player, or switch the cap off.', place: 'cap' }
        : cap.view.seen && cap.view.source !== 'face' && !c.cap.learntHat
          // Not learnt, it may be following a red chair (B7): a thing to check, not "found".
          ? { label: 'Red cap: a red thing is found, but the hat is not learnt', state: 'warn', fix: 'Cap tab: Learn the hat, so it is sure it is the hat.', place: 'cap' }
        : cap.view.seen
          ? { label: `Red cap: ${cap.view.source === 'face' ? 'following the face' : 'found'}`, state: 'ok' }
          : { label: 'Red cap: not in sight', state: 'warn', place: 'cap', fix: c.cap.learntHat
            ? 'Cap tab: check the camera sees the player, or learn the hat again.'
            : 'Cap tab: check the camera sees the player and click the cap to learn its colour.' });
      // Which job each move does, so the owner can see it before the piece (B8).
      items.push({ label: hatJobsLine(c.cap.xRole, c.cap.yRole), state: 'ok' });
    }
    if (!laptop) {
      const det = detectionSetup(c);
      items.push(det.mode === 'board'
        ? { label: 'The empty board is learnt', state: 'ok' }
        : c.counterDetection === 'bands'
          ? { label: 'Counters are found by colour only (the old way)', state: 'warn', fix: 'Set up → Board → For testing: choose "Compare with the empty board".', place: 'setupBoard' }
          : { label: 'Counters are found by colour only for now', state: 'warn', fix: det.reason ?? 'Learn the board in Set up → Board.', place: 'setupBoard' });
    }
    items.push(c.channels.some((ch) => ch.role !== 'off')
      ? { label: 'Counter colours have jobs', state: 'ok' }
      : { label: 'No counter colour has a job', state: 'problem', fix: 'Set up: Colours.', place: 'setupColours' });
    // The piece itself: loops, scenes, times, length and ending (tested in pieceCheck).
    items.push(...pieceCheckItems({
      scenes: c.scenes, loopSlots: c.loopSlots, loopNames: c.loopNames, performance: c.performance, passSec: passSecNow,
      playerName: activePlayer?.name ?? null, onTakeOut: takeEmptyLoopOut,
      colourTimes: c.channels.filter(holdsBack).flatMap((ch) => {
        const at = c.colourComesInAt[ch.id];
        return typeof at === 'number' ? [{ name: describeChannel(ch), at }] : [];
      }),
    }));
    // Keeping time: the run now, else the last run long enough to say (spec 2026-10-28).
    items.push(...keepingTimeCheckItems(running && timeNow
      ? { report: timeNow.report, running: true, valve: timeNow.valve }
      : { report: lastRunTime?.report ?? null, running: false, valve: lastRunTime?.valve ?? [] }));
    items.push(...ipadCheckItems({
      enabled: remoteEnabled, connected: remoteLink.others > 0, safeLayout: isSafeShowLayout(c), pageOutOfDate: ipadOutOfDate,
      playerName: activePlayer?.name ?? null,
      onUseSafeLayout: () => {
        applySafeShowLayout();
        // The line goes from the check; the iPad settings, which say it, are not on screen.
        announce('Done: the iPad now shows only the Extra notes strip, New idea and End piece.');
      },
    }));
    if (c.fillEngine === 'magenta' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      items.push({ label: 'Offline: the AI’s extra notes use simple rules', state: 'warn', fix: 'Fine for the piece; connect once beforehand to load Magenta.' });
    }
    const ableton = abletonReadyItem({
      soundFrom, deviceId: c.midiDeviceId, connected: midiPort.connected, portName: midiPort.chosenName, holdOnAdmi: midiHold,
    });
    if (ableton) items.push(ableton);
    const tracks = abletonTracksItem(soundFrom);
    if (tracks) items.push(tracks);
    items.push(disk.state === 'saved'
      ? { label: 'Saved on this laptop', state: 'ok' }
      : { label: 'Not saved on this laptop', state: 'warn', fix: 'Open ADMI at http://localhost:3001 from npm run show, or back up to a file.' });
    items.push(backupItem(backedUpRef.current));
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) items.push({ label: 'Running the development server', state: 'warn', fix: 'For the performance start ADMI with npm run show: it cannot reload itself mid-piece.' });
    // Each fix that is made somewhere else gets a button that goes straight there (A14).
    return items.map((i) => (i.place && !i.action && i.state !== 'ok'
      ? { ...i, action: { label: PLACE_WORDS[i.place], name: `${PLACE_WORDS[i.place]}: ${i.label}`, onClick: goToPlace(i.place) } }
      : i));
  };

  const keepSlotNow = slotForKeep(config.loopSlots, config.scenes);
  // New loop on a stopped board (Stop pressed inside it, or a start that failed): what
  // stops the counters sounding, and whether ▶ Play can start them (R2-T1-01).
  const newLoopStopped: NewLoopStopped | null = running || starting ? null : {
    why: playReason ?? (soundError !== null ? `Could not start. ${soundError}` : null),
    canPlay: playReason === null,
  };
  const pieceTab = (
    <PieceSteps
      palette={palette}
      rows={config.rows}
      cols={config.cols}
      swatchFor={swatchFor}
      step={pieceStep}
      onStep={setPieceStep}
      running={running}
      lengthSec={config.performance.lengthSec}
      passSec={passSecNow}
      clock={clock}
      scenes={config.scenes}
      currentScene={config.currentScene}
      loops={performLoops}
      loopFadePasses={config.loopFadePasses}
      performance={config.performance}
      respectPlayer={config.sceneRespectsPlayer}
      canSaveBoard={countersNow > 0}
      loopsFull={keepSlotNow === null}
      deletedSceneName={deletedScene?.scene.name ?? null}
      diskLine={diskLine}
      restoreError={restoreError}
      worldOptions={worldOptions}
      readyItems={pieceStep === 'ending' ? readyItems() : []}
      playerName={activePlayer?.name ?? null}
      colours={config.channels.filter(holdsBack).map((ch) => ({
        id: ch.id, name: describeChannel(ch), swatch: ch.swatch, job: ROLE_LABELS[ch.role], at: config.colourComesInAt[ch.id] ?? null,
      }))}
      onColourEntry={(id, at) => update({ colourComesInAt: withColourEntry(configRef.current.colourComesInAt, id, at) })}
      onNewLoop={beginNewLoop}
      namingSlot={newLoop && keptLoop ? keptLoop.slot : null}
      newLoop={newLoop ? (
        <NewLoopPanel
          state={newLoop}
          loopNumber={keptLoop ? keptLoop.slot + 1 : (keepSlotNow === null ? null : keepSlotNow + 1)}
          // Waiting: what is still to lift. Composing: what Keep would keep.
          countersOnBoard={newLoop.phase === 'waitEmpty' ? soundingOnBoard() : keepCells(boardCellsNow(), config.channels).length}
          kept={keptLoop ? { slot: keptLoop.slot, name: config.loopNames[keptLoop.slot] ?? '' } : null}
          otherLoops={config.loopSlots.flatMap((s, i) => ((s?.length ?? 0) === 0 || i === keptLoop?.slot ? [] : [{ slot: i, name: config.loopNames[i] ?? '' }]))}
          takenNames={config.loopNames.filter((n, i) => i !== keptLoop?.slot && (config.loopSlots[i]?.length ?? 0) > 0 && n.trim() !== '')}
          onStartWithThese={() => setNewLoop((s) => (s ? startWithThese(s) : s))}
          onKeepBoard={() => {
            // Keep what's on the board: the counters sound again, and the loop is kept at once.
            const nl = newLoopRef.current ? startWithThese(newLoopRef.current) : null;
            newLoopRef.current = nl;
            setNewLoop(nl);
            keepNewLoop();
          }}
          onStartFromEmpty={() => {
            setNewLoop((s) => (s ? chooseFromEmpty(s) : s));
            announce(liftLine(soundingOnBoard(), configRef.current.boardSource === 'laptop'));
          }}
          onHearWith={(what) => { setNewLoop((s) => (s ? hearWith(s, what) : s)); }}
          onKeep={keepNewLoop}
          onRename={renameLoop}
          onLeave={leaveNewLoop}
          stopped={newLoopStopped}
          laptop={laptop}
          onPlay={() => { if (!startRefused()) void start(); }}
        />
      ) : null}
      onToggleLoop={toggleLoop}
      onSaveBoardToLoop={saveBoardToSlot}
      onDrawLoop={(slot) => setEditSlot(slot)}
      onClearLoop={(slot) => setClearSlotTarget(slot)}
      onRenameLoop={renameLoop}
      onLoopFade={(loopFadePasses) => update({ loopFadePasses })}
      onGoScene={goScene}
      onRehearseFrom={rehearseFrom}
      onSaveSceneFromNow={saveScene}
      onUpdateSceneFromNow={updateSceneFromNow}
      onEditScene={editScene}
      onDeleteScene={deleteScene}
      onUndoDelete={undoDeleteScene}
      onMakePlan={() => { if (configRef.current.scenes.length > 0) setPlanConfirm(true); else makePlan(); }}
      onRespectPlayer={(on) => update({ sceneRespectsPlayer: on })}
      onNewIdeasScene={newIdeasForScene}
      onNewIdeasPiece={newIdeasForPiece}
      surpriseMe={config.surpriseMe}
      onSurpriseMe={(on) => {
        update({ surpriseMe: on });
        announce(on ? 'Surprise me: different ideas every time the piece plays.' : 'Every rehearsal now plays the same ideas.');
      }}
      onPerformance={(patch) => update({ performance: { ...configRef.current.performance, ...patch } })}
      onBackup={backupToFile}
      onRestore={() => restoreInputRef.current?.click()}
      onShow={() => setView('bigBoard')}
    />
  );

  const loopsTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
      <Switch
        label="Where the counter sits matters"
        checked={config.boxDetailEnabled}
        onChange={(on) => update({ boxDetailEnabled: on })}
        hint="Higher in the square plays louder; right of centre plays late. Off by default."
      />
      {config.boxDetailEnabled && (
        <>
          <LabeledSlider
            label="How much louder"
            min={0}
            max={100}
            value={Math.round(config.boxLoudnessAmount * 100)}
            display={`${Math.round(config.boxLoudnessAmount * 100)}%`}
            onChange={(v) => update({ boxLoudnessAmount: v / 100 })}
          />
          <LabeledSlider
            label="How much later"
            min={0}
            max={100}
            value={Math.round(config.boxTimingAmount * 100)}
            display={`${Math.round(config.boxTimingAmount * 100)}%`}
            onChange={(v) => update({ boxTimingAmount: v / 100 })}
          />
        </>
      )}
      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Where control counters go</span>
        <SegmentedControl<ZoneMode>
          label="Where control counters go"
          value={config.controlZone.mode === 'off' ? 'anywhere' : config.controlZone.mode}
          onChange={(mode) => setLane('controlZone', clampZone({ mode, index: config.controlZone.index }, config.rows, config.cols))}
          options={[
            { value: 'anywhere', label: 'Anywhere' },
            { value: 'row', label: 'A row' },
            { value: 'col', label: 'A step' },
          ]}
        />
        {config.controlZone.mode !== 'anywhere' && config.controlZone.mode !== 'off' && (
          <SegmentedControl<number>
            label="Which one" showLabel
            value={config.controlZone.index}
            onChange={(index) => setLane('controlZone', { ...config.controlZone, index })}
            options={Array.from(
              { length: config.controlZone.mode === 'row' ? config.rows : config.cols },
              (_, i) => ({ value: i, label: String(i + 1) }),
            )}
          />
        )}
      </div>

      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Where loop pads go</span>
        <SegmentedControl<ZoneMode>
          label="Where loop pads go"
          value={config.loopZone.mode === 'anywhere' ? 'off' : config.loopZone.mode}
          onChange={(mode) => setLane('loopZone', clampZone(
            { mode, index: mode === 'row' ? config.rows - 1 : config.loopZone.index },
            config.rows,
            config.cols,
          ))}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'row', label: 'A row' },
            { value: 'col', label: 'A step' },
          ]}
        />
        {(config.loopZone.mode === 'row' || config.loopZone.mode === 'col') && (
          <>
            <SegmentedControl<number>
              label="Which one" showLabel
              value={config.loopZone.index}
              onChange={(index) => setLane('loopZone', { ...config.loopZone, index })}
              options={Array.from(
                { length: config.loopZone.mode === 'row' ? config.rows : config.cols },
                (_, i) => ({ value: i, label: String(i + 1) }),
              )}
            />
            <SegmentedControl<'hold' | 'toggle'>
              label="How a loop pad works" showLabel
              value={config.loopPadMode}
              onChange={(m) => update({ loopPadMode: m })}
              options={[
                { value: 'hold', label: 'Hold', hint: 'The counter stays on the pad while the loop plays.' },
                { value: 'toggle', label: 'Toggle', hint: 'Place it to start, place it again to stop.' },
              ]}
            />
          </>
        )}
      </div>

      <Switch
        label="Two counters in a box both play"
        checked={config.twoCounterMode === 'both'}
        onChange={(on) => update({ twoCounterMode: on ? 'both' : 'off' })}
        hint="Otherwise the stronger colour wins the box."
      />
              <Switch
                label={WORDS.thereAndBack}
                checked={config.pingPong}
                onChange={(pingPong) => update({ pingPong })}
                hint="The playhead sweeps → then back ←."
              />
              {config.pingPong && config.numPages > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{`${WORDS.thereAndBack} with ${config.numPages} pages`}</span>
                  <SegmentedControl<'each' | 'chain'>
                    label={`${WORDS.thereAndBack} with ${config.numPages} pages`}
                    value={config.pingPongPages}
                    onChange={(pingPongPages) => update({ pingPongPages })}
                    options={[
                      { value: 'each', label: 'Each page there and back' },
                      { value: 'chain', label: 'All pages as one strip' },
                    ]}
                  />
                  <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
                    {config.pingPongPages === 'each'
                      ? 'A → then ←, then B → then ←: every page plays both ways.'
                      : 'A → B → to the end, then back B ← A ←: like one long board.'}
                  </span>
                </div>
              )}
              {/* The lane picker above is the only switch: a second one could disagree
                  with it, and the runtime follows the lane. */}
              {loopSlotCount > 0 && loopBankInUse && (
                <LoopBankView
                  rows={config.rows}
                  cols={config.cols}
                  swatchById={new Map(config.channels.map((c) => [c.id, c.swatch]))}
                  onClear={(slot: number) => setClearSlotTarget(slot)}
                  slots={Array.from({ length: loopSlotCount }, (_, i) => ({
                    cells: config.loopSlots[i] ?? null,
                    // In Toggle mode a loop plays without its counter, so "playing" is
                    // what the player needs to see, not "a counter is on the pad".
                    active: (config.loopPadMode === 'toggle'
                      ? loopBankRef.current.playing?.[i] === true
                      : loopBankRef.current.present[i] === true)
                      && (config.loopSlots[i] ?? null) != null,
                  }))}
                />
              )}
              <Switch
                label="Variation"
                checked={config.variationEnabled}
                onChange={(variationEnabled) => update({ variationEnabled })}
                hint="A counter shoved to the edge of its square plays every other pass."
              />
              {config.variationEnabled && (
                <LabeledSlider
                  label="How far to the edge counts"
                  min={30} max={85}
                  value={Math.round(config.variationOffsetThreshold * 100)}
                  display={`${Math.round(config.variationOffsetThreshold * 100)}%`}
                  onChange={(v) => update({ variationOffsetThreshold: v / 100 })}
                  reason={config.numPages > 1 ? `Variation works with one page: set ${WORDS.pages} to 1 (${WORDS.timing} tab).` : null}
                />
              )}
    </div>
  );

  // The Ready check uses the same rule as the Play nudge, so a colour that will cause
  // trouble is named before the player starts rather than after.
  const matchingBoardColour = latestFrame
    ? colourMatchesBoardRaw(latestFrame.readings, {
      boardSquares: config.boardSquares,
      rows: config.rows,
      cols: config.cols,
      variationEnabled: config.variationEnabled,
      variationOffsetThreshold: config.variationOffsetThreshold,
      enabled: true,
    })
    : null;

  /**
   * Colours a laptop can add one at a time, each a clearly different hue so its name
   * (taken from the hue) is its own. The four of "Add four colours" come first.
   */
  const LAPTOP_COLOURS: { hsv: { h: number; s: number; v: number }; swatch: string }[] = [
    { hsv: { h: 2, s: 80, v: 80 }, swatch: '#d93a3a' },
    { hsv: { h: 215, s: 75, v: 75 }, swatch: '#2f6fd6' },
    { hsv: { h: 50, s: 85, v: 90 }, swatch: '#e8c21e' },
    { hsv: { h: 135, s: 70, v: 65 }, swatch: '#2f9a52' },
    { hsv: { h: 28, s: 85, v: 92 }, swatch: '#ea7a1f' },
    { hsv: { h: 275, s: 60, v: 70 }, swatch: '#8a4fc0' },
    { hsv: { h: 325, s: 65, v: 88 }, swatch: '#e04fa0' },
    { hsv: { h: 185, s: 75, v: 78 }, swatch: '#1fb5c4' },
    { hsv: { h: 0, s: 5, v: 95 }, swatch: '#f2f2f2' },
    { hsv: { h: 0, s: 10, v: 12 }, swatch: '#1c1c1c' },
  ];
  /** The first ready-made colour not already used by a colour of the same name. */
  const nextLaptopColour = (): typeof LAPTOP_COLOURS[number] | null => {
    const names = new Set(config.channels.map((c) => describeChannel(c)));
    for (const p of LAPTOP_COLOURS) {
      const cal = calibrationFromHsv(p.hsv);
      const probe: ColourChannel = { id: 'probe', kind: cal.kind, role: 'off', swatch: p.swatch, band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand };
      if (!names.has(describeChannel(probe))) return p;
    }
    return null;
  };
  const addLaptopColour = (role: ColourRole): void => {
    const p = nextLaptopColour();
    if (!p) return;
    const cal = calibrationFromHsv(p.hsv);
    setConfig((prev) => {
      const id = freshChannelId(prev.channels.map((c) => c.id), allReferencedChannelIds());
      const used = new Set(prev.channels.filter((c) => c.role === 'loop').map((c) => c.loopSlot ?? 0));
      const loopSlot = role === 'loop' ? Array.from({ length: LAUNCH_SLOTS }, (_, i) => i).find((i) => !used.has(i)) ?? 0 : undefined;
      const added: ColourChannel = withTuneDefault({ id, kind: cal.kind, role, swatch: p.swatch, band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand, ...(loopSlot !== undefined ? { loopSlot } : {}) }, prev.tunesForNewColours);
      return { ...prev, channels: [...prev.channels, added] };
    });
    setLaptopColour('');
    const probe: ColourChannel = { id: 'probe', kind: cal.kind, role, swatch: p.swatch, band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand };
    announce(`Added ${describeChannel(probe)}: ${ROLE_LABELS[role]}. Its sound is on the Sound tab; its job can be changed in Set up → Colours.`);
  };
  /** Four ready-made colours for a laptop that has never seen the board. */
  const addLaptopColours = (): void => {
    const presets: { hsv: { h: number; s: number; v: number }; swatch: string; role: ColourRole }[] = [
      { hsv: { h: 2, s: 80, v: 80 }, swatch: '#d93a3a', role: 'melody' },
      { hsv: { h: 215, s: 75, v: 75 }, swatch: '#2f6fd6', role: 'bass' },
      { hsv: { h: 50, s: 85, v: 90 }, swatch: '#e8c21e', role: 'chord' },
      { hsv: { h: 135, s: 70, v: 65 }, swatch: '#2f9a52', role: 'drums' },
    ];
    setConfig((prev) => {
      const channels = [...prev.channels];
      for (const p of presets) {
        const id = freshChannelId(channels.map((c) => c.id), allReferencedChannelIds());
        const cal = calibrationFromHsv(p.hsv);
        channels.push(withTuneDefault({ id, kind: cal.kind, role: p.role, swatch: p.swatch, band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand }, prev.tunesForNewColours));
      }
      return { ...prev, channels };
    });
    announce('Added red melody, blue bass, yellow chords and green drums.');
  };
  const setupStepBody = step === 'camera' ? (
    <>
    {/* Behind ?cameradebug=1. This is the screen a facilitator is actually on when a
        camera misbehaves, so the diagnostic belongs here too. */}
    {cameraDebugEnabled() && <CameraDebugPanel video={videoRef.current} camera={cameraRef.current} />}
    <CameraStep
      cameras={cameras}
      deviceId={config.cameraDeviceId}
      onPickCamera={(id) => changeCamera(id)}
      onTryAgain={() => setCameraRetry((n) => n + 1)}
      camera={camera}
      trackInfo={camInfo}
      saturation={feedSaturation}
      lightingNote={describeLighting(lighting)}
      mirrorX={config.mirrorX}
      mirrorY={config.mirrorY}
      rotation={config.cameraRotation}
      onTurn={turnCamera}
      onViewChange={changeView}
      onRefreshCameras={() => void refreshCameras()}
      handedness={config.handedness}
      resolution={resolution}
      onResolution={(size) => {
        // Saved first, then the camera is reopened: start() reads the saved size.
        saveCameraChoice({ ...loadCameraChoice(), ...size });
        setResolution(size);
        setCameraRetry((n) => n + 1);
        announce(`Picture size ${size.width} by ${size.height}. Reopening the camera.`);
      }}
    />
    </>
  ) : step === 'board' ? (
    <BoardStep
      boardSquares={config.boardSquares}
      rows={config.rows}
      cols={config.cols}
      nudgesEnabled={config.boardNudgesEnabled}
      running={running}
      editing={calibrating !== null}
      boardLearnt={learntSquares(config)}
      onLearnBoard={() => learnBoard()}
      learnMessage={learnMessage}
      detection={detectionSetup(config)}
      counterDetection={config.counterDetection}
      onCounterDetection={(counterDetection) => update({ counterDetection })}
      onSaveTestPictures={saveTestPictures}
      testPicturesMessage={testPicturesMessage}
      onFindBoard={() => void findBoard()}
      onTapCorners={() => { setProposal(null); setCalibrating('tap'); }}
      finding={finding}
      onCancelFind={() => findAbortRef.current?.abort()}
      findMessage={proposal?.reasons[0] ?? null}
      onBoardSquares={(n: BoardSquares) => updateGrid({ boardSquares: n })}
      onGrid={updateGrid}
      onNudgesEnabled={(on) => update({ boardNudgesEnabled: on })}
      trackingEnabled={config.boardTrackingEnabled}
      onTrackingEnabled={(on) => update({ boardTrackingEnabled: on })}
      usingFallbackCamera={camera.phase === 'fallback'}
    />
  ) : step === 'colours' ? (
    <ColoursStep
      channels={config.channels}
      counts={stats.byColour}
      palette={palette}
      arming={colourCalib}
      pending={pendingColour && {
        hex: pendingColour.hex,
        h: pendingColour.h,
        s: pendingColour.s,
        v: pendingColour.v,
        kindLabel: pendingColour.kind === 'hue' ? hueName(pendingColour.h)
          : pendingColour.kind === 'black' ? 'Black' : 'White',
        unsafe: pendingColour.unsafe === true,
        keeps: pendingColour.keeps,
      }}
      boardLearnt={learntSquares(config)}
      onLearnBoard={() => learnBoard()}
      learnMessage={learnMessage}
      onFindColours={() => void findColours()}
      finding={findingColours}
      onCancelFind={() => findAbortRef.current?.abort()}
      found={colourProposal}
      onUseFound={useDetectedColours}
      onDiscardFound={() => setColourProposal(null)}
      onArmTap={addColour}
      onCancelArm={() => { setColourCalib(null); setPendingColour(null); setSquarePicker(null); }}
      onAddPending={commitPendingColour}
      onDiscardPending={() => setPendingColour(null)}
      onRecalibrate={recalibrateChannel}
      onRole={setChannelRole}
      onLoopSlot={(id, slot) => patchChannel(id, { loopSlot: slot })}
      config={config}
      setChannelSound={setChannelSound}
      onHear={hearColour}
      hearing={hearing}
      hearNote={hearNote}
      running={running}
      onRemove={removeChannel}
      onClearAll={clearChannels}
      usesOf={colourUsesNow}
      minFilledFraction={config.minFilledFraction}
      readSettingsCustom={config.readSettingsCustom}
      onMinFill={(v) => update({ minFilledFraction: v, readSettingsCustom: true })}
      counterHeight={config.counterHeight}
      onCounterHeight={(counterHeight) => update({ counterHeight })}
      onResetReadSettings={() => setConfig((prev) => {
        const next = applyGridChange({ ...prev, readSettingsCustom: false }, {});
          return next;
      })}
      settleWindowMs={config.settleWindowMs}
      onSettleWindow={(ms) => update({ settleWindowMs: ms })}
      onBlackDarkness={setChannelBlackDarkness}
      picker={squarePicker}
      onMovePicker={(dRow, dCol) => setSquarePicker((pick) => {
        const base = pick ?? { row: Math.floor(config.boardSquares / 2), col: Math.floor(config.boardSquares / 2) };
        const clamp = (v: number) => Math.max(0, Math.min(config.boardSquares - 1, v));
        return { row: clamp(base.row + dRow), col: clamp(base.col + dCol) };
      })}
      onSampleSquare={sampleSquare}
      hands={{
        handGuardEnabled: config.handGuardEnabled,
        onHandGuardEnabled: (on) => update({ handGuardEnabled: on }),
        knockGuardEnabled: config.knockGuardEnabled,
        onKnockGuardEnabled: (on) => update({ knockGuardEnabled: on }),
        handMarginSquares: config.handMarginSquares,
        onHandMargin: (v) => update({ handMarginSquares: v }),
        intruderSensitivity: config.intruderSensitivity,
        onSensitivity: (v) => update({ intruderSensitivity: v }),
        checking: handCheck.checking,
        onCheckHand: startHandCheck,
        checkResult: handCheck.result,
      }}
      laptop={laptop ? { onAddColours: addLaptopColours, onAddColour: nextLaptopColour() ? () => addLaptopColour('melody') : null } : undefined}
    />
  ) : (
    <ReadyStep
      channels={config.channels}
      detected={active}
      palette={palette}
      matchingBoard={matchingBoardColour}
      onRecalibrate={(id) => { setStep('colours'); recalibrateChannel(id); }}
      onPlay={() => { setView('play'); void start(); }}
      playReason={playReason}
    />
  );

  const setupPanel = (
    <SetupFlow
      step={step}
      onStepChange={setStep}
      laptop={laptop}
      holdFocus={chooserOpen}
      cfg={setupCfg}
      camera={cameraGate}
      hasStoredConfig={storedRef.current !== null}
      announce={announce}
      footerAlign={layout.footerAlign}
      heading={laptop && step === 'colours' ? 'Choose the colours' : SETUP_HEADINGS[step]}
      hint={laptop
        ? (step === 'colours' ? 'Give each colour a job and a sound. ▶ Hear plays it.' : 'Click squares to put counters down, then press ▶ Play the board to hear them.')
        : SETUP_HINTS[step]}
      skip={step === 'board' ? {
        label: "Skip, board hasn't moved",
        reason: !config.enabled ? 'Find the board first.'
          : camera.phase === 'fallback' || camera.phase === 'error'
            ? 'Check the camera first.' : null,
        onClick: () => setStep('ready'),
      } : null}
    >
      {setupStepBody}
    </SetupFlow>
  );

  // While playing, the board is the stage and the camera shrinks to a picture-in-picture;
  // the surface keeps its place in the tree either way, so the camera never restarts.
  const heldCells = latestFrame?.held ?? new Set<string>();
  const ghostCells = latestFrame?.ghosts ?? new Map();
  const boardFrame = {
    detected: latestFrame?.frame.occupied ?? new Map(),
    settled: cellMap(active),
    conditional: latestFrame?.frame.conditional ?? new Set<string>(),
    bankCells: latestFrame?.frame.bankCells,
    held: heldCells,
    ghosts: ghostCells,
  };
  // Counters past their part's loop length never play: faded on the board, and said why.
  const partLoops = { melodic: config.loopStepsRed, drums: config.loopStepsBlack, bass: config.loopStepsBlue };
  const silentSquares = beyondLoopSquares(
    [...boardFrame.detected, ...boardFrame.settled] as [string, string][],
    (id) => channelById.get(id), partLoops, config.cols, config.phrases,
  );
  const beyondNote = beyondLoopNote(config.channels, partLoops, config.cols, config.phrases);
  const emptyLoopSlot = loopSlotCount > 0
    && loopBankRef.current.saved.slice(0, loopSlotCount).some((sl) => sl == null);

  // The laptop board's counters: the colours with a job, and what a click does.
  const laptopChannels = config.channels.filter((c) => c.role !== 'off');
  const laptopPick = laptopChannels.some((c) => c.id === laptopColour) ? laptopColour : (laptopChannels[0]?.id ?? '');
  const tapLaptopCell = (row: number, col: number): void => {
    const ch = laptopChannels.find((c) => c.id === laptopPick);
    if (!ch) { announce('Choose a colour above the board first.'); return; }
    const single = isControlRole(ch.role) || isLoopRole(ch.role);
    // From the latest state, not the last render: two quick clicks must both land.
    setConfig((prev) => ({ ...prev, laptopBoard: placeLaptopCounter(prev.laptopBoard, row, col, ch.id, single) }));
  };
  const describeLaptopCell = (row: number, col: number): string => {
    const c = config.laptopBoard.find((x) => x.row === row && x.col === col);
    const ch = c ? channelById.get(c.colour) : undefined;
    if (!ch) return 'empty';
    const waits = running && waitingNow.includes(ch.id) ? `, waiting: comes in at ${formatClock(config.colourComesInAt[ch.id] ?? 0)}` : '';
    return `${describeChannel(ch)}, ${ROLE_LABELS[ch.role]}${silentSquares.has(`${row},${col}`) ? ', past its loop: doesn’t play' : ''}${waits}`;
  };
  const laptopBar = (
    <LaptopBoardBar
      channels={laptopChannels}
      knownColours={config.channels.length}
      selected={laptopPick}
      onSelect={setLaptopColour}
      count={config.laptopBoard.filter((x) => x.row < config.rows && x.col < config.cols && channelById.has(x.colour)).length}
      onClear={() => {
        const before = configRef.current.laptopBoard;
        update({ laptopBoard: [] });
        // Shown with Undo, and read out: a line that appears is not always read (R2-T1-02).
        setUndoOffer({ text: 'Board cleared.', restore: () => update({ laptopBoard: before }) });
        announce('Board cleared.');
      }}
      onAddColours={addLaptopColours}
      onAddColour={nextLaptopColour() ? addLaptopColour : null}
      palette={palette}
    />
  );
  const switchBoardSource = (to: 'camera' | 'laptop', pressed: HTMLElement): void => {
    if (running) stop();
    update({ boardSource: to });
    if (to === 'laptop') { setError(null); setCamNotice(null); }
    if (to === 'laptop') setView('play');
    else { setView('setup'); setStep(resolveEntry({ enabled: config.enabled, channels: config.channels }, storedRef.current !== null)); }
    announce(to === 'laptop' ? 'Laptop board: click squares to place counters. No camera needed.' : 'Back to the camera and the real board.');
    // From set-up the button moves with the header, and focus fell to the page (R2-T4-02).
    // Play has no step heading: focus goes to where the laptop board starts, the colour a
    // click puts down (or Add four colours, with none yet). The camera's set-up step takes
    // focus to its own heading.
    if (to === 'laptop') {
      void focusWhenGone(() => {
        const bar = document.querySelector<HTMLElement>('[role="group"][aria-label="Laptop board"]');
        return bar?.querySelector<HTMLElement>('[aria-checked="true"]') ?? bar?.querySelector<HTMLElement>('button:not([disabled])');
      }, pressed);
    }
  };
  // Which board is in use, always visible: a planning session left on the laptop board
  // must not surprise anyone on the day.
  const boardSourceButton = (
    <div role="group" aria-label="Board" style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
      {(['camera', 'laptop'] as const).map((src) => (
        <Button
          key={src}
          tone={config.boardSource === src ? 'selected' : 'secondary'}
          aria-pressed={config.boardSource === src}
          onClick={(e) => { if (config.boardSource !== src) switchBoardSource(src, e.currentTarget); }}
          aria-label={src === 'laptop' ? 'Laptop board: play on the laptop, without the camera or board' : 'Camera board: the camera and the real board'}
        >
          {src === 'laptop' ? '💻 Laptop' : '📷 Camera'}
        </Button>
      ))}
    </div>
  );

  const boardView = (
    <LiveBoardView
      popStore={popStore}
      rows={config.rows}
      cols={config.cols}
      frame={boardFrame}
      playheadCol={playheadCol}
      playing={running}
      pingPongDirection={pingDir}
      swatchFor={swatchFor}
      palette={view === 'bigBoard' ? BOARD_TOKENS.calm.dark : palette}
      pageLabel={config.numPages > 1 ? `Page ${String.fromCharCode(65 + playingPage)} · live` : null}
      reducedMotion={reducedMotion}
      fillMarks={running ? fillMarks : undefined}
      loopCells={running ? [
        ...appliedSlots.flatMap((slot) => drawCells(config.loopSlots[slot] ?? [])),
        ...(latestFrame?.frame.activeLoops ?? []).flat(),
      ] : undefined}
      band={running && bandStatus.playing ? { playing: true, beatOn } : null}
      spans={running && config.phrases ? spans : undefined}
      notice={running ? boardNotice : null}
      // Counters go down on Play, where the colour picker is; in set-up the board only shows.
      // Set up too (U4): the board can be tried as soon as there are colours, silent until Play.
      onCellTap={laptop && (view === 'play' || (view === 'setup' && config.channels.length > 0)) ? tapLaptopCell : undefined}
      describeCell={laptop ? describeLaptopCell : undefined}
      silent={silentSquares}
      waiting={running && waitingNow.length > 0 ? new Set(waitingNow) : undefined}
    />
  );

  const updateCap = (patch: Partial<CapSettings>): void => update({ cap: { ...configRef.current.cap, ...patch } });
  const capTab = (
    <CapPanel
      settings={config.cap}
      onChange={updateCap}
      view={cap.view}
      previewRef={cap.previewRef}
      pointerRef={capPointerRef}
      mouse={capMouse}
      onMouse={setCapMouse}
      cameras={cap.cameras}
      learnReach={cap.learnReach}
      learnSide={cap.learnSide}
      learnHatStep={cap.learnHatStep}
      clearHatResult={cap.clearHatResult}
      boardCameraId={(!laptop && camInfo?.deviceId) || config.cameraDeviceId}
      colourAt={cap.colourAt}
      ranges={config.controlRanges}
      onRange={(role, range) => update({ controlRanges: { ...configRef.current.controlRanges, [role]: range } })}
      announce={announce}
    />
  );
  /** What the cap is doing, under the board: visible feedback for every change it makes. */
  const capHud = config.cap.enabled ? (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
      {/* Only the state is announced: the numbers change several times a second. */}
      <span role="status" aria-label="Red cap" style={{
        fontWeight: 700,
        // A red thing followed before the hat is learnt is not "found": plain, not green (B7).
        color: !cap.view.seen || cap.view.paused ? 'var(--bs-warn)'
          : cap.view.source !== 'face' && !config.cap.learntHat && cap.view.camera !== 'mouse' ? 'var(--bs-fg)' : 'var(--bs-ok)',
      }}
      >
        {/* The word, not a cap emoji (a blue cap on most systems, for a red hat): A16. */}
        {`Hat: ${capHudText(cap.view, config.cap.learntHat !== null, config.cap.locked)}`}
      </span>
      {(['xRole', 'yRole'] as const).map((k) => {
        const role = config.cap[k];
        if (role === 'off') return null;
        const pos = k === 'xRole' ? cap.view.axes.x : cap.view.axes.y;
        return (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {`${CAP_ROLE_LABELS[role]} ${capValueText(role, cap.view.values[role])}`}
            <span aria-hidden="true" style={{ width: 60, height: 8, borderRadius: 4, background: 'var(--bs-elev)', overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'block', width: `${Math.round((pos ?? 0) * 100)}%`, height: '100%', background: 'var(--bs-accent)' }} />
            </span>
          </span>
        );
      })}
    </div>
  ) : null;

  const boardLegend = (
    <BoardLegend
      tunes={config.channels.some((c) => playsTune(c, config.phrases))}
      loops={appliedSlots.length > 0 || (latestFrame?.frame.activeLoops ?? []).length > 0}
      extra={config.fillAmount > 0}
      band={config.band !== 'off'}
    />
  );

  // Now / Next: during a piece, the structure in large type above the board.
  const nn = nowNext(config.scenes, config.currentScene, clock && clock.phase !== 'idle' ? clock.elapsedSec : null);
  const nowNextProps = {
    clock,
    cue: cueShown,
    nowName: nn.now?.name ?? null,
    next: nn.next ? { name: nn.next.scene.name, inSec: nn.next.inSec } : null,
    loops: performLoops.filter((l) => l.state === 'playing' || l.state === 'starting').map((l) => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`)),
    ending,
    ended: pieceEnded,
    waiting: running ? waitingLine(
      waitingNow.flatMap((id) => { const ch = channelById.get(id); return ch ? [ch] : []; }), config.colourComesInAt,
    ) : null,
    onStartPiece: startThePiece,
    onNext: nextScene,
    undoNext: undoNext ? { name: undoNext.name } : null,
    onUndoNext: undoNextScene,
    onEnd: endPiece,
    onCancelEnding: cancelEnding,
    // No Capture here: a loop is made in New loop, never during the show (F1).
  };
  const nowNextStrip = <NowNextStrip {...nowNextProps} />;
  const bigNowNextStrip = <NowNextStrip {...nowNextProps} big focusRef={showNowNextRef} />;

  /**
   * ▶ Carry on after a reload: from where the clock is now, counted from when the piece
   * first started, so its end never moves. Looked at again on the press: an offer run out
   * since the banner last looked starts nothing, and says the piece has ended.
   */
  const carryOn = (): void => {
    const p = readPieceRunning();
    const now = Date.now();
    const offer = reloadOffer(p, now, endingLeadOf(configRef.current));
    setResumeFrom(null);
    if (offer !== 'carryOn' || p === null) {
      if (offer === 'ended') setEndedNotice(true);
      return;
    }
    const fromSec = (now - p.startedAt) / 1000;
    announce(`Carrying on from ${formatClock(fromSec)}.`);
    void start({ fromSec, startedAt: p.startedAt, scene: p.scene ?? null });
    // Back where it was: Show, if Show was open.
    if (p.show) setView('bigBoard');
  };
  /** No, or OK: the reload notice goes, and focus goes back to Show or to ▶ Play. */
  const dismissReloadNotice = (): void => {
    setResumeFrom(null);
    setEndedNotice(false);
    forgetPieceRunning();
    void focusWhenGone(() => (view === 'bigBoard' ? bigBoardRef.current : document.getElementById(PLAY_STOP_ID)));
  };
  const reloadNoticeView = running ? null : resumeFrom !== null ? (() => {
    const at = (Date.now() - resumeFrom.startedAt) / 1000;
    if (at >= resumeFrom.lengthSec) return null; // over: the tick takes the offer away
    return (
      <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn)', color: 'var(--bs-bg)', fontWeight: 600 }}>
        <span style={{ flex: '1 1 240px' }}>{`The piece was playing when the page closed or reloaded. The clock would be at ${formatClock(at)} now.`}</span>
        <Button ref={carryOnRef} tone="primary" onClick={carryOn}>{`▶ Carry on from ${formatClock(at)}`}</Button>
        <Button tone="secondary" onClick={dismissReloadNotice}>No</Button>
      </div>
    );
  })() : endedNotice ? (
    // Calm, not the orange alert: nothing is wrong, and nothing is asked.
    <div ref={endedLineRef} tabIndex={-1} role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)' }}>
      <span style={{ flex: '1 1 240px' }}>The piece was ending when the page closed or reloaded, so it has ended.</span>
      <Button tone="secondary" onClick={dismissReloadNotice}>OK</Button>
    </div>
  ) : null;

  /** The owner switches back on what the safety valve paused; it may pause them again if needed. */
  const restoreExtras = (): void => {
    engineRef.current?.resetValve();
    timeSeenRef.current = { ...timeSeenRef.current, steps: 0 };
    setTimeNow((prev) => (prev ? { ...prev, valve: [] } : prev));
    announce('The extras are back on.');
    sessionLogRef.current.action(logActorRef.current, 'extras back on');
  };
  // Simplify and keeping time, on the laptop only (Play and Show): quiet, and only there
  // when Simplify is on or there is a problem.
  const timeIndicator = running && timeNow ? keepingTimeIndicator(timeNow.report, timeNow.valve) : null;
  const simplifiedNow = simplifiedLine(activePlayer?.name ?? null, simplifyBed === null ? null : loopLabel(config.loopNames, simplifyBed));
  const simplifyWho = playerWords(activePlayer?.name ?? null).name;
  const simplifyButton = (
    <Button
      tone="secondary"
      aria-pressed={simplify === 'on'}
      disabled={!running}
      onClick={toggleSimplify}
      aria-label={simplify === 'on' ? 'Back to full (Shift+S)' : `Simplify: only ${simplifyWho} and the first loop (Shift+S)`}
      // One line, like every other button (U7); what it does is its tooltip, and once on the
      // line under the board says "Simplified: Tim and Bed" (B23).
      title={running ? (simplify === 'on' ? 'Back to full from the next pass' : `Simplify: only ${simplifyWho} and the first loop keep playing`) : 'Simplify works while playing.'}
    >
      {simplify === 'on' ? 'Back to full' : 'Simplify'}
    </Button>
  );
  const keepingTimeView = running && (timeIndicator !== null || simplify !== 'off') ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {simplify !== 'off' && (
        <div role="status" aria-label="Simplify" style={{ padding: '4px 12px', borderRadius: 'var(--bs-radius-md)', border: '2px solid var(--bs-accent)', fontWeight: 700 }}>
          {simplify === 'on' ? simplifiedNow : 'Back to full from the next pass'}
        </div>
      )}
      {timeIndicator && (
        <div role="status" aria-label="Keeping time" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 10px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn-tint)', border: '1px solid var(--bs-border-control)', fontSize: 14 }}>
          <span style={{ flex: '1 1 240px' }}>{timeIndicator.lines.join(' ')}</span>
          {timeIndicator.canRestore && <Button tone="quiet" onClick={restoreExtras}>Switch the extras back on</Button>}
        </div>
      )}
    </div>
  ) : null;

  /**
   * The audience screen, while one is open: notes as they are heard (none while muted:
   * nothing sounds), and how the board looks, a few times a second at most. From the
   * drawing loop, or from a timer while that loop is stopped (B6).
   */
  const feedAudience = (frame: RuntimeFrame['frame'] | null, drained: FiredNote[], nowMs: number): void => {
    const cfg = configRef.current;
    const engine = engineRef.current;
    const playing = runningRef.current && !!engine;
    const feed = audience.feedRef.current;
    if (feed?.alive(nowMs)) {
      if (playing && engine) {
        const r = dueNotes([...audiencePendingRef.current, ...drained], engine.audibleNow());
        audiencePendingRef.current = r.rest;
        if (!mutedRef.current) feed.notes(audienceNotes(r.due, (id) => loopSwatch(id, cfg.channels)));
      } else audiencePendingRef.current = [];
    } else if (audiencePendingRef.current.length > 0) audiencePendingRef.current = [];
    if (frame !== null && feed?.wantsState(nowMs)) {
      const live = cap.liveRef.current;
      const hat = audienceHat({
        capEnabled: cfg.cap.enabled, laptop: cfg.boardSource === 'laptop', mouse: capMouse, camera: live.camera,
        seen: live.seen, paused: live.paused, locked: cfg.cap.locked, learning: cap.view.learning !== null || cap.view.hatLearning !== null,
        axes: live.axes, xRole: cfg.cap.xRole, yRole: cfg.cap.yRole,
      });
      // Counters settle only while playing; stopped, the board is what the camera sees (as on the laptop).
      const cells = runningRef.current ? frame.patternCells : cellsFromOccupied(frame.occupied);
      feed.state(audienceState(cfg, cells, playing, playing && engine ? engine.getBpm() : cfg.bpm, hat), nowMs);
    }
  };
  feedAudienceRef.current = feedAudience;

  // The audience screen: a window of its own for the projector (src/audience). Opened in
  // Show and on Play; the laptop keeps everything else. Closing it takes a second press,
  // and in Show it can't be closed at all while the piece plays (B4).
  const audienceButton = audience.open && view === 'bigBoard' && running ? null : (
    <Button
      tone="secondary"
      onClick={() => {
        if (!audience.open) { setCloseAudienceArmed(false); audience.openWindow(); return; }
        if (!closeAudienceArmed) {
          setCloseAudienceArmed(true);
          announce('Press again to close the audience screen.');
          return;
        }
        setCloseAudienceArmed(false);
        audience.closeWindow();
      }}
    >
      {!audience.open ? 'Open the audience screen' : closeAudienceArmed ? 'Press again to close the audience screen' : 'Close the audience screen'}
    </Button>
  );
  const audienceNoticeView = audience.notice ? (
    <p role="status" aria-label="Audience screen" style={{ margin: 0, fontSize: 14, padding: '4px 10px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)' }}>
      {audienceNoticeText(audience.notice)}
    </p>
  ) : null;

  // Show's status row (B1, B14): what the owner needs to see mid-piece, in one line of fixed height.
  const hatState = ((): ShowHatState => {
    if (capMouse || cap.view.camera === 'mouse') return 'mouse';
    if (cap.view.paused) return 'paused';
    if (cap.view.camera === 'off' || cap.view.camera === 'starting') return 'starting';
    if (cap.view.camera !== 'running') return 'noCamera';
    if (cap.view.seen) return cap.view.source === 'face' ? 'face' : config.cap.learntHat ? 'found' : 'followed';
    return 'holding';
  })();
  const resumeAt = resumeFrom !== null ? (Date.now() - resumeFrom.startedAt) / 1000 : 0;
  const showStatus: ShowStatusInput = {
    camera: laptop ? null : (cameraStalled && running) || error !== null ? 'stopped' : 'ok',
    hat: config.cap.enabled ? {
      state: hatState,
      ...(cap.view.paused ? { why: CAP_PAUSE_TEXT[cap.view.paused] } : {}),
      locked: config.cap.locked,
      values: (['xRole', 'yRole'] as const).flatMap((k) => {
        const role = config.cap[k];
        if (role === 'off') return [];
        return [`${CAP_ROLE_LABELS[role]} ${capValueText(role, cap.view.values[role])}`];
      }),
    } : null,
    ipad: remoteEnabled ? {
      reaching: remoteLink.status === 'open' && remoteLink.others > 0 && remoteLink.reaching,
      endPressedOnce: ipadEndArmed,
    } : null,
    sound: soundFrom === 'admi' || midiPort.support === 'unknown' || midiPort.support === 'off' ? null
      : !midiPort.connected ? (running && midiHold ? 'lost' : 'notFound')
        : midiHold ? 'back' : 'ok',
    muted,
    simplify: running && simplify !== 'off'
      ? (simplify === 'on' ? simplifiedNow : 'Back to full from the next pass')
      : null,
    keepingTime: timeIndicator ? { text: timeIndicator.lines.join(' '), canRestore: timeIndicator.canRestore } : null,
    reload: running ? null
      : resumeFrom !== null ? (resumeAt < resumeFrom.lengthSec ? { kind: 'carryOn', at: formatClock(resumeAt) } : null)
        : endedNotice ? { kind: 'ended' } : null,
    keepInFront,
  };
  const showStatusAction = (a: ShowStatusAction): JSX.Element => {
    switch (a) {
      case 'retryCamera': return <Button tone="quiet" onClick={() => setCameraRetry((n) => n + 1)}>Try the camera again</Button>;
      case 'switchToAbleton': return <Button tone="quiet" onClick={switchBackToAbleton}>Switch to Ableton</Button>;
      case 'restoreExtras': return <Button tone="quiet" onClick={restoreExtras}>Switch the extras back on</Button>;
      case 'carryOn': return <Button ref={carryOnRef} tone="primary" onClick={carryOn}>{`▶ Carry on from ${formatClock(resumeAt)}`}</Button>;
      default: return <Button tone="quiet" onClick={dismissReloadNotice}>{resumeFrom !== null ? 'No' : 'OK'}</Button>;
    }
  };

  /**
   * The notices' one place (A3): side by side they go into the side panel's slot of fixed
   * height (U7), so the board has the strip above it back and a notice still moves nothing;
   * stacked, and in Set up, they stay above the board as before.
   */
  const noticeViews = (
    <>
      {view !== 'bigBoard' && reloadNoticeView}
      {undoOffer && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 12px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)' }}>
          <span style={{ flex: '1 1 200px' }}>{undoOffer.text}</span>
          <Button
            ref={undoButtonRef}
            tone="secondary"
            onClick={() => { undoOffer.restore(); dropUndoOffer(); announce('Undone.'); }}
          >
            Undo
          </Button>
        </div>
      )}
      {view !== 'bigBoard' && midiBannerView}
      {view !== 'bigBoard' && keepingTimeView}
      {view !== 'bigBoard' && audienceNoticeView}
      {cameraStalled && running && !laptop && (
        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-danger)', color: 'var(--bs-danger-fg)', fontWeight: 600 }}>
          <span style={{ flex: '1 1 240px' }}>The camera has stopped — the board isn&apos;t being read. The music carries on with the last pattern.</span>
          <Button tone="secondary" onClick={() => setCameraRetry((n) => n + 1)}>Try the camera again</Button>
        </div>
      )}
      {view === 'play' && !running && boardCheck !== null && boardCheck !== 'checking' && (
        <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 10px', borderRadius: 'var(--bs-radius-md)', background: boardCheck === 'found' ? 'transparent' : 'var(--bs-warn-tint)', border: '1px solid var(--bs-border-control)' }}>
          <span style={{ flex: '1 1 240px', color: boardCheck === 'found' ? 'var(--bs-ok)' : undefined, fontWeight: boardCheck === 'found' ? 600 : undefined }}>
            {boardCheck === 'found' && '✓ Board found'}
            {boardCheck === 'moved' && 'The board seems to have moved.'}
            {boardCheck === 'unsure' && 'Couldn’t see the whole board to check it. If counters play in the wrong places, find the board again.'}
          </span>
          {boardCheck !== 'found' && (
            <Button tone="secondary" onClick={() => { setBoardCheck(null); stop(); setView('setup'); setStep('board'); }}>Find board</Button>
          )}
        </div>
      )}
      {view === 'play' && (
        <NudgeBanner
          reserve={false}
          signal={nudge}
          align={layout.footerAlign}
          nameFor={labelForId}
          onFindBoard={() => { stop(); setView('setup'); setStep('board'); setCalibrating('review'); }}
          onRecalibrate={(id) => { stop(); setView('setup'); setStep('colours'); recalibrateChannel(id); }}
          onDismiss={(kind) => { dismiss(kind); setNudge(null); }}
          onLetGo={() => { letGoGhosts(); setNudge(null); }}
          onSaveAsLoop={saveGhostsAsLoop}
          saveReason={emptyLoopSlot ? null : 'Turn the loop bank on and leave a slot free to save it.'}
        />
      )}
    </>
  );
  const noticesInPanel = view === 'play' && layout.mode !== 'stacked';
  const stage = (
    <div style={{ flex: layout.mode === 'stacked' ? 'none' : '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      {/* Stacked, or in Set up: the notices above the board, as they were. */}
      <div data-notice-slot-stacked="" style={{ display: 'contents' }}>
        {noticesInPanel ? null : noticeViews}
      </div>
      {/* In Set up only once there are colours: before that, the step's own Add four colours is the way in. */}
      {laptop && (view === 'play' || (view === 'setup' && config.channels.length > 0)) && laptopBar}
      {/* Play is just playing: the piece's strip (Start the piece, Next, End) only once
          there is a piece to steer — scenes, or its clock running. With neither, Next did
          nothing and the clock began a countdown that faded the music out by itself. */}
      {/* With scenes made, there whether or not the board plays (U5): it appeared when play
          started and the board shrank by its height. */}
      {view === 'play' && (config.scenes.length > 0 || (running && clock !== null && clock.phase !== 'idle')) && nowNextStrip}
      {/* The board is the instrument: never squeezed below about half the screen. */}
      {/* Stacked (narrow, or Large controls) the stage has no height of its own: the board's
          is set here, as tall as the window allows and never wider than it (A3: on an iPad
          held upright it was 240 px). */}
      {(view === 'play' || laptop) && (
        <div style={layout.mode === 'stacked'
          ? { height: 'min(clamp(240px, 52vh, 560px), calc(100vw - 32px))', flexShrink: 0 }
          : { flex: 1, minHeight: 'clamp(240px, 52vh, 560px)' }}
        >
          {boardView}
        </div>
      )}
      {/* In Set up on the laptop board: always there, so starting play never shrinks the
          board (A3). On the Board view it is under Details (U4). */}
      {view !== 'play' && laptop && boardLegend}
      {/* Not on the laptop board (U7): there is no camera there for the hat to be seen by,
          unless the mouse is standing in for it (Test with the mouse). */}
      {view === 'play' && (!laptop || cap.view.camera === 'mouse') && capHud}
      <div style={view === 'play' && !laptop
        ? { width: 220, alignSelf: layout.pip === 'bottom-left' ? 'flex-start' : 'flex-end' }
        : undefined}
      >
      <CameraSurface
        videoRef={videoRef}
        overlayRef={overlayRef}
        hidden={view === 'bigBoard' || laptop}
        mirrorX={config.mirrorX}
        mirrorY={config.mirrorY}
        rotation={config.cameraRotation}
        onPick={colourCalib ? (pt) => sampleColourClick(pt.x, pt.y) : undefined}
        label={colourCalib ? `Tap a counter to set ${calibLabel}` : 'Board camera'}
      >
        {calibrating !== null && (
          <BoardCornerEditor
            corners={calibrating === 'tap' ? undefined : proposal?.corners ?? (config.enabled ? config.corners : undefined)}
            mode={calibrating}
            rows={config.rows}
            cols={config.cols}
            controlsSide={layout.nudgePad}
            onConfirm={(corners) => {
              // A confirmed proposal saves its square count with the corners, in one write.
              handleCalibrated(
                corners,
                proposal?.squares && proposal.squares !== config.boardSquares
                  ? { boardSquares: proposal.squares }
                  : {},
              );
              setProposal(null);
              setCalibrating(null);
            }}
            onCancel={() => { setProposal(null); setCalibrating(null); }}
          />
        )}
        {/* Which counter each proposal came from, numbered to match the list.
            "3 counters" under one swatch is unarguable without this: the player cannot
            see WHICH three were run together, so cannot tell a wrong answer from counters
            that really are that alike. Two badges with the same number on obviously
            different counters says it in one glance. */}
        {colourProposal && config.enabled && colourProposal.colours.flatMap((c, i) =>
          c.squares.map((sqr) => {
            const centre = squareCentreToImage(config.corners, config.boardSquares, sqr.row, sqr.col);
            return (
              <span
                key={`${i}-${sqr.row}-${sqr.col}`}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${centre.x * 100}%`,
                  top: `${centre.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  minWidth: 22, height: 22, borderRadius: 11,
                  display: 'grid', placeItems: 'center',
                  background: c.swatch, color: '#000',
                  border: '2px solid #fff', boxShadow: '0 0 0 2px #000',
                  fontSize: 14, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                }}
              >
                {i + 1}
              </span>
            );
          }))}

        {/* Exactly where the colour was read from. A swatch alone can't tell you whether
            a wrong colour means "you tapped the wood" or "the tap landed somewhere else";
            this makes the difference visible instead of arguable. */}
        {pendingColour?.at && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${pendingColour.at.x * 100}%`,
              top: `${pendingColour.at.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 26, height: 26, borderRadius: '50%',
              border: `3px solid ${pendingColour.hex}`,
              boxShadow: '0 0 0 2px #000, 0 0 0 5px #fff',
            }}
          />
        )}
        {colourCalib && squarePicker && config.enabled && (() => {
          const centre = squareCentreToImage(config.corners, config.boardSquares, squarePicker.row, squarePicker.col);
          return (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${centre.x * 100}%`,
                top: `${centre.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 34, height: 34, borderRadius: 'var(--bs-radius-sm)',
                border: '3px solid var(--bs-accent)', boxShadow: '0 0 0 2px var(--bs-bg)',
              }}
            />
          );
        })()}
        {colourCalib && (
          <div style={{
            position: 'absolute', top: 8, left: 8, padding: '4px 8px',
            background: 'var(--bs-bg)', color: 'var(--bs-fg)', borderRadius: 'var(--bs-radius-sm)',
          }}
          >
            {`Tap a counter to set ${calibLabel}`}
          </div>
        )}
      </CameraSurface>
      </div>
      {view === 'setup' && !laptop && (
        <>
          {/* Camera check: which camera, what it delivers, whether the frames the
              app reads carry colour, and what the last colour click captured. Not on the
              laptop board, which has no camera to start (A16). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 14, opacity: 0.9 }}>
            <span>
              Camera: <strong>{camInfo ? (camInfo.label || 'Unnamed camera') : error ? 'not available' : 'starting…'}</strong>
              {camInfo && camInfo.width > 0 && ` · ${camInfo.width}×${camInfo.height}`}
              {camInfo && camInfo.frameRate > 0 && ` @ ${Math.round(camInfo.frameRate)} fps`}
            </span>
            {/* Always-mounted live regions: only their text changes, so each message is
                announced once (and the camera notice is visible even with the
                Camera & board section collapsed). */}
            <span role="status" style={{ color: 'var(--bs-warn)' }}>{camNotice?.text ?? ''}</span>
            <span role="alert" style={{ color: 'var(--bs-warn)' }}>
              {feedColourless
                ? '⚠ This camera\'s picture is reaching the app in black and white, so piece colours can\'t be told apart. Try another camera, or turn off filters/effects in its app.'
                : ''}
            </span>
            {feedSaturation !== null && (
              <span>
                Colour in picture: {feedColourless ? 'black and white' : 'OK'} (colour level {Math.round(feedSaturation)})
              </span>
            )}
            {lastSample && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                Last colour click:
                <span style={{
                  width: 12, height: 12, borderRadius: '50%', background: lastSample.hex, border: '1px solid #0008',
                }}
                />
                <strong>
                  {lastSample.kind === 'hue' ? hueName(lastSample.h) : lastSample.kind === 'black' ? 'Black' : 'White'}
                </strong>
                · hue {Math.round(lastSample.h)}° · colour level {Math.round(lastSample.s)} · brightness {Math.round(lastSample.v)}
              </span>
            )}
          </div>
        </>
      )}
      {/* Under the board, one line (U4): Details opens the legend, the AI line, every colour's
          sound and count, and the session log. Four lines here kept the board small. */}
      {view === 'play' && (
      <details data-board-details="" style={{ flexShrink: 0 }}>
        <summary className="bs-fold" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--bs-fg2)', minHeight: 'var(--bs-target)', display: 'flex', alignItems: 'center' }}>Details</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
      {boardLegend}
      {view === 'play' && aiOffLine(config.fillAmount, config.evolveAmount) && (
        <span role="status" style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{aiOffLine(config.fillAmount, config.evolveAmount)}</span>
      )}
      {view === 'play' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {config.channels.map((c, i) => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={20} />
              <span>{describeChannel(c)}</span>
              {chipSound(c) && <span style={{ color: 'var(--bs-fg2)' }}>{chipSound(c)}</span>}
              <strong>
                {isFaderRole(c.role)
                  ? legendValue(c.role as FaderRole, controlState?.values[c.role as FaderRole], controlState?.held ?? new Set())
                  : c.role === 'off' ? 'not used'
                    : c.role === 'loop' ? `→ ${loopLabel(config.loopNames, c.loopSlot ?? 0)}${counterWantedRef.current.has(c.loopSlot ?? 0) ? ' ▶' : ''}`
                      // Stopped, nothing is playing: the same count is what's on the board.
                      : `${stats.byColour[c.id] ?? 0} ${running ? 'playing' : 'on the board'}`}
              </strong>
            </span>
          ))}
          {config.controlZone.mode !== 'anywhere' && config.controlZone.mode !== 'off' && (
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              {`Controls: ${describeZone(config.controlZone)}`}
            </span>
          )}
          {(config.loopZone.mode === 'row' || config.loopZone.mode === 'col') && (
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
              {`Loops: ${describeZone(config.loopZone)}`}
            </span>
          )}
          {/* Which way round the board reads. A player sitting at a different edge sees the
              screen turned relative to their board; this turns it back, without moving the
              camera or asking for the corners again. */}
          {!laptop && (
          <Button
            tone="quiet"
            onClick={turnBoard}
            reason={running ? null : config.enabled ? null : 'Find the board first.'}
            aria-label="Turn the board a quarter turn, so the screen matches the way you are sitting"
          >
            ⟲ Turn board
          </Button>
          )}
        </div>
      )}
      {/* The research tools, folded (A15): closed by default, they are not for the piece. */}
      {view === 'play' && (
        <details data-session-log="">
          <summary className="bs-fold" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--bs-fg2)', minHeight: 'var(--bs-target)', display: 'flex', alignItems: 'center' }}>Session log</summary>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <Button tone="quiet" onClick={() => announce(describeBoard(active, config.channels, config.rows, config.cols, config.velocity))}>
            Describe board
          </Button>
          {/* The session log: what the player made and what the instrument added, for the research. */}
          <Button
            tone="quiet"
            onClick={() => saveSession('json')}
            reason={logCounts.notes === 0 ? 'Nothing played yet this session.' : null}
            title={`Saves the session log as a JSON file: ${logCounts.notes} notes, ${logCounts.placed} yours, ${logCounts.added} added`}
          >
            {`Save session (${logCounts.notes} notes)`}
          </Button>
          {/* Its reason is Save session's, said once beside it. */}
          <Button tone="quiet" onClick={() => saveSession('csv')} disabled={logCounts.notes === 0} aria-label="CSV: the session log as a spreadsheet file">
            CSV
          </Button>
          {takes.length > 1 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 14 }}>{`Earlier takes (${takes.length - 1})`}</summary>
              <p style={{ margin: '4px 0', fontSize: 14, color: 'var(--bs-fg2)' }}>
                Every take is kept on this laptop as it is played: the newest {MAX_TAKES}.
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {takes.slice(1).map((t) => (
                  <li key={t.key} style={{ fontSize: 14 }}>
                    {`${new Date(t.startedAt).toLocaleString()} · ${t.player} · ${t.notes} notes `}
                    {(['json', 'csv'] as const).map((ext) => (
                      <Button
                        key={ext}
                        tone="quiet"
                        onClick={() => {
                          void archiveRef.current?.load(t.key).then((d) => { if (d) saveSession(ext, SessionLog.fromJSON(d)); });
                        }}
                      >
                        {ext.toUpperCase()}
                      </Button>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          </div>
          <p aria-live="off" style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)', minHeight: 18 }}>
            {pops.length > 0
              ? `Now: ${[...new Map(pops.map((n) => [n.colour, n])).values()]
                .map((n) => `${labelForId(n.colour)}${n.origin === 'phrase' ? ' (phrase)' : n.origin === 'fill' ? ' (extra note)' : ''}`)
                .join(', ')}`
              : ''}
          </p>
        </details>
      )}
        </div>
      </details>
      )}
      {/* The lines about what is playing, in a strip of fixed height under the board, so a
          line coming or going (the band joining, a note from the iPad) never resizes the
          board (A3). More than fits scroll inside it. */}
      <div
        data-status-lines=""
        style={view === 'play' && layout.mode !== 'stacked'
          ? { height: STATUS_LINES_HEIGHT, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }
          : { display: 'contents' }}
      >
      {view === 'play' && beyondNote && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)' }}>{beyondNote}</p>
      )}
      {view === 'play' && remoteNote && (
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--bs-accent)' }}>{remoteNote.text}</p>
      )}
      {view === 'play' && ipadEndArmed && (
        // Until the second tap, or its window runs out (B20).
        <p role="status" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>iPad: End piece pressed once</p>
      )}
      {view === 'play' && ipadOutOfDate && (
        // Stays while it is true, unlike the moment-long notes of what the iPad did.
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--bs-warn)' }}>{ipadOutOfDateText}</p>
      )}
      {view === 'play' && newLoop && (
        // New loop holds the band, Extra notes and the loops off: say so here too, so this
        // view never looks as if they should be playing (T1-09).
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--bs-accent)' }}>{newLoopStatusLine(newLoopStopped)}</p>
      )}
      {/* The band as the engine has it: in a new loop it is off unless asked for (T1-09). */}
      {view === 'play' && running && bandStatus.level !== 'off' && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)' }}>{bandLine(bandStatus, active.length > 0)}</p>
      )}
      {view === 'play' && running && !newLoop && config.evolveAmount > 0 && evolveLabels.size > 0 && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)' }}>
          {`Sounds${config.evolveHoldLap !== null ? ' (held)' : ''}: ${config.channels
            .filter((c) => evolveLabels.has(c.id))
            .map((c) => `${describeChannel(c)} — ${evolveLabels.get(c.id)!.label}`)
            .join(' · ')}`}
        </p>
      )}
      </div>
    </div>
  );

  // Big board is an OVERLAY, not a different tree: replacing the tree would unmount the
  // one <video> and stop the camera dead in the middle of a performance.
  const bigBoardOverlay = view === 'bigBoard' ? (
    <div
      ref={bigBoardRef}
      tabIndex={-1}
      role="region"
      aria-label="Show"
      // Always dark, whatever the theme: a light Show was a light box in a dark room (B15).
      className="bs-root"
      data-bs-style="calm"
      data-bs-mode="dark"
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        display: 'flex', flexDirection: 'column',
        padding: 12, boxSizing: 'border-box', gap: 8, background: 'var(--bs-bg)',
      }}
      onKeyDown={(e) => {
        // Esc leaves when the browser isn't in full screen (there the browser takes it to end
        // full screen, and Show stays: B5).
        if (e.key === 'Escape' && escLeavesShow(document.fullscreenElement !== null, fullscreenEndedAtRef.current, performance.now())) setView('play');
      }}
    >
      {running ? bigNowNextStrip : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)' }}>
          <Button
            ref={showStartRef}
            tone="primary"
            onClick={startThePiece}
            style={{ fontSize: 22, padding: '10px 26px' }}
          >
            ▶ Start the piece
          </Button>
          <span style={{ fontSize: 16 }}>
            {`${formatClock(config.performance.lengthSec)} · ${config.scenes.length === 0 ? 'no scenes' : `${config.scenes.length} ${config.scenes.length === 1 ? 'scene' : 'scenes'}`} · ${describeEnding(config.performance)}`}
          </span>
        </div>
      )}
      {/* Camera, hat, iPad, Ableton, and the notices: one line that never moves the board (B1, B14). */}
      <ShowStatusRow items={showStatusItems(showStatus)} action={showStatusAction} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {boardView}
        {/* Over the board's edge, not above it: it comes and goes without moving the board. */}
        {audienceNoticeView && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', maxWidth: 760 }}>{audienceNoticeView}</div>
          </div>
        )}
      </div>
      {/* Two groups (U3): the sound's own controls on the playing hand's side, and the rest
          (Simplify, the audience screen, Leave Show) on the other, so Leave Show is never next
          to Stop. */}
      <div
        style={{
          display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
          flexDirection: layout.bigBoardControls === 'left' ? 'row-reverse' : 'row',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: layout.bigBoardControls === 'left' ? 'row-reverse' : 'row' }}>
          <Button tone="secondary" onClick={() => setView('play')}>Leave Show</Button>
          {audienceButton}
          {running && simplifyButton}
        </div>
        {/* ■ Stop at the outer edge, on the playing hand's side. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexDirection: layout.bigBoardControls === 'left' ? 'row-reverse' : 'row' }}>
          {soundFrom !== 'admi' && (
            <Button tone="secondary" onClick={midiPanic} aria-label="Panic: stop every note Ableton is holding">
              Panic
            </Button>
          )}
          <Button tone="secondary" aria-pressed={muted} disabled={!running} onClick={toggleMuted}>
            {muted ? 'Muted' : 'Mute'}
          </Button>
          {running && <Button ref={showStopRef} tone="danger" onClick={requestStop}>{stopArmed ? '■ Press again to stop' : '■ Stop'}</Button>}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      className="bs-root board-sequencer-screen"
      data-bs-style="calm"
      data-bs-mode={config.themeMode}
      // Stacked (narrow, or Large controls): the board, then the panel, down a page that
      // scrolls. Squeezed into one screen they overlapped and the board shrank to dots.
      style={{
        display: 'flex', flexDirection: 'column', padding: 16, boxSizing: 'border-box', gap: 12,
        ...(layout.mode === 'stacked'
          ? { minHeight: '100vh', paddingBottom: 'calc(var(--bs-target) + 40px)', scrollPaddingBottom: 'calc(var(--bs-target) + 40px)' }
          : { height: '100vh' }),
      }}
    >
      {/* The chooser sits OVER the screen so the camera element below it stays mounted
          and the camera actually starts. */}
      {chooserOpen && (
        <div
          ref={chooserRef}
          style={{
            position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto',
            background: 'var(--bs-bg)',
          }}
        >
        <PlayerChooser
          players={players}
          onPick={(id) => {
            setActiveBoardPlayer(id);
            const loaded = loadBoardSequencerConfig();
            if (loaded) setConfig(loaded);
            setActivePlayerState(getActiveBoardPlayer());
            // Their loops, not the last player's: the bank keeps the pad latches across a
            // re-seed so a cleared slot stays cleared, and carrying those into another
            // profile started their loops with nothing on the board.
            loopBankRef.current = emptyLoopBank(0);
            storedRef.current = loadBoardSequencerConfig();
            setChooserOpen(false);
            // ↶ offers this player's sounds before, never the last player's (A16).
            forgetSoundsBefore();
            // Their board, not the last player's: checked afresh, and set-up if theirs
            // isn't ready (stopped only — playing, nothing moves).
            boardCheckAbortRef.current?.abort();
            setBoardCheck(null);
            boardCheckedRef.current = false;
            const next = viewAfterPick(loaded, runningRef.current, view === 'setup' ? 'setup' : 'play');
            if (view !== 'bigBoard' && next !== view) {
              setView(next);
              if (next === 'setup') setStep(resolveEntry({ enabled: loaded?.enabled ?? false, channels: loaded?.channels ?? [] }, loaded !== null));
            }
          }}
          onCreate={(name, handedness) => {
            createBoardPlayer(name, handedness);
            const loaded = loadBoardSequencerConfig();
            setConfig((prev) => configForNewPlayer(loaded, prev, handedness));
            setPlayers(listBoardPlayers());
            setActivePlayerState(getActiveBoardPlayer());
            loopBankRef.current = emptyLoopBank(0);
            storedRef.current = loadBoardSequencerConfig();
            setChooserOpen(false);
            setView('setup');
            // A new player needs their own jobs for the rig's colours — but only once
            // there is a board to put them on. Otherwise start them at the beginning.
            const view = { enabled: loaded?.enabled ?? false, channels: loaded?.channels ?? [] };
            setStep(canOpenStep('colours', view, camera, loaded !== null)
              ? 'colours'
              : resolveEntry(view, loaded !== null));
          }}
          onEdit={(id, name, handedness) => {
            updateBoardPlayer(id, { name, handedness });
            setPlayers(listBoardPlayers());
            // The player on the screen now: their controls move to the other side at once.
            if (activePlayer?.id === id) {
              const loaded = loadBoardSequencerConfig();
              if (loaded) setConfig(loaded);
              setActivePlayerState(getActiveBoardPlayer());
            }
            announce(`${name.trim() || 'Player'} saved.`);
          }}
          onCancel={players.length > 0 ? () => setChooserOpen(false) : undefined}
        />
        </div>
      )}
        <BoardHeader
          title={view === 'setup' ? 'Board Sequencer · Set up' : 'Board Sequencer'}
          onExit={() => confirmThen('exit', () => { stop(); setCurrentScreen('welcome'); })}
          exitArmed={armed === 'exit'}
          mode={config.themeMode}
          onModeChange={(m) => update({ themeMode: m })}
          largeUi={uiSize === 'large'}
          onLargeUiChange={(large) => setUISize(large ? 'large' : 'standard')}
          onHelp={() => setShowHelp(true)}
          playerName={activePlayer?.name ?? null}
          onSwitchPlayer={() => setChooserOpen(true)}
          switchPlayerDisabledReason={running ? 'Stop playing to switch player.' : null}
          notice={headerNotice}
          onChangeCamera={cameraHeaderNotice ? () => { stop(); setView('setup'); setStep('camera'); } : undefined}
          right={view === 'setup' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {boardSourceButton}
            <StepIndicator
              steps={setupSteps(laptop).map((id) => ({
                id,
                label: STEP_LABELS[id],
                state: stepIndicator(id, step, setupCfg, cameraGate, storedRef.current !== null),
              }))}
              canOpen={(id: SetupStep) => canOpenStep(id, setupCfg, cameraGate, storedRef.current !== null)}
              onOpen={(id: SetupStep) => setStep(id)}
            />
            </div>
          ) : (
            // Labels never break mid-label ("Set / up" on three lines), and the controls
            // wrap as whole buttons; the status word keeps one width. Otherwise pressing Play
            // re-wrapped the header and moved everything under it, Stop included.
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--bs-fg2)', fontSize: 14, minWidth: '4.5em' }}>
                {running ? 'Playing' : 'Stopped'}
              </span>
              <div role="group" aria-label="What you are doing" style={{ display: 'flex' }}>
                <Button tone={workspace === 'play' ? 'selected' : 'secondary'} aria-pressed={workspace === 'play'} onClick={() => setWorkspace('play')}>
                  Board
                </Button>
                <Button tone={workspace === 'piece' ? 'selected' : 'secondary'} aria-pressed={workspace === 'piece'} onClick={() => setWorkspace('piece')}>
                  Make a piece
                </Button>
              </div>
              <Button ref={bigBoardButtonRef} tone="secondary" onClick={() => setView('bigBoard')} aria-label="Show: the board, the clock and Now / Next, full screen, for the performance">
                Show
              </Button>
              {/* The less-used ones: in a More menu below about 1400 px, so the header stays
                  one row and never wraps (A3). */}
              {/* Under More at every width (owner, U4): at 1400 px the header wrapped onto two rows. */}
              <HeaderMore folded keepOpen={armed === 'setup' || closeAudienceArmed}>
                {view !== 'bigBoard' && audienceButton}
                <Button
                  tone="quiet"
                  onClick={() => confirmThen('setup', () => { if (running) stop(); setView('setup'); if (laptop) setStep('colours'); })}
                >
                  {armed === 'setup' ? '⚙ Press again to stop and set up' : '⚙ Set up'}
                </Button>
                {boardSourceButton}
                {/* The sentences under the choices, on or off for this laptop (U7). */}
                <ExplainSwitch />
              </HeaderMore>
            </div>
          )}
        />

        {editSlot !== null && (
          <Modal label={`Edit the notes of ${loopLabel(config.loopNames, editSlot)}`} onClose={() => { setEditSlot(null); setCopyArmed(false); }}>
            {/* The board and the loop side by side, each named: a loop saved earlier, shown
                alone, looked like the board showing counters that weren't there. */}
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{`Loop ${editSlot + 1}${config.loopNames[editSlot] ? `: ${config.loopNames[editSlot]}` : ''}`}</h2>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {(() => {
              const sequenced = new Set(config.channels.filter((c) => isSequencedRole(c.role)).map((c) => c.id));
              const boardNow = boardCellsNow().filter((c) => sequenced.has(c.colour));
              const loopHasNotes = (config.loopSlots[editSlot]?.length ?? 0) > 0;
              return (
                <section aria-labelledby="edit-board-now" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 240 }}>
                  <h3 id="edit-board-now" style={{ margin: 0, fontSize: 14 }}>{`The board now · ${boardNow.length} ${boardNow.length === 1 ? 'counter' : 'counters'}`}</h3>
                  <LoopThumb cells={boardNow} rows={config.rows} cols={config.cols} swatchFor={swatchFor} width={220} />
                  <Button
                    tone="secondary"
                    reason={boardNow.length === 0 ? 'The board is empty.' : null}
                    onClick={() => {
                      if (loopHasNotes && !copyArmed) { setCopyArmed(true); return; }
                      setCopyArmed(false);
                      saveBoardToSlot(editSlot);
                    }}
                    onBlur={() => setCopyArmed(false)}
                  >
                    {copyArmed ? 'Press again: the loop\'s notes are replaced' : 'Copy the board into this loop →'}
                  </Button>
                </section>
              );
            })()}
            <section aria-labelledby="edit-loop-saved" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h3 id="edit-loop-saved" style={{ margin: 0, fontSize: 14 }}>{`Loop ${editSlot + 1} as saved`}</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)', maxWidth: 380 }}>
              {(config.loopSlots[editSlot]?.length ?? 0) > 0
                ? 'Click squares to change the loop; it saves as you click. The board is not changed.'
                : 'This loop is empty. Click squares to draw one, or copy the board into it.'}
            </p>
            <LoopEditor
              rows={config.rows}
              cols={config.cols}
              channels={config.channels.filter((c) => isSequencedRole(c.role))}
              cells={config.loopSlots[editSlot] ?? []}
              palette={palette}
              onChange={(cells) => {
                const slot = editSlot;
                setConfig((prev) => {
                  const loopSlots = prev.loopSlots.slice();
                  while (loopSlots.length <= slot) loopSlots.push(null);
                  loopSlots[slot] = cells.length > 0 ? cells : null;
                  return { ...prev, loopSlots };
                });
                if (slot < loopBankRef.current.saved.length) {
                  loopBankRef.current = { ...loopBankRef.current, saved: loopBankRef.current.saved.map((s, i) => (i === slot ? (cells.length > 0 ? cells.map((c) => ({ ...c })) : null) : s)) };
                }
              }}
            />
            </section>
            </div>
            <div style={{ marginTop: 10 }}><Button tone="primary" onClick={() => { setEditSlot(null); setCopyArmed(false); }}>Done</Button></div>
          </Modal>
        )}
        {clearSlotTarget !== null && (() => {
          // Clearing a loop the piece uses asks first, naming the scenes it comes out of.
          const slot = clearSlotTarget;
          const label = loopLabel(config.loopNames, slot);
          const using = config.scenes.filter((sc) => sc.loops.includes(slot)).map((sc) => sc.name);
          return (
            <ConfirmDialog
              title={`Clear ${label}?`}
              body={`${using.length > 0
                ? `${label} is used in ${listNames(using)}. Clear it and take it out of ${using.length === 1 ? 'that scene' : 'those scenes'}?`
                : `${label} is deleted for this player.`} You can undo it for a few seconds afterwards.`}
              confirmLabel="Clear it"
              onConfirm={() => { setClearSlotTarget(null); clearLoopEverywhere(slot); focusUndoRef.current = true; }}
              onCancel={() => setClearSlotTarget(null)}
            />
          );
        })()}

        {/* The file picker behind "Restore from a file" (Perform). */}
        <input
          ref={restoreInputRef} type="file" accept=".json,application/json" hidden aria-label="Backup file to restore"
          onChange={(e) => { void pickRestoreFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        {planConfirm && (
          <ConfirmDialog
            title="Make my plan?"
            body={`This replaces the ${config.scenes.length} ${config.scenes.length === 1 ? 'scene' : 'scenes'} you have with four: Arrival, Build, Open and Home, placed across ${formatClock(config.performance.lengthSec)} and using your saved loops. Your loops are not changed.`}
            confirmLabel="Make the plan"
            onConfirm={makePlan}
            onCancel={() => setPlanConfirm(false)}
          />
        )}
        {restoreTarget && (() => {
          const sum = summariseBackup(restoreTarget);
          const when = restoreTarget.savedAt > 0 ? ` from ${new Date(restoreTarget.savedAt).toLocaleString()}` : '';
          return (
            <ConfirmDialog
              title="Restore this backup?"
              body={`The backup${when} has ${sum.players} ${sum.players === 1 ? 'player' : 'players'}, ${sum.loops} saved loops and ${sum.scenes} scenes. It replaces every player, loop and scene here, and the board setup. What is here now is kept in the laptop's backups folder (.admi-data/backups). The page reloads.`}
              confirmLabel="Restore"
              onConfirm={() => { const b = restoreTarget; setRestoreTarget(null); void confirmRestore(b); }}
              onCancel={() => setRestoreTarget(null)}
            />
          );
        })()}

        {showHelp && (
          <HelpDialog onClose={() => setShowHelp(false)} />
        )}

        <div
          style={{
            display: 'flex',
            gap: 16,
            flex: layout.mode === 'stacked' ? 'none' : 1,
            minHeight: 0,
            flexDirection: layout.mode === 'stacked'
              ? 'column'
              : config.handedness === 'left' ? 'row-reverse' : 'row',
          }}
        >
          {stage}
          {/* The panel keeps its place in the DOM for both hands; only the row flips. */}
          {/* One width for Board, Make a piece and Set up: 400 to 480 px, the board takes the
              rest, and it keeps its place and size between Board and Make a piece (A3). */}
          {/* A card (U8): the panel is the controls, on a surface of its own, the board on the page. */}
          <div className="bs-panel" style={{ width: layout.mode === 'stacked' ? '100%' : SIDE_PANEL_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: layout.mode === 'stacked' ? 'visible' : 'auto' }}>
            {view === 'setup' ? setupPanel : (
              <PlayPanel
                running={running}
                muted={muted}
                onStart={() => { if (!startRefused()) void start(); }}
                onStop={requestStop}
                stopArmed={stopArmed}
                onToggleMute={toggleMuted}
                simplify={simplifyButton}
                bpm={liveBpm}
                bpmTo={glideTo}
                step={playheadCol}
                cols={config.cols}
                variationLap={config.variationEnabled && config.numPages <= 1 ? isVarLap : null}
                beatOn={beatOn}
                heldCount={heldCells.size}
                handGuardWaiting={config.handGuardEnabled && running && latestFrame?.handGuardReady === false}
                clock={clock}
                piece={workspace === 'piece' ? pieceTab : null}
                connections={connectionsTab}
                cap={capTab}
                groove={grooveTab}
                sound={soundTab}
                loops={loopsTab}
                stacked={layout.mode === 'stacked'}
                notices={noticesInPanel ? noticeViews : null}
                transportAlign={layout.transportAlign}
                tab={playTab}
                onTab={setPlayTab}
              />
            )}
          </div>
        </div>
      {bigBoardOverlay}
    </div>
  );
}