import { describe, it, expect } from 'vitest';
import { selectLoopZone } from '../remix/RemixLoopBaton';

const H = 0.04;

describe('selectLoopZone', () => {
  it('snaps directly to the zone when current is -1 (uninitialised)', () => {
    expect(selectLoopZone(0.1, 3, -1, H)).toBe(0);
    expect(selectLoopZone(0.5, 3, -1, H)).toBe(1);
    expect(selectLoopZone(0.9, 3, -1, H)).toBe(2);
  });
  it('returns 0 when there is only one loop', () => {
    expect(selectLoopZone(0.9, 1, -1, H)).toBe(0);
  });
  it('switches up only after crossing the boundary by the hysteresis margin', () => {
    // n=3 → boundary between zone 0 and 1 is at 0.333.
    expect(selectLoopZone(0.34, 3, 0, H)).toBe(0); // within margin → stay
    expect(selectLoopZone(0.40, 3, 0, H)).toBe(1); // past boundary+H → switch
  });
  it('does not flip back and forth while drifting on a boundary', () => {
    expect(selectLoopZone(0.32, 3, 1, H)).toBe(1);
    expect(selectLoopZone(0.28, 3, 1, H)).toBe(0); // clearly past → drop
  });
  it('clamps to valid zone range', () => {
    expect(selectLoopZone(1.5, 3, -1, H)).toBe(2);
    expect(selectLoopZone(-0.5, 3, -1, H)).toBe(0);
  });
});
