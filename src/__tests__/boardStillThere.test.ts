import { describe, it, expect } from 'vitest';
import { boardStillThere } from '../tracking/boardDetect/boardStillThere';

// An 8 × 8 board 0.8 of the frame across: a square is 0.1.
const saved = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const shift = (dx: number, dy: number) => saved.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe('is the board where it was?', () => {
  it('the same corners: found', () => {
    expect(boardStillThere(saved, saved, 8)).toBe('found');
  });

  it('every corner a third of a square off (the camera settling, a small knock): found', () => {
    expect(boardStillThere(saved, shift(0.03, 0.03), 8)).toBe('found');
  });

  it('a corner a whole square away: moved', () => {
    const found = saved.map((p, i) => (i === 2 ? { x: p.x - 0.1, y: p.y } : p));
    expect(boardStillThere(saved, found, 8)).toBe('moved');
  });

  it('not seen (counters, a hand, poor light): unsure, never "moved" without seeing it', () => {
    expect(boardStillThere(saved, null, 8)).toBe('unsure');
  });

  it('the same board with its corners listed from another one: found', () => {
    const rotated = [saved[1], saved[2], saved[3], saved[0]];
    expect(boardStillThere(saved, rotated, 8)).toBe('found');
    expect(boardStillThere(saved, [...saved].reverse(), 8)).toBe('found');
  });
});
