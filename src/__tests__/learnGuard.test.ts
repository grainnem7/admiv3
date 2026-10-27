import { describe, it, expect } from 'vitest';
import { autoLearnAllowed } from '../ui/screens/boardSequencer/learnGuard';

describe('learning the empty board on its own, when the corners are confirmed', () => {
  it('nothing learnt yet: learn, whatever is on it (something beats nothing)', () => {
    expect(autoLearnAllowed(30, 64, false)).toBe(true);
  });
  it('already learnt and the board looks empty: learn it again', () => {
    expect(autoLearnAllowed(7, 64, true)).toBe(true);
  });
  it('already learnt and counters seem to be on it: keep the good one', () => {
    expect(autoLearnAllowed(9, 64, true)).toBe(false);
  });
});
