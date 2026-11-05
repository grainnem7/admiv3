/**
 * Chess as music: what each move sounds like. Pure: a move in, the sounds out, so the
 * same rules serve the built in game and the camera board.
 *
 * The file (a to h) is the note in the scale, the rank (1 to 8) the octave.
 */

/** C major, eight steps so each file has its own note: C D E F G A B C. */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12] as const;
const FILES = 'abcdefgh';

/** One sound a move makes. `drum` set means a drum hit, not a note. */
export interface ChessSound {
  /** Which voice plays it: 'wp' (white pawns) to 'bk', or 'drums'. */
  voice: string;
  midi: number;
  velocity: number;
  /** Seconds after the move. */
  delaySec: number;
  drum?: 'snare' | 'kick' | 'crash';
  /** The square the sound belongs to, for drawing it on the board. */
  square: string;
}

/** The note for a square, as MIDI: file picks the step, rank the octave (rank 1 lowest). */
export function squareToMidi(square: string): number {
  const file = FILES.indexOf(square[0] ?? '');
  const rank = Number(square[1]);
  if (file < 0 || !(rank >= 1 && rank <= 8)) throw new Error(`Not a square: ${square}`);
  // Ranks 1 and 2 are octave 3 (C3 = 48), up to ranks 7 and 8 in octave 6.
  const octave = 3 + Math.floor((rank - 1) / 2);
  return 12 * (octave + 1) + SCALE[file];
}

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Side = 'w' | 'b';

/** The parts of a chess.js move the music reads. */
export interface MoveLike {
  from: string;
  to: string;
  color: Side;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  /** chess.js flags: 'k' castles king side, 'q' queen side, 'e' en passant. */
  flags: string;
  /** '+' or '#' at the end means check or mate. */
  san: string;
}

/** The voice for a piece: its colour and type, as 'wp', 'bq' and so on. */
export const voiceOf = (side: Side, piece: PieceType): string => `${side}${piece}`;

/** Where each voice sits against the square's note: rooks low, black an octave down. */
const PIECE_SHIFT: Record<PieceType, number> = { p: 0, n: 0, b: 12, r: -12, q: 0, k: -12 };
const SIDE_SHIFT: Record<Side, number> = { w: 0, b: -12 };
const NORMAL = 0.75;
const ACCENT = 1;
/** The rook follows the king when castling. */
const CASTLE_GAP_SEC = 0.18;

function note(side: Side, piece: PieceType, square: string, velocity: number, delaySec = 0): ChessSound {
  return {
    voice: voiceOf(side, piece),
    midi: squareToMidi(square) + PIECE_SHIFT[piece] + SIDE_SHIFT[side],
    velocity,
    delaySec,
    square,
  };
}

/** Where the rook goes when castling, for the side and the way it castles. */
function castleRook(side: Side, kingSide: boolean): string {
  const rank = side === 'w' ? '1' : '8';
  return (kingSide ? 'f' : 'd') + rank;
}

/**
 * The sounds of a move: the moving piece's voice on the square it lands on (a promoted
 * pawn already sings as its new piece); a capture adds a drum; check is an accent (louder,
 * with a cymbal); castling plays the king, then the rook. A captured piece's voice is not
 * played: it is off the board, silent for the rest of the game.
 */
export function soundsForMove(move: MoveLike): ChessSound[] {
  const check = move.san.endsWith('+') || move.san.endsWith('#');
  const vel = check ? ACCENT : NORMAL;
  const piece = move.promotion ?? move.piece;
  const out: ChessSound[] = [note(move.color, piece, move.to, vel)];
  const kingSide = move.flags.includes('k');
  if (kingSide || move.flags.includes('q')) out.push(note(move.color, 'r', castleRook(move.color, kingSide), vel, CASTLE_GAP_SEC));
  if (move.captured) out.push({ voice: 'drums', midi: 0, velocity: 0.9, delaySec: 0, drum: 'snare', square: move.to });
  if (check) out.push({ voice: 'drums', midi: 0, velocity: move.san.endsWith('#') ? 1 : 0.6, delaySec: 0, drum: 'crash', square: move.to });
  return out;
}
