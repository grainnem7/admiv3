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
