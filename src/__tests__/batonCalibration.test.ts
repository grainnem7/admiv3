import { describe, it, expect } from 'vitest';
import { applyAxisCalibration, type AxisRange } from '../remix/batonCalibration';

describe('applyAxisCalibration', () => {
  it('passes raw through when range is null (uncalibrated)', () => {
    expect(applyAxisCalibration(0.3, null, 0.1)).toBeCloseTo(0.3, 5);
  });

  it('passes raw through for a degenerate range (min === max)', () => {
    expect(applyAxisCalibration(0.3, { min: 0.5, max: 0.5 }, 0.1)).toBeCloseTo(0.3, 5);
  });

  it('maps the calibrated min→0 and max→1', () => {
    const r: AxisRange = { min: 0.4, max: 0.6 };
    expect(applyAxisCalibration(0.4, r, 0)).toBeCloseTo(0, 5);
    expect(applyAxisCalibration(0.6, r, 0)).toBeCloseTo(1, 5);
    expect(applyAxisCalibration(0.5, r, 0)).toBeCloseTo(0.5, 5);
  });

  it('snaps the outer margin fraction to the extremes', () => {
    const r: AxisRange = { min: 0, max: 1 };
    // margin 0.1: normalised < 0.1 → 0, > 0.9 → 1, else rescaled.
    expect(applyAxisCalibration(0.05, r, 0.1)).toBe(0);
    expect(applyAxisCalibration(0.95, r, 0.1)).toBe(1);
    expect(applyAxisCalibration(0.5, r, 0.1)).toBeCloseTo(0.5, 5);
  });

  it('clamps out-of-range input', () => {
    const r: AxisRange = { min: 0.4, max: 0.6 };
    expect(applyAxisCalibration(0.2, r, 0)).toBe(0);
    expect(applyAxisCalibration(0.9, r, 0)).toBe(1);
  });
});
