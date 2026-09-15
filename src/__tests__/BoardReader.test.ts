import { describe, it, expect } from 'vitest';
import { sampleRegion, blendFractions, buildCellLattice, type RgbSampler } from '../tracking/BoardReader';
import type { TrackedColor } from '../tracking/ColorTracker';
import {
  buildChannelMatchers, DEFAULT_BLACK_BAND, DEFAULT_WHITE_BAND, type ColourChannel,
} from '../tracking/boardColours';
import { UNIT_SQUARE, computeHomography } from '../utils/homography';

const RED: TrackedColor = {
  id: 'red', hue: 0, hueTolerance: 12, minSaturation: 50, minValue: 30, minArea: 0,
};

// Channels: red (calibrated tight band) + white + black; matchers come out in
// priority order (hue, white, black).
const CHANNELS: ColourChannel[] = [
  { id: 'red', kind: 'hue', role: 'melody', swatch: '#f00', band: RED },
  { id: 'white', kind: 'white', role: 'off', swatch: '#fff', whiteBand: DEFAULT_WHITE_BAND },
  { id: 'black', kind: 'black', role: 'off', swatch: '#000', blackBand: DEFAULT_BLACK_BAND },
];
const COLOURS = buildChannelMatchers(CHANNELS);

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

  it('a centred (uniform) red region has offset ≈ 0', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.offset ?? 1).toBeLessThan(0.1);
  });

  it('a red piece shoved to one side has a clearly non-zero offset', () => {
    // Cell (0,0) of a 4x4 grid spans image x∈[1.25,23.75] under `h`; sample
    // points (3/axis) land at rounded image x ≈ 1, 13, 24. Red only on the
    // right two → centroid pulled toward the edge.
    const rightSide: RgbSampler = (x) => (x > 6
      ? { r: 220, g: 10, b: 10 }
      : { r: 240, g: 240, b: 240 });
    const out = sampleRegion(rightSide, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.offset ?? 0).toBeGreaterThan(0.3);
  });
});

describe('blendFractions (temporal smoothing)', () => {
  it('first frame (no prev) returns the current fractions', () => {
    expect(blendFractions(null, { red: 0.5 }, 0.4)).toEqual({ red: 0.5 });
  });

  it('EMA blends the previous value toward the current by alpha', () => {
    // 0.2 + 0.5*(0.8-0.2) = 0.5
    expect(blendFractions({ red: 0.2 }, { red: 0.8 }, 0.5)).toEqual({ red: 0.5 });
  });

  it('a colour missing from the current frame fades toward 0 (no instant drop)', () => {
    // 0.6 + 0.5*(0-0.6) = 0.3 — a one-frame dropout does not flip the cell off
    expect(blendFractions({ red: 0.6 }, {}, 0.5)).toEqual({ red: 0.3 });
  });

  it('a colour new this frame ramps up from 0 (no instant flash on)', () => {
    // 0 + 0.5*(0.8-0) = 0.4
    expect(blendFractions({}, { blue: 0.8 }, 0.5)).toEqual({ blue: 0.4 });
  });

  it('alpha 1 = no smoothing (tracks the current frame exactly)', () => {
    expect(blendFractions({ red: 0.2 }, { red: 0.9 }, 1)).toEqual({ red: 0.9 });
  });

  it('drops fully-faded colours below epsilon so the map does not accumulate', () => {
    expect(blendFractions({ red: 0.0004 }, {}, 0.5)).toEqual({});
  });
});

describe('buildCellLattice', () => {
  it('gives the same sample result as computing the homography per sample', () => {
    const h = computeHomography(UNIT_SQUARE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    const half: RgbSampler = (x) => (x < 50 ? { r: 220, g: 10, b: 10 } : { r: 128, g: 128, b: 128 });
    const direct = sampleRegion(half, h, 0, 0, 1, 1, COLOURS, 5);
    const cached = sampleRegion(half, h, 0, 0, 1, 1, COLOURS, 5, buildCellLattice(h, 0, 0, 1, 1, 5));
    expect(cached).toEqual(direct);
  });
});
