/**
 * One detection frame of the board sequencer, as a pure function: per-colour counts,
 * the overlay's conditional set, and (while running) the live pattern vs loop-bank
 * slots. Extracted from the screen's rAF loop; the caller does the I/O (engine
 * calls, persistence, drawing).
 */
import type { ColourId } from './boardColours';
import type { ActiveCell, BoardStepResult, CellReading, PieceColour } from './BoardSequencerMode';
import { stepLoopBank, type LoopBankState } from '../songs/loopBank';
import { conditionalFromOffset } from '../songs/boardSequencerScale';

export type BankSlotState = 'empty' | 'paused' | 'active';

export interface BoardFrameCfg {
  rows: number;
  cols: number;
  loopBankEnabled: boolean;
  variationEnabled: boolean;
  variationOffsetThreshold: number;
  numPages: number;
}

export interface BoardFrameInput {
  readings: CellReading[];
  cfg: BoardFrameCfg;
  running: boolean;
  modeResult: BoardStepResult | null;
  loopBank: LoopBankState;
}

export interface BoardFrameOutput {
  occupied: Map<string, PieceColour>;
  byColour: Partial<Record<ColourId, number>>;
  conditional: Set<string>;
  patternCells: ActiveCell[];
  activeLoops: ActiveCell[][];
  activeMap: Map<string, PieceColour>;
  loopBank: LoopBankState;
  captured: number[];
  fireTick: boolean;
  bankSlots: BankSlotState[] | null;
}

/**
 * Coverage (relative to a single counter's expected coverage) above which an adjacent
 * pair is two real counters rather than one counter spilling across the line.
 */
export const SPILL_TWO_COUNTERS = 1.7;
/** minFilledFraction is 0.4 × the coverage of a counter sitting wholly in the cell. */
const MIN_FILL_TO_COVERAGE = 1 / 0.4;

export interface SpillCtx {
  rows: number;
  cols: number;
  boardSquares: number;
  minFilledFraction: number;
}

/**
 * One counter, one box. A counter sitting on a grid line is seen by both cells, so it
 * plays twice on a fine grid (or lands in the wrong cell on a coarse one). For each
 * orthogonally adjacent pair reading the same colour, fuse the two centroids weighted by
 * coverage: whichever cell the fused point lands in keeps the counter and the other's
 * reading of that colour is cleared. A pair whose combined coverage is at least
 * SPILL_TWO_COUNTERS × one counter's worth is two real counters and is left alone.
 */
export function suppressSpill(readings: CellReading[], ctx: SpillCtx): CellReading[] {
  const expected = Math.max(1e-6, ctx.minFilledFraction * MIN_FILL_TO_COVERAGE);
  const byKey = new Map<string, CellReading>();
  for (const r of readings) byKey.set(`${r.row},${r.col}`, r);
  const coverage = (r: CellReading): number => (r.colour ? r.fractions?.[r.colour] ?? 0 : 0);

  interface Pair { a: CellReading; b: CellReading; total: number }
  const pairs: Pair[] = [];
  for (const a of readings) {
    if (!a.occupied || !a.colour) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      const b = byKey.get(`${a.row + dr},${a.col + dc}`);
      if (!b || !b.occupied || b.colour !== a.colour) continue;
      const total = coverage(a) + coverage(b);
      if (total >= SPILL_TWO_COUNTERS * expected) continue; // two real counters
      pairs.push({ a, b, total });
    }
  }
  if (pairs.length === 0) return readings;

  // Settle the most confident pairs first, so a chain of three cells resolves to one.
  pairs.sort((p, q) => q.total - p.total);
  const cleared = new Set<string>();
  for (const { a, b, total } of pairs) {
    const ka = `${a.row},${a.col}`;
    const kb = `${b.row},${b.col}`;
    if (cleared.has(ka) || cleared.has(kb) || total <= 0) continue;
    const colour = a.colour!;
    const ca = a.centroids?.[colour] ?? a.centroid;
    const cb = b.centroids?.[colour] ?? b.centroid;
    if (!ca || !cb) continue;
    const wa = coverage(a);
    const wb = coverage(b);
    const fx = (ca.x * wa + cb.x * wb) / total;
    const fy = (ca.y * wa + cb.y * wb) / total;
    const inA = Math.floor(fx * ctx.cols) === a.col && Math.floor(fy * ctx.rows) === a.row;
    const inB = Math.floor(fx * ctx.cols) === b.col && Math.floor(fy * ctx.rows) === b.row;
    if (inA === inB) continue; // the fused point sits in neither (or both): leave them
    cleared.add(inA ? kb : ka);
  }
  if (cleared.size === 0) return readings;
  return readings.map((r) => (cleared.has(`${r.row},${r.col}`)
    ? { ...r, occupied: false, colour: null, centroid: null, offset: null }
    : r));
}

export function stepBoardFrame({ readings, cfg, running, modeResult, loopBank }: BoardFrameInput): BoardFrameOutput {
  const occupied = new Map<string, PieceColour>();
  const byColour: Partial<Record<ColourId, number>> = {};
  for (const rd of readings) {
    if (rd.occupied && rd.colour) {
      occupied.set(`${rd.row},${rd.col}`, rd.colour);
      byColour[rd.colour] = (byColour[rd.colour] ?? 0) + 1;
    }
  }
  const conditional = new Set<string>();
  if (cfg.variationEnabled && cfg.numPages <= 1) {
    for (const rd of readings) {
      if (rd.occupied && conditionalFromOffset(rd.offset ?? null, cfg.variationEnabled, cfg.variationOffsetThreshold)) {
        conditional.add(`${rd.row},${rd.col}`);
      }
    }
  }

  let patternCells: ActiveCell[] = [];
  let activeLoops: ActiveCell[][] = [];
  let nextBank = loopBank;
  let captured: number[] = [];
  let fireTick = false;
  if (running && modeResult) {
    if (cfg.loopBankEnabled) {
      const bankRow = cfg.rows - 1;
      patternCells = modeResult.activeCells.filter((c) => c.row < bankRow);
      const present = Array.from({ length: cfg.cols }, (_, i) =>
        modeResult.activeCells.some((c) => c.row === bankRow && c.col === i));
      const stepped = stepLoopBank(loopBank, present, patternCells, cfg.cols);
      nextBank = stepped.state;
      captured = stepped.captured;
      activeLoops = stepped.active;
    } else {
      patternCells = modeResult.activeCells;
    }
    fireTick = modeResult.justSettled.length > 0;
  }
  const activeMap = new Map<string, PieceColour>();
  for (const c of patternCells) activeMap.set(`${c.row},${c.col}`, c.colour);

  const bankSlots = cfg.loopBankEnabled
    ? Array.from({ length: cfg.cols }, (_, i): BankSlotState => {
      const saved = nextBank.saved[i];
      if (saved == null) return 'empty';
      return nextBank.present[i] ? 'active' : 'paused';
    })
    : null;

  return { occupied, byColour, conditional, patternCells, activeLoops, activeMap, loopBank: nextBank, captured, fireTick, bankSlots };
}
