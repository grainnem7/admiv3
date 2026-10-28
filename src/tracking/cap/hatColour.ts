/**
 * The learnt hat's colours: what colours the hat is, against what colours the room is, so
 * that "is this pixel the hat?" is one lookup per pixel.
 *
 * The cap used to be found by one fixed colour rule (a hue band from one click). Under other
 * light the hat's red moved out of the band and the cap was lost, and anything else red in
 * shot could pass for it. Here the room is learnt first (the player in place, hat off) and
 * then the hat; a pixel is the hat only when its colour is much more like the hat's learnt
 * shades than the room's. The light is corrected first, against a small picture of the room,
 * the way the board corrects it (`estimateGain`).
 *
 * Colours are described as the board describes them (boardReference.ts): chromaticity (the
 * red and green shares, which a brighter or dimmer light leaves alone) and log brightness.
 *
 * Pure — pixels in, answers out — so it is tested on synthetic pictures.
 */
import { estimateGain, type Gain } from '../boardReference/boardReference';
import type { Frame } from './capTracker';

// ---- colour bins ------------------------------------------------------------------------

/** Chromaticity bins each way (red share, green share). */
export const HAT_CHROMA_BINS = 32;
/** Brightness bins, on a log scale from black to white. */
export const HAT_LUM_BINS = 8;
export const HAT_BINS = HAT_LUM_BINS * HAT_CHROMA_BINS * HAT_CHROMA_BINS;

// Brightness as the board measures it, (r+g+b)/3 + 4, from black (4) to white (259).
const LOG_LO = Math.log(4);
const LOG_HI = Math.log(259);
/** The biggest r+g+b a light-corrected pixel can have (the gain is never below 0.4). */
const SUM_MAX = Math.ceil(765 / 0.4) + 1;
/** The brightness bin of each whole r+g+b: a table, so no logarithm per pixel. */
const LUM_OF_SUM = (() => {
  const t = new Uint8Array(SUM_MAX + 1);
  for (let s = 0; s <= SUM_MAX; s++) {
    const l = Math.floor(((Math.log(s / 3 + 4) - LOG_LO) / (LOG_HI - LOG_LO)) * HAT_LUM_BINS);
    t[s] = Math.max(0, Math.min(HAT_LUM_BINS - 1, l));
  }
  return t;
})();

/**
 * The bin of a light-corrected colour. The red and green shares always add to under 1, so
 * only about half of the chromaticity square is ever used (see `STORED`).
 */
export function hatBin(r: number, g: number, b: number): number {
  const sum = r + g + b;
  const l = LUM_OF_SUM[Math.min(SUM_MAX, Math.floor(sum))];
  const s = sum + 12;
  const i = Math.min(HAT_CHROMA_BINS - 1, Math.floor(((r + 4) / s) * HAT_CHROMA_BINS));
  const j = Math.min(HAT_CHROMA_BINS - 1, Math.floor(((g + 4) / s) * HAT_CHROMA_BINS));
  return (l * HAT_CHROMA_BINS + i) * HAT_CHROMA_BINS + j;
}

// ---- the light --------------------------------------------------------------------------

/** The room's small picture, for the light: about one value per 4 × 4 camera pixels. */
export const ROOM_PICTURE_W = 40;
export const ROOM_PICTURE_H = 30;
const PICTURE_LEN = ROOM_PICTURE_W * ROOM_PICTURE_H * 3;

/** The picture shrunk to 40 × 30 RGB, each value the mean of its block. */
export function smallPicture(f: Frame): Float32Array {
  const out = new Float32Array(PICTURE_LEN);
  const count = new Uint16Array(ROOM_PICTURE_W * ROOM_PICTURE_H);
  for (let y = 0; y < f.height; y++) {
    const row = Math.min(ROOM_PICTURE_H - 1, Math.floor((y * ROOM_PICTURE_H) / f.height)) * ROOM_PICTURE_W;
    for (let x = 0; x < f.width; x++) {
      const k = row + Math.min(ROOM_PICTURE_W - 1, Math.floor((x * ROOM_PICTURE_W) / f.width));
      const i = (y * f.width + x) * 4;
      out[k * 3] += f.data[i]; out[k * 3 + 1] += f.data[i + 1]; out[k * 3 + 2] += f.data[i + 2];
      count[k]++;
    }
  }
  for (let k = 0; k < count.length; k++) {
    if (count[k] === 0) continue;
    out[k * 3] /= count[k]; out[k * 3 + 1] /= count[k]; out[k * 3 + 2] /= count[k];
  }
  return out;
}

