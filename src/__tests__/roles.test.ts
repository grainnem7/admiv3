import { describe, it, expect } from 'vitest';
import { suggestRole } from '../ui/screens/boardSequencer/roles';

describe('suggestRole', () => {
  it('first colour → Melody; a black counter → Drums when free', () => {
    expect(suggestRole([], { kind: 'hue' })).toBe('melody');
    expect(suggestRole([], { kind: 'black' })).toBe('drums');
  });
  it('fills free jobs in order Melody, Bass, Drums, Chords', () => {
    expect(suggestRole([{ role: 'melody' }], { kind: 'hue' })).toBe('bass');
    expect(suggestRole([{ role: 'melody' }, { role: 'bass' }], { kind: 'white' })).toBe('drums');
  });
  it('a black counter when Drums is taken gets the first free job', () => {
    expect(suggestRole([{ role: 'drums' }], { kind: 'black' })).toBe('melody');
  });
  it('respects jobs the user reassigned, and gives Off when none are free', () => {
    expect(suggestRole([{ role: 'bass' }, { role: 'volume' }], { kind: 'hue' })).toBe('melody');
    expect(suggestRole([{ role: 'melody' }, { role: 'bass' }, { role: 'drums' }, { role: 'chord' }], { kind: 'hue' })).toBe('off');
  });
});
