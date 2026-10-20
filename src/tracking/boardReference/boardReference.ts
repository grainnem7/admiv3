/**
 * The board as the reference: counters are found by how they DIFFER from the empty board.
 *
 * The colour-band reader judged every pixel on its own against fixed hue/saturation/value
 * ranges, so walnut grain could be "red", a highlight on maple "white", a shadow "black",
 * and auto-exposure moved every value at once. This reader knows what each part of each
 * square looks like empty (learnt from many frames, with how much it naturally varies),
 * corrects each frame's light using the board itself, and only then asks two questions of
 * a pixel: is this NOT the board here? and if so, which counter colour is it nearest?
 *
 * Everything here is pure — pixels in, answers out — so it runs the same in the app and in
 * the reliability benchmark (src/__tests__/bench).
 */
import { applyHomography, type Mat3 } from '../../utils/homography';

/** Reference pixels per board square. Fine enough for a counter's disc, small enough to store. */
export const REF_PIXELS_PER_SQUARE = 8;

/**
 * What the empty board looks like, in board coordinates (head-on, row-major), independent
 * of the app grid: changing Rows or Steps doesn't need the board learnt again.
 */
export interface BoardReference {
  /** Physical squares per side when it was learnt. */
  squares: number;
  /** Reference pixels per side (squares × REF_PIXELS_PER_SQUARE). */
  size: number;
  /** Mean RGB per reference pixel, 0..255. */
  mean: Float32Array;
  /** How far this pixel's lightness wanders on its own (log units). */
  spreadL: Float32Array;
  /** How far its colour wanders on its own (chromaticity units). */
  spreadC: Float32Array;
}

export interface FrameRGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// ---- colour features ----------------------------------------------------------------

/** Brightness, plus a small floor so near-black pixels don't divide by nothing. */
const lum = (r: number, g: number, b: number): number => (r + g + b) / 3 + 4;

/** Chromaticity relative to grey: (0,0) is neutral whatever the brightness. */
function chroma(r: number, g: number, b: number): [number, number] {
  const s = r + g + b + 12;
  return [(r + 4) / s - 1 / 3, (g + 4) / s - 1 / 3];
}

/**
 * Chromaticity is unreliable on dark pixels — a few levels of sensor noise move it a lot —
 * so the colour tolerance widens as the pixel gets darker.
 */
const darkChromaSlack = (y: number): number => 5 / (y + 5);

// ---- learning ---------------------------------------------------------------------------

/**
 * The colour the reader sees at video point (x, y): the 2×2 average of frame pixels there.
 * Learning and reading MUST use this same function on frames of the same size — learnt
 * from a sharper picture than it is read from, every line between a light and a dark
 * square looked like a counter (the blur of walnut into maple reads orange).
 */
export function sample2x2(f: FrameRGBA, x: number, y: number, scale: number): [number, number, number] {
  const sx = Math.min(f.width - 2, Math.max(0, Math.round(x / scale)));
  const sy = Math.min(f.height - 2, Math.max(0, Math.round(y / scale)));
  const i = (sy * f.width + sx) * 4;
  const j = i + f.width * 4;
  const d = f.data;
  return [
    (d[i] + d[i + 4] + d[j] + d[j + 4]) / 4,
    (d[i + 1] + d[i + 5] + d[j + 1] + d[j + 5]) / 4,
    (d[i + 2] + d[i + 6] + d[j + 2] + d[j + 6]) / 4,
  ];
}

/**
 * Learn the empty board from several frames. Each reference pixel keeps its mean colour
 * and how much it varies — from frame to frame (sensor noise, flicker) AND across its
 * neighbours (grain, and how far a sample can land from where it was learnt). Thresholds
 * later are multiples of that spread, so a busy walnut square is judged more leniently than
 * a flat maple one instead of every square sharing one hand-set number.
 *
 * `frameScale` = how many video pixels one frame pixel stands for (the homography is in
 * full-size video pixels). Pass frames exactly as the reader will see them (the same
 * downscale), or the reference won't match what is read.
 */
