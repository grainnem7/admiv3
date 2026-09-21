import { describe, it, expect } from 'vitest';
import {
  applyDetectedColours, swatchDistance, MATCH_SWATCH_DISTANCE,
} from '../ui/screens/boardSequencer/applyDetectedColours';
import type { ColourChannel } from '../tracking/boardColours';
import type { DetectedColour } from '../tracking/boardColourDetect/detectColours';

/** A proposal as "Find colours" hands it over. */
const found = (swatch: string, unsafe = false): DetectedColour => ({
  swatch,
  kind: 'hue',
  hsv: { h: 0, s: 60, v: 80 },
  counters: 1,
  boardMatch: 0,
  unsafe,
  squares: [{ row: 0, col: 0 }],
  band: { kind: 'hue', band: { id: '', hue: 0, hueTolerance: 24, minSaturation: 30, minValue: 25, minArea: 0 } },
} as unknown as DetectedColour);

/** The eight counters on the research board, as hex. */
const BOARD_SET = ['#f58c55', '#2f6fd0', '#d23c3c', '#fac846', '#ebe8e1', '#f0788c', '#3cb48c', '#8c5ac8'];

describe('putting the found colours onto the board', () => {
  it('eight colours found are eight colours added', () => {
    // Reported from the rig: all eight showed in the proposal, then fewer arrived. Each
    // new channel was being matched against the ones just added, so orange and yellow
    // (67 apart) and orange and pink (59 apart) collapsed into one another.
    const out = applyDetectedColours([], BOARD_SET.map((s) => found(s)));
    expect(out).toHaveLength(8);
    expect(new Set(out.map((c) => c.id)).size).toBe(8);
    expect(out.map((c) => c.swatch)).toEqual(BOARD_SET);
  });

  it('two similar colours both survive, however close they are', () => {
    const close = ['#f58c55', '#fac846'];
    expect(swatchDistance(close[0], close[1])).toBeLessThan(MATCH_SWATCH_DISTANCE);
    expect(applyDetectedColours([], close.map((s) => found(s)))).toHaveLength(2);
  });

  it('a colour the player already has is updated, not duplicated', () => {
    // The reason matching exists at all: their job, instrument and mix must survive.
    const existing: ColourChannel[] = [
      { id: 'c1', kind: 'hue', role: 'drums', swatch: '#f58c55', instrument: 'harp', volume: 0.4 },
    ];
    const out = applyDetectedColours(existing, [found('#f2884f')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'c1', role: 'drums', instrument: 'harp', volume: 0.4 });
    expect(out[0].swatch).toBe('#f2884f');
  });

  it('an existing colour is claimed only once', () => {
    const existing: ColourChannel[] = [
      { id: 'c1', kind: 'hue', role: 'melody', swatch: '#f58c55' },
    ];
    // Two proposals both near that one channel: one updates it, the other is added.
    const out = applyDetectedColours(existing, [found('#f2884f'), found('#fac846')]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('c1');
    expect(out[1].id).not.toBe('c1');
  });

  it('a colour that looks like the board is not made into a channel', () => {
    // It stays in the proposal list, marked, so the player sees it was found and
    // rejected — but a channel for the wood is clutter at best. On the rig it was worse:
    // the wood looks slightly different each search, so every run added another one,
    // ending with three "Orange" channels and one of them matching 56 squares.
    expect(applyDetectedColours([], [found('#c8b496', true)])).toHaveLength(0);
    expect(applyDetectedColours([], [found('#c8b496', true), found('#2f6fd0')])).toHaveLength(1);
  });

  it('searching again and again does not pile up board-coloured channels', () => {
    let channels = applyDetectedColours([], BOARD_SET.map((s) => found(s)));
    for (let run = 0; run < 3; run++) {
      // Each search sees the wood a little differently, which is what used to add a new
      // channel every time.
      channels = applyDetectedColours(channels, [
        ...BOARD_SET.map((s) => found(s)),
        found(`#c8b4${(0x96 + run * 8).toString(16)}`, true),
      ]);
    }
    expect(channels).toHaveLength(8);
  });

  it('a colour they already have that now matches the board is switched off, not dropped', () => {
    // Different from never creating it: this one they chose, so it stays, with its job
    // turned off rather than silently removed from under them.
    const existing: ColourChannel[] = [
      { id: 'c1', kind: 'hue', role: 'bass', swatch: '#c8b496' },
    ];
    const out = applyDetectedColours(existing, [found('#c8b496', true)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'c1', role: 'off' });
  });

  it('never reuses an id that saved loops or pages still point at', () => {
    const out = applyDetectedColours([], [found('#2f6fd0')], ['c1', 'c2']);
    expect(out[0].id).not.toBe('c1');
    expect(out[0].id).not.toBe('c2');
  });
});
