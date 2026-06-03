import { describe, it, expect } from 'vitest';
import {
  OccupancyRecognizer,
  RedColourRecognizer,
  ColourRecognizer,
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

  it('ColourRecognizer: classifies the dominant of red/blue/black above threshold', () => {
    const r = new ColourRecognizer(0.2);
    expect(r.classify({ filledFraction: 0, redFraction: 0.1, blackFraction: 0.1, blueFraction: 0.1 }))
      .toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0, redFraction: 0.4, blackFraction: 0.1, blueFraction: 0.1 }))
      .toEqual({ occupied: true, colour: 'red' });
    expect(r.classify({ filledFraction: 0, redFraction: 0.1, blackFraction: 0.4, blueFraction: 0.1 }))
      .toEqual({ occupied: true, colour: 'black' });
    expect(r.classify({ filledFraction: 0, redFraction: 0.1, blackFraction: 0.1, blueFraction: 0.4 }))
      .toEqual({ occupied: true, colour: 'blue' });
    expect(r.classify({ filledFraction: 0, redFraction: 0.3, blackFraction: 0.3, blueFraction: 0.3 }))
      .toEqual({ occupied: true, colour: 'red' }); // tie → red
  });

  it('ColourRecognizer: vivid colours win over black even when black has more pixels', () => {
    const r = new ColourRecognizer(0.2);
    // a blue piece on a dark square: black fraction higher, but blue must win
    expect(r.classify({ filledFraction: 0, redFraction: 0, blackFraction: 0.6, blueFraction: 0.25 }))
      .toEqual({ occupied: true, colour: 'blue' });
  });

  it('exposes a red→instrument hook', () => {
    expect(COLOUR_INSTRUMENT.red).toBe('electricPiano');
  });
});
