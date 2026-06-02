import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------
// Tone mock — copied from SongPresetEngine.headBop.test.ts so that
// `new SongPresetEngine()` and its voice graph construct under test.
// ---------------------------------------------------------------

const { kickTrigger, snareTrigger, hatTrigger, crashTrigger } = vi.hoisted(() => ({
  kickTrigger: vi.fn(),
  snareTrigger: vi.fn(),
  hatTrigger: vi.fn(),
  crashTrigger: vi.fn(),
}));

vi.mock('tone', () => {
  const fakeGain = () => ({
    value: 1,
    setTargetAtTime: vi.fn(),
    rampTo: vi.fn(),
  });
  const fakeNode = () => ({
    connect: vi.fn(() => fakeNode()),
    disconnect: vi.fn(),
    chain: vi.fn(),
    toDestination: vi.fn(() => fakeNode()),
    dispose: vi.fn(),
    gain: fakeGain(),
    wet: fakeGain(),
    set: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    bpm: { value: 100 },
    seconds: 0,
  });

  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return fakeNode();
  });

  const synthWith = (triggerSpy: ReturnType<typeof vi.fn>) =>
    vi.fn().mockImplementation(() => {
      const node = fakeNode();
      node.connect = vi.fn(() => node);
      node.triggerAttackRelease = triggerSpy;
      return node;
    });

  return {
    Sampler,
    MembraneSynth: synthWith(kickTrigger),
    NoiseSynth: vi.fn().mockImplementation(() => {
      const node = fakeNode();
      node.connect = vi.fn(() => node);
      node.triggerAttackRelease = snareTrigger;
      return node;
    }),
    MetalSynth: synthWith(crashTrigger),
    Reverb: vi.fn().mockImplementation(() => fakeNode()),
    Filter: vi.fn().mockImplementation(() => fakeNode()),
    Gain: vi.fn().mockImplementation(() => fakeNode()),
    PolySynth: vi.fn().mockImplementation(() => fakeNode()),
    MonoSynth: vi.fn().mockImplementation(() => fakeNode()),
    FMSynth: vi.fn().mockImplementation(() => fakeNode()),
    Synth: vi.fn().mockImplementation(() => fakeNode()),
    Frequency: vi.fn(() => ({ toNote: () => 'C4', toFrequency: () => 261.63 })),
    getDestination: vi.fn(() => fakeNode()),
    getTransport: vi.fn(() => fakeNode()),
    getContext: vi.fn(() => ({ rawContext: {} })),
    now: vi.fn(() => 0),
    start: vi.fn(),
    setContext: vi.fn(),
  };
});

void hatTrigger;
void kickTrigger;
void snareTrigger;
void crashTrigger;

import { SongPresetEngine } from '../songs/SongPresetEngine';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SongPresetEngine surface press', () => {
  it('setSurfacePressEnabled and config are safe no-ops before a song loads', () => {
    const engine = new SongPresetEngine();
    expect(() => {
      engine.setSurfacePressEnabled(true);
      engine.setSurfacePressConfig({ buttons: [{ id: 'press-1', instrumentKey: 'piano' }] });
      engine.pressSurfaceButton('press-1', 0.8); // no chord/voice yet → must not throw
      engine.releaseSurfaceButton('press-1');
    }).not.toThrow();
  });

  it('mirrors a noteOff only when a note was actually held', () => {
    const engine = new SongPresetEngine();
    const events: string[] = [];
    engine.onSurfaceNote = (e) => events.push(e.action);
    engine.setSurfacePressEnabled(true);
    engine.setSurfacePressConfig({ buttons: [{ id: 'press-1', instrumentKey: 'piano' }] });
    // No chord loaded → press produces no note → release must not emit a noteOff.
    engine.pressSurfaceButton('press-1', 0.8);
    engine.releaseSurfaceButton('press-1');
    expect(events).not.toContain('noteOff');
  });
});
