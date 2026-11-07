import { describe, it, expect } from 'vitest';
import {
  bestCircleGrid, colourIdsForSound, colourPicture, inkOn,
  clearBoardSilent, colourBack, melodyChoice, melodyColour, PICTURE_EMOJI, readBoardSilent, readDrumsSilent, readFeel, readSilentColours, remoteColours, silencedColourIds, writeBoardSilent, writeSilentColours,
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

describe('the Counters row (K4): one colour at a time', () => {
  it('a colour in the silent set is out, playing or stopped; a control colour never; Drums and the Board still count', () => {
    expect(silencedColourIds(five, { board: false, drums: false, colours: new Set(['c1', 'c5']) })).toEqual(['c1']);
    expect(silencedColourIds(five, { board: false, drums: true, colours: new Set(['c2']) })).toEqual(['c2', 'c4', 'c6']);
    expect(silencedColourIds(five, { board: false, drums: false })).toEqual([]);
  });

  it('the colours the iPad draws: the note-playing ones in board order, numbered, with their job and instrument words', () => {
    const words = (c: ColourChannel): string => `${c.role}${c.instrument ? ` · ${c.instrument}` : ''}`;
    expect(remoteColours(five, words, (c) => c.id)).toEqual([
      { id: 'c1', number: 1, name: 'c1', swatch: '#888888', role: 'melody', words: 'melody · flute', picture: '🪈' },
      { id: 'c2', number: 2, name: 'c2', swatch: '#888888', role: 'bass', words: 'bass', picture: '🎸' },
      { id: 'c3', number: 3, name: 'c3', swatch: '#888888', role: 'chord', words: 'chord', picture: '🎹' },
      { id: 'c4', number: 4, name: 'c4', swatch: '#888888', role: 'drums', words: 'drums', picture: '🥁' },
      { id: 'c6', number: 6, name: 'c6', swatch: '#888888', role: 'drums', words: 'drums', picture: '🥁' },
    ]);
  });

  it('a colour’s picture (owner, 5 Nov: pictures, not instrument words): from the instrument’s name, else its job', () => {
    expect(colourPicture('melody', 'Melody · Flute')).toBe('🪈');
    expect(colourPicture('melody', 'Melody · Clarinet')).toBe('🪈');
    expect(colourPicture('melody', 'Melody · Trumpet')).toBe('🎺');
    expect(colourPicture('melody', 'Melody · French horn')).toBe('🎺');
    expect(colourPicture('melody', 'Melody · Saxophone')).toBe('🎷');
    expect(colourPicture('chord', 'Chords · Piano')).toBe('🎹');
    expect(colourPicture('chord', 'Chords · Organ')).toBe('🎹');
    expect(colourPicture('melody', 'Melody · Cello')).toBe('🎻');
    expect(colourPicture('melody', 'Melody · Nylon guitar')).toBe('🎸');
    expect(colourPicture('bass', 'Bass · Upright bass + sub bass')).toBe('🎸');
    expect(colourPicture('melody', 'Melody · Bells')).toBe('🔔');
    expect(colourPicture('melody', 'Melody · Harp')).toBe('🎶');
    expect(colourPicture('drums', 'Drums · Warm kit: kick')).toBe('🥁');
    expect(colourPicture('melody', 'Melody')).toBe('🎵');
    expect(colourPicture('chord', 'Chords')).toBe('🎹');
    expect(colourPicture('bass', 'Bass')).toBe('🎸');
  });

  it('the ink that reads on a swatch: dark on a light colour, light on a dark one; white when the colour cannot be read', () => {
    expect(inkOn('#ffff00')).toBe('#111111');
    expect(inkOn('#00ff00')).toBe('#111111');
    expect(inkOn('#0000ff')).toBe('#ffffff');
    expect(inkOn('#ff0000')).toBe('#ffffff');
    expect(inkOn('rgb(255, 255, 255)')).toBe('#111111');
    expect(inkOn('hsl(60 100% 50%)')).toBe('#ffffff');
  });

  it('a press that brings a drum colour back while Drums are off brings Drums back too; any other press is only its colour', () => {
    expect(colourBack('drums', true)).toEqual({ drums: true });
    expect(colourBack('drums', false)).toEqual({ drums: false });
    expect(colourBack('melody', true)).toEqual({ drums: false });
  });

  it('the silent colours are kept for the browser tab; a leftover Board silence is cleared', () => {
    const store = new Map<string, string>();
    const tab = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readSilentColours(tab)).toEqual([]);
    writeSilentColours(tab, ['c1', 'c3']);
    expect(readSilentColours(tab)).toEqual(['c1', 'c3']);
    writeBoardSilent(tab, true);
    clearBoardSilent(tab);
    expect(readBoardSilent(tab)).toBe(false);
  });
});

describe('the colour pads: the biggest circles their space allows', () => {
  it('a wide, low row: four in a row; the whole page: two by two; never more than four across', () => {
    expect(bestCircleGrid(774, 200, 4, 18, 2)).toEqual({ cols: 4, size: 180 });
    expect(bestCircleGrid(774, 900, 4, 18, 2).cols).toBe(2);
    expect(bestCircleGrid(774, 900, 4, 18, 2).size).toBeGreaterThan(350);
    expect(bestCircleGrid(2000, 100, 8, 18, 2).cols).toBe(4);
    expect(bestCircleGrid(774, 900, 1, 18, 2).cols).toBe(2);
    expect(bestCircleGrid(0, 0, 4, 18, 2).size).toBe(0);
  });
});

describe('the iPad’s instrument buttons (owner, 7 Nov 2026: they no longer changed Tim’s instrument)', () => {
  const chans = [{ id: 'a', role: 'melody' as const }, { id: 'b', role: 'bass' as const }, { id: 'c', role: 'melody' as const }, { id: 'd', role: 'chord' as const }];
  it('with his own track (the demo), every melody colour of his; otherwise the first melody colour, as before', () => {
    expect(colourIdsForSound(chans, 14)).toEqual(['a', 'c']);
    expect(colourIdsForSound(chans, null)).toEqual(['a']);
    expect(colourIdsForSound([{ id: 'b', role: 'bass' as const }], null)).toEqual([]);
  });
});

describe('Tim’s sounds stay pad-like (owner, 7 Nov 2026: plain instruments stuck out)', () => {
  it('a padded instrument is mostly the swelling pad with the instrument inside; still its own iPad button; named "Flute pad"', async () => {
    const { voiceSpecFor, padded } = await import('../audio/worlds/soundWorlds');
    const { soundOptionName } = await import('../ui/screens/boardSequencer/soundCatalogue');
    expect(voiceSpecFor({ role: 'melody', instrument: padded('flute') }, 'warm')).toEqual({ sample: 'flute', synth: 'pad', sampleLevel: 0.3, synthLevel: 0.9 });
    expect(melodyChoice({ instrument: padded('trumpet') })).toBe('trumpet');
    expect(soundOptionName(padded('flute'))).toBe('Flute pad');
  });
});