export function learnBoardReference(
  frames: readonly FrameRGBA[], h: Mat3, squares: number, frameScale = 1,
): BoardReference | null {
  if (frames.length === 0 || squares < 2) return null;
  const size = squares * REF_PIXELS_PER_SQUARE;
  const n = size * size;
  const sum = new Float64Array(n * 3);
  const sumL = new Float64Array(n);
  const sumL2 = new Float64Array(n);
  const count = new Uint16Array(n);
  for (const f of frames) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = applyHomography(h, { x: (x + 0.5) / size, y: (y + 0.5) / size });
        if (p.x < 0 || p.y < 0 || p.x / frameScale >= f.width - 1 || p.y / frameScale >= f.height - 1) continue;
        const c = sample2x2(f, p.x, p.y, frameScale);
        const k = y * size + x;
        sum[k * 3] += c[0]; sum[k * 3 + 1] += c[1]; sum[k * 3 + 2] += c[2];
        const l = Math.log(lum(c[0], c[1], c[2]));
        sumL[k] += l; sumL2[k] += l * l;
        count[k] += 1;
      }
    }
  }
  const mean = new Float32Array(n * 3);
  const temporalL = new Float32Array(n);
  let seen = 0;
  for (let k = 0; k < n; k++) {
    const c = count[k];
    if (c === 0) continue;
    seen++;
    mean[k * 3] = sum[k * 3] / c; mean[k * 3 + 1] = sum[k * 3 + 1] / c; mean[k * 3 + 2] = sum[k * 3 + 2] / c;
    const m = sumL[k] / c;
    temporalL[k] = Math.sqrt(Math.max(0, sumL2[k] / c - m * m));
  }
  if (seen < n * 0.8) return null; // most of the board is out of the picture
  // Spatial spread: how different the neighbours within this square are. A sample point
  // never lands exactly where the reference was taken, so a grain line next door must not
  // read as "something new here".
  const spreadL = new Float32Array(n);
  const spreadC = new Float32Array(n);
  const sq = REF_PIXELS_PER_SQUARE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const [r, g, b] = [mean[k * 3], mean[k * 3 + 1], mean[k * 3 + 2]];
      const l0 = Math.log(lum(r, g, b));
      const c0 = chroma(r, g, b);
      let dL = 0; let dC = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx; const ny = y + dy;
          // Stay inside the same square: the next square is a different colour by design.
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (Math.floor(nx / sq) !== Math.floor(x / sq) || Math.floor(ny / sq) !== Math.floor(y / sq)) continue;
          const j = ny * size + nx;
          const [r2, g2, b2] = [mean[j * 3], mean[j * 3 + 1], mean[j * 3 + 2]];
          dL = Math.max(dL, Math.abs(Math.log(lum(r2, g2, b2)) - l0));
          const c2 = chroma(r2, g2, b2);
          dC = Math.max(dC, Math.hypot(c2[0] - c0[0], c2[1] - c0[1]));
        }
      }
      spreadL[k] = Math.max(temporalL[k], dL);
      spreadC[k] = dC;
    }
  }
  return { squares, size, mean, spreadL, spreadC };
}

// ---- the light, from the board itself -------------------------------------------------

export type Gain = [number, number, number];
export const NO_GAIN: Gain = [1, 1, 1];

/**
 * How the light has changed since the board was learnt, per colour channel (a white-balance
 * and exposure correction in one): the median ratio of what each sample sees now to what it
 * saw when learnt. A median, so counters and a hand covering part of the board don't move
 * it — the rest of the board outvotes them.
 */
export function estimateGain(observed: readonly number[], reference: readonly number[]): Gain {
  const ratios: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i + 2 < observed.length; i += 3) {
    for (let ch = 0; ch < 3; ch++) {
      const ref = reference[i + ch];
      if (ref < 20 || observed[i + ch] >= 250) continue; // too dark to trust, or clipped
      ratios[ch].push(observed[i + ch] / ref);
    }
  }
  const median = (a: number[]): number => {
    if (a.length < 12) return 1;
    a.sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  return ratios.map((a) => Math.max(0.4, Math.min(2.5, median(a)))) as Gain;
}

/**
 * The light varies across the board too — a shadow over one side, a lamp at one end. On
 * top of the whole-board correction, each region of the board gets its own brightness
 * correction, from the median of its own samples (counters are a minority of any region,
 * so the board outvotes them), blended smoothly between regions.
 */
export const LIGHT_REGIONS = 4;

export interface LightField {
  regions: number;
  /** Brightness factor per region (row-major), on top of the whole-board gain. */
  scale: Float32Array;
}

