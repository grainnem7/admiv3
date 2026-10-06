import { describe, it, expect } from 'vitest';
import { steadyCells, type SteadyMemory } from '../ui/screens/boardSequencer/steadyCells';

const c = (row: number, col: number, colour = 'o') => ({ row, col, colour });

describe('steadyCells', () => {
  it('keeps a counter listed through a one-frame flicker', () => {
    const mem: SteadyMemory = new Map();
    steadyCells(mem, [c(1, 0), c(3, 2)], 0);
    expect(steadyCells(mem, [c(1, 0)], 100)).toHaveLength(2);
  });

  it('drops a counter once it has really gone', () => {
    const mem: SteadyMemory = new Map();
    steadyCells(mem, [c(1, 0), c(3, 2)], 0, 1000);
    expect(steadyCells(mem, [c(1, 0)], 1500, 1000)).toEqual([c(1, 0)]);
  });

  it('lists in board order whatever order the camera reported', () => {
    const mem: SteadyMemory = new Map();
    const out = steadyCells(mem, [c(3, 2), c(1, 3), c(1, 0)], 0);
    expect(out).toEqual([c(1, 0), c(1, 3), c(3, 2)]);
  });
});
