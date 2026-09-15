import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, FIRED_NOTE_CAP, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000' },
];
const baseCfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
});

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(baseCfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const play = vi.fn();
  p.voiceByChannel = new Map([['m', { voice: { play } }]]);
  p.drumKit = { play: vi.fn() };
  return { e, p, play };
}

const cell = (row: number, col: number, colour: string, conditional?: boolean): ActiveCell =>
  (conditional ? { row, col, colour, conditional } : { row, col, colour });

afterEach(() => vi.restoreAllMocks());

describe('fired-note log', () => {
  it('records exactly the cells on this beat, with the scheduled time', () => {
    const { e, p } = engine();
    e.setActiveCells([cell(0, 2, 'm'), cell(1, 5, 'm'), cell(3, 2, 'd')]);
    p.fireStep(2, 7.5, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.map((f) => `${f.row},${f.col},${f.colour},${f.source}`).sort()).toEqual(['0,2,m,live', '3,2,d,live']);
    expect(fired.every((f) => f.audioTime === 7.5)).toBe(true);
    expect(e.drainFiredNotes()).toEqual([]);
  });

  it('respects the per-role polyrhythm loop length', () => {
    const { e, p } = engine({ loopStepsRed: 3 });
    e.setActiveCells([cell(0, 2, 'm'), cell(0, 5, 'm')]);
    p.fireStep(5, 1, 1, null);
    expect(e.drainFiredNotes().map((f) => f.col)).toEqual([2]);
  });

  it('records a conditional cell only on variation laps', () => {
    const { e, p } = engine({ cols: 4 });
    e.setActiveCells([cell(0, 0, 'm', true)]);
    p.fireStep(0, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(0);
    p.fireStep(4, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(1);
  });

  it('does not record humanize-skipped notes', () => {
    const { e, p } = engine({ humanize: 1 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    e.setActiveCells([cell(0, 0, 'm')]);
    p.fireStep(0, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(0);
  });

  it('records nothing while muted', () => {
    const { e, p } = engine();
    e.setMuted(true);
    e.setActiveCells([cell(0, 0, 'm')]);
    p.fireStep(0, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(0);
  });

  it('tags page-snapshot cells as page and loop-bank cells as loop', () => {
    const { e, p } = engine({ numPages: 2, cols: 4 });
    e.setSelectedPage(0);
    e.setPages([[], [cell(0, 0, 'm')]]);
    p.fireStep(4, 1, 1, null);
    expect(e.drainFiredNotes().map((f) => f.source)).toEqual(['page']);
    e.setActiveLoops([[cell(1, 0, 'm')]]);
    p.fireStep(8, 1, 1, null);
    expect(e.drainFiredNotes().map((f) => f.source)).toEqual(['loop']);
  });

  it('caps the buffer and clears on stop', () => {
    const { e, p } = engine({ cols: 1 });
    e.setActiveCells([cell(0, 0, 'm')]);
    for (let b = 0; b < FIRED_NOTE_CAP + 10; b++) p.fireStep(b, b, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(FIRED_NOTE_CAP);
    p.fireStep(0, 0, 1, null);
    e.stop();
    expect(e.drainFiredNotes()).toHaveLength(0);
  });
});
