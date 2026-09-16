/**
 * Lighting check — is the picture lit well enough to tell squares from counters?
 *
 * The colour work downstream (squareModel → detectColours) learns what an empty square
 * looks like and then calls anything unlike it a counter. Two lighting faults break that
 * badly, and both are invisible to the "picture has colour" check:
 *
 *  - **Glare.** A light reflecting off a varnished board blows a patch to pure white. The
 *    light and dark squares under it become the same colour, so there is no board model
 *    left to learn, and the blown highlights also emit duplicate corner candidates that
 *    collapse the board-finding lattice.
 *  - **Uneven light.** A single lamp to one side makes the shadowed half's *board* darker
 *    than the lit half's board. The model then treats a whole family of squares as
 *    "not board" and offers the board's own wood as a counter colour.
 *
 * Catching this on the Camera step means the player moves a lamp once, instead of
 * discovering it after calibrating corners and colours.
 *
 * Everything here is pure: the caller does the frame grabbing.
 */

/** Value (0..100) at or above which a pixel counts as blown out. */
const BLOWN_VALUE = 98;
/** Value (0..100) at or below which a pixel counts as crushed to black. */
const CRUSHED_VALUE = 6;

/** Share of blown pixels that means a light is bouncing off the board. */
export const MAX_BLOWN_SHARE = 0.06;
/** Share of crushed pixels that means there simply isn't enough light. */
export const MAX_CRUSHED_SHARE = 0.25;
/**
 * Brightest patch ÷ darkest patch above which the light counts as uneven.
 *
 * Colour detection was measured to start mistaking the board for a counter at about
 * 2.5:1, so this warns a little before that.
 */
export const MAX_UNEVENNESS = 2.2;
/** Leaving a warning needs a clearly better reading, so a borderline feed can't flicker. */
const RECOVER_FACTOR = 0.8;

/** How many patches across and down the frame is divided into for the evenness test. */
const PATCHES = 3;

export interface LightingReading {
  /** 0..1 share of sampled pixels blown out to white. */
  blown: number;
  /** 0..1 share of sampled pixels crushed to black. */
  crushed: number;
  /** Brightest patch mean ÷ darkest patch mean (1 = perfectly even). */
  unevenness: number;
}

export type LightingProblem = 'glare' | 'too-dark' | 'uneven' | null;

/**
 * Measure an RGBA frame. `stride` samples every Nth pixel (1 = all).
 * Null when there is nothing to measure.
 */
export function readLighting(
  data: Uint8ClampedArray, width: number, height: number, stride = 4,
): LightingReading | null {
  if (width <= 0 || height <= 0 || data.length < 4) return null;
  const step = Math.max(1, Math.floor(stride));
  const sums = new Float64Array(PATCHES * PATCHES);
  const counts = new Uint32Array(PATCHES * PATCHES);
  let blown = 0;
  let crushed = 0;
  let n = 0;

  for (let y = 0; y < height; y += step) {
    const py = Math.min(PATCHES - 1, Math.floor((y / height) * PATCHES));
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (i + 2 >= data.length) continue;
      // Value in HSV terms is just the largest channel, which is what "blown" means.
      const v = Math.max(data[i], data[i + 1], data[i + 2]) * (100 / 255);
      const px = Math.min(PATCHES - 1, Math.floor((x / width) * PATCHES));
      const p = py * PATCHES + px;
      sums[p] += v;
      counts[p] += 1;
      if (v >= BLOWN_VALUE) blown += 1;
      else if (v <= CRUSHED_VALUE) crushed += 1;
      n += 1;
    }
  }
  if (n === 0) return null;

  let brightest = 0;
  let darkest = Infinity;
  for (let p = 0; p < sums.length; p++) {
    if (counts[p] === 0) continue;
    const mean = sums[p] / counts[p];
    if (mean > brightest) brightest = mean;
    if (mean < darkest) darkest = mean;
  }
  // A frame too dark to have a darkest patch worth dividing by is reported as dark, not
  // as wildly uneven — dividing by a near-zero mean would say "500:1" about a black room.
  const unevenness = darkest < 1 ? 1 : brightest / darkest;

  return { blown: blown / n, crushed: crushed / n, unevenness };
}

/** The worst problem in this reading, or null when the light is good enough. */
export function lightingProblem(r: LightingReading | null): LightingProblem {
  if (r === null) return null;
  // Glare first: it is the most destructive and the easiest to act on.
  if (r.blown > MAX_BLOWN_SHARE) return 'glare';
  if (r.crushed > MAX_CRUSHED_SHARE) return 'too-dark';
  if (r.unevenness > MAX_UNEVENNESS) return 'uneven';
  return null;
}

/**
 * Latched problem with hysteresis, like the colourless check: a feed sitting on a
 * threshold must not flash a warning on and off or re-announce it every second.
 */
export function nextLightingProblem(
  prev: LightingProblem, r: LightingReading | null,
): LightingProblem {
  if (r === null) return prev;
  const now = lightingProblem(r);
  if (now !== null) return now;
  if (prev === null) return null;
  // Clearing needs to be comfortably better, not a hair better.
  const cleared = prev === 'glare' ? r.blown <= MAX_BLOWN_SHARE * RECOVER_FACTOR
    : prev === 'too-dark' ? r.crushed <= MAX_CRUSHED_SHARE * RECOVER_FACTOR
      : r.unevenness <= MAX_UNEVENNESS * RECOVER_FACTOR;
  return cleared ? null : prev;
}

/** What to say about it, in the player's terms: what is wrong, and what to do. */
export function describeLighting(problem: LightingProblem): string | null {
  switch (problem) {
    case 'glare':
      return 'A light is bouncing off the board. Move the lamp to one side, or tilt the board, until the bright patch is gone.';
    case 'too-dark':
      return 'It’s too dark to tell the squares apart. Turn a light on, or move the board somewhere brighter.';
    case 'uneven':
      return 'One side of the board is much brighter than the other. Even the light out, or the board’s own colour can be mistaken for a counter.';
    default:
      return null;
  }
}