export function estimateLightField(
  observed: readonly number[], reference: readonly number[], uv: readonly number[], gain: Gain, regions = LIGHT_REGIONS,
): LightField {
  const buckets: number[][] = Array.from({ length: regions * regions }, () => []);
  for (let i = 0, s = 0; i + 2 < observed.length; i += 3, s += 2) {
    const yr = lum(reference[i], reference[i + 1], reference[i + 2]);
    if (yr < 24) continue;
    const yo = lum(observed[i] / gain[0], observed[i + 1] / gain[1], observed[i + 2] / gain[2]);
    const rx = Math.min(regions - 1, Math.max(0, Math.floor(uv[s] * regions)));
    const ry = Math.min(regions - 1, Math.max(0, Math.floor(uv[s + 1] * regions)));
    buckets[ry * regions + rx].push(yo / yr);
  }
  const scale = new Float32Array(regions * regions);
  for (let k = 0; k < scale.length; k++) {
    const a = buckets[k];
    if (a.length < 8) { scale[k] = 1; continue; }
    a.sort((x, y) => x - y);
    scale[k] = Math.max(0.45, Math.min(2.2, a[Math.floor(a.length / 2)]));
  }
  return { regions, scale };
}

/** The region correction at a board point, blended between region centres. */
export function lightAt(field: LightField, u: number, v: number): number {
  const n = field.regions;
  const fx = Math.max(0, Math.min(n - 1, u * n - 0.5));
  const fy = Math.max(0, Math.min(n - 1, v * n - 0.5));
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1); const y1 = Math.min(n - 1, y0 + 1);
  const tx = fx - x0; const ty = fy - y0;
  const s = field.scale;
  const top = s[y0 * n + x0] * (1 - tx) + s[y0 * n + x1] * tx;
  const bottom = s[y1 * n + x0] * (1 - tx) + s[y1 * n + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

// ---- is this the board? ---------------------------------------------------------------

/** How many times its own natural spread a pixel must move before it counts as "not the board". */
export const SPREAD_MULTIPLE = 4;
/** Floors, so a very even reference doesn't make camera noise look like a counter. */
const MIN_TOL_L = 0.14;
const MIN_TOL_C = 0.035;
/**
 * A shadow makes the board darker without changing its colour. Down to this much darker
 * (≈ 45% of the light), "same colour, darker" is a shadow; darker still is a dark counter.
 */
const SHADOW_FLOOR = Math.log(0.45);

/** The reference index for a point in board coordinates (0..1 each way). */
export function refIndex(ref: BoardReference, ux: number, uy: number): number {
  const x = Math.max(0, Math.min(ref.size - 1, Math.floor(ux * ref.size)));
  const y = Math.max(0, Math.min(ref.size - 1, Math.floor(uy * ref.size)));
  return y * ref.size + x;
}

/** Whether a light-corrected pixel is something other than the board at that spot. */
export function differsFromBoard(rgb: readonly [number, number, number], ref: BoardReference, k: number): boolean {
  const [r, g, b] = rgb;
  const mr = ref.mean[k * 3]; const mg = ref.mean[k * 3 + 1]; const mb = ref.mean[k * 3 + 2];
  const y = lum(r, g, b);
  const ym = lum(mr, mg, mb);
  const dl = Math.log(y / ym);
  const c = chroma(r, g, b);
  const cm = chroma(mr, mg, mb);
  const dc = Math.hypot(c[0] - cm[0], c[1] - cm[1]);
  const tolL = Math.max(MIN_TOL_L, SPREAD_MULTIPLE * ref.spreadL[k]);
  const tolC = Math.max(MIN_TOL_C, SPREAD_MULTIPLE * ref.spreadC[k]) + darkChromaSlack(Math.min(y, ym)) * 0.2;
  if (dc > tolC) return true;            // a different colour
  if (dl > tolL) return true;            // brighter than the board can be here
  if (dl < -tolL) return dl < SHADOW_FLOOR; // darker: a shadow, unless it is much darker
  return false;
}

// ---- which counter? ---------------------------------------------------------------------

export interface CounterPrototype {
  id: string;
  rgb: [number, number, number];
}

/** Parse "#rrggbb" (the colour a counter was found as). */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * How far apart two colours are, for choosing a counter: mostly by colour (chromaticity),
 * partly by lightness — enough to tell black from white and pink from red, not so much that
 * a counter in shadow becomes another colour.
 */
export function colourDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const ca = chroma(a[0], a[1], a[2]);
  const cb = chroma(b[0], b[1], b[2]);
  const ya = lum(a[0], a[1], a[2]);
  const yb = lum(b[0], b[1], b[2]);
  const dc = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) / (0.06 + 0.5 * darkChromaSlack(Math.min(ya, yb)));
  const dl = Math.log(ya / yb) / 0.45;
  return Math.hypot(dc, dl);
}

