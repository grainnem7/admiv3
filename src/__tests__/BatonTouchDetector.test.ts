import { describe, it, expect } from 'vitest';
import { BatonTouchDetector } from '../remix/BatonTouchDetector';

const A = { x: 0.2, y: 0.5, found: true };
const NEAR = { x: 0.24, y: 0.5, found: true };  // dist 0.04 < radius 0.08
const FAR = { x: 0.6, y: 0.5, found: true };     // dist 0.4 > radius

describe('BatonTouchDetector', () => {
  it('fires once when the two centroids cross within touchRadius', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, FAR, 0)).toBe(false);
    expect(d.update(A, NEAR, 16)).toBe(true);   // crossed in
  });

  it('does not re-fire while still within radius (needs separation)', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, NEAR, 0)).toBe(true);
    expect(d.update(A, NEAR, 16)).toBe(false);
    expect(d.update(A, NEAR, 32)).toBe(false);
  });

  it('re-arms after separating beyond radius, respecting cooldown', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, NEAR, 0)).toBe(true);
    d.update(A, FAR, 100);                       // separate (arms)
    expect(d.update(A, NEAR, 400)).toBe(false);  // within cooldown
    d.update(A, FAR, 700);
    expect(d.update(A, NEAR, 720)).toBe(true);   // past cooldown
  });

  it('requires both batons present', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, { ...NEAR, found: false }, 0)).toBe(false);
  });

  it('reset() clears state', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    d.update(A, NEAR, 0);
    d.reset();
    expect(d.update(A, NEAR, 10)).toBe(true);
  });
});
