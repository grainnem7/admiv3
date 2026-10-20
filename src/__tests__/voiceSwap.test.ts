import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
// Voices that load like sampled ones: silent until `loaded` is set.
const made: { loaded: boolean; dispose: ReturnType<typeof vi.fn> }[] = [];
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    loaded = false;
    setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn();
    constructor() { made.push(this); }
    isReady(): boolean { return this.loaded; }
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

/**
 * Changing sound mid-piece (a scene's world, Evolve) must not leave a gap: a sampled
 * instrument is silent until its samples load, so the old one keeps playing until then.
 */
describe('engine — changing instrument without a gap', () => {
  beforeEach(() => { vi.useFakeTimers(); made.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
  const engine = () => {
    const e = new BoardSequencerEngine({
      bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
      noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
      faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, soundWorld: 'warm',
    });
    const p = e as unknown as { channelById: Map<string, ColourChannel>; voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>> };
    p.channelById = new Map(channels.map((c) => [c.id, c]));
    const entry = fakeVoiceEntry();
    p.voiceByChannel = new Map([['m', entry]]);
    return { e, entry };
  };

  it('the old instrument plays on until the new one has loaded, then rings out', () => {
    const { e, entry } = engine();
    const old = entry.voice;
    e.setSoundWorld('ambient');
    expect(made).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(entry.voice).toBe(old);              // still loading: the old one carries on
    made[0].loaded = true;
    vi.advanceTimersByTime(200);
    expect(entry.voice).toBe(made[0]);          // loaded: it takes over
    expect(old.dispose).not.toHaveBeenCalled(); // the old one rings out first
    vi.advanceTimersByTime(5000);
    expect(old.dispose).toHaveBeenCalled();
  });

  it('a second change while the first is loading replaces it', () => {
    const { e, entry } = engine();
    e.setSoundWorld('ambient');
    e.setSoundWorld('lofi');
    expect(made[0].dispose).toHaveBeenCalled();
    made[1].loaded = true;
    vi.advanceTimersByTime(200);
    expect(entry.voice).toBe(made[1]);
  });
});
