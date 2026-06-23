/**
 * Board-sequencer configuration persistence.
 *
 * Mirrors the SurfacePressConfig / BatonAssignments pattern: a dedicated
 * localStorage key, sanitised on load (a corrupt store yields null and the
 * screen falls back to "not yet calibrated"), exposed via InputProfileManager.
 * No change to UserProfile.
 */

import type { TrackedColor } from '../tracking/ColorTracker';
import type { ColourId, ColourRole } from '../tracking/boardColours';
import {
  BOARD_COLOURS, BOARD_COLOUR_BY_ID, defaultHueBand,
  DEFAULT_BLACK_BAND, DEFAULT_WHITE_BAND, ROLE_LABELS,
  type BlackBand, type WhiteBand,
} from '../tracking/boardColours';

const STORAGE_KEY = 'admi-board-sequencer';

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
  /** Calibrated hue bands per hue colour (red…purple). Missing → palette default. */
  hueBands: Partial<Record<ColourId, TrackedColor>>;
  /** Achromatic dark-piece ("black") detection band. */
  blackBand: BlackBand;
  /** Achromatic bright-piece ("white") detection band. */
  whiteBand: WhiteBand;
  /** What each colour does (sequenced voice or live control). Missing → 'off'. */
  colourRoles: Partial<Record<ColourId, ColourRole>>;
  /** Axis a control-colour piece's position maps to its value ('row' = vertical). */
  faderAxis: 'row' | 'col';
  minFilledFraction: number;
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
  /** Global transpose in octaves (applied to all melodic + bass notes). */
  octaveShift: number;
  /** Board output volume (0..1). */
  volume: number;
  /** Per-row mixer (indexed by row, 0 = top): volume, tone/brightness, and FX sends (all 0..1). */
  rowVolume: number[];
  rowTone: number[];
  rowReverbSend: number[];
  rowDelaySend: number[];
  /** Melodic behaviour: single instrument ('pitched'), per-row instruments, or pure drum kit. */
  rowMode: 'pitched' | 'drumKit' | 'instruments';
  /** Per-row palette keys for 'instruments' mode (indexed by row, 0 = top). */
  rowInstruments: string[];
  /** Per-row drum override (indexed by row, 0 = top); '' = default kit mapping. */
  rowDrums: string[];
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

const DEFAULT_RED: TrackedColor = defaultHueBand(BOARD_COLOUR_BY_ID.red);

export const DEFAULT_BOARD_SEQUENCER_CONFIG: BoardSequencerStored = {
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
  hueBands: { red: DEFAULT_RED },
  blackBand: DEFAULT_BLACK_BAND,
  whiteBand: DEFAULT_WHITE_BAND,
  // Fresh boards play red as melody; everything else is off until assigned.
  colourRoles: { red: 'melody' },
  faderAxis: 'row',
  minFilledFraction: 0.15,
  noteLengthBeats: 0.9,
  velocity: 0.7,
  octaveShift: 0,
  volume: 0.6,
  rowVolume: [1, 1, 1, 1, 1, 1, 1, 1],
  rowTone: [1, 1, 1, 1, 1, 1, 1, 1],
  rowReverbSend: [0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18],
  rowDelaySend: [0, 0, 0, 0, 0, 0, 0, 0],
  tickEnabled: true,
  instrumentKey: 'electricPiano',
  rowMode: 'pitched',
  // Empty = "use the default instrument" for that row; override per row in the UI.
  rowInstruments: ['', '', '', '', '', '', '', ''],
  // Empty = "use the default kit mapping" for that row; override per row in the UI.
  rowDrums: ['', '', '', '', '', '', '', ''],
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

function numArray(v: unknown, fallback: number[]): number[] {
  return Array.isArray(v) && v.every(isNum) ? (v as number[]) : fallback;
}

function sanitizeCorners(v: unknown): [BoardPoint, BoardPoint, BoardPoint, BoardPoint] {
  if (!Array.isArray(v) || v.length !== 4) return ZERO_CORNERS;
  const pts = v.map((p) => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    return { x: num(o.x, 0), y: num(o.y, 0) };
  });
  return [pts[0], pts[1], pts[2], pts[3]];
}

function isColourId(v: unknown): v is ColourId {
  return typeof v === 'string' && v in BOARD_COLOUR_BY_ID;
}

