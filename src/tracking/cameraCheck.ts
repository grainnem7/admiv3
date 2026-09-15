/**
 * Camera check — pure helpers that tell whether the frames the app actually
 * READS (drawImage → getImageData) carry colour. A <video> can look colourful on
 * screen while the pixels handed to detection are greyscale or washed out (some
 * virtual cameras / phone-webcam apps / driver settings), which makes colour
 * calibration capture black/white/grey. Surfacing this makes the failure visible
 * instead of silently mis-calibrating.
 */

import { rgbToHsv } from './ColorTracker';

/** Mean saturation (0..100) below which the feed is treated as black-and-white. */
export const COLOURLESS_SATURATION = 6;

// Near-black / near-white pixels have unstable (noisy) HSV saturation, so they are
// excluded — otherwise sensor noise in shadows makes a grey feed look colourful.
const MIN_VALUE = 12;
const MAX_VALUE = 97;

/**
 * Mean HSV saturation (0..100) of an RGBA frame's mid-tone pixels. `stride`
 * samples every Nth pixel (1 = all). Null when no pixel is usable (empty, or all
 * near-black/near-white).
 */
export function frameMeanSaturation(data: Uint8ClampedArray, stride = 1): number | null {
  const step = Math.max(1, Math.floor(stride)) * 4;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += step) {
    const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (hsv.v < MIN_VALUE || hsv.v > MAX_VALUE) continue;
    sum += hsv.s;
    n += 1;
  }
  return n === 0 ? null : sum / n;
}

/** Mean saturation above which a feed flagged colourless counts as colourful again. */
export const COLOURFUL_SATURATION = 9;

/** True when a mean-saturation reading says the feed has (almost) no colour. */
export function looksColourless(meanSaturation: number | null): boolean {
  return meanSaturation !== null && meanSaturation < COLOURLESS_SATURATION;
}

/**
 * Latched colourless state with hysteresis: enter below COLOURLESS_SATURATION,
 * leave only above COLOURFUL_SATURATION, keep the state on a null reading. A feed
 * hovering near one threshold (a hand entering frame, a washed-out camera) then
 * can't flash the warning on and off or re-announce it every second.
 */
export function nextColourlessState(prev: boolean, meanSaturation: number | null): boolean {
  if (meanSaturation === null) return prev;
  if (prev) return meanSaturation <= COLOURFUL_SATURATION;
  return looksColourless(meanSaturation);
}
