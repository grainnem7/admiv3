/**
 * The tension of the game as music. Pure.
 *
 * The evaluation (in centipawns, White's view: + White is better) drives Energy: an even,
 * quiet game is calm; a big advantage, and above all a sudden swing, is lively. The World
 * changes with the phase of the game: warm in the opening, electronic in the middlegame,
 * ambient in the endgame. At checkmate, or when the game's last move is played, the
 * chord ending runs: every piece left on the board sounds once, together.
 */
import { Chess } from 'chess.js';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import { squareToMidi, voiceOf, type ChessSound, type PieceType, type Side } from './chessNotes';

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** A mate is worth this many centipawns, so it reads as the biggest advantage there is. */
export const MATE_CP = 10000;

/** Material count in centipawns, White's view, with a little for giving check. The fallback. */
export function materialEval(fen: string): number {
  const g = new Chess(fen);
  let cp = 0;
  for (const row of g.board()) for (const c of row) if (c) cp += (c.color === 'w' ? 1 : -1) * VALUE[c.type] * 100;
  if (g.isCheckmate()) return g.turn() === 'w' ? -MATE_CP : MATE_CP;
  if (g.inCheck()) cp += g.turn() === 'w' ? -50 : 50; // the side giving check has the initiative
  return cp;
}

/** The game's phase, from how many moves have been played and how much is left. */
export function gamePhase(fen: string, movesPlayed: number): GamePhase {
  const g = new Chess(fen);
  let pieces = 0; // non-pawn material, both sides
  let queens = 0;
  for (const row of g.board()) for (const c of row) {
    if (!c || c.type === 'p' || c.type === 'k') continue;
    pieces += VALUE[c.type];
    if (c.type === 'q') queens++;
  }
  if (pieces <= 26 || (queens === 0 && pieces <= 30)) return 'endgame';
  if (movesPlayed < 20 && pieces >= 56) return 'opening';
  return 'middlegame';
}

export const WORLD_FOR_PHASE: Record<GamePhase, SoundWorldId> = { opening: 'warm', middlegame: 'electronic', endgame: 'ambient' };

/**
 * Energy 0 (calm) to 1 (lively) from the evaluation now and before the last move. An even
 * game sits low; an advantage raises it; a swing (a blunder, a sacrifice) raises it most.
 */
export function energyFromEval(cp: number, previousCp: number | null): number {
  const clampCp = (v: number): number => Math.max(-1500, Math.min(1500, v));
  const lead = Math.tanh(Math.abs(clampCp(cp)) / 400);
  const swing = previousCp === null ? 0 : Math.tanh(Math.abs(clampCp(cp) - clampCp(previousCp)) / 200);
  return Math.max(0, Math.min(1, 0.2 + 0.4 * lead + 0.4 * swing));
}

/** A move's sounds shaped by Energy: louder and, when lively, with a kick under the move. */
export function shapeSounds(sounds: readonly ChessSound[], energy: number): ChessSound[] {
  const gain = 0.7 + 0.4 * energy;
  const out = sounds.map((s) => ({ ...s, velocity: Math.min(1, s.velocity * gain) }));
  const first = sounds.find((s) => !s.drum);
  if (energy >= 0.7 && first) out.push({ voice: 'drums', midi: 0, velocity: 0.5 + 0.4 * energy, delaySec: 0, drum: 'kick', square: first.square });
  return out;
}

const ENDING_STEP_SEC = 0.06;

/**
 * The chord ending: every piece left on the board sounds its own note on its square, rolled
 * quickly from the lowest up; at checkmate the winner's pieces louder, and a cymbal.
 */
export function endingSounds(fen: string): ChessSound[] {
  const g = new Chess(fen);
  const winner: Side | null = g.isCheckmate() ? (g.turn() === 'w' ? 'b' : 'w') : null;
  const notes: ChessSound[] = [];
  g.board().forEach((row, r) => row.forEach((c, f) => {
    if (!c) return;
    const square = `${'abcdefgh'[f]}${8 - r}`;
    notes.push({
      voice: voiceOf(c.color, c.type), midi: squareToMidi(square) + (c.color === 'b' ? -12 : 0),
      velocity: winner === null ? 0.6 : c.color === winner ? 0.9 : 0.4, delaySec: 0, square,
    });
  }));
  notes.sort((a, b) => a.midi - b.midi);
  notes.forEach((n, i) => { n.delaySec = 0.3 + i * ENDING_STEP_SEC; });
  if (winner) notes.push({ voice: 'drums', midi: 0, velocity: 1, delaySec: 0.3, drum: 'crash', square: g.findPiece({ type: 'k', color: winner })[0] ?? 'e1' });
  return notes;
}
