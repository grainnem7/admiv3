import { describe, it, expect } from 'vitest';
import { bandLine } from '../ui/screens/boardSequencer/bandLine';

describe('the band line under the board', () => {
  it('names the middle level Quiet, as the Sound tab does; the stored value stays "gentle" (T1-12)', () => {
    expect(bandLine({ level: 'gentle', playing: true, parts: ['pad', 'bass'] }, true)).toBe('Band (quiet): pad · bass');
    expect(bandLine({ level: 'full', playing: true, parts: ['pad', 'bass', 'groove'] }, true)).toBe('Band (full): pad · bass · groove');
  });

  it('says when the player has every part, when it is about to join, and when it waits', () => {
    expect(bandLine({ level: 'gentle', playing: true, parts: [] }, true)).toBe('Band (quiet): you have taken every part');
    expect(bandLine({ level: 'gentle', playing: false, parts: [] }, true)).toBe('Band: joining on the next pass…');
    expect(bandLine({ level: 'full', playing: false, parts: [] }, false)).toBe('Band: waiting for your first counter.');
  });

  it('no line with the band off', () => {
    expect(bandLine({ level: 'off', playing: false, parts: [] }, true)).toBeNull();
  });
});
