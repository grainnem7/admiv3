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
/** Blobs smaller than this share of a square are noise, not counters. */
export const MIN_BLOB_SQUARES = 0.05;
/** Two colours closer than this (in RGB distance) are the same counter colour. */
export const MERGE_DISTANCE = 60;
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
}

/**
 * Detect the counter colours on a warped board, given what the empty board looks like.
 * `oneEach` skips the merge step, for "Try again (one colour per counter)".
 */
export function detectColours(
  warped: WarpedBoard, model: SquareModel, opts: { oneEach?: boolean } = {},
): ColourDetection {
  const { size, squares, data } = warped;
  const per = size / squares;

  // A counter is whatever doesn't look like the square it is sitting on.
  const blobs: Blob[] = [];
  for (let sq = 0; sq < squares * squares; sq++) {
    const row = Math.floor(sq / squares);
    const col = sq % squares;
    const mr = model.rgb[sq * 3];
    const mg = model.rgb[sq * 3 + 1];
    const mb = model.rgb[sq * 3 + 2];
    // A square the model marked as covered IS a counter: its median is the counter's
    // colour, which is exactly what we want to cluster.
    if (model.covered[sq]) {
      blobs.push({ r: mr, g: mg, b: mb, pixels: Math.round(per * per) });
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
    blobs.push({ r: r / n, g: g / n, b: b / n, pixels: n });
  }
  if (blobs.length === 0) return { ok: false, reason: 'nothing-found' };

  const clusters = opts.oneEach ? blobs.map((b) => [b]) : cluster(blobs);
  const boardColours = modelHsv(model);

  const colours = clusters.map((group) => {
    const weight = group.reduce((s, b) => s + b.pixels, 0);
    const r = group.reduce((s, b) => s + b.r * b.pixels, 0) / weight;
    const g = group.reduce((s, b) => s + b.g * b.pixels, 0) / weight;
    const b = group.reduce((s, b2) => s + b2.b * b2.pixels, 0) / weight;
    const hsv = rgbToHsv(r, g, b);
    const fitted = fitSafeBand(hsv, boardColours);
    return {
      swatch: hex(r, g, b),
      kind: classifyCounterKind(hsv),
      hsv,
      counters: group.length,
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
function cluster(blobs: Blob[]): Blob[][] {
  const groups: Blob[][] = [];
  for (const blob of blobs) {
    const found = groups.find((group) => {
      const r = group.reduce((s, b) => s + b.r, 0) / group.length;
      const g = group.reduce((s, b) => s + b.g, 0) / group.length;
      const b = group.reduce((s, x) => s + x.b, 0) / group.length;
      return Math.hypot(blob.r - r, blob.g - g, blob.b - b) < MERGE_DISTANCE;
    });
    if (found) found.push(blob);
    else groups.push([blob]);
  }
  return groups;
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
