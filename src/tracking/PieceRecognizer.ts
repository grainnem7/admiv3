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
  /**
   * The cell was occupied on the previous frame. A counter that is already there needs
   * less to stay than a new one needs to arrive (hysteresis), so a counter hovering near
   * the threshold doesn't flicker on and off.
   */
  wasOccupied?: boolean;
}

/** A counter already present stays until it falls below this share of the arrival threshold. */
export const STAY_FRACTION = 0.6;

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
    const min = sample.wasOccupied ? this.minFilledFraction * STAY_FRACTION : this.minFilledFraction;
    return { occupied: sample.filledFraction >= min, colour: null };
  }
}

/**
 * Level 2 (multi-colour): every colour whose fraction clears the threshold, the STRONGEST
 * first — the evidence decides, not the list order (an orange counter whose rim also
 * passes for red reads orange). Priority only settles a near-tie, where vivid hues win
 * over the achromatic fallbacks (a blue piece on a dark square reads blue, not black).
 * Colours not in use simply don't appear in `priority`/`fractions`.
 */
export class ColourRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'colour';
  constructor(
    private readonly minFilledFraction: number,
    private readonly priority: ColourId[],
    /** The black and white colours: a vivid counter's dark rim must not out-vote it. */
    private readonly achromatic: ReadonlySet<ColourId> = new Set(['black', 'white']),
  ) {}
  classify(sample: CellSample): CellClassification {
    const min = sample.wasOccupied ? this.minFilledFraction * STAY_FRACTION : this.minFilledFraction;
    // Every colour that clears the threshold. The first is what the cell plays; the rest
    // let "two counters in a box" mean both of them.
    const colours: ColourId[] = [];
    for (const id of this.priority) {
      if ((sample.fractions[id] ?? 0) >= min) colours.push(id);
    }
    if (colours.length === 0) return { occupied: false, colour: null };
    // Vivid colours before black and white (a blue counter's shadowed rim reads black);
    // within each group the strongest first, and within 15% of each other priority stands.
    const rank = new Map(this.priority.map((id, i) => [id, i]));
    colours.sort((a, b) => {
      const ga = this.achromatic.has(a) ? 1 : 0;
      const gb = this.achromatic.has(b) ? 1 : 0;
      if (ga !== gb) return ga - gb;
      const fa = sample.fractions[a] ?? 0;
      const fb = sample.fractions[b] ?? 0;
      if (Math.abs(fa - fb) > 0.15 * Math.max(fa, fb)) return fb - fa;
      return (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    });
    return { occupied: true, colour: colours[0], colours };
  }
}
