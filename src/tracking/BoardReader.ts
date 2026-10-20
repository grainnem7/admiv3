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

import { drawOriented, orientedSize, type QuarterTurns } from './frameOrientation';
import type { Mat3 } from '../utils/homography';
import { applyHomography } from '../utils/homography';
import { rgbToHsv } from './ColorTracker';
import { alphaForDt, REFERENCE_FRAME_MS } from '../utils/timeConstant';
import type { ColourId, ColourMatcher } from './boardColours';
import { gridDividesBoard, offsetFromSquare } from './boardGrid';
import { boxPosition, MAX_CELL_COLOURS, type BoxPosition } from './boxDetail';
import type { CellReading } from './BoardSequencerMode';
import type { PieceRecognizer } from './PieceRecognizer';
import {
  counterAt, estimateGain, estimateLightField, lightAt, refIndex, sample2x2, NO_GAIN,
  type BoardReference, type CounterPrototype, type Gain, type LightField,
} from './boardReference/boardReference';

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
   * Mean position of EVERY colour that matched at least one pixel. The recogniser can
   * play a colour that isn't the dominant one (priority, minimum fill), and offset and
   * Variation must be measured on the colour actually played.
   */
  centroids: Partial<Record<ColourId, { x: number; y: number }>>;
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

  const centroids: Partial<Record<ColourId, { x: number; y: number }>> = {};
  for (const [id, c] of counts) {
    if (c > 0) centroids[id] = { x: (sumX.get(id) ?? 0) / c, y: (sumY.get(id) ?? 0) / c };
  }

  let centroid: { x: number; y: number } | null = null;
  let offset: number | null = null;
  if (dominantId && dominantCount > 0) {
    centroid = centroids[dominantId] ?? null;
    if (centroid) offset = offsetFromCellCentre(centroid, row, col, rows, cols);
  }
  return { fractions, dominantId, centroid, centroids, offset };
}

/** How far a centroid sits from its cell's centre: 0 = dead centre, 1 = at the cell edge. */
export function offsetFromCellCentre(
  centroid: { x: number; y: number }, row: number, col: number, rows: number, cols: number,
): number {
  const ox = Math.abs(centroid.x - (col + 0.5) / cols) / (0.5 / cols);
  const oy = Math.abs(centroid.y - (row + 0.5) / rows) / (0.5 / rows);
  return Math.min(1, Math.max(ox, oy));
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
  /**
   * Physical squares per side. When the grid divides it, Variation's offset is measured
   * from the nearest square centre instead of the cell centre.
   */
  boardSquares?: number;
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
  /** Clockwise quarter turns, applied before the mirrors (see frameOrientation). */
  rotation?: QuarterTurns;
  /**
   * Read against the learnt empty board: with a reference and the counters' colours, a
   * pixel counts for a colour only when it is NOT the board at that spot (after correcting
   * the light from the board itself) and is clearly nearest that counter colour. Without
   * them the colour bands in `colours` are used, as before.
   */
  reference?: BoardReference | null;
  prototypes?: readonly CounterPrototype[];
}

/** A frame already in memory: what the reader needs, with no DOM. */
export interface ReaderFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Video pixels per frame pixel (the homography is in video pixels). */
  downscale: number;
}

/** How the last frame was read, for the facilitator's diagnostics. */
export interface ReaderDiagnostics {
  mode: 'board' | 'bands';
  /** The light correction applied (1,1,1 = as when the board was learnt). */
  gain: Gain;
}

/**
 * The reader without a camera: turns a frame in memory into cell readings. Holds the
 * per-cell history (smoothing, and which cells were occupied for the hysteresis), so the
 * same instance must see consecutive frames. The app wraps it in BoardReader; the
 * reliability benchmark drives it directly.
 */
export class BoardPixelReader {
  private prevFractions = new Map<string, Partial<Record<ColourId, number>>>();
  private wasOccupied = new Set<string>();
  private lattices: Float64Array[] = [];
  private latticeKey = '';
  private diag: ReaderDiagnostics = { mode: 'bands', gain: NO_GAIN };

  diagnostics(): ReaderDiagnostics {
    return this.diag;
  }

