/**
 * BoardReader — turns the live video into a per-cell board matrix.
 *
 * For each cell we map a lightly-inset region covering almost the whole cell
 * (grid→image via the homography), sample a NxN dot pattern from a downscaled
 * canvas, and count
 * pixels matching the calibrated red band. Reuses ColorTracker's HSV maths and
 * red/skin-tone exclusion. The pure pixel maths lives in sampleRegion() so it
 * is unit-testable without a DOM.
 */

import type { Mat3 } from '../utils/homography';
import { applyHomography } from '../utils/homography';
import { rgbToHsv } from './ColorTracker';
import { alphaForDt, REFERENCE_FRAME_MS } from '../utils/timeConstant';
import type { ColourId, ColourMatcher } from './boardColours';
import type { CellReading } from './BoardSequencerMode';
import type { PieceRecognizer } from './PieceRecognizer';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Returns the RGB at integer image pixel (x, y). */
export type RgbSampler = (x: number, y: number) => Rgb;

export interface RegionSample {
  /** Fraction of sampled pixels matching each colour id (priority-first match). */
  fractions: Partial<Record<ColourId, number>>;
  /** The colour id with the most matching pixels (ties → earliest in priority), or null. */
  dominantId: ColourId | null;
  /** Mean position of the DOMINANT colour's matching pixels (unit-square coords), or null. */
  centroid: { x: number; y: number } | null;
  /**
   * Normalised box-offset of the centroid from the cell centre: 0 = dead centre,
   * 1 = at the cell edge (max over the two axes, so a shove toward any edge or
   * corner counts). null when there is no centroid. The reachable max is bounded
   * by INSET (sampling stops short of the true edge), so in practice ≲ 0.9.
   */
  offset: number | null;
}

// Sample almost the whole cell (not just the centre) so a piece sitting
// anywhere within a cell registers — not only when it's bang in the middle.
// Important when the grid is coarser than the physical squares (e.g. a 4x4 grid
// over an 8x8 board). The small remaining margin (~5% per side) is the only
// guard against a piece bleeding into its neighbour cell. Tolerance over precision.
const INSET = 0.9;

/** Precompute a cell's sample lattice ([ux, uy, imgX, imgY] per sample), once per homography. */
export function buildCellLattice(h: Mat3, row: number, col: number, rows: number, cols: number, samplesPerAxis: number): Float64Array {
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const x0 = col * cellW + cellW * (1 - INSET) / 2;
  const y0 = row * cellH + cellH * (1 - INSET) / 2;
  const stepX = (cellW * INSET) / Math.max(samplesPerAxis - 1, 1);
  const stepY = (cellH * INSET) / Math.max(samplesPerAxis - 1, 1);
  const out = new Float64Array(samplesPerAxis * samplesPerAxis * 4);
  let k = 0;
  for (let iy = 0; iy < samplesPerAxis; iy++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const ux = x0 + ix * stepX;
      const uy = y0 + iy * stepY;
      const img = applyHomography(h, { x: ux, y: uy });
      out[k++] = ux;
      out[k++] = uy;
      out[k++] = Math.round(img.x);
      out[k++] = Math.round(img.y);
    }
  }
  return out;
}

/**
 * Sample the central region of cell (row, col) and return, for each supplied
 * colour matcher, the fraction of sampled pixels it matched, plus the dominant
 * colour and its centroid. `colours` is in PRIORITY order: each pixel is counted
 * for the FIRST matcher it satisfies, so vivid hues beat the achromatic
 * fallbacks. `samplesPerAxis` dots are taken on each axis.
 */
