import { describe, it, expect } from 'vitest';
import { sampleRegion, type RgbSampler } from '../tracking/BoardReader';
import type { TrackedColor } from '../tracking/ColorTracker';
import { UNIT_SQUARE, computeHomography } from '../utils/homography';

const RED: TrackedColor = {
  id: 'red', hue: 0, hueTolerance: 12, minSaturation: 50, minValue: 30, minArea: 0,
};

describe('BoardReader.sampleRegion', () => {
  const h = computeHomography(UNIT_SQUARE, [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ]);

  it('reports a high red fraction over an all-red region', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeGreaterThan(0.9);
    expect(out.centroid).not.toBeNull();
  });

  it('reports ~zero red fraction over a white/empty region', () => {
    const white: RgbSampler = () => ({ r: 240, g: 240, b: 240 });
    const out = sampleRegion(white, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeLessThan(0.1);
  });

  it('reports ~zero red fraction over a dark (black square) region', () => {
    const dark: RgbSampler = () => ({ r: 20, g: 20, b: 20 });
    const out = sampleRegion(dark, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeLessThan(0.1);
  });
});
