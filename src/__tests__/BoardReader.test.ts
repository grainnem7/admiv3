import { describe, it, expect } from 'vitest';
import { sampleRegion, type RgbSampler } from '../tracking/BoardReader';
import type { TrackedColor } from '../tracking/ColorTracker';
import { buildMatchers, DEFAULT_BLACK_BAND, DEFAULT_WHITE_BAND } from '../tracking/boardColours';
import { UNIT_SQUARE, computeHomography } from '../utils/homography';

const RED: TrackedColor = {
  id: 'red', hue: 0, hueTolerance: 12, minSaturation: 50, minValue: 30, minArea: 0,
};

// Matcher list: red (calibrated tight band) + black + white, in priority order.
const cal = { hueBands: { red: RED }, black: DEFAULT_BLACK_BAND, white: DEFAULT_WHITE_BAND };
const COLOURS = buildMatchers(['red', 'white', 'black'], cal);

describe('BoardReader.sampleRegion', () => {
  const h = computeHomography(UNIT_SQUARE, [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ]);

  it('reports a high red fraction + red dominant over an all-red region', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.fractions.red ?? 0).toBeGreaterThan(0.9);
    expect(out.dominantId).toBe('red');
    expect(out.centroid).not.toBeNull();
  });

  it('reports white (not red) over a white/empty region', () => {
    const white: RgbSampler = () => ({ r: 240, g: 240, b: 240 });
    const out = sampleRegion(white, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.fractions.red ?? 0).toBeLessThan(0.1);
    expect(out.dominantId).toBe('white');
  });

  it('reports black (not red) over a dark square region', () => {
    const dark: RgbSampler = () => ({ r: 20, g: 20, b: 20 });
    const out = sampleRegion(dark, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.fractions.red ?? 0).toBeLessThan(0.1);
    expect(out.dominantId).toBe('black');
  });

  it('priority: a red pixel is counted as red, not double-counted', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, COLOURS, 3);
    // Red is vivid (high saturation) so it never trips the achromatic tests.
    expect(out.fractions.black ?? 0).toBe(0);
    expect(out.fractions.white ?? 0).toBe(0);
  });
});
