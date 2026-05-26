import { describe, it, expect } from 'vitest';
import { keyToRemixAction } from '../remix/remixKeyMap';

describe('keyToRemixAction', () => {
  it('maps digits 1-4 to focusStem index 0-3', () => {
    expect(keyToRemixAction('1')).toEqual({ kind: 'focusStem', index: 0 });
    expect(keyToRemixAction('4')).toEqual({ kind: 'focusStem', index: 3 });
  });

  it('maps arrows to filter and loop nudge', () => {
    expect(keyToRemixAction('ArrowUp')).toEqual({ kind: 'filter', dir: 1 });
    expect(keyToRemixAction('ArrowDown')).toEqual({ kind: 'filter', dir: -1 });
    expect(keyToRemixAction('ArrowLeft')).toEqual({ kind: 'nudgeLoop', dir: -1 });
    expect(keyToRemixAction('ArrowRight')).toEqual({ kind: 'nudgeLoop', dir: 1 });
  });

  it('maps S to stutter, [ ] to loop length, space to togglePlay', () => {
    expect(keyToRemixAction('s')).toEqual({ kind: 'stutter' });
    expect(keyToRemixAction('S')).toEqual({ kind: 'stutter' });
    expect(keyToRemixAction('[')).toEqual({ kind: 'loopLen', dir: -1 });
    expect(keyToRemixAction(']')).toEqual({ kind: 'loopLen', dir: 1 });
    expect(keyToRemixAction(' ')).toEqual({ kind: 'togglePlay' });
  });

  it('returns null for unmapped keys', () => {
    expect(keyToRemixAction('q')).toBeNull();
    expect(keyToRemixAction('5')).toBeNull();
    expect(keyToRemixAction('Enter')).toBeNull();
  });
});
