import { describe, it, expect } from 'vitest';
import { remixTaper } from '../remix/remixTaper';

describe('remixTaper', () => {
  it('is true-silent in the dead-zone (filterNorm 0 .. 0.08)', () => {
    expect(remixTaper(0).gain).toBe(0);
    expect(remixTaper(0.04).gain).toBe(0);
    expect(remixTaper(0.0799).gain).toBe(0);
  });

  it('ramps gain 0 → 1 across the fade band (0.08 .. 0.20)', () => {
    expect(remixTaper(0.08).gain).toBeCloseTo(0, 2);
    expect(remixTaper(0.14).gain).toBeCloseTo(0.5, 1);
    expect(remixTaper(0.20).gain).toBeCloseTo(1, 2);
  });

  it('holds gain at 1 above the fade band', () => {
    expect(remixTaper(0.21).gain).toBe(1);
    expect(remixTaper(0.5).gain).toBe(1);
    expect(remixTaper(1).gain).toBe(1);
  });

  it('opens the cutoff monotonically from 80 Hz to 18 kHz', () => {
    const low = remixTaper(0.10).cutoffHz;
    const mid = remixTaper(0.20).cutoffHz;
    const high = remixTaper(1).cutoffHz;
    expect(low).toBeGreaterThanOrEqual(80);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeCloseTo(18000, -2);
  });

  it('clamps out-of-range input', () => {
    expect(remixTaper(-1).gain).toBe(0);
    expect(remixTaper(2)).toEqual(remixTaper(1));
  });
});
