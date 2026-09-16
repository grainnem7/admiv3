/**
 * Board-sequencer configuration persistence.
 *
 * Mirrors the SurfacePressConfig / BatonAssignments pattern: a dedicated
 * localStorage key, sanitised on load (a corrupt store yields null and the
 * screen falls back to "not yet calibrated"), exposed via InputProfileManager.
 * No change to UserProfile.
 */

import type { TrackedColor } from '../tracking/ColorTracker';
import type {
  ColourChannel, ColourId, ColourKind, ColourRole, BlackBand, WhiteBand,
} from '../tracking/boardColours';
import { ROLE_LABELS, DEFAULT_BLACK_BAND, DEFAULT_WHITE_BAND } from '../tracking/boardColours';
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

/** A single cell of a saved loop (StoredBoardCell + the slice-1 variation flag). */
export interface StoredLoopCell extends StoredBoardCell {
  conditional?: boolean;
}

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
  /** Loop bank: the bottom row becomes save/recall slots for layered loops. */
  loopBankEnabled: boolean;
  /** Saved loops per slot (bottom-row column); null = empty slot. */
  loopSlots: (StoredLoopCell[] | null)[];
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
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
  /** Chosen camera's deviceId ('' = browser default). Switching invalidates corners. */
  cameraDeviceId: string;
  /** Chosen camera's name, to say which camera is missing when it can't be found. */
  cameraLabel: string;
  /** Physical squares per side of the board (8 × 8 chess/draughts, 10 × 10 draughts). */
  boardSquares: BoardSquares;
  /** Calm theme mode for the redesigned screens. */
  themeMode: 'dark' | 'light';
  /** Samples per axis per cell (suggested from the grid; passed to BoardReader). */
  samplesPerAxis: number;
  /** True once the user tuned Piece coverage — freezes suggested read settings. */
  readSettingsCustom: boolean;
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
  /** Usable range per fader control, so a counter can't reach silence or a runaway tempo. */
  controlRanges: Record<FaderRole, ControlRange>;
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
export type FaderRole = 'volume' | 'reverb' | 'delay' | 'tone' | 'tempo';
export interface ControlRange { min: number; max: number }
/** What a fader does when its counter leaves: keep it, drop to zero, or drift back. */
export type ControlRemoval = 'hold' | 'zero' | 'default';

const FADER_ROLE_LIST: FaderRole[] = ['volume', 'reverb', 'delay', 'tone', 'tempo'];

const DEFAULT_CONTROL_RANGES: Record<FaderRole, ControlRange> = {
  volume: { min: 0.2, max: 1 },
  reverb: { min: 0, max: 0.6 },
  delay: { min: 0, max: 0.6 },
  tone: { min: 0, max: 1 },
  tempo: { min: 60, max: 160 },
};

const DEFAULT_CONTROL_REMOVAL: Record<FaderRole, ControlRemoval> = {
  volume: 'hold', reverb: 'hold', delay: 'hold', tone: 'hold', tempo: 'hold',
};

const ZERO_CORNERS: [BoardPoint, BoardPoint, BoardPoint, BoardPoint] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

// A neutral hue band used only as a sanitisation fallback for a stored channel
// whose band is missing/corrupt — NOT a predefined colour (fresh boards have none).
const FALLBACK_HUE_BAND: TrackedColor = {
  id: 'board-hue', hue: 0, hueTolerance: 22, minSaturation: 35, minValue: 25, minArea: 0.0005,
};

