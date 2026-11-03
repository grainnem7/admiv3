import { describe, it, expect } from 'vitest';
import { cellLabel, cellOn, gridColumns, moveCell, toggledLoops } from '../songs/performance/pieceGrid';
import type { Scene } from '../songs/performance/launcher';

const settings = { sceneEnergy: 2 } as unknown as Scene['settings'];
const scene = (id: string, name: string, at: number | null, loops: number[] = []): Scene => ({ id, name, loops, settings, at });

describe('the piece grid (G2)', () => {
  it('a column per timed scene, as wide as its share of the piece, the one on now marked', () => {
    const cols = gridColumns([scene('a', 'Arrival', 0, [0]), scene('b', 'Build', 90), scene('x', 'By hand', null), scene('c', 'Home', 360)], 420, 1);
    expect(cols.map((c) => c.name)).toEqual(['Arrival', 'Build', 'Home']);
    expect(cols.map((c) => c.i)).toEqual([0, 1, 3]);
    expect(cols[0].leftPct).toBe(0);
    expect(cols[0].widthPct).toBeCloseTo((90 / 420) * 100, 5);
    expect(cols[1].widthPct).toBeCloseTo((270 / 420) * 100, 5);
    expect(cols[2].widthPct).toBeCloseTo((60 / 420) * 100, 5);
    expect(cols.map((c) => c.current)).toEqual([false, true, false]);
  });

  it('a scene past the end, or with no time, has no column; a sliver stays 2 percent wide', () => {
    expect(gridColumns([scene('a', 'A', 500)], 420, null)).toEqual([]);
    expect(gridColumns([scene('a', 'A', 0), scene('b', 'B', 419)], 420, null)[1].widthPct).toBe(2);
  });

  it('a cell is on when the loop is in the scene, and a press turns it on or off, keeping the list in order', () => {
    const s = scene('a', 'A', 0, [1, 3]);
    expect(cellOn(s, 1)).toBe(true);
    expect(cellOn(s, 2)).toBe(false);
    expect(toggledLoops(s, 2)).toEqual([1, 2, 3]);
    expect(toggledLoops(s, 3)).toEqual([1]);
    expect(cellLabel('Bed', 'Build')).toBe('Bed in Build');
  });

  it('arrows move within the grid, Home and End to a row’s ends, and nothing else moves', () => {
    expect(moveCell({ r: 0, c: 0 }, 'ArrowDown', 3, 4)).toEqual({ r: 1, c: 0 });
    expect(moveCell({ r: 0, c: 0 }, 'ArrowUp', 3, 4)).toEqual({ r: 0, c: 0 });
    expect(moveCell({ r: 2, c: 3 }, 'ArrowRight', 3, 4)).toEqual({ r: 2, c: 3 });
    expect(moveCell({ r: 1, c: 2 }, 'Home', 3, 4)).toEqual({ r: 1, c: 0 });
    expect(moveCell({ r: 1, c: 2 }, 'End', 3, 4)).toEqual({ r: 1, c: 3 });
    expect(moveCell({ r: 1, c: 2 }, 'a', 3, 4)).toBeNull();
    expect(moveCell({ r: 0, c: 0 }, 'ArrowDown', 0, 0)).toBeNull();
  });
});
