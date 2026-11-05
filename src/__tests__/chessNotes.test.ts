import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { squareToMidi, soundsForMove } from '../songs/chess/chessNotes';
import { OPERA_GAME_PGN } from '../songs/chess/games';
import { DEFAULT_CHESS_SOUNDS, chessVoiceSpecs, voiceLabel } from '../songs/chess/chessVoices';

const play = (sans: string[]) => {
  const g = new Chess();
  return sans.map((s) => g.move(s));
};

describe('chess notes', () => {
  it('the file is the note in the scale, the rank the octave', () => {
    expect(squareToMidi('a1')).toBe(48); // C3
    expect(squareToMidi('e1')).toBe(55); // G3
    expect(squareToMidi('h1')).toBe(60); // C4
    expect(squareToMidi('a3')).toBe(60);
    expect(squareToMidi('a8')).toBe(84);
    expect(() => squareToMidi('i9')).toThrow();
  });

  it('each piece plays its own voice; black is an octave lower', () => {
    const [e4, e5, nf3] = play(['e4', 'e5', 'Nf3']);
    expect(soundsForMove(e4)).toEqual([{ voice: 'wp', midi: squareToMidi('e4'), velocity: 0.75, delaySec: 0, square: 'e4' }]);
    expect(soundsForMove(e5)[0]).toMatchObject({ voice: 'bp', midi: squareToMidi('e5') - 12 });
    expect(soundsForMove(nf3)[0].voice).toBe('wn');
  });

  it('a capture adds a drum, check is an accent with a cymbal', () => {
    const moves = play(['e4', 'f5', 'exf5', 'e6', 'Qh5+']);
    const take = soundsForMove(moves[2]);
    expect(take.map((s) => s.drum ?? s.voice)).toEqual(['wp', 'snare']);
    const check = soundsForMove(moves[4]);
    expect(check[0]).toMatchObject({ voice: 'wq', velocity: 1 });
    expect(check.some((s) => s.drum === 'crash')).toBe(true);
  });

  it('castling plays the king, then the rook on its new square', () => {
    const moves = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    const s = soundsForMove(moves[6]);
    expect(s.map((x) => [x.voice, x.square])).toEqual([['wk', 'g1'], ['wr', 'f1']]);
    expect(s[1].delaySec).toBeGreaterThan(0);
  });

  it('a promoted pawn sings as its new piece', () => {
    const g = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const m = g.move('a8=Q');
    expect(soundsForMove(m)[0].voice).toBe('wq');
  });

  it('a captured piece is never heard again in the built in game', () => {
    const g = new Chess();
    g.loadPgn(OPERA_GAME_PGN);
    const moves = g.history({ verbose: true });
    expect(moves).toHaveLength(33);
    expect(g.isCheckmate()).toBe(true);
    // Track each piece by where it stands; a taken piece's square is overwritten.
    const where = new Map<string, string>(); // square -> piece id
    const replay = new Chess();
    for (const sq of 'abcdefgh'.split('').flatMap((f) => [1, 2, 7, 8].map((r) => f + r))) where.set(sq, sq);
    const gone = new Set<string>();
    for (const m of moves) {
      const id = where.get(m.from)!;
      expect(gone.has(id)).toBe(false); // the piece that sounds is still on the board
      const taken = m.flags.includes('e') ? where.get(m.to[0] + m.from[1]) : where.get(m.to);
      if (m.captured && taken) gone.add(taken);
      where.delete(m.from);
      where.set(m.to, id);
      if (m.flags.includes('k') || m.flags.includes('q')) {
        const r = m.color === 'w' ? '1' : '8';
        const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
        where.set(rt + r, where.get(rf + r)!);
        where.delete(rf + r);
      }
      replay.move(m.san);
      expect(soundsForMove(m).length).toBeGreaterThan(0);
    }
    expect(gone.size).toBeGreaterThan(5);
  });

  it('twelve voices, each a sound from the catalogue with a plain name', () => {
    expect(Object.keys(DEFAULT_CHESS_SOUNDS)).toHaveLength(12);
    const specs = chessVoiceSpecs();
    expect(specs.wk).toEqual({ synth: 'pad' });
    expect(specs.wp).toBe('harp');
    expect(voiceLabel('wp')).toBe('White pawns: Harp');
    expect(voiceLabel('bk')).toBe('Black king: Choir pad');
  });
});
