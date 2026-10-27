import { describe, it, expect } from 'vitest';
import { keepCells, loopChannelsFor, loopColourId, loopSwatch } from '../songs/performance/loopSounds';
import type { ColourChannel } from '../tracking/boardColours';
import type { StoredLoopCell } from '../profiles/BoardSequencerConfig';

const colour = (id: string, role: ColourChannel['role'], extra: Partial<ColourChannel> = {}): ColourChannel =>
  ({ id, kind: 'hue', role, swatch: `#${id.slice(0, 1)}00`, ...extra });

const green = colour('green', 'melody', { instrument: 'violin', swatch: '#0f0' });
const black = colour('black', 'drums', { drum: 'snare', swatch: '#111' });
const tempo = colour('white', 'tempo', { swatch: '#fff' });

describe('what Keep keeps', () => {
  it('records each counter’s job and sound, and leaves control colours out', () => {
    const kept = keepCells(
      [{ row: 2, col: 1, colour: 'green', velocity: 0.6 }, { row: 7, col: 0, colour: 'black', conditional: true }, { row: 0, col: 3, colour: 'white' }],
      [green, black, tempo],
    );
    expect(kept).toEqual([
      { row: 2, col: 1, colour: 'green', velocity: 0.6, job: 'melody', sound: 'violin' },
      { row: 7, col: 0, colour: 'black', conditional: true, job: 'drums', sound: 'snare' },
    ]);
  });

  it('a colour with the default sound keeps an empty sound', () => {
    expect(keepCells([{ row: 1, col: 1, colour: 'green' }], [colour('green', 'bass')])[0]).toMatchObject({ job: 'bass', sound: '' });
  });
});

describe('a kept loop plays through its own loop colours', () => {
  const kept: StoredLoopCell[] = [
    { row: 2, col: 1, colour: 'green', job: 'melody', sound: 'violin' },
    { row: 3, col: 5, colour: 'green', job: 'melody', sound: 'violin' },
    { row: 7, col: 0, colour: 'black', job: 'drums', sound: 'snare' },
  ];

  it('re-colours the cells and makes one channel per job and sound, in today’s colour for that sound', () => {
    const today = [colour('pink', 'melody', { instrument: 'violin', swatch: '#f0a', plays: 'tune' }), colour('black', 'drums', { drum: 'kick' })];
    const out = loopChannelsFor(kept, today);
    expect(out.cells.map((c) => c.colour)).toEqual(['loop:melody:violin', 'loop:melody:violin', 'loop:drums:snare']);
    expect(out.cells[0]).toMatchObject({ row: 2, col: 1 });
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0]).toMatchObject({ id: 'loop:melody:violin', role: 'melody', instrument: 'violin', swatch: '#f0a', changes: false, plays: 'tune' });
    expect(out.channels[1]).toMatchObject({ id: 'loop:drums:snare', role: 'drums', drum: 'snare', swatch: '#9a9a9a', plays: 'note' });
  });

  it('grey when no colour plays that sound today; the loop still plays violin', () => {
    const out = loopChannelsFor(kept, [colour('green', 'melody', { instrument: 'piano' })]);
    expect(out.channels[0]).toMatchObject({ instrument: 'violin', swatch: '#9a9a9a' });
  });

  it('an old loop (no job recorded) passes through untouched', () => {
    const old: StoredLoopCell[] = [{ row: 1, col: 1, colour: 'green' }];
    const out = loopChannelsFor(old, [green]);
    expect(out.cells).toEqual([{ row: 1, col: 1, colour: 'green' }]);
    expect(out.channels).toEqual([]);
  });

  it('names a loop colour by job and sound', () => {
    expect(loopColourId('melody', 'violin')).toBe('loop:melody:violin');
    expect(loopColourId('bass', '')).toBe('loop:bass:');
  });
});

describe('how a loop is drawn', () => {
  const today = [green, black];
  it('a loop colour draws in today’s colour for that sound, else grey; a known colour draws as itself; never red', () => {
    expect(loopSwatch('loop:melody:violin', today)).toBe('#0f0');
    expect(loopSwatch('loop:melody:piano', today)).toBe('#9a9a9a');
    expect(loopSwatch('green', today)).toBe('#0f0');
    expect(loopSwatch('gone', today)).toBe('#9a9a9a');
  });
});

describe('the screen draws every cell through loopSwatch', () => {
  it('a loop colour draws in today’s colour for that sound, and a colour that is gone draws grey, never red', () => {
    const today = [colour('pink', 'melody', { instrument: 'violin', swatch: '#f0a' })];
    const swatchFor = (id: string): string => loopSwatch(id, today);
    expect(swatchFor('loop:melody:violin')).toBe('#f0a');
    expect(swatchFor('green')).toBe('#9a9a9a');
    expect(swatchFor('pink')).toBe('#f0a');
    expect(swatchFor('green')).not.toBe('#e23');
  });
});

describe('drawing a kept loop', () => {
  it('cells that carry a job draw as their loop colour, so today’s violin colour or grey, never the stored colour', async () => {
    const { drawCells } = await import('../songs/performance/loopSounds');
    const kept: StoredLoopCell[] = [{ row: 1, col: 1, colour: 'green', job: 'melody', sound: 'violin' }, { row: 2, col: 2, colour: 'green' }];
    expect(drawCells(kept).map((c) => c.colour)).toEqual(['loop:melody:violin', 'green']);
  });

  it('Keep has nothing to keep when only control counters are down', () => {
    expect(keepCells([{ row: 0, col: 3, colour: 'white' }], [tempo])).toEqual([]);
  });
});
