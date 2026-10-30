import { describe, it, expect } from 'vitest';
import { nameStartsWithVisible, wordsOf } from '../ui/screens/boardSequencer/labelInName';

describe('label in name (A9)', () => {
  it('ignores symbols, emoji, case and spacing', () => {
    expect(wordsOf('↻  New idea')).toBe('new idea');
    expect(wordsOf('▶ Rehearse from here')).toBe('rehearse from here');
  });
  it('a name that starts with the visible words passes', () => {
    expect(nameStartsWithVisible('Save session: 12 notes, 4 yours', 'Save session (12 notes)')).toBe(true);
    expect(nameStartsWithVisible('Save session', 'Save session')).toBe(true);
    expect(nameStartsWithVisible('New idea: other extra notes', '↻ New idea')).toBe(true);
    expect(nameStartsWithVisible('1. Camera, done', '1. Camera')).toBe(true);
  });
  it('the audit’s examples fail', () => {
    expect(nameStartsWithVisible('Save the session log as JSON', 'Save session')).toBe(false);
    expect(nameStartsWithVisible('Try other extra notes', '↻ Try another')).toBe(false);
    expect(nameStartsWithVisible('Step 1 of 4: Camera', '1. Camera')).toBe(false);
    expect(nameStartsWithVisible('Edit the notes of loop 2', '✎ Edit notes')).toBe(false);
  });
  it('a word is whole: "Play" is not the start of "Playing"', () => {
    expect(nameStartsWithVisible('Playing now', 'Play')).toBe(false);
  });
  it('no visible words, nothing to match', () => {
    expect(nameStartsWithVisible('Close', '✕')).toBe(true);
  });
});
