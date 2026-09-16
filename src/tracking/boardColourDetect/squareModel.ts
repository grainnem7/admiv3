/**
 * What the board itself looks like, square by square.
 *
 * Calibrating a colour by tapping a counter builds a band that is never checked against
 * the board — and in research those bands lit 50–100% of the empty squares on walnut and
 * maple. Knowing the board's own colours is what lets a detected band be *tested* before
 * it is offered: a colour that matches the wood is caught here rather than in the middle
 * of a session.
 */
import { applyHomography, type Mat3 } from '../../utils/homography';
import { rgbToHsv } from '../ColorTracker';

/** Pixels per square in the warped board image. Enough to find a counter, cheap to make. */
export const PIXELS_PER_SQUARE = 12;

export interface WarpedBoard {
  data: Uint8ClampedArray;
  /** Squares per side, so callers can map a pixel back to a square. */
  squares: number;
  size: number;
}

/**
 * Sample the board through the homography into a square, head-on image, so every square
 * is the same size whatever angle the camera sits at.
 */
export function warpToBoard(
  rgba: Uint8ClampedArray, width: number, height: number, h: Mat3, squares: number,
  frameScale = 1, pixelsPerSquare = PIXELS_PER_SQUARE,
): WarpedBoard {
  const size = squares * pixelsPerSquare;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = applyHomography(h, { x: (x + 0.5) / size, y: (y + 0.5) / size });
      const sx = Math.round(p.x / frameScale);
      const sy = Math.round(p.y / frameScale);
      const o = (y * size + x) * 4;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) { out[o + 3] = 0; continue; }
      const i = (sy * width + sx) * 4;
      out[o] = rgba[i];
      out[o + 1] = rgba[i + 1];
      out[o + 2] = rgba[i + 2];
      out[o + 3] = 255;
    }
  }
  return { data: out, squares, size };
}

export interface SquareModel {
  squares: number;
  /** Median RGB per square, in row-major order. */
  rgb: Float32Array;
  /** The lighter and darker families, for the plain-language warnings. */
  light: { r: number; g: number; b: number };
  dark: { r: number; g: number; b: number };
  /**
   * 1 where a square is covered by something that isn't board. A square hidden under a
   * counter has the COUNTER as its median, so without this the counter would be learnt
   * as part of the board and then never detected.
   */
  covered: Uint8Array;
}

export type SquareModelResult =
  | { ok: true; model: SquareModel }
  | { ok: false; reason: 'board-too-covered' };

/** A square is ignored when this much of it differs from its own median. */
export const COVERED_SQUARE_SHARE = 0.55;
/** Too many covered squares and there is no board left to model. */
export const MAX_COVERED_SHARE = 0.5;
/**
 * The two families of square must differ by at least this much in brightness. A board
 * hidden under one large flat object has no such structure, and every square's own
 * median is that object — so without this check the "board" would be the object.
 */
export const MIN_SQUARE_CONTRAST = 12;
/** A square whose colour is this far from both families is not board at all. */
export const OUTLIER_DELTA = 110;

/**
 * Build the model from a warped board. Counters are allowed: each square's median is
 * robust to a disc sitting on part of it, and a square that is mostly covered is left
 * out — but if most of the board is covered there is nothing to learn, and it says so.
 */
