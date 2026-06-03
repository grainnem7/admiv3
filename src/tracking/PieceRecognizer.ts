/**
 * Recognition dial for a warped board cell crop.
 *
 *   Level 1 OCCUPANCY — filled or empty (implemented).
 *   Level 2 COLOUR    — red now (implemented); black documented below.
 *   Level 3 IDENTITY  — Scrabble letters (future; documented insertion point only).
 *
 * The camera-facing BoardReader produces a CellSample (fractions); the
 * recognizer turns it into a CellClassification. Swapping the recognizer
 * changes the recognition level without touching the slide-and-settle core.
 */

export type RecognitionLevel = 'occupancy' | 'colour' | 'identity';

export interface CellSample {
  /** Fraction of sampled pixels that are "occupied" (here: same as redFraction for red-only). */
  filledFraction: number;
  /** Fraction of sampled pixels matching the calibrated red band. */
  redFraction: number;
  /** Fraction of sampled pixels matching the dark/achromatic "black" test. */
  blackFraction?: number;
  /** Fraction of sampled pixels matching the calibrated blue band. */
  blueFraction?: number;
}

export interface CellClassification {
  occupied: boolean;
  colour: 'red' | 'black' | 'blue' | null;
  /** LEVEL 3 (future): Scrabble-letter identity. Never set today. */
  identity?: string;
}

export interface PieceRecognizer {
  readonly level: RecognitionLevel;
  classify(sample: CellSample): CellClassification;
}

/** Level 1: occupancy only. */
export class OccupancyRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'occupancy';
  constructor(private readonly minFilledFraction: number) {}
  classify(sample: CellSample): CellClassification {
    return { occupied: sample.filledFraction >= this.minFilledFraction, colour: null };
  }
}

/** Level 2: red colour. */
export class RedColourRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'colour';
  constructor(private readonly minFilledFraction: number) {}
  classify(sample: CellSample): CellClassification {
    const occupied = sample.filledFraction >= this.minFilledFraction;
    const colour: CellClassification['colour'] =
      occupied && sample.redFraction >= this.minFilledFraction ? 'red' : null;
    // LEVEL 2 (future, black): add a low-value/low-saturation test on a
    // separate blackFraction → colour: 'black'. Out of scope now.
    // LEVEL 3 (future, identity): OCR the cell crop → classification.identity.
    return { occupied, colour };
  }
}

/**
 * Level 2 (multi-colour): classify a cell as whichever of red / blue / black
 * dominates the sample, provided it clears the threshold. Ties resolve red →
 * blue → black. Colours that aren't being detected arrive as 0 and are ignored.
 * Drives the colour→role mapping (red = melody, blue = bass, black = drums).
 */
export class ColourRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'colour';
  constructor(private readonly minFilledFraction: number) {}
  classify(sample: CellSample): CellClassification {
    const r = sample.redFraction;
    const bl = sample.blueFraction ?? 0;
    const k = sample.blackFraction ?? 0;
    const max = Math.max(r, bl, k);
    if (max < this.minFilledFraction) return { occupied: false, colour: null };
    if (r === max) return { occupied: true, colour: 'red' };
    if (bl === max) return { occupied: true, colour: 'blue' };
    return { occupied: true, colour: 'black' };
  }
}

/**
 * Colour → default instrument palette key. The board's per-row mapping usually
 * overrides this, but it documents the seam: a colour can select a sound.
 */
export const COLOUR_INSTRUMENT: Partial<Record<'red' | 'black', string>> = {
  red: 'electricPiano',
};
