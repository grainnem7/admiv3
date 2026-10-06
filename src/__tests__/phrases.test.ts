import { describe, it, expect } from 'vitest';
import { harmonyAt, phraseEventsAtStep, type PhraseCell, type PhraseInput, type PhraseRole } from '../songs/phrases/phrases';
import { degreeMidi } from '../songs/boardSequencerScale';

const PENT = [0, 2, 4, 7, 9];
const ROWS = 8;

function input(cells: PhraseCell[], step: number, over: Partial<PhraseInput> = {}): PhraseInput {
  return {
    cells, rows: ROWS, rootMidi: 60, semitones: PENT, style: 'warm',
    stepFor: () => step, loopFor: () => 8, ...over,
  };
}
const cell = (role: PhraseRole, row: number, col: number, colour = role): PhraseCell => ({ role, row, col, colour });
/** Events across a whole loop. */
const loopEvents = (cells: PhraseCell[], over: Partial<PhraseInput> = {}) =>
  Array.from({ length: 8 }, (_, step) => phraseEventsAtStep(input(cells, step, over)));

describe('phrases — one counter fills the loop', () => {
  it('a single drum counter plays on every beat of the loop', () => {
    const perStep = loopEvents([cell('drums', 4, 0)]);
    for (const events of perStep) expect(events.some((e) => e.drum)).toBe(true);
  });

  it('a counter owns the beats up to the next counter of its colour, wrapping round', () => {
    const cells = [cell('melody', 3, 1), cell('melody', 6, 5)];
    expect(phraseEventsAtStep(input(cells, 3)).every((e) => e.owner.col === 1)).toBe(true);
    expect(phraseEventsAtStep(input(cells, 6)).every((e) => e.owner.col === 5)).toBe(true);
    // Before the first counter: still the last one's phrase, carried round the loop.
    expect(phraseEventsAtStep(input(cells, 0)).every((e) => e.owner.col === 5)).toBe(true);
  });

  it('higher drum counters play busier grooves', () => {
    const hits = (row: number) => loopEvents([cell('drums', row, 0)]).flat().length;
    expect(hits(0)).toBeGreaterThan(hits(7));
  });

  it('every note is placed inside its beat', () => {
    const all = loopEvents([cell('drums', 0, 0), cell('melody', 2, 0), cell('bass', 7, 0), cell('chord', 5, 0)], { style: 'electronic' }).flat();
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) {
      expect(e.offset).toBeGreaterThanOrEqual(0);
      expect(e.offset).toBeLessThan(1);
    }
  });

  it('the same board always plays the same phrases', () => {
    const cells = [cell('drums', 1, 0), cell('melody', 3, 2), cell('bass', 6, 4)];
    expect(loopEvents(cells)).toEqual(loopEvents(cells));
  });

  it('a counter set to vary passes that on to its whole phrase', () => {
    const events = phraseEventsAtStep(input([{ ...cell('drums', 4, 0), conditional: true }], 0));
    expect(events.every((e) => e.owner.conditional)).toBe(true);
  });
});

describe('phrases — chord counters write the progression', () => {
  it('with no chord counter there is no chord, and bass follows its own row', () => {
    expect(harmonyAt(input([cell('bass', 7, 0)], 0))).toBeNull();
    const bass = phraseEventsAtStep(input([cell('bass', 7, 0)], 0)).filter((e) => e.midi !== undefined);
    // Bottom row = the key note, carried down into the bass register.
    expect(bass[0].midi! % 12).toBe(0);
  });

  it('bass takes its root from the chord counter that owns the beat', () => {
    // A chord counter one row up from the bottom = scale step 1 (D in C major pentatonic).
    const cells = [cell('chord', 6, 0), cell('bass', 7, 0)];
    const bass = phraseEventsAtStep(input(cells, 0)).filter((e) => e.role === 'bass');
    expect(bass[0].midi! % 12).toBe(degreeMidi(1, 60, PENT) % 12);
  });

  it('two chord counters make a two-chord loop', () => {
    const cells = [cell('chord', 7, 0), cell('chord', 4, 4)];
    const first = harmonyAt(input(cells, 1))!;
    const second = harmonyAt(input(cells, 5))!;
    expect(first.root).not.toBe(second.root);
  });

  it('melody notes on the beat land on a note of the chord', () => {
    const cells = [cell('chord', 7, 0), cell('melody', 2, 0)];
    const chordPcs = harmonyAt(input(cells, 0))!.tones.map((t) => t % 12);
    for (const events of loopEvents(cells)) {
      for (const e of events.filter((x) => x.role === 'melody' && x.offset === 0)) {
        expect(chordPcs).toContain(e.midi! % 12);
      }
    }
  });

  it("a backing song's chord wins over chord counters", () => {
    const h = harmonyAt(input([cell('chord', 7, 0)], 0, { songChord: [65, 69, 72] }))!;
    expect(h.tones).toEqual([65, 69, 72]);
  });
});

describe('phrases — styles', () => {
  it('each world has its own groove for the same counter', () => {
    const groove = (style: PhraseInput['style']) => JSON.stringify(loopEvents([cell('drums', 2, 0)], { style }));
    const all = new Set(['warm', 'lofi', 'ambient', 'electronic'].map((s) => groove(s as PhraseInput['style'])));
    expect(all.size).toBe(4);
  });
});
