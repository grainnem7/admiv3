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

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager, type CameraTrackInfo } from '../../tracking/CameraManager';
import { nextColourlessState } from '../../tracking/cameraCheck';
import { describeLighting, nextLightingProblem, type LightingProblem } from '../../tracking/lightingCheck';
import {
  useBoardRuntime, NOOP_RUNTIME_CALLBACKS, type BoardRuntimeCallbacks, type RuntimeFrame,
} from './boardSequencer/useBoardRuntime';
import { homographyForCorners } from './boardSequencer/homographyForCorners';
import { applyGridChange } from '../../tracking/boardGrid';
import { suggestRole } from './boardSequencer/roles';
import { controlOwners, disabledReason, legendValue } from './boardSequencer/controlOwnership';
import './boardSequencer/theme/boardTheme.css';
import { BOARD_TOKENS } from './boardSequencer/theme/boardTokens';
import { BoardHeader, type CameraNotice as HeaderNotice } from './boardSequencer/BoardHeader';
import { CameraSurface } from './boardSequencer/CameraSurface';
import { PlayerChooser } from './boardSequencer/PlayerChooser';
import { StepIndicator } from './boardSequencer/ui/StepIndicator';
import { SetupFlow, STEP_LABELS, SETUP_HEADINGS, SETUP_HINTS } from './boardSequencer/setup/SetupFlow';
import { CameraStep } from './boardSequencer/setup/CameraStep';
import { BoardStep } from './boardSequencer/setup/BoardStep';
import { ColoursStep } from './boardSequencer/setup/ColoursStep';
import { ReadyStep } from './boardSequencer/setup/ReadyStep';
import { BoardCornerEditor } from './boardSequencer/components/BoardCornerEditor';
import { BoardView, cellMap } from './boardSequencer/components/BoardView';
import { describeBoard, popsAt, pruneFired, type Pop } from './boardSequencer/components/boardViewModel';
import { PlayPanel } from './boardSequencer/play/PlayPanel';
import { NudgeBanner } from './boardSequencer/play/NudgeBanner';
import { SwatchChip } from './boardSequencer/ui/SwatchChip';
import { Switch } from './boardSequencer/ui/Switch';
import { SegmentedControl } from './boardSequencer/ui/SegmentedControl';
import { clampZone, describeZone, NO_ZONE, zoneSlotCount, zonesCollide, type Zone, type ZoneMode } from '../../tracking/zones';
import { LabeledSlider } from './boardSequencer/ui/LabeledSlider';
import { Button } from './boardSequencer/ui/Button';
import { Modal } from './boardSequencer/ui/Modal';
import { ConfirmDialog } from './boardSequencer/ui/ConfirmDialog';
import { colourMatchesBoardRaw, type NudgeSignal } from './boardSequencer/playNudge';
import { spaceTogglesPlay, type BoardScreenView } from './boardSequencer/spaceKey';
import { ghostsForSave } from '../../tracking/handGuard/knockGuard';
import { TRACK_SAVE_MS } from '../../tracking/handGuard/boardTrack';
import { detectBoard, type BoardDetection } from '../../tracking/boardDetect/detectBoard';
import { consensus, AGREE_COUNT } from '../../tracking/boardDetect/consensus';
import { runFrameBurst } from './boardSequencer/useFrameBurst';
import { buildSquareModel, modelHsv, warpToBoard } from '../../tracking/boardColourDetect/squareModel';
import { fitSafeBand } from '../../tracking/boardColourDetect/detectColours';
import { detectColours, type DetectedColour } from '../../tracking/boardColourDetect/detectColours';
import type { FiredNote } from '../../songs/BoardSequencerEngine';
import {
  SETUP_STEPS, canOpenStep, canPlay, resolveEntry, stepIndicator,
  type CameraStatus, type SetupStep,
} from './boardSequencer/boardSetupFlow';
import {
  listBoardPlayers, getActiveBoardPlayer, createBoardPlayer, setActiveBoardPlayer,
  type BoardPlayerProfile,
} from '../../profiles/BoardProfiles';
import { layoutFor } from './boardSequencer/layout';
import { isConvexQuad, squareCentreToImage } from './boardSequencer/cornerEditor';
import { rotateCorners } from '../../tracking/boardDetect/orientation';
import type { BoardSquares } from '../../tracking/boardGrid';
import type { ControlsResult } from '../../tracking/controlCounters';
import type { FaderRole, ControlRemoval } from '../../profiles/BoardSequencerConfig';

/**
 * How close two swatches must be to be the same counter colour. Comfortably inside the
 * distance between, say, red and orange counters, so re-running Find colours updates a
 * colour rather than duplicating it.
 */
const MATCH_SWATCH_DISTANCE = 90;

/** Straight-line distance between two hex swatches in RGB. */
function swatchDistance(a: string, b: string): number {
  const rgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  };
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** Reserved space under a control, so a disabled reason never shifts the layout. */
const REASON_STYLE = { display: 'block', minHeight: 14, fontSize: 11, opacity: 0.7 } as const;

const REMOVAL_LABELS: { value: ControlRemoval; label: string }[] = [
  { value: 'hold', label: 'Hold the last value' },
  { value: 'zero', label: 'Drop to the lowest value' },
  { value: 'default', label: 'Return to the saved value' },
];
import { BoardSequencerMode, type PieceColour, type ActiveCell } from '../../tracking/BoardSequencerMode';
import { counterColourFromRegion } from '../../tracking/ColorTracker';
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
  DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored, type BoardPoint, type StoredLoopCell,
} from '../../profiles/BoardSequencerConfig';
import {
  loadActiveBoardConfig as loadBoardSequencerConfig, saveActiveBoardConfig as saveBoardSequencerConfig,
  allReferencedChannelIds,
} from '../../profiles/BoardProfiles';
import LoopBankView from '../components/board/LoopBankView';
import BoardHelp from '../components/board/BoardHelp';

