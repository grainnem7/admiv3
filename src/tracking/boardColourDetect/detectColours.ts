/**
 * Find the counter colours, and check each one against the board.
 *
 * The important half of this is the checking. A band fitted to a tapped pixel can light
 * half the empty squares on a wooden board, and the player only finds out when the music
 * fills with notes nobody played. Here every candidate band is tested against the board's
 * own squares, tightened if it matches them, and reported as unsafe if it still does.
 */
import { rgbToHsv } from '../ColorTracker';
import {
  buildChannelMatcher, calibrationFromHsv, classifyCounterKind,
  type ColourChannel, type ColourKind,
} from '../boardColours';
import { modelHsv, type SquareModel, type WarpedBoard } from './squareModel';

/** A pixel must differ from its square's own colour by this much to be part of a counter. */
export const COUNTER_DELTA = 90;
/**
 * How much of a square must differ before it counts as having something ON it.
 *
 * Derived, not picked, and it has to clear a wide gap from both sides.
 *
 * The sampled region is the square inset by 15% a side. How much of it a counter covers
 * depends on how big the counters are RELATIVE TO THE SQUARES, which varies by set: the
 * code's assumed 0.45 of a square gives about 95% of that region, while a smaller counter
 * on a bigger square — measured at about 0.28 on the research board — gives about 59%,
 * and roughly 30% when it sits off-centre.
 *
 * Grain, a shadow edge, or the board having shifted a hair since it was learnt reach a
 * few percent. So the bar wants to sit well above those and below a counter that is only
 * half on its square: a fifth of the square does both.
 *
 * It was 0.05 — about 97 pixels of the 1936 sampled — which an empty walnut board clears
 * without difficulty, which is why "Find colours" offered counters on a bare board. 0.35
 * cured that but then missed the off-centre counters on the same board.
 */
export const MIN_BLOB_SQUARES = 0.22;
/**
 * Counters whose hues are closer than this are the same colour.
 *
 * Detection bands span about 24 degrees either side of their hue, so two counters closer
 * than this would produce overlapping bands and could not be told apart at play time
 * anyway — grouping them here at least says so honestly, instead of offering two colours
 * that fight over the same counters.
 */
export const MERGE_HUE = 15;
/** …and for whites, greys and blacks, which have no hue: how far apart in lightness. */
export const MERGE_VALUE = 22;
/** A band may match at most this share of the board's squares. */
export const MAX_BOARD_MATCH = 0.02;

export interface DetectedColour {
  /** Mean colour of the counters found, as a hex swatch. */
  swatch: string;
  kind: ColourKind;
  hsv: { h: number; s: number; v: number };
  /** How many separate counters of this colour were seen. */
  counters: number;
  /** Share of the board's squares this band would light: 0 is what we want. */
  boardMatch: number;
  /** True when the band could not be made safe — offered with the job preset to Off. */
  unsafe: boolean;
  /**
   * The squares this colour was found on.
   *
   * Without it, "3 counters" under one swatch is unarguable and unfixable: the player
   * cannot tell WHICH three were run together, so they cannot tell whether the answer is
   * wrong or their counters really are that similar.
   */
  squares: { row: number; col: number }[];
  band: ReturnType<typeof calibrationFromHsv>;
}

export type ColourDetection =
  | { ok: true; colours: DetectedColour[]; blobs: number }
  | { ok: false; reason: 'board-too-covered' | 'nothing-found' };

interface Blob {
  r: number;
  g: number;
  b: number;
  pixels: number;
  /** Which square it was found on, so a proposal can be pointed at on the board. */
  row: number;
  col: number;
}

/**
 * Detect the counter colours on a warped board, given what the empty board looks like.
 * `oneEach` skips the merge step, for "Try again (one colour per counter)".
 */