/** Further than this from every counter colour: something else (a hand, a sleeve, glare). */
export const MAX_COUNTER_DISTANCE = 3.2;
/** The nearest colour must win clearly, or the pixel is not counted for either. */
const CLEAR_WIN = 1.25;

/** The counter colour a pixel is clearly nearest, and how near; null when none clearly. */
export function nearestCounterWithDistance(
  rgb: readonly [number, number, number], protos: readonly CounterPrototype[],
): { id: string; distance: number } | null {
  let best: string | null = null;
  let d1 = Infinity;
  let d2 = Infinity;
  for (const p of protos) {
    const d = colourDistance(rgb, p.rgb);
    if (d < d1) { d2 = d1; d1 = d; best = p.id; } else if (d < d2) d2 = d;
  }
  if (best === null || d1 > MAX_COUNTER_DISTANCE) return null;
  if (d2 !== Infinity && d2 < d1 * CLEAR_WIN) return null;
  return { id: best, distance: d1 };
}

/** The counter colour a "not the board" pixel is, or null when it is none of them clearly. */
export function nearestCounter(rgb: readonly [number, number, number], protos: readonly CounterPrototype[]): string | null {
  return nearestCounterWithDistance(rgb, protos)?.id ?? null;
}

/**
 * Which counter this pixel is, if any, weighing the two explanations: the board at this
 * spot, or a counter. A pixel that clearly differs from the board is a counter if it is
 * clearly one colour. One that differs only a little still counts when it is MUCH nearer a
 * counter colour than the board here — a white counter on maple, a black one on walnut,
 * where the plain "differs from the board" test sits right on its limit. Grain and shadow
 * stay nearest the board, so they don't.
 */
export function counterAt(
  rgb: readonly [number, number, number], ref: BoardReference, k: number, protos: readonly CounterPrototype[],
): string | null {
  const near = nearestCounterWithDistance(rgb, protos);
  if (!near) return null;
  if (differsFromBoard(rgb, ref, k)) return near.id;
  const board: [number, number, number] = [ref.mean[k * 3], ref.mean[k * 3 + 1], ref.mean[k * 3 + 2]];
  const dBoard = colourDistance(rgb, board);
  return dBoard > 0.45 && near.distance < dBoard * 0.4 ? near.id : null;
}

// ---- storing it ---------------------------------------------------------------------

/** Compact storage: bytes, base64. About 27 KB for an 8×8 board. */
export interface StoredBoardReference {
  squares: number;
  size: number;
  mean: string;
  spreadL: string;
  spreadC: string;
}

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
// Spreads are small; store them at a fixed scale.
const L_SCALE = 400;
const C_SCALE = 2000;

export function storeBoardReference(ref: BoardReference): StoredBoardReference {
  const mean = new Uint8Array(ref.mean.length);
  for (let i = 0; i < mean.length; i++) mean[i] = Math.max(0, Math.min(255, Math.round(ref.mean[i])));
  const l = new Uint8Array(ref.spreadL.length);
  const c = new Uint8Array(ref.spreadC.length);
  for (let i = 0; i < l.length; i++) {
    l[i] = Math.min(255, Math.round(ref.spreadL[i] * L_SCALE));
    c[i] = Math.min(255, Math.round(ref.spreadC[i] * C_SCALE));
  }
  return { squares: ref.squares, size: ref.size, mean: toB64(mean), spreadL: toB64(l), spreadC: toB64(c) };
}

export function loadBoardReference(s: StoredBoardReference | null | undefined): BoardReference | null {
  if (!s || typeof s !== 'object') return null;
  try {
    const n = s.size * s.size;
    const meanB = fromB64(s.mean);
    const lB = fromB64(s.spreadL);
    const cB = fromB64(s.spreadC);
    if (meanB.length !== n * 3 || lB.length !== n || cB.length !== n) return null;
    return {
      squares: s.squares,
      size: s.size,
      mean: Float32Array.from(meanB),
      spreadL: Float32Array.from(lB, (v) => v / L_SCALE),
      spreadC: Float32Array.from(cB, (v) => v / C_SCALE),
    };
  } catch {
    return null;
  }
}

/** Shape check for stored JSON. */
export function isStoredBoardReference(v: unknown): v is StoredBoardReference {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && typeof o.squares === 'number' && typeof o.size === 'number'
    && typeof o.mean === 'string' && typeof o.spreadL === 'string' && typeof o.spreadC === 'string';
}
