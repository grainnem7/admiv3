import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0),
  immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];

const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 90, rows: 4, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
});

/** A gain node that records what it was asked to move towards. */
const fakeGain = () => ({ gain: { value: 0, setTargetAtTime: vi.fn() } });

interface Priv {
  reverbBus: ReturnType<typeof fakeGain>;
  delayBus: ReturnType<typeof fakeGain>;
  mix: ReturnType<typeof fakeGain>;
  voiceByChannel: Map<string, {
    voice: { setBrightness: ReturnType<typeof vi.fn> };
    gain: ReturnType<typeof fakeGain>;
    rev: ReturnType<typeof fakeGain>;
    del: ReturnType<typeof fakeGain>;
    revBase: number; delBase: number; toneBase: number;
  }>;
}

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.reverbBus = fakeGain();
  p.delayBus = fakeGain();
  p.mix = fakeGain();
  const voice = { setBrightness: vi.fn() };
  p.voiceByChannel = new Map([['m', {
    voice, gain: fakeGain(), rev: fakeGain(), del: fakeGain(),
    // The defaults a melody channel gets: some reverb, NO delay.
    revBase: 0.18, delBase: 0, toneBase: 1,
  }]]);
  return { e, p, voice };
}

const target = (g: ReturnType<typeof fakeGain>): number =>
  g.gain.setTargetAtTime.mock.calls.at(-1)?.[0] as number;

describe('control counters reaching the audio', () => {
  it('a delay counter adds delay even though no channel sends any', () => {
    const { e, p } = engine();
    e.setControlValues({ delay: 0.5 });
    // The whole point: a channel's delay send defaults to 0, so scaling it could never
    // introduce delay however far the counter is slid.
    expect(target(p.delayBus)).toBeCloseTo(0.5, 6);
  });

  it('a reverb counter at its top adds more reverb than having no counter', () => {
    const { e, p } = engine();
    e.setControlValues({ reverb: 0.6 });
    expect(target(p.reverbBus)).toBeCloseTo(0.6, 6);
  });

  it('a toggle switches its effect in and out', () => {
    const { e, p } = engine({ toggleAmount: 0.35 });
    e.setControlValues({}, { reverbToggle: true });
    expect(target(p.reverbBus)).toBeCloseTo(0.35, 6);
    e.setControlValues({}, { reverbToggle: false });
    expect(target(p.reverbBus)).toBe(0);
  });

  it('a fader beats its own toggle, so the two never fight', () => {
    const { e, p } = engine({ toggleAmount: 0.35 });
    e.setControlValues({ reverb: 0.5 }, { reverbToggle: true });
    expect(target(p.reverbBus)).toBeCloseTo(0.5, 6);
  });

  it('a control that is not there leaves its parameter exactly as it was', () => {
    const { e, p } = engine();
    e.setControlValues({ reverb: 0.4 });
    p.reverbBus.gain.setTargetAtTime.mockClear();
    e.setControlValues({});
    expect(p.reverbBus.gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it('the tone counter scales each channel’s own tone rather than replacing it', () => {
    const { e, voice, p } = engine();
    p.voiceByChannel.get('m')!.toneBase = 0.8;
    e.setControlValues({ tone: 0.5 });
    expect(voice.setBrightness).toHaveBeenLastCalledWith(0.4);
  });

  it('moving a channel’s own send slider is not undone by the next counter move', () => {
    const { e, p } = engine();
    e.setChannelDelaySend('m', 0.3);
    expect(p.voiceByChannel.get('m')!.delBase).toBe(0.3);
    e.setChannelTone('m', 0.5);
    expect(p.voiceByChannel.get('m')!.toneBase).toBe(0.5);
    // A later tone-counter move now scales the value the player chose.
    e.setControlValues({ tone: 0.5 });
    expect(p.voiceByChannel.get('m')!.voice.setBrightness).toHaveBeenLastCalledWith(0.25);
  });
});