export function detectColours(
  warped: WarpedBoard, model: SquareModel,
  opts: {
    oneEach?: boolean;
    boardColours?: { h: number; s: number; v: number }[];
    /** This board's squares as learnt with nothing on it, in board order, 3 values each. */
    learntSquares?: { squares: number; rgb: number[] };
  } = {},
): ColourDetection {
  const { size, squares, data } = warped;
  const per = size / squares;

  // What each empty square looks like. If this board has been LEARNT, use the square's
  // own recorded appearance; otherwise fall back to the model inferred from this frame.
  //
  // The difference is the whole game on a grainy board. Inferring from one frame means
  // judging each square against the average of its colour family, so a dark square with
  // unusual grain, or one lying in a shadow, reads as "not like the others" and is
  // offered as a counter — which is why an EMPTY board could still produce seven of them.
  // Judged against its own learnt appearance, that square's grain is simply part of what
  // it looks like, and only something actually placed on it can stand out.
  const learnt = opts.learntSquares?.squares === squares
    && opts.learntSquares.rgb.length >= squares * squares * 3
    ? opts.learntSquares.rgb
    : null;

  // A counter is whatever doesn't look like the square it is sitting on.
  const blobs: Blob[] = [];
  for (let sq = 0; sq < squares * squares; sq++) {
    const row = Math.floor(sq / squares);
    const col = sq % squares;
    const mr = learnt ? learnt[sq * 3] : model.rgb[sq * 3];
    const mg = learnt ? learnt[sq * 3 + 1] : model.rgb[sq * 3 + 1];
    const mb = learnt ? learnt[sq * 3 + 2] : model.rgb[sq * 3 + 2];
    // A square the model marked as covered IS a counter: its median is the counter's
    // colour, which is exactly what we want to cluster. Only trusted when there is no
    // learnt board — with one, the pixel test below is both stricter and better founded.
    if (!learnt && model.covered[sq]) {
      blobs.push({ r: mr, g: mg, b: mb, pixels: Math.round(per * per), row, col });
      continue;
    }
    let r = 0; let g = 0; let b = 0; let n = 0;
    const inset = Math.max(1, Math.round(per * 0.15));
    for (let y = Math.round(row * per) + inset; y < Math.round((row + 1) * per) - inset; y++) {
      for (let x = Math.round(col * per) + inset; x < Math.round((col + 1) * per) - inset; x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] === 0) continue;
        const delta = Math.abs(data[i] - mr) + Math.abs(data[i + 1] - mg) + Math.abs(data[i + 2] - mb);
        if (delta < COUNTER_DELTA) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    const area = Math.max(1, (per - 2 * Math.max(1, Math.round(per * 0.15))) ** 2);
    if (n / area < MIN_BLOB_SQUARES) continue;
    blobs.push({ r: r / n, g: g / n, b: b / n, pixels: n, row, col });
  }
  if (blobs.length === 0) return { ok: false, reason: 'nothing-found' };

  const clusters = opts.oneEach ? blobs.map((b) => [b]) : cluster(blobs);
  // Board colours learnt earlier, from a board with nothing on it, are far better
  // evidence than anything inferred from a frame that has counters all over it: there,
  // "which squares are board?" is itself a guess, and a square the guess gets wrong
  // becomes a counter colour that lights up bare wood. Fall back when we have none.
  const boardColours = opts.boardColours?.length ? opts.boardColours : modelHsv(model);

  const colours = clusters.map((group) => {
    const weight = group.reduce((s, b) => s + b.pixels, 0);
    const r = group.reduce((s, b) => s + b.r * b.pixels, 0) / weight;
    const g = group.reduce((s, b) => s + b.g * b.pixels, 0) / weight;
    const b = group.reduce((s, b2) => s + b2.b * b2.pixels, 0) / weight;
    const hsv = rgbToHsv(r, g, b);
    const fitted = fitSafeBand(hsv, boardColours);
    const squares = group.map((bl) => ({ row: bl.row, col: bl.col }));
    return {
      swatch: hex(r, g, b),
      kind: classifyCounterKind(hsv),
      hsv,
      counters: group.length,
      squares,
      boardMatch: fitted.boardMatch,
      unsafe: fitted.unsafe,
      band: fitted.band,
    };
  });

  return { ok: true, colours: colours.sort((a, b) => b.counters - a.counters), blobs: blobs.length };
}

/**
 * Fit a band for this colour, then tighten it until it stops matching the board. If it
 * cannot be made safe, say so rather than handing over a band that lights the wood.
 */
