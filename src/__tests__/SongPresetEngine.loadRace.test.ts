import { describe, it, expect, vi, beforeEach } from 'vitest';

const deferred: Array<{ resolve: (v: Map<string, AudioBuffer>) => void }> = [];
vi.mock('../remix/loadStemBuffers', () => ({
  loadStemBuffers: vi.fn(() =>
    new Promise<Map<string, AudioBuffer>>((resolve) => { deferred.push({ resolve }); }),
  ),
}));
vi.mock('tone', () => {
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(), chain: vi.fn(), toDestination: vi.fn(() => node()),
    dispose: vi.fn(), start: vi.fn(), stop: vi.fn(), triggerAttackRelease: vi.fn(),
    gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), rampTo: vi.fn() },
    wet: { value: 1 }, set: vi.fn(), volume: { value: 0 },
  });
  return {
    start: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({
      rawContext: {
        currentTime: 0,
        state: 'running',
        destination: {},
        createGain: vi.fn(() => ({
          connect: vi.fn(), disconnect: vi.fn(),
          gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
        })),
        createBiquadFilter: vi.fn(() => ({
          connect: vi.fn(), disconnect: vi.fn(),
          frequency: { value: 4000 }, Q: { value: 0.7 }, type: 'lowpass',
        })),
        createBufferSource: vi.fn(() => ({
          connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), buffer: null, onended: null,
        })),
        decodeAudioData: vi.fn().mockResolvedValue({ duration: 10 }),
      },
    })),
    getTransport: vi.fn(() => ({ bpm: { value: 120 }, stop: vi.fn(), cancel: vi.fn(), start: vi.fn() })),
    getDestination: vi.fn(() => node()),
    now: vi.fn(() => 0), connect: vi.fn(), setContext: vi.fn(), loaded: vi.fn().mockResolvedValue(undefined),
    Sampler: vi.fn(() => node()), PolySynth: vi.fn(() => node()), MonoSynth: vi.fn(() => node()),
    FMSynth: vi.fn(() => node()), AMSynth: vi.fn(() => node()), DuoSynth: vi.fn(() => node()), Synth: vi.fn(() => node()),
    MembraneSynth: vi.fn(() => node()), NoiseSynth: vi.fn(() => node()), MetalSynth: vi.fn(() => node()),
    Reverb: vi.fn(() => node()), Filter: vi.fn(() => node()), Gain: vi.fn(() => node()), Chorus: vi.fn(() => node()),
    EQ3: vi.fn(() => node()), Compressor: vi.fn(() => node()), Limiter: vi.fn(() => node()), WaveShaper: vi.fn(() => node()),
    Player: vi.fn(() => node()), GrainPlayer: vi.fn(() => node()),
    Frequency: vi.fn(() => ({ toNote: () => 'C4', toFrequency: () => 261.63 })),
  };
});
vi.mock('../songs/analysisLoader', () => ({ loadSongAnalysis: vi.fn().mockResolvedValue({ chordProgression: [], beats: [], downbeats: [], harmony: [], bpm: 120 }) }));

import { SongPresetEngine } from '../songs/SongPresetEngine';
import { loadStemBuffers } from '../remix/loadStemBuffers';
import type { SongConfig } from '../songs/songLibrary';

function song(id: string): SongConfig {
  return { id, title: id, artist: 'A', key: 'C', bpm: 120, timeSignature: '4/4',
    stems: { mix: `${id}.mp3` }, stemMixer: { label: 'm', leftZone: {}, centerZone: {}, rightZone: {} } } as unknown as SongConfig;
}

beforeEach(() => { deferred.length = 0; vi.clearAllMocks(); });

describe('SongPresetEngine loadSong race', () => {
  it('a superseded load does not overwrite the newer song', async () => {
    const e = new SongPresetEngine();
    const pA = e.loadSong(song('A'));
    const pB = e.loadSong(song('B'));
    const buf = new Map([['mix', { duration: 3 } as AudioBuffer]]);
    // The stale load A is superseded at its very first await (`Tone.start`)
    // and bails before it ever calls loadStemBuffers — so only B parks a
    // stem load. (A returns early; pA resolves without touching engine state.)
    await vi.waitFor(() => expect(deferred.length).toBe(1));
    deferred[0].resolve(buf);
    await pB;
    await pA;
    // Capture B's freshly-built stem state. A stale A continuation that
    // ignored cancellation would have rebuilt `stems` and clobbered these.
    const stems = (e as unknown as { stems: Map<string, unknown> }).stems;
    expect((e as unknown as { song: SongConfig }).song.id).toBe('B');
    // Engine state belongs to B only: exactly one stem load occurred and the
    // stem map carries B's single 'mix' entry, undisturbed by the stale load.
    expect(loadStemBuffers).toHaveBeenCalledTimes(1);
    expect(stems.size).toBe(1);
    expect(stems.has('mix')).toBe(true);
  });
});
