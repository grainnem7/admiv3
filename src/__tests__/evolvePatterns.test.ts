import { describe, it, expect, vi } from 'vitest';
import { phraseEventsAtStep, type PhraseCell, type PhraseInput } from '../songs/phrases/phrases';

const cells: PhraseCell[] = [
  { role: 'drums', row: 4, col: 0, colour: 'd' },
  { role: 'bass', row: 7, col: 0, colour: 'b' },
  { role: 'melody', row: 3, col: 0, colour: 'm' },
  { role: 'chord', row: 6, col: 0, colour: 'c' },
];
const loop = (variant: number, busy: number) => JSON.stringify(Array.from({ length: 8 }, (_, step) => phraseEventsAtStep({
  cells, rows: 8, rootMidi: 60, semitones: [0, 2, 4, 7, 9], style: 'warm',
  stepFor: () => step, loopFor: () => 8, evolveOf: () => ({ variant, busy }),
} as PhraseInput)));
const part = (role: string, variant: number, busy = 0) =>
  JSON.stringify(JSON.parse(loop(variant, busy)).map((events: { role: string }[]) => events.filter((e) => e.role === role)));

describe('Evolve reaches the patterns', () => {
  it('no variation = exactly the phrases as before', () => {
    expect(loop(0, 0)).toBe(JSON.stringify(Array.from({ length: 8 }, (_, step) => phraseEventsAtStep({
      cells, rows: 8, rootMidi: 60, semitones: [0, 2, 4, 7, 9], style: 'warm', stepFor: () => step, loopFor: () => 8,
    }))));
  });

  it('a new scene gives the melody another motif, and bass and chords their other pattern', () => {
    expect(part('melody', 1)).not.toBe(part('melody', 0));
    expect(part('bass', 1)).not.toBe(part('bass', 0));
    expect(part('chord', 1)).not.toBe(part('chord', 0));
  });

  it('drums get busier or sparser', () => {
    const hits = (busy: number) => JSON.parse(part('drums', 0, busy)).flat().length;
    expect(hits(1)).toBeGreaterThan(hits(0));
    expect(hits(-1)).toBeLessThan(hits(0));
  });
});

// ---- the engine: drums and the fill move with the scenes ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn();
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() });
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000' },
];
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, unknown>;
  drumKit: { play: ReturnType<typeof vi.fn>; setFixedVariant: ReturnType<typeof vi.fn> };
  drumRev: ReturnType<typeof fakeGain>;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, soundWorld: 'warm',
    fillEngine: 'rules',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', {
    voice: { play: vi.fn(), setBrightness: vi.fn(), connect: vi.fn(), dispose: vi.fn() },
    gain: fakeGain(), rev: fakeGain(), del: fakeGain(), revBase: 0.2, delBase: 0, toneBase: 1,
  }]]);
  p.drumKit = { play: vi.fn(), setFixedVariant: vi.fn() };
  p.drumRev = fakeGain();
  e.setActiveCells([{ row: 7, col: 0, colour: 'm' }, { row: 2, col: 2, colour: 'm' }, { row: 7, col: 0, colour: 'd' }]);
  return { e, p };
}

describe('engine — Evolve moves the drums and the fill on', () => {
  it('each scene picks another kick and snare, and gives the kit some room', () => {
    const { e, p } = engine();
    e.setEvolve({ amount: 1, sceneLoops: 1, seed: 3, holdLap: null });
    for (let lap = 0; lap < 6; lap++) p.fireStep(lap * 4, lap * 4, 1, null);
    const variants = p.drumKit.setFixedVariant.mock.calls.map((c) => c[0]);
    expect(variants[0]).toBeNull();                       // scene 0: the kit as it was
    expect(new Set(variants.filter((v) => v !== null)).size).toBeGreaterThan(1);
    expect(p.drumRev.gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeGreaterThan(0);
  });

  it('the fill has a fresh idea in each scene', () => {
    const { e, p } = engine();
    e.setFill(1, 9, null);
    e.setEvolve({ amount: 1, sceneLoops: 1, seed: 3, holdLap: null });
    const ideas = new Set<string>();
    for (let lap = 0; lap < 6; lap++) {
      p.fireStep(lap * 4, lap * 4, 1, null);
      ideas.add(JSON.stringify(e.getFillNotes()));
    }
    expect(ideas.size).toBeGreaterThan(1);
  });

  it('a kept fill stays put through the scenes', () => {
    const { e, p } = engine();
    e.setFill(1, 9, null);
    p.fireStep(0, 0, 1, null);
    const kept = e.getFillNotes();
    e.setFill(1, 9, kept);
    e.setEvolve({ amount: 1, sceneLoops: 1, seed: 3, holdLap: null });
    for (let lap = 1; lap < 5; lap++) p.fireStep(lap * 4, lap * 4, 1, null);
    expect(e.getFillNotes()).toBe(kept);
  });
});