export function buildSquareModel(warped: WarpedBoard): SquareModelResult {
  const { squares, size, data } = warped;
  const per = size / squares;
  const rgb = new Float32Array(squares * squares * 3);
  const greys: { grey: number; index: number }[] = [];
  let covered = 0;

  for (let sq = 0; sq < squares * squares; sq++) {
    const row = Math.floor(sq / squares);
    const col = sq % squares;
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    // Skip the outer ring of each square: that is where a neighbouring square bleeds in.
    const inset = Math.max(1, Math.round(per * 0.2));
    for (let y = Math.round(row * per) + inset; y < Math.round((row + 1) * per) - inset; y++) {
      for (let x = Math.round(col * per) + inset; x < Math.round((col + 1) * per) - inset; x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] === 0) continue;
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
      }
    }
    if (rs.length === 0) { covered++; continue; }
    const mr = median(rs);
    const mg = median(gs);
    const mb = median(bs);
    rgb[sq * 3] = mr;
    rgb[sq * 3 + 1] = mg;
    rgb[sq * 3 + 2] = mb;
    // A square covered by a counter has most of its pixels far from its own median.
    const far = rs.filter((_, i) =>
      Math.abs(rs[i] - mr) + Math.abs(gs[i] - mg) + Math.abs(bs[i] - mb) > 90).length;
    if (far / rs.length > COVERED_SQUARE_SHARE) covered++;
    else greys.push({ grey: (mr + mg + mb) / 3, index: sq });
  }

  if (greys.length === 0 || covered / (squares * squares) > MAX_COVERED_SHARE) {
    return { ok: false, reason: 'board-too-covered' };
  }

  // The two families of square, from the darker and lighter halves of what is visible.
  greys.sort((a, b) => a.grey - b.grey);
  const half = Math.max(1, Math.floor(greys.length / 2));
  const meanOf = (entries: { index: number }[]): { r: number; g: number; b: number } => {
    let r = 0; let g = 0; let b = 0;
    for (const e of entries) {
      r += rgb[e.index * 3]; g += rgb[e.index * 3 + 1]; b += rgb[e.index * 3 + 2];
    }
    return { r: r / entries.length, g: g / entries.length, b: b / entries.length };
  };
  // First guess at the two families, from the medians as they stand.
  let dark = meanOf(greys.slice(0, half));
  let light = meanOf(greys.slice(-half));

  // Then drop the squares that look like neither: those are counters, not board. The
  // guess above is robust enough to spot them because most squares are still empty.
  const coveredFlags = new Uint8Array(squares * squares);
  const far = (sq: number, fam: { r: number; g: number; b: number }): number =>
    Math.abs(rgb[sq * 3] - fam.r) + Math.abs(rgb[sq * 3 + 1] - fam.g) + Math.abs(rgb[sq * 3 + 2] - fam.b);
  const kept = greys.filter((e) => {
    const outlier = far(e.index, light) > OUTLIER_DELTA && far(e.index, dark) > OUTLIER_DELTA;
    if (outlier) coveredFlags[e.index] = 1;
    return !outlier;
  });
  if (kept.length >= 2) {
    const keptHalf = Math.max(1, Math.floor(kept.length / 2));
    dark = meanOf(kept.slice(0, keptHalf));
    light = meanOf(kept.slice(-keptHalf));
  }
  for (let sq = 0; sq < squares * squares; sq++) {
    if (!greys.some((e) => e.index === sq)) coveredFlags[sq] = 1;
  }

  const contrast = (light.r + light.g + light.b) / 3 - (dark.r + dark.g + dark.b) / 3;
  if (contrast < MIN_SQUARE_CONTRAST) return { ok: false, reason: 'board-too-covered' };
  const coveredCount = coveredFlags.reduce((a: number, v) => a + v, 0);
  if (coveredCount / (squares * squares) > MAX_COVERED_SHARE) {
    return { ok: false, reason: 'board-too-covered' };
  }

  return { ok: true, model: { squares, rgb, dark, light, covered: coveredFlags } };
}

/** Every square's colour as HSV, for testing a candidate band against the board. */
export function modelHsv(model: SquareModel): { h: number; s: number; v: number }[] {
  const out: { h: number; s: number; v: number }[] = [];
  for (let sq = 0; sq < model.squares * model.squares; sq++) {
    // A covered square's colour is a counter's, not the board's: it must not be part of
    // the board check, or the counter's own band would look unsafe.
    if (model.covered[sq]) continue;
    const r = model.rgb[sq * 3];
    const g = model.rgb[sq * 3 + 1];
    const b = model.rgb[sq * 3 + 2];
    if (r === 0 && g === 0 && b === 0) continue;
    out.push(rgbToHsv(r, g, b));
  }
  return out;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
