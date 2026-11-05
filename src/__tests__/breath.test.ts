import { describe, expect, it } from 'vitest';
import { breathGain, breathPhase, breathRest } from '../songs/breath';

describe('breathing: a loop delivers its figure differently over four passes (S2)', () => {
  it('as kept, a little louder, the peak, then softer; nothing at all at amount 0', () => {
    expect(breathGain(0, 1)).toBe(1);
    expect(breathGain(1, 1)).toBeGreaterThan(1);
    expect(breathGain(2, 1)).toBeGreaterThan(breathGain(1, 1));
    expect(breathGain(3, 1)).toBeLessThan(1);
    expect(breathGain(4, 1)).toBe(1);
    for (let p = 0; p < 8; p++) expect(breathGain(p, 0)).toBe(1);
    expect(breathGain(2, 0.5)).toBeLessThan(breathGain(2, 1));
  });
  it('the phase comes round every four passes', () => {
    expect([0, 1, 2, 3, 4, 5].map(breathPhase)).toEqual([0, 1, 2, 3, 0, 1]);
  });
  it('the breath: the last step of pass four rests for a melody loop, more with more variation, never for other parts', () => {
    expect(breathRest(3, 7, 8, 0.5, 'melody')).toBe(true);
    expect(breathRest(3, 3, 8, 0.5, 'melody')).toBe(false);
    expect(breathRest(3, 3, 8, 1, 'melody')).toBe(true);
    expect(breathRest(2, 7, 8, 1, 'melody')).toBe(false);
    expect(breathRest(3, 7, 8, 0.1, 'melody')).toBe(false);
    expect(breathRest(3, 7, 8, 1, 'bass')).toBe(false);
    expect(breathRest(3, 7, 8, 1, 'chord')).toBe(false);
  });
});
