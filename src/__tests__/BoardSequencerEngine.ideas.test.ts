import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeVoiceEntry } from './helpers/fakeVoiceEntry';

const magenta = vi.hoisted(() => ({
  status: 'failed' as 'idle' | 'loading' | 'ready' | 'failed',
  fill: vi.fn(),
}));

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));
vi.mock('../songs/generative/magentaFill', () => ({
  loadMagenta: vi.fn(() => Promise.resolve()),
  magentaFill: (...a: unknown[]) => magenta.fill(...a),
  magentaStatus: () => magenta.status,
}));

import { BoardSequencerEngine, type BoardEngineConfig, type FiredNote } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { BandJobs } from '../songs/band/bandJobs';
import type { KeptIdea } from '../songs/performance/ideas';
import type { FillNote } from '../songs/generative/rulesFill';

/**
 * The same AI each rehearsal (harmony spec, stage 3), in the engine: the band, the extra
 * notes, Sounds change and a loose groove are seeded by the piece's and the scene's ideas;
 * New ideas changes them; Surprise me makes every run its own; Magenta's ideas are kept.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ROWS = 8;
const COLS = 16;
const rowOf = (degree: number): number => ROWS - 1 - degree;
const ALL: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: true };
const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'hue', role: 'drums', swatch: '#000' },
];
const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: ROWS, cols: COLS, scaleRootMidi: 60, scaleSemitones: MAJOR, swing: 0, humanize: 0.4,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  soundWorld: 'warm', phrases: false, fillEngine: 'rules', chords: { sequence: 'rising', bars: 1 }, clashNudge: true,
  band: 'full', bandJobs: ALL, ...over,
});

const fakeGain = () => ({ gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });
interface Priv {
  timer: unknown;
  lastInternalBeat: number;
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  bandVoices: Record<string, unknown>;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

/** Tim's board: a melody, and a kick on the one. */
const BOARD: ActiveCell[] = [
  { row: rowOf(2), col: 0, colour: 'm' }, { row: rowOf(4), col: 3, colour: 'm' }, { row: rowOf(1), col: 6, colour: 'm' },
  { row: rowOf(5), col: 9, colour: 'm' }, { row: rowOf(3), col: 12, colour: 'm' },
  { row: ROWS - 1, col: 0, colour: 'd' },
];

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map(channels.filter((c) => c.role !== 'drums').map((c) => [c.id, fakeVoiceEntry()]));
  p.drumKit = { play: vi.fn() };
  const v = () => ({ play: vi.fn(), dispose: vi.fn() });
  p.bandVoices = { pad: v(), bass: v(), lead: v(), gain: fakeGain(), rev: fakeGain(), leadGain: fakeGain(), top: fakeGain() };
  e.setBand(over.band ?? 'full');
  return { e, p };
}

/** What a note was, without when on the audio clock: who, what pitch or drum, how hard. */
const describe1 = (b: number, n: FiredNote): string =>
  `${b}|${n.colour}|${n.origin}|${n.midi ?? n.midis?.join('+') ?? n.drum}|${(n.velocity ?? 0).toFixed(3)}`;

/** One run of a scene: its ideas, the extra notes and Sounds change on, `beats` beats from the start. */
function run(ideas: number | null, opts: { surprise?: boolean; beats?: number; extras?: boolean } = {}): string[] {
  const extras = opts.extras ?? true;
  // Without the extras, a straight groove too: only the band can vary.
  const { e, p } = engine(extras ? {} : { humanize: 0 });
  e.setSurprise(opts.surprise ?? false);
  if (ideas !== null) e.setIdeas({ seed: ideas, owner: 'scene-a' });
  e.setFill(extras ? 0.6 : 0, 1, null);
  e.setEvolve({ amount: extras ? 0.7 : 0, sceneLoops: 2, seed: 1, holdLap: null });
  e.setActiveCells(BOARD);
  const out: string[] = [];
  for (let b = 0; b < (opts.beats ?? 96); b++) {
    p.fireStep(b, b, 1, null);
    for (const n of e.drainFiredNotes()) out.push(describe1(b, n));
  }
  return out;
}
const part = (notes: string[], what: (n: string) => boolean): string[] => notes.filter(what);
const isBand = (n: string): boolean => n.includes('|band|');
const isFill = (n: string): boolean => n.includes('|fill|');
const isTim = (n: string): boolean => n.includes('|m|placed|');

