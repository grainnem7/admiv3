import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
const made: unknown[] = [];
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    constructor(_ctx: unknown, spec: unknown) { made.push(spec); }
    setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true;
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const channels: ColourChannel[] = [
  { id: 'green', kind: 'hue', role: 'melody', swatch: '#0f0', instrument: 'piano' },
  { id: 'black', kind: 'black', role: 'drums', swatch: '#000' },
];
const loopChannels: ColourChannel[] = [
  { id: 'loop:melody:violin', kind: 'hue', role: 'melody', swatch: '#9a9a9a', instrument: 'violin', changes: false, plays: 'note' },
  { id: 'loop:drums:snare', kind: 'hue', role: 'drums', swatch: '#9a9a9a', drum: 'snare', changes: false, plays: 'note' },
];
const baseCfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
});

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  mix: unknown; duckBus: unknown; reverbBus: unknown; delayBus: unknown;
  ctx: { createGain(): unknown };
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

const gainNode = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });

function engine() {
  const e = new BoardSequencerEngine(baseCfg());
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const play = vi.fn();
  p.voiceByChannel = new Map([['green', fakeVoiceEntry(play)]]);
  p.drumKit = { play: vi.fn() };
  p.mix = gainNode(); p.duckBus = gainNode(); p.reverbBus = gainNode(); p.delayBus = gainNode();
  p.ctx = { createGain: gainNode };
  return { e, p, play };
}

const cell = (row: number, col: number, colour: string): ActiveCell => ({ row, col, colour });

afterEach(() => { vi.restoreAllMocks(); made.length = 0; });

describe('a launched loop plays through its own loop colours', () => {
  it('fires a melody loop colour as melody, from a voice made for it, with source loop', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels);
    expect(made).toContainEqual('violin');
    const entry = p.voiceByChannel.get('loop:melody:violin');
    expect(entry).toBeDefined();
    p.fireStep(2, 7.5, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ colour: 'loop:melody:violin', role: 'melody', source: 'loop', row: 1, col: 2 });
    expect(entry?.voice.play).toHaveBeenCalled();
  });

  it('fires a drum loop colour as its kit piece', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(3, 2, 'loop:drums:snare')]], loopChannels);
    p.fireStep(2, 7.5, 1, null);
    expect(p.drumKit?.play).toHaveBeenCalledWith('snare', expect.any(Number), expect.any(Number));
    expect(e.drainFiredNotes()[0]).toMatchObject({ colour: 'loop:drums:snare', drum: 'snare', source: 'loop' });
  });

  it('the player changing green to another sound does not touch the loop’s voice', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels);
    made.length = 0;
    e.setChannels([{ ...channels[0], instrument: 'harp' }, channels[1]]);
    expect(made).toEqual(['harp']);
    expect(p.channelById.get('loop:melody:violin')?.instrument).toBe('violin');
    expect(p.channelById.get('green')?.instrument).toBe('harp');
  });

  it('setChannels makes a voice for a melodic colour it has none for', () => {
    const { e, p } = engine();
    e.setChannels([...channels, { id: 'blue', kind: 'hue', role: 'bass', swatch: '#00f', instrument: 'tuba' }]);
    expect(made).toContainEqual('tuba');
    expect(p.voiceByChannel.has('blue')).toBe(true);
  });

  it('while the clock runs, a loop that is no longer wanted keeps its colours until its fade ends', () => {
    const { e, p } = engine();
    const priv = e as unknown as Priv & { timer: unknown; launched: { slot: number }[]; pendingLaunch: unknown };
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels);
    priv.timer = {}; // the clock is running: changes land at the next pass
    e.setLaunchedLoops([], [], []);
    // Not yet applied: the loop is still launched, and must still be playable.
    expect(priv.launched.map((l) => l.slot)).toEqual([0]);
    expect(p.channelById.has('loop:melody:violin')).toBe(true);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(1);
  });

  it('a loop keeps playing after its fade-in ends, and after a colour change rebuilds the index', () => {
    const { e, p } = engine();
    (e as unknown as { timer: unknown }).timer = {};
    e.setLaunchFade(8);
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels);
    for (let beat = 0; beat <= 9; beat++) p.fireStep(beat, beat, 1, null); // lands at 0, fades in over 8 beats
    e.drainFiredNotes();
    e.setChannels([...channels]); // any colour-card change rebuilds the index
    p.fireStep(10, 10, 1, null);
    expect(e.drainFiredNotes().map((f) => f.colour)).toEqual(['loop:melody:violin']);
  });

  it('a leaving loop sounds through its fade-out, then its colours go', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels); // playing, no fade
    (e as unknown as { timer: unknown }).timer = {};
    e.setLaunchFade(8);
    e.setLaunchedLoops([], [], []);
    p.fireStep(8, 8, 1, null); // the boundary: the fade-out starts
    p.fireStep(10, 10, 1, null);
    expect(e.drainFiredNotes().map((f) => f.colour)).toEqual(['loop:melody:violin']);
    for (let beat = 11; beat <= 16; beat++) p.fireStep(beat, beat, 1, null); // the fade-out ends at 16
    expect(p.channelById.has('loop:melody:violin')).toBe(false);
  });

  it('a World change gives a default-sound loop the new World’s sound; a loop kept as violin stays violin', () => {
    const { e, p } = engine();
    const plain: ColourChannel = { id: 'loop:melody:', kind: 'hue', role: 'melody', swatch: '#9a9a9a', instrument: '', changes: false, plays: 'note' };
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:'), cell(2, 2, 'loop:melody:violin')]], [plain, loopChannels[0]]);
    (p as unknown as { applyDrumColour(): void }).applyDrumColour = () => {};
    made.length = 0;
    e.setSoundWorld('electronic');
    expect(made.some((spec) => typeof spec === 'object')).toBe(true); // the world's layered voice for the plain loop
    expect(made).not.toContain('violin');
  });

  it('a drums loop builds the kit even when today has no drum colour and no band', () => {
    const { e, p } = engine();
    p.drumKit = null;
    const build = vi.spyOn(e as unknown as { buildDrumKit(): Promise<void> }, 'buildDrumKit').mockResolvedValue(undefined);
    e.setLaunchedLoops([0], [[cell(3, 2, 'loop:drums:snare')]], loopChannels);
    expect(build).toHaveBeenCalled();
  });

  it('a stopped loop’s colours are forgotten; the player’s stay', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin')]], loopChannels);
    e.setLaunchedLoops([], [], []);
    expect(p.channelById.has('loop:melody:violin')).toBe(false);
    expect(p.channelById.has('green')).toBe(true);
  });
});
