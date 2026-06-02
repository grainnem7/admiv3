import { describe, it, expect } from 'vitest';
import { ChordToneNoteSource, buildChordLadder } from '../songs/voices/NoteSource';
import type { ChordEntry } from '../songs/voices/chordLookup';

const dMajor: ChordEntry = { time: 0, notes: [50, 57, 62, 66], root: 50, name: 'D' }; // D3 A3 D4 F#4

describe('buildChordLadder', () => {
  it('sorts the chord tones and layers an octave above, deduped', () => {
    // notes [50,57,62,66] + octave-up [62,69,74,78]; 62 appears in both layers so dedup removes one
    const deduped = Array.from(new Set([50, 57, 62, 66, 62 + 12, 57 + 12, 50 + 12, 66 + 12])).sort((a, b) => a - b);
    expect(buildChordLadder(dMajor)).toEqual(deduped);
  });
});

describe('ChordToneNoteSource', () => {
  it('maps each button id to a distinct chord tone by its order index', () => {
    const src = new ChordToneNoteSource(['press-1', 'press-2', 'press-3']);
    const ladder = buildChordLadder(dMajor);
    expect(src.noteForPress('press-1', dMajor)).toBe(ladder[0]);
    expect(src.noteForPress('press-2', dMajor)).toBe(ladder[1]);
    expect(src.noteForPress('press-3', dMajor)).toBe(ladder[2]);
  });

  it('wraps around the ladder when there are more buttons than tones', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `press-${i + 1}`);
    const src = new ChordToneNoteSource(ids);
    const ladder = buildChordLadder(dMajor);
    expect(src.noteForPress('press-9', dMajor)).toBe(ladder[(9 - 1) % ladder.length]);
  });

  it('an unknown button id falls back to the lowest chord tone', () => {
    const src = new ChordToneNoteSource(['press-1']);
    expect(src.noteForPress('nope', dMajor)).toBe(buildChordLadder(dMajor)[0]);
  });
});
