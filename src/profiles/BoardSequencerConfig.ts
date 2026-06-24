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
  /** User-calibrated colour channels (click a piece to add one); each has a role. */
  channels: ColourChannel[];
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

// A neutral hue band used only as a sanitisation fallback for a stored channel
// whose band is missing/corrupt — NOT a predefined colour (fresh boards have none).
const FALLBACK_HUE_BAND: TrackedColor = {
  id: 'board-hue', hue: 0, hueTolerance: 22, minSaturation: 35, minValue: 25, minArea: 0.0005,
};

/** Legacy fixed-palette metadata, used only to migrate pre-channels configs. */
const LEGACY_COLOUR_META: Record<string, { kind: ColourKind; hue?: number; swatch: string }> = {
  red: { kind: 'hue', hue: 0, swatch: '#e53935' },
  orange: { kind: 'hue', hue: 25, swatch: '#fb8c00' },
  yellow: { kind: 'hue', hue: 52, swatch: '#fdd835' },
  green: { kind: 'hue', hue: 120, swatch: '#43a047' },
  blue: { kind: 'hue', hue: 215, swatch: '#1e88e5' },
  purple: { kind: 'hue', hue: 280, swatch: '#8e24aa' },
  white: { kind: 'white', swatch: '#fafafa' },
  black: { kind: 'black', swatch: '#212121' },
};

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
  // No predefined colours — the user calibrates their own by clicking a piece.
  channels: [],
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
  return ch;
}

/**
 * Build the channel list: prefer the new `channels` array; otherwise migrate from
 * the previous shape (`colourRoles` + `hueBands` + black/white bands) or the
 * oldest flags (`blackDrums`/`blueBass`/`redColour`/`blueColour`).
 */
function sanitizeChannels(o: Record<string, unknown>): ColourChannel[] {
  if (Array.isArray(o.channels)) {
    // The user owns the list — an empty board (no colours) is valid.
    return o.channels.map(sanitizeChannel).filter((c): c is ColourChannel => c !== null);
  }
  // ---- migrate from the pre-channels (fixed-palette) shape ----
  const roles = (typeof o.colourRoles === 'object' && o.colourRoles !== null
    ? o.colourRoles : {}) as Record<string, unknown>;
  const hueBands = (typeof o.hueBands === 'object' && o.hueBands !== null
    ? o.hueBands : {}) as Record<string, unknown>;
  const blackBand = sanitizeBlackBand(o.blackBand ?? {
    maxValue: o.blackMaxValue, maxSaturation: o.blackMaxSaturation,
  });
  const whiteBand = sanitizeWhiteBand(o.whiteBand);

  // Resolve a role per legacy colour id (new-style roles, else oldest flags).
  const roleFor: Record<string, ColourRole> = {};
  if (Object.keys(roles).length > 0) {
    for (const [id, r] of Object.entries(roles)) {
      if (typeof r === 'string' && r in ROLE_LABELS) roleFor[id] = r as ColourRole;
    }
  } else {
    roleFor.red = 'melody';
    if (o.blackDrums === true || o.rowMode === 'redBlack') roleFor.black = 'drums';
    if (o.blueBass === true) roleFor.blue = 'bass';
  }

  const channels: ColourChannel[] = [];
  let n = 0;
  for (const [id, role] of Object.entries(roleFor)) {
    if (role === 'off') continue;
    const meta = LEGACY_COLOUR_META[id] ?? { kind: 'hue' as ColourKind, hue: 0, swatch: '#888888' };
    const ch: ColourChannel = { id: `c${++n}`, kind: meta.kind, role, swatch: meta.swatch };
    if (meta.kind === 'hue') {
      const legacy = id === 'red' ? o.redColour : id === 'blue' ? o.blueColour : undefined;
      ch.band = sanitizeColour(hueBands[id] ?? legacy, {
        id: `board-${id}`, hue: meta.hue ?? 0, hueTolerance: 22, minSaturation: 35, minValue: 25, minArea: 0.0005,
      });
    } else if (meta.kind === 'black') ch.blackBand = blackBand;
    else ch.whiteBand = whiteBand;
    channels.push(ch);
  }
  return channels;
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
    channels: sanitizeChannels(o),
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
