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
  /** Which voice plays it (step 1: one voice, 'move'). */
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

/** The parts of a chess.js move the music reads. */
export interface MoveLike {
  from: string;
  to: string;
  captured?: string;
}

/** Step 1: one note on the square moved to, and a drum hit when it takes a piece. */
export function soundsForMove(move: MoveLike): ChessSound[] {
  const out: ChessSound[] = [{ voice: 'move', midi: squareToMidi(move.to), velocity: 0.8, delaySec: 0, square: move.to }];
  if (move.captured) out.push({ voice: 'drums', midi: 0, velocity: 0.9, delaySec: 0, drum: 'snare', square: move.to });
  return out;
}
