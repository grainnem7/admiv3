import { describe, expect, it } from 'vitest';
import { ACCENT_DOWNBEAT, ACCENT_HALF, ACCENT_OFF_BEAT, ACCENT_ON_BEAT, HUMAN_SPREAD, humanFactor, metricAccent, shapedVelocity } from '../songs/dynamics';

describe('dynamics: the counters breathe (S2)', () => {
  it('accents the first step most, the middle next, on-beats, then off-beats', () => {
    expect(metricAccent(0, 8)).toBe(ACCENT_DOWNBEAT);
    expect(metricAccent(4, 8)).toBe(ACCENT_HALF);
    expect(metricAccent(2, 8)).toBe(ACCENT_ON_BEAT);
    expect(metricAccent(6, 8)).toBe(ACCENT_ON_BEAT);
    expect(metricAccent(1, 8)).toBe(ACCENT_OFF_BEAT);
    expect(metricAccent(7, 8)).toBe(ACCENT_OFF_BEAT);
    expect(metricAccent(8, 8)).toBe(ACCENT_DOWNBEAT);
    expect(ACCENT_DOWNBEAT).toBeGreaterThan(ACCENT_HALF);
    expect(ACCENT_HALF).toBeGreaterThan(ACCENT_ON_BEAT);
    expect(ACCENT_ON_BEAT).toBeGreaterThan(ACCENT_OFF_BEAT);
  });
  it('an odd number of steps has no middle accent, and never a step below the off-beat level', () => {
    for (let c = 0; c < 7; c++) expect(metricAccent(c, 7)).toBeGreaterThanOrEqual(ACCENT_OFF_BEAT);
    expect(metricAccent(3, 7)).toBe(ACCENT_OFF_BEAT);
  });
  it('the variation is small, within its spread, and the same for the same pass, square and name', () => {
    const seen = new Set<number>();
    for (let pass = 0; pass < 40; pass++) {
      const f = humanFactor(pass, 3, 5, 'red');
      expect(f).toBeGreaterThanOrEqual(1 - HUMAN_SPREAD);
      expect(f).toBeLessThanOrEqual(1 + HUMAN_SPREAD);
      seen.add(f);
      expect(humanFactor(pass, 3, 5, 'red')).toBe(f);
    }
    // Alive: many different values over the passes, not one.
    expect(seen.size).toBeGreaterThan(20);
  });
  it('shapes a velocity without ever leaving 0 to 1, and a downbeat is louder than the off-beat beside it on average', () => {
    expect(shapedVelocity(1, 0, 8, 0, 0)).toBeLessThanOrEqual(1);
    expect(shapedVelocity(0, 3, 8, 2, 1)).toBe(0);
    const avg = (col: number): number => [...Array(30).keys()].reduce((s, p) => s + shapedVelocity(0.7, col, 8, p, 2), 0) / 30;
    expect(avg(0)).toBeGreaterThan(avg(1));
    expect(avg(4)).toBeGreaterThan(avg(5));
  });
});
