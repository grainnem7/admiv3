import { describe, it, expect } from 'vitest';
import { lowestFingertip, indexFingertip } from '../tracking/handPressPoint';

// Minimal landmark array: only the indices lowestFingertip reads need to be
// present, but it's given a full 21-length array as MediaPipe provides.
function hand(overrides: Record<number, { x: number; y: number }>): { x: number; y: number }[] {
  const lms = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.1 }));
  for (const [i, p] of Object.entries(overrides)) lms[Number(i)] = p;
  return lms;
}

describe('lowestFingertip', () => {
  it('returns the fingertip with the greatest y (lowest in the image)', () => {
    // Index tip (8) is lowest.
    const lm = hand({ 4: { x: 0.2, y: 0.3 }, 8: { x: 0.4, y: 0.7 }, 12: { x: 0.5, y: 0.5 } });
    expect(lowestFingertip(lm)).toEqual({ x: 0.4, y: 0.7 });
  });

  it('considers all five fingertips (4,8,12,16,20), not just the index', () => {
    const lm = hand({ 20: { x: 0.9, y: 0.95 } }); // pinky tip lowest
    expect(lowestFingertip(lm)).toEqual({ x: 0.9, y: 0.95 });
  });

  it('ignores non-fingertip landmarks even if they are lower', () => {
    // Wrist (0) is very low but must be ignored.
    const lm = hand({ 0: { x: 0.5, y: 0.99 }, 8: { x: 0.4, y: 0.6 } });
    expect(lowestFingertip(lm)).toEqual({ x: 0.4, y: 0.6 });
  });

  it('returns null for null or too-short landmark arrays', () => {
    expect(lowestFingertip(null)).toBeNull();
    expect(lowestFingertip([{ x: 0.5, y: 0.5 }])).toBeNull();
  });
});

describe('indexFingertip', () => {
  it('returns landmark 8 (the index tip) regardless of other fingers being lower', () => {
    const lm = hand({ 8: { x: 0.4, y: 0.5 }, 20: { x: 0.9, y: 0.95 } });
    expect(indexFingertip(lm)).toEqual({ x: 0.4, y: 0.5 });
  });

  it('returns null for null or too-short landmark arrays', () => {
    expect(indexFingertip(null)).toBeNull();
    expect(indexFingertip([{ x: 0.5, y: 0.5 }])).toBeNull();
  });
});
