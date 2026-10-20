/**
 * The laptop board: counters placed by clicking squares on screen instead of being seen
 * by the camera. It produces the same per-square readings the camera reader does, so
 * everything after that point — settling, phrases, controls, lanes, loops, scenes, the
 * iPad — behaves exactly as it does with the real board. For testing and planning
 * without setting up the rig.
 *
 * Pure.
 */

import type { CellReading } from './BoardSequencerMode';
import type { StoredLoopCell } from '../profiles/BoardSequencerConfig';

/** A counter sits dead centre of its square, in unit board coordinates. */
function centreOf(row: number, col: number, rows: number, cols: number): { x: number; y: number } {
  return { x: (col + 0.5) / cols, y: (row + 0.5) / rows };
}

/** One reading per square, as the camera reader would give for these counters. */
export function laptopReadings(cells: readonly StoredLoopCell[], rows: number, cols: number): CellReading[] {
  const at = new Map<string, string>();
  for (const c of cells) {
    if (c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols) at.set(`${c.row},${c.col}`, c.colour);
  }
  const out: CellReading[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const colour = at.get(`${row},${col}`) ?? null;
      if (!colour) {
        out.push({ row, col, occupied: false, colour: null, centroid: null, offset: null });
        continue;
      }
      const centroid = centreOf(row, col, rows, cols);
      out.push({
        row, col, occupied: true, colour, centroid,
        centroids: { [colour]: centroid }, colours: [colour], offsets: { [colour]: 0 }, offset: 0,
      });
    }
  }
  return out;
}

/**
 * Click a square with a colour chosen. The same colour there lifts it; anything else is
 * replaced. A colour that stands for ONE thing (a control fader, a loop trigger) is moved
 * rather than copied: there is one such counter, as on the real board.
 */
export function placeLaptopCounter(
  cells: readonly StoredLoopCell[], row: number, col: number, colour: string, single: boolean,
): StoredLoopCell[] {
  const here = cells.find((c) => c.row === row && c.col === col);
  const rest = cells.filter((c) => !(c.row === row && c.col === col) && !(single && c.colour === colour));
  if (here && here.colour === colour) return cells.filter((c) => !(c.row === row && c.col === col));
  return [...rest, { row, col, colour }];
}