function sanitizePages(v: unknown): StoredBoardCell[][] {
  if (!Array.isArray(v)) return [];
  return v.map((page) => {
    if (!Array.isArray(page)) return [];
    return page.flatMap((c) => {
      const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
      if (!isNum(o.row) || !isNum(o.col) || !isColourId(o.colour)) return [];
      return [{ row: o.row, col: o.col, colour: o.colour }];
    });
  });
}

function sanitizeHueBands(
  v: unknown,
  legacyRed: unknown,
  legacyBlue: unknown,
): Partial<Record<ColourId, TrackedColor>> {
  const out: Partial<Record<ColourId, TrackedColor>> = {};
  const src = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  for (const def of BOARD_COLOURS) {
    if (def.kind !== 'hue') continue;
    if (src[def.id]) out[def.id] = sanitizeColour(src[def.id], defaultHueBand(def));
  }
  // Migrate legacy single redColour / blueColour into the band map.
  if (!out.red) out.red = sanitizeColour(legacyRed, defaultHueBand(BOARD_COLOUR_BY_ID.red));
  if (!out.blue && legacyBlue) out.blue = sanitizeColour(legacyBlue, defaultHueBand(BOARD_COLOUR_BY_ID.blue));
  return out;
}

function sanitizeColourRoles(
  v: unknown,
  legacy: { blackDrums: boolean; blueBass: boolean; redBlack: boolean },
): Partial<Record<ColourId, ColourRole>> {
  const src = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  if (Object.keys(src).length > 0) {
    const out: Partial<Record<ColourId, ColourRole>> = {};
    for (const def of BOARD_COLOURS) {
      const r = src[def.id];
      if (typeof r === 'string' && r in ROLE_LABELS) out[def.id] = r as ColourRole;
    }
    return out;
  }
  // No new-style roles → migrate from the legacy red=melody / black=drums / blue=bass flags.
  const out: Partial<Record<ColourId, ColourRole>> = { red: 'melody' };
  if (legacy.blackDrums || legacy.redBlack) out.black = 'drums';
  if (legacy.blueBass) out.blue = 'bass';
  return out;
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
    hueBands: sanitizeHueBands(o.hueBands, o.redColour, o.blueColour),
    blackBand: {
      maxValue: num((o.blackBand as Record<string, unknown>)?.maxValue ?? o.blackMaxValue, d.blackBand.maxValue),
      maxSaturation: num((o.blackBand as Record<string, unknown>)?.maxSaturation ?? o.blackMaxSaturation, d.blackBand.maxSaturation),
    },
    whiteBand: {
      minValue: num((o.whiteBand as Record<string, unknown>)?.minValue, d.whiteBand.minValue),
      maxSaturation: num((o.whiteBand as Record<string, unknown>)?.maxSaturation, d.whiteBand.maxSaturation),
    },
    colourRoles: sanitizeColourRoles(o.colourRoles, {
      blackDrums: o.blackDrums === true,
      blueBass: o.blueBass === true,
      redBlack: o.rowMode === 'redBlack',
    }),
    faderAxis: o.faderAxis === 'col' ? 'col' : 'row',
    minFilledFraction: num(o.minFilledFraction, d.minFilledFraction),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    octaveShift: num(o.octaveShift, d.octaveShift),
    volume: num(o.volume, d.volume),
    rowVolume: numArray(o.rowVolume, d.rowVolume),
    rowTone: numArray(o.rowTone, d.rowTone),
    rowReverbSend: numArray(o.rowReverbSend, d.rowReverbSend),
    rowDelaySend: numArray(o.rowDelaySend, d.rowDelaySend),
    tickEnabled: o.tickEnabled !== false,
    instrumentKey: typeof o.instrumentKey === 'string' ? o.instrumentKey : d.instrumentKey,
    // Migrate the old combined 'redBlack' mode → 'instruments' (black=drums now
    // lives in colourRoles).
    rowMode:
      o.rowMode === 'drumKit' ? 'drumKit'
        : (o.rowMode === 'instruments' || o.rowMode === 'redBlack') ? 'instruments'
          : 'pitched',
    rowInstruments:
      Array.isArray(o.rowInstruments) && o.rowInstruments.every((k) => typeof k === 'string')
        ? (o.rowInstruments as string[])
        : d.rowInstruments,
    rowDrums:
      Array.isArray(o.rowDrums) && o.rowDrums.every((k) => typeof k === 'string')
        ? (o.rowDrums as string[])
        : d.rowDrums,
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
