import { describe, it, expect, vi } from 'vitest';

// Minimal Tone mock so importing/constructing the engine doesn't touch real audio.
vi.mock('tone', () => {
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(), toDestination: vi.fn(() => node()), dispose: vi.fn(),
    gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
  });
  return {
    getDestination: vi.fn(() => node()), getTransport: vi.fn(() => node()),
    getContext: vi.fn(() => ({ rawContext: {} })), now: vi.fn(() => 0), start: vi.fn(), setContext: vi.fn(),
    MembraneSynth: vi.fn(() => node()), NoiseSynth: vi.fn(() => node()), MetalSynth: vi.fn(() => node()),
    Sampler: vi.fn(() => node()), Reverb: vi.fn(() => node()), Filter: vi.fn(() => node()), Gain: vi.fn(() => node()),
    PolySynth: vi.fn(() => node()), MonoSynth: vi.fn(() => node()), FMSynth: vi.fn(() => node()), Synth: vi.fn(() => node()),
    Frequency: vi.fn(() => ({ toNote: () => 'C4', toFrequency: () => 261.63 })),
  };
});

import { SongPresetEngine } from '../songs/SongPresetEngine';

interface EnginePrivate {
  masterGainNode: unknown;
  ctx: unknown;
  song: unknown;
  lastDownbeatIndex: number;
  updateBeatPulse(t: number): void;
}

function fakeMaster() {
  return {
    gain: {
      value: 0.8,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
  };
}

describe('SongPresetEngine mute vs beat-pulse', () => {
  it('does not pulse (un-mute) the master while muted, and resumes when unmuted', () => {
    const e = new SongPresetEngine();
    const g = fakeMaster();
    const priv = e as unknown as EnginePrivate;
    priv.masterGainNode = g;
    priv.ctx = { currentTime: 0 };
    priv.song = { downbeats: [0, 1, 2] };
    priv.lastDownbeatIndex = -1;

    // Muted: a downbeat must NOT bump the master back up.
    e.setMuted(true);
    priv.updateBeatPulse(1.5);
    expect(g.gain.setValueAtTime).not.toHaveBeenCalled();

    // Unmuted: the pulse resumes on a fresh downbeat.
    e.setMuted(false);
    priv.lastDownbeatIndex = -1;
    priv.updateBeatPulse(1.5);
    expect(g.gain.setValueAtTime).toHaveBeenCalled();
  });
});
