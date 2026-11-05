/**
 * The game's tension, kept up to date after every move: the evaluation (Stockfish, or
 * material and checks when Stockfish is not there), the Energy it gives, the phase and its
 * World. A World change goes out on the chess bus for the sound engine.
 */
import { create } from 'zustand';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import { energyFromEval, gamePhase, materialEval, WORLD_FOR_PHASE, type GamePhase } from './chessMusic';
import { StockfishEvaluator } from './stockfishEval';
import { chessEvents } from './ChessSoundEngine';

export interface TensionState {
  /** The evaluation after each move (index 0 = the start), White's view, centipawns. */
  evals: number[];
  energy: number;
  phase: GamePhase;
  world: SoundWorldId;
  /** What the evaluation came from. */
  source: 'stockfish' | 'material' | null;
}

const START: TensionState = { evals: [0], energy: energyFromEval(0, null), phase: 'opening', world: WORLD_FOR_PHASE.opening, source: null };

export const useChessTension = create<TensionState>(() => ({ ...START }));

let evaluator: StockfishEvaluator | null = null;
/** Each position asked about gets a number; a late answer for an old one is dropped. */
let asked = 0;

/** Tell the engine which World to play in. */
export function sendWorld(world: SoundWorldId): void {
  chessEvents.emit({ type: 'effectChange', effectId: 'chess', parameter: `world:${world}`, value: 1, timestamp: Date.now() });
}

/** Back to the start of a game. */
export function resetTension(): void {
  asked++;
  useChessTension.setState({ ...START });
  sendWorld(START.world);
}

/**
 * A new position after `plies` half moves. The phase and World change at once; the
 * evaluation follows when Stockfish answers (shallow, well under a second).
 */
export async function onPosition(fen: string, plies: number, useStockfish = true): Promise<void> {
  const id = ++asked;
  const phase = gamePhase(fen, plies);
  const world = WORLD_FOR_PHASE[phase];
  if (world !== useChessTension.getState().world) sendWorld(world);
  useChessTension.setState({ phase, world });

  let cp: number | null = null;
  const over = materialEval(fen);
  // A finished game has no move to search; the material count already says mate.
  if (useStockfish && Math.abs(over) < 10000) {
    evaluator ??= new StockfishEvaluator();
    cp = await evaluator.evaluate(fen);
  }
  if (id !== asked) return;
  const source = cp === null ? 'material' : 'stockfish';
  const value = cp ?? over;
  const evals = useChessTension.getState().evals.slice(0, plies);
  while (evals.length < plies) evals.push(evals.at(-1) ?? 0);
  evals.push(value);
  useChessTension.setState({ evals, energy: energyFromEval(value, evals.at(-2) ?? null), source });
}
