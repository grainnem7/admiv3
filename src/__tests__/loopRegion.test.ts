import { describe, it, expect } from 'vitest';
import { computeLoopRegion, nudgeOrigin } from '../remix/loopRegion';

// 9 downbeats → 8 bars (bar i = downbeats[i]..downbeats[i+1]); 2s per bar.
const DB = [0, 2, 4, 6, 8, 10, 12, 14, 16];

describe('computeLoopRegion', () => {
  it('returns a 4-bar window from the origin downbeat', () => {
    expect(computeLoopRegion(DB, 0, 4)).toEqual({ startSec: 0, endSec: 8 });
    expect(computeLoopRegion(DB, 2, 4)).toEqual({ startSec: 4, endSec: 12 });
  });

  it('returns an 8-bar window', () => {
    expect(computeLoopRegion(DB, 0, 8)).toEqual({ startSec: 0, endSec: 16 });
  });

  it('clamps the window end to the last downbeat', () => {
    // origin 6, 4 bars would end at bar 10 but only bar 8 exists → end at 16.
    expect(computeLoopRegion(DB, 6, 4)).toEqual({ startSec: 12, endSec: 16 });
  });

  it('returns null for Off (lengthBars <= 0)', () => {
    expect(computeLoopRegion(DB, 0, 0)).toBeNull();
  });

  it('returns null when there are fewer than 2 downbeats', () => {
    expect(computeLoopRegion([], 0, 4)).toBeNull();
    expect(computeLoopRegion([5], 0, 4)).toBeNull();
  });
});

describe('nudgeOrigin', () => {
  // barCount = DB.length - 1 = 8.
  it('steps the origin forward by the loop length', () => {
    expect(nudgeOrigin(0, 1, 4, 8)).toBe(4);
  });

  it('steps backward and clamps at 0', () => {
    expect(nudgeOrigin(4, -1, 4, 8)).toBe(0);
    expect(nudgeOrigin(0, -1, 4, 8)).toBe(0);
  });

  it('clamps forward so a full window stays in range', () => {
    // lastValidOrigin = barCount - lengthBars = 4. From 4, +4 would be 8 → clamp 4.
    expect(nudgeOrigin(4, 1, 4, 8)).toBe(4);
  });

  it('clamps to 0 when the window is larger than the song', () => {
    expect(nudgeOrigin(0, 1, 16, 8)).toBe(0);
  });
});
