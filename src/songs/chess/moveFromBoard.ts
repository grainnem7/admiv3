/**
 * From what the camera sees to a chess move. Pure.
 *
 * The camera only knows, for each square, empty, white or black. When the settled reading
 * changes, the squares that changed are listed, every legal move from the current position
 * is tried, and the moves whose result looks exactly like the board now are kept. That
 * covers captures (a square changes colour), castling (king and rook), en passant (three
 * squares) and promotion (which looks the same whatever the pawn becomes, so it is asked).
 * A board that looks like the position before the last move is a take back. If the players
 * moved twice before the board settled, both moves are found. Anything else is not a move.
 */
import { Chess, type Move } from 'chess.js';
import { squareName, type Occupancy, type SquareState } from '../../tracking/chess/chessOccupancy';

export type BoardRead =
  | { kind: 'same' }
  /** One move, or two when both sides moved before the board settled. */
  | { kind: 'moves'; moves: Move[] }
  /** A pawn reached the last rank: ask what it becomes. */
  | { kind: 'promotion'; options: Move[] }
  /** More than one move fits: ask which. */
  | { kind: 'choose'; options: Move[] }
  | { kind: 'takeBack' }
  | { kind: 'unknown'; changed: string[] };

/** What the camera would see for a position. */
export function occupancyOfFen(fen: string): SquareState[] {
  const out: SquareState[] = new Array<SquareState>(64).fill('empty');
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { file += Number(ch); continue; }
      out[(7 - i) * 8 + file] = ch === ch.toUpperCase() ? 'white' : 'black';
      file++;
    }
  });
  return out;
}

const sameOcc = (a: Occupancy, b: Occupancy): boolean => a.every((s, i) => s === b[i]);

/** The squares whose reading differs, by name. */
export function changedSquares(a: Occupancy, b: Occupancy): string[] {
  const out: string[] = [];
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) out.push(squareName(i));
  return out;
}

/** The legal moves from `fen` whose result looks like `seen`. */
function fitting(fen: string, seen: Occupancy, changed: ReadonlySet<string>): Move[] {
  const g = new Chess(fen);
  // A moving piece always leaves its square, so only moves from a changed square are tried.
  return g.moves({ verbose: true }).filter((m) => changed.has(m.from) && sameOcc(occupancyOfFen(m.after), seen));
}

/** Read the board against the game so far. */
export function moveFromBoard(game: Chess, seen: Occupancy): BoardRead {
  const fen = game.fen();
  const now = occupancyOfFen(fen);
  const changed = changedSquares(now, seen);
  if (changed.length === 0) return { kind: 'same' };
  const changedSet = new Set(changed);

  const one = fitting(fen, seen, changedSet);
  if (one.length === 1) return { kind: 'moves', moves: one };
  if (one.length > 1) {
    const promo = one.every((m) => m.promotion && m.from === one[0].from && m.to === one[0].to);
    return promo ? { kind: 'promotion', options: one } : { kind: 'choose', options: one };
  }

  const last = game.history({ verbose: true }).at(-1);
  if (last && sameOcc(occupancyOfFen(last.before), seen)) return { kind: 'takeBack' };

  // Both sides moved before the board settled: try each move and every reply.
  const twos: Move[][] = [];
  const g = new Chess(fen);
  for (const first of g.moves({ verbose: true })) {
    if (!changedSet.has(first.from)) continue;
    const afterFirst = occupancyOfFen(first.after);
    const replies = fitting(first.after, seen, new Set(changedSquares(afterFirst, seen)));
    for (const second of replies) twos.push([first, second]);
  }
  // Only a clear answer; a promotion inside two quick moves is too much to guess.
  if (twos.length === 1 && !twos[0].some((m) => m.promotion)) return { kind: 'moves', moves: twos[0] };
  return { kind: 'unknown', changed };
}

/** The words for a board that fits no move. */
export const NOT_A_MOVE = 'Not a move I understand: set the pieces back';
