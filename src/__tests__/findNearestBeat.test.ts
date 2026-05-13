import { describe, it, expect, vi } from 'vitest';

// SongPresetEngine pulls in Tone.js transitively (via voice imports).
// Mock the audio surface so module load doesn't try to instantiate real
// audio nodes — we only care about the pure findNearestBeat export.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4', toFrequency: () => 440 })),
  now: vi.fn(() => 0),
  getTransport: vi.fn(() => ({
    bpm: { value: 120 },
    start: vi.fn(),
    stop: vi.fn(),
    scheduleOnce: vi.fn(),
  })),
}));

import { findNearestBeat } from '../songs/SongPresetEngine';

describe('findNearestBeat', () => {
  it('returns null for empty / missing beat data', () => {
    expect(findNearestBeat(undefined, 1)).toBeNull();
    expect(findNearestBeat(null, 1)).toBeNull();
    expect(findNearestBeat([], 1)).toBeNull();
  });

  it('snaps to the nearest beat when target falls between two beats', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    // 1.4 is 0.4 from beat 1, 0.6 from beat 2 → snaps to 1.0.
    expect(findNearestBeat(beats, 1.4)).toBe(1.0);
    // 1.6 is 0.6 from 1, 0.4 from 2 → snaps to 2.0.
    expect(findNearestBeat(beats, 1.6)).toBe(2.0);
  });

  it('snaps to the same beat when target is on it', () => {
    expect(findNearestBeat([1.0, 2.0, 3.0], 2.0)).toBe(2.0);
  });

  it('breaks ties toward the LATER beat (closest-to-now wins on equal distance)', () => {
    // 1.5 is exactly midway between 1 and 2 → tie-breaks to 2.0 since
    // the `<=` test picks the later beat on equal distance.
    expect(findNearestBeat([1.0, 2.0], 1.5)).toBe(2.0);
  });

  it('returns the first beat for targets before the song start', () => {
    expect(findNearestBeat([5.0, 6.0, 7.0], 1.0)).toBe(5.0);
  });

  it('returns the last beat for targets past the song end', () => {
    expect(findNearestBeat([1.0, 2.0, 3.0], 10.0)).toBe(3.0);
  });

  it('handles a realistic 67-BPM 12/8 beat grid (Elvis tempo)', () => {
    // ≈895ms per beat at 67 BPM.
    const beats = Array.from({ length: 20 }, (_, i) => i * 0.8955);
    // Chord change at 1.9 s — between beats[2]=1.791 and beats[3]=2.6865.
    // Distance from 1.791 = 0.109, from 2.6865 = 0.7865 → snaps to 1.791.
    expect(findNearestBeat(beats, 1.9)).toBeCloseTo(1.791, 3);
    // Chord change at 2.5 — closer to beats[3]=2.6865 (0.1865) than beats[2]=1.791 (0.709).
    expect(findNearestBeat(beats, 2.5)).toBeCloseTo(2.6865, 3);
  });
});
