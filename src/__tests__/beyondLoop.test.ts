import { describe, it, expect } from 'vitest';
import { beyondLoopNote, beyondLoopSquares } from '../songs/beyondLoop';
import type { ColourRole } from '../tracking/boardColours';

const roles: Record<string, ColourRole> = { r: 'melody', k: 'drums', b: 'bass', v: 'volume' };
const roleOf = (c: string): { role: ColourRole } | undefined => (roles[c] ? { role: roles[c] } : undefined);
const parts = (...rs: ColourRole[]): { role: ColourRole }[] => rs.map((role) => ({ role }));

describe('counters past their part’s loop', () => {
  const loops = { melodic: 6, drums: 0, bass: 0 };
  const counters: [string, string][] = [['0,5', 'r'], ['0,6', 'r'], ['1,7', 'r'], ['2,7', 'k'], ['3,7', 'v']];

  it('marks only the counters that can never sound', () => {
    // Melody loops over 6 of 8 steps: steps 7 and 8 (cols 6, 7) never play. Drums use
    // the whole board; a volume counter isn't a note at all.
    expect([...beyondLoopSquares(counters, roleOf, loops, 8, false)].sort()).toEqual(['0,6', '1,7']);
  });

  it('says which steps, for which part', () => {
    expect(beyondLoopNote(parts('melody', 'drums'), loops, 8, false))
      .toBe('Steps 7–8 are past Melody’s 6-step loop: melody counters there don’t play.');
    expect(beyondLoopNote(parts('bass'), { melodic: 0, drums: 0, bass: 7 }, 8, false))
      .toBe('Step 8 is past Bass’s 7-step loop: bass counters there don’t play.');
    // A part with no colour on the board, or every loop the full width: nothing to say.
    expect(beyondLoopNote(parts('drums'), loops, 8, false)).toBeNull();
  });

  it('with phrases on, only for colours playing one note (melody does, unless set to a tune)', () => {
    // Phrases on: melody still plays the notes placed, so it still drops steps 7–8…
    expect([...beyondLoopSquares(counters, roleOf, loops, 8, true)].sort()).toEqual(['0,6', '1,7']);
    // …but a melody set to play a tune owns a whole stretch, and isn't marked.
    const tune = (c: string) => (c === 'r' ? { role: 'melody' as const, plays: 'tune' as const } : roleOf(c));
    expect(beyondLoopSquares(counters, tune, loops, 8, true).size).toBe(0);
    expect(beyondLoopNote([{ role: 'melody', plays: 'tune' }], loops, 8, true)).toBeNull();
    expect(beyondLoopNote([{ role: 'melody', plays: 'tune' }], loops, 8, false)).not.toBeNull();
  });
});
