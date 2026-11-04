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

describe('Calm / Busy, for the whole piece (spec 2026-11-04)', () => {
  const fired = (e: BoardSequencerEngine) => e.drainFiredNotes().map((f) => `${f.colour}@${f.col}`);

  it('Calm: the loops play only their notes on the main beats; the player’s own counters are untouched', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 1, 'loop:melody:violin'), cell(1, 2, 'loop:melody:violin')]], loopChannels);
    e.setActiveLoops([[cell(2, 1, 'green'), cell(2, 2, 'green')]]);
    e.setActiveCells([cell(3, 1, 'green')]);
    e.setFeel('calm');
    p.fireStep(1, 7.5, 1, null); // step 2 of the bar: between the main beats
    expect(fired(e)).toEqual(['green@1']); // only the live counter
    p.fireStep(2, 8.5, 1, null); // step 3: a main beat
    expect(fired(e).sort()).toEqual(['green@2', 'loop:melody:violin@2']);
    // Normal again: the loop's note between the main beats plays (alone, so no melody waits its turn).
    e.setActiveCells([]);
    e.setActiveLoops([]);
    e.setFeel('normal');
    p.fireStep(9, 15.5, 1, null);
    expect(fired(e)).toEqual(['loop:melody:violin@1']);
  });

  it('Calm: no Extra notes. Busy: Extra notes at least at half, around everything. Normal: the setting', () => {
    const { e } = engine();
    const amount = () => (e as unknown as { fillAmount: number }).fillAmount;
    e.setFill(0.3, 1, null);
    expect(amount()).toBeCloseTo(0.3);
    e.setFeel('calm');
    expect(amount()).toBe(0);
    e.setFeel('busy');
    expect(amount()).toBeCloseTo(0.5);
    e.setFill(0.8, 1, null);
    expect(amount()).toBeCloseTo(0.8);
    e.setFeel('normal');
    expect(amount()).toBeCloseTo(0.8);
    e.setFill(0, 1, null);
    expect(amount()).toBe(0);
  });
});

describe('Drums silent on the iPad: no drums from any loop, nor from the band (spec 2026-11-04, "Live only")', () => {
  it('a launched loop plays no drum note while drums are silent, and the rest of the loop plays on', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 2, 'loop:melody:violin'), cell(3, 2, 'loop:drums:snare')]], loopChannels);
    e.setSilentParts(['drums']);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes().map((f) => f.colour)).toEqual(['loop:melody:violin']);
    expect(p.drumKit?.play).not.toHaveBeenCalled();
    e.setSilentParts([]);
    p.fireStep(10, 15.5, 1, null);
    expect(e.drainFiredNotes().map((f) => f.colour).sort()).toEqual(['loop:drums:snare', 'loop:melody:violin']);
  });

  it("an older loop's drums, by its colour's job, and the loop bank's, are silent the same way", () => {
    const { e, p } = engine();
    e.setActiveLoops([[cell(1, 2, 'green'), cell(3, 2, 'black')]]);
    e.setLaunchedLoops([0], [[cell(2, 2, 'black')]], []);
    e.setSilentParts(['drums']);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes().map((f) => f.colour)).toEqual(['green']);
    expect(p.drumKit?.play).not.toHaveBeenCalled();
  });

  it("the band's drums are not played while drums are silent (it would step in otherwise); its other parts are", () => {
    const { e, p } = engine();
    const pad = vi.fn();
    const priv = p as unknown as Priv & { bandVoices: unknown; playBandEvent(ev: unknown, t: number, spb: number): void };
    priv.bandVoices = { pad: { play: pad }, bass: { play: vi.fn() }, lead: { play: vi.fn() } };
    e.setSilentParts(['drums']);
    priv.playBandEvent({ part: 'groove', offset: 0, dur: 0.25, accent: 0.8, drum: 'kick' }, 1, 0.5);
    priv.playBandEvent({ part: 'pad', offset: 0, dur: 1, accent: 0.6, midi: 60 }, 1, 0.5);
    expect(p.drumKit?.play).not.toHaveBeenCalled();
    expect(pad).toHaveBeenCalled();
    expect(e.drainFiredNotes().map((f) => f.colour)).toEqual(['band:pad']);
  });

  it('with Calm as well: the loops thinned to the main beats, and still no drums', () => {
    const { e, p } = engine();
    e.setLaunchedLoops([0], [[cell(1, 1, 'loop:melody:violin'), cell(1, 2, 'loop:melody:violin'), cell(3, 2, 'loop:drums:snare')]], loopChannels);
    e.setSilentParts(['drums']);
    e.setFeel('calm');
    p.fireStep(1, 6.5, 1, null);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes().map((f) => `${f.colour}@${f.col}`)).toEqual(['loop:melody:violin@2']);
  });
});
