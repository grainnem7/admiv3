/**
 * The board watcher: which cells an arm or hand is over, from image logic alone.
 *
 * It learns what the empty board looks like, then marks the points that differ from it.
 * The trick that separates a hand from a counter is where the difference *starts*: a
 * counter is placed inside the playing squares and never crosses the board's edge, while
 * an arm always reaches in from outside. So only differences that touch the ring around
 * the board (or the edge of the picture) seed the mask, and the mask then floods through
 * the connected difference.
 *
 * No model, no download, no worker — about 0.1 ms a frame on the research machine.
 * Every threshold is named and meant to be tuned on real frames.
 */
import { applyHomography, type Mat3 } from '../../utils/homography';

/** Points per side of the watch grid. Small on purpose: this runs every camera frame. */
export const WATCH_SIZE = 48;
/** How far past the playing squares the grid reaches, as a fraction of the board. */
export const DEFAULT_RING_FRAC = 0.12;
/** Frames of stillness before the background is trusted. */
export const STILL_FRAMES_NEEDED = 5;
/** Mean grey change per point below which a frame counts as still. */
export const STILL_MAX = 6;
/** Share of ring points that must differ for the whole picture to count as changed. */
export const GLOBAL_RING_SHARE = 0.5;
/** …and for how long (ms) before it is treated as a bump rather than an arm. */
export const GLOBAL_HOLD_MS = 1000;
/** Time constant for folding new, settled scenery into the background (s). */
export const DEFAULT_BG_TAU_SEC = 2;

export interface WatchGrid {
  size: number;
  ringFrac: number;
  rows: number;
  cols: number;
  boardSquares: number;
  /** Index into the RGBA frame for each grid point, or -1 when it falls off the picture. */
  imgIdx: Int32Array;
  offImage: Uint8Array;
  inSquares: Uint8Array;
  /** Grid cell (row * cols + col) for points inside the playing squares, else -1. */
  cellOf: Int16Array;
  /** Each point's board coordinates (u, v interleaved), so tracking can re-project them. */
  uv: Float32Array;
}

export interface FrameInfo {
  width: number;
  height: number;
  /** The reader samples a downscaled frame; the homography is in full-resolution pixels. */
  downscale: number;
}

/** Project the watch grid through the homography once per homography/grid change. */
export function buildWatchGrid(
  h: Mat3, frame: FrameInfo, rows: number, cols: number, boardSquares: number,
  ringFrac = DEFAULT_RING_FRAC, size = WATCH_SIZE,
): WatchGrid {
  const n = size * size;
  const imgIdx = new Int32Array(n);
  const offImage = new Uint8Array(n);
  const inSquares = new Uint8Array(n);
  const cellOf = new Int16Array(n);
  const uv = new Float32Array(n * 2);
  const span = 1 + 2 * ringFrac;

  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const i = gy * size + gx;
      const u = -ringFrac + (gx / (size - 1)) * span;
      const v = -ringFrac + (gy / (size - 1)) * span;
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
      const p = applyHomography(h, { x: u, y: v });
      const px = Math.round(p.x / frame.downscale);
      const py = Math.round(p.y / frame.downscale);
      if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) {
        imgIdx[i] = -1;
        offImage[i] = 1;
        cellOf[i] = -1;
        continue;
      }
      imgIdx[i] = (py * frame.width + px) * 4;
      const inside = u >= 0 && u < 1 && v >= 0 && v < 1;
      inSquares[i] = inside ? 1 : 0;
      cellOf[i] = inside
        ? Math.min(rows - 1, Math.floor(v * rows)) * cols + Math.min(cols - 1, Math.floor(u * cols))
        : -1;
    }
  }
  return { size, ringFrac, rows, cols, boardSquares, imgIdx, offImage, inSquares, cellOf, uv };
}

export interface WatchState {
  /** Learnt background, 3 channels per grid point, or null until a clear view is seen. */
  bg: Float32Array | null;
  ready: boolean;
  stillFrames: number;
  prevGrey: Float32Array | null;
  globalSince: number | null;
  global: boolean;
  /** First time each cell was covered, for the resting hint. */
  maskSince: Map<number, number>;
  /** When each cell stops being held, so a hand lifting doesn't snap cells back. */
  heldUntil: Map<number, number>;
}

