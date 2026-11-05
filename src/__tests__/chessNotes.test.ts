import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { squareToMidi, soundsForMove } from '../songs/chess/chessNotes';
import { OPERA_GAME_PGN } from '../songs/chess/games';

describe('chess notes', () => {
  it('the file is the note in the scale, the rank the octave', () => {
    expect(squareToMidi('a1')).toBe(48); // C3
    expect(squareToMidi('e1')).toBe(55); // G3
    expect(squareToMidi('h1')).toBe(60); // C4
    expect(squareToMidi('a3')).toBe(60);
    expect(squareToMidi('a8')).toBe(84);
    expect(() => squareToMidi('i9')).toThrow();
  });

  it('a move is one note on the square moved to; a capture adds a drum', () => {
    expect(soundsForMove({ from: 'e2', to: 'e4' })).toEqual([{ voice: 'move', midi: squareToMidi('e4'), velocity: 0.8, delaySec: 0, square: 'e4' }]);
    const take = soundsForMove({ from: 'd4', to: 'e5', captured: 'p' });
    expect(take).toHaveLength(2);
    expect(take[1].drum).toBe('snare');
  });

  it('the built in game loads and every move has a sound', () => {
    const g = new Chess();
    g.loadPgn(OPERA_GAME_PGN);
    const moves = g.history({ verbose: true });
    expect(moves).toHaveLength(33);
    expect(g.isCheckmate()).toBe(true);
    for (const m of moves) expect(soundsForMove(m).length).toBeGreaterThan(0);
  });
});
