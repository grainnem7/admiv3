import { describe, it, expect } from 'vitest';
import { breath, drift, RAIN, rainRings } from '../audience/glow';

/**
 * The audience screen as glowing lights (owner, 7 Nov 2026: "still show the counters, but more
 * abstract and interesting", no text): each counter a soft light that drifts a little and
 * breathes, and each note it plays sends rings out across the dark like rain on water.
 */
describe('the lights drift and breathe, gently', () => {
  it('a light wanders a little round its place, never more than a tenth of a square, and slowly', () => {
    for (let t = 0; t < 60; t += 0.7) {
      const d = drift(3, 4, t, false);
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(d.dy)).toBeLessThanOrEqual(0.1);
      const next = drift(3, 4, t + 0.1, false);
      expect(Math.hypot(next.dx - d.dx, next.dy - d.dy)).toBeLessThan(0.01);
    }
    // Each square its own way, so the board never moves as one block.
    expect(drift(0, 0, 10, false)).not.toEqual(drift(5, 2, 10, false));
    expect(drift(3, 4, 10, false)).toEqual(drift(3, 4, 10, false));
  });

  it('it breathes between 0.8 and full, and keeps still for a viewer who asks for less motion', () => {
    for (let t = 0; t < 30; t += 0.5) {
      const b = breath(2, 6, t, false);
      expect(b).toBeGreaterThanOrEqual(0.8);
      expect(b).toBeLessThanOrEqual(1);
    }
    expect(drift(2, 6, 12, true)).toEqual({ dx: 0, dy: 0 });
    expect(breath(2, 6, 12, true)).toBe(1);
  });
});

describe('each note sends rings out like rain on water', () => {
  it('a few rings, one after another, spreading a few squares out and fading; gone after a few seconds', () => {
    expect(rainRings(0, false)).toHaveLength(1);
    const mid = rainRings(1, false);
    expect(mid.length).toBe(RAIN.rings);
    // The first ring is ahead of the ones after it.
    expect(mid[0].r).toBeGreaterThan(mid[1].r);
    const late = rainRings(RAIN.seconds * 0.95, false);
    expect(Math.max(...late.map((x) => x.r))).toBeGreaterThan(3);
    expect(rainRings(RAIN.seconds + 0.01, false)).toEqual([]);
    expect(rainRings(-0.1, false)).toEqual([]);
  });

  it('faint: never more than a third of full, thinner as they spread (no flashing)', () => {
    for (let age = 0; age < RAIN.seconds; age += 0.05) {
      for (const ring of rainRings(age, false)) {
        expect(ring.alpha).toBeGreaterThanOrEqual(0);
        expect(ring.alpha).toBeLessThanOrEqual(0.34);
      }
    }
    expect(rainRings(2.5, false)[0].alpha).toBeLessThan(rainRings(0.5, false)[0].alpha);
  });

  it('no spreading rings for a viewer who asks for less motion', () => {
    expect(rainRings(1, true)).toEqual([]);
  });
});