export interface WatcherOpts {
  sensitivity: number;
  marginSquares: number;
  releaseMs: number;
  restNudgeMs: number;
  bgTauSec?: number;
  dtMs: number;
}

export interface WatchStep {
  state: WatchState;
  /** 1 for grid points covered by a hand or arm. */
  mask: Uint8Array;
  /** Cells (row * cols + col) currently held. */
  heldCells: Set<number>;
  resting: boolean;
  global: boolean;
  ready: boolean;
}

export function initialWatchState(): WatchState {
  return {
    bg: null, ready: false, stillFrames: 0, prevGrey: null,
    globalSince: null, global: false, maskSince: new Map(), heldUntil: new Map(),
  };
}

const median = (v: number[]): number => {
  if (v.length === 0) return 1;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Advance the watcher by one camera frame. `prev` is not mutated. */
export function stepWatcher(
  prev: WatchState, grid: WatchGrid, rgba: Uint8ClampedArray, now: number, opts: WatcherOpts,
): WatchStep {
  const n = grid.size * grid.size;
  const mask = new Uint8Array(n);
  const state: WatchState = {
    bg: prev.bg,
    ready: prev.ready,
    stillFrames: prev.stillFrames,
    prevGrey: prev.prevGrey,
    globalSince: prev.globalSince,
    global: prev.global,
    maskSince: new Map(prev.maskSince),
    heldUntil: new Map(prev.heldUntil),
  };

  // Sample the grid once; -1 means the point is outside the picture.
  const cur = new Float32Array(n * 3);
  const grey = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = grid.imgIdx[i];
    if (idx < 0) continue;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    cur[i * 3] = r;
    cur[i * 3 + 1] = g;
    cur[i * 3 + 2] = b;
    grey[i] = (r + g + b) / 3;
  }

  // Stillness, from one frame to the next: the background may only be learnt from a
  // picture that is holding steady.
  let still = false;
  if (state.prevGrey) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (grid.imgIdx[i] < 0) continue;
      sum += Math.abs(grey[i] - state.prevGrey[i]);
      count++;
    }
    still = count > 0 && sum / count < STILL_MAX;
  }
  state.prevGrey = grey;

  if (!state.bg) {
    state.stillFrames = still ? state.stillFrames + 1 : 0;
    if (state.stillFrames >= STILL_FRAMES_NEEDED) {
      state.bg = Float32Array.from(cur);
      state.ready = true;
    }
    // Until there is a clear view the board behaves exactly as it does without a guard.
    return { state, mask, heldCells: new Set(), resting: false, global: false, ready: state.ready };
  }

  const bg = state.bg;

  // Auto-exposure makes the whole picture dim or brighten at once. Compare against the
  // background's median ratio so a dip isn't read as a hand over everything.
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    if (grid.imgIdx[i] < 0 || grid.inSquares[i]) continue;
    const bgGrey = (bg[i * 3] + bg[i * 3 + 1] + bg[i * 3 + 2]) / 3;
    if (bgGrey > 8) ratios.push(grey[i] / bgGrey);
  }
  const gain = Math.max(0.5, Math.min(2, median(ratios)));

  const dev = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (grid.imgIdx[i] < 0) continue;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(cur[i * 3 + c] - gain * bg[i * 3 + c]));
    dev[i] = d > opts.sensitivity ? 1 : 0;
  }

  // A camera bump or a lighting change moves everything at once: that is not a hand, and
  // holding the whole board would be worse than doing nothing.
  let ringPoints = 0;
  let ringDev = 0;
  for (let i = 0; i < n; i++) {
    if (grid.imgIdx[i] < 0 || grid.inSquares[i]) continue;
    ringPoints++;
    ringDev += dev[i];
  }
  const ringShare = ringPoints > 0 ? ringDev / ringPoints : 0;
  if (ringShare > GLOBAL_RING_SHARE) {
    state.globalSince = state.globalSince ?? now;
    state.global = now - state.globalSince >= GLOBAL_HOLD_MS;
  } else {
    state.globalSince = null;
    state.global = false;
  }

  if (state.global) {
    // Re-learn once the picture settles again; hold nothing in the meantime.
    if (still) {
      state.stillFrames += 1;
      if (state.stillFrames >= STILL_FRAMES_NEEDED) {
        state.bg = Float32Array.from(cur);
        state.globalSince = null;
        state.global = false;
        state.stillFrames = 0;
      }
    } else {
      state.stillFrames = 0;
    }
    state.maskSince.clear();
    state.heldUntil.clear();
    return { state, mask, heldCells: new Set(), resting: false, global: true, ready: true };
  }

  // Seeds: a difference that touches the ring, or the edge of the picture. A counter
  // placed inside the squares can never seed the mask; an arm reaching in always does.
  const size = grid.size;
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!dev[i] || grid.imgIdx[i] < 0) continue;
    let seed = grid.inSquares[i] === 0;
    if (!seed) {
      const gx = i % size;
      const gy = (i / size) | 0;
      const neighbours = [
        gx > 0 ? i - 1 : -1, gx < size - 1 ? i + 1 : -1,
        gy > 0 ? i - size : -1, gy < size - 1 ? i + size : -1,
      ];
      seed = neighbours.some((j) => j >= 0 && grid.offImage[j] === 1);
    }
    if (seed) { mask[i] = 1; stack.push(i); }
  }

  while (stack.length > 0) {
    const i = stack.pop() as number;
    const gx = i % size;
    const gy = (i / size) | 0;
    const neighbours = [
      gx > 0 ? i - 1 : -1, gx < size - 1 ? i + 1 : -1,
      gy > 0 ? i - size : -1, gy < size - 1 ? i + size : -1,
    ];
    for (const j of neighbours) {
      if (j < 0 || mask[j] || !dev[j] || grid.imgIdx[j] < 0) continue;
      mask[j] = 1;
      stack.push(j);
    }
  }

  // Keep a margin around the hand: a counter right beside a finger is still under it as
  // far as the player is concerned.
  const pointsPerSquare = size / ((1 + 2 * grid.ringFrac) * Math.max(1, grid.boardSquares));
  const radius = Math.max(0, Math.round(opts.marginSquares * pointsPerSquare));
  const dilated = radius > 0 ? dilate(mask, size, radius) : mask;

  const covered = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (!dilated[i]) continue;
    const cell = grid.cellOf[i];
    if (cell >= 0) covered.add(cell);
  }

  for (const cell of covered) {
    if (!state.maskSince.has(cell)) state.maskSince.set(cell, now);
    state.heldUntil.set(cell, now + opts.releaseMs);
  }
  for (const cell of [...state.maskSince.keys()]) {
    if (!covered.has(cell)) state.maskSince.delete(cell);
  }

  const heldCells = new Set<number>();
  for (const [cell, until] of state.heldUntil) {
    if (until > now) heldCells.add(cell);
    else state.heldUntil.delete(cell);
  }

  let resting = false;
  for (const since of state.maskSince.values()) {
    if (now - since >= opts.restNudgeMs) { resting = true; break; }
  }

  // Any movement in the picture restarts the count towards "still enough to re-learn",
  // so a bump can't re-learn instantly on the strength of stillness before it happened.
  state.stillFrames = still && covered.size === 0 ? state.stillFrames + 1 : 0;

  // Fold settled scenery (a newly placed counter) into the background, but never while a
  // hand is in the picture — otherwise the hand becomes part of "the board".
  if (covered.size === 0) {
    const tau = Math.max(0.05, opts.bgTauSec ?? DEFAULT_BG_TAU_SEC);
    const alpha = 1 - Math.exp(-(opts.dtMs / 1000) / tau);
    const next = Float32Array.from(bg);
    for (let i = 0; i < n; i++) {
      if (grid.imgIdx[i] < 0 || dilated[i]) continue;
      for (let c = 0; c < 3; c++) {
        const k = i * 3 + c;
        next[k] = bg[k] + alpha * (cur[k] - bg[k]);
      }
    }
    state.bg = next;
  }

  return { state, mask: dilated, heldCells, resting, global: false, ready: true };
}

/** Grow the mask by `radius` grid points (square structuring element, separable). */
function dilate(mask: Uint8Array, size: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= size) continue;
        on = mask[y * size + xx];
      }
      tmp[y * size + x] = on;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= size) continue;
        on = tmp[yy * size + x];
      }
      out[y * size + x] = on;
    }
  }
  return out;
}
