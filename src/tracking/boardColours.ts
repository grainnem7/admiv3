/**
 * Board colour channels — the colours the sequencer detects are NOT a fixed
 * palette; the user calibrates their own by clicking a piece on the camera
 * (Musikraken-style). Each calibrated colour becomes a "channel": a sampled
 * detection band, a display swatch, and an assigned role.
 *
 * Detection stays hue-based for vivid colours plus achromatic tests for very
 * dark (black) / very bright (white) pieces; the kind is inferred when you
 * calibrate. Channels are matched in PRIORITY order (vivid hues before the
 * achromatic fallbacks), so a blue piece on a dark square reads blue, not black.
 */

import type { TrackedColor } from './ColorTracker';
import { matchesTrackedColor, matchesBlack, matchesWhite } from './ColorTracker';

/** A channel id is an opaque string (e.g. 'c1'); colours are user-defined. */
export type ColourId = string;

export type ColourKind = 'hue' | 'black' | 'white';

/**
 * What a colour DOES. Sequenced roles play in the step grid; control roles read
 * the board live — faders map a piece's position to a 0..1 value, toggles switch
 * an effect on when a piece of that colour is present.
 */
export type ColourRole =
  | 'off'
  | 'melody' | 'bass' | 'drums' | 'chord'   // sequenced voices
  | 'volume' | 'reverb' | 'delay' | 'tone'  // position faders → 0..1
  | 'reverbToggle' | 'delayToggle';         // presence → on/off

export const SEQUENCED_ROLES: ColourRole[] = ['melody', 'bass', 'drums', 'chord'];
export const FADER_ROLES: ColourRole[] = ['volume', 'reverb', 'delay', 'tone'];
export const TOGGLE_ROLES: ColourRole[] = ['reverbToggle', 'delayToggle'];

export function isSequencedRole(r: ColourRole): boolean {
  return SEQUENCED_ROLES.includes(r);
}
export function isFaderRole(r: ColourRole): boolean {
  return FADER_ROLES.includes(r);
}
export function isToggleRole(r: ColourRole): boolean {
  return TOGGLE_ROLES.includes(r);
}
export function isControlRole(r: ColourRole): boolean {
  return isFaderRole(r) || isToggleRole(r);
}

/** Human labels for the role picker. */
export const ROLE_LABELS: Record<ColourRole, string> = {
  off: 'Off',
  melody: 'Melody',
  bass: 'Bass',
  drums: 'Drums',
  chord: 'Chord stab',
  volume: 'Volume (fader)',
  reverb: 'Reverb amount (fader)',
  delay: 'Delay amount (fader)',
  tone: 'Tone/brightness (fader)',
  reverbToggle: 'Reverb on/off',
  delayToggle: 'Delay on/off',
};

export interface BlackBand {
  maxValue: number;
  maxSaturation: number;
}

export interface WhiteBand {
  minValue: number;
  maxSaturation: number;
}

// HSV saturation/value are on a 0..100 scale (see rgbToHsv).
export const DEFAULT_BLACK_BAND: BlackBand = { maxValue: 34, maxSaturation: 45 };
export const DEFAULT_WHITE_BAND: WhiteBand = { minValue: 78, maxSaturation: 18 };

/** A user-calibrated colour: its detection band, display swatch, and role. */
export interface ColourChannel {
  id: ColourId;
  kind: ColourKind;
  role: ColourRole;
  /** CSS colour (sampled) shown so the user sees which piece maps to which role. */
  swatch: string;
  /** Calibrated band for `kind: 'hue'`. */
  band?: TrackedColor;
  /** Calibrated band for `kind: 'black'`. */
  blackBand?: BlackBand;
  /** Calibrated band for `kind: 'white'`. */
  whiteBand?: WhiteBand;
}

