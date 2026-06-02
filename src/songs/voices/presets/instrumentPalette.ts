/**
 * Instrument Palette — the curated 5-instrument selection used when a baton
 * is in "instrument" mode (see InstrumentVoice).
 *
 * Each entry is keyed by a stable identifier that persists in the user's
 * baton-assignment profile, plus a display name used by the UI.
 *
 * All entries here MUST point at real-instrument samples (not synthesised
 * pads or textures). Where a true sample-based option isn't yet sourced,
 * the entry uses the closest real-instrument substitute and is documented
 * in SAMPLE_SOURCES.md so it can be upgraded later.
 *
 * @see SAMPLE_SOURCES.md for sample sources, licences, and known gaps.
 */

import type { SampleConfigKey } from '../SamplerPlayer';

/** A single entry in the curated palette. */
export interface InstrumentPaletteEntry {
  /** Stable identifier (persisted in profiles). */
  key: string;
  /** Display name shown in the UI. */
  name: string;
  /** Existing SAMPLE_CONFIGS key the SamplerPlayer should load. */
  sampleKey: SampleConfigKey;
  /** Nominal note duration in seconds for triggerAttackRelease. */
  duration: number;
  /**
   * Note-velocity scaling. Existing single-velocity-layer samples (e.g.
   * the nbrosowsky cello, contrabass) need wider dynamic shaping than
   * multi-velocity samples (e.g. Salamander piano) so soft movements
   * produce convincingly soft notes.
   *
   *   minVel = baseline velocity for tiny movements
   *   maxVel = velocity for energetic movements
   */
  velocityRange: { min: number; max: number };
  /**
   * Velocity → filter brightness mapping (Hz added to the voice's
   * pre-existing filter setting on each trigger).  Single-velocity
   * samples lean harder on this for dynamic colour; multi-velocity
   * samples (Salamander) use a gentler boost because the sample layers
   * already provide their own dynamic timbre shift.
   */
  brightnessBoostHz: number;
  /** Source attribution shown in SAMPLE_SOURCES.md and tooltips. */
  source: string;
  /** Workshop-readiness note, surfaced in SAMPLE_SOURCES.md. */
  notes?: string;
}

/**
 * The curated palette.
 *
 * The participant's request (Workshop 5, 2026-05-06) was for:
 *   piano · electric piano · bass · simple percussion · strings
 *
 * Substitutions for entries where a true sample set isn't currently
 * bundled (electric piano, percussion) use the closest sampled
 * real-instrument timbre available in SAMPLE_CONFIGS.  This keeps the
 * palette free of synthesised textures, as required, while leaving a
 * clear upgrade path documented in SAMPLE_SOURCES.md.
 */
export const INSTRUMENT_PALETTE: InstrumentPaletteEntry[] = [
  {
    key: 'piano',
    name: 'Piano',
    sampleKey: 'piano',
    duration: 1.4,
    velocityRange: { min: 0.35, max: 1.0 },
    brightnessBoostHz: 1500,
    source: 'Salamander Grand Piano V3 (CC-BY 3.0, Alexander Holm)',
  },
  {
    key: 'electricPiano',
    name: 'Electric Piano',
    // Substitute: organ samples — until a Rhodes/Wurlitzer sample set is
    // sourced, organ is the closest sampled keyboard timbre in the bundle.
    sampleKey: 'organ',
    duration: 1.6,
    velocityRange: { min: 0.45, max: 1.0 },
    brightnessBoostHz: 2500,
    source: 'nbrosowsky/tonejs-instruments (organ, CC-BY-SA 3.0)',
    notes:
      'Substitute: organ samples standing in for electric piano until ' +
      'true Rhodes/Wurlitzer samples are sourced. See SAMPLE_SOURCES.md.',
  },
  {
    key: 'bass',
    name: 'Electric Bass',
    sampleKey: 'bassElectric',
    duration: 0.7,
    velocityRange: { min: 0.4, max: 0.85 },
    brightnessBoostHz: 1800,
    source: 'nbrosowsky/tonejs-instruments (bass-electric, CC-BY 3.0)',
    notes:
      'Multi-note sampled electric bass (local). Replaces the single-note ' +
      'pitch-shifted contrabass.',
  },
  {
    key: 'strings',
    name: 'Strings',
    // Cello sustains, sits in a friendly range, and has 3 sample octaves
    // (A2/A3/A4), so pitch-shifting artefacts stay mild.
    sampleKey: 'cello',
    duration: 2.5,
    velocityRange: { min: 0.4, max: 0.95 },
    brightnessBoostHz: 2200,
    source: 'nbrosowsky/tonejs-instruments (cello, CC-BY-SA 3.0)',
  },
  {
    key: 'percussion',
    name: 'Plucked Percussion',
    // Substitute: nylon-guitar plucks. Until a true sampled percussion
    // kit (congas / cajón / brushed kit) is sourced, the nylon guitar's
    // tight attack and short sustain gives a percussive feel without
    // synthesising it.
    sampleKey: 'guitarNylon',
    duration: 0.45,
    velocityRange: { min: 0.4, max: 0.95 },
    brightnessBoostHz: 2000,
    source: 'nbrosowsky/tonejs-instruments (guitar-nylon, CC-BY-SA 3.0)',
    notes:
      'Substitute: nylon-guitar plucks standing in for percussion until ' +
      'a sampled congas / clean-kit set is sourced. See SAMPLE_SOURCES.md.',
  },
];

/** Map of palette entries by key, for O(1) lookup. */
export const INSTRUMENT_PALETTE_BY_KEY: Record<string, InstrumentPaletteEntry> =
  Object.fromEntries(INSTRUMENT_PALETTE.map((entry) => [entry.key, entry]));

/** Default palette entry used when a profile hasn't picked one. */
export const DEFAULT_INSTRUMENT_KEY = 'piano';

/** Convenience list for dropdowns. */
export const INSTRUMENT_PALETTE_LIST: { key: string; name: string }[] =
  INSTRUMENT_PALETTE.map(({ key, name }) => ({ key, name }));

/** Look up a palette entry by key, falling back to the default. */
export function getInstrumentEntry(key: string): InstrumentPaletteEntry {
  return INSTRUMENT_PALETTE_BY_KEY[key] ?? INSTRUMENT_PALETTE_BY_KEY[DEFAULT_INSTRUMENT_KEY];
}