export function fitSafeBand(
  hsv: { h: number; s: number; v: number }, boardColours: { h: number; s: number; v: number }[],
): { band: ReturnType<typeof calibrationFromHsv>; boardMatch: number; unsafe: boolean } {
  let band = calibrationFromHsv(hsv);
  let boardMatch = matchShare(band, boardColours);

  /** A band is only useful while it still recognises the counter it was sampled from. */
  const stillFindsIt = (candidate: typeof band): boolean => buildChannelMatcher({
    id: 'candidate', kind: candidate.kind, role: 'off', swatch: '#000',
    band: candidate.band, blackBand: candidate.blackBand, whiteBand: candidate.whiteBand,
  }).test(hsv);

  /** Take a tightening step only if it keeps the counter. Returns false when it can't. */
  const step = (next: typeof band): boolean => {
    if (!stillFindsIt(next)) return false;
    band = next;
    boardMatch = matchShare(band, boardColours);
    return true;
  };

  // Each pass narrows the hue window and lifts the saturation floor: the two things that
  // let a warm counter colour spill onto warm wood. Tightening stops at the counter's own
  // colour — narrowing past that produced a band matching NOTHING, which read as "safe"
  // and then never detected the counter at all.
  for (let pass = 0; pass < 4 && boardMatch > MAX_BOARD_MATCH; pass++) {
    if (!band.band) break;                       // black/white bands are tightened below
    if (!step({
      ...band,
      band: {
        ...band.band,
        hueTolerance: Math.max(6, band.band.hueTolerance * 0.7),
        minSaturation: Math.min(90, band.band.minSaturation * 1.25 + 4),
      },
    })) break;
  }
  for (let pass = 0; pass < 4 && boardMatch > MAX_BOARD_MATCH; pass++) {
    if (band.blackBand) {
      if (!step({ ...band, blackBand: { ...band.blackBand, maxValue: band.blackBand.maxValue * 0.8 } })) break;
    } else if (band.whiteBand) {
      if (!step({
        ...band, whiteBand: { ...band.whiteBand, minValue: Math.min(98, band.whiteBand.minValue * 1.1) },
      })) break;
    } else break;
  }
  return { band, boardMatch, unsafe: boardMatch > MAX_BOARD_MATCH };
}

function matchShare(
  band: ReturnType<typeof calibrationFromHsv>, boardColours: { h: number; s: number; v: number }[],
): number {
  // Nothing to compare against is not proof of safety. This check exists to stop the
  // board's own colour being offered as a counter, so with no board model it has to say
  // "can't tell" — which is 1, not 0.
  if (boardColours.length === 0) return 1;
  const channel: ColourChannel = {
    id: 'candidate', kind: band.kind, role: 'off', swatch: '#000',
    band: band.band, blackBand: band.blackBand, whiteBand: band.whiteBand,
  };
  const matcher = buildChannelMatcher(channel);
  const hits = boardColours.filter((c) => matcher.test(c)).length;
  return hits / boardColours.length;
}

/** Group blobs whose colours are close enough to be the same counter colour. */
/** Shortest way round the hue circle, in degrees. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Group the blobs into counter colours.
 *
 * Two rules, and both exist because of a specific way the old one failed.
 *
 * FIRST, colours are compared by HUE, not by distance in RGB. RGB distance treats "a bit
 * darker" the same as "a different colour", which is backwards for this job: the same
 * counter in shadow must group, and two different counters must not. Hue is also what the
 * detection bands themselves are built on, so grouping this way asks the same question
 * the matching will later ask. Whites, greys and blacks have no meaningful hue, so they
 * are grouped by being achromatic instead.
 *
 * SECOND, a blob must be close to EVERY member of a group, not to the group's average.
 * Comparing against a running mean lets it drift: orange pulls the mean, pink then fits
 * the drifted mean, and yellow fits it after that — so yellow and pink end up sharing a
 * colour despite being nothing like each other. That is exactly what happened on the
 * research board: yellow, orange and pink came back as one.
 */
function cluster(blobs: Blob[]): Blob[][] {
  const groups: { blobs: Blob[]; hsv: { h: number; s: number; v: number }[] }[] = [];
  for (const blob of blobs) {
    const hsv = rgbToHsv(blob.r, blob.g, blob.b);
    const kind = classifyCounterKind(hsv);
    const found = groups.find((group) => group.hsv.every((other) => {
      const otherKind = classifyCounterKind(other);
      if (kind !== otherKind) return false;
      // Achromatic counters have no hue to compare; tell them apart by lightness.
      if (kind !== 'hue') return Math.abs(other.v - hsv.v) < MERGE_VALUE;
      return hueGap(other.h, hsv.h) < MERGE_HUE;
    }));
    if (found) { found.blobs.push(blob); found.hsv.push(hsv); }
    else groups.push({ blobs: [blob], hsv: [hsv] });
  }
  return groups.map((g) => g.blobs);
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
