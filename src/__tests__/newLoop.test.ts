import { describe, it, expect } from 'vitest';
import { boardSeen, engineSettingsFor, hearWith, startNewLoop, startWithThese } from '../songs/performance/newLoop';

const own = { band: 'gentle' as const, fillAmount: 0.4, evolveAmount: 0.5 };

describe('a new loop starts from silence', () => {
  it('with counters still on the board it waits for the board to be seen empty', () => {
    const s = startNewLoop(3);
    expect(s.phase).toBe('waitEmpty');
    expect(s.leftover).toBe(3);
    expect(boardSeen(s, 2)).toMatchObject({ phase: 'waitEmpty', leftover: 2 });
    expect(boardSeen(s, 0).phase).toBe('composing');
  });

  it('with an empty board it is ready to compose at once', () => {
    expect(startNewLoop(0).phase).toBe('composing');
  });

  it('Start with these skips the wait', () => {
    expect(startWithThese(startNewLoop(5)).phase).toBe('composing');
  });

  it('once composing, the board emptying does not send it back to waiting', () => {
    const s = boardSeen(startNewLoop(0), 0);
    expect(boardSeen(s, 0).phase).toBe('composing');
  });
});

describe('what the engine plays during a new loop', () => {
  it('outside a new loop: the player’s own settings, no loops', () => {
    expect(engineSettingsFor(null, own)).toEqual({ ...own, loops: [] });
  });

  it('waiting for an empty board: everything off', () => {
    expect(engineSettingsFor(startNewLoop(2), own)).toEqual({ band: 'off', fillAmount: 0, evolveAmount: 0, loops: [] });
  });

  it('composing: silence but for the counters, until Hear it with… adds something', () => {
    const s = startNewLoop(0);
    expect(engineSettingsFor(s, own)).toEqual({ band: 'off', fillAmount: 0, evolveAmount: 0, loops: [] });
    expect(engineSettingsFor(hearWith(s, { band: true }), own)).toMatchObject({ band: 'gentle', fillAmount: 0 });
    expect(engineSettingsFor(hearWith(s, { fill: true }), own)).toMatchObject({ band: 'off', fillAmount: 0.3 });
    expect(engineSettingsFor(hearWith(s, { loop: 2 }), own).loops).toEqual([2]);
    expect(engineSettingsFor(hearWith(hearWith(s, { loop: 2 }), { loop: null }), own).loops).toEqual([]);
  });

  it('Sounds change is always off while making a loop', () => {
    expect(engineSettingsFor(hearWith(startNewLoop(0), { band: true, fill: true }), own).evolveAmount).toBe(0);
  });
});

describe('what the player’s own counters do during a new loop', () => {
  it('while waiting for an empty board the counters are silent; once composing they sound', async () => {
    const { playerCellsFor } = await import('../songs/performance/newLoop');
    const cells = [{ row: 1, col: 1, colour: 'green' }];
    expect(playerCellsFor(startNewLoop(1), cells)).toEqual([]);
    expect(playerCellsFor(boardSeen(startNewLoop(1), 0), cells)).toEqual(cells);
    expect(playerCellsFor(null, cells)).toEqual(cells);
  });
});

describe('which loops play', () => {
  it('outside a new loop: the wanted ones; during one: only the loop asked for with Hear it with…, at Play too', async () => {
    const { loopsToPlay } = await import('../songs/performance/newLoop');
    expect(loopsToPlay(null, [3, 1], own)).toEqual([1, 3]);
    expect(loopsToPlay(startNewLoop(0), [3, 1], own)).toEqual([]);
    expect(loopsToPlay(hearWith(startNewLoop(0), { loop: 2 }), [3, 1], own)).toEqual([2]);
  });
});

describe('Stop ends what New loop was heard with (T4-07)', () => {
  it('the band, Extra notes and the loop heard alongside all end; the phase stays as it was', async () => {
    const { stopHearing } = await import('../songs/performance/newLoop');
    const heard = hearWith(startNewLoop(0), { band: true, fill: true, loop: 2 });
    const s = stopHearing(heard);
    expect(s.with).toEqual({ band: false, fill: false, loop: null });
    expect(s.phase).toBe('composing');
    expect(engineSettingsFor(s, own).loops).toEqual([]);
    const waiting = startNewLoop(3);
    expect(stopHearing(waiting)).toBe(waiting);
  });
});

describe('the loop Keep fills (T2-01, T4-04)', () => {
  it('the first empty loop that no scene uses; a cleared loop a scene still names is never refilled', async () => {
    const { slotForKeep } = await import('../songs/performance/newLoop');
    const cells = [{ row: 1, col: 1, colour: 'red' }];
    expect(slotForKeep([cells, null, null], [])).toBe(1);
    // Slot 1 was cleared but the scene Arrival still uses it: Keep goes past it.
    expect(slotForKeep([cells, null, null], [{ loops: [1] }])).toBe(2);
    // An empty list of notes is as empty as none.
    expect(slotForKeep([cells, [], null], [])).toBe(1);
  });

  it('none when every loop is taken', async () => {
    const { slotForKeep } = await import('../songs/performance/newLoop');
    const cells = [{ row: 1, col: 1, colour: 'red' }];
    expect(slotForKeep(Array.from({ length: 8 }, () => cells), [])).toBeNull();
    expect(slotForKeep([...Array.from({ length: 7 }, () => cells), null], [{ loops: [7] }])).toBeNull();
  });
});

describe('quick names never give two loops the same name (T1-08)', () => {
  it('a name already used gets the next free number', async () => {
    const { quickName } = await import('../songs/performance/newLoop');
    expect(quickName('Bed', [])).toBe('Bed');
    expect(quickName('Bed', ['Pulse'])).toBe('Bed');
    expect(quickName('Bed', ['Bed'])).toBe('Bed 2');
    expect(quickName('Bed', ['bed ', 'Bed 2'])).toBe('Bed 3');
  });
});

import { chooseFromEmpty, placesFreeLine } from '../songs/performance/newLoop';

describe('U1: with counters already down, New loop asks first (owner: a choice every time)', () => {
  it('opens on the choice, silent, as before', () => {
    const s = startNewLoop(4);
    expect(s.choosing).toBe(true);
    expect(s.phase).toBe('waitEmpty');
    expect(engineSettingsFor(s, own)).toEqual({ band: 'off', fillAmount: 0, evolveAmount: 0, loops: [] });
  });

  it('an empty board has nothing to choose', () => {
    expect(startNewLoop(0).choosing).toBe(false);
  });

  it('Start from empty: the wait to lift the counters, no longer choosing', () => {
    const s = chooseFromEmpty(startNewLoop(4));
    expect(s.choosing).toBe(false);
    expect(s.phase).toBe('waitEmpty');
    expect(s.leftover).toBe(4);
  });

  it('keeping what is on the board composes with it, no longer choosing', () => {
    const s = startWithThese(startNewLoop(4));
    expect(s.choosing).toBe(false);
    expect(s.phase).toBe('composing');
  });

  it('lifting every counter while choosing starts from empty by itself', () => {
    const s = boardSeen(startNewLoop(4), 0);
    expect(s.phase).toBe('composing');
    expect(s.choosing).toBe(false);
  });
});

describe('U1: how many places are free for loops', () => {
  it('says how many of the eight are free', () => {
    expect(placesFreeLine(6, 8)).toBe('6 of 8 places free');
    expect(placesFreeLine(1, 8)).toBe('1 of 8 places free');
    expect(placesFreeLine(0, 8)).toBe('Every place is full: clear a loop to make another');
  });
});