export function sampleRegion(
  sampler: RgbSampler,
  h: Mat3,
  row: number,
  col: number,
  rows: number,
  cols: number,
  colours: ColourMatcher[],
  samplesPerAxis: number,
  lattice?: Float64Array,
): RegionSample {
  const lat = lattice ?? buildCellLattice(h, row, col, rows, cols, samplesPerAxis);

  const counts = new Map<ColourId, number>();
  const sumX = new Map<ColourId, number>();
  const sumY = new Map<ColourId, number>();
  let total = 0;

  for (let k = 0; k < lat.length; k += 4) {
    const ux = lat[k];
    const uy = lat[k + 1];
    const { r, g, b } = sampler(lat[k + 2], lat[k + 3]);
    const hsv = rgbToHsv(r, g, b);
    total++;
    for (const m of colours) {
      if (m.test(hsv)) {
        counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
        sumX.set(m.id, (sumX.get(m.id) ?? 0) + ux);
        sumY.set(m.id, (sumY.get(m.id) ?? 0) + uy);
        break; // priority: first matching colour wins this pixel
      }
    }
  }

  const fractions: Partial<Record<ColourId, number>> = {};
  let dominantId: ColourId | null = null;
  let dominantCount = 0;
  // Walk in priority order so ties resolve to the earlier (more vivid) colour.
  for (const m of colours) {
    const c = counts.get(m.id) ?? 0;
    fractions[m.id] = total === 0 ? 0 : c / total;
    if (c > dominantCount) {
      dominantCount = c;
      dominantId = m.id;
    }
  }

  let centroid: { x: number; y: number } | null = null;
  let offset: number | null = null;
  if (dominantId && dominantCount > 0) {
    centroid = {
      x: (sumX.get(dominantId) ?? 0) / dominantCount,
      y: (sumY.get(dominantId) ?? 0) / dominantCount,
    };
    const cx = (col + 0.5) / cols;
    const cy = (row + 0.5) / rows;
    const ox = Math.abs(centroid.x - cx) / (0.5 / cols);
    const oy = Math.abs(centroid.y - cy) / (0.5 / rows);
    offset = Math.min(1, Math.max(ox, oy));
  }
  return { fractions, dominantId, centroid, offset };
}

/** Default per-cell temporal smoothing factor (EMA, per 60 Hz frame). Lower = steadier but laggier. */
const FRACTION_SMOOTHING = 0.4;

/**
 * Per-cell temporal smoothing of colour fractions. Blends the previous frame's
 * fractions toward the current frame by `alpha` (an EMA), so a single flickery
 * frame — a light flash, a passing shadow, camera gain hunting — can't flip a
 * cell's occupancy/colour on or off. `alpha` 1 = no smoothing (track the current
 * frame exactly); lower = steadier but laggier. Colours that fade below epsilon
 * are dropped so the map never accumulates stale keys. `prev` null/undefined
 * (first sighting of a cell) returns the current fractions unchanged.
 */
export function blendFractions(
  prev: Partial<Record<ColourId, number>> | null | undefined,
  cur: Partial<Record<ColourId, number>>,
  alpha: number,
): Partial<Record<ColourId, number>> {
  const EPS = 0.0005;
  const out: Partial<Record<ColourId, number>> = {};
  if (!prev) {
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'number' && v >= EPS) out[k as ColourId] = v;
    }
    return out;
  }
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(cur)]);
  for (const k of keys) {
    const p = prev[k as ColourId] ?? 0;
    const c = cur[k as ColourId] ?? 0;
    // alpha >= 1 is "no smoothing": pass the current value through exactly (the
    // general EMA form would drift by a float epsilon).
    const v = alpha >= 1 ? c : p + alpha * (c - p);
    if (v >= EPS) out[k as ColourId] = v;
  }
  return out;
}

export interface BoardReaderOptions {
  homography: Mat3;
  rows: number;
  cols: number;
  /** Colour matchers in PRIORITY order (vivid hues first, black/white last). */
  colours: ColourMatcher[];
  recognizer: PieceRecognizer;
  samplesPerAxis?: number;
  downscale?: number;
  /** Per-cell temporal smoothing 0..1 (EMA per 60 Hz frame; 1 = off). Default FRACTION_SMOOTHING. */
  smoothing?: number;
  /** Milliseconds since the previous processed camera frame (smoothing is time-based). */
  dtMs?: number;
  /**
   * Mirror the video on each axis when drawing to the sampling canvas, matching
   * the on-screen <video> display transform. Keeping the sampled pixels in the
   * SAME (possibly flipped) coordinate space as the displayed video means corner
   * clicks in displayed space map directly through the homography — no per-axis
   * flip in the homography. mirrorX = horizontal (selfie), mirrorY = vertical.
   */
  mirrorX?: boolean;
  mirrorY?: boolean;
}

