import { describe, it, expect } from 'vitest';
import {
  calibrationFromHsv, freshChannelId, orderedChannels, channelPriority,
  describeChannel, hueName, type ColourChannel,
} from '../tracking/boardColours';

describe('calibrationFromHsv', () => {
  it('classifies a dark, desaturated sample as black', () => {
    const cal = calibrationFromHsv({ h: 0, s: 8, v: 12 });
    expect(cal.kind).toBe('black');
    expect(cal.blackBand).toBeDefined();
  });

  it('classifies a bright, desaturated sample as white', () => {
    const cal = calibrationFromHsv({ h: 0, s: 5, v: 92 });
    expect(cal.kind).toBe('white');
    expect(cal.whiteBand).toBeDefined();
  });

  it('classifies a vivid sample as a hue band centred on the sample', () => {
    const cal = calibrationFromHsv({ h: 210, s: 80, v: 70 });
    expect(cal.kind).toBe('hue');
    expect(cal.band?.hue).toBe(210);
  });

  it('treats a washed-out (low-saturation) colour as hue, not white/black', () => {
    // An external webcam desaturates: a teal piece at s≈18 must stay a hue band.
    const teal = calibrationFromHsv({ h: 175, s: 18, v: 60 });
    expect(teal.kind).toBe('hue');
    expect(teal.band?.hue).toBe(175);
    // A washed pink mid-brightness, too.
    expect(calibrationFromHsv({ h: 340, s: 16, v: 55 }).kind).toBe('hue');
  });

  it('only goes achromatic when the sample is truly greyscale (s ≤ 12)', () => {
    expect(calibrationFromHsv({ h: 0, s: 6, v: 20 }).kind).toBe('black');
    expect(calibrationFromHsv({ h: 0, s: 6, v: 90 }).kind).toBe('white');
    expect(calibrationFromHsv({ h: 0, s: 13, v: 90 }).kind).toBe('hue'); // just above the grey cutoff
  });
});

describe('freshChannelId', () => {
  it('returns the first unused cN id', () => {
    expect(freshChannelId([])).toBe('c1');
    expect(freshChannelId(['c1'])).toBe('c2');
    expect(freshChannelId(['c1', 'c3'])).toBe('c2'); // fills the gap
  });
});

describe('channel ordering (detection priority)', () => {
  const ch = (id: string, kind: ColourChannel['kind']): ColourChannel => ({
    id, kind, role: 'off', swatch: '#000',
  });
  it('orders hue channels before white before black', () => {
    const ordered = orderedChannels([ch('k', 'black'), ch('w', 'white'), ch('h', 'hue')]);
    expect(ordered.map((c) => c.id)).toEqual(['h', 'w', 'k']);
    expect(channelPriority([ch('k', 'black'), ch('h', 'hue')])).toEqual(['h', 'k']);
  });
});

describe('describeChannel / hueName', () => {
  it('names achromatic channels Black/White', () => {
    expect(describeChannel({ id: 'a', kind: 'black', role: 'off', swatch: '#000' })).toBe('Black');
    expect(describeChannel({ id: 'b', kind: 'white', role: 'off', swatch: '#fff' })).toBe('White');
  });
  it('names hue channels by nearest hue', () => {
    expect(hueName(0)).toBe('Red');
    expect(hueName(120)).toBe('Green');
    expect(hueName(215)).toBe('Blue');
  });
});
