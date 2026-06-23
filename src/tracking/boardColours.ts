/**
 * Board colour palette — the set of draught-piece colours the sequencer can
 * detect, and how each is matched against an HSV pixel.
 *
 * Detection is hue-based for the vivid colours (red…purple) plus achromatic
 * tests for black (dark) and white (bright). Colours are listed in PRIORITY
 * order: when a pixel/cell could match more than one, the earlier one wins, so
 * vivid hues beat the achromatic fallbacks (a blue piece on a dark square reads
 * blue, not black). Each colour is assigned a ROLE elsewhere (config); this
 * module is detection only.
 */

import type { TrackedColor } from './ColorTracker';
import { matchesTrackedColor, matchesBlack, matchesWhite } from './ColorTracker';

export type ColourId =
  | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'black' | 'white';

/**
 * What a colour DOES. Sequenced roles play in the step grid (like red/blue/black
 * always have); control roles read the board live instead of sequencing —
 * faders map a piece's position to a 0..1 value, toggles switch an effect on
 * when a piece of that colour is present.
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

export type ColourKind = 'hue' | 'black' | 'white';

export interface ColourDef {
  id: ColourId;
  name: string;
  kind: ColourKind;
  /** Default centre hue (0..360) for `kind: 'hue'`. */
  defaultHue?: number;
  /** A representative CSS colour for swatches / overlay tinting. */
  swatch: string;
}

/** All board colours, in detection PRIORITY order (vivid hues before black/white). */
export const BOARD_COLOURS: ColourDef[] = [
  { id: 'red', name: 'Red', kind: 'hue', defaultHue: 0, swatch: '#e53935' },
  { id: 'orange', name: 'Orange', kind: 'hue', defaultHue: 25, swatch: '#fb8c00' },
  { id: 'yellow', name: 'Yellow', kind: 'hue', defaultHue: 52, swatch: '#fdd835' },
  { id: 'green', name: 'Green', kind: 'hue', defaultHue: 120, swatch: '#43a047' },
  { id: 'blue', name: 'Blue', kind: 'hue', defaultHue: 215, swatch: '#1e88e5' },
  { id: 'purple', name: 'Purple', kind: 'hue', defaultHue: 280, swatch: '#8e24aa' },
  { id: 'white', name: 'White', kind: 'white', swatch: '#fafafa' },
  { id: 'black', name: 'Black', kind: 'black', swatch: '#212121' },
];

export const BOARD_COLOUR_BY_ID: Record<ColourId, ColourDef> = Object.fromEntries(
  BOARD_COLOURS.map((c) => [c.id, c]),
) as Record<ColourId, ColourDef>;

/** Detection priority order (ids), vivid hues first, black last. */
export const COLOUR_PRIORITY: ColourId[] = BOARD_COLOURS.map((c) => c.id);

/** Default hue band for a hue colour, centred on its palette hue. */
export function defaultHueBand(def: ColourDef): TrackedColor {
  return {
    id: `board-${def.id}`,
    hue: def.defaultHue ?? 0,
    hueTolerance: 22,
    minSaturation: 35,
    minValue: 25,
    minArea: 0.0005,
  };
}

export interface BlackBand {
  maxValue: number;
  maxSaturation: number;
}

export interface WhiteBand {
  minValue: number;
  maxSaturation: number;
}

// Note: HSV saturation/value are on a 0..100 scale (see rgbToHsv).
export const DEFAULT_BLACK_BAND: BlackBand = { maxValue: 34, maxSaturation: 45 };
export const DEFAULT_WHITE_BAND: WhiteBand = { minValue: 78, maxSaturation: 18 };

/** A colour reduced to "does this HSV pixel match?", tagged with its id. */
export interface ColourMatcher {
  id: ColourId;
  test: (hsv: { h: number; s: number; v: number }) => boolean;
}

/** Calibration inputs for building matchers (only the kinds in use need supplying). */
export interface ColourCalibration {
  /** Calibrated hue bands by colour id (for `kind: 'hue'`). */
  hueBands: Partial<Record<ColourId, TrackedColor>>;
  black: BlackBand;
  white: WhiteBand;
}

/** Build a matcher for one colour from its calibration. */
export function buildMatcher(def: ColourDef, cal: ColourCalibration): ColourMatcher {
  if (def.kind === 'black') {
    return { id: def.id, test: (hsv) => matchesBlack(hsv, cal.black.maxValue, cal.black.maxSaturation) };
  }
  if (def.kind === 'white') {
    return { id: def.id, test: (hsv) => matchesWhite(hsv, cal.white.minValue, cal.white.maxSaturation) };
  }
  const band = cal.hueBands[def.id] ?? defaultHueBand(def);
  // Board always skips skin exclusion (slide-and-settle rejects the moving arm).
  return { id: def.id, test: (hsv) => matchesTrackedColor(hsv, band, true) };
}

/**
 * Build matchers (in priority order) for the colours that are in use. `inUse`
 * is the set of colour ids whose role is not 'off'.
 */
export function buildMatchers(inUse: Iterable<ColourId>, cal: ColourCalibration): ColourMatcher[] {
  const set = new Set(inUse);
  return BOARD_COLOURS.filter((c) => set.has(c.id)).map((c) => buildMatcher(c, cal));
}
