import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { moveFromBoard, occupancyOfFen, changedSquares } from '../songs/chess/moveFromBoard';
import { START_OCCUPANCY, occupancyFromText, occupancyText, type Occupancy } from '../tracking/chess/chessOccupancy';

/** The board as the camera would see it after these moves from the start. */
const seenAfter = (sans: string[], from = new Chess()): Occupancy => {
  const g = new Chess(from.fen());
  for (const s of sans) g.move(s);
  return occupancyOfFen(g.fen());
};

/** Play a game the way the screen does: each grid read and applied in turn. */
function playGrids(grids: Occupancy[], game = new Chess()): string[] {
  for (const grid of grids) {
    const r = moveFromBoard(game, grid);
    if (r.kind === 'moves') for (const m of r.moves) game.move(m.san);
    else if (r.kind === 'takeBack') game.undo();
  }
  return game.history();
}

describe('moves from the board', () => {
  it('the start position reads as the start', () => {
    expect(occupancyOfFen(new Chess().fen())).toEqual(START_OCCUPANCY);
    expect(moveFromBoard(new Chess(), START_OCCUPANCY)).toEqual({ kind: 'same' });
  });

  it('a pawn move, a knight move, from a grid drawn by hand', () => {
    const afterE4 = occupancyFromText(`
      BBBBBBBB
      BBBBBBBB
      ........
      ........
      ....W...
      ........
      WWWW.WWW
      WWWWWWWW`);
    const g = new Chess();
    const r = moveFromBoard(g, afterE4);
    expect(r.kind === 'moves' && r.moves.map((m) => m.san)).toEqual(['e4']);
    expect(changedSquares(START_OCCUPANCY, afterE4)).toEqual(['e2', 'e4']);
  });

  it('follows a game through captures, castling and en passant', () => {
    const line = ['e4', 'd5', 'exd5', 'Qxd5', 'Nf3', 'e5', 'Be2', 'e4', 'O-O', 'exf3', 'Bxf3', 'Qe6', 'd4', 'Nf6', 'd5', 'c5', 'dxc6'];
    const grids = line.map((_, i) => seenAfter(line.slice(0, i + 1)));
    expect(playGrids(grids)).toEqual(line);
  });

  it('a capture is the square changing colour', () => {
    const g = new Chess();
    for (const s of ['e4', 'd5']) g.move(s);
    const r = moveFromBoard(g, seenAfter(['exd5'], g));
    expect(r.kind === 'moves' && r.moves[0].captured).toBe('p');
  });

  it('black castles queen side: two pieces move', () => {
    const g = new Chess('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    const r = moveFromBoard(g, seenAfter(['O-O-O'], g));
    expect(r.kind === 'moves' && r.moves[0].san).toBe('O-O-O');
  });

  it('promotion asks what the pawn becomes', () => {
    const g = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const r = moveFromBoard(g, seenAfter(['a8=Q'], g));
    expect(r.kind).toBe('promotion');
    expect(r.kind === 'promotion' && r.options.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('a take back is one move back', () => {
    const g = new Chess();
    g.move('e4'); g.move('e5');
    expect(moveFromBoard(g, seenAfter(['e4']))).toEqual({ kind: 'takeBack' });
    expect(playGrids([seenAfter(['e4']), START_OCCUPANCY], g)).toEqual([]);
  });

  it('both sides moving before the board settles is read as two moves', () => {
    const r = moveFromBoard(new Chess(), seenAfter(['e4', 'e5']));
    expect(r.kind === 'moves' && r.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('a board that fits no move keeps the last good position', () => {
    const g = new Chess();
    const wrong = [...START_OCCUPANCY];
    wrong[8] = 'empty'; // a2 lifted away
    wrong[40] = 'white'; // to a6: no pawn goes there
    const r = moveFromBoard(g, wrong);
    expect(r).toEqual({ kind: 'unknown', changed: ['a2', 'a6'] });
    // Then the pieces go back and the game carries on.
    expect(playGrids([wrong, START_OCCUPANCY, seenAfter(['d4'])], g)).toEqual(['d4']);
    expect(occupancyText(occupancyOfFen(g.fen()))).toBe(occupancyText(seenAfter(['d4'])));
  });

  it('a white piece where Black is to move is not a move', () => {
    const g = new Chess();
    g.move('e4');
    expect(moveFromBoard(g, seenAfter(['e4'])).kind).toBe('same');
    const r = moveFromBoard(g, occupancyOfFen(new Chess('rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1').fen()));
    expect(r.kind).toBe('unknown');
  });
});
