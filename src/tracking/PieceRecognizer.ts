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

import type { ColourId } from './boardColours';

export type RecognitionLevel = 'occupancy' | 'colour' | 'identity';

export interface CellSample {
  /** Fraction of sampled pixels that are "occupied" (the max over all colours). */
  filledFraction: number;
  /** Fraction of sampled pixels matching each colour id. */
  fractions: Partial<Record<ColourId, number>>;
}

export interface CellClassification {
  /** Every colour above the threshold, in priority order (the first is `colour`). */
  colours?: ColourId[];
  occupied: boolean;
  colour: ColourId | null;
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

/**
 * Level 2 (multi-colour): classify a cell as the first colour in `priority`
 * whose fraction clears the threshold. Priority order means vivid hues win over
 * the achromatic fallbacks (a blue piece on a dark square reads blue, not
 * black). Colours not in use simply don't appear in `priority`/`fractions`.
 */
export class ColourRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'colour';
  constructor(
    private readonly minFilledFraction: number,
    private readonly priority: ColourId[],
  ) {}
  classify(sample: CellSample): CellClassification {
    const min = this.minFilledFraction;
    // Every colour that clears the threshold, in priority order. The first is what the
    // cell plays today; the rest let "two counters in a box" mean both of them.
    const colours: ColourId[] = [];
    for (const id of this.priority) {
      if ((sample.fractions[id] ?? 0) >= min) colours.push(id);
    }
    if (colours.length === 0) return { occupied: false, colour: null };
    return { occupied: true, colour: colours[0], colours };
  }
}
