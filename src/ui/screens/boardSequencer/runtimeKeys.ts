/**
 * What the screen shows from a runtime frame, as strings: equal strings mean nothing on
 * screen would change. The frame is handed over ten times a second, always as new
 * objects, and setting them as state re-rendered the whole screen every time even with
 * nothing moving on the board.
 */
import type { ActiveCell } from '../../../tracking/BoardSequencerMode';
import type { ControlsResult } from '../../../tracking/controlCounters';
import type { RuntimeFrame } from './useBoardRuntime';

const cellsKey = (cells: readonly ActiveCell[]): string => cells.map((c) => `${c.row},${c.col}:${c.colour}`).join(';');

export function frameKey(rf: RuntimeFrame): string {
  const f = rf.frame;
  return [
    [...f.occupied].map(([k, c]) => `${k}:${c}`).join(';'),
    [...rf.held].join(';'),
    [...rf.ghosts.keys()].join(';'),
    [...f.conditional].join(';'),
    f.activeLoops.map(cellsKey).join('|'),
    [...f.bankCells].map(([k, b]) => `${k}:${JSON.stringify(b)}`).join(';'),
    [...rf.loopColours].map(([k, v]) => `${k}:${v ? 1 : 0}`).join(';'),
    rf.nudge ? JSON.stringify(rf.nudge) : '',
    rf.handGuardReady ? 'g' : '',
  ].join('#');
}

export { cellsKey };

const round = (o: Partial<Record<string, number>>): string =>
  Object.entries(o).map(([k, v]) => `${k}:${v === undefined ? '' : v.toFixed(3)}`).join(',');

export function controlsKey(c: ControlsResult): string {
  return [round(c.values), round(c.positions), JSON.stringify(c.toggles), [...c.held].join(',')].join('#');
}
