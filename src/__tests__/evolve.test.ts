import { describe, it, expect, vi } from 'vitest';
import { describeEvolve, evolveState, NEUTRAL, type EvolveInput } from '../audio/evolve/evolve';

const input = (over: Partial<EvolveInput> = {}): EvolveInput => ({
  colour: 'c1', role: 'melody', lap: 0, seed: 11, amount: 0.8, sceneLoops: 4, world: 'warm', ownInstrument: false, ...over,
});

describe('evolveState', () => {
  it('amount 0 is exactly the sound without Evolve', () => {
    expect(evolveState(input({ amount: 0, lap: 37 }))).toEqual(NEUTRAL);
  });

  it('starts on the part\'s own sound, then moves', () => {
    const start = evolveState(input({ lap: 0 }));
    expect(start.brightness).toBeCloseTo(1, 9);
    expect(start.voice?.name).toBe('Piano');
    const later = Array.from({ length: 40 }, (_, lap) => evolveState(input({ lap })));
    expect(new Set(later.map((s) => s.brightness.toFixed(3))).size).toBeGreaterThan(10);
  });

  it('changes instrument only at a scene change', () => {
    for (let lap = 0; lap < 40; lap++) {
      const a = evolveState(input({ lap }));
      const b = evolveState(input({ lap: lap + 1 }));
      if (a.scene === b.scene) expect(b.voice?.name).toBe(a.voice?.name);
    }
    const names = new Set(Array.from({ length: 80 }, (_, lap) => evolveState(input({ lap })).voice?.name));
    expect(names.size).toBeGreaterThan(1);
  });

  it('drifts smoothly: no jump in brightness from one loop to the next', () => {
    for (let lap = 0; lap < 60; lap++) {
      const a = evolveState(input({ lap })).brightness;
      const b = evolveState(input({ lap: lap + 1 })).brightness;
      expect(Math.abs(b - a)).toBeLessThan(0.35);
    }
  });

  it('never swaps an instrument the player chose, but still drifts it', () => {
    const states = Array.from({ length: 40 }, (_, lap) => evolveState(input({ lap, ownInstrument: true })));
    expect(states.every((s) => s.voice === null)).toBe(true);
    expect(states.some((s) => Math.abs(s.brightness - 1) > 0.05)).toBe(true);
  });

  it('with no sound world (My picks) nothing is swapped', () => {
    expect(Array.from({ length: 40 }, (_, lap) => evolveState(input({ lap, world: 'none' }))).every((s) => s.voice === null)).toBe(true);
  });

  it('never moves the bass up or down an octave', () => {
    expect(Array.from({ length: 80 }, (_, lap) => evolveState(input({ lap, role: 'bass' }))).every((s) => s.octave === 0)).toBe(true);
  });

  it('is the same every time for the same seed and loop, and another seed takes another path', () => {
    expect(evolveState(input({ lap: 21 }))).toEqual(evolveState(input({ lap: 21 })));
    const path = (seed: number) => JSON.stringify(Array.from({ length: 20 }, (_, lap) => evolveState(input({ lap, seed })).brightness));
    expect(path(1)).not.toBe(path(2));
  });

  it('different colours take different paths', () => {
    const path = (colour: string) => JSON.stringify(Array.from({ length: 20 }, (_, lap) => evolveState(input({ lap, colour })).reverb));
    expect(path('c1')).not.toBe(path('c2'));
  });

  it('says what it sounds like in plain words', () => {
    expect(describeEvolve({ ...NEUTRAL, brightness: 1.25, reverb: 1.8, octave: 1 }, 'Piano')).toBe('Piano, bright, spacious, high');
  });
});

// ---- the engine follows it ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    sound: unknown;
    constructor(_c: unknown, sound: unknown) { this.sound = sound; }
    setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn();
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() });
const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, {
    voice: { play: ReturnType<typeof vi.fn>; setBrightness: ReturnType<typeof vi.fn>; sound?: unknown };
    gain: ReturnType<typeof fakeGain>; rev: ReturnType<typeof fakeGain>; del: ReturnType<typeof fakeGain>;
    revBase: number; delBase: number; toneBase: number;
  }>;
  drumKit: null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, soundWorld: 'warm',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', {
    voice: { play: vi.fn(), setBrightness: vi.fn() }, gain: fakeGain(), rev: fakeGain(), del: fakeGain(),
    revBase: 0.2, delBase: 0, toneBase: 1,
  }]]);
  p.drumKit = null;
  e.setActiveCells([{ row: 3, col: 0, colour: 'm' }]);
  return { e, p };
}

describe('engine — Evolve', () => {
  it('changes the colour\'s instrument as scenes go by, and says what it is', () => {
    const { e, p } = engine();
    e.setEvolve({ amount: 0.9, sceneLoops: 1, seed: 11, holdLap: null });
    const sounds = new Set<string>();
    for (let lap = 0; lap < 24; lap++) {
      p.fireStep(lap * 4, lap * 4, 1, null);
      sounds.add(e.getEvolveLabels().get('m')!.label.split(',')[0]);
    }
    expect(sounds.size).toBeGreaterThan(1);
  });

  it('Hold keeps the sound of one loop', () => {
    const { e, p } = engine();
    e.setEvolve({ amount: 0.9, sceneLoops: 1, seed: 11, holdLap: 5 });
    p.fireStep(0, 0, 1, null);
    const held = e.getEvolveLabels().get('m')!.label;
    for (let lap = 1; lap < 12; lap++) p.fireStep(lap * 4, lap * 4, 1, null);
    expect(e.getEvolveLabels().get('m')!.label).toBe(held);
  });

  it('off, a loop sounds exactly as before', () => {
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);
    // Row 3 of 8 is scale step 4: A above middle C in C major pentatonic, no octave move.
    const [midi] = p.voiceByChannel.get('m')!.voice.play.mock.calls[0];
    expect(midi).toBe(69);
    expect(p.voiceByChannel.get('m')!.voice.sound).toBeUndefined(); // the voice was never swapped
    expect(e.getEvolveLabels().get('m')!.label).toBe('Warm');
  });
});
