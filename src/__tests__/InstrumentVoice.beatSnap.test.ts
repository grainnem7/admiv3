import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------
// Tone.js mock — mirror InstrumentVoice.test.ts so SamplerPlayer
// instantiates a ready Sampler whose triggerAttackRelease spy we
// can inspect.
// ---------------------------------------------------------------

const samplerTriggerAttackRelease = vi.fn();

vi.mock('tone', () => {
  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttack: vi.fn(),
      triggerAttackRelease: samplerTriggerAttackRelease,
      triggerRelease: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
  });
  return {
    Sampler,
    Frequency: vi.fn((midi: number) => ({
      toNote: () => `MIDI-${midi}`,
      toFrequency: () => 440,
    })),
    now: vi.fn(() => 0),
  };
});

import { InstrumentVoice, nextBeatAfter } from '../songs/voices/InstrumentVoice';
import type { ChordEntry } from '../songs/voices/chordLookup';

function makeFakeNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
    frequency: { value: 4000 },
    Q: { value: 0.7 },
    type: 'lowpass',
  };
}

function makeFakeContext(): AudioContext {
  return {
    currentTime: 0,
    state: 'running' as const,
    createGain: vi.fn(() => makeFakeNode()),
    createBiquadFilter: vi.fn(() => makeFakeNode()),
  } as unknown as AudioContext;
}

const D_MAJOR: ChordEntry = {
  time: 0,
  notes: [50, 57, 62, 66],
  root: 50,
  name: 'D',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('nextBeatAfter helper', () => {
  it('returns the first beat after the target time', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    expect(nextBeatAfter(beats, 0.5)).toBe(1.0);
    expect(nextBeatAfter(beats, 1.5)).toBe(2.0);
    expect(nextBeatAfter(beats, 2.0)).toBe(3.0); // strict "after"
  });

  it('extrapolates one beat-interval past the last beat for tail playback', () => {
    // Two-beat song ending at t=4; interval=2; next-after(5) → 6.
    expect(nextBeatAfter([2.0, 4.0], 5.0)).toBe(6.0);
  });

  it('returns targetTime as-is when beat array is empty', () => {
    expect(nextBeatAfter([], 3.0)).toBe(3.0);
  });
});

describe('InstrumentVoice beat-snap', () => {
  it('with snap OFF, fires the note immediately on baton movement', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    voice.update(0.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('with snap ON, defers the trigger until the next beat arrives', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0, 3.0]);
    voice.setBeatSnap(true);
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    // Trigger at t=0.5 — pending until t=1.0.
    voice.update(0.5, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();

    // Frame at t=0.9 — beat still hasn't arrived.
    (ctx as unknown as { currentTime: number }).currentTime = 0.4;
    voice.update(0.9, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();

    // Frame at t=1.05 — beat 1.0 has passed → trigger fires.
    (ctx as unknown as { currentTime: number }).currentTime = 0.55;
    voice.update(1.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('later baton movement BEFORE the beat overwrites the pending trigger (last-pitch-wins)', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0]);
    voice.setBeatSnap(true);
    voice.setVelocity(0.5);

    // First aim: top of frame (high pitch) at t=0.3.
    voice.setPosition(0.5, 0.05);
    voice.update(0.3, D_MAJOR, 0.5);

    // Re-aim: bottom of frame (low pitch) at t=0.6 — still pre-beat.
    voice.setPosition(0.5, 0.95);
    voice.update(0.6, D_MAJOR, 0.5);

    // Beat 1.0 hits — exactly ONE note fires, and it's the low one.
    (ctx as unknown as { currentTime: number }).currentTime = 0.3;
    voice.update(1.01, D_MAJOR, 0.5);

    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
    // The last call's first argument is the played note name "MIDI-N".
    const playedNote = samplerTriggerAttackRelease.mock.calls[0]?.[0] as string;
    const playedMidi = Number(playedNote.replace('MIDI-', ''));
    // Bottom of frame → lowest pitch in the chord ladder = D3 (50) - 12 (octave shift mid X is 0) → 50.
    expect(playedMidi).toBe(50);
  });

  it('disabling snap drops any pending trigger', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0]);
    voice.setBeatSnap(true);
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    // Queue a trigger before the beat.
    voice.update(0.3, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();

    // Disable snap — pending should be dropped.
    voice.setBeatSnap(false);
    (ctx as unknown as { currentTime: number }).currentTime = 0.4;
    voice.update(1.05, D_MAJOR, 0.5);

    // Nothing should have fired from the queue.  No new motion either,
    // so no fresh trigger.  Total: 0 calls.
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('with snap ON but no beat timestamps, falls back to immediate trigger', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatSnap(true);
    // setBeatTimestamps NOT called → null
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    voice.update(0.5, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('onTransportStop drops any pending beat-snapped trigger', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0]);
    voice.setBeatSnap(true);
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    voice.update(0.3, D_MAJOR, 0.5);
    voice.onTransportStop();
    // Even after the beat passes, nothing fires.
    (ctx as unknown as { currentTime: number }).currentTime = 0.5;
    voice.update(1.05, D_MAJOR, 0.5);

    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });
});
