import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tone.js — full manual mock so no real AudioContext is created.
// This mirrors the pattern used by SongPresetEngine.headBop.test.ts but
// extends it to cover all the Tone constructors that buildVoices touches
// (SynthPlayer, EffectChainManager, etc.).
vi.mock('tone', () => {
  const fakeGain = () => ({
    value: 1,
    setTargetAtTime: vi.fn(),
    rampTo: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
  });
  // fakeNode must be declared as a named function so that start()/chain()/
  // toDestination() can return `self` for method chaining — Tone classes like
  // Chorus use `.start()` returning `this`, and SynthPlayer chains on that.
  function fakeNode(): Record<string, unknown> {
    const self: Record<string, unknown> = {
      connect: vi.fn(() => self),
      disconnect: vi.fn(),
      chain: vi.fn(() => self),
      toDestination: vi.fn(() => self),
      dispose: vi.fn(),
      gain: fakeGain(),
      wet: fakeGain(),
      set: vi.fn(() => self),
      // start/stop must return self so callers can chain (e.g. new Tone.Chorus(...).start())
      start: vi.fn(() => self),
      stop: vi.fn(() => self),
      triggerAttack: vi.fn(),
      triggerRelease: vi.fn(),
      triggerAttackRelease: vi.fn(),
      releaseAll: vi.fn(),
      bpm: { value: 120 },
      seconds: 0,
      maxPolyphony: 4,
      frequency: { value: 4000 },
      Q: { value: 0.7 },
      type: 'lowpass',
      depth: fakeGain(),
      delayTime: fakeGain(),
      bits: 8,
    };
    return self;
  }

  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return fakeNode();
  });

  const fakeTransport = {
    bpm: { value: 120 },
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
  };

  return {
    Sampler,
    MembraneSynth: vi.fn(() => fakeNode()),
    NoiseSynth: vi.fn(() => fakeNode()),
    MetalSynth: vi.fn(() => fakeNode()),
    PolySynth: vi.fn(() => fakeNode()),
    MonoSynth: vi.fn(() => fakeNode()),
    FMSynth: vi.fn(() => fakeNode()),
    AMSynth: vi.fn(() => fakeNode()),
    DuoSynth: vi.fn(() => fakeNode()),
    Synth: vi.fn(() => fakeNode()),
    Filter: vi.fn(() => fakeNode()),
    Gain: vi.fn(() => fakeNode()),
    Reverb: vi.fn(() => fakeNode()),
    Chorus: vi.fn(() => fakeNode()),
    FeedbackDelay: vi.fn(() => fakeNode()),
    Distortion: vi.fn(() => fakeNode()),
    BitCrusher: vi.fn(() => fakeNode()),
    Phaser: vi.fn(() => fakeNode()),
    Tremolo: vi.fn(() => fakeNode()),
    Compressor: vi.fn(() => fakeNode()),
    Frequency: vi.fn((midi: number) => ({
      toNote: () => `MIDI-${midi}`,
      toFrequency: () => 440,
    })),
    now: vi.fn(() => 0),
    start: vi.fn().mockResolvedValue(undefined),
    loaded: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({
      rawContext: {
        currentTime: 0,
        state: 'running',
        createGain: vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
          gain: {
            value: 1,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
          },
        })),
        createBiquadFilter: vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
          frequency: { value: 4000 },
          Q: { value: 0.7 },
          type: 'lowpass',
        })),
        decodeAudioData: vi.fn().mockResolvedValue({ duration: 10 }),
        destination: {},
        createBufferSource: vi.fn(() => ({
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          buffer: null,
          onended: null,
        })),
      },
    })),
    getTransport: vi.fn(() => fakeTransport),
    getDestination: vi.fn(() => fakeNode()),
    setContext: vi.fn(),
    connect: vi.fn(),
  };
});

import { SongPresetEngine } from '../songs/SongPresetEngine';
import { WalkVoice } from '../songs/voices/WalkVoice';
import type { SongConfig } from '../songs/songLibrary';

function makeMinimalSong(): SongConfig {
  return {
    id: 'test',
    title: 'Test',
    artist: 'Test',
    key: 'D Major',
    bpm: 120,
    timeSignature: '4/4',
    stems: { vocals: 'vocals.wav', drums: 'drums.wav', bass: 'bass.wav', other: 'other.wav' },
    stemMixer: {
      label: 'Mix',
      leftZone:   { vocals: 1, drums: 0, bass: 0, other: 0 },
      centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
      rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    },
    chordProgression: [
      { time: 0, notes: [50, 57, 62, 66], root: 50, name: 'D' },
    ],
    beats: [1, 2, 3, 4],
  };
}

// fetch() mock for stem URLs — return an empty array buffer.
// Use globalThis to avoid the `global` TS2304 error that affects test files
// without lib: ["ESNext"] in their tsconfig (same constraint as setup.ts).
(globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
}) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SongPresetEngine walk mode wiring', () => {
  it('creates a WalkVoice when a baton is set to walk mode after loadSong', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');

    // @ts-expect-error — voices is private; inspect for the test.
    const greenVoice = engine.voices.get('green');
    expect(greenVoice).toBeInstanceOf(WalkVoice);

    engine.dispose();
  });

  it('disposes the previous voice when switching from walk back to parameter', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const walkVoice = engine.voices.get('green');
    const disposeSpy = vi.spyOn(walkVoice as WalkVoice, 'dispose');

    engine.setBatonMode('green', 'parameter');
    expect(disposeSpy).toHaveBeenCalled();
    // @ts-expect-error — voices is private
    expect(engine.voices.get('green')).not.toBeInstanceOf(WalkVoice);

    engine.dispose();
  });

  it('respects walk mode for red/yellow/orange too', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    for (const role of ['red', 'yellow', 'orange'] as const) {
      engine.setBatonMode(role, 'walk');
      // @ts-expect-error — voices is private
      expect(engine.voices.get(role)).toBeInstanceOf(WalkVoice);
    }

    engine.dispose();
  });

  it('setBatonInstrument forwards to a live WalkVoice', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const voice = engine.voices.get('green') as WalkVoice;
    const setPresetSpy = vi.spyOn(voice, 'setPreset');

    engine.setBatonInstrument('green', 'strings');

    expect(setPresetSpy).toHaveBeenCalledWith('strings');
    engine.dispose();
  });

  it('switching mode preserves the instrument choice across walk/instrument/walk', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    engine.setBatonInstrument('green', 'strings');

    engine.setBatonMode('green', 'instrument');
    // @ts-expect-error — voices is private
    const instrumentVoice = engine.voices.get('green');
    // InstrumentVoice exposes getInstrumentKey()
    expect((instrumentVoice as unknown as { getInstrumentKey: () => string }).getInstrumentKey()).toBe('strings');

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const walkVoice = engine.voices.get('green') as WalkVoice;
    expect(walkVoice.getInstrumentKey()).toBe('strings');

    engine.dispose();
  });
});
