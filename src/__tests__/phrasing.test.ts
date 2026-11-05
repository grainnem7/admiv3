import { describe, expect, it } from 'vitest';
import { CONTOUR_STEP, contourByInterval, contourFactor, LEGATO_OVERLAP_SEC, legatoLength } from '../songs/phrasing';

describe('phrasing: legato and contour (S2)', () => {
  it('a note that leads to the next overlaps it a little; the last note of a loop does not', () => {
    const beat = 0.667;
    expect(legatoLength(2 * beat, 2, 8, beat)).toBeCloseTo(2 * beat + LEGATO_OVERLAP_SEC, 6);
    expect(legatoLength(0.5, 8, 8, beat)).toBe(0.5); // alone in its loop: rings as set
    expect(legatoLength(0.5, 0, 8, beat)).toBe(0.5);
    // Note length longer than the gap: the longer one stands.
    expect(legatoLength(3, 2, 8, beat)).toBe(3);
  });
  it('up is a touch stronger, down a touch softer, more for a leap, nothing for a repeat or a first note', () => {
    expect(contourFactor(undefined, 64)).toBe(1);
    expect(contourFactor(64, 64)).toBe(1);
    expect(contourFactor(60, 64)).toBeGreaterThan(1);
    expect(contourFactor(64, 60)).toBeLessThan(1);
    expect(contourFactor(60, 72)).toBeCloseTo(1 + CONTOUR_STEP, 6);
    expect(contourFactor(60, 62)).toBeLessThan(contourFactor(60, 67));
    expect(contourFactor(72, 60)).toBeCloseTo(1 - CONTOUR_STEP, 6);
    expect(contourByInterval(0)).toBe(1);
    expect(contourByInterval(4)).toBe(contourFactor(60, 64));
  });
});
