/**
 * Is the camera delivering colour at all?
 *
 * A virtual camera (a phone bridged over USB, a capture app) can hand the browser a
 * picture with no chroma in it: every pixel has R = G = B. That is what you get from the
 * luma plane of NV12 or I420 on its own, and it is indistinguishable from a real
 * black-and-white feed. Colour tracking cannot work on it, and — the part that matters in
 * a workshop — it fails *silently*: the preview looks like a perfectly good picture of the
 * room, just grey, and every colour simply stops being found.
 *
 * This is deliberately a different test from `cameraCheck`'s mean saturation. That one
 * asks "is there enough colour to calibrate against?", which a washed-out but genuinely
 * colour camera can fail. This one asks the narrower, harder question: "are the three
 * channels the SAME?" — which only happens when chroma is missing altogether. Being
 * narrow is the point: it is the difference between "your lighting is poor" and "this
 * camera is not sending colour", and those need different advice.
 *
 * Pure: the caller grabs the pixels.
 */

/** Channels within this many levels of each other count as equal (sensor noise). */
export const GREY_TOLERANCE = 2;
/** Share of usable pixels that must be achromatic before the feed is called greyscale. */
export const GREY_SHARE = 0.98;
/** How long to watch before saying anything. */
export const GREY_WINDOW_MS = 1000;
/** Pixels darker than this carry no reliable colour (black is achromatic in any feed). */
const MIN_VALUE = 16;
/** …and neither do blown-out ones. */
const MAX_VALUE = 248;
/** Sample every Nth pixel: this runs on live frames. */
const STRIDE = 4;

export interface ChannelEquality {
  /** How many pixels were bright enough and dark enough to judge. */
  sampled: number;
  /** 0..1 share of those whose R, G and B are equal within the tolerance. */
  achromatic: number;
}

/** Measure one RGBA frame. Null when no pixel in it can carry colour either way. */
export function channelEquality(data: Uint8ClampedArray, stride = STRIDE): ChannelEquality | null {
  const step = Math.max(1, Math.floor(stride)) * 4;
  let sampled = 0;
  let flat = 0;
  for (let i = 0; i + 2 < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi < MIN_VALUE || hi > MAX_VALUE) continue;
    sampled += 1;
    if (hi - lo <= GREY_TOLERANCE) flat += 1;
  }
  return sampled === 0 ? null : { sampled, achromatic: flat / sampled };
}

export interface GreyscaleWatch {
  /** When the first frame was measured, so the window can close. */
  startedAt: number | null;
  /** Latest time seen. */
  now: number;
  /** True once ANY frame showed real colour — decisive, and never unset. */
  sawColour: boolean;
  /** Frames measured so far. */
  frames: number;
}

export function initialGreyscaleWatch(): GreyscaleWatch {
  return { startedAt: null, now: 0, sawColour: false, frames: 0 };
}

/** Fold one frame in. `now` is any monotonic millisecond clock. */
export function stepGreyscaleWatch(
  prev: GreyscaleWatch, data: Uint8ClampedArray, now: number,
): GreyscaleWatch {
  const measured = channelEquality(data);
  if (measured === null) return { ...prev, now };
  return {
    startedAt: prev.startedAt ?? now,
    now,
    // One frame with real colour in it settles the question for good: a feed that can
    // produce colour is not a luma-only feed, whatever later frames look like.
    sawColour: prev.sawColour || measured.achromatic < GREY_SHARE,
    frames: prev.frames + 1,
  };
}

export type GreyscaleVerdict = 'watching' | 'colour' | 'greyscale';

/** What the watch has concluded. 'watching' until the window has actually elapsed. */
export function greyscaleVerdict(w: GreyscaleWatch): GreyscaleVerdict {
  if (w.sawColour) return 'colour';
  if (w.startedAt === null || w.now - w.startedAt < GREY_WINDOW_MS) return 'watching';
  return 'greyscale';
}

/** What to tell the facilitator, in their terms. Null while there is nothing to say. */
export function describeGreyscale(verdict: GreyscaleVerdict): string | null {
  return verdict === 'greyscale'
    ? 'This camera is sending a black-and-white picture, so no colour can be tracked. Try another resolution, or pick a different camera.'
    : null;
}
