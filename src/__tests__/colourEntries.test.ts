import { describe, it, expect } from 'vitest';
import {
  cellsSoundingAt, comesInLine, colourEntryProblem, sanitizeColourEntries, waitingColours, waitingLine, withColourEntry,
} from '../songs/performance/colourEntries';
import type { ColourChannel } from '../tracking/boardColours';

/**
 * When each colour comes in (the piece's set-up, Scenes step): a sound colour's counters
 * stay silent until its time while the piece's clock runs. Tim can't put counters down
 * himself, so they are all on the board before the piece starts.
 */

const red: ColourChannel = { id: 'c1', kind: 'hue', role: 'melody', swatch: '#e03030', band: { id: '', hue: 0, hueTolerance: 24, minSaturation: 40, minValue: 30, minArea: 0.0005 } };
const blue: ColourChannel = { id: 'c2', kind: 'hue', role: 'bass', swatch: '#3050e0', band: { id: '', hue: 225, hueTolerance: 24, minSaturation: 40, minValue: 30, minArea: 0.0005 } };
const green: ColourChannel = { id: 'c3', kind: 'hue', role: 'drums', swatch: '#30c050', band: { id: '', hue: 120, hueTolerance: 24, minSaturation: 40, minValue: 30, minArea: 0.0005 } };
const speed: ColourChannel = { id: 'c4', kind: 'black', role: 'tempo', swatch: '#111111' };
const reverbOn: ColourChannel = { id: 'c5', kind: 'white', role: 'reverbToggle', swatch: '#eeeeee' };
const channels = [red, blue, green, speed, reverbOn];
const cell = (row: number, col: number, colour: string) => ({ row, col, colour });
const board = [cell(0, 0, 'c1'), cell(1, 2, 'c1'), cell(3, 1, 'c2'), cell(4, 4, 'c3'), cell(7, 3, 'c4'), cell(2, 6, 'c5')];

describe('when each colour comes in: which counters sound', () => {
  const entries = { c1: 90, c2: 150 };

  it('before a colour’s time its counters are left out; at or after it they sound', () => {
    expect(cellsSoundingAt(board, channels, entries, 0).map((c) => c.colour)).toEqual(['c3', 'c4', 'c5']);
    expect(cellsSoundingAt(board, channels, entries, 89.9).map((c) => c.colour)).toEqual(['c3', 'c4', 'c5']);
    expect(cellsSoundingAt(board, channels, entries, 90).map((c) => c.colour)).toEqual(['c1', 'c1', 'c3', 'c4', 'c5']);
    expect(cellsSoundingAt(board, channels, entries, 150)).toEqual(board);
  });

  it('with no piece clock (▶ Play, the warm-up, after Stop) every counter sounds', () => {
    expect(cellsSoundingAt(board, channels, entries, null)).toEqual(board);
  });

  it('a control colour is never held back, even with a time saved for it', () => {
    const timed = { c4: 200, c5: 200, c1: 200 };
    expect(cellsSoundingAt(board, channels, timed, 10).map((c) => c.colour)).toEqual(['c2', 'c3', 'c4', 'c5']);
  });

  it('a time for a colour that is gone changes nothing, and a colour with no time plays from the start', () => {
    expect(cellsSoundingAt(board, channels, { gone: 300 }, 1)).toEqual(board);
    expect(cellsSoundingAt(board, channels, {}, 1)).toEqual(board);
    // No times at all (a config from before them): never an error on the way to the engine.
    expect(cellsSoundingAt(board, channels, undefined, 1)).toEqual(board);
  });

  it('the waiting colours, earliest first, and the line under the board', () => {
    expect(waitingColours(channels, { c2: 150, c1: 90 }, 10).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(waitingColours(channels, { c2: 150, c1: 90 }, 100).map((c) => c.id)).toEqual(['c2']);
    expect(waitingColours(channels, { c2: 150, c1: 90 }, null)).toEqual([]);
    expect(waitingLine(waitingColours(channels, entries, 10), entries)).toBe('Waiting: Red at 1:30, Blue at 2:30');
    expect(waitingLine([], entries)).toBeNull();
  });

  it('says who comes in', () => {
    expect(comesInLine(['Red'])).toBe('Red comes in');
    expect(comesInLine(['Red', 'Blue'])).toBe('Red and Blue come in');
  });
});

describe('when each colour comes in: what is kept', () => {
  it('keeps good times, rounded; drops anything malformed or past the longest piece', () => {
    expect(sanitizeColourEntries({ c1: 90, c2: 0, c3: 420, c4: 12.4 })).toEqual({ c1: 90, c2: 0, c3: 420, c4: 12 });
    expect(sanitizeColourEntries({ c1: -1, c2: 421, c3: 'soon', c4: NaN, c5: Infinity, c6: null, '': 5 })).toEqual({});
    expect(sanitizeColourEntries('junk')).toEqual({});
    expect(sanitizeColourEntries([90])).toEqual({});
    expect(sanitizeColourEntries(undefined)).toEqual({});
  });

  it('drops the time of a colour that no longer exists', () => {
    expect(sanitizeColourEntries({ c1: 90, gone: 30 }, new Set(['c1', 'c2']))).toEqual({ c1: 90 });
  });

  it('a time set and cleared', () => {
    expect(withColourEntry({ c1: 90 }, 'c2', 150)).toEqual({ c1: 90, c2: 150 });
    expect(withColourEntry({ c1: 90, c2: 150 }, 'c1', null)).toEqual({ c2: 150 });
  });

  it('a typed time at or after the end of the piece is said, beside the field', () => {
    expect(colourEntryProblem(null, 300)).toBeNull();
    expect(colourEntryProblem(90, 300)).toBeNull();
    expect(colourEntryProblem(300, 300)).toMatch(/after the end of the piece \(5:00\)/i);
    expect(colourEntryProblem(500, 420)).toMatch(/at most 7:00/i);
  });
});
