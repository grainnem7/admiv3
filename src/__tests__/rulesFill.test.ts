import { describe, it, expect, vi } from 'vitest';
import { generateFill, MAX_FILL_PER_BEAT, type FillContext, type SoundingNote } from '../songs/generative/rulesFill';

const PENT = [0, 2, 4, 7, 9];
const SCALE_PCS = new Set(PENT.map((s) => s % 12));

// A small board: two melody notes a leap apart, a bass change, a kick and a snare.
const board: SoundingNote[] = [
  { step: 0, offset: 0, role: 'melody', colour: 'm', midi: 60 },
  { step: 4, offset: 0, role: 'melody', colour: 'm', midi: 69 },
  { step: 0, offset: 0, role: 'bass', colour: 'b', midi: 48 },
  { step: 4, offset: 0, role: 'bass', colour: 'b', midi: 55 },
  { step: 0, offset: 0, role: 'drums', colour: 'd', drum: 'kick' },
  { step: 2, offset: 0, role: 'drums', colour: 'd', drum: 'snare' },
];
const ctx = (over: Partial<FillContext> = {}): FillContext => ({
  sounding: board, loop: 8, rows: 8, rootMidi: 60, semitones: PENT, amount: 1, seed: 7, ...over,
});
const slot = (n: { step: number; offset: number }) => n.step * 4 + Math.round(n.offset * 4);

describe('fill — the player stays in charge', () => {
  it('adds nothing at amount 0', () => {
    expect(generateFill(ctx({ amount: 0 }))).toEqual([]);
  });

  it('never adds a note where that part already plays', () => {
    const fill = generateFill(ctx());
    expect(fill.length).toBeGreaterThan(0);
    for (const f of fill) {
      const clash = board.some((b) => b.role === f.role && slot(b) === slot(f));
      expect(clash).toBe(false);
    }
  });

  it('every added pitch is in the scale', () => {
    for (const f of generateFill(ctx())) {
      if (f.midi !== undefined) expect(SCALE_PCS.has(((f.midi % 12) + 12) % 12)).toBe(true);
    }
  });

  it(`adds at most ${MAX_FILL_PER_BEAT} notes per beat to any part`, () => {
    const count = new Map<string, number>();
    for (const f of generateFill(ctx())) count.set(`${f.role}@${f.step}`, (count.get(`${f.role}@${f.step}`) ?? 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(MAX_FILL_PER_BEAT);
  });

  it('the same board and idea give exactly the same fill; a new idea gives another', () => {
    expect(generateFill(ctx())).toEqual(generateFill(ctx()));
    const ideas = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(generateFill(ctx({ seed, amount: 0.6 })))));
    expect(ideas.size).toBeGreaterThan(1);
  });

  it('more fill adds more notes', () => {
    expect(generateFill(ctx({ amount: 1 })).length).toBeGreaterThan(generateFill(ctx({ amount: 0.2 })).length);
  });

  it('walks between a leap with passing notes, and leads into a bass change', () => {
    const fill = generateFill(ctx({ amount: 1 }));
    expect(fill.some((f) => f.rule === 'passing')).toBe(true);
    expect(fill.some((f) => f.rule === 'approach')).toBe(true);
  });

  it('the drum fill at the end of the loop plays only every fourth time round', () => {
    const toms = generateFill(ctx({ amount: 1 })).filter((f) => f.rule === 'fill');
    expect(toms.length).toBeGreaterThan(0);
    for (const t of toms) {
      expect(t.everyNthLap).toBe(4);
      expect(t.step).toBe(7);
    }
  });

  it('adds nothing to a part the player has not used', () => {
    const onlyMelody = board.filter((b) => b.role === 'melody');
    expect(generateFill(ctx({ sounding: onlyMelody })).every((f) => f.role === 'melody')).toBe(true);
  });
});

// ---- the engine plays it ----

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, FILL_LEVEL } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000' },
];

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  duckBus: null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: PENT, swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', { voice: { play: vi.fn() } }]]);
  p.drumKit = { play: vi.fn() };
  p.duckBus = null;
  return { e, p };
}

describe('engine — fill', () => {
  it('plays fill notes quieter than the player, marked as fill', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 7, col: 0, colour: 'm' }, { row: 2, col: 4, colour: 'm' }]);
    e.setFill(1, 7, null);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    const fired = e.drainFiredNotes();
    const fill = fired.filter((f) => f.origin === 'fill');
    expect(fill.length).toBeGreaterThan(0);
    const fillVels = p.voiceByChannel.get('m')!.voice.play.mock.calls
      .filter((c) => fill.some((f) => f.audioTime === c[3]))
      .map((c) => c[1] as number);
    for (const v of fillVels) expect(v).toBeLessThanOrEqual(0.8 * FILL_LEVEL + 1e-9);
  });

  it('a kept fill stays as it is when the board changes', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 7, col: 0, colour: 'm' }, { row: 2, col: 4, colour: 'm' }]);
    e.setFill(1, 7, null);
    p.fireStep(0, 0, 1, null);
    const kept = e.getFillNotes();
    e.setFill(1, 7, kept);
    e.setActiveCells([{ row: 5, col: 1, colour: 'm' }]);
    p.fireStep(1, 1, 1, null);
    expect(e.getFillNotes()).toBe(kept);
  });

  it('nothing is added with the fill off', () => {
    const { e, p } = engine();
    e.setActiveCells([{ row: 7, col: 0, colour: 'm' }, { row: 2, col: 4, colour: 'm' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    expect(e.drainFiredNotes().some((f) => f.origin === 'fill')).toBe(false);
  });
});
