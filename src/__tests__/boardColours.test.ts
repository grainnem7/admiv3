import { describe, it, expect } from 'vitest';
import {
  calibrationFromHsv, freshChannelId, orderedChannels, channelPriority,
  describeChannel, hueName, classifyCounterKind, recalibratedChannel, type ColourChannel,
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

describe('classifyCounterKind', () => {
  it.each([
    [{ h: 0, s: 12, v: 90 }, 'white'], [{ h: 0, s: 13, v: 90 }, 'hue'],
    [{ h: 0, s: 10, v: 38 }, 'black'], [{ h: 0, s: 10, v: 39 }, 'hue'],
    [{ h: 0, s: 45, v: 32 }, 'black'], [{ h: 0, s: 45, v: 33 }, 'hue'],
    [{ h: 0, s: 45, v: 30 }, 'black'], [{ h: 0, s: 46, v: 30 }, 'hue'],
  ])('%o → %s', (hsv, kind) => {
    expect(classifyCounterKind(hsv)).toBe(kind);
  });

  it('calibrationFromHsv agrees with it', () => {
    expect(calibrationFromHsv({ h: 200, s: 40, v: 25 }).kind).toBe('black');
  });
});

describe('recalibratedChannel', () => {
  it('replaces only kind/swatch/bands and keeps id, job, instrument and mix', () => {
    const c: ColourChannel = {
      id: 'c1', kind: 'hue', role: 'bass', swatch: '#00f', instrument: 'cello', drum: '', volume: 0.4, tone: 0.3, reverbSend: 0.2, delaySend: 0.1,
      band: { id: 'c1', hue: 220, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 },
    };
    const next = recalibratedChannel(c, calibrationFromHsv({ h: 0, s: 5, v: 10 }), '#111');
    expect(next).toMatchObject({ id: 'c1', role: 'bass', instrument: 'cello', volume: 0.4, tone: 0.3, reverbSend: 0.2, delaySend: 0.1, kind: 'black', swatch: '#111' });
    expect(next.band).toBeUndefined();
    expect(next.blackBand).toBeDefined();
  });
});

describe('freshChannelId with referenced ids', () => {
  it('never reuses an id still referenced by saved pages or loops', () => {
    expect(freshChannelId([], ['c1', 'c2'])).toBe('c3');
    expect(freshChannelId(['c1'], ['c2'])).toBe('c3');
  });
});
