import { describe, it, expect } from 'vitest';
import {
  KEEP_ON_TOP_DEFAULT_DB, KEEP_ON_TOP_MAX_DB, KEEP_ON_TOP_MIN_DB, dipGain, keepOnTopGain, noteDip, pruneWindows, sanitizeKeepOnTopDb,
} from '../songs/band/keepOnTop';

/** Harmony spec stage 2: "Keep Tim on top" — the rest dips while his own notes sound. */

describe('keep Tim on top', () => {
  it('3 dB by default, calibratable within a safe range', () => {
    expect(KEEP_ON_TOP_DEFAULT_DB).toBe(3);
    expect(dipGain(3)).toBeCloseTo(0.708, 3);
    expect(dipGain(0)).toBe(1);
    expect(sanitizeKeepOnTopDb(undefined)).toBe(3);
    expect(sanitizeKeepOnTopDb(40)).toBe(KEEP_ON_TOP_MAX_DB);
    expect(sanitizeKeepOnTopDb(-2)).toBe(KEEP_ON_TOP_MIN_DB);
    expect(sanitizeKeepOnTopDb(4.4)).toBe(4.5);
  });

  it('the gain dips while Tim’s note sounds, and recovers after it', () => {
    const w = [{ start: 1, end: 2 }];
    expect(keepOnTopGain(0.9, w, 3)).toBe(1);
    // A short attack: well down within 50 ms, at the dip while the note holds.
    expect(keepOnTopGain(1.05, w, 3)).toBeLessThan(0.8);
    expect(keepOnTopGain(1.5, w, 3)).toBeCloseTo(dipGain(3), 2);
    expect(keepOnTopGain(1.99, w, 3)).toBeCloseTo(dipGain(3), 2);
    // A short release: on its way back soon after, and back by half a second.
    expect(keepOnTopGain(2.1, w, 3)).toBeGreaterThan(dipGain(3));
    expect(keepOnTopGain(2.5, w, 3)).toBeGreaterThan(0.99);
    expect(keepOnTopGain(3, w, 3)).toBe(1);
  });

  it('overlapping notes keep it down; off (0 dB) never dips', () => {
    const w = [{ start: 1, end: 1.5 }, { start: 1.4, end: 2.2 }];
    expect(keepOnTopGain(1.8, w, 3)).toBeCloseTo(dipGain(3), 2);
    expect(keepOnTopGain(1.5, w, 0)).toBe(1);
  });

  it('a note starting together with Tim’s dips with it (judged by its body, not its first instant)', () => {
    const w = [{ start: 1, end: 2 }];
    expect(keepOnTopGain(1, w, 3)).toBe(1);
    expect(noteDip(1, w, 3)).toBeLessThan(0.75);
    expect(noteDip(0.5, w, 3)).toBe(1);
  });

  it('forgets notes long finished', () => {
    const w = [{ start: 0, end: 1 }, { start: 5, end: 6 }];
    expect(pruneWindows(w, 4)).toEqual([{ start: 5, end: 6 }]);
  });
});
