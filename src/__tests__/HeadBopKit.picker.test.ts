import { describe, it, expect, vi } from 'vitest';

// Mock Tone so importing HeadBopKit (which transitively pulls Tone.MembraneSynth etc.)
// doesn't crash without a real AudioContext.  pickHeadBopDrum is pure
// and doesn't touch Tone, but the import path does.
vi.mock('tone', () => ({
  MembraneSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
  NoiseSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
  MetalSynth: vi.fn(() => ({ toDestination: vi.fn(() => ({ dispose: vi.fn() })) })),
}));

import { pickHeadBopDrum } from '../songs/voices/HeadBopKit';

describe('pickHeadBopDrum', () => {
  it('returns "kick" when no beat data is available', () => {
    expect(pickHeadBopDrum(0.5, null, null)).toBe('kick');
    expect(pickHeadBopDrum(0.5, [], [])).toBe('kick');
  });

  it('without downbeats, alternates kick/snare across adjacent beats', () => {
    // Five beats evenly spaced.  No downbeats — the picker just alternates
    // based on beat index parity (gives a groove without bar info).
    const beats = [1.0, 2.0, 3.0, 4.0, 5.0];
    expect(pickHeadBopDrum(1.0, beats, null)).toBe('kick');     // beat 0
    expect(pickHeadBopDrum(2.0, beats, null)).toBe('snare');    // beat 1
    expect(pickHeadBopDrum(3.0, beats, null)).toBe('kick');     // beat 2
    expect(pickHeadBopDrum(4.0, beats, null)).toBe('snare');    // beat 3
  });

  it('downbeat fires kick + crash splash', () => {
    // 4/4 bar: beats at 1, 2, 3, 4; downbeat is the 1.
    const beats = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    const downbeats = [1.0, 5.0];
    expect(pickHeadBopDrum(1.0, beats, downbeats)).toBe('kickCrash');
    expect(pickHeadBopDrum(5.0, beats, downbeats)).toBe('kickCrash');
  });

  it('backbeats (beats 2 and 4 of a 4/4 bar) fire snare', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    const downbeats = [1.0];
    expect(pickHeadBopDrum(2.0, beats, downbeats)).toBe('snare'); // beat 2
    expect(pickHeadBopDrum(4.0, beats, downbeats)).toBe('snare'); // beat 4
  });

  it('strong but non-bar-starting beat (beat 3 in 4/4) fires plain kick', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    const downbeats = [1.0];
    expect(pickHeadBopDrum(3.0, beats, downbeats)).toBe('kick');
  });

  it('snaps to the nearest beat when target falls between two beats', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    const downbeats = [1.0];
    // 1.4 is closer to beat 1 (0.4 vs 0.6) → downbeat → kickCrash.
    expect(pickHeadBopDrum(1.4, beats, downbeats)).toBe('kickCrash');
    // 1.6 is closer to beat 2 → backbeat → snare.
    expect(pickHeadBopDrum(1.6, beats, downbeats)).toBe('snare');
  });

  it('handles songs with multiple bars correctly', () => {
    // Two 4/4 bars: beats at 1..8, downbeats at 1 and 5.
    const beats = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    const downbeats = [1.0, 5.0];
    expect(pickHeadBopDrum(1.0, beats, downbeats)).toBe('kickCrash');
    expect(pickHeadBopDrum(2.0, beats, downbeats)).toBe('snare');
    expect(pickHeadBopDrum(3.0, beats, downbeats)).toBe('kick');
    expect(pickHeadBopDrum(4.0, beats, downbeats)).toBe('snare');
    expect(pickHeadBopDrum(5.0, beats, downbeats)).toBe('kickCrash');
    expect(pickHeadBopDrum(6.0, beats, downbeats)).toBe('snare');
    expect(pickHeadBopDrum(7.0, beats, downbeats)).toBe('kick');
    expect(pickHeadBopDrum(8.0, beats, downbeats)).toBe('snare');
  });

  it('handles 12/8 patterns (4 dotted-quarter beats per bar)', () => {
    // 67 BPM 12/8: ≈895ms per dotted-quarter beat.  Two bars worth.
    const interval = 0.895;
    const beats = Array.from({ length: 8 }, (_, i) => i * interval);
    const downbeats = [beats[0], beats[4]]; // 4 beats per bar
    expect(pickHeadBopDrum(beats[0], beats, downbeats)).toBe('kickCrash');
    expect(pickHeadBopDrum(beats[1], beats, downbeats)).toBe('snare');
    expect(pickHeadBopDrum(beats[2], beats, downbeats)).toBe('kick');
    expect(pickHeadBopDrum(beats[3], beats, downbeats)).toBe('snare');
    expect(pickHeadBopDrum(beats[4], beats, downbeats)).toBe('kickCrash'); // next bar
  });

  it('falls back to alternating kick/snare when downbeats are present but unmatched', () => {
    // Downbeat at 100 — far from any of these beats.  The picker
    // shouldn't crash, just degrade gracefully.
    const beats = [1.0, 2.0, 3.0];
    const downbeats = [100.0];
    const got = pickHeadBopDrum(1.0, beats, downbeats);
    expect(['kick', 'snare']).toContain(got);
  });
});
