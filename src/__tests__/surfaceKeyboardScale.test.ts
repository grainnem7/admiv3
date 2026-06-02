import { describe, it, expect } from 'vitest';
import { pentatonicMidiForTube } from '../songs/surfaceKeyboardScale';

describe('pentatonicMidiForTube', () => {
  it('ascends through the major pentatonic from the base note (C4 = 60)', () => {
    // C D E G A  C  D  E  G  A  C…
    expect(pentatonicMidiForTube(0)).toBe(60); // C4
    expect(pentatonicMidiForTube(1)).toBe(62); // D4
    expect(pentatonicMidiForTube(2)).toBe(64); // E4
    expect(pentatonicMidiForTube(3)).toBe(67); // G4
    expect(pentatonicMidiForTube(4)).toBe(69); // A4
  });

  it('wraps into the next octave after five degrees', () => {
    expect(pentatonicMidiForTube(5)).toBe(72); // C5
    expect(pentatonicMidiForTube(6)).toBe(74); // D5
    expect(pentatonicMidiForTube(10)).toBe(84); // C6
  });

  it('honours a custom base note', () => {
    expect(pentatonicMidiForTube(0, 48)).toBe(48); // C3
    expect(pentatonicMidiForTube(3, 48)).toBe(55); // G3
  });
});
