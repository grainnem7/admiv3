import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared spy — captured at module level so trigger-logic tests can inspect it.
const samplerTriggerAttackRelease = vi.fn();

// Prevent Tone.js from instantiating a real AudioContext during module load.
// WalkVoice.ts imports SamplerPlayer which imports 'tone'; without this mock
// the test environment (jsdom) crashes on standardized-audio-context init.
vi.mock('tone', () => ({
  Sampler: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttack: vi.fn(),
      triggerAttackRelease: samplerTriggerAttackRelease,
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

import { walkStepNote, latestBeatIndexAtOrBefore, WalkVoice } from '../songs/voices/WalkVoice';
import type { ChordEntry } from '../songs/voices/chordLookup';

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

// ============================================================
// Trigger-logic helpers
// ============================================================

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
  notes: [50, 57, 62, 66], // D3, A3, D4, F#4 — already sorted ascending
  root: 50,
  name: 'D',
};

const A_MAJOR: ChordEntry = {
  time: 4,
  notes: [45, 52, 57, 61], // A2, E3, A3, C#4 — also sorted ascending
  root: 45,
  name: 'A',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalkVoice trigger logic', () => {
  function makeActiveVoice(): WalkVoice {
    const ctx = makeFakeContext();
    const voice = new WalkVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    voice.setPosition(0.5, 0.5); // mid Y
    return voice;
  }

  it('fires the first note on the first beat arrival when moving', () => {
    const voice = makeActiveVoice();
    // Pre-beat: no trigger.
    voice.update(0.5, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();

    // Beat 1.0 arrives: first walk-step note (n0 = 50) fires.
    voice.update(1.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
    const playedMidi = Number(
      String(samplerTriggerAttackRelease.mock.calls[0][0]).replace('MIDI-', ''),
    );
    expect(playedMidi).toBe(50);
  });

  it('plays the up-down pattern 50-57-62-66-62-57 across 6 beats', () => {
    const voice = makeActiveVoice();
    const expectedSequence = [50, 57, 62, 66, 62, 57];
    for (let i = 0; i < expectedSequence.length; i++) {
      voice.update(1.0 + i + 0.05, D_MAJOR, 0.5);
    }
    const played = samplerTriggerAttackRelease.mock.calls.map((call) =>
      Number(String(call[0]).replace('MIDI-', '')),
    );
    expect(played).toEqual(expectedSequence);
  });

  it('does not reset walkStep when the chord changes mid-cycle', () => {
    const voice = makeActiveVoice();
    // Beats 1, 2 with D major: plays 50, 57. walkStep is now 2.
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(
      samplerTriggerAttackRelease.mock.calls.map((c) =>
        Number(String(c[0]).replace('MIDI-', '')),
      ),
    ).toEqual([50, 57]);

    // Beat 3 with A major: walkStep 2 → A_MAJOR.notes[2] = 57 (A3).
    voice.update(3.05, A_MAJOR, 0.5);
    const calls3 = samplerTriggerAttackRelease.mock.calls;
    const lastCall3 = calls3[calls3.length - 1];
    const lastMidi = Number(String(lastCall3[0]).replace('MIDI-', ''));
    expect(lastMidi).toBe(57);
  });

  it('does not fire when velocity is below the trigger threshold', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, D_MAJOR, 0.02); // below default 0.04 threshold
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('fires at most one note per beat regardless of update call count', () => {
    const voice = makeActiveVoice();
    // 5 update calls all within the same beat.
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(1.1, D_MAJOR, 0.5);
    voice.update(1.5, D_MAJOR, 0.5);
    voice.update(1.9, D_MAJOR, 0.5);
    voice.update(1.99, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('is silent when no chord is loaded', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, null, 0.5);
    voice.update(2.05, null, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('fires the sidechain callback once per triggered note', () => {
    const voice = makeActiveVoice();
    const sidechain = vi.fn();
    voice.onNoteTrigger = sidechain;
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(sidechain).toHaveBeenCalledTimes(2);
  });

  it('transport restart re-fires on the first new beat after restart', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledTimes(2);

    voice.onTransportStop();
    voice.onTransportStart();

    // After restart, beat 1.0 should fire again (walkStep persists, so
    // the played note is the NEXT step in the cycle: 62).
    voice.update(1.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledTimes(3);
    const callsRestart = samplerTriggerAttackRelease.mock.calls;
    const lastCallRestart = callsRestart[callsRestart.length - 1];
    expect(Number(String(lastCallRestart[0]).replace('MIDI-', ''))).toBe(62);
  });

  it('is silent when no beat data is available', () => {
    const ctx = makeFakeContext();
    const voice = new WalkVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    // No setBeatTimestamps — beats is null.
    voice.setPosition(0.5, 0.5);
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('Y position drives note velocity within the instrument range', () => {
    // Piano palette entry has velocityRange { min: 0.35, max: 1.0 }.
    const voice = makeActiveVoice();

    // posY = 0 (top of frame) → loud → near max.
    voice.setPosition(0.5, 0.0);
    voice.update(1.05, D_MAJOR, 0.5);
    const loudVel = samplerTriggerAttackRelease.mock.calls[0][3] as number;
    expect(loudVel).toBeCloseTo(1.0, 2);

    // posY = 1 (bottom of frame) → soft → near min.
    voice.setPosition(0.5, 1.0);
    voice.update(2.05, D_MAJOR, 0.5);
    const softVel = samplerTriggerAttackRelease.mock.calls[1][3] as number;
    expect(softVel).toBeCloseTo(0.35, 2);

    // Movement speed is the SAME (0.5) for both calls — Y alone
    // accounts for the difference.
    expect(loudVel).toBeGreaterThan(softVel);
  });
});
