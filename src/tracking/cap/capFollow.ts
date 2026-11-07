/**
 * Following the hat from frame to frame, robustly (owner, 2026-11-07: the hat must be
 * performance ready). The patches of hat colour in each picture come from the clicked colour
 * or the learnt hat; this decides which of them is the hat, frame after frame:
 *
 * - **One hat, not its pieces.** A shadow across the crown or a logo on it splits the hat's
 *   colour into pieces; following one piece made the position jump between them. Pieces
 *   close to the one followed are taken together, weighted by size.
 * - **Not grabbed by a flash of red.** With the hat followed, a patch far from it (someone
 *   walking past in red, a light) only takes over once it has been seen in the same place for
 *   several frames running, or once the hat has been lost for a while (it really moved, or the
 *   camera did). Until then nothing changes: the values hold.
 * - **Reinforced by the face.** With the player's face seen (Check it is on the head), red on
 *   the head is the hat, taken at once wherever it is (a quick turn of the head waits for
 *   nothing), and red off the head is never chosen over it, however big or near.
 * - **The colour follows the light.** Stage light drifts during a show. In clicked colour
 *   mode the colour band moves slowly towards the hat as it is seen now, never far from the
 *   colour that was clicked.
 *
 * Pure: patches and pixels in, a sighting and a state out.
 */

import { rgbToHsv } from '../ColorTracker';
import { onTheHead, type CapColour, type CapPatch, type CapSighting, type FaceBox, type Frame } from './capTracker';

/** Patches whose boxes come within this of the followed patch's box are the same hat. */
export const MERGE_GAP = 0.05;
/** A patch this near where the hat was is the hat (a head moves this far in a frame or two). */
export const NEAR_RADIUS = 0.2;
/** A far patch must be seen this many frames running in about the same place to take over. */
export const CONFIRM_FRAMES = 4;
/** "About the same place", for a far patch waiting to be confirmed. */
const CANDIDATE_RADIUS = 0.1;
/** Lost this many frames (about half a second at 25 a second), any patch may take over at once. */
export const LOST_FRAMES = 12;

export interface FollowState {
  /** Where the hat was last followed. */
  last: { x: number; y: number } | null;
  /** A far patch waiting to be confirmed: where, and for how many frames running. */
  candidate: { x: number; y: number; frames: number } | null;
  /** Frames running with no hat followed. */
  lostFrames: number;
}

export const initialFollow = (): FollowState => ({ last: null, candidate: null, lostFrames: 0 });

const gap = (a: CapPatch, b: CapPatch): number => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

/** The followed patch and the pieces next to it, as one: the size-weighted centre and the total size. */
export function mergePieces(main: CapPatch, patches: readonly CapPatch[]): CapSighting {
  let area = 0; let sx = 0; let sy = 0;
  for (const p of patches) {
    if (p !== main && gap(p, main) > MERGE_GAP) continue;
    area += p.area; sx += p.x * p.area; sy += p.y * p.area;
  }
  return area > 0 ? { x: sx / area, y: sy / area, area } : { x: main.x, y: main.y, area: main.area };
}

/** The best patch: biggest, near where the hat was counting for more. */
function best(patches: readonly CapPatch[], near: { x: number; y: number } | null): CapPatch | null {
  let pick: CapPatch | null = null;
  let top = 0;
  for (const p of patches) {
    const k = near ? 1 / (1 + 4 * Math.hypot(p.x - near.x, p.y - near.y)) : 1;
    const score = p.area * k;
    if (score > top) { top = score; pick = p; }
  }
  return pick;
}

/**
 * This frame's hat among its patches. With the player's face (seen within the last moment),
 * red on the head is the hat at once. Otherwise the hat is followed where it was if any patch
 * is near it; a far patch must be confirmed; with nothing to follow yet, the biggest is the hat.
 */
export interface Followed {
  sighting: CapSighting | null;
  /** The patch followed (its box, for the colour as seen now), when there is one. */
  patch: CapPatch | null;
  state: FollowState;
}

