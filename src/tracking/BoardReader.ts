/**
 * BoardReader — turns the live video into a per-cell board matrix.
 *
 * For each cell we map a small inset central region (grid→image via the
 * homography), sample a NxN dot pattern from a downscaled canvas, and count
 * pixels matching the calibrated red band. Reuses ColorTracker's HSV maths and
 * red/skin-tone exclusion. The pure pixel maths lives in sampleRegion() so it
 * is unit-testable without a DOM.
 */

import type { Mat3 } from '../utils/homography';
import { applyHomography } from '../utils/homography';
import type { TrackedColor } from './ColorTracker';
import { rgbToHsv, matchesTrackedColor, matchesBlack } from './ColorTracker';
import type { CellReading } from './BoardSequencerMode';
import type { PieceRecognizer } from './PieceRecognizer';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Returns the RGB at integer image pixel (x, y). */
export type RgbSampler = (x: number, y: number) => Rgb;

export interface BlackBand {
  maxValue: number;
  maxSaturation: number;
}

export interface RegionSample {
  redFraction: number;
  /** Fraction matching the dark/achromatic black test (0 when no black band given). */
  blackFraction: number;
  /** Fraction matching the blue band (0 when no blue band given). */
  blueFraction: number;
  /** Mean position of the DOMINANT colour's matching pixels (unit-square coords), or null. */
  centroid: { x: number; y: number } | null;
}

// Sample most of each cell (not just the centre) so a piece anywhere within a
// cell registers — important when the grid is coarser than the physical squares
// (e.g. a 4x4 grid over an 8x8 board). Tolerance over precision.
const INSET = 0.8;

/**
 * Sample the central region of cell (row, col) and return the red fraction +
 * unit-square centroid. `samplesPerAxis` dots are taken on each axis.
 */
export function sampleRegion(
  sampler: RgbSampler,
  h: Mat3,
  row: number,
  col: number,
  rows: number,
  cols: number,
  red: TrackedColor,
  samplesPerAxis: number,
  skipSkinExclusion = false,
  black?: BlackBand,
  blue?: TrackedColor,
): RegionSample {
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const x0 = col * cellW + cellW * (1 - INSET) / 2;
  const y0 = row * cellH + cellH * (1 - INSET) / 2;
  const stepX = (cellW * INSET) / Math.max(samplesPerAxis - 1, 1);
  const stepY = (cellH * INSET) / Math.max(samplesPerAxis - 1, 1);

  let redMatches = 0;
  let blueMatches = 0;
  let blackMatches = 0;
  let total = 0;
  let rSumX = 0;
  let rSumY = 0;
  let lSumX = 0;
  let lSumY = 0;
  let kSumX = 0;
  let kSumY = 0;

  for (let iy = 0; iy < samplesPerAxis; iy++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const ux = x0 + ix * stepX;
      const uy = y0 + iy * stepY;
      const img = applyHomography(h, { x: ux, y: uy });
      const { r, g, b } = sampler(Math.round(img.x), Math.round(img.y));
      const hsv = rgbToHsv(r, g, b);
      total++;
      if (matchesTrackedColor(hsv, red, skipSkinExclusion)) {
        redMatches++;
        rSumX += ux;
        rSumY += uy;
      } else if (blue && matchesTrackedColor(hsv, blue, true)) {
        blueMatches++;
        lSumX += ux;
        lSumY += uy;
      } else if (black && matchesBlack(hsv, black.maxValue, black.maxSaturation)) {
        blackMatches++;
        kSumX += ux;
        kSumY += uy;
      }
    }
  }

  const redFraction = total === 0 ? 0 : redMatches / total;
  const blueFraction = total === 0 ? 0 : blueMatches / total;
  const blackFraction = total === 0 ? 0 : blackMatches / total;
  // Centroid of the dominant colour (used for slide-and-settle velocity).
  let centroid: { x: number; y: number } | null = null;
  const maxM = Math.max(redMatches, blueMatches, blackMatches);
  if (maxM > 0) {
    if (redMatches === maxM) centroid = { x: rSumX / redMatches, y: rSumY / redMatches };
    else if (blueMatches === maxM) centroid = { x: lSumX / blueMatches, y: lSumY / blueMatches };
    else centroid = { x: kSumX / blackMatches, y: kSumY / blackMatches };
  }
  return { redFraction, blackFraction, blueFraction, centroid };
}

export interface BoardReaderOptions {
  homography: Mat3;
  rows: number;
  cols: number;
  red: TrackedColor;
  recognizer: PieceRecognizer;
  samplesPerAxis?: number;
  downscale?: number;
  /**
   * Mirror the video on each axis when drawing to the sampling canvas, matching
   * the on-screen <video> display transform. Keeping the sampled pixels in the
   * SAME (possibly flipped) coordinate space as the displayed video means corner
   * clicks in displayed space map directly through the homography — no per-axis
   * flip in the homography. mirrorX = horizontal (selfie), mirrorY = vertical.
   */
  mirrorX?: boolean;
  mirrorY?: boolean;
  /**
   * Skip ColorTracker's skin-tone exclusion when matching red. The board uses a
   * tight hue band + slide-and-settle to reject the arm, so the skin rule (which
   * discards shadowed/desaturated red — e.g. a piece on a dark square) is
   * counter-productive here. Defaults to true for the board.
   */
  skipSkinExclusion?: boolean;
  /** When set, also detect dark "black" pieces (low value + low saturation). */
  black?: BlackBand;
  /** When set, also detect blue pieces (calibrated blue hue band). */
  blue?: TrackedColor;
}

/**
 * Reads the full board matrix from a video element each frame. Owns its own
 * canvas (willReadFrequently) like ColorTracker.
 */
export class BoardReader {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('BoardReader: 2D context unavailable');
    this.ctx = ctx;
  }

  read(video: HTMLVideoElement, opts: BoardReaderOptions): CellReading[] {
    const downscale = opts.downscale ?? 4;
    const samples = opts.samplesPerAxis ?? 5;
    const w = Math.max(1, Math.floor(video.videoWidth / downscale));
    const h = Math.max(1, Math.floor(video.videoHeight / downscale));
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.save();
    this.ctx.translate(opts.mirrorX ? w : 0, opts.mirrorY ? h : 0);
    this.ctx.scale(opts.mirrorX ? -1 : 1, opts.mirrorY ? -1 : 1);
    this.ctx.drawImage(video, 0, 0, w, h);
    this.ctx.restore();
    const data = this.ctx.getImageData(0, 0, w, h).data;

    const sampler: RgbSampler = (x, y) => {
      const sx = Math.min(w - 1, Math.max(0, Math.round(x / downscale)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y / downscale)));
      const i = (sy * w + sx) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };

    const skipSkin = opts.skipSkinExclusion ?? true;
    const readings: CellReading[] = [];
    for (let row = 0; row < opts.rows; row++) {
      for (let col = 0; col < opts.cols; col++) {
        const { redFraction, blackFraction, blueFraction, centroid } = sampleRegion(
          sampler, opts.homography, row, col, opts.rows, opts.cols, opts.red, samples, skipSkin,
          opts.black, opts.blue,
        );
        const cls = opts.recognizer.classify({
          filledFraction: Math.max(redFraction, blackFraction, blueFraction),
          redFraction,
          blackFraction,
          blueFraction,
        });
        readings.push({
          row, col, occupied: cls.occupied, colour: cls.colour, centroid,
          redFraction, blackFraction, blueFraction,
        });
      }
    }
    return readings;
  }
}
