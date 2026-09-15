import { describe, it, expect } from 'vitest';
import { alphaForDt, REFERENCE_FRAME_MS } from '../utils/timeConstant';

describe('alphaForDt', () => {
  it('returns the reference alpha for one reference frame', () => {
    expect(alphaForDt(0.4, REFERENCE_FRAME_MS)).toBeCloseTo(0.4, 10);
  });
  it('composes: two half steps equal one full step', () => {
    const a = alphaForDt(0.4, 10);
    const oneStep = alphaForDt(0.4, 20);
    expect(1 - (1 - a) * (1 - a)).toBeCloseTo(oneStep, 10);
  });
  it('keeps 1 as "no smoothing" and 0 as frozen', () => {
    expect(alphaForDt(1, 33)).toBe(1);
    expect(alphaForDt(0, 33)).toBe(0);
    expect(alphaForDt(0.5, 0)).toBe(0);
  });
});
