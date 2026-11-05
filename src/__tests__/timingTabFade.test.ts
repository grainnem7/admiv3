/** K1 (Keep design, 5 Nov 2026): the old ways to make a loop are retired words; Keep as loop is the word. */
import { describe, it, expect } from 'vitest';
import { retiredWordsIn, WORDS } from '../ui/screens/boardSequencer/words';

describe('K1: one way to make a loop', () => {
  it('"Keep the board as this loop" and "Other ways to make a loop" are retired; Keep as loop is the word', () => {
    expect(retiredWordsIn('Press Keep the board as this loop')).toEqual(['Keep the board as this loop']);
    expect(retiredWordsIn('▸ Other ways to make a loop')).toEqual(['Other ways to make a loop']);
    expect(retiredWordsIn('Keep as loop beside ▶ Play')).toEqual([]);
    expect(WORDS.keepAsLoop).toBe('Keep as loop');
  });
});
