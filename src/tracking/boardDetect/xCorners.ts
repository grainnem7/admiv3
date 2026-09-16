/**
 * X-corners: the points where four checkerboard squares meet.
 *
 * A board's interior crossings are the one feature a chess or draughts board has in
 * abundance and nothing else in the room does — a saddle in the image surface, dark on
 * one diagonal and light on the other. Finding those, rather than edges or the wooden
 * border, is what lets the detector work on a board photographed at an angle.
 *
 * Every threshold here is named and meant to be tuned on real frames.
 */
import { gaussianBlur, sampleGray, type GrayImage } from './gray';

/** Blur before differentiating, or sensor noise dominates the second derivatives. */
export const DEFAULT_SIGMA = 1.2;
/** Candidates are capped so a noisy frame can't make the lattice search explode. */
export const MAX_CORNERS = 200;
/** A candidate must reach this share of the strongest response to be kept. */
export const RELATIVE_FLOOR = 0.12;
/** Non-maximum suppression radius, in working pixels. */
export const NMS_RADIUS = 3;
/** The ring check samples this far from the centre, in working pixels. */
export const RING_RADIUS = 4;
/** How much brighter the light diagonal must be than the dark one, relative to the range. */
export const RING_CONTRAST = 0.25;

export interface XCorner {
  x: number;
  y: number;
  score: number;
}

export interface XCornerOptions {
  sigma?: number;
  maxCorners?: number;
  relativeFloor?: number;
}

/**
 * Find checkerboard crossings, strongest first.
 *
 * The response is −det(Hessian): positive at a saddle, negative at a blob or a flat
 * patch, so a wood grain or a counter's disc scores near zero while a crossing peaks.
 */
export function findXCorners(img: GrayImage, opts: XCornerOptions = {}): XCorner[] {
  const blurred = gaussianBlur(img, opts.sigma ?? DEFAULT_SIGMA);
  const { width: w, height: h, data } = blurred;
  const response = new Float32Array(w * h);
  let maxResponse = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dxx = data[i - 1] - 2 * data[i] + data[i + 1];
      const dyy = data[i - w] - 2 * data[i] + data[i + w];
      const dxy = (data[i - w - 1] + data[i + w + 1] - data[i - w + 1] - data[i + w - 1]) / 4;
      // A saddle has a negative determinant, so −det is positive there.
      const r = dxy * dxy - dxx * dyy;
      if (r > 0) {
        response[i] = r;
        if (r > maxResponse) maxResponse = r;
      }
    }
  }
  if (maxResponse <= 0) return [];

  const floor = maxResponse * (opts.relativeFloor ?? RELATIVE_FLOOR);
  const candidates: XCorner[] = [];
  const radius = NMS_RADIUS;
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const i = y * w + x;
      const r = response[i];
      if (r < floor) continue;
      // Non-maximum suppression: one candidate per crossing, not a cluster.
      let isMax = true;
      for (let dy = -radius; dy <= radius && isMax; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (response[(y + dy) * w + (x + dx)] > r) { isMax = false; break; }
        }
      }
      if (!isMax) continue;
      if (!ringLooksLikeCrossing(blurred, x, y)) continue;
      candidates.push(refine(response, w, h, x, y, r));
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, opts.maxCorners ?? MAX_CORNERS);
}

/**
 * A true crossing alternates dark-light-dark-light around a ring. A blob or an edge
 * doesn't, which is what keeps counters and the board's outer border out of the list.
 */
function ringLooksLikeCrossing(img: GrayImage, x: number, y: number): boolean {
  const r = RING_RADIUS;
  const diag = [
    sampleGray(img, x - r, y - r),
    sampleGray(img, x + r, y - r),
    sampleGray(img, x + r, y + r),
    sampleGray(img, x - r, y + r),
  ];
  const a = (diag[0] + diag[2]) / 2;   // one diagonal pair
  const b = (diag[1] + diag[3]) / 2;   // the other
  const lo = Math.min(...diag);
  const hi = Math.max(...diag);
  const range = hi - lo;
  if (range < 8) return false;                      // flat: no crossing here
  return Math.abs(a - b) >= range * RING_CONTRAST;  // the pairs must genuinely differ
}

/** Sub-pixel position from a quadratic fit through the response peak. */
function refine(response: Float32Array, w: number, h: number, x: number, y: number, score: number): XCorner {
  const at = (px: number, py: number): number => response[
    Math.min(h - 1, Math.max(0, py)) * w + Math.min(w - 1, Math.max(0, px))
  ];
  const dx = subPixel(at(x - 1, y), score, at(x + 1, y));
  const dy = subPixel(at(x, y - 1), score, at(x, y + 1));
  return { x: x + dx, y: y + dy, score };
}

function subPixel(left: number, centre: number, right: number): number {
  const denom = left - 2 * centre + right;
  if (Math.abs(denom) < 1e-9) return 0;
  return Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denom)));
}
