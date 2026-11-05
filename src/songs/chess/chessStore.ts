/**
 * The chess game being played as music: the moves, how far it has got, and whether it
 * is playing. Moving on a step sends that move's sounds on the chess bus.
 */
import { create } from 'zustand';
import { Chess, type Move } from 'chess.js';
import { soundsForMove } from './chessNotes';
import { sendChessSounds } from './ChessSoundEngine';
import { OPERA_GAME_PGN } from './games';

export interface ChessReplayState {
  moves: Move[];
  /** How many moves have been played. */
  played: number;
  playing: boolean;
  load: (pgn: string) => void;
  /** Play the next move; false once the game is over. */
  step: () => boolean;
  restart: () => void;
  setPlaying: (on: boolean) => void;
}

function movesOf(pgn: string): Move[] {
  const game = new Chess();
  game.loadPgn(pgn);
  return game.history({ verbose: true });
}

export const useChessStore = create<ChessReplayState>((set, get) => ({
  moves: movesOf(OPERA_GAME_PGN),
  played: 0,
  playing: false,
  load: (pgn) => set({ moves: movesOf(pgn), played: 0, playing: false }),
  step: () => {
    const { moves, played } = get();
    const move = moves[played];
    if (!move) { set({ playing: false }); return false; }
    set({ played: played + 1 });
    sendChessSounds(soundsForMove(move));
    if (played + 1 >= moves.length) set({ playing: false });
    return true;
  },
  restart: () => set({ played: 0, playing: false }),
  setPlaying: (on) => set({ playing: on }),
}));

/** The position after the moves played so far, as FEN. */
export function fenAfter(moves: readonly Move[], played: number): string {
  return played === 0 ? new Chess().fen() : moves[played - 1].after;
}