beforeEach(() => {
  magenta.status = 'failed';
  magenta.fill.mockReset();
});

describe('the same AI each rehearsal', () => {
  it('two runs of the same scene give the same band, extra notes, Sounds change and loose groove', () => {
    const a = run(1234);
    const b = run(1234);
    expect(part(a, isBand).length).toBeGreaterThan(0);
    expect(part(a, isFill).length).toBeGreaterThan(0);
    expect(part(a, isTim).length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('New ideas changes them: the band, the extra notes and Tim’s wandering notes', () => {
    const a = run(1234);
    const b = run(98765);
    expect(part(b, isBand)).not.toEqual(part(a, isBand));
    expect(part(b, isFill)).not.toEqual(part(a, isFill));
    expect(part(b, isTim)).not.toEqual(part(a, isTim));
  });

  it('Surprise me each time: two runs of the same scene differ', () => {
    const a = run(1234, { surprise: true });
    const b = run(1234, { surprise: true });
    expect(part(b, isFill)).not.toEqual(part(a, isFill));
    expect(part(b, isTim)).not.toEqual(part(a, isTim));
  });

  it('no ideas (a piece saved before) is as before: the same as with no ideas set, and the band does not vary', () => {
    expect(run(0)).toEqual(run(null));
    // Pass by pass, the band plays the same with no ideas, and varies with them.
    const passes = (notes: string[]): string[][] => [2, 3, 4, 5].map((k) => part(notes, isBand)
      .filter((n) => Math.floor(Number(n.split('|')[0]) / COLS) === k)
      .map((n) => n.replace(/^\d+/, (b) => String(Number(b) % COLS)).replace(/\|[\d.]+$/, '')));
    const plain = passes(run(0, { extras: false }));
    for (const pass of plain) expect(pass).toEqual(plain[0]);
    const varied = passes(run(1234, { extras: false }));
    expect(varied.some((pass) => JSON.stringify(pass) !== JSON.stringify(varied[0]))).toBe(true);
  });

  it('a scene plays the same however it was reached: from the start, or landing on a later pass', () => {
    const alone = run(555, { beats: 48 });
    // Another scene first (other ideas), then this one lands on the pass at beat 32.
    const { e, p } = engine();
    e.setIdeas({ seed: 1, owner: 'scene-x' });
    e.setFill(0.6, 1, null);
    e.setEvolve({ amount: 0.7, sceneLoops: 2, seed: 1, holdLap: null });
    e.setActiveCells(BOARD);
    p.timer = 1; // playing
    const later: string[] = [];
    for (let b = 0; b < 32 + 48; b++) {
      if (b === 20) e.landOnNextPass({ ideas: { seed: 555, owner: 'scene-a' } });
      p.lastInternalBeat = b;
      p.fireStep(b, b, 1, null);
      for (const n of e.drainFiredNotes()) if (b >= 32) later.push(describe1(b - 32, n));
    }
    p.timer = null;
    const notBand = (n: string): boolean => !isBand(n);
    expect(part(later, notBand)).toEqual(part(alone, notBand));
  });
});

describe('Magenta’s ideas, kept per scene', () => {
  const aiNotes: FillNote[] = [
    { step: 2, offset: 0, role: 'melody', colour: 'm', midi: 74, dur: 0.5, accent: 0.7, cell: { row: 1, col: 2 }, rule: 'ai' },
    { step: 5, offset: 0.5, role: 'melody', colour: 'm', midi: 76, dur: 0.5, accent: 0.7, cell: { row: 1, col: 5 }, rule: 'ai' },
  ];
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('once made, an idea is kept for its scene, and the next run plays it without asking again', async () => {
    magenta.status = 'ready';
    magenta.fill.mockResolvedValue(aiNotes);
    const kept: { owner: string; idea: KeptIdea }[] = [];
    {
      const { e, p } = engine({ fillEngine: 'magenta' });
      e.setOnIdeaKept((owner, idea) => kept.push({ owner, idea }));
      e.setIdeas({ seed: 7, owner: 'open' });
      e.setFill(0.5, 1, null);
      e.setActiveCells(BOARD);
      for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
      await flush();
    }
    expect(magenta.fill).toHaveBeenCalledTimes(1);
    expect(kept).toHaveLength(1);
    expect(kept[0].owner).toBe('open');
    expect(kept[0].idea.notes).toEqual(aiNotes);

    // The next run: the scene's kept idea plays from its first pass, and Magenta is not asked.
    magenta.fill.mockClear();
    const { e, p } = engine({ fillEngine: 'magenta' });
    e.setKeptIdeas({}, new Map([['open', [kept[0].idea]]]));
    e.setIdeas({ seed: 7, owner: 'open' });
    e.setFill(0.5, 1, null);
    e.setActiveCells(BOARD);
    const fill: FiredNote[] = [];
    for (let b = 0; b < 16; b++) {
      p.fireStep(b, b, 1, null);
      fill.push(...e.drainFiredNotes().filter((n) => n.origin === 'fill'));
    }
    await flush();
    expect(magenta.fill).not.toHaveBeenCalled();
    expect(fill.map((n) => n.midi)).toEqual([74, 76]);
    expect(e.getFillStatus()).toBe('ai');
  });

  it('a kept idea plays even when Magenta can’t load at the show', async () => {
    magenta.status = 'ready';
    magenta.fill.mockResolvedValue(aiNotes);
    const kept: KeptIdea[] = [];
    {
      const { e, p } = engine({ fillEngine: 'magenta' });
      e.setOnIdeaKept((_owner, idea) => kept.push(idea));
      e.setIdeas({ seed: 7, owner: 'open' });
      e.setFill(0.5, 1, null);
      e.setActiveCells(BOARD);
      for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
      await flush();
    }
    magenta.status = 'failed';
    const { e, p } = engine({ fillEngine: 'magenta' });
    e.setKeptIdeas({}, new Map([['open', kept]]));
    e.setIdeas({ seed: 7, owner: 'open' });
    e.setFill(0.5, 1, null);
    e.setActiveCells(BOARD);
    const fill: FiredNote[] = [];
    for (let b = 0; b < 16; b++) {
      p.fireStep(b, b, 1, null);
      fill.push(...e.drainFiredNotes().filter((n) => n.origin === 'fill'));
    }
    expect(fill.map((n) => n.midi)).toEqual([74, 76]);
  });

  it('Surprise me: nothing is kept and nothing kept is played', async () => {
    magenta.status = 'ready';
    magenta.fill.mockResolvedValue(aiNotes);
    const kept: string[] = [];
    const { e, p } = engine({ fillEngine: 'magenta' });
    e.setOnIdeaKept((owner) => kept.push(owner));
    e.setSurprise(true);
    e.setIdeas({ seed: 7, owner: 'open' });
    e.setFill(0.5, 1, null);
    e.setActiveCells(BOARD);
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    await flush();
    expect(magenta.fill).toHaveBeenCalledTimes(1);
    expect(kept).toEqual([]);
  });

  it('plain Play (no scene) keeps no idea', async () => {
    magenta.status = 'ready';
    magenta.fill.mockResolvedValue(aiNotes);
    const kept: string[] = [];
    const { e, p } = engine({ fillEngine: 'magenta' });
    e.setOnIdeaKept((owner) => kept.push(owner));
    e.setIdeas({ seed: 7, owner: null });
    e.setFill(0.5, 1, null);
    e.setActiveCells(BOARD);
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    await flush();
    expect(kept).toEqual([]);
  });
});
