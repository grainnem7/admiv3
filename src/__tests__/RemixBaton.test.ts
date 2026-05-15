import { describe, it, expect } from 'vitest';
import { RemixBaton, STEM_CYCLE_ORDER } from '../remix/RemixBaton';

const STILL = { x: 0.5, y: 0.5, found: true };

function holdStill(b: RemixBaton, fromMs: number, frames: number, stepMs = 60) {
  let cycled = false;
  for (let i = 0; i < frames; i++) {
    const out = b.update(STILL, fromMs + i * stepMs);
    if (out.cycled) cycled = true;
  }
  return cycled;
}

describe('RemixBaton', () => {
  it('starts assigned to the first stem in the cycle order', () => {
    const b = new RemixBaton('red');
    expect(b.update(STILL, 0).stem).toBe(STEM_CYCLE_ORDER[0]);
  });

  it('maps Y to filterNorm (top of frame = open, bottom = silent)', () => {
    const b = new RemixBaton('red');
    // posY 0 = top of frame → filterNorm 1; posY 1 = bottom → 0
    expect(b.update({ x: 0.5, y: 0, found: true }, 0).filterNorm).toBeCloseTo(1, 5);
    expect(b.update({ x: 0.5, y: 1, found: true }, 16).filterNorm).toBeCloseTo(0, 5);
  });

  it('writes null filterNorm when the baton is absent (latch)', () => {
    const b = new RemixBaton('red');
    expect(b.update({ x: 0, y: 0, found: false }, 0).filterNorm).toBeNull();
  });

  it('cycles to the next stem after a sustained dwell, latching the prior', () => {
    const b = new RemixBaton('red');
    const cycled = holdStill(b, 0, 40); // > dwellTimeMs at 60ms/frame
    expect(cycled).toBe(true);
    expect(b.update(STILL, 5000).stem).toBe(STEM_CYCLE_ORDER[1]);
  });

  it('wraps the cycle order back to the first stem', () => {
    const b = new RemixBaton('red');
    let t = 0;
    for (let i = 0; i < STEM_CYCLE_ORDER.length; i++) {
      holdStill(b, t, 40);
      t += 40 * 60 + 2000; // advance well past cooldown
    }
    expect(b.update(STILL, t).stem).toBe(STEM_CYCLE_ORDER[0]);
  });

  it('fires a stutter on a fast move and not on a dwell', () => {
    const b = new RemixBaton('red');
    // Big position jump between frames → high velocity → shake.
    b.update({ x: 0.1, y: 0.5, found: true }, 0);
    const out = b.update({ x: 0.9, y: 0.5, found: true }, 16);
    expect(out.stutter).toBe(true);
    // A still hold never reports stutter.
    const b2 = new RemixBaton('red');
    let anyStutter = false;
    for (let i = 0; i < 40; i++) {
      if (b2.update(STILL, i * 60).stutter) anyStutter = true;
    }
    expect(anyStutter).toBe(false);
  });

  it('reports dwell progress 0..1 while holding still', () => {
    const b = new RemixBaton('red');
    b.update(STILL, 0);
    const mid = b.update(STILL, 600);
    expect(mid.dwellProgress).toBeGreaterThan(0);
    expect(mid.dwellProgress).toBeLessThanOrEqual(1);
  });
});
