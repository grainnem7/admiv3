import { describe, it, expect } from 'vitest';
import {
  OccupancyRecognizer,
  RedColourRecognizer,
  COLOUR_INSTRUMENT,
} from '../tracking/PieceRecognizer';

describe('PieceRecognizer', () => {
  it('OccupancyRecognizer: occupied iff filledFraction >= threshold, colour always null', () => {
    const r = new OccupancyRecognizer(0.25);
    expect(r.classify({ filledFraction: 0.1, redFraction: 0.1 })).toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0.25, redFraction: 0 })).toEqual({ occupied: true, colour: null });
    expect(r.level).toBe('occupancy');
  });

  it('RedColourRecognizer: red iff occupied and redFraction >= threshold', () => {
    const r = new RedColourRecognizer(0.25);
    expect(r.classify({ filledFraction: 0.1, redFraction: 0.1 })).toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0.4, redFraction: 0.1 })).toEqual({ occupied: true, colour: null });
    expect(r.classify({ filledFraction: 0.4, redFraction: 0.4 })).toEqual({ occupied: true, colour: 'red' });
    expect(r.level).toBe('colour');
  });

  it('exposes a red→instrument hook', () => {
    expect(COLOUR_INSTRUMENT.red).toBe('electricPiano');
  });
});
