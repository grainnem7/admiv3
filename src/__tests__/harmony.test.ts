import { describe, it, expect } from 'vitest';
import { ChordSymbols } from '@magenta/music/esm/core/chords';
import { bassNote, chordOnDegree, degreeOfNote, parentScale, voiceLead, voiceNear } from '../songs/harmony/harmony';

const MAJ_PENT = [0, 2, 4, 7, 9];
const MIN_PENT = [0, 3, 5, 7, 10];
const C = 60;

describe('harmony — real chords from the board\'s scale', () => {
  it('finds the seven-note parent of a pentatonic', () => {
    expect(parentScale(MAJ_PENT)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(parentScale(MIN_PENT)).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(parentScale([0, 3, 5, 6, 7, 10])).toEqual([0, 2, 3, 5, 7, 8, 10]); // blues → minor
    expect(parentScale([0, 2, 4, 5, 7, 9, 11])).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('builds the key\'s own triads: I major, ii minor, vii diminished', () => {
    expect(chordOnDegree(0, C, MAJ_PENT, 'electronic')).toMatchObject({ pcs: [0, 4, 7], symbol: 'C' });
    expect(chordOnDegree(1, C, MAJ_PENT, 'electronic')).toMatchObject({ pcs: [2, 5, 9], symbol: 'Dm' });
    expect(chordOnDegree(6, C, MAJ_PENT, 'electronic')).toMatchObject({ pcs: [11, 2, 5], symbol: 'Bdim' });
    expect(chordOnDegree(0, C, MIN_PENT, 'electronic')).toMatchObject({ pcs: [0, 3, 7], symbol: 'Cm' });
  });

  it('each world adds its own colour', () => {
    expect(chordOnDegree(1, C, MAJ_PENT, 'lofi').symbol).toBe('Dm9');
    expect(chordOnDegree(0, C, MAJ_PENT, 'lofi').symbol).toBe('Cmaj7');
    expect(chordOnDegree(4, C, MAJ_PENT, 'warm').symbol).toBe('G7');
    expect(chordOnDegree(0, C, MAJ_PENT, 'warm').symbol).toBe('C');
    expect(chordOnDegree(0, C, MAJ_PENT, 'ambient').symbol).toBe('Csus2');
    expect(chordOnDegree(5, C, MAJ_PENT, 'ambient').symbol).toBe('Amadd9');
  });

  it('every symbol is one Magenta can read, in every key, scale and world', () => {
    for (const root of [60, 61, 63, 66, 68, 70]) {
      for (const scale of [MAJ_PENT, MIN_PENT, [0, 2, 3, 5, 7, 9, 10], [0, 2, 5, 7, 10]]) {
        for (const style of ['warm', 'lofi', 'ambient', 'electronic'] as const) {
          for (let d = 0; d < 7; d++) {
            const ch = chordOnDegree(d, root, scale, style);
            expect(() => ChordSymbols.pitches(ch.symbol)).not.toThrow();
            // And the symbol means the pitches we play.
            const parsed = new Set(ChordSymbols.pitches(ch.symbol).map((p) => p % 12));
            for (const pc of ch.pcs) expect(parsed.has(pc)).toBe(true);
          }
        }
      }
    }
  });

  it('a counter\'s row maps to the nearest degree of the parent scale', () => {
    expect(degreeOfNote(64, C, MAJ_PENT)).toBe(2);
    expect(degreeOfNote(67, C, MAJ_PENT)).toBe(4);
  });

  it('voices a chord near a centre, and leads one chord into the next by small steps', () => {
    const c = voiceNear(chordOnDegree(0, C, MAJ_PENT, 'electronic'), 62);
    expect(c.every((n) => n >= 56 && n <= 68)).toBe(true);
    const g = voiceLead(chordOnDegree(4, C, MAJ_PENT, 'electronic'), c, 48, 76);
    // Each note of C moves at most a few semitones to reach G.
    for (const p of c) expect(Math.min(...g.map((n) => Math.abs(n - p)))).toBeLessThanOrEqual(2);
    expect(g.every((n) => n >= 48 && n <= 76)).toBe(true);
  });

  it('the bass takes the root low down', () => {
    expect(bassNote({ rootPc: 0 })).toBe(36);
    expect(bassNote({ rootPc: 9 })).toBe(45);
    expect(bassNote({ rootPc: 11 }, 40)).toBe(47);
  });
});
