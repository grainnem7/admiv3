import { describe, it, expect } from 'vitest';
import {
  initialKnockState, stepKnock, releaseGhostsAt, letGo, ghostsForSave, keyOf, posKey,
  type KnockOpts, type KnockState,
} from '../tracking/handGuard/knockGuard';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const opts: KnockOpts = { minCount: 3, minFraction: 0.4, windowMs: 300 };

const cell = (row: number, col: number, colour = 'c1', conditional = false): ActiveCell =>
  (conditional ? { row, col, colour, conditional } : { row, col, colour });

const PATTERN = [cell(0, 0), cell(1, 1), cell(2, 2), cell(3, 3), cell(0, 3)];

/** Which squares are haunted — the ghost map is keyed by counter, not by square. */
const keys = (state: KnockState): string[] => [...state.ghosts.values()].map(posKey).sort();

describe('stepKnock', () => {
  it('losing enough of the pattern at once leaves ghosts behind', () => {
    const { state, knocked } = stepKnock(initialKnockState(), PATTERN, [cell(3, 3), cell(0, 3)], new Set(), 100, opts);
    expect(knocked).toBe(true);
    expect(keys(state)).toEqual(['0,0', '1,1', '2,2']);
  });

  it('two counters going is a tidy-up, not a knock', () => {
    const { state, knocked } = stepKnock(
      initialKnockState(), PATTERN, [cell(2, 2), cell(3, 3), cell(0, 3)], new Set(), 100, opts,
    );
    expect(knocked).toBe(false);
    expect(state.ghosts.size).toBe(0);
  });

  it('counters removed one by one over a second are not a knock', () => {
    let state = initialKnockState();
    let before = PATTERN;
    for (let i = 0; i < 3; i++) {
      const after = before.slice(1);
      const out = stepKnock(state, before, after, new Set(), i * 400, opts);
      state = out.state;
      before = after;
      expect(out.knocked).toBe(false);
    }
    expect(state.ghosts.size).toBe(0);
  });

  it('a hand covering counters is a hold, never a knock', () => {
    const held = new Set([posKey(cell(0, 0)), posKey(cell(1, 1)), posKey(cell(2, 2))]);
    const { state, knocked } = stepKnock(initialKnockState(), PATTERN, [cell(3, 3), cell(0, 3)], held, 100, opts);
    expect(knocked).toBe(false);
    expect(state.ghosts.size).toBe(0);
  });

  it('a ghost keeps its colour and its Variation flag', () => {
    const pattern = [cell(0, 0, 'red', true), cell(1, 1, 'black'), cell(2, 2, 'blue')];
    const { state } = stepKnock(initialKnockState(), pattern, [], new Set(), 100, opts);
    expect(state.ghosts.get('0,0,red')).toEqual({ row: 0, col: 0, colour: 'red', conditional: true });
    expect(state.ghosts.get('1,1,black')).toEqual({ row: 1, col: 1, colour: 'black' });
  });

  it('a second knock adds to the ghosts rather than replacing them', () => {
    const six = [...PATTERN, cell(2, 0)];
    const remaining = [cell(3, 3), cell(0, 3), cell(2, 0)];
    const first = stepKnock(initialKnockState(), six, remaining, new Set(), 100, opts);
    expect(keys(first.state)).toEqual(['0,0', '1,1', '2,2']);
    const second = stepKnock(first.state, remaining, [], new Set(), 900, opts);
    expect(second.knocked).toBe(true);
    expect(keys(second.state)).toEqual(['0,0', '0,3', '1,1', '2,0', '2,2', '3,3']);
  });

  it('does not re-ghost a cell that is already a ghost', () => {
    const first = stepKnock(initialKnockState(), PATTERN, [], new Set(), 100, opts);
    const again = stepKnock(first.state, PATTERN, [], new Set(), 200, opts);
    expect(again.knocked).toBe(false);
    expect(keys(again.state)).toEqual(keys(first.state));
  });
});

describe('ghosts going away', () => {
  it('a counter put back takes over its ghost, whatever its colour', () => {
    const { state } = stepKnock(initialKnockState(), PATTERN, [], new Set(), 100, opts);
    const after = releaseGhostsAt(state, [cell(1, 1, 'a-different-colour')]);
    expect(keys(after)).toEqual(['0,0', '0,3', '2,2', '3,3']);
  });

  it('Let go clears them all', () => {
    const { state } = stepKnock(initialKnockState(), PATTERN, [], new Set(), 100, opts);
    expect(letGo(state).ghosts.size).toBe(0);
  });
});

describe('ghostsForSave', () => {
  it('saves the ghosts plus what is still on the board, with live cells winning', () => {
    const { state } = stepKnock(initialKnockState(), PATTERN, [cell(3, 3)], new Set(), 100, opts);
    const saved = ghostsForSave(state, [cell(3, 3, 'live'), cell(2, 2, 'live-over-ghost')]);
    expect(saved).toContainEqual({ row: 3, col: 3, colour: 'live' });
    expect(saved).toContainEqual({ row: 2, col: 2, colour: 'live-over-ghost' });
    expect(saved.filter((c) => c.row === 2 && c.col === 2)).toHaveLength(1);
  });
});

describe('two counters to a square', () => {
  // Both counters play, so a square can hold a red and a blue at once. Keying the guard by
  // square alone hid one colour going, and dropped it from anything saved afterwards.
  const RED_AND_BLUE = [
    cell(0, 0, 'red'), cell(0, 0, 'blue'), cell(1, 1, 'red'), cell(1, 1, 'blue'),
    cell(2, 2, 'red'), cell(2, 2, 'blue'),
  ];

  it('sweeping one colour off the board is still a knock', () => {
    const left = RED_AND_BLUE.filter((c) => c.colour === 'blue');
    const { state, knocked } = stepKnock(initialKnockState(), RED_AND_BLUE, left, new Set(), 100, opts);
    expect(knocked).toBe(true);
    expect([...state.ghosts.keys()].sort()).toEqual(['0,0,red', '1,1,red', '2,2,red']);
  });

  it('putting one colour back leaves the other still sounding', () => {
    const left = RED_AND_BLUE.filter((c) => c.colour === 'blue');
    const { state } = stepKnock(initialKnockState(), RED_AND_BLUE, left, new Set(), 100, opts);
    const after = releaseGhostsAt(state, [...left, cell(0, 0, 'red')], true);
    expect([...after.ghosts.keys()].sort()).toEqual(['1,1,red', '2,2,red']);
  });

  it('with one counter to a square, any counter put back takes the ghost over', () => {
    const { state } = stepKnock(initialKnockState(), PATTERN, [cell(3, 3), cell(0, 3)], new Set(), 100, opts);
    const after = releaseGhostsAt(state, [cell(0, 0, 'other')]);
    expect(keys(after)).toEqual(['1,1', '2,2']);
  });

  it('saving the pattern keeps both colours on a square', () => {
    const saved = ghostsForSave(
      { recentLost: [], ghosts: new Map([[keyOf(cell(0, 0, 'red')), cell(0, 0, 'red')]]) },
      [cell(0, 0, 'blue')],
      true,
    );
    expect(saved.map((c) => c.colour).sort()).toEqual(['blue', 'red']);
  });
});
