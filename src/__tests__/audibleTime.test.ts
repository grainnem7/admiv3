import { describe, it, expect } from 'vitest';
import { audibleTime } from '../songs/audibleTime';

describe('audibleTime', () => {
  it('uses getOutputTimestamp and advances by performance time since the stamp', () => {
    const ctx = {
      currentTime: 10.2,
      outputLatency: 0.05,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }),
    };
    expect(audibleTime(ctx, 5250)).toBeCloseTo(10.25, 6);
  });

  it('falls back to currentTime - outputLatency when no timestamp is available', () => {
    expect(audibleTime({ currentTime: 3, outputLatency: 0.02 }, 0)).toBeCloseTo(2.98, 6);
    expect(audibleTime({ currentTime: 3 }, 0)).toBeCloseTo(3, 6);
  });

  it('falls back when the timestamp is not yet valid (performanceTime 0)', () => {
    const ctx = { currentTime: 1, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) };
    expect(audibleTime(ctx, 999)).toBeCloseTo(1, 6);
  });
});
