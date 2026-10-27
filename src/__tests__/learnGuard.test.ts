import { describe, it, expect } from 'vitest';
import { autoLearnAllowed, learntSquares } from '../ui/screens/boardSequencer/learnGuard';

describe('learning the empty board on its own, when the corners are confirmed', () => {
  it('nothing learnt yet and not playing: learn it', () => {
    expect(autoLearnAllowed({ hasLearnt: false, running: false })).toBe(true);
  });
  it('already learnt: keep it (re-finding mid-session often has counters down); Learn it again is for that', () => {
    expect(autoLearnAllowed({ hasLearnt: true, running: false })).toBe(false);
  });
  it('never while the board plays', () => {
    expect(autoLearnAllowed({ hasLearnt: false, running: true })).toBe(false);
  });
});

describe('whether the board counts as learnt', () => {
  it('learnt means the empty board itself was learnt, not only its colours', () => {
    expect(learntSquares({ boardReference: null, boardColours: [1, 2, 3] })).toBe(0);
    expect(learntSquares({ boardReference: {}, boardColours: [1, 2, 3] })).toBe(3);
  });
});
