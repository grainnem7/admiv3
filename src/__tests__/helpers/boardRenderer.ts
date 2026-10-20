/**
 * A realistic-enough camera picture of the board, for the detection benchmark: walnut and
 * maple squares with grain, the camera at an angle (a homography), counters as discs with a
 * darker rim and a soft drop shadow that may sit off-centre or across a line, and the
 * things a rehearsal room does to a webcam: exposure and white balance drifting, a shadow
 * across the board, a hand, sensor noise, the colour blur of video compression, glare.
 *
 * Seeded, so every run draws the same pictures.
 */
import { applyHomography, computeHomography, UNIT_SQUARE, type Mat3, type Point } from '../../utils/homography';

export type RGB = [number, number, number];

export interface CounterSpec {
  row: number;
  col: number;
  /** Offset from the square's centre, in squares (±0.45 reaches the line). */
  du?: number;
  dv?: number;
  /** Radius in squares. Real counters cover ~0.28 of a square: radius ≈ 0.3. */
  radius?: number;
  rgb: RGB;
  /** A highlight on a glossy counter, 0..1. */
  specular?: number;
}

export interface Perturb {
  /** Multiplies every channel (auto-exposure). */
  exposure?: number;
  /** Per-channel gain (auto white balance): warm = [1.12, 1, 0.82]. */
  whiteBalance?: RGB;
  /** A soft shadow: darker by `depth` (0..1) on the far side of a line through the board. */
  shadow?: { angle: number; offset: number; depth: number; softness: number };
  /** A hand: a skin-coloured blob reaching in from an edge, in board coordinates. */
  hand?: { u: number; v: number; radius: number };
  /** Gaussian sensor noise (8-bit levels). */
  noise?: number;
  /** Video-compression colour blur, in pixels. */
  chromaBlur?: number;
}

export interface RenderSpec {
  width: number;
  height: number;
  /** Board corners in pixels, TL TR BR BL. */
  corners: [Point, Point, Point, Point];
  squares?: number;
  counters?: CounterSpec[];
  perturb?: Perturb;
  seed: number;
}

export const MAPLE: RGB = [214, 196, 168];
export const WALNUT: RGB = [112, 74, 54];
export const SURROUND: RGB = [70, 70, 74];
export const SKIN: RGB = [205, 150, 125];

/** Counter colours as a cheap webcam sees them. */
export const COUNTERS: Record<string, RGB> = {
  red: [196, 42, 46],
  blue: [38, 78, 180],
  yellow: [232, 196, 40],
  green: [40, 150, 72],
  purple: [120, 60, 160],
  orange: [236, 120, 36],
  pink: [232, 110, 170],
  black: [26, 26, 30],
  white: [236, 236, 232],
};

/** A seeded random number generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number): number => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

/** Unit board → picture. */
export function boardHomography(spec: Pick<RenderSpec, 'corners'>): Mat3 {
  return computeHomography(UNIT_SQUARE, spec.corners);
}

/** A typical angled view: the camera above and in front, the board's far edge narrower. */
export function angledCorners(width: number, height: number, tilt = 0.12): [Point, Point, Point, Point] {
  const top = height * 0.12; const bottom = height * 0.92;
  const inset = width * tilt;
  const l = width * 0.18; const r = width * 0.82;
  return [{ x: l + inset, y: top }, { x: r - inset, y: top }, { x: r, y: bottom }, { x: l, y: bottom }];
}

/** Wood: the square's base colour, a grain that runs along it, and a small per-square tint. */
function wood(u: number, v: number, squares: number, seedTint: number[]): RGB {
  const sx = Math.min(squares - 1, Math.max(0, Math.floor(u * squares)));
  const sy = Math.min(squares - 1, Math.max(0, Math.floor(v * squares)));
  const dark = (sx + sy) % 2 === 1;
  const base = dark ? WALNUT : MAPLE;
  const tint = seedTint[sy * squares + sx];
  // Grain: a wavy stripe pattern, alternating direction square by square, like a real board.
  const along = (sx + sy) % 2 === 0 ? u : v;
  const across = (sx + sy) % 2 === 0 ? v : u;
  const grain = Math.sin(along * squares * 3.1 + Math.sin(across * squares * 9 + tint * 7) * 1.6 + tint * 13);
  const k = 1 + (dark ? 0.1 : 0.05) * grain + tint * 0.05;
  return [base[0] * k, base[1] * k, base[2] * k];
}

