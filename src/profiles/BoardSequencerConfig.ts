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

const STORAGE_KEY = 'admi-board-sequencer';

// Bump when a stored-shape change should reset colour channels. v2 dropped the
// fixed palette + its migration: any pre-v2 colour data is wiped (start empty).
const CONFIG_VERSION = 2;

export interface BoardPoint {
  x: number;
  y: number;
}

/** A single settled cell as persisted in a captured page snapshot. */
export interface StoredBoardCell {
  row: number;
  col: number;
  colour: ColourId;
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
}

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
  rows: 6,
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
  minFilledFraction: 0.1,
  variationEnabled: false,
  variationOffsetThreshold: 0.6,
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
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(v: unknown, fallback: number): number {
  return isNum(v) ? v : fallback;
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
      return [{ row: o.row, col: o.col, colour: o.colour }];
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
  return {
    version: CONFIG_VERSION,
    enabled: o.enabled === true,
    corners: sanitizeCorners(o.corners),
    rows: num(o.rows, d.rows),
    cols: num(o.cols, d.cols),
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
    minFilledFraction: num(o.minFilledFraction, d.minFilledFraction),
    variationEnabled: o.variationEnabled === true,
    variationOffsetThreshold: num(o.variationOffsetThreshold, d.variationOffsetThreshold),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    octaveShift: num(o.octaveShift, d.octaveShift),
    volume: num(o.volume, d.volume),
    tickEnabled: o.tickEnabled !== false,
    loopStepsRed: num(o.loopStepsRed, d.loopStepsRed),
    loopStepsBlack: num(o.loopStepsBlack, d.loopStepsBlack),
    loopStepsBlue: num(o.loopStepsBlue, d.loopStepsBlue),
    numPages: num(o.numPages, d.numPages),
    pages: sanitizePages(o.pages),
    mirrorX: o.mirrorX !== false,
    mirrorY: o.mirrorY === true,
  };
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
