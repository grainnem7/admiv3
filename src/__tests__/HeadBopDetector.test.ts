import { describe, it, expect } from 'vitest';
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';

/**
 * Helper: feed a sequence of (y, t) samples and collect detected-bop
 * timestamps.  Y convention follows MediaPipe — larger = lower.
 */
function play(
  detector: HeadBopDetector,
  samples: ReadonlyArray<[number, number]>,
): number[] {
  const bops: number[] = [];
  for (const [y, t] of samples) {
    if (detector.step(y, t)) bops.push(t);
  }
  return bops;
}

describe('HeadBopDetector', () => {
  it('the very first sample never fires (need at least two to know direction)', () => {
    const d = new HeadBopDetector(0.02, 100);
    expect(d.step(0.5, 0)).toBe(false);
  });

  it('detects a single deliberate downward-then-upward head bop above threshold', () => {
    const d = new HeadBopDetector(0.02, 100);
    // Start neutral, dip down ~5%, return up. Bop fires on the upward turn.
    const samples: Array<[number, number]> = [
      [0.5, 0],     // first sample — direction undefined
      [0.51, 16],   // start going down
      [0.53, 32],
      [0.55, 48],   // peak of the bop (lowest point on screen)
      [0.53, 64],   // turning up here → fires
      [0.50, 80],
    ];
    const bops = play(d, samples);
    expect(bops).toEqual([64]);
  });

  it('rejects sub-threshold "fidget" excursions', () => {
    const d = new HeadBopDetector(0.05, 100);
    // 1% downward excursion << 5% threshold — no bop should fire.
    const samples: Array<[number, number]> = [
      [0.5, 0],
      [0.505, 16],
      [0.51, 32],
      [0.505, 48],   // turns up after only 0.01 excursion
      [0.5, 64],
    ];
    expect(play(d, samples)).toEqual([]);
  });

  it('enforces the cooldown between consecutive bops', () => {
    const d = new HeadBopDetector(0.02, 200);
    const samples: Array<[number, number]> = [
      // Bop 1 — bottom at t=50, turn at t=70.
      [0.5, 0],
      [0.52, 20],
      [0.55, 50],
      [0.52, 70],   // bop fires at 70
      // Bop 2 — bottom at t=120, turn at t=140 (only 70ms after last bop).
      [0.55, 100],
      [0.57, 120],
      [0.55, 140],  // would fire, but cooldown blocks
      // Bop 3 — bottom at t=290, turn at t=310 (240ms after bop 1).
      [0.58, 250],
      [0.60, 290],
      [0.57, 310],  // fires
    ];
    expect(play(d, samples)).toEqual([70, 310]);
  });

  it('handles a sustained postural sag without firing (no upward turn)', () => {
    const d = new HeadBopDetector(0.02, 100);
    // Head drifts steadily downward — no reversal, no bop.
    const samples: Array<[number, number]> = [
      [0.5, 0],
      [0.52, 100],
      [0.54, 200],
      [0.56, 300],
      [0.58, 400],
    ];
    expect(play(d, samples)).toEqual([]);
  });

  it('ignores noise wobbles smaller than the direction epsilon', () => {
    const d = new HeadBopDetector(0.02, 100);
    // Tiny ±0.0001 wobbles around 0.5 — below the epsilon — should not
    // be treated as direction changes.  No bop should fire.
    const samples: Array<[number, number]> = [
      [0.5, 0],
      [0.5001, 16],
      [0.4999, 32],
      [0.5001, 48],
      [0.5, 64],
    ];
    expect(play(d, samples)).toEqual([]);
  });

  it('reset() clears history so a brand-new bop fires after reset', () => {
    const d = new HeadBopDetector(0.02, 50);
    // Fire one bop.
    play(d, [
      [0.5, 0],
      [0.55, 20],
      [0.5, 40],
    ]);
    d.reset();
    // Same shape, different timestamps — should fire again.
    const bops = play(d, [
      [0.5, 1000],
      [0.55, 1020],
      [0.5, 1040],
    ]);
    expect(bops).toEqual([1040]);
  });

  it('setConfig changes thresholds live', () => {
    const d = new HeadBopDetector(0.01, 50);
    // Fire with the loose threshold.
    play(d, [
      [0.5, 0],
      [0.515, 16],   // 1.5% excursion >= 1% threshold
      [0.5, 32],
    ]);
    d.reset();
    // Tighten — same excursion should now be rejected.
    d.setConfig(0.05, 50);
    const bops = play(d, [
      [0.5, 0],
      [0.515, 16],
      [0.5, 32],
    ]);
    expect(bops).toEqual([]);
  });
});
