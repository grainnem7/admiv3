import { describe, it, expect, vi } from 'vitest';
import {
  drumSeed, fromGenerated, gmToKit, melodySeed, MELODY_MAX, MELODY_MIN,
} from '../songs/generative/magentaSequences';
import { fitFill, type FillCandidate } from '../songs/generative/fillFilter';
import { MAX_FILL_PER_BEAT, type FillContext, type SoundingNote } from '../songs/generative/rulesFill';

const PENT = [0, 2, 4, 7, 9];
const SCALE_PCS = new Set(PENT);

const sounding: SoundingNote[] = [
  { step: 0, offset: 0, role: 'melody', colour: 'm', midi: 96 },   // above the model's range
  { step: 0, offset: 0, role: 'melody', colour: 'm', midi: 64 },   // same sixteenth: lower one
  { step: 2, offset: 0.5, role: 'melody', colour: 'm', midi: 67 },
  { step: 0, offset: 0, role: 'drums', colour: 'd', drum: 'kick' },
  { step: 1, offset: 0, role: 'drums', colour: 'd', drum: 'snare' },
  { step: 1, offset: 0, role: 'drums', colour: 'd', drum: 'snare' }, // duplicate hit
];

describe('board → Magenta', () => {
  it('a melody seed is one line, held note to note, inside the model range', () => {
    const seq = melodySeed(sounding, 4);
    expect(seq.quantizationInfo.stepsPerQuarter).toBe(4);
    expect(seq.totalQuantizedSteps).toBe(16);
    expect(seq.notes.map((n) => n.quantizedStartStep)).toEqual([0, 10]);
    for (const n of seq.notes) {
      expect(n.pitch).toBeGreaterThanOrEqual(MELODY_MIN);
      expect(n.pitch).toBeLessThanOrEqual(MELODY_MAX);
    }
    // Held until the next note starts: never two at once (the model takes one line).
    expect(seq.notes[0].quantizedEndStep).toBeLessThanOrEqual(seq.notes[1].quantizedStartStep);
  });

  it('a drum seed uses General MIDI notes, one hit per piece per sixteenth', () => {
    const seq = drumSeed(sounding, 4);
    expect(seq.notes.map((n) => [n.quantizedStartStep, n.pitch])).toEqual([[0, 36], [4, 38]]);
    expect(seq.notes.every((n) => n.isDrum)).toBe(true);
  });

  it('General MIDI drums come back as kit pieces', () => {
    expect(gmToKit(36)).toBe('kick');
    expect(gmToKit(38)).toBe('snare');
    expect(gmToKit(42)).toBe('hat');
    expect(gmToKit(46)).toBe('hat');
    expect(gmToKit(45)).toBe('tom');
    expect(gmToKit(49)).toBe('crash');
  });

  it('what the model writes lands on the loop grid; anything past the loop is dropped', () => {
    const out = fromGenerated({ notes: [
      { pitch: 67, quantizedStartStep: 6, quantizedEndStep: 8 },
      { pitch: 69, quantizedStartStep: 20, quantizedEndStep: 22 },
    ] }, 'melody', 'm', 4);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ step: 1, offset: 0.5, midi: 67, dur: 0.5, rule: 'ai' });
  });
});

describe('fitFill — whatever the model suggests, the player stays in charge', () => {
  const ctx = (over: Partial<FillContext> = {}): FillContext => ({
    sounding, loop: 4, rows: 8, rootMidi: 60, semitones: PENT, amount: 1, seed: 3, ...over,
  });
  const cand = (step: number, offset: number, midi: number): FillCandidate =>
    ({ step, offset, role: 'melody', colour: 'm', midi, dur: 0.25, accent: 0.7, rule: 'ai' });

  it('drops a suggestion on a sixteenth the player already plays', () => {
    expect(fitFill([cand(0, 0, 62)], ctx())).toEqual([]);
  });

  it('moves every suggestion onto the scale', () => {
    const out = fitFill([cand(1, 0, 61), cand(3, 0, 66)], ctx());
    expect(out).toHaveLength(2);
    for (const n of out) expect(SCALE_PCS.has(n.midi! % 12)).toBe(true);
  });

  it(`keeps at most ${MAX_FILL_PER_BEAT} per beat`, () => {
    const many = [0, 0.25, 0.5, 0.75].map((o) => cand(1, o, 64));
    expect(fitFill(many, ctx())).toHaveLength(MAX_FILL_PER_BEAT);
  });

  it('adds nothing to a part the player has not used', () => {
    expect(fitFill([{ ...cand(1, 0, 48), role: 'bass' }], ctx())).toEqual([]);
  });

  it('the amount decides how much survives, and 0 is nothing', () => {
    const many = Array.from({ length: 16 }, (_, i) => cand(Math.floor(i / 4), (i % 4) / 4, 64));
    expect(fitFill(many, ctx({ amount: 0 }))).toEqual([]);
    expect(fitFill(many, ctx({ amount: 1 })).length).toBeGreaterThan(fitFill(many, ctx({ amount: 0.2 })).length);
  });
});

// ---- the engine asks the model, and falls back to the rules ----

