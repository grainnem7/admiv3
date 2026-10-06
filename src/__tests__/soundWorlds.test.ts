import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
// Each voice records what it was built to sound like.
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    sound: unknown;
    constructor(_ctx: unknown, sound: unknown) { this.sound = sound; }
    setBrightness = vi.fn();
    connect = vi.fn();
    dispose = vi.fn();
    play = vi.fn();
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { SOUND_WORLDS, voiceSpecFor } from '../audio/worlds/soundWorlds';
import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import {
  DEFAULT_BOARD_SEQUENCER_CONFIG, loadBoardSequencerConfig,
} from '../profiles/BoardSequencerConfig';

describe('voiceSpecFor', () => {
  it('a part the player gave an instrument keeps it, whatever the world', () => {
    expect(voiceSpecFor({ role: 'melody', instrument: 'clarinet' }, 'electronic')).toBe('clarinet');
  });

  it("a part without one plays the world's sound for its job", () => {
    expect(voiceSpecFor({ role: 'bass' }, 'lofi')).toEqual(SOUND_WORLDS.lofi.voices.bass);
    expect(voiceSpecFor({ role: 'chord', instrument: '' }, 'ambient')).toEqual(SOUND_WORLDS.ambient.voices.chord);
  });

  it('with no world, the old defaults', () => {
    expect(voiceSpecFor({ role: 'bass' }, 'none')).toBe('bassElectric');
    expect(voiceSpecFor({ role: 'melody' }, 'none')).toBe('electricPiano');
  });
});

describe('who gets worlds and phrases by default', () => {
  it('a new player starts with a world and phrases', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ soundWorld: 'warm', phrases: true });
  });

  it('a player saved before they existed is unchanged', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 8, cols: 8 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ soundWorld: 'none', phrases: false });
  });

  it('a saved choice survives', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ soundWorld: 'lofi', phrases: true }));
    expect(loadBoardSequencerConfig()).toMatchObject({ soundWorld: 'lofi', phrases: true });
  });
});

// ---- the engine's phrase path ----

const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() });

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, {
    voice: { play: ReturnType<typeof vi.fn>; sound?: unknown };
    gain: ReturnType<typeof fakeGain>; rev: ReturnType<typeof fakeGain>; del: ReturnType<typeof fakeGain>;
    revBase: number; delBase: number; toneBase: number;
  }>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  duckBus: ReturnType<typeof fakeGain> | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'p', kind: 'hue', role: 'melody', swatch: '#0f0', instrument: 'clarinet' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000' },
];

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
    phrases: true, soundWorld: 'warm', ...over,
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const entry = () => ({ voice: { play: vi.fn() }, gain: fakeGain(), rev: fakeGain(), del: fakeGain(), revBase: 0.18, delBase: 0, toneBase: 1 });
  p.voiceByChannel = new Map([['m', entry()], ['p', entry()]]);
  p.drumKit = { play: vi.fn() };
  p.duckBus = fakeGain();
  return { e, p };
}

describe('engine — phrase mode', () => {
  it('one drum counter keeps the groove going on beats where it has no counter', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 4, col: 0, colour: 'd' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    const beatsWithDrums = new Set(p.drumKit!.play.mock.calls.map((c) => Math.floor(c[2] as number)));
    expect(beatsWithDrums.size).toBe(8);
  });

  it('every phrase note lights the counter that started it, marked as a phrase', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 3, col: 2, colour: 'm' }]);
    p.fireStep(5, 5, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.length).toBeGreaterThan(0);
    for (const f of fired) expect(f).toMatchObject({ row: 3, col: 2, colour: 'm', origin: 'phrase' });
  });

  it('One note mode plays exactly the counters, as before', () => {
    const { e, p } = engine({ phrases: false });
    e.setActiveCells([{ row: 3, col: 2, colour: 'm' }]);
    p.fireStep(5, 5, 1, null);
    expect(e.drainFiredNotes()).toEqual([]);
  });

  it('changing world swaps the sound of a part with no instrument, never one the player picked', () => {
    const { e, p } = engine();
    const before = p.voiceByChannel.get('p')!.voice;
    e.setSoundWorld('electronic');
    expect(p.voiceByChannel.get('m')!.voice.sound).toEqual(SOUND_WORLDS.electronic.voices.melody);
    expect(p.voiceByChannel.get('p')!.voice).toBe(before);
  });
});
