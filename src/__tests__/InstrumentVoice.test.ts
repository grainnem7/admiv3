import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------
// Tone.js mock — Tone.Sampler is the playback path InstrumentVoice
// uses via SamplerPlayer.  The mocks expose the spies on a shared
// __mocks export so individual tests can assert call patterns.
// ---------------------------------------------------------------

const samplerTriggerAttackRelease = vi.fn();
const samplerReleaseAll = vi.fn();
const samplerDispose = vi.fn();
const samplerConnect = vi.fn();

vi.mock('tone', () => {
  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    // Fire onload synchronously so SamplerPlayer.isReady() returns true
    // immediately — otherwise update() short-circuits before triggering.
    opts.onload?.();
    return {
      connect: samplerConnect,
      triggerAttack: vi.fn(),
      triggerAttackRelease: samplerTriggerAttackRelease,
      triggerRelease: vi.fn(),
      releaseAll: samplerReleaseAll,
      dispose: samplerDispose,
    };
  });

  return {
    Sampler,
    // toNote() returns the raw MIDI number as a string we can parse
    // back out in assertions.  Real Tone.Frequency would return
    // something like "C4" — the test only cares about pitch order,
    // not the exact note name, so this simplification is fine.
    Frequency: vi.fn((midi: number) => ({
      toNote: () => `MIDI-${midi}`,
      toFrequency: () => 440,
    })),
    now: vi.fn(() => 0),
  };
});

/** Extract the MIDI number from a mocked-toNote() string. */
function midiFromNote(note: unknown): number {
  if (typeof note !== 'string') return NaN;
  const m = note.match(/^MIDI-(-?\d+)$/);
  return m ? Number(m[1]) : NaN;
}

import { InstrumentVoice } from '../songs/voices/InstrumentVoice';
import type { ChordEntry } from '../songs/voices/chordLookup';

// ---------------------------------------------------------------
// Fake AudioContext — just enough surface for ToneVoiceBase to
// construct its gain + filter graph without crashing.
// ---------------------------------------------------------------

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
  const ctx = {
    currentTime: 0,
    state: 'running' as const,
    createGain: vi.fn(() => makeFakeNode()),
    createBiquadFilter: vi.fn(() => makeFakeNode()),
  };
  return ctx as unknown as AudioContext;
}

// A simple D-major chord voicing used by most tests.
const D_MAJOR: ChordEntry = {
  time: 0,
  notes: [50, 57, 62, 66],
  root: 50,
  name: 'D',
};

const A_MAJOR: ChordEntry = {
  time: 0,
  notes: [57, 61, 64, 69],
  root: 45,
  name: 'A',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InstrumentVoice — chord-tone selection', () => {
  it('triggers a note when the baton moves between zones', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade(); // bring fadeLevel above silence threshold
    voice.setPosition(0.5, 0.5);
    voice.setVelocity(0.5);

    // First update establishes the chord ladder and the zone; no trigger
    // yet because lastZoneIndex starts at -1 and crosses to the new zone.
    voice.update(0, D_MAJOR, 0.5);

    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('top of frame triggers a higher pitch than bottom', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    // Top of frame
    voice.setPosition(0.5, 0.05);
    voice.update(0, D_MAJOR, 0.5);
    const topMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    samplerTriggerAttackRelease.mockClear();

    // Bottom of frame — advance ctx.currentTime past the cooldown window
    // by re-pointing the fake context.
    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.setPosition(0.5, 0.95);
    voice.update(1.0, D_MAJOR, 0.5);
    const bottomMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    expect(Number.isFinite(topMidi)).toBe(true);
    expect(Number.isFinite(bottomMidi)).toBe(true);
    expect(topMidi).toBeGreaterThan(bottomMidi);
  });

  it('every triggered pitch is drawn from the chord (or its octave above)', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    const validPitches = new Set([
      ...D_MAJOR.notes,
      ...D_MAJOR.notes.map((n) => n + 12),
    ]);

    // Sweep the baton across the full Y range, advancing time so each
    // trigger clears the cooldown gate.
    for (let i = 0; i < 8; i++) {
      (ctx as unknown as { currentTime: number }).currentTime = i * 0.5;
      voice.setPosition(0.5, i / 8);
      voice.update(i * 0.5, D_MAJOR, 0.5);
    }

    expect(samplerTriggerAttackRelease).toHaveBeenCalled();
    for (const call of samplerTriggerAttackRelease.mock.calls) {
      const midi = midiFromNote(call[0]);
      expect(validPitches.has(midi)).toBe(true);
    }
  });

  it('does not trigger when movement velocity is below the floor', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    voice.setPosition(0.5, 0.5);
    voice.update(0, D_MAJOR, 0.01); // below VELOCITY_TRIGGER_FLOOR (0.03)

    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('rebuilds the pitch ladder on chord change', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setPosition(0.5, 0.5);

    voice.update(0, D_MAJOR, 0.5);
    const firstMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);
    expect(D_MAJOR.notes.includes(firstMidi) || D_MAJOR.notes.map((n) => n + 12).includes(firstMidi)).toBe(true);

    samplerTriggerAttackRelease.mockClear();

    // Chord changes — even with the baton in the same position the new
    // ladder should immediately trigger a note drawn from A major's tones.
    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.update(1.0, A_MAJOR, 0.5);
    const secondMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);
    expect(A_MAJOR.notes.includes(secondMidi) || A_MAJOR.notes.map((n) => n + 12).includes(secondMidi)).toBe(true);
  });
});

