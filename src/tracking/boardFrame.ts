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