// Sound options — real sample sets (mapped straight to SAMPLE_CONFIGS) plus the
// sustained pad. These are the better-quality instruments available to us.
const INSTRUMENT_OPTIONS: { key: string; name: string }[] = [
  { key: 'piano', name: 'Piano' },
  { key: 'electricPiano', name: 'Electric piano' },
  { key: 'harp', name: 'Harp' },
  { key: 'organ', name: 'Organ' },
  { key: 'clarinet', name: 'Clarinet' },
  { key: 'frenchHorn', name: 'French horn' },
  { key: 'cello', name: 'Cello' },
  { key: 'guitarNylon', name: 'Nylon guitar' },
  { key: 'bassElectric', name: 'Electric bass' },
  { key: 'pad', name: 'Pad (sustained)' },
  { key: 'chord', name: 'Chord stab' },
];

// Per-row drum choices (kit pieces the RoundRobinDrumKit can play). '' keeps the
// default bottom→top mapping (kick, snare, hat, crash) for that row.
const DRUM_OPTIONS: { key: string; name: string }[] = [
  { key: 'kick', name: 'Kick' },
  { key: 'snare', name: 'Snare' },
  { key: 'hat', name: 'Hi-hat' },
  { key: 'crash', name: 'Crash' },
  { key: 'kickCrash', name: 'Kick + crash' },
  { key: 'tom', name: 'Tom' },
  { key: 'clap', name: 'Clap' },
  { key: 'rim', name: 'Rim' },
];

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
  h: number;
  s: number;
  v: number;
  kind: ColourKind;
  /** True when the band can't be narrowed enough to stop matching the board itself. */
  unsafe?: boolean;
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
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const startSecRef = useRef(0);

  const storedRef = useRef<BoardSequencerStored | null>(loadBoardSequencerConfig());
  const [config, setConfig] = useState<BoardSequencerStored>(
    () => storedRef.current ?? DEFAULT_BOARD_SEQUENCER_CONFIG,
  );
  // Corners the board tracker has moved since the last save. They must survive a render,
  // so they are merged into the ref the runtime reads rather than living in React state
  // (which is only written every few seconds).
  const trackedCornersRef = useRef<BoardSequencerStored['corners'] | null>(null);
  const configRef = useRef(config);
  configRef.current = trackedCornersRef.current
    ? { ...config, corners: trackedCornersRef.current }
    : config;

  // One place writes the config to storage. Doing it inside the state updaters made them
  // impure — React may run an updater twice, or discard its result, and the write would
  // happen anyway.
  const savedConfigRef = useRef(config);
  useEffect(() => {
    if (savedConfigRef.current === config) return;
    savedConfigRef.current = config;
    saveBoardSequencerConfig(config);
  }, [config]);

  // True while the chosen camera couldn't be found and the default is standing in.
  const fellBackRef = useRef(false);
  // Bumped by "Try again" to reopen the saved camera without changing the choice
  // (it's already selected, so the dropdown can't re-pick it).
  const [cameraRetry, setCameraRetry] = useState(0);

  // Not-yet-calibrated is a first-class state. It comes from the config itself
  // (`enabled` is only true once corners have been clicked and saved), so a
  // setting saved before calibrating can't make the board look ready.
  const calibrated = config.enabled;
  // How the corner editor was opened: 'tap' starts from nothing, 'review' checks corners
  // that already exist. "Tap corners myself" must mean tapping, even for a board that is
  // already set up.
  const [calibrating, setCalibrating] = useState<'tap' | 'review' | null>(null);

  // The runtime owns the camera, the per-camera-frame detection loop and the rAF draw
  // loop; this screen supplies the callbacks below and drives start/stop through its refs.
  const callbacksRef = useRef<BoardRuntimeCallbacks>(NOOP_RUNTIME_CALLBACKS);
  const {
    videoRef, cameraRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef, activeCellsRef,
    dismiss, letGoGhosts, knockRef, latestFrameRef,
  } = useBoardRuntime({ cameraDeviceId: config.cameraDeviceId, cameraRetry, calibrated, configRef, callbacksRef });
  // Colour calibration armed for the next camera click: add a new channel, or
  // recalibrate an existing one (null = not calibrating).
  const [colourCalib, setColourCalib] = useState<ColourCalibTarget | null>(null);
  const colourCalibRef = useRef<ColourCalibTarget | null>(null);
  colourCalibRef.current = colourCalib;
  const [active, setActive] = useState<ActiveCell[]>([]);
  // Live control-counter values, for the legend (‖ = the counter is away, value held).
  const [controlState, setControlState] = useState<ControlsResult | null>(null);

  // Guided Set up vs Play. The entry step is resolved once, from the config alone:
  // routing never moves the player on its own.
  const [view, setView] = useState<BoardScreenView>('setup');
  const [step, setStep] = useState<SetupStep>(() => resolveEntry(
    { enabled: storedRef.current?.enabled ?? false, channels: storedRef.current?.channels ?? [] },
    storedRef.current !== null,
  ));
  const [players, setPlayers] = useState<BoardPlayerProfile[]>(() => listBoardPlayers());
  const [activePlayer, setActivePlayerState] = useState<BoardPlayerProfile | null>(() => getActiveBoardPlayer());
  // Ask who's playing only when there is a real choice to make.
  const [chooserOpen, setChooserOpen] = useState(() => listBoardPlayers().length > 1);
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
  const [pops, setPops] = useState<Pop[]>([]);
  const [latestFrame, setLatestFrame] = useState<RuntimeFrame | null>(null);
  const [liveBpm, setLiveBpm] = useState(0);
  const [beatOn, setBeatOn] = useState(false);
  const [isVarLap, setIsVarLap] = useState(false);
  const [pingDir, setPingDir] = useState(0);
  const [nudge, setNudge] = useState<NudgeSignal | null>(null);
  const firedRef = useRef<FiredNote[]>([]);
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
  const [camInfo, setCamInfo] = useState<CameraTrackInfo | null>(null);
  const [camNotice, setCamNotice] = useState<CameraNotice | null>(null);
  const [feedSaturation, setFeedSaturation] = useState<number | null>(null);
  // Latched (hysteresis) so the black-and-white warning can't flicker/re-announce.
  const [feedColourless, setFeedColourless] = useState(false);
  const [lastSample, setLastSample] = useState<LastColourSample | null>(null);

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
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      return next;
    });
  }, []);

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
      return { ...grid, controlZone, loopZone: zonesCollide(controlZone, loopZone) ? NO_ZONE : loopZone };
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
      const W = video.clientWidth;
      const H = video.clientHeight;
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

  // Big board follows the browser: leaving fullscreen by any route comes back to Play.
  useEffect(() => {
    if (view !== 'bigBoard') return;
    const root = bigBoardRef.current;
    root?.focus();
    void root?.requestFullscreen?.().catch(() => {
      // Refused (or unsupported): the view still fills the window, which is the point.
    });
    const onChange = (): void => {
      if (document.fullscreenElement === null) setView('play');
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement !== null) void document.exitFullscreen?.().catch(() => {});
      bigBoardButtonRef.current?.focus();
    };
  }, [view]);

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
      const found = detectColours(warped, model.model);
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
    setConfig((prev) => {
      const referenced = allReferencedChannelIds();
      const channels = prev.channels.map((c) => ({ ...c }));
      const taken = new Set<number>();
      for (const c of found) {
        // Match on colour: the nearest existing swatch, if it is near enough to be the
        // same counter rather than a different one.
        let best = -1;
        let bestDistance = MATCH_SWATCH_DISTANCE;
        channels.forEach((existing, i) => {
          if (taken.has(i)) return;
          const d = swatchDistance(existing.swatch, c.swatch);
          if (d < bestDistance) { bestDistance = d; best = i; }
        });
        const band = { band: c.band.band, blackBand: c.band.blackBand, whiteBand: c.band.whiteBand };
        if (best >= 0) {
          taken.add(best);
          channels[best] = {
            ...channels[best], kind: c.kind, swatch: c.swatch, ...band,
            // An unsafe colour is switched off, but a job the player chose is not thrown
            // away for one that was already doing something.
            role: c.unsafe ? 'off' : channels[best].role,
          };
          continue;
        }
        const id = freshChannelId(channels.map((ch) => ch.id), referenced);
        channels.push({
          id,
          kind: c.kind,
          // A colour that matches the board starts switched off rather than filling the
          // pattern with notes nobody played.
          role: c.unsafe ? 'off' : suggestRole(channels, { kind: c.kind }),
          swatch: c.swatch,
          ...band,
        });
      }
      return { ...prev, channels };
    });
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
      if (engine) {
        const audible = engine.audibleNow();
        firedRef.current = pruneFired([...firedRef.current, ...engine.drainFiredNotes()], audible);
        setPops(popsAt(firedRef.current, audible));
      } else if (firedRef.current.length > 0) {
        firedRef.current = [];
        setPops([]);
      }
      setNudge(signal);
    },
    onThrottledState: (rf: RuntimeFrame) => {
      const { frame, controls } = rf;
      const cfg = configRef.current;
      const engine = engineRef.current;
      setLatestFrame(rf);
      setControlState(controls);
      // Settled pattern cells only exist while playing, so in Set up (and when stopped)
      // this falls back to what the camera can see. Otherwise "On the board now" and
      // Describe board told the player the board was empty with counters all over it.
      setActive(runningRef.current ? frame.patternCells : cellsFromOccupied(frame.occupied));
      setPlayheadCol(runningRef.current && engine ? engine.getPlayheadCol(cfg.cols) : 0);
      if (cfg.numPages > 1 && engine) setPlayingPage(engine.getCurrentPage());
      setStats({ byColour: frame.byColour, settled: frame.activeMap.size });
      if (engine) {
        setLiveBpm(engine.getBpm());
        setIsVarLap(cfg.numPages <= 1 ? engine.isVariationLap() : false);
        setPingDir(cfg.pingPong ? engine.getPlayheadDirection() : 0);
        // A beat dot that flips with the beat: every audio event has a visual cue.
        setBeatOn(Math.abs(engine.getVisualBeat()) % 2 === 0);
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

  const handleCalibrated = useCallback(
    (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint], patch: Partial<BoardSequencerStored> = {}) => {
      // Dragging a handle across the board makes a bow-tie, which still solves — every
      // cell maps to the same pixel or to NaN — so the board reads nothing for ever,
      // silently, including after a reload. Only the four-tap path used to check.
      if (!isConvexQuad(corners)) {
        announce('Those corners cross over each other. Drag them back so the outline is a proper four-sided shape.');
        return;
      }
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
        if (video) homographyRef.current = homographyForCorners(corners, video.videoWidth, video.videoHeight);
      } catch {
        homographyRef.current = null;
      }
      setCalibrating(null);
    },
    [homographyRef, videoRef, announce],
  );

  const stop = useCallback(() => {
    startingRef.current = null;
    runningRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    modeRef.current = null;
    songEngineRef.current?.stopPlayback();
    setRunning(false);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      engineRef.current?.setMuted(next);
      const se = songEngineRef.current;
      if (se && songStatusRef.current === 'loaded') {
        if (next) se.pause();
        else se.resume();
      }
      return next;
    });
  }, []);

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

  const startEngine = useCallback(async (generation: number) => {
    await Tone.start();
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    const cfg = configRef.current;
    const video = videoRef.current;
    if (video && !homographyRef.current) {
      homographyRef.current = homographyForCorners(cfg.corners, video.videoWidth, video.videoHeight);
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
    const engine = new BoardSequencerEngine({
      bpm: cfg.bpm, rows: cfg.rows, cols: cfg.cols,
      scaleRootMidi: cfg.scaleRootMidi, scaleSemitones: cfg.scaleSemitones, swing: cfg.swing,
      humanize: cfg.humanize,
      noteLengthBeats: cfg.noteLengthBeats, velocity: cfg.velocity,
      tickEnabled: cfg.tickEnabled,
      channels: cfg.channels, faderAxis: cfg.faderAxis, variationEnabled: cfg.variationEnabled,
      loopStepsRed: cfg.loopStepsRed, loopStepsBlack: cfg.loopStepsBlack,
      loopStepsBlue: cfg.loopStepsBlue, numPages: cfg.numPages,
      octaveShift: cfg.octaveShift, volume: cfg.volume,
      pingPong: cfg.pingPong,
      toggleAmount: cfg.toggleAmount, controlGlideSec: cfg.controlGlideSec,
    });
    await engine.init();
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
    engine.start();
    engineRef.current = engine;
    // One pad per cell of the loop lane — a row of steps or a column of rows.
    loopBankRef.current = seedLoopBank(
      zoneSlotCount(cfg.loopZone, cfg.rows, cfg.cols), cfg.loopSlots, loopBankRef.current,
    );
    engine.setActiveLoops([]);
    // Stop may have been pressed while the samples were loading; the engine that is no
    // longer wanted is disposed rather than left playing with nothing able to stop it.
    if (startingRef.current !== generation) {
      engine.dispose();
      engineRef.current = null;
      return;
    }
    startSecRef.current = Tone.now();
    runningRef.current = true;
    setRunning(true);
  }, [engineRef, homographyRef, loopBankRef, modeRef, runningRef, startingRef, videoRef]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = performance.now();
    const generation = startingRef.current;
    setSoundError(null);
    try {
      await startEngine(generation);
    } catch (err) {
      // Without this the button simply did nothing: no sound, no error, no reason — and
      // the player presses it again and again.
      const text = err instanceof Error ? err.message : 'The sound could not be started.';
      setSoundError(text);
      announce(`Could not start. ${text}`);
      stop();
    } finally {
      if (startingRef.current === generation) startingRef.current = null;
    }
  }, [startEngine, startingRef, stop, announce]);

  // Space starts and stops the board in Play and Big board. The global handler in
  // App.tsx stands down on this screen, so this is the only one listening.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || e.repeat) return;
      if (!spaceTogglesPlay(view, e.target)) return;
      e.preventDefault();
      if (runningRef.current) stop();
      else void start();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, start, stop, runningRef]);

  // Changing orientation or camera invalidates calibration (it was captured in the
  // old view), so force a fresh corner click in the new space.
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
  const sampleAvgHsvAt = useCallback((nx: number, ny: number): { h: number; s: number; v: number; hex: string } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) return null;
    const cfg = configRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.save();
    ctx.translate(cfg.mirrorX ? w : 0, cfg.mirrorY ? h : 0);
    ctx.scale(cfg.mirrorX ? -1 : 1, cfg.mirrorY ? -1 : 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
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
    return { h: c.h, s: c.s, v: c.v, hex: rgbToHex(c.r, c.g, c.b) };
  }, []);

  // A camera click while calibrating: sample the piece's colour, then either add
  // a new channel or update the one being recalibrated. The kind (hue/black/
  // white) is inferred from the sample, and the swatch shows the real colour.
  /**
   * The board's own colours, from a fresh frame, for keeping a counter's band off them.
   *
   * "Find colours" has always done this; tapping a counter never did, so a red counter on
   * a warm wooden board handed back a band wide enough to light the bare dark squares —
   * the player taps one counter and the board fills with phantom notes. Null when the
   * board can't be modelled (too covered, no corners yet), in which case the band is
   * simply left as sampled, exactly as before.
   */
  const boardColoursNow = useCallback((): { h: number; s: number; v: number }[] | null => {
    const cfg = configRef.current;
    const video = videoRef.current;
    if (!cfg.enabled || !video || video.videoWidth <= 0) return null;
    try {
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth;
      cv.height = video.videoHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.save();
      ctx.translate(cfg.mirrorX ? cv.width : 0, cfg.mirrorY ? cv.height : 0);
      ctx.scale(cfg.mirrorX ? -1 : 1, cfg.mirrorY ? -1 : 1);
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      ctx.restore();
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      const h = homographyForCorners(cfg.corners, cv.width, cv.height);
      const warped = warpToBoard(data, cv.width, cv.height, h, cfg.boardSquares);
      const model = buildSquareModel(warped);
      return model.ok ? modelHsv(model.model) : null;
    } catch {
      return null;
    }
  }, [configRef, videoRef]);

  const sampleColourClick = useCallback((nx: number, ny: number) => {
    if (!colourCalibRef.current) return;
    const s = sampleAvgHsvAt(nx, ny);
    if (!s) return;
    // Same treatment the automatic search gets: tighten the band until it stops matching
    // the board, and say so if it can't be separated from it.
    const board = boardColoursNow();
    const fitted = board ? fitSafeBand({ h: s.h, s: s.s, v: s.v }, board) : null;
    const cal = fitted?.band ?? calibrationFromHsv({ h: s.h, s: s.s, v: s.v });
    // Nothing is saved on a tap: the sample is shown first, so a mis-tap on the wood
    // doesn't quietly become a colour.
    const sample = {
      hex: s.hex, h: s.h, s: s.s, v: s.v, kind: cal.kind,
      unsafe: fitted?.unsafe === true,
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

  /** Apply the sample the player accepted, as a new colour or a recalibration. */
  const commitPendingColour = useCallback(() => {
    const target = colourCalibRef.current;
    const sample = pendingColour;
    if (!target || !sample) return;
    // Re-fit against the board at commit time too, so the band that is SAVED is the one
    // the player was shown as safe.
    const board = boardColoursNow();
    const cal = board
      ? fitSafeBand({ h: sample.h, s: sample.s, v: sample.v }, board).band
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
      const next = { ...prev, channels };
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
      const next = { ...prev, channels: prev.channels.map((c) => (c.id === id ? { ...c, role } : c)) };
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
      const next = { ...prev, channels: prev.channels.filter((c) => c.id !== id) };
      return next;
    });
  }, []);
  const clearChannels = useCallback(() => {
    setColourCalib(null);
    setPendingColour(null);
    setSquarePicker(null);
    setConfig((prev) => {
      const next = { ...prev, channels: [] };
      return next;
    });
  }, []);

  // Per-render derived: the calibrated channels, whether any drums (drives the
  // per-row drum picker), and a colour-id → channel lookup for labels/swatches.
  const channels = config.channels;
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const labelForId = (id: ColourId) => {
    const c = channelById.get(id);
    return c ? describeChannel(c) : id;
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
  const setupCfg = { enabled: config.enabled, channels: config.channels };
  const headerNotice: HeaderNotice | null = error
    ? { kind: 'error', text: error }
    : soundError
      ? { kind: 'error', text: soundError }
      : camNotice;


  const playReason = canPlay(setupCfg, camera)
    ? null
    : !config.enabled ? 'Find the board first.'
      : camera.phase === 'error' ? "The camera isn't working."
        : 'Give at least one colour a job first.';

  // One writer per parameter: a control counter disables the matching screen control.
  const owners = controlOwners(config.channels);
  const volumeReason = disabledReason('volume', owners);
  const tempoReason = disabledReason('tempo', owners, songStatus === 'loaded' && selectedSongId !== '');
  const controlChannels = config.channels.filter((c) => isFaderRole(c.role));


  // The Play tabs: the same controls as the old rail, grouped by what the player is
  // thinking about — the feel, the sounds, and the loops.
  const grooveTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <label>
                Tempo {config.bpm} BPM
                <input
                  type="range" min={50} max={300} value={config.bpm}
                  disabled={tempoReason !== null}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    update({ bpm: v });
                    engineRef.current?.setBpm(v); // live, not only on the next start
                  }}
                />
                <span style={REASON_STYLE}>{tempoReason ?? ''}</span>
              </label>
              <label>
                Swing {Math.round(config.swing * 100)}%
                <input
                  type="range" min={0} max={60} value={Math.round(config.swing * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    update({ swing: v });
                    engineRef.current?.setSwing(v);
                  }}
                />
              </label>
              <label>
                Humanize {Math.round(config.humanize * 100)}%
                <input
                  type="range" min={0} max={100} value={Math.round(config.humanize * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    update({ humanize: v });
                    engineRef.current?.setHumanize(v);
                  }}
                />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, opacity: 0.65 }}>
                  Polyrhythm — loop length per role (Off = full {config.cols} steps; shorter values drift)
                </span>
                {POLY_ROLES.map(({ role, field, label }) => (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 64 }}>{label}</span>
                    <select
                      value={config[field]}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        update({ [field]: n } as Partial<BoardSequencerStored>);
                        engineRef.current?.setLoopSteps(role, n);
                      }}
                    >
                      <option value={0}>Off</option>
                      {[2, 3, 4, 5, 6, 7, 8].filter((n) => n <= config.cols).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label>
                Rows
                <select
                  value={config.rows} disabled={running}
                  onChange={(e) => updateGrid({ rows: Number(e.target.value) })}
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>
                Steps
                <select
                  value={config.cols} disabled={running}
                  onChange={(e) => updateGrid({ cols: Number(e.target.value) })}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>
                Pages
                <select
                  value={config.numPages} disabled={running}
                  onChange={(e) => setPagesCount(Number(e.target.value))}
                >
                  {[1, 2, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {config.numPages > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, opacity: 0.65 }}>
                    Selected page (●) plays live; Capture freezes it and moves on. Loop = {config.numPages * config.cols} steps.
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Array.from({ length: config.numPages }, (_, i) => {
                      const isSel = i === selectedPage;
                      const isPlaying = running && i === playingPage;
                      const hasSnapshot = (config.pages[i]?.length ?? 0) > 0;
                      return (
                        <button
                          key={i} type="button" onClick={() => selectPage(i)}
                          style={{
                            fontSize: 12, padding: '4px 10px',
                            fontWeight: isSel ? 700 : 400,
                            border: isPlaying ? '2px solid #4caf50' : '1px solid #888',
                            opacity: hasSnapshot || isSel ? 1 : 0.5,
                          }}
                        >
                          {String.fromCharCode(65 + i)}{isSel ? ' ●' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button" style={{ fontSize: 12 }} disabled={!running}
                    onClick={capturePage}
                  >
                    Capture board → Page {String.fromCharCode(65 + selectedPage)}
                  </button>
                </div>
              )}
              <label>
                Backing song
                <select value={selectedSongId} disabled={running} onChange={(e) => void handleSelectSong(e.target.value)}>
                  <option value="">None (standalone)</option>
                  {SONG_LIBRARY.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </label>
              {selectedSongId && (
                <p style={{ fontSize: 11, opacity: 0.75, margin: 0 }}>
                  {songStatus === 'loading' && 'Loading song…'}
                  {songStatus === 'loaded' && 'Song ready — board will lock to its tempo + chords'}
                  {songStatus === 'error' && 'Song failed to load'}
                </p>
              )}
    </div>
  );

  const soundTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {config.channels.map((c, i) => {
        const melodic = c.role === 'melody' || c.role === 'chord' || c.role === 'bass';
        return (
          <div
            key={`sound-${c.id}`}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
              borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)',
              border: '1px solid var(--bs-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={22} />
              <span style={{ flex: 1 }}>{describeChannel(c)}</span>
              <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{ROLE_LABELS[c.role]}</span>
            </div>
            {melodic && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
                Instrument
                <select
                  value={c.instrument ?? ''}
                  disabled={running}
                  onChange={(e) => patchChannel(c.id, { instrument: e.target.value })}
                >
                  <option value="">{c.role === 'bass' ? 'Default (electric bass)' : 'Default (electric piano)'}</option>
                  {INSTRUMENT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                </select>
                <span style={{ minHeight: 14, fontSize: 11, color: 'var(--bs-fg2)' }}>
                  {running ? 'Stop to change the instrument' : ''}
                </span>
              </label>
            )}
            {c.role === 'drums' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
                Drum
                <select
                  value={c.drum ?? ''}
                  disabled={running}
                  onChange={(e) => patchChannel(c.id, { drum: e.target.value })}
                >
                  <option value="">Vary by row (kick → crash)</option>
                  {DRUM_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                </select>
                <span style={{ minHeight: 14, fontSize: 11, color: 'var(--bs-fg2)' }}>
                  {running ? 'Stop to change the drum' : 'Drums use the main volume.'}
                </span>
              </label>
            )}
            {isFaderRole(c.role) && (
              <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
                {`Live value: ${legendValue(c.role as FaderRole, controlState?.values[c.role as FaderRole], controlState?.held ?? new Set())}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
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
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--bs-fg2)' }}>
                  Which way a control counter is read when it isn&apos;t in a lane. A lane always
                  reads along itself.
                </p>
              </div>
            )}
            {controlChannels.map((c) => {
                const role = c.role as FaderRole;
                const range = config.controlRanges[role];
                return (
                  <div key={`ctl-${c.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
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
                          onChange={(e) => update({
                            controlRanges: { ...config.controlRanges, [role]: { ...range, min: Number(e.target.value) } },
                          })}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        Highest
                        <input
                          type="number" step={role === 'tempo' ? 5 : 0.05} value={range.max}
                          onChange={(e) => update({
                            controlRanges: { ...config.controlRanges, [role]: { ...range, max: Number(e.target.value) } },
                          })}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {channels.filter((c) => c.role === 'melody' || c.role === 'chord' || c.role === 'bass').length === 0 ? (
                <span style={{ fontSize: 11, opacity: 0.6 }}>Add a melody/chord/bass colour to mix it.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 4, fontSize: 10, opacity: 0.7 }}>
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
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Controls live</span>
        <SegmentedControl<ZoneMode>
          label="Controls live"
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
            label="Which one"
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
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Loop pads live</span>
        <SegmentedControl<ZoneMode>
          label="Loop pads live"
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
              label="Which one"
              value={config.loopZone.index}
              onChange={(index) => setLane('loopZone', { ...config.loopZone, index })}
              options={Array.from(
                { length: config.loopZone.mode === 'row' ? config.rows : config.cols },
                (_, i) => ({ value: i, label: String(i + 1) }),
              )}
            />
            <SegmentedControl<'hold' | 'toggle'>
              label="How a loop pad works"
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox" checked={config.pingPong}
                  onChange={(e) => update({ pingPong: e.target.checked })}
                />
                Ping-pong (sweep → then ←)
              </label>
              {/* The lane picker above is the only switch: a second one could disagree
                  with it, and the runtime follows the lane. */}
              {loopSlotCount > 0 && (
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox" checked={config.variationEnabled}
                  onChange={(e) => update({ variationEnabled: e.target.checked })}
                />
                Variation — shove a piece to its edge = every other pass
              </label>
              {config.variationEnabled && (
                <label>
                  Shove needed {Math.round(config.variationOffsetThreshold * 100)}%
                  <input
                    type="range" min={30} max={85}
                    value={Math.round(config.variationOffsetThreshold * 100)}
                    onChange={(e) => update({ variationOffsetThreshold: Number(e.target.value) / 100 })}
                  />
                </label>
              )}
              {config.variationEnabled && config.numPages > 1 && (
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  Variation applies to a single page only (v1) — set Pages to 1 to use it.
                </span>
              )}
    </div>
  );

  const helpContent = (
    <>
              <BoardHelp />
    </>
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

  const setupStepBody = step === 'camera' ? (
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
      onViewChange={changeView}
      onRefreshCameras={() => void refreshCameras()}
      handedness={config.handedness}
    />
  ) : step === 'board' ? (
    <BoardStep
      boardSquares={config.boardSquares}
      rows={config.rows}
      cols={config.cols}
      nudgesEnabled={config.boardNudgesEnabled}
      running={running}
      editing={calibrating !== null}
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
      }}
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
      running={running}
      onRemove={removeChannel}
      onClearAll={clearChannels}
      isReferenced={(id) => allReferencedChannelIds().has(id)}
      minFilledFraction={config.minFilledFraction}
      readSettingsCustom={config.readSettingsCustom}
      onMinFill={(v) => update({ minFilledFraction: v, readSettingsCustom: true })}
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
    />
  ) : (
    <ReadyStep
      channels={config.channels}
      counts={stats.byColour}
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
      cfg={setupCfg}
      camera={camera}
      hasStoredConfig={storedRef.current !== null}
      announce={announce}
      footerAlign={layout.footerAlign}
      heading={SETUP_HEADINGS[step]}
      hint={SETUP_HINTS[step]}
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
  const emptyLoopSlot = loopSlotCount > 0
    && loopBankRef.current.saved.slice(0, loopSlotCount).some((sl) => sl == null);

  const boardView = (
    <BoardView
      rows={config.rows}
      cols={config.cols}
      frame={boardFrame}
      pops={pops}
      playheadCol={playheadCol}
      playing={running}
      pingPongDirection={pingDir}
      swatchFor={(id) => channelById.get(id)?.swatch ?? '#e23'}
      palette={palette}
      pageLabel={config.numPages > 1 ? `Page ${String.fromCharCode(65 + playingPage)} · live` : null}
      reducedMotion={reducedMotion}
    />
  );

  const stage = (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      {view === 'play' && (
        <NudgeBanner
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
      {view === 'play' && <div style={{ flex: 1, minHeight: 200 }}>{boardView}</div>}
      <div style={view === 'play'
        ? { width: 220, alignSelf: layout.pip === 'bottom-left' ? 'flex-start' : 'flex-end' }
        : undefined}
      >
      <CameraSurface
        videoRef={videoRef}
        overlayRef={overlayRef}
        hidden={view === 'bigBoard'}
        mirrorX={config.mirrorX}
        mirrorY={config.mirrorY}
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
      {view === 'setup' && (
        <>
          {/* Camera check: which camera, what it delivers, whether the frames the
              app reads carry colour, and what the last colour click captured. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 12, opacity: 0.9 }}>
            <span>
              Camera: <strong>{camInfo ? (camInfo.label || 'Unnamed camera') : error ? 'not available' : 'starting…'}</strong>
              {camInfo && camInfo.width > 0 && ` · ${camInfo.width}×${camInfo.height}`}
              {camInfo && camInfo.frameRate > 0 && ` @ ${Math.round(camInfo.frameRate)} fps`}
            </span>
            {/* Always-mounted live regions: only their text changes, so each message is
                announced once (and the camera notice is visible even with the
                Camera & board section collapsed). */}
            <span role="status" style={{ color: '#ffb74d' }}>{camNotice?.text ?? ''}</span>
            <span role="alert" style={{ color: '#ffb74d' }}>
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
      {view === 'play' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {config.channels.map((c, i) => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={20} />
              <span>{describeChannel(c)}</span>
              <strong>
                {isFaderRole(c.role)
                  ? legendValue(c.role as FaderRole, controlState?.values[c.role as FaderRole], controlState?.held ?? new Set())
                  : `${stats.byColour[c.id] ?? 0} playing`}
              </strong>
            </span>
          ))}
          {config.controlZone.mode !== 'anywhere' && config.controlZone.mode !== 'off' && (
            <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
              {`Controls: ${describeZone(config.controlZone)}`}
            </span>
          )}
          {(config.loopZone.mode === 'row' || config.loopZone.mode === 'col') && (
            <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
              {`Loops: ${describeZone(config.loopZone)}`}
            </span>
          )}
          {/* Which way round the board reads. A player sitting at a different edge sees the
              screen turned relative to their board; this turns it back, without moving the
              camera or asking for the corners again. */}
          <Button
            tone="quiet"
            onClick={turnBoard}
            reason={running ? null : config.enabled ? null : 'Find the board first.'}
            aria-label="Turn the board a quarter turn, so the screen matches the way you are sitting"
          >
            ⟲ Turn board
          </Button>
          <Button tone="quiet" onClick={() => announce(describeBoard(active, config.channels, config.rows, config.cols, config.velocity))}>
            Describe board
          </Button>
        </div>
      )}
      {view === 'play' && (
        <p aria-live="off" style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)', minHeight: 18 }}>
          {pops.length > 0 ? `Now: ${pops.map((n) => labelForId(n.colour)).join(', ')}` : ''}
        </p>
      )}
    </div>
  );

  // Big board is an OVERLAY, not a different tree: replacing the tree would unmount the
  // one <video> and stop the camera dead in the middle of a performance.
  const bigBoardOverlay = view === 'bigBoard' ? (
    <div
      ref={bigBoardRef}
      tabIndex={-1}
            data-bs-style="calm"
      data-bs-mode={config.themeMode}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        display: 'flex', flexDirection: 'column',
        padding: 12, boxSizing: 'border-box', gap: 8, background: 'var(--bs-bg)',
      }}
      onKeyDown={(e) => {
        // Esc leaves when the browser isn't in fullscreen (there it exits fullscreen,
        // and the fullscreenchange handler brings us back).
        if (e.key === 'Escape' && document.fullscreenElement === null) setView('play');
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>{boardView}</div>
      <div
        style={{
          display: 'flex', gap: 8, alignItems: 'center',
          justifyContent: layout.bigBoardControls === 'left' ? 'flex-start' : 'flex-end',
        }}
      >
        {running
          ? <Button tone="primary" onClick={stop}>■ Stop</Button>
          : <Button tone="primary" onClick={() => void start()}>▶ Play</Button>}
        <Button tone="secondary" aria-pressed={muted} disabled={!running} onClick={toggleMuted}>
          {muted ? 'Sound off' : 'Mute'}
        </Button>
        <Button tone="secondary" onClick={() => setView('play')}>Exit big board</Button>
      </div>
    </div>
  ) : null;

  return (
    <div
      className="bs-root board-sequencer-screen"
      data-bs-style="calm"
      data-bs-mode={config.themeMode}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16, boxSizing: 'border-box', gap: 12 }}
    >
      {/* The chooser sits OVER the screen so the camera element below it stays mounted
          and the camera actually starts. */}
      {chooserOpen && (
        <div style={{
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
          }}
          onCreate={(name, handedness) => {
            createBoardPlayer(name, handedness);
            const loaded = loadBoardSequencerConfig();
            if (loaded) setConfig(loaded);
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
          onCancel={players.length > 0 ? () => setChooserOpen(false) : undefined}
        />
        </div>
      )}
        <BoardHeader
          title={view === 'setup' ? 'Board Sequencer · Set up' : 'Board Sequencer'}
          onExit={() => { stop(); setCurrentScreen('welcome'); }}
          mode={config.themeMode}
          onModeChange={(m) => update({ themeMode: m })}
          largeUi={uiSize === 'large'}
          onLargeUiChange={(large) => setUISize(large ? 'large' : 'standard')}
          onHelp={() => setShowHelp(true)}
          playerName={activePlayer?.name ?? null}
          onSwitchPlayer={() => setChooserOpen(true)}
          switchPlayerDisabledReason={running ? 'Stop playing to switch player.' : null}
          notice={headerNotice}
          onChangeCamera={() => { stop(); setView('setup'); setStep('camera'); }}
          right={view === 'setup' ? (
            <StepIndicator
              steps={SETUP_STEPS.map((id) => ({
                id,
                label: STEP_LABELS[id],
                state: stepIndicator(id, step, setupCfg, camera, storedRef.current !== null),
              }))}
              canOpen={(id: SetupStep) => canOpenStep(id, setupCfg, camera, storedRef.current !== null)}
              onOpen={(id: SetupStep) => setStep(id)}
            />
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--bs-fg2)', fontSize: 13 }}>
                {running ? 'Playing' : 'Stopped'}
              </span>
              <Button
                tone="secondary"
                onClick={() => { if (running) stop(); setView('setup'); }}
              >
                ⚙ Set up
              </Button>
              <Button ref={bigBoardButtonRef} tone="secondary" aria-label="Big board" onClick={() => setView('bigBoard')}>
                <span aria-hidden="true">⤢</span>
              </Button>
            </div>
          )}
        />

        {clearSlotTarget !== null && (
          <ConfirmDialog
            title={`Clear loop ${clearSlotTarget + 1}?`}
            body="The loop saved on this pad is deleted for this player. There is no way to get it back."
            confirmLabel="Clear it"
            onConfirm={() => { clearLoopSlotAt(clearSlotTarget); setClearSlotTarget(null); }}
            onCancel={() => setClearSlotTarget(null)}
          />
        )}

        {showHelp && (
          <Modal label="How to play" onClose={() => setShowHelp(false)}>
            {helpContent}
            <Button tone="secondary" autoFocus onClick={() => setShowHelp(false)}>Close</Button>
          </Modal>
        )}

        <div
          style={{
            display: 'flex',
            gap: 16,
            flex: 1,
            minHeight: 0,
            flexDirection: layout.mode === 'stacked'
              ? 'column'
              : config.handedness === 'left' ? 'row-reverse' : 'row',
          }}
        >
          {stage}
          {/* The panel keeps its place in the DOM for both hands; only the row flips. */}
          <div style={{ width: layout.mode === 'stacked' ? '100%' : 320, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
            {view === 'setup' ? setupPanel : (
              <PlayPanel
                running={running}
                muted={muted}
                onStart={() => void start()}
                onStop={stop}
                onToggleMute={toggleMuted}
                bpm={liveBpm}
                step={playheadCol}
                cols={config.cols}
                variationLap={config.variationEnabled && config.numPages <= 1 ? isVarLap : null}
                beatOn={beatOn}
                heldCount={heldCells.size}
                handGuardWaiting={config.handGuardEnabled && running && latestFrame?.handGuardReady === false}
                groove={grooveTab}
                sound={soundTab}
                loops={loopsTab}
                stacked={layout.mode === 'stacked'}
                transportAlign={layout.transportAlign}
              />
            )}
          </div>
        </div>
      {bigBoardOverlay}
    </div>
  );
}