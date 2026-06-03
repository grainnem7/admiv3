import { describe, it, expect } from 'vitest';
import {
  OccupancyRecognizer,
  RedColourRecognizer,
  RedBlackRecognizer,
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

  it('RedBlackRecognizer: classifies the dominant colour, red wins ties', () => {
    const r = new RedBlackRecognizer(0.2);
    expect(r.classify({ filledFraction: 0, redFraction: 0.1, blackFraction: 0.1 }))
      .toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0, redFraction: 0.4, blackFraction: 0.1 }))
      .toEqual({ occupied: true, colour: 'red' });
    expect(r.classify({ filledFraction: 0, redFraction: 0.1, blackFraction: 0.4 }))
      .toEqual({ occupied: true, colour: 'black' });
    expect(r.classify({ filledFraction: 0, redFraction: 0.3, blackFraction: 0.3 }))
      .toEqual({ occupied: true, colour: 'red' }); // tie → red
  });

  it('exposes a red→instrument hook', () => {
    expect(COLOUR_INSTRUMENT.red).toBe('electricPiano');
  });
});
