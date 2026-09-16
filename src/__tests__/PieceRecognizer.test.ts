import { describe, it, expect } from 'vitest';
import {
  OccupancyRecognizer,
  ColourRecognizer,
} from '../tracking/PieceRecognizer';

describe('PieceRecognizer', () => {
  it('OccupancyRecognizer: occupied iff filledFraction >= threshold, colour always null', () => {
    const r = new OccupancyRecognizer(0.25);
    expect(r.classify({ filledFraction: 0.1, fractions: { red: 0.1 } })).toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0.25, fractions: {} })).toEqual({ occupied: true, colour: null });
    expect(r.level).toBe('occupancy');
  });

  it('ColourRecognizer: classifies the first priority colour above threshold', () => {
    const r = new ColourRecognizer(0.2, ['red', 'blue', 'white', 'black']);
    expect(r.classify({ filledFraction: 0, fractions: { red: 0.1, black: 0.1, blue: 0.1 } }))
      .toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0, fractions: { red: 0.4, black: 0.1 } }))
      .toMatchObject({ occupied: true, colour: 'red' });
    expect(r.classify({ filledFraction: 0, fractions: { black: 0.4 } }))
      .toMatchObject({ occupied: true, colour: 'black' });
    expect(r.classify({ filledFraction: 0, fractions: { blue: 0.4 } }))
      .toMatchObject({ occupied: true, colour: 'blue' });
  });

  it('ColourRecognizer: priority order wins ties (red before blue before black)', () => {
    const r = new ColourRecognizer(0.2, ['red', 'blue', 'white', 'black']);
    expect(r.classify({ filledFraction: 0, fractions: { red: 0.3, blue: 0.3, black: 0.3 } }))
      .toMatchObject({ occupied: true, colour: 'red' });
  });

  it('ColourRecognizer: vivid colours win over black even when black has more pixels', () => {
    const r = new ColourRecognizer(0.2, ['red', 'blue', 'white', 'black']);
    // a blue piece on a dark square: black fraction higher, but blue is earlier in priority
    expect(r.classify({ filledFraction: 0, fractions: { black: 0.6, blue: 0.25 } }))
      .toMatchObject({ occupied: true, colour: 'blue' });
  });

  it('ColourRecognizer: honours a custom priority order', () => {
    const r = new ColourRecognizer(0.2, ['green', 'red']);
    expect(r.classify({ filledFraction: 0, fractions: { green: 0.3, red: 0.3 } }))
      .toMatchObject({ occupied: true, colour: 'green' });
  });
});
