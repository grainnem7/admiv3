import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export interface CellGridProps {
  rows: number;
  cols: number;
  /** What the grid is, for a screen reader ("Laptop board, 8 rows by 8 steps"). */
  label: string;
  /** What one square is called and whether something is on it. */
  cellLabel(row: number, col: number): string;
  pressed?(row: number, col: number): boolean;
  onActivate(row: number, col: number): void;
  cellStyle?(row: number, col: number): CSSProperties;
  style?: CSSProperties;
}

/**
 * A grid of squares to click or tap, laid out as a real grid (rows of cells, each holding
 * a button) and reached with ONE tab stop: the arrow keys move between squares, Home/End
 * go to the ends of a row, and Enter or Space places or lifts. A 10 × 10 board used to
 * be a hundred tab stops.
 */
export function CellGrid({ rows, cols, label, cellLabel, pressed, onActivate, cellStyle, style }: CellGridProps): JSX.Element {
  const [focus, setFocus] = useState({ row: rows - 1, col: 0 });
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const at = { row: Math.min(focus.row, rows - 1), col: Math.min(focus.col, cols - 1) };

  const move = (row: number, col: number): void => {
    const r = Math.max(0, Math.min(rows - 1, row));
    const c = Math.max(0, Math.min(cols - 1, col));
    setFocus({ row: r, col: c });
    refs.current.get(`${r},${c}`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, row: number, col: number): void => {
    const keys: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col], ArrowDown: [row + 1, col], ArrowLeft: [row, col - 1], ArrowRight: [row, col + 1],
      Home: [row, 0], End: [row, cols - 1],
    };
    const to = keys[e.key];
    if (!to) return;
    e.preventDefault();
    move(to[0], to[1]);
  };

  return (
    <div
      role="grid"
      aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, ...style }}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div role="row" key={row} style={{ display: 'contents' }}>
          {Array.from({ length: cols }, (__, col) => {
            const isPressed = pressed?.(row, col);
            return (
              <div role="gridcell" key={col} style={{ display: 'flex', minWidth: 0, minHeight: 0 }}>
                <button
                  ref={(el) => { if (el) refs.current.set(`${row},${col}`, el); else refs.current.delete(`${row},${col}`); }}
                  type="button"
                  tabIndex={row === at.row && col === at.col ? 0 : -1}
                  aria-label={cellLabel(row, col)}
                  aria-pressed={isPressed === undefined ? undefined : isPressed}
                  onFocus={() => setFocus({ row, col })}
                  onKeyDown={(e) => onKeyDown(e, row, col)}
                  onClick={() => onActivate(row, col)}
                  style={{ flex: 1, minWidth: 0, minHeight: 0, padding: 0, cursor: 'pointer', ...cellStyle?.(row, col) }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
