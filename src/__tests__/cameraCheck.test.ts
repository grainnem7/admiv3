import { describe, it, expect } from 'vitest';
import {
  frameMeanSaturation, looksColourless, nextColourlessState, COLOURLESS_SATURATION, COLOURFUL_SATURATION,
} from '../tracking/cameraCheck';

describe('nextColourlessState (hysteresis, so the warning cannot flicker)', () => {
  it('enters the colourless state only below the lower threshold', () => {
    expect(nextColourlessState(false, COLOURLESS_SATURATION - 0.5)).toBe(true);
    expect(nextColourlessState(false, COLOURLESS_SATURATION + 0.5)).toBe(false);
  });

  it('stays colourless for readings between the thresholds (no flip-flop)', () => {
    const between = (COLOURLESS_SATURATION + COLOURFUL_SATURATION) / 2;
    expect(nextColourlessState(true, between)).toBe(true);
    expect(nextColourlessState(false, between)).toBe(false);
  });

  it('leaves the colourless state only above the upper threshold', () => {
    expect(nextColourlessState(true, COLOURFUL_SATURATION + 0.5)).toBe(false);
  });

  it('keeps the current state when there is no reading', () => {
    expect(nextColourlessState(true, null)).toBe(true);
    expect(nextColourlessState(false, null)).toBe(false);
  });
});

/** An RGBA frame of `n` pixels built by `px(i)`. */
function frame(n: number, px: (i: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = px(i);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return d;
}

describe('frameMeanSaturation', () => {
  it('is ~0 for a greyscale frame (a black-and-white feed)', () => {
    const grey = frame(400, (i) => { const v = 40 + (i % 180); return [v, v, v]; });
    expect(frameMeanSaturation(grey)).toBeLessThan(1);
  });

  it('is high for a colourful frame (wood + coloured counters)', () => {
    const scene = frame(400, (i) => (i % 4 === 0 ? [200, 40, 40] : i % 4 === 1 ? [40, 80, 200] : [180, 140, 90]));
    expect(frameMeanSaturation(scene)).toBeGreaterThan(30);
  });

  it('ignores near-black and near-white pixels (their saturation is noise)', () => {
    // Very dark noisy pixels have wild HSV saturation; they must not make a grey
    // feed look colourful.
    const noisyDark = frame(400, (i) => (i % 2 === 0 ? [6, 2, 0] : [128, 128, 128]));
    expect(frameMeanSaturation(noisyDark)).toBeLessThan(1);
  });

  it('returns null when there are no usable pixels', () => {
    expect(frameMeanSaturation(new Uint8ClampedArray(0))).toBeNull();
    expect(frameMeanSaturation(frame(10, () => [0, 0, 0]))).toBeNull();
  });
});

describe('looksColourless', () => {
  it('flags a feed whose mean saturation is below the threshold', () => {
    expect(looksColourless(COLOURLESS_SATURATION - 1)).toBe(true);
    expect(looksColourless(0)).toBe(true);
  });

  it('does not flag a colourful feed, or an unknown reading', () => {
    expect(looksColourless(COLOURLESS_SATURATION + 1)).toBe(false);
    expect(looksColourless(40)).toBe(false);
    expect(looksColourless(null)).toBe(false);
  });
});
