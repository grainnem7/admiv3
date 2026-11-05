import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { materialEval, gamePhase, energyFromEval, shapeSounds, endingSounds, MATE_CP, WORLD_FOR_PHASE } from '../songs/chess/chessMusic';
import { OPERA_GAME_PGN } from '../songs/chess/games';

const fenAfter = (sans: string[]): string => { const g = new Chess(); sans.forEach((s) => g.move(s)); return g.fen(); };

describe('chess tension', () => {
  it('material: even at the start, up a pawn after a capture, mate is the most', () => {
    expect(materialEval(new Chess().fen())).toBe(0);
    expect(materialEval(fenAfter(['e4', 'd5', 'exd5']))).toBe(100);
    expect(materialEval(fenAfter(['f3', 'e5', 'g4', 'Qh4#']))).toBe(-MATE_CP);
  });

  it('the phase moves from opening to middlegame to endgame, and the World with it', () => {
    expect(gamePhase(new Chess().fen(), 0)).toBe('opening');
    const g = new Chess(); g.loadPgn(OPERA_GAME_PGN);
    const hist = g.history({ verbose: true });
    expect(gamePhase(hist[24].after, 25)).toBe('middlegame');
    expect(gamePhase('8/5k2/8/8/3R4/8/5K2/8 w - - 0 60', 118)).toBe('endgame');
    expect(WORLD_FOR_PHASE.endgame).toBe('ambient');
  });

  it('energy: calm when even, higher with an advantage, highest after a swing', () => {
    const even = energyFromEval(10, 0);
    const ahead = energyFromEval(400, 380);
    const swing = energyFromEval(400, -100);
    expect(even).toBeLessThan(ahead);
    expect(ahead).toBeLessThan(swing);
    expect(energyFromEval(MATE_CP, 0)).toBeLessThanOrEqual(1);
  });

  it('lively moves are louder and get a kick', () => {
    const s = [{ voice: 'wp', midi: 60, velocity: 0.75, delaySec: 0, square: 'e4' }];
    expect(shapeSounds(s, 0.2)).toHaveLength(1);
    const lively = shapeSounds(s, 0.9);
    expect(lively[0].velocity).toBeGreaterThan(shapeSounds(s, 0.2)[0].velocity);
    expect(lively.some((x) => x.drum === 'kick')).toBe(true);
  });

  it('the ending at checkmate: every piece left, the winner louder, a cymbal', () => {
    const g = new Chess(); g.loadPgn(OPERA_GAME_PGN);
    const end = endingSounds(g.fen());
    const notes = end.filter((x) => !x.drum);
    expect(notes.length).toBe(g.board().flat().filter(Boolean).length);
    expect(end.some((x) => x.drum === 'crash')).toBe(true);
    const white = notes.find((n) => n.voice.startsWith('w'))!;
    const black = notes.find((n) => n.voice.startsWith('b'))!;
    expect(white.velocity).toBeGreaterThan(black.velocity);
  });
});

describe('reading Stockfish', () => {
  it('reads centipawns and mates from a UCI line', async () => {
    const { parseScore } = await import('../songs/chess/stockfishEval');
    expect(parseScore('info depth 10 seldepth 14 multipv 1 score cp 34 nodes 1000 pv e2e4')).toBe(34);
    expect(parseScore('info depth 5 score mate -2 pv h7h8')).toBe(-MATE_CP);
    expect(parseScore('bestmove e2e4')).toBeNull();
  });
});
