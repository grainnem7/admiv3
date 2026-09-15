/**
 * "Board moved?" and "<colour> is matching the board" hints, as a pure state machine.
 * Both only inform; nothing changes on its own. Thresholds are named for tuning.
 */
import type { CellReading } from '../../../tracking/BoardSequencerMode';
import type { ColourId } from '../../../tracking/boardColours';

export const NUDGE_HOLD_MS = 2000;
export const NUDGE_CLEAR_MS = 1000;
export const BOARD_MOVED_MIN_PIECES = 4;
export const BOARD_MOVED_SHIFT_SQUARES = 0.3;
export const BOARD_MOVED_SAME_DIRECTION = 0.7;
export const COLOUR_MATCH_CELL_SHARE = 0.6;
export const COLOUR_MATCH_MIN_CELLS = 8;
export const COLOUR_MATCH_MIN_FILL = 0.5;
export const COLOUR_MATCH_MIN_GRID = 16;

export type NudgeKind = 'board-moved' | 'colour-matches-board';
export type NudgeSignal = { kind: 'board-moved' } | { kind: 'colour-matches-board'; channelId: ColourId };

export interface KindState { active: boolean; since: number | null; clearSince: number | null; dismissed: boolean }
export interface NudgeState { boardMoved: KindState; colourMatches: KindState & { channelId: ColourId | null } }

export interface NudgeContext {
  boardSquares: number;
  rows: number;
  cols: number;
  variationEnabled: boolean;
  variationOffsetThreshold: number;
  enabled: boolean;
  ignoreColours?: ReadonlySet<ColourId>;
}

const idle = (): KindState => ({ active: false, since: null, clearSince: null, dismissed: false });

export function initialNudgeState(): NudgeState {
  return { boardMoved: idle(), colourMatches: { ...idle(), channelId: null } };
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A shared shift of the pieces away from their physical square centres. */
export function boardMovedRaw(readings: CellReading[], ctx: NudgeContext): boolean {
  const n = ctx.boardSquares;
  if (n % ctx.rows !== 0 || n % ctx.cols !== 0) return false;
  const dxs: number[] = [];
  const dys: number[] = [];
  for (const r of readings) {
    if (!r.occupied || !r.colour || !r.centroid) continue;
    if (ctx.ignoreColours?.has(r.colour)) continue;
    if (ctx.variationEnabled && (r.offset ?? 0) >= ctx.variationOffsetThreshold) continue;
    const fx = r.centroid.x * n;
    const fy = r.centroid.y * n;
    dxs.push(fx - Math.floor(fx) - 0.5);
    dys.push(fy - Math.floor(fy) - 0.5);
  }
  if (dxs.length < BOARD_MOVED_MIN_PIECES) return false;
  const axisFires = (d: number[]): boolean => {
    const m = median(d);
    if (Math.abs(m) < BOARD_MOVED_SHIFT_SQUARES) return false;
    const same = d.filter((v) => Math.sign(v) === Math.sign(m) && v !== 0).length;
    return same / d.length >= BOARD_MOVED_SAME_DIRECTION;
  };
  return axisFires(dxs) || axisFires(dys);
}

/** The channel lighting most of the board with big (non-counter-sized) coverage, or null. */
export function colourMatchesBoardRaw(readings: CellReading[], ctx: NudgeContext): ColourId | null {
  const cells = ctx.rows * ctx.cols;
  if (cells < COLOUR_MATCH_MIN_GRID) return null;
  const byColour = new Map<ColourId, number[]>();
  for (const r of readings) {
    if (!r.occupied || !r.colour) continue;
    const list = byColour.get(r.colour) ?? [];
    list.push(r.fractions?.[r.colour] ?? 0);
    byColour.set(r.colour, list);
  }
  let best: ColourId | null = null;
  let bestCount = 0;
  for (const [id, fills] of byColour) {
    if (fills.length <= COLOUR_MATCH_CELL_SHARE * cells || fills.length < COLOUR_MATCH_MIN_CELLS) continue;
    if (median(fills) < COLOUR_MATCH_MIN_FILL) continue;
    if (fills.length > bestCount) { best = id; bestCount = fills.length; }
  }
  return best;
}

function advance(k: KindState, raw: boolean, now: number): KindState {
  if (raw) {
    const since = k.since ?? now;
    return { ...k, since, clearSince: null, active: k.active || now - since >= NUDGE_HOLD_MS };
  }
  if (!k.active) return { ...k, since: null, clearSince: null, dismissed: false };
  const clearSince = k.clearSince ?? now;
  if (now - clearSince >= NUDGE_CLEAR_MS) return idle();
  return { ...k, since: null, clearSince };
}

export function stepNudge(prev: NudgeState, readings: CellReading[], ctx: NudgeContext, now: number): { state: NudgeState; signal: NudgeSignal | null } {
  if (!ctx.enabled) return { state: initialNudgeState(), signal: null };
  const boardMoved = advance(prev.boardMoved, boardMovedRaw(readings, ctx), now);
  const channel = colourMatchesBoardRaw(readings, ctx);
  const restarted = channel !== null && prev.colourMatches.channelId !== null && channel !== prev.colourMatches.channelId;
  const baseColour: KindState = restarted ? idle() : prev.colourMatches;
  const colourKind = advance(baseColour, channel !== null, now);
  const colourMatches = { ...colourKind, channelId: channel ?? (colourKind.active ? prev.colourMatches.channelId : null) };
  const state: NudgeState = { boardMoved, colourMatches };
  let signal: NudgeSignal | null = null;
  if (colourMatches.active && !colourMatches.dismissed && colourMatches.channelId) {
    signal = { kind: 'colour-matches-board', channelId: colourMatches.channelId };
  } else if (boardMoved.active && !boardMoved.dismissed) {
    signal = { kind: 'board-moved' };
  }
  return { state, signal };
}

export function dismissNudge(state: NudgeState, kind: NudgeKind): NudgeState {
  return kind === 'board-moved'
    ? { ...state, boardMoved: { ...state.boardMoved, dismissed: true } }
    : { ...state, colourMatches: { ...state.colourMatches, dismissed: true } };
}