export function followCap(patches: readonly CapPatch[], st: FollowState, face: FaceBox | null = null): Followed {
  const lost = (): Followed => ({ sighting: null, patch: null, state: { ...st, lostFrames: st.lostFrames + 1 } });
  if (patches.length === 0) return lost();
  const last = st.lostFrames >= LOST_FRAMES ? null : st.last;
  // The face says where the hat must be: red on the head is the hat, now.
  const onHead = face ? patches.filter((p) => onTheHead(p, face)) : [];
  if (onHead.length > 0) {
    const p = best(onHead, last);
    if (!p) return lost();
    const s = mergePieces(p, onHead);
    return { sighting: s, patch: p, state: { last: { x: s.x, y: s.y }, candidate: null, lostFrames: 0 } };
  }
  if (!last) {
    const p = best(patches, null);
    if (!p) return lost();
    const s = mergePieces(p, patches);
    return { sighting: s, patch: p, state: { last: { x: s.x, y: s.y }, candidate: null, lostFrames: 0 } };
  }
  const near = patches.filter((p) => Math.hypot(p.x - last.x, p.y - last.y) <= NEAR_RADIUS);
  if (near.length > 0) {
    const p = best(near, last);
    if (!p) return lost();
    const s = mergePieces(p, patches);
    return { sighting: s, patch: p, state: { last: { x: s.x, y: s.y }, candidate: null, lostFrames: 0 } };
  }
  // Only far patches: the biggest must hold its place a few frames before it is the hat.
  const far = best(patches, st.candidate);
  if (!far) return lost();
  const same = st.candidate && Math.hypot(far.x - st.candidate.x, far.y - st.candidate.y) <= CANDIDATE_RADIUS;
  const frames = same && st.candidate ? st.candidate.frames + 1 : 1;
  if (frames >= CONFIRM_FRAMES) {
    const s = mergePieces(far, patches);
    return { sighting: s, patch: far, state: { last: { x: s.x, y: s.y }, candidate: null, lostFrames: 0 } };
  }
  return { sighting: null, patch: null, state: { ...st, candidate: { x: far.x, y: far.y, frames }, lostFrames: st.lostFrames + 1 } };
}

/**
 * The mask grown by one pixel each way: the hat's colour broken by a seam, a shadow line or a
 * small logo joins up again before its patches are found.
 */
export function growMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] || (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) out[i] = 1;
    }
  }
  return out;
}

// ---- the colour following the light ------------------------------------------------------

/** How far the colour may drift from the one clicked: degrees of hue, and floors. */
export const DRIFT_HUE = 14;
/** How much of the way to the hat as seen now the colour moves each time it is updated. */
const DRIFT_RATE = 0.08;

const hueDelta = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

/** The hat's colour as seen now: the circular mean hue and the median saturation and brightness of its pixels. */
export function seenColour(f: Frame, mask: Uint8Array, box: { x0: number; y0: number; x1: number; y1: number }): { hue: number; s: number; v: number } | null {
  const x0 = Math.max(0, Math.floor(box.x0 * f.width)); const x1 = Math.min(f.width, Math.ceil(box.x1 * f.width));
  const y0 = Math.max(0, Math.floor(box.y0 * f.height)); const y1 = Math.min(f.height, Math.ceil(box.y1 * f.height));
  let sin = 0; let cos = 0; const ss: number[] = []; const vs: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * f.width + x;
      if (!mask[i]) continue;
      const hsv = rgbToHsv(f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]);
      const r = (hsv.h * Math.PI) / 180;
      sin += Math.sin(r); cos += Math.cos(r); ss.push(hsv.s); vs.push(hsv.v);
    }
  }
  if (ss.length < 12) return null;
  const med = (a: number[]): number => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return { hue: ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360, s: med(ss), v: med(vs) };
}

/**
 * The colour, a step towards the hat as seen now, never further than DRIFT_HUE from the
 * clicked hue, and its floors never above what was clicked (a dimmer light lowers them, so
 * the hat in shade is still the hat; they come back up when the light does).
 */
export function driftColour(clicked: CapColour, now: CapColour, seen: { hue: number; s: number; v: number }): CapColour {
  const toward = now.hue + hueDelta(now.hue, seen.hue) * DRIFT_RATE;
  const off = hueDelta(clicked.hue, toward);
  const hue = (clicked.hue + Math.max(-DRIFT_HUE, Math.min(DRIFT_HUE, off)) + 360) % 360;
  const step = (cur: number, goal: number, cap: number): number => Math.min(cap, cur + (goal - cur) * DRIFT_RATE);
  return {
    hue,
    hueTolerance: clicked.hueTolerance,
    minSaturation: Math.max(20, step(now.minSaturation, seen.s * 0.6, clicked.minSaturation)),
    minValue: Math.max(10, step(now.minValue, seen.v * 0.4, clicked.minValue)),
  };
}
