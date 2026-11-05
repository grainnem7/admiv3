/**
 * The game on the real board: what has been played, what the screen should say, and any
 * question it is asking. Each settled reading of the board comes here; a move found in it
 * is played on the chess bus, so it is heard and drawn.
 */
import { create } from 'zustand';
import { Chess, type Move } from 'chess.js';
import type { Occupancy } from '../../tracking/chess/chessOccupancy';
import { moveFromBoard, NOT_A_MOVE } from './moveFromBoard';
import { soundsForMove } from './chessNotes';
import { sendChessSounds } from './ChessSoundEngine';

/** A second quick move is heard a little after the first. */
const SECOND_MOVE_SEC = 0.4;

export interface LiveQuestion {
  kind: 'promotion' | 'choose';
  options: Move[];
}

export interface LiveChessState {
  history: Move[];
  fen: string;
  message: string | null;
  question: LiveQuestion | null;
  newGame: () => void;
  /** A settled reading of the board. */
  seen: (occ: Occupancy) => void;
  /** The players' answer to a question. */
  answer: (move: Move) => void;
}

const game = new Chess();

function endWords(): string | null {
  if (game.isCheckmate()) return 'Checkmate.';
  if (game.isStalemate()) return 'Stalemate: a draw.';
  if (game.isDraw()) return 'A draw.';
  return null;
}

export const useLiveChessStore = create<LiveChessState>((set, get) => {
  const play = (moves: Move[]): void => {
    moves.forEach((m, i) => {
      const done = game.move(m.san);
      sendChessSounds(soundsForMove(done).map((s) => ({ ...s, delaySec: s.delaySec + i * SECOND_MOVE_SEC })));
    });
    set({ history: game.history({ verbose: true }), fen: game.fen(), question: null, message: endWords() });
  };
  return {
    history: [],
    fen: game.fen(),
    message: null,
    question: null,
    newGame: () => { game.reset(); set({ history: [], fen: game.fen(), message: null, question: null }); },
    seen: (occ) => {
      if (get().question) return; // waiting for an answer on screen
      const r = moveFromBoard(game, occ);
      switch (r.kind) {
        case 'same': if (get().message === NOT_A_MOVE) set({ message: null }); return;
        case 'moves': play(r.moves); return;
        case 'promotion': set({ question: { kind: 'promotion', options: r.options }, message: null }); return;
        case 'choose': set({ question: { kind: 'choose', options: r.options }, message: null }); return;
        case 'takeBack': {
          const undone = game.undo();
          set({ history: game.history({ verbose: true }), fen: game.fen(), message: undone ? `Took back ${undone.san}.` : null });
          return;
        }
        case 'unknown': set({ message: NOT_A_MOVE }); return;
      }
    },
    answer: (move) => play([move]),
  };
});