/**
 * Reads the full board matrix from a video element each frame. Owns its own
 * canvas (willReadFrequently) like ColorTracker.
 */
export class BoardReader {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // Per-cell EMA of colour fractions (keyed "row,col") for temporal smoothing.
  private prevFractions = new Map<string, Partial<Record<ColourId, number>>>();
  private lattices: Float64Array[] = [];
  private latticeKey = '';
  private last: { data: Uint8ClampedArray; width: number; height: number; downscale: number } | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('BoardReader: 2D context unavailable');
    this.ctx = ctx;
  }

  /** The downscaled, orientation-corrected RGBA frame read last (for other per-frame guards). */
  lastFrame(): { data: Uint8ClampedArray; width: number; height: number; downscale: number } | null {
    return this.last;
  }

  read(video: HTMLVideoElement, opts: BoardReaderOptions): CellReading[] {
    const downscale = opts.downscale ?? 4;
    const samples = opts.samplesPerAxis ?? 5;
    const w = Math.max(1, Math.floor(video.videoWidth / downscale));
    const h = Math.max(1, Math.floor(video.videoHeight / downscale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.save();
    this.ctx.translate(opts.mirrorX ? w : 0, opts.mirrorY ? h : 0);
    this.ctx.scale(opts.mirrorX ? -1 : 1, opts.mirrorY ? -1 : 1);
    this.ctx.drawImage(video, 0, 0, w, h);
    this.ctx.restore();
    const data = this.ctx.getImageData(0, 0, w, h).data;
    this.last = { data, width: w, height: h, downscale };

    const latticeKey = `${opts.homography.join(',')}|${opts.rows}|${opts.cols}|${samples}`;
    if (latticeKey !== this.latticeKey) {
      this.lattices = [];
      for (let row = 0; row < opts.rows; row++) {
        for (let col = 0; col < opts.cols; col++) {
          this.lattices.push(buildCellLattice(opts.homography, row, col, opts.rows, opts.cols, samples));
        }
      }
      this.latticeKey = latticeKey;
    }
    const alpha = alphaForDt(opts.smoothing ?? FRACTION_SMOOTHING, opts.dtMs ?? REFERENCE_FRAME_MS);

    const sampler: RgbSampler = (x, y) => {
      const sx = Math.min(w - 1, Math.max(0, Math.round(x / downscale)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y / downscale)));
      const i = (sy * w + sx) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };

    const readings: CellReading[] = [];
    for (let row = 0; row < opts.rows; row++) {
      for (let col = 0; col < opts.cols; col++) {
        const { fractions, centroid, offset } = sampleRegion(
          sampler, opts.homography, row, col, opts.rows, opts.cols, opts.colours, samples,
          this.lattices[row * opts.cols + col],
        );
        // Temporal smoothing: blend this frame's fractions with the cell's history
        // so a single flickery frame can't flip its occupancy/colour on or off.
        const key = `${row},${col}`;
        const smoothed = blendFractions(
          this.prevFractions.get(key), fractions, alpha,
        );
        this.prevFractions.set(key, smoothed);
        const filledFraction = Math.max(0, ...Object.values(smoothed).filter((v): v is number => v !== undefined));
        const cls = opts.recognizer.classify({ filledFraction, fractions: smoothed });
        readings.push({
          row, col, occupied: cls.occupied, colour: cls.colour, centroid, fractions: smoothed, offset,
        });
      }
    }
    return readings;
  }
}