/** Render one camera frame. */
export function renderBoard(spec: RenderSpec): { data: Uint8ClampedArray; width: number; height: number } {
  const { width, height } = spec;
  const squares = spec.squares ?? 8;
  const r = rng(spec.seed);
  const tints = Array.from({ length: squares * squares }, () => r() * 2 - 1);
  const p = spec.perturb ?? {};
  const toBoard = computeHomography(spec.corners, UNIT_SQUARE);
  const counters = spec.counters ?? [];
  const out = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = applyHomography(toBoard, { x: x + 0.5, y: y + 0.5 });
      const u = b.x; const v = b.y;
      let c: RGB = u < 0 || v < 0 || u > 1 || v > 1 ? [...SURROUND] as RGB : wood(u, v, squares, tints);
      // Counters: a disc with a darker rim, and a soft shadow down and to the right.
      for (const ct of counters) {
        const cu = (ct.col + 0.5 + (ct.du ?? 0)) / squares;
        const cv = (ct.row + 0.5 + (ct.dv ?? 0)) / squares;
        const rad = (ct.radius ?? 0.3) / squares;
        const ds = Math.hypot(u - cu - rad * 0.12, v - cv - rad * 0.15);
        if (ds < rad * 1.12 && ds >= rad * 0.98) c = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72];
        const d = Math.hypot(u - cu, v - cv);
        if (d < rad) {
          const rim = d > rad * 0.82 ? 0.78 : 1;
          let col: RGB = [ct.rgb[0] * rim, ct.rgb[1] * rim, ct.rgb[2] * rim];
          const sp = ct.specular ?? 0;
          if (sp > 0) {
            const hd = Math.hypot(u - cu + rad * 0.35, v - cv + rad * 0.35);
            if (hd < rad * 0.25) col = col.map((ch) => ch + (255 - ch) * sp) as RGB;
          }
          c = col;
        }
      }
      if (p.hand) {
        const d = Math.hypot(u - p.hand.u, (v - p.hand.v) * 0.8);
        // The arm continues off the board's bottom edge.
        const arm = v > p.hand.v && Math.abs(u - p.hand.u) < p.hand.radius * 0.7;
        if (d < p.hand.radius || arm) c = [...SKIN] as RGB;
      }
      if (p.shadow) {
        const s = p.shadow;
        const t = (Math.cos(s.angle) * u + Math.sin(s.angle) * v - s.offset) / Math.max(0.01, s.softness);
        const k = 1 - s.depth * Math.max(0, Math.min(1, t + 0.5));
        c = [c[0] * k, c[1] * k, c[2] * k];
      }
      const e = p.exposure ?? 1;
      const wb = p.whiteBalance ?? [1, 1, 1];
      const o = (y * width + x) * 3;
      out[o] = c[0] * e * wb[0]; out[o + 1] = c[1] * e * wb[1]; out[o + 2] = c[2] * e * wb[2];
    }
  }
  if (p.chromaBlur && p.chromaBlur > 0) chromaBlur(out, width, height, Math.round(p.chromaBlur));
  const data = new Uint8ClampedArray(width * height * 4);
  const noise = p.noise ?? 0;
  for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
    for (let ch = 0; ch < 3; ch++) data[j + ch] = out[i + ch] + (noise > 0 ? gauss(r) * noise : 0);
    data[j + 3] = 255;
  }
  return { data, width, height };
}

/** Blur colour but not brightness, as 4:2:0 video does. */
function chromaBlur(px: Float32Array, w: number, h: number, rad: number): void {
  const n = w * h;
  const Y = new Float32Array(n); const Cb = new Float32Array(n); const Cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 3]; const g = px[i * 3 + 1]; const b = px[i * 3 + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = b - Y[i]; Cr[i] = r - Y[i];
  }
  const blur = (a: Float32Array): Float32Array => {
    const t = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0; let c = 0;
        for (let dx = -rad; dx <= rad; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++; } }
        t[y * w + x] = s / c;
      }
    }
    const o = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0; let c = 0;
        for (let dy = -rad; dy <= rad; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) { s += t[yy * w + x]; c++; } }
        o[y * w + x] = s / c;
      }
    }
    return o;
  };
  const cb = blur(Cb); const cr = blur(Cr);
  for (let i = 0; i < n; i++) {
    const r = Y[i] + cr[i]; const b = Y[i] + cb[i];
    const g = (Y[i] - 0.299 * r - 0.114 * b) / 0.587;
    px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
  }
}
