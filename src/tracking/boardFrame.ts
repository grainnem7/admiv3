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
import { ANYWHERE, NO_ZONE, splitByZone, zoneCellOf, zoneSlotCount, zoneSlotOf, type Zone } from './zones';
import { keyOf as ghostKey, posKey } from './handGuard/knockGuard';

export type BankSlotState = 'empty' | 'paused' | 'active';

export interface BoardFrameCfg {
  rows: number;
  cols: number;
  loopBankEnabled: boolean;
  variationEnabled: boolean;
  variationOffsetThreshold: number;
  numPages: number;
  /** The pattern must be unchanged this long before a slot captures it. 0/absent = at once. */
  captureQuietMs?: number;
  /** Colours with a sequenced job: only these are worth saving into a loop slot. */
  sequencedColours?: ReadonlySet<ColourId>;
  /** Control colours: a fader or toggle counter must never trigger a loop slot. */
  controlColours?: ReadonlySet<ColourId>;
  /** Where control counters and loop pads live (project B). */
  controlZone?: Zone;
  loopZone?: Zone;
  loopPadMode?: 'hold' | 'toggle';
  /** Two counters to a square both play, so a square can be live in one colour and haunted in another. */
  twoCounterMode?: 'off' | 'both';
}

export interface BoardFrameInput {
  readings: CellReading[];
  cfg: BoardFrameCfg;
  running: boolean;
  modeResult: BoardStepResult | null;
  loopBank: LoopBankState;
  /** Cells the hand guard is holding ("row,col"), left out of the counts and the capture. */
  held?: ReadonlySet<string>;
  /** Knocked cells that keep sounding until the player decides what to do with them. */
  ghosts?: ReadonlyMap<string, ActiveCell>;
  /** Milliseconds since the previous processed camera frame (drives the capture guard). */
  dtMs?: number;
}

export interface BoardFrameOutput {
  occupied: Map<string, PieceColour>;
  /** Cells held by the hand guard, for the board view and the legend. */
  held: ReadonlySet<string>;
  byColour: Partial<Record<ColourId, number>>;
  conditional: Set<string>;
  patternCells: ActiveCell[];
  activeLoops: ActiveCell[][];
  activeMap: Map<string, PieceColour>;
  loopBank: LoopBankState;
  captured: number[];
  fireTick: boolean;
  bankSlots: BankSlotState[] | null;
  /**
   * Which CELL each pad is in, keyed "row,col". The pads are a lane the player chooses,
   * so nothing that draws them should be guessing at the bottom row.
   */
  bankCells: ReadonlyMap<string, BankSlotState>;
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

export function stepBoardFrame({ readings, cfg, running, modeResult, loopBank, dtMs, held, ghosts }: BoardFrameInput): BoardFrameOutput {
  const occupied = new Map<string, PieceColour>();
  const byColour: Partial<Record<ColourId, number>> = {};
  for (const rd of readings) {
    const key = `${rd.row},${rd.col}`;
    if (rd.occupied && rd.colour && !held?.has(key)) {
      occupied.set(key, rd.colour);
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
  // Lanes: a cell in the control or loop lane is never part of the pattern, so a lane
  // can't make a stray note. With no lanes set, everything is pattern, as before.
  const controlZone = cfg.controlZone ?? ANYWHERE;
  const loopZone = cfg.loopZone ?? (cfg.loopBankEnabled ? { mode: 'row' as const, index: cfg.rows - 1 } : NO_ZONE);
  const slots = zoneSlotCount(loopZone, cfg.rows, cfg.cols);
  if (running && modeResult) {
    const split = splitByZone(modeResult.activeCells, controlZone, loopZone);
    patternCells = split.pattern;
    if (slots > 0) {
      // A volume counter parked on a pad is a control, not a loop trigger.
      const present = Array.from({ length: slots }, (_, i) => split.pads.some(
        (c) => zoneSlotOf(loopZone, c, cfg.rows) === i && !cfg.controlColours?.has(c.colour),
      ));
      // Only cells that actually play are worth saving.
      const capturable = cfg.sequencedColours
        ? patternCells.filter((c) => cfg.sequencedColours?.has(c.colour))
        : patternCells;
      const stepped = stepLoopBank(loopBank, present, capturable, slots, {
        quietMs: cfg.captureQuietMs ?? 0, dtMs: dtMs ?? 0, padMode: cfg.loopPadMode,
      });
      nextBank = stepped.state;
      captured = stepped.captured;
      activeLoops = stepped.active;
    }
    fireTick = modeResult.justSettled.length > 0;
  }
  if (running && ghosts && ghosts.size > 0) {
    // A counter back on the board wins over the ghost it replaces. The ghost map is keyed
    // by counter, so the comparison has to be by square unless two counters share one.
    const two = cfg.twoCounterMode === 'both';
    const idOf = two ? ghostKey : posKey;
    const live = new Set(patternCells.map(idOf));
    const withGhosts = [...patternCells];
    for (const cell of ghosts.values()) if (!live.has(idOf(cell))) withGhosts.push(cell);
    patternCells = withGhosts;
  }

  const activeMap = new Map<string, PieceColour>();
  for (const c of patternCells) activeMap.set(`${c.row},${c.col}`, c.colour);

  const bankSlots = slots > 0
    ? Array.from({ length: slots }, (_, i): BankSlotState => {
      const saved = nextBank.saved[i];
      if (saved == null) return 'empty';
      const sounding = cfg.loopPadMode === 'toggle' ? nextBank.playing?.[i] === true : nextBank.present[i];
      return sounding ? 'active' : 'paused';
    })
    : null;

  const bankCells = new Map<string, BankSlotState>();
  if (bankSlots) {
    bankSlots.forEach((state, slot) => {
      const cell = zoneCellOf(loopZone, slot, cfg.rows, cfg.cols);
      if (cell) bankCells.set(`${cell.row},${cell.col}`, state);
    });
  }

  return { occupied, held: held ?? new Set<string>(), byColour, conditional, bankCells, patternCells, activeLoops, activeMap, loopBank: nextBank, captured, fireTick, bankSlots };
}
