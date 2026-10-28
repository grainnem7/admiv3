import { describe, it, expect } from 'vitest';
import { glideBpmAt, glideDone, startGlide, GLIDE_MAX_SEC, GLIDE_MIN_SEC } from '../songs/performance/speedGlide';

/**
 * A scene that reaches its speed gradually: linear in BPM, from the speed in force when it
 * comes in to the scene's own, over its glide time. Stepped by the screen; every step goes
 * through the engine's setBpm, which keeps the beat continuous.
 */
describe('a scene gliding to its speed', () => {
  it('the speed at its start, middle and end, and after', () => {
    const g = startGlide(90, 130, 4, 1000);
    expect(glideBpmAt(g, 1000)).toBe(90);
    expect(glideBpmAt(g, 2000)).toBeCloseTo(100, 6);
    expect(glideBpmAt(g, 3000)).toBeCloseTo(110, 6);
    expect(glideBpmAt(g, 5000)).toBe(130);
    expect(glideBpmAt(g, 9000)).toBe(130);
    expect(glideDone(g, 4999)).toBe(false);
    expect(glideDone(g, 5000)).toBe(true);
  });

  it('slowing down glides too', () => {
    const g = startGlide(120, 80, 8, 0);
    expect(glideBpmAt(g, 4000)).toBeCloseTo(100, 6);
  });

  it('a second scene mid-glide glides from wherever the speed is now', () => {
    const first = startGlide(90, 130, 4, 0);
    const now = 2000;
    const second = startGlide(glideBpmAt(first, now), 70, 10, now);
    expect(glideBpmAt(second, now)).toBeCloseTo(110, 6);
    expect(glideBpmAt(second, now + 5000)).toBeCloseTo(90, 6);
    expect(glideBpmAt(second, now + 10000)).toBe(70);
  });

  it('0, or no glide time, is at once', () => {
    for (const sec of [0, undefined]) {
      const g = startGlide(90, 130, sec, 500);
      expect(glideBpmAt(g, 500)).toBe(130);
      expect(glideDone(g, 500)).toBe(true);
    }
  });

  it('a time outside the range is held inside it', () => {
    expect(startGlide(90, 130, 1, 0).durMs).toBe(GLIDE_MIN_SEC * 1000);
    expect(startGlide(90, 130, 500, 0).durMs).toBe(GLIDE_MAX_SEC * 1000);
  });

  it('never outside the engine’s limits, and a clock that steps back stays at the start', () => {
    const g = startGlide(10, 900, 4, 1000);
    expect(glideBpmAt(g, 1000)).toBe(20);
    expect(glideBpmAt(g, 9000)).toBe(400);
    expect(glideBpmAt(g, 500)).toBe(20);
  });
});
