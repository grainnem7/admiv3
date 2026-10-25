/**
 * "Find colours" against the learnt board: the counters standing on the board, found the
 * same way play finds them. Each spot of the board is compared with ITSELF as it was
 * learnt, after correcting the light from the board (so the camera adjusting its exposure
 * since then changes nothing), shadows are not counters, and the pixels that remain are
 * gathered into blobs — one per counter — whose colour is read from their middle, not the
 * edge where they blend into the wood.
 *
 * The old search compared each whole square with one learnt colour and a fixed threshold:
 * on a board with golden and pale walnut, after the camera had shifted its exposure a
 * little, it offered dozens of "counters" that were bare wood.
 */
import { applyHomography, type Mat3 } from '../../utils/homography';
import {
  differsFromBoard, estimateGain, estimateLightField, lightAt, REF_PIXELS_PER_SQUARE, sample2x2,
  type BoardReference, type FrameRGBA,
} from './boardReference';
import type { Blob } from '../boardColourDetect/detectColours';

/** A blob smaller than this share of a square is a speck or an edge, not a counter. */
export const MIN_COUNTER_SQUARES = 0.1;

/**
 * The counters on the board now, as blobs (colour, size, square), from a few frames taken
 * exactly as the reader sees them. A spot counts only if it differs from the board in most
 * of the frames, so a flicker or a passing hand doesn't make a counter.
 */
export function findCounterBlobs(
  frames: readonly FrameRGBA[], h: Mat3, ref: BoardReference, frameScale: number,
): Blob[] {
  const size = ref.size;
  const n = size * size;
  const votes = new Uint8Array(n);
  const sum = new Float64Array(n * 3);
  // Where each reference pixel is in the picture: the same for every frame.
  const at = new Float64Array(n * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = applyHomography(h, { x: (x + 0.5) / size, y: (y + 0.5) / size });
      at[(y * size + x) * 2] = p.x;
      at[(y * size + x) * 2 + 1] = p.y;
    }
  }
  for (const f of frames) {
    const obs = new Float32Array(n * 3);
    const allObs: number[] = [];
    const allRef: number[] = [];
    const allUv: number[] = [];
    for (let k = 0; k < n; k++) {
      const [r, g, b] = sample2x2(f, at[k * 2], at[k * 2 + 1], frameScale);
      obs[k * 3] = r; obs[k * 3 + 1] = g; obs[k * 3 + 2] = b;
      allObs.push(r, g, b);
      allRef.push(ref.mean[k * 3], ref.mean[k * 3 + 1], ref.mean[k * 3 + 2]);
      allUv.push(((k % size) + 0.5) / size, (Math.floor(k / size) + 0.5) / size);
    }
    const gain = estimateGain(allObs, allRef);
    const field = estimateLightField(allObs, allRef, allUv, gain);
    for (let k = 0; k < n; k++) {
      const local = lightAt(field, allUv[k * 2], allUv[k * 2 + 1]);
      const rgb: [number, number, number] = [
        obs[k * 3] / (gain[0] * local), obs[k * 3 + 1] / (gain[1] * local), obs[k * 3 + 2] / (gain[2] * local),
      ];
      if (!differsFromBoard(rgb, ref, k)) continue;
      votes[k]++;
      sum[k * 3] += rgb[0]; sum[k * 3 + 1] += rgb[1]; sum[k * 3 + 2] += rgb[2];
    }
  }
  const need = Math.max(1, Math.ceil(frames.length / 2));
  const fg = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (votes[k] >= need) fg[k] = 1;

  // Blobs: connected spots of "not the board".
  const minPixels = Math.max(3, Math.round(MIN_COUNTER_SQUARES * REF_PIXELS_PER_SQUARE * REF_PIXELS_PER_SQUARE));
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const blobs: Blob[] = [];
  for (let start = 0; start < n; start++) {
    if (!fg[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members: number[] = [];
    while (top > 0) {
      const p = stack[--top];
      members.push(p);
      const x = p % size; const y = (p - x) / size;
      const visit = (q: number): void => { if (fg[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; } };
      if (x > 0) visit(p - 1);
      if (x < size - 1) visit(p + 1);
      if (y > 0) visit(p - size);
      if (y < size - 1) visit(p + size);
    }
    if (members.length < minPixels) continue;
    // The colour from the middle of the blob: pixels whose four neighbours are all in it.
    const inner = members.filter((p) => {
      const x = p % size; const y = (p - x) / size;
      return x > 0 && y > 0 && x < size - 1 && y < size - 1 && fg[p - 1] && fg[p + 1] && fg[p - size] && fg[p + size];
    });
    const use = inner.length >= 3 ? inner : members;
    let r = 0; let g = 0; let b = 0; let cnt = 0; let cx = 0; let cy = 0;
    for (const p of use) {
      const v = votes[p];
      r += sum[p * 3] / v; g += sum[p * 3 + 1] / v; b += sum[p * 3 + 2] / v; cnt++;
    }
    for (const p of members) { cx += p % size; cy += Math.floor(p / size); }
    cx /= members.length; cy /= members.length;
    blobs.push({
      r: r / cnt, g: g / cnt, b: b / cnt, pixels: members.length,
      row: Math.min(ref.squares - 1, Math.floor((cy + 0.5) / REF_PIXELS_PER_SQUARE)),
      col: Math.min(ref.squares - 1, Math.floor((cx + 0.5) / REF_PIXELS_PER_SQUARE)),
    });
  }
  return blobs;
}
