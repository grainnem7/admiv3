import { describe, it, expect, vi } from 'vitest';

// Prevent Tone.js from instantiating a real AudioContext during module load.
// WalkVoice.ts imports SamplerPlayer which imports 'tone'; without this mock
// the test environment (jsdom) crashes on standardized-audio-context init.
vi.mock('tone', () => ({
  Sampler: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttack: vi.fn(),
      triggerAttackRelease: vi.fn(),
      triggerRelease: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
  }),
  Frequency: vi.fn((midi: number) => ({
    toNote: () => `MIDI-${midi}`,
    toFrequency: () => 440,
  })),
  now: vi.fn(() => 0),
}));

import { walkStepNote, latestBeatIndexAtOrBefore } from '../songs/voices/WalkVoice';

describe('walkStepNote', () => {
  it('walks a 4-note voicing as n0 n1 n2 n3 n2 n1 then loops', () => {
    const voicing = [60, 64, 67, 72];
    const sequence = Array.from({ length: 8 }, (_, i) => walkStepNote(voicing, i));
    expect(sequence).toEqual([60, 64, 67, 72, 67, 64, 60, 64]);
  });

  it('walks a 3-note voicing as n0 n1 n2 n1 then loops', () => {
    const voicing = [60, 64, 67];
    const sequence = Array.from({ length: 6 }, (_, i) => walkStepNote(voicing, i));
    expect(sequence).toEqual([60, 64, 67, 64, 60, 64]);
  });

  it('alternates n0 n1 for a 2-note voicing', () => {
    expect(walkStepNote([60, 67], 0)).toBe(60);
    expect(walkStepNote([60, 67], 1)).toBe(67);
    expect(walkStepNote([60, 67], 2)).toBe(60);
  });

  it('returns the single note for a 1-note voicing at any step', () => {
    expect(walkStepNote([60], 0)).toBe(60);
    expect(walkStepNote([60], 5)).toBe(60);
    expect(walkStepNote([60], 100)).toBe(60);
  });

  it('returns null for an empty voicing', () => {
    expect(walkStepNote([], 0)).toBeNull();
    expect(walkStepNote([], 5)).toBeNull();
  });

  it('wraps step counter into the cycle (chord change shorter-than-step)', () => {
    // step 4 on a 3-note voicing: cycle length is 4, phase = 0, returns n0.
    expect(walkStepNote([60, 64, 67], 4)).toBe(60);
    // step 5 on a 3-note voicing: phase = 1, returns n1.
    expect(walkStepNote([60, 64, 67], 5)).toBe(64);
  });

  it('handles negative steps via positive-modulo', () => {
    expect(walkStepNote([60, 64, 67, 72], -1)).toBe(64); // phase 5
    expect(walkStepNote([60, 64, 67, 72], -6)).toBe(60); // phase 0
  });
});

describe('latestBeatIndexAtOrBefore', () => {
  it('returns -1 for an empty or null beat array', () => {
    expect(latestBeatIndexAtOrBefore([], 1.0)).toBe(-1);
    expect(latestBeatIndexAtOrBefore(null, 1.0)).toBe(-1);
    expect(latestBeatIndexAtOrBefore(undefined, 1.0)).toBe(-1);
  });

  it('returns -1 when targetTime is before all beats', () => {
    expect(latestBeatIndexAtOrBefore([1.0, 2.0, 3.0], 0.5)).toBe(-1);
  });

  it('returns the last beat at or before targetTime', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    expect(latestBeatIndexAtOrBefore(beats, 1.0)).toBe(0); // inclusive
    expect(latestBeatIndexAtOrBefore(beats, 1.5)).toBe(0);
    expect(latestBeatIndexAtOrBefore(beats, 2.0)).toBe(1);
    expect(latestBeatIndexAtOrBefore(beats, 3.999)).toBe(2);
    expect(latestBeatIndexAtOrBefore(beats, 4.0)).toBe(3);
    expect(latestBeatIndexAtOrBefore(beats, 100)).toBe(3);
  });
});
