import { describe, it, expect } from 'vitest';
import {
  channelEquality, initialGreyscaleWatch, stepGreyscaleWatch, greyscaleVerdict,
  GREY_TOLERANCE, GREY_SHARE, GREY_WINDOW_MS,
} from '../tracking/greyscaleWatch';

/** A frame whose pixels come from `at(i)`, as RGBA. */
function frame(n: number, at: (i: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = at(i);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return d;
}

const grey = (n = 400) => frame(n, (i) => { const v = (i * 7) % 256; return [v, v, v]; });
const colour = (n = 400) => frame(n, (i) => [(i * 7) % 256, (i * 13) % 256, (i * 29) % 256]);

describe('channelEquality', () => {
  it('a luma-only frame reads as entirely achromatic', () => {
    // This is the signature of reading plane 0 of NV12/I420, or a virtual camera
    // delivering luma with no chroma: R, G and B are not merely close, they are EQUAL.
    const r = channelEquality(grey())!;
    expect(r.achromatic).toBe(1);
  });

  it('a colour frame is not', () => {
    expect(channelEquality(colour())!.achromatic).toBeLessThan(0.2);
  });

  it('tolerates the couple of levels a real sensor wobbles by', () => {
    const nearly = frame(400, (i) => {
      const v = 40 + ((i * 7) % 180);
      return [v, v + 1, v - 1];
    });
    expect(channelEquality(nearly)!.achromatic).toBe(1);
    expect(GREY_TOLERANCE).toBeGreaterThan(0);
  });

  it('ignores pixels too dark or too bright to carry colour at all', () => {
    // Black and blown-out pixels are achromatic in ANY feed, so counting them would
    // call a dim room greyscale.
    const mixed = frame(400, (i) => (i < 300 ? [0, 0, 0] : [200, 40, 40]));
    const r = channelEquality(mixed, 1)!;   // stride 1: every pixel, so the count is exact
    expect(r.sampled).toBe(100);            // the 300 black ones carry no colour either way
    expect(r.achromatic).toBe(0);
  });

  it('has nothing to say about a frame with no usable pixels', () => {
    expect(channelEquality(frame(10, () => [0, 0, 0]))).toBeNull();
    expect(channelEquality(new Uint8ClampedArray(0))).toBeNull();
  });
});

describe('the first second of capture', () => {
  const run = (make: () => Uint8ClampedArray, ms: number) => {
    let w = initialGreyscaleWatch();
    for (let t = 0; t <= ms; t += 100) w = stepGreyscaleWatch(w, make(), t);
    return w;
  };

  it('says nothing until it has watched long enough', () => {
    const early = run(grey, GREY_WINDOW_MS / 3);
    expect(greyscaleVerdict(early)).toBe('watching');
  });

  it('calls a luma-only camera what it is', () => {
    expect(greyscaleVerdict(run(grey, GREY_WINDOW_MS + 200))).toBe('greyscale');
  });

  it('leaves a colour camera alone', () => {
    expect(greyscaleVerdict(run(colour, GREY_WINDOW_MS + 200))).toBe('colour');
  });

  it('one stray colourful frame is enough to clear it', () => {
    // A verdict this serious must not rest on a single sample either way, but ANY real
    // colour proves the feed is not luma-only — that is decisive, not statistical.
    let w = initialGreyscaleWatch();
    for (let t = 0; t <= GREY_WINDOW_MS; t += 100) w = stepGreyscaleWatch(w, grey(), t);
    w = stepGreyscaleWatch(w, colour(), GREY_WINDOW_MS + 100);
    expect(greyscaleVerdict(w)).toBe('colour');
  });

  it('needs nearly every pixel to be achromatic, not merely most', () => {
    expect(GREY_SHARE).toBeGreaterThan(0.9);
    const mostly = () => frame(400, (i) => {
      const v = 40 + ((i * 7) % 180);
      return i < 340 ? [v, v, v] : [200, 40, 40];
    });
    expect(greyscaleVerdict(run(mostly, GREY_WINDOW_MS + 200))).toBe('colour');
  });

  it('starting again forgets what the last camera did', () => {
    const w = run(grey, GREY_WINDOW_MS + 200);
    expect(greyscaleVerdict(initialGreyscaleWatch())).toBe('watching');
    expect(greyscaleVerdict(w)).toBe('greyscale');
  });
});