  read(frame: ReaderFrame, opts: BoardReaderOptions): CellReading[] {
    const { data, width: w, height: h, downscale } = frame;
    const samples = opts.samplesPerAxis ?? 5;
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
    // "Shoved off centre" is about the physical square, not the app grid — but only when
    // each cell covers whole squares, otherwise the cell centre is all there is.
    const squareOffsets = opts.boardSquares !== undefined
      && gridDividesBoard(opts.boardSquares, opts.rows, opts.cols);

    // A 2×2 average rather than one pixel: a single pixel carries the sensor's noise. The
    // same function learns the board, so the two always see the board alike.
    const sampler: RgbSampler = (x, y) => {
      const [r, g, b] = sample2x2({ data, width: w, height: h }, x, y, downscale);
      return { r, g, b };
    };

    const ref = opts.reference ?? null;
    const protos = opts.prototypes ?? [];
    const boardMode = ref !== null && protos.length > 0;
    // Against the board: read every sample once, correct the light from the board as a
    // whole, then judge each sample against its own spot on the learnt board.
    let cellPixels: { obs: Float32Array; refK: Int32Array }[] = [];
    let gain: Gain = NO_GAIN;
    let field: LightField | null = null;
    if (boardMode) {
      const allObs: number[] = [];
      const allRef: number[] = [];
      const allUv: number[] = [];
      cellPixels = this.lattices.map((lat) => {
        const n = lat.length / 4;
        const obs = new Float32Array(n * 3);
        const refK = new Int32Array(n);
        for (let k = 0, i = 0; k < lat.length; k += 4, i++) {
          const { r, g, b } = sampler(lat[k + 2], lat[k + 3]);
          obs[i * 3] = r; obs[i * 3 + 1] = g; obs[i * 3 + 2] = b;
          const rk = refIndex(ref, lat[k], lat[k + 1]);
          refK[i] = rk;
          allObs.push(r, g, b);
          allRef.push(ref.mean[rk * 3], ref.mean[rk * 3 + 1], ref.mean[rk * 3 + 2]);
          allUv.push(lat[k], lat[k + 1]);
        }
        return { obs, refK };
      });
      gain = estimateGain(allObs, allRef);
      field = estimateLightField(allObs, allRef, allUv, gain);
    }
    this.diag = { mode: boardMode ? 'board' : 'bands', gain };

    const readings: CellReading[] = [];
    for (let row = 0; row < opts.rows; row++) {
      for (let col = 0; col < opts.cols; col++) {
        const idx = row * opts.cols + col;
        const { fractions, centroid, centroids, offset } = boardMode
          ? sampleAgainstBoard(this.lattices[idx], cellPixels[idx], gain, field, ref, protos, row, col, opts.rows, opts.cols)
          : sampleRegion(sampler, opts.homography, row, col, opts.rows, opts.cols, opts.colours, samples, this.lattices[idx]);
        // Temporal smoothing: blend this frame's fractions with the cell's history
        // so a single flickery frame can't flip its occupancy/colour on or off.
        const key = `${row},${col}`;
        const smoothed = blendFractions(
          this.prevFractions.get(key), fractions, alpha,
        );
        this.prevFractions.set(key, smoothed);
        const filledFraction = Math.max(0, ...Object.values(smoothed).filter((v): v is number => v !== undefined));
        const cls = opts.recognizer.classify({ filledFraction, fractions: smoothed, wasOccupied: this.wasOccupied.has(key) });
        if (cls.occupied) this.wasOccupied.add(key);
        else this.wasOccupied.delete(key);
        // Measure position on the colour actually played, which may not be the dominant one.
        const playedCentroid = (cls.colour ? centroids[cls.colour] : null) ?? centroid;
        const offsetOf = (pt: { x: number; y: number }): number => (squareOffsets
          ? offsetFromSquare(pt, opts.boardSquares ?? 8)
          : offsetFromCellCentre(pt, row, col, opts.rows, opts.cols));
        const playedOffset = cls.colour && playedCentroid ? offsetOf(playedCentroid) : offset;

        // Each colour in the box keeps its own measurements, so two counters sharing a
        // box can be shoved (or placed high and low) independently.
        const cellColours = cls.colours?.slice(0, MAX_CELL_COLOURS);
        let offsets: Partial<Record<ColourId, number>> | undefined;
        let boxPositions: Partial<Record<ColourId, BoxPosition>> | undefined;
        if (cellColours && cellColours.length > 0) {
          offsets = {};
          boxPositions = {};
          for (const id of cellColours) {
            const pt = centroids[id];
            if (!pt) continue;
            offsets[id] = offsetOf(pt);
            boxPositions[id] = boxPosition(pt, row, col, {
              rows: opts.rows, cols: opts.cols, boardSquares: opts.boardSquares ?? 8,
            });
          }
        }
        readings.push({
          row, col, occupied: cls.occupied, colour: cls.colour, centroid: playedCentroid,
          // Capped: a box holds two counters at most before they stop being distinguishable.
          colours: cellColours,
          centroids, offsets, boxPositions, fractions: smoothed, offset: playedOffset,
        });
      }
    }
    return readings;
  }
}