/** A colour reduced to "does this HSV pixel match?", tagged with its id. */
export interface ColourMatcher {
  id: ColourId;
  test: (hsv: { h: number; s: number; v: number }) => boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a detection matcher for one channel from its calibrated band. */
export function buildChannelMatcher(ch: ColourChannel): ColourMatcher {
  if (ch.kind === 'black') {
    const b = ch.blackBand ?? DEFAULT_BLACK_BAND;
    return { id: ch.id, test: (hsv) => matchesBlack(hsv, b.maxValue, b.maxSaturation) };
  }
  if (ch.kind === 'white') {
    const w = ch.whiteBand ?? DEFAULT_WHITE_BAND;
    return { id: ch.id, test: (hsv) => matchesWhite(hsv, w.minValue, w.maxSaturation) };
  }
  const band = ch.band ?? { id: ch.id, hue: 0, hueTolerance: 22, minSaturation: 30, minValue: 25, minArea: 0.0005 };
  // The board always skips skin exclusion (slide-and-settle rejects the moving arm).
  return { id: ch.id, test: (hsv) => matchesTrackedColor(hsv, band, true) };
}

/** Channels in detection PRIORITY order: vivid hues first, white, then black last. */
export function orderedChannels(channels: ColourChannel[]): ColourChannel[] {
  const rank = (k: ColourKind) => (k === 'hue' ? 0 : k === 'white' ? 1 : 2);
  return [...channels].sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function buildChannelMatchers(channels: ColourChannel[]): ColourMatcher[] {
  return orderedChannels(channels).map(buildChannelMatcher);
}

/** Channel ids in priority order (for the recognizer). */
export function channelPriority(channels: ColourChannel[]): ColourId[] {
  return orderedChannels(channels).map((c) => c.id);
}

/**
 * Turn a sampled HSV into a channel calibration: very dark/desaturated → black,
 * very bright/desaturated → white, otherwise a hue band centred on the sample.
 */
export function calibrationFromHsv(hsv: { h: number; s: number; v: number }): {
  kind: ColourKind;
  band?: TrackedColor;
  blackBand?: BlackBand;
  whiteBand?: WhiteBand;
} {
  if (hsv.s <= 22 && hsv.v <= 45) {
    return {
      kind: 'black',
      blackBand: { maxValue: clamp(hsv.v * 1.6 + 8, 18, 60), maxSaturation: clamp(hsv.s + 20, 30, 70) },
    };
  }
  if (hsv.s <= 22 && hsv.v >= 60) {
    return {
      kind: 'white',
      whiteBand: { minValue: clamp(hsv.v * 0.85, 55, 95), maxSaturation: clamp(hsv.s + 12, 10, 40) },
    };
  }
  return {
    kind: 'hue',
    band: {
      id: '',
      hue: hsv.h,
      hueTolerance: 22,
      minSaturation: Math.max(25, hsv.s * 0.5),
      minValue: Math.max(18, hsv.v * 0.45),
      minArea: 0.0005,
    },
  };
}

/** A short human name for a hue (for readouts / aria labels). */
export function hueName(h: number): string {
  const x = ((h % 360) + 360) % 360;
  if (x < 15 || x >= 345) return 'Red';
  if (x < 45) return 'Orange';
  if (x < 70) return 'Yellow';
  if (x < 170) return 'Green';
  if (x < 200) return 'Cyan';
  if (x < 255) return 'Blue';
  if (x < 290) return 'Purple';
  return 'Pink';
}

/** A short descriptive name for a channel (for readouts / aria labels). */
export function describeChannel(ch: ColourChannel): string {
  if (ch.kind === 'black') return 'Black';
  if (ch.kind === 'white') return 'White';
  return hueName(ch.band?.hue ?? 0);
}

/** Pick a fresh, readable channel id ('c1', 'c2', …) not already in `existing`. */
export function freshChannelId(existing: ColourId[]): ColourId {
  const used = new Set(existing);
  for (let i = 1; i <= existing.length + 1; i++) {
    const id = `c${i}`;
    if (!used.has(id)) return id;
  }
  return `c${existing.length + 1}`;
}