export const DEFAULT_BOARD_SEQUENCER_CONFIG: BoardSequencerStored = {
  version: CONFIG_VERSION,
  enabled: false,
  corners: ZERO_CORNERS,
  rows: 4,
  cols: 4,
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
  minFilledFraction: suggestReadSettings(8, 4, 4).minFilledFraction,
  variationEnabled: false,
  variationOffsetThreshold: 0.6,
  pingPong: false,
  loopBankEnabled: false,
  loopSlots: [],
  noteLengthBeats: 0.9,
  velocity: 0.7,
  octaveShift: 0,
  volume: 0.6,
  tickEnabled: true,
  loopStepsRed: 0,
  loopStepsBlack: 0,
  loopStepsBlue: 0,
  numPages: 1,
  pages: [],
  mirrorX: true,
  mirrorY: false,
  cameraDeviceId: '',
  cameraLabel: '',
  boardSquares: 8,
  themeMode: 'dark',
  samplesPerAxis: suggestReadSettings(8, 4, 4).samplesPerAxis,
  readSettingsCustom: false,
  boardNudgesEnabled: true,
  handedness: 'right',
  seatEdge: 'low',
  controlStillMs: 150,
  controlGlideSec: 0.3,
  controlReturnMs: 3000,
  controlRanges: DEFAULT_CONTROL_RANGES,
  controlRemoval: DEFAULT_CONTROL_REMOVAL,
  toggleAmount: 0.35,
  captureQuietMs: 500,
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
    out[role] = { min: num(r.min, d.min), max: num(r.max, d.max) };
  }
  return out;
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
  if (isNum(o.volume)) ch.volume = o.volume;
  if (isNum(o.tone)) ch.tone = o.tone;
  if (isNum(o.reverbSend)) ch.reverbSend = o.reverbSend;
  if (isNum(o.delaySend)) ch.delaySend = o.delaySend;
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
  }
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
    // Pre-v2 colour data (the old fixed palette + its migration) is discarded so
    // the board starts with no predefined colours.
    channels: num(o.version, 1) >= CONFIG_VERSION ? sanitizeChannels(o.channels) : [],
    faderAxis: o.faderAxis === 'col' ? 'col' : 'row',
    minFilledFraction,
    variationEnabled: o.variationEnabled === true,
    variationOffsetThreshold: num(o.variationOffsetThreshold, d.variationOffsetThreshold),
    pingPong: o.pingPong === true,
    loopBankEnabled: zoneSlotCount(resolvedLoopZone, rows, cols) > 0,
    loopSlots: sanitizeLoopSlots(o.loopSlots),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    octaveShift: num(o.octaveShift, d.octaveShift),
    volume: num(o.volume, d.volume),
    tickEnabled: o.tickEnabled !== false,
    // Whole counts. A stored 0, 2.5 or -1 used to survive: Array.from({length: numPages})
    // throws on a fraction, and the page picker showed nothing selected.
    loopStepsRed: wholeCount(o.loopStepsRed, 0, MAX_LOOP_STEPS, d.loopStepsRed),
    loopStepsBlack: wholeCount(o.loopStepsBlack, 0, MAX_LOOP_STEPS, d.loopStepsBlack),
    loopStepsBlue: wholeCount(o.loopStepsBlue, 0, MAX_LOOP_STEPS, d.loopStepsBlue),
    numPages: wholeCount(o.numPages, 1, MAX_PAGES, d.numPages),
    pages: sanitizePages(o.pages),
    mirrorX: o.mirrorX !== false,
    mirrorY: o.mirrorY === true,
    cameraDeviceId: typeof o.cameraDeviceId === 'string' ? o.cameraDeviceId : d.cameraDeviceId,
    cameraLabel: typeof o.cameraLabel === 'string' ? o.cameraLabel : d.cameraLabel,
    boardSquares,
    themeMode: o.themeMode === 'light' ? 'light' : 'dark',
    samplesPerAxis,
    readSettingsCustom,
    boardNudgesEnabled: o.boardNudgesEnabled !== false,
    handedness: o.handedness === 'left' ? 'left' : 'right',
    seatEdge: o.seatEdge === 'start' || o.seatEdge === 'end' || o.seatEdge === 'high' ? o.seatEdge : 'low',
    controlStillMs: clampNum(o.controlStillMs, 0, 2000, d.controlStillMs),
    controlGlideSec: clampNum(o.controlGlideSec, 0, 2, d.controlGlideSec),
    controlReturnMs: clampNum(o.controlReturnMs, 0, 30000, d.controlReturnMs),
    controlRanges: sanitizeControlRanges(o.controlRanges),
    controlRemoval: sanitizeControlRemoval(o.controlRemoval),
    toggleAmount: clampNum(o.toggleAmount, 0, 1, d.toggleAmount),
    captureQuietMs: clampNum(o.captureQuietMs, 0, 5000, d.captureQuietMs),
    // A saved "on" from before it was switched off by default is cleared ONCE. It was on
    // by default and is known to blind the board on a real camera, so leaving it set would
    // hand the fault to exactly the people who hit it first and never chose it. Turning it
    // back on after this migration sticks.
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
export function referencedChannelIds(cfg: Pick<BoardSequencerStored, 'pages' | 'loopSlots'>): Set<string> {
  const ids = new Set<string>();
  for (const page of cfg.pages) for (const c of page) ids.add(c.colour);
  for (const slot of cfg.loopSlots) if (slot) for (const c of slot) ids.add(c.colour);
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
