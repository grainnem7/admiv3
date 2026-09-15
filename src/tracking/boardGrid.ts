/**
 * Grid ↔ physical board rules. The app grid (rows × cols) is stretched over the whole
 * board; sizes that divide the square count keep each cell on whole squares, and the
 * detection read settings are suggested from how much of a cell a counter covers.
 */
export const ASSUMED_PIECE_AREA_SQUARES = 0.45;
export type BoardSquares = 8 | 10;

export interface ReadSettings {
  samplesPerAxis: number;
  minFilledFraction: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function suggestReadSettings(
  boardSquares: number, rows: number, cols: number, pieceAreaSquares: number = ASSUMED_PIECE_AREA_SQUARES,
): ReadSettings {
  const sqX = boardSquares / Math.max(1, cols);
  const sqY = boardSquares / Math.max(1, rows);
  return {
    samplesPerAxis: clamp(Math.round(4.5 * Math.max(sqX, sqY)), 3, 15),
    minFilledFraction: clamp((0.4 * pieceAreaSquares) / (sqX * sqY), 0.04, 0.1),
  };
}

/** True when each grid cell covers a whole number of physical squares on both axes. */
export function gridDividesBoard(boardSquares: number, rows: number, cols: number): boolean {
  return rows > 0 && cols > 0 && boardSquares % rows === 0 && boardSquares % cols === 0;
}

/**
 * How far a point sits from the centre of its PHYSICAL square: 0 = dead centre,
 * 1 = on the square's edge. Variation is a question about the counter's placement on
 * the board, not about the app's grid, so on a 4 × 4 grid over an 8 × 8 board a
 * naturally-placed counter reads as centred instead of shoved.
 */
export function offsetFromSquare(point: { x: number; y: number }, boardSquares: number): number {
  const n = Math.max(1, boardSquares);
  const frac = (v: number): number => Math.abs((v * n) - Math.floor(v * n) - 0.5) * 2;
  return Math.min(1, Math.max(frac(point.x), frac(point.y)));
}

export interface GridSizeOptions {
  divisors: number[];
  moreRows: number[];
  moreCols: number[];
  rowsIsMore: boolean;
  colsIsMore: boolean;
  nearest: { rows: number; cols: number };
}

const MORE_COLS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 16];

export function gridSizeOptions(boardSquares: number, current: { rows: number; cols: number }): GridSizeOptions {
  const divisors: number[] = [];
  for (let d = 2; d <= boardSquares; d++) if (boardSquares % d === 0) divisors.push(d);
  const moreRows: number[] = [];
  for (let r = 2; r <= Math.max(8, boardSquares); r++) moreRows.push(r);
  const nearestDivisor = (v: number): number => {
    let best = divisors[0];
    for (const d of divisors) if (d <= v) best = d;
    return best;
  };
  return {
    divisors,
    moreRows,
    moreCols: MORE_COLS,
    rowsIsMore: !divisors.includes(current.rows),
    colsIsMore: !divisors.includes(current.cols),
    nearest: { rows: nearestDivisor(current.rows), cols: nearestDivisor(current.cols) },
  };
}

export interface GridFields {
  rows: number;
  cols: number;
  boardSquares: BoardSquares;
  readSettingsCustom: boolean;
  minFilledFraction: number;
  samplesPerAxis: number;
}

/** Apply a rows/cols/board-size change, re-suggesting read settings unless the user tuned them. */
export function applyGridChange<T extends GridFields>(
  cfg: T, patch: Partial<Pick<GridFields, 'rows' | 'cols' | 'boardSquares'>>,
): T {
  const next = { ...cfg, ...patch };
  if (next.readSettingsCustom) return next;
  return { ...next, ...suggestReadSettings(next.boardSquares, next.rows, next.cols) };
}
