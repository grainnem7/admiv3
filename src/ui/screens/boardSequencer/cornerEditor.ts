/** Pure maths for the corner editor: nudges, tap order, hit-testing and video-box mapping. */
import { computeHomography, applyHomography, UNIT_SQUARE, type Point } from '../../../utils/homography';
import type { Corners } from '../../../tracking/boardDetect/orientation';

export const NUDGE_FINE = 0.0025;
export const NUDGE_COARSE = 0.02;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function nudgeCorner(c: Corners, index: number, dx: number, dy: number, step: number): Corners {
  const out: Corners = [c[0], c[1], c[2], c[3]];
  out[index] = { x: clamp01(c[index].x + dx * step), y: clamp01(c[index].y + dy * step) };
  return out;
}

/**
 * Four corners that make a usable board: convex, going the same way round, no two on the
 * same spot. A bow-tie or a collapsed quad still SOLVES — it just maps every cell to the
 * same pixel, or to NaN — so nothing downstream throws and the board silently reads
 * nothing at all, this session and every session after it.
 */
export function isConvexQuad(q: Corners): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]; const b = q[(i + 1) % 4]; const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Taps are prompted in saved order — [start+high, end+high, end+low, start+low] — so this
 * only has to check the shape. It used to rotate the taps by one, which meant the corner
 * you tapped first was saved as corner 4 and every handle was renamed the moment the
 * fourth tap landed: you tapped 1, 2, 3, 4 and watched them become 4, 1, 2, 3.
 */
export function cornerOrderForTaps(taps: Corners): Corners | null {
  const saved: Corners = [taps[0], taps[1], taps[2], taps[3]];
  return isConvexQuad(saved) ? saved : null;
}

/** "Place corners for me": a quad inset from each video edge, for keyboard/switch users. */
export function defaultInsetCorners(inset = 0.1): Corners {
  return [{ x: inset, y: inset }, { x: 1 - inset, y: inset }, { x: 1 - inset, y: 1 - inset }, { x: inset, y: 1 - inset }];
}

export function hitTestHandle(c: Corners, p: Point, radius: number): number | null {
  let best: number | null = null;
  let bestD = radius;
  c.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

export interface ContentRect { x: number; y: number; w: number; h: number }

export function videoContentRect(boxW: number, boxH: number, videoW: number, videoH: number, fit: 'contain' | 'fill'): ContentRect {
  if (fit === 'fill' || videoW <= 0 || videoH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / videoW, boxH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Box pixel → fraction of the full camera frame, or null in the letterbox bars. */
export function boxToFrame(px: number, py: number, rect: ContentRect): Point | null {
  const x = (px - rect.x) / rect.w;
  const y = (py - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function frameToBox(p: Point, rect: ContentRect): { x: number; y: number } {
  return { x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h };
}

/** Centre of physical board square (row, col) in frame fractions, via the saved corners. */
export function squareCentreToImage(c: Corners, squares: number, row: number, col: number): Point {
  const h = computeHomography(UNIT_SQUARE, c);
  return applyHomography(h, { x: (col + 0.5) / squares, y: (row + 0.5) / squares });
}
