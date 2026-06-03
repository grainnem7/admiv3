/**
 * Board-sequencer configuration persistence.
 *
 * Mirrors the SurfacePressConfig / BatonAssignments pattern: a dedicated
 * localStorage key, sanitised on load (a corrupt store yields null and the
 * screen falls back to "not yet calibrated"), exposed via InputProfileManager.
 * No change to UserProfile.
 */

import type { TrackedColor } from '../tracking/ColorTracker';

const STORAGE_KEY = 'admi-board-sequencer';

export interface BoardPoint {
  x: number;
  y: number;
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
  settleWindowMs: number;
  velocityFloor: number;
  velocitySmoothing: number;
  occupancyGraceMs: number;
  motionConfirmMs: number;
  redColour: TrackedColor;
  minFilledFraction: number;
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
  /** Global transpose in octaves (applied to all melodic + bass notes). */
  octaveShift: number;
  /** Reverb wet amount (0..1) on the board mix. */
  reverbWet: number;
  /** Board output volume (0..1). */
  volume: number;
  /** Melodic behaviour: single instrument ('pitched'), per-row instruments, or pure drum kit. */
  rowMode: 'pitched' | 'drumKit' | 'instruments';
  /** Layer black pieces as drums on top of a melodic mode (ignored in drumKit). */
  blackDrums: boolean;
  /** Per-row palette keys for 'instruments' mode (indexed by row, 0 = top). */
  rowInstruments: string[];
  /** Black-piece detection: a pixel is "black" if value ≤ blackMaxValue and saturation ≤ blackMaxSaturation. */
  blackMaxValue: number;
  blackMaxSaturation: number;
  /** Layer blue pieces as a bass voice on top of a melodic mode (ignored in drumKit). */
  blueBass: boolean;
  /** Calibrated blue band used to detect blue pieces. */
  blueColour: TrackedColor;
  /** Display + sampling orientation. Calibration is captured in this same space. */
  mirrorX: boolean;
  mirrorY: boolean;
}

const ZERO_CORNERS: [BoardPoint, BoardPoint, BoardPoint, BoardPoint] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

const DEFAULT_RED: TrackedColor = {
  id: 'board-red',
  hue: 0,
  hueTolerance: 16,
  minSaturation: 35,
  minValue: 25,
  minArea: 0.0005,
};

const DEFAULT_BLUE: TrackedColor = {
  id: 'board-blue',
  hue: 215,
  hueTolerance: 26,
  minSaturation: 35,
  minValue: 25,
  minArea: 0.0005,
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
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
  redColour: DEFAULT_RED,
  minFilledFraction: 0.15,
  noteLengthBeats: 0.9,
  velocity: 0.7,
  octaveShift: 0,
  reverbWet: 0.18,
  volume: 0.6,
  tickEnabled: true,
  instrumentKey: 'electricPiano',
  rowMode: 'pitched',
  blackDrums: false,
  // Empty = "use the default instrument" for that row; override per row in the UI.
  rowInstruments: ['', '', '', '', '', '', '', ''],
  blackMaxValue: 34,
  blackMaxSaturation: 45,
  blueBass: false,
  blueColour: DEFAULT_BLUE,
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
    settleWindowMs: num(o.settleWindowMs, d.settleWindowMs),
    velocityFloor: num(o.velocityFloor, d.velocityFloor),
    velocitySmoothing: num(o.velocitySmoothing, d.velocitySmoothing),
    occupancyGraceMs: num(o.occupancyGraceMs, d.occupancyGraceMs),
    motionConfirmMs: num(o.motionConfirmMs, d.motionConfirmMs),
    redColour: sanitizeColour(o.redColour, DEFAULT_RED),
    minFilledFraction: num(o.minFilledFraction, d.minFilledFraction),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    octaveShift: num(o.octaveShift, d.octaveShift),
    reverbWet: num(o.reverbWet, d.reverbWet),
    volume: num(o.volume, d.volume),
    tickEnabled: o.tickEnabled !== false,
    instrumentKey: typeof o.instrumentKey === 'string' ? o.instrumentKey : d.instrumentKey,
    // Migrate the old combined 'redBlack' mode → 'instruments' + blackDrums on.
    rowMode:
      o.rowMode === 'drumKit' ? 'drumKit'
        : (o.rowMode === 'instruments' || o.rowMode === 'redBlack') ? 'instruments'
          : 'pitched',
    blackDrums: o.blackDrums === true || o.rowMode === 'redBlack',
    rowInstruments:
      Array.isArray(o.rowInstruments) && o.rowInstruments.every((k) => typeof k === 'string')
        ? (o.rowInstruments as string[])
        : d.rowInstruments,
    blackMaxValue: num(o.blackMaxValue, d.blackMaxValue),
    blackMaxSaturation: num(o.blackMaxSaturation, d.blackMaxSaturation),
    blueBass: o.blueBass === true,
    blueColour: sanitizeColour(o.blueColour, DEFAULT_BLUE),
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