/**
 * How the light has changed since the room was learnt, per colour channel: the board's
 * median of ratios (`estimateGain`, clamped). The player and the hat moving cover part of
 * the picture; the rest of the room outvotes them. Too few usable samples: no correction.
 */
export function lightGain(f: Frame, roomPicture: ArrayLike<number>): Gain {
  return estimateGain(smallPicture(f), roomPicture);
}

/** Every pixel's colour bin, with the light change divided out. */
export function frameBins(f: Frame, gain: Gain): Uint16Array {
  const out = new Uint16Array(f.width * f.height);
  const [gr, gg, gb] = gain;
  const d = f.data;
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = hatBin(d[i] / gr, d[i + 1] / gg, d[i + 2] / gb);
  return out;
}

// ---- histograms -------------------------------------------------------------------------

/**
 * Blurred by one bin each way ([1 2 1] / 4 along each of the three axes, the ends kept): a
 * small shift in the light, or camera noise, still lands on learnt shades.
 */
export function blurHistogram(h: ArrayLike<number>): Float32Array {
  const C = HAT_CHROMA_BINS;
  let a = Float32Array.from(h);
  let b = new Float32Array(HAT_BINS);
  for (const [stride, len] of [[1, C], [C, C], [C * C, HAT_LUM_BINS]] as const) {
    for (let k = 0; k < HAT_BINS; k++) {
      const pos = Math.floor(k / stride) % len;
      const lo = pos > 0 ? k - stride : k;
      const hi = pos < len - 1 ? k + stride : k;
      b[k] = (a[lo] + 2 * a[k] + a[hi]) / 4;
    }
    [a, b] = [b, a];
  }
  return a;
}

// ---- the model --------------------------------------------------------------------------

export interface HatModel {
  /** How many pixels of each colour bin a picture of the hat has (blurred by one bin). */
  hat: Float32Array;
  /** The same for the room with the hat off: skin, clothes, chair, wall. */
  room: Float32Array;
  /** The room's small picture (40 × 30 RGB, 0..255): what the light is corrected against. */
  picture: Float32Array;
}

/** "How sure before it counts": the default and its range. */
export const HAT_SURE_DEFAULT = 0.6;
export const HAT_SURE_MIN = 0.3;
export const HAT_SURE_MAX = 0.9;
/**
 * How much the room counts against the hat (w). Above 1: a colour seen about as much in the
 * room as on the hat counts as the room, so the hat has to stand out to be the hat.
 */
export const HAT_ROOM_WEIGHT = 2;
/** In pixels per picture (ε): a colour the hat showed only a speck of is not, alone, the hat. */
export const HAT_EPSILON = 0.5;

/** How sure a colour bin is the hat: hat / (hat + room·w + ε), 0..1. */
export function hatLikelihood(m: HatModel, bin: number): number {
  const h = m.hat[bin];
  return h / (h + HAT_ROOM_WEIGHT * m.room[bin] + HAT_EPSILON);
}

/** Which bins are the hat at a sureness: worked out once per model and sureness. */
const tables = new WeakMap<HatModel, { sure: number; table: Uint8Array }>();
export function hatTable(m: HatModel, sure: number): Uint8Array {
  const cached = tables.get(m);
  if (cached && cached.sure === sure) return cached.table;
  const table = new Uint8Array(HAT_BINS);
  for (let b = 0; b < HAT_BINS; b++) table[b] = hatLikelihood(m, b) >= sure ? 1 : 0;
  tables.set(m, { sure, table });
  return table;
}

/** The pixels taken for the hat in this picture (1 = hat): the light corrected, then a lookup each. */
export function hatMask(f: Frame, m: HatModel, sure: number): Uint8Array {
  const table = hatTable(m, sure);
  const bins = frameBins(f, lightGain(f, m.picture));
  const mask = new Uint8Array(bins.length);
  for (let p = 0; p < bins.length; p++) mask[p] = table[bins[p]];
  return mask;
}

