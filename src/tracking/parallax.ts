/**
 * Counters have height. A camera looking at the board at an angle sees a counter's TOP,
 * and the top of a counter appears shifted away from the camera — part-way into the
 * square behind it — even when the counter sits dead centre in its own square. Reading
 * the squares where the board is, the reader saw the nearer of two counters as if it were
 * on the line between them, and the far one spilling into the next square.
 *
 * The board's four corners are enough to work out how the camera looks at it: a square
 * board seen at an angle becomes a particular quadrilateral, and from it the camera's tilt
 * (and its focal length, roughly) follow. With those, the plane at counter height has its
 * own mapping into the picture — where counter tops appear — and the reader samples there.
 *
 * Board coordinates are the unit square (the whole board is 1 × 1); picture coordinates
 * are pixels of the displayed picture. Pure maths, no browser.
 */
import { applyHomography, type Mat3 } from '../utils/homography';

type Vec3 = [number, number, number];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Focal length (pixels) when the board's shape can't tell: a typical phone or webcam lens. */
export const DEFAULT_FOCAL_OF_WIDTH = 0.9;

/**
 * The camera's focal length in pixels, from the board's mapping into the picture (the
 * principal point taken as the picture's centre, square pixels). A square board's two
 * edges are at right angles and equally long; only one focal length makes that true.
 * Falls back to a typical lens when the board is seen nearly face on (it can't tell).
 */
export function estimateFocal(h: Mat3, width: number, height: number): number {
  const cx = width / 2;
  const cy = height / 2;
  // The mapping with the picture's centre as the origin.
  const a = [h[0] - cx * h[6], h[1] - cx * h[7], h[3] - cy * h[6], h[4] - cy * h[7], h[6], h[7]];
  const [h11, h12, h21, h22, h31, h32] = a;
  const guesses: number[] = [];
  const d1 = h31 * h32;
  if (Math.abs(d1) > 1e-12) guesses.push(-(h11 * h12 + h21 * h22) / d1);
  const d2 = h31 * h31 - h32 * h32;
  if (Math.abs(d2) > 1e-12) guesses.push(-(h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22) / d2);
  const ok = guesses.filter((f2) => Number.isFinite(f2) && f2 > (0.3 * width) ** 2 && f2 < (4 * width) ** 2);
  if (ok.length === 0) return DEFAULT_FOCAL_OF_WIDTH * width;
  return Math.sqrt(ok.reduce((s, v) => s + v, 0) / ok.length);
}

/**
 * The mapping from board coordinates to the picture for the plane `lift` above the board
 * (in board units: 1 = the whole board's width), towards the camera. With lift 0 it is the
 * board's own mapping.
 */
export function liftHomography(h: Mat3, width: number, height: number, lift: number, focal?: number): Mat3 {
  if (lift === 0) return h;
  const f = focal ?? estimateFocal(h, width, height);
  const cx = width / 2;
  const cy = height / 2;
  // K⁻¹ · H, column by column (K = focal f, centre (cx, cy)).
  const col = (i: number): Vec3 => [
    (h[i] - cx * h[6 + i]) / f,
    (h[3 + i] - cy * h[6 + i]) / f,
    h[6 + i],
  ];
  const b1 = col(0);
  const b2 = col(1);
  const b3 = col(2);
  let k = 2 / (norm(b1) + norm(b2));
  if (b3[2] * k < 0) k = -k; // the board is in front of the camera
  const r1 = scale(b1, k);
  const r2 = scale(b2, k);
  const t = scale(b3, k);
  const n = cross(r1, r2);
  const r3 = scale(n, 1 / norm(n));
  // Towards the camera: the camera sits on the side of the board that -Rᵀt points to.
  const towards = -dot(r3, t) > 0 ? 1 : -1;
  const t2: Vec3 = [t[0] + towards * lift * r3[0], t[1] + towards * lift * r3[1], t[2] + towards * lift * r3[2]];
  // Back to pixels: K · [r1 r2 t2].
  const px = (v: Vec3): Vec3 => [f * v[0] + cx * v[2], f * v[1] + cy * v[2], v[2]];
  const c1 = px(r1);
  const c2 = px(r2);
  const c3 = px(t2);
  const m: Mat3 = [c1[0], c2[0], c3[0], c1[1], c2[1], c3[1], c1[2], c2[2], c3[2]];
  return m;
}

/** Where a point at board position p, `lift` above the board, appears in the picture. */
export function liftedPoint(lifted: Mat3, p: { x: number; y: number }): { x: number; y: number } {
  return applyHomography(lifted, p);
}