const magenta = vi.hoisted(() => ({
  status: 'ready' as 'idle' | 'loading' | 'ready' | 'failed',
  result: [] as unknown[],
  fail: false,
}));
vi.mock('../songs/generative/magentaFill', () => ({
  magentaStatus: () => magenta.status,
  loadMagenta: () => Promise.resolve(),
  magentaFill: () => (magenta.fail ? Promise.reject(new Error('offline')) : Promise.resolve(magenta.result)),
}));
vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const channels: ColourChannel[] = [{ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' }];
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  drumKit: null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: PENT, swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, fillEngine: 'magenta',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', { voice: { play: vi.fn() } }]]);
  p.drumKit = null;
  e.setActiveCells([{ row: 7, col: 0, colour: 'm' }, { row: 2, col: 4, colour: 'm' }]);
  e.setFill(1, 5, null);
  return { e, p };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const aiNote = { step: 6, offset: 0.5, role: 'melody', colour: 'm', midi: 67, dur: 0.5, accent: 0.6, rule: 'ai', cell: { row: 4, col: 6 } };

describe('engine — Magenta fill', () => {
  it('plays the rules at once, then the AI idea once the board has been still', async () => {
    magenta.status = 'ready'; magenta.fail = false; magenta.result = [aiNote];
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);                       // board just changed: rules for now
    expect(e.getFillNotes().every((n) => n.rule !== 'ai')).toBe(true);
    expect(e.getFillStatus()).toBe('thinking');
    p.fireStep(1, 1, 1, null);                       // still for a second: the AI is asked
    await flush();
    expect(e.getFillNotes()).toEqual([aiNote]);
    expect(e.getFillStatus()).toBe('ai');
  });

  it('falls back to the rules when the AI cannot be reached', async () => {
    magenta.status = 'ready'; magenta.fail = true;
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);
    p.fireStep(1, 1, 1, null);
    await flush();
    expect(e.getFillNotes().length).toBeGreaterThan(0);
    expect(e.getFillNotes().every((n) => n.rule !== 'ai')).toBe(true);
  });

  it('says so when the models could not load, and the rules play', () => {
    magenta.status = 'failed';
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);
    expect(e.getFillStatus()).toBe('offline');
    expect(e.getFillNotes().length).toBeGreaterThan(0);
  });

  it('"Simple rules" never asks the AI', () => {
    magenta.status = 'ready';
    const { e, p } = engine();
    e.setFillEngine('rules');
    p.fireStep(0, 0, 1, null);
    expect(e.getFillStatus()).toBe('rules');
  });
});

// ---- chord-aware generation: the progression, the critic, the fixed length ----
import { bestCandidate, chordProgressionFor, fitLength } from '../songs/generative/magentaSequences';

describe('the model is told the chords, and its tries are judged', () => {
  it('spells the progression over the seed loop and the continuation, or gives up if a beat has no chord', () => {
    expect(chordProgressionFor((s) => (s < 4 ? 'C' : 'G7'), 8)).toEqual(['C', 'C', 'C', 'C', 'G7', 'G7', 'G7', 'G7', 'C', 'C', 'C', 'C', 'G7', 'G7', 'G7', 'G7']);
    expect(chordProgressionFor((s) => (s === 5 ? null : 'C'), 8)).toBeNull();
  });

  it('prefers chord tones on the beat and stepwise motion over leaps and clashes', () => {
    const mk = (midis: number[]): FillCandidate[] => midis.map((midi, i) => ({ step: i, offset: 0, role: 'melody', colour: 'm', midi, dur: 0.5, accent: 0.7, rule: 'ai' }));
    const chord = () => [60, 64, 67];
    const smooth = mk([60, 62, 64, 65, 67, 65, 64, 62]);   // some non-chord tones on beats, but close steps
    const jumpy = mk([60, 73, 61, 74, 62, 75, 63, 76]);    // leaps and clashes
    const chordal = mk([60, 64, 67, 64, 60, 64, 67, 72]);  // all chord tones, small moves
    expect(bestCandidate([smooth, jumpy, chordal], chord, 3)).toBe(2);
    expect(bestCandidate([jumpy, smooth], chord, 3)).toBe(1);
  });

  it('a suggestion far busier than the player loses marks', () => {
    const busy: FillCandidate[] = Array.from({ length: 24 }, (_, i) => ({ step: Math.floor(i / 4), offset: (i % 4) / 4, role: 'melody', colour: 'm', midi: 60 + (i % 3) * 2, dur: 0.25, accent: 0.6, rule: 'ai' }));
    const calm: FillCandidate[] = [{ step: 1, offset: 0, role: 'melody', colour: 'm', midi: 64, dur: 0.5, accent: 0.6, rule: 'ai' }, { step: 3, offset: 0, role: 'melody', colour: 'm', midi: 67, dur: 0.5, accent: 0.6, rule: 'ai' }];
    expect(bestCandidate([busy, calm], () => [60, 64, 67], 2)).toBe(1);
  });

  it('fits a sequence to a fixed length for the variation model', () => {
    const seq = { notes: [{ pitch: 60, quantizedStartStep: 0, quantizedEndStep: 4 }, { pitch: 62, quantizedStartStep: 30, quantizedEndStep: 40 }, { pitch: 64, quantizedStartStep: 40, quantizedEndStep: 44 }], totalQuantizedSteps: 48, quantizationInfo: { stepsPerQuarter: 4 } };
    const fitted = fitLength(seq, 32);
    expect(fitted.totalQuantizedSteps).toBe(32);
    expect(fitted.notes).toEqual([{ pitch: 60, quantizedStartStep: 0, quantizedEndStep: 4 }, { pitch: 62, quantizedStartStep: 30, quantizedEndStep: 32 }]);
  });
});