// ---- storing ----------------------------------------------------------------------------

/**
 * The learnt hat as saved with the player's cap settings. The two histograms keep only the
 * bins a picture can reach, one byte each on a log scale; the room's small picture is bytes.
 * All base64: about 16 KB in all, whatever was learnt.
 */
export interface StoredLearntHat {
  /** The storage format, so a later change can't misread an older hat. */
  v: 1;
  hat: string;
  room: string;
  picture: string;
  /** "How sure before it counts", HAT_SURE_MIN..HAT_SURE_MAX. */
  sure: number;
  /** When it was learnt (ms since 1970), to say so on screen. */
  learntAt: number;
}

/** The reachable bins (red share + green share under 1), in stored order. */
const STORED: Uint16Array = (() => {
  const C = HAT_CHROMA_BINS;
  const out: number[] = [];
  for (let l = 0; l < HAT_LUM_BINS; l++) {
    for (let i = 0; i < C; i++) for (let j = 0; i + j < C; j++) out.push((l * C + i) * C + j);
  }
  return Uint16Array.from(out);
})();

// Pixels per picture as one byte: 16 steps per doubling, from about 1/200 of a pixel up to
// about 7800 (a third of the picture in one bin, after the blur): within ±2% plus a speck.
const LOG_STEPS = 16;
const encodeCount = (v: number): number =>
  Math.max(0, Math.min(255, Math.round(LOG_STEPS * Math.log2(1 + 8 * Math.max(0, v)))));
const DECODE = Float32Array.from({ length: 256 }, (_, c) => (2 ** (c / LOG_STEPS) - 1) / 8);

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** The bytes of a base64 string, or null when it isn't one or isn't this long. */
function bytesOf(s: unknown, length: number): Uint8Array | null {
  if (typeof s !== 'string') return null;
  try {
    const bin = atob(s);
    if (bin.length !== length) return null;
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const clampSure = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v)
  ? Math.max(HAT_SURE_MIN, Math.min(HAT_SURE_MAX, v)) : HAT_SURE_DEFAULT);

export function storeLearntHat(m: HatModel, sure: number, learntAt: number): StoredLearntHat {
  const pack = (h: Float32Array): string => {
    const bytes = new Uint8Array(STORED.length);
    for (let k = 0; k < STORED.length; k++) bytes[k] = encodeCount(h[STORED[k]]);
    return toB64(bytes);
  };
  const picture = new Uint8Array(PICTURE_LEN);
  for (let i = 0; i < PICTURE_LEN; i++) picture[i] = Math.max(0, Math.min(255, Math.round(m.picture[i])));
  return { v: 1, hat: pack(m.hat), room: pack(m.room), picture: toB64(picture), sure: clampSure(sure), learntAt };
}

/** The model back from what was stored; null when anything is malformed. */
export function loadLearntHat(s: StoredLearntHat): HatModel | null {
  const hat = bytesOf(s.hat, STORED.length);
  const room = bytesOf(s.room, STORED.length);
  const picture = bytesOf(s.picture, PICTURE_LEN);
  if (!hat || !room || !picture) return null;
  // A hat with no colours at all is no hat: it would never be found.
  if (!hat.some((v) => v > 0)) return null;
  const unpack = (bytes: Uint8Array): Float32Array => {
    const out = new Float32Array(HAT_BINS);
    for (let k = 0; k < STORED.length; k++) out[STORED[k]] = DECODE[bytes[k]];
    return out;
  };
  return { hat: unpack(hat), room: unpack(room), picture: Float32Array.from(picture) };
}

/** A stored learnt hat as it may be loaded, or null for anything malformed (no learnt hat). */
export function sanitizeLearntHat(v: unknown): StoredLearntHat | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || typeof o.hat !== 'string' || typeof o.room !== 'string' || typeof o.picture !== 'string') return null;
  const s: StoredLearntHat = {
    v: 1, hat: o.hat, room: o.room, picture: o.picture,
    sure: clampSure(o.sure),
    learntAt: typeof o.learntAt === 'number' && Number.isFinite(o.learntAt) && o.learntAt >= 0 ? o.learntAt : 0,
  };
  return loadLearntHat(s) ? s : null;
}
