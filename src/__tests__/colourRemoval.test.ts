import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true;
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import { keepCells, loopChannelsFor } from '../songs/performance/loopSounds';
import { colourUses, removalWarning, type ColourUses } from '../ui/screens/boardSequencer/colourRemoval';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { StoredLoopCell } from '../profiles/BoardSequencerConfig';

const green: ColourChannel = { id: 'green', kind: 'hue', role: 'melody', swatch: '#0f0', instrument: 'violin' };
const blue: ColourChannel = { id: 'blue', kind: 'hue', role: 'bass', swatch: '#00f', instrument: 'tuba' };

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  mix: unknown; duckBus: unknown; reverbBus: unknown; delayBus: unknown;
  ctx: { createGain(): unknown };
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
const gainNode = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });

/** The engine with today's colours: the board's colours after a removal. */
function engine(today: ColourChannel[], over: Partial<BoardEngineConfig> = {}): { e: BoardSequencerEngine; p: Priv } {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: today,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(today.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(today.map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  p.mix = gainNode(); p.duckBus = gainNode(); p.reverbBus = gainNode(); p.delayBus = gainNode();
  p.ctx = { createGain: gainNode };
  return { e, p };
}
const cell = (row: number, col: number, colour: string): ActiveCell => ({ row, col, colour });

afterEach(() => { vi.restoreAllMocks(); });

describe('removing a colour: what happens to loops and pages (T1-06)', () => {
  it('a loop kept with Keep plays on, with the sound it was kept with', () => {
    const kept = keepCells([cell(1, 2, 'green')], [green, blue]);
    // Green is removed: only blue is left today.
    const { e, p } = engine([blue]);
    const played = loopChannelsFor(kept, [blue]);
    e.setLaunchedLoops([0], [played.cells], played.channels);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes()).toEqual([expect.objectContaining({ colour: 'loop:melody:violin', source: 'loop' })]);
  });

  it('a loop note that knows only its colour (kept before, captured, or drawn by hand) goes quiet with it', () => {
    const older: StoredLoopCell[] = [{ row: 1, col: 2, colour: 'green' }];
    const { e, p } = engine([blue]);
    const played = loopChannelsFor(older, [blue]);
    e.setLaunchedLoops([0], [played.cells], played.channels);
    p.fireStep(2, 7.5, 1, null);
    expect(e.drainFiredNotes()).toEqual([]);
  });

  it('a counter saved on a page goes quiet with its colour', () => {
    const page = [cell(1, 2, 'green')];
    const before = engine([green, blue], { numPages: 2 });
    before.e.setPages([[], page]);
    before.p.fireStep(10, 10, 1, null); // the second page, step 3
    expect(before.e.drainFiredNotes()).toHaveLength(1);
    const after = engine([blue], { numPages: 2 });
    after.e.setPages([[], page]);
    after.p.fireStep(10, 10, 1, null);
    expect(after.e.drainFiredNotes()).toEqual([]);
  });
});

describe('the warning says exactly that (T1-06)', () => {
  const keptGreen = keepCells([cell(1, 2, 'green'), cell(2, 4, 'green')], [green]);
  const work = (loopSlots: (StoredLoopCell[] | null)[], loopNames: string[] = [], pages: ActiveCell[][] = []) => ({ loopSlots, loopNames, pages });

  it('finds, across players, the loops that play on, the notes that go quiet and the counters on pages', () => {
    const uses = colourUses([
      { player: null, work: work([keptGreen, [{ row: 0, col: 0, colour: 'green' }, { row: 0, col: 1, colour: 'blue' }]], ['Bed', '']) },
      { player: 'Kay', work: work([[{ row: 3, col: 3, colour: 'green' }]], ['Pulse'], [[cell(1, 1, 'green'), cell(1, 2, 'blue')]]) },
    ], new Set(['green']));
    expect(uses).toEqual<ColourUses>({ loopsPlayOn: true, quietNotes: 2, quietLoops: ['Loop 2', "Kay's Pulse"], pageCounters: 1 });
  });

  it('loops kept with Keep only: they play on, and nothing is said to go quiet', () => {
    const words = removalWarning('Green', colourUses([{ player: null, work: work([keptGreen]) }], new Set(['green'])));
    expect(words).toBe('It is removed for every player on this board. Loops keep the sounds they were made with, so they play on.');
    expect(words).not.toMatch(/quiet/);
  });

  it('one colour: the notes that go quiet are counted and their loops named, and so are the counters on pages', () => {
    const words = removalWarning('Green', { loopsPlayOn: true, quietNotes: 3, quietLoops: ['Bed', 'Loop 3'], pageCounters: 1 });
    expect(words).toBe('It is removed for every player on this board. 3 Green notes in Bed and Loop 3 will go quiet. '
      + 'Other loop notes keep their own sounds and play on. 1 Green counter saved on a page will go quiet.');
  });

  it('every colour: the same, without a colour', () => {
    const words = removalWarning(null, { loopsPlayOn: false, quietNotes: 1, quietLoops: ['Bed'], pageCounters: 4 });
    expect(words).toBe('Every colour is removed for every player on this board. 1 note in Bed will go quiet. '
      + '4 counters saved on pages will go quiet.');
  });

  it('a colour nothing saved uses: no warning about loops or pages', () => {
    expect(removalWarning('Green', { loopsPlayOn: false, quietNotes: 0, quietLoops: [], pageCounters: 0 }))
      .toBe('It is removed for every player on this board.');
  });
});