describe('InstrumentVoice — X-axis octave register', () => {
  it('left X shifts the picked pitch down one octave from centre X', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    // Same Y, centre X
    voice.setPosition(0.5, 0.5);
    voice.update(0, D_MAJOR, 0.5);
    const centreMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    samplerTriggerAttackRelease.mockClear();

    // Same Y, left X — should retrigger 12 semitones lower
    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.setPosition(0.1, 0.5);
    voice.update(1.0, D_MAJOR, 0.5);
    const leftMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    expect(centreMidi - leftMidi).toBe(12);
  });

  it('right X shifts the picked pitch up one octave from centre X', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    voice.setPosition(0.5, 0.5);
    voice.update(0, D_MAJOR, 0.5);
    const centreMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    samplerTriggerAttackRelease.mockClear();

    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.setPosition(0.9, 0.5);
    voice.update(1.0, D_MAJOR, 0.5);
    const rightMidi = midiFromNote(samplerTriggerAttackRelease.mock.calls[0]?.[0]);

    expect(rightMidi - centreMidi).toBe(12);
  });

  it('crossing an X threshold retriggers a note even when Y is unchanged', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    voice.setPosition(0.5, 0.5);
    voice.update(0, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();

    samplerTriggerAttackRelease.mockClear();

    // Y stays put; X crosses into the right-octave zone — should fire.
    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.setPosition(0.85, 0.5);
    voice.update(1.0, D_MAJOR, 0.5);

    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });
});

describe('InstrumentVoice — velocity dynamics', () => {
  it('low velocity produces softer note velocity than high velocity', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();

    voice.setPosition(0.5, 0.2);
    voice.update(0, D_MAJOR, 0.1);
    const softVelocity = samplerTriggerAttackRelease.mock.calls[0]?.[3] as number;

    samplerTriggerAttackRelease.mockClear();

    (ctx as unknown as { currentTime: number }).currentTime = 1.0;
    voice.setPosition(0.5, 0.8);
    voice.update(1.0, D_MAJOR, 0.9);
    const loudVelocity = samplerTriggerAttackRelease.mock.calls[0]?.[3] as number;

    expect(loudVelocity).toBeGreaterThan(softVelocity);
  });
});

describe('InstrumentVoice — instrument swap', () => {
  it('setPreset disposes the old sampler and constructs a new one', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    expect(voice.getInstrumentKey()).toBe('piano');

    samplerDispose.mockClear();
    voice.setPreset('strings');

    expect(voice.getInstrumentKey()).toBe('strings');
    expect(samplerDispose).toHaveBeenCalledOnce();
  });

  it('setPreset is a no-op when the instrument is unchanged', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    samplerDispose.mockClear();

    voice.setPreset('piano');

    expect(samplerDispose).not.toHaveBeenCalled();
  });

  it('unknown instrument keys fall back to the default', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'not-a-real-instrument');
    // Default is 'piano' per palette.
    expect(voice.getInstrumentKey()).toBe('piano');
  });
});

describe('InstrumentVoice — lifecycle', () => {
  it('dispose releases all notes and disposes the sampler', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');

    voice.dispose();

    expect(samplerReleaseAll).toHaveBeenCalledOnce();
    expect(samplerDispose).toHaveBeenCalledOnce();
  });

  it('onTransportStop clears trigger state', () => {
    const ctx = makeFakeContext();
    const voice = new InstrumentVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setPosition(0.5, 0.5);
    voice.update(0, D_MAJOR, 0.5);

    samplerTriggerAttackRelease.mockClear();
    voice.onTransportStop();

    // After stop, the next update with the same chord+position should
    // fire a fresh trigger (because lastZoneIndex was reset).
    voice.setActive(true);
    voice.updateFade();
    voice.update(0.5, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalled();
  });
});
