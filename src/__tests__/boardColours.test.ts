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
