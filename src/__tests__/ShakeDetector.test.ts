import { describe, it, expect } from 'vitest';
import { ShakeDetector } from '../remix/ShakeDetector';

describe('ShakeDetector', () => {
  it('fires once when velocity crosses the threshold', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.2, 0)).toBe(false);
    expect(d.update(0.6, 16)).toBe(true);   // crossed
  });

  it('does not re-fire while still above threshold (needs a fresh crossing)', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.6, 0)).toBe(true);
    expect(d.update(0.7, 16)).toBe(false);  // still high, no new crossing
    expect(d.update(0.8, 32)).toBe(false);
  });

  it('respects the cooldown after firing', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.6, 0)).toBe(true);
    d.update(0.1, 100);                     // drop below
    expect(d.update(0.6, 400)).toBe(false); // within cooldown
    expect(d.update(0.1, 700)).toBe(false); // below, but past cooldown — arms
    expect(d.update(0.6, 720)).toBe(true);  // fresh crossing after cooldown
  });

  it('reset() clears state', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    d.update(0.6, 0);
    d.reset();
    expect(d.update(0.6, 10)).toBe(true);
  });
});