/**
 * One cell, judged against the learnt board: the share of its samples that are not the
 * board AND clearly one counter colour. The same shape as sampleRegion's answer, so
 * everything after the reader is unchanged.
 */
function sampleAgainstBoard(
  lat: Float64Array, px: { obs: Float32Array; refK: Int32Array }, gain: Gain, field: LightField | null,
  ref: BoardReference, protos: readonly CounterPrototype[],
  row: number, col: number, rows: number, cols: number,
): RegionSample {
  const counts = new Map<ColourId, number>();
  const sumX = new Map<ColourId, number>();
  const sumY = new Map<ColourId, number>();
  const n = px.refK.length;
  for (let i = 0; i < n; i++) {
    const local = field ? lightAt(field, lat[i * 4], lat[i * 4 + 1]) : 1;
    const rgb: [number, number, number] = [
      px.obs[i * 3] / (gain[0] * local), px.obs[i * 3 + 1] / (gain[1] * local), px.obs[i * 3 + 2] / (gain[2] * local),
    ];
    const id = counterAt(rgb, ref, px.refK[i], protos);
    if (id === null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    sumX.set(id, (sumX.get(id) ?? 0) + lat[i * 4]);
    sumY.set(id, (sumY.get(id) ?? 0) + lat[i * 4 + 1]);
  }
  const fractions: Partial<Record<ColourId, number>> = {};
  const centroids: Partial<Record<ColourId, { x: number; y: number }>> = {};
  let dominantId: ColourId | null = null;
  let best = 0;
  for (const p of protos) {
    const c = counts.get(p.id) ?? 0;
    fractions[p.id] = n === 0 ? 0 : c / n;
    if (c > 0) centroids[p.id] = { x: (sumX.get(p.id) ?? 0) / c, y: (sumY.get(p.id) ?? 0) / c };
    if (c > best) { best = c; dominantId = p.id; }
  }
  const centroid = dominantId ? centroids[dominantId] ?? null : null;
  const offset = centroid ? offsetFromCellCentre(centroid, row, col, rows, cols) : null;
  return { fractions, dominantId, centroid, centroids, offset };
}

/**
 * Reads the full board matrix from a video element each frame: draws the picture to its
 * own canvas (willReadFrequently, like ColorTracker) and hands the pixels to a
 * BoardPixelReader.
 */
export class BoardReader {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixels = new BoardPixelReader();
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

  diagnostics(): ReaderDiagnostics {
    return this.pixels.diagnostics();
  }

  read(video: HTMLVideoElement, opts: BoardReaderOptions): CellReading[] {
    const downscale = opts.downscale ?? 4;
    const shown = orientedSize(video.videoWidth, video.videoHeight, opts.rotation ?? 0);
    const w = Math.max(1, Math.floor(shown.width / downscale));
    const h = Math.max(1, Math.floor(shown.height / downscale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    drawOriented(this.ctx, video, w, h, {
      mirrorX: opts.mirrorX ?? false, mirrorY: opts.mirrorY ?? false, rotation: opts.rotation ?? 0,
    });
    const data = this.ctx.getImageData(0, 0, w, h).data;
    this.last = { data, width: w, height: h, downscale };
    return this.pixels.read(this.last, opts);
  }
}
