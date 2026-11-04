import { describe, it, expect } from 'vitest';
import {
  melodyChoice, melodyColour, PICTURE_EMOJI, readBoardSilent, readDrumsSilent, readFeel, silencedColourIds, writeBoardSilent,
  writeDrumsSilent, writeFeel,
} from '../remote/simplePage';
import { cellsSoundingAt } from '../songs/performance/colourEntries';
import type { ColourChannel } from '../tracking/boardColours';

/**
 * The Simple iPad page, for playing live only (spec 2026-11-04, "Live only: Drums, Calm/Busy,
 * Melody, Board"): which counters the Drums and Board buttons silence, what the melody plays,
 * and the live states kept for the browser tab.
 */

const ch = (id: string, role: ColourChannel['role'], instrument?: string): ColourChannel => ({
  id, kind: 'hue', role, swatch: '#888888', ...(instrument !== undefined ? { instrument } : {}),
});
const five = [ch('c1', 'melody', 'flute'), ch('c2', 'bass'), ch('c3', 'chord'), ch('c4', 'drums'), ch('c5', 'tempo'), ch('c6', 'drums')];
const cell = (colour: string) => ({ row: 0, col: 0, colour });

describe('the counters the Drums and Board buttons silence', () => {
  it('Drums: every drum colour; Board: every colour that plays notes; a control colour never', () => {
    expect(silencedColourIds(five, { board: false, drums: true })).toEqual(['c4', 'c6']);
    expect(silencedColourIds(five, { board: true, drums: false })).toEqual(['c1', 'c2', 'c3', 'c4', 'c6']);
    expect(silencedColourIds(five, { board: true, drums: true })).toEqual(['c1', 'c2', 'c3', 'c4', 'c6']);
    expect(silencedColourIds(five, { board: false, drums: false })).toEqual([]);
  });

  it('by the filter a colour waiting for its time uses, before the engine', () => {
    const board = [cell('c1'), cell('c4'), cell('c5'), cell('c6')];
    const out = new Set(silencedColourIds(five, { board: false, drums: true }));
    expect(cellsSoundingAt(board, five, {}, null, out).map((c) => c.colour)).toEqual(['c1', 'c5']);
  });
});

describe('what the melody plays', () => {
  it('the first melody colour, and one of the four sounds or none', () => {
    expect(melodyColour(five)?.id).toBe('c1');
    expect(melodyColour([five[1]])).toBeNull();
    expect(melodyChoice(five[0])).toBe('flute');
    expect(melodyChoice(ch('x', 'melody', 'violin'))).toBeNull();
    expect(melodyChoice(ch('x', 'melody'))).toBeNull();
  });

  it('every picture has its emoji', () => {
    expect(PICTURE_EMOJI).toEqual({
      drums: '🥁', bass: '🎸', chords: '🎹', piano: '🎹', flute: '🪈', trumpet: '🎺', saxophone: '🎷', melody: '🎵',
    });
  });
});

describe('the live states, kept for the browser tab', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  };
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

  it('Drums and the Board: playing unless stored silent, each on its own', () => {
    const s = store();
    expect(readDrumsSilent(s)).toBe(false);
    expect(readBoardSilent(s)).toBe(false);
    writeDrumsSilent(s, true);
    expect(readDrumsSilent(s)).toBe(true);
    expect(readBoardSilent(s)).toBe(false);
    writeBoardSilent(s, true);
    writeDrumsSilent(s, false);
    expect(readDrumsSilent(s)).toBe(false);
    expect(readBoardSilent(s)).toBe(true);
    expect(readDrumsSilent(null)).toBe(false);
    expect(readDrumsSilent(broken)).toBe(false);
    expect(() => writeDrumsSilent(broken, true)).not.toThrow();
  });

  it('Calm / Busy: Normal unless Calm or Busy is stored', () => {
    const s = store();
    expect(readFeel(s)).toBe('normal');
    writeFeel(s, 'busy');
    expect(readFeel(s)).toBe('busy');
    s.setItem('admi-feel', 'loud');
    expect(readFeel(s)).toBe('normal');
    expect(readFeel(broken)).toBe('normal');
    expect(() => writeFeel(broken, 'busy')).not.toThrow();
  });
});
