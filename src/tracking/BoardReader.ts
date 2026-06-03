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
import { rgbToHsv, matchesTrackedColor } from './ColorTracker';
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
  redFraction: number;
  /** Mean position of matching pixels in unit-square coords, or null if none. */
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
): RegionSample {
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const x0 = col * cellW + cellW * (1 - INSET) / 2;
  const y0 = row * cellH + cellH * (1 - INSET) / 2;
  const stepX = (cellW * INSET) / Math.max(samplesPerAxis - 1, 1);
  const stepY = (cellH * INSET) / Math.max(samplesPerAxis - 1, 1);

  let matches = 0;
  let total = 0;
  let sumX = 0;
  let sumY = 0;

  for (let iy = 0; iy < samplesPerAxis; iy++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const ux = x0 + ix * stepX;
      const uy = y0 + iy * stepY;
      const img = applyHomography(h, { x: ux, y: uy });
      const { r, g, b } = sampler(Math.round(img.x), Math.round(img.y));
      const hsv = rgbToHsv(r, g, b);
      total++;
      if (matchesTrackedColor(hsv, red)) {
        matches++;
        sumX += ux;
        sumY += uy;
      }
    }
  }

  const redFraction = total === 0 ? 0 : matches / total;
  const centroid = matches > 0 ? { x: sumX / matches, y: sumY / matches } : null;
  return { redFraction, centroid };
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

    const readings: CellReading[] = [];
    for (let row = 0; row < opts.rows; row++) {
      for (let col = 0; col < opts.cols; col++) {
        const { redFraction, centroid } = sampleRegion(
          sampler, opts.homography, row, col, opts.rows, opts.cols, opts.red, samples,
        );
        const cls = opts.recognizer.classify({ filledFraction: redFraction, redFraction });
        readings.push({ row, col, occupied: cls.occupied, colour: cls.colour, centroid, redFraction });
      }
    }
    return readings;
  }
}
