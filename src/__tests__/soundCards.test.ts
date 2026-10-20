import { describe, it, expect, vi } from 'vitest';

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
import type { ColourChannel } from '../tracking/boardColours';
import { sanitizeBoardSequencerConfig, DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';
import { splitBoardConfig, resolveBoardConfig } from '../profiles/BoardProfiles';

const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() });

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, unknown>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  duckBus: ReturnType<typeof fakeGain> | null;
  reverbBus: ReturnType<typeof fakeGain> | null;
  delayBus: ReturnType<typeof fakeGain> | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

function engine(channels: ColourChannel[], over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.5, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
    phrases: true, soundWorld: 'warm', ...over,
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const entry = () => ({ voice: { play: vi.fn(), setBrightness: vi.fn(), connect: vi.fn(), dispose: vi.fn(), isReady: () => true }, gain: fakeGain(), rev: fakeGain(), del: fakeGain(), revBase: 0.18, delBase: 0, toneBase: 1 });
  p.voiceByChannel = new Map(channels.map((c) => [c.id, entry()]));
  p.drumKit = { play: vi.fn() };
  p.duckBus = fakeGain();
  return { e, p };
}

const melody = (over: Partial<ColourChannel> = {}): ColourChannel => ({ id: 'm', kind: 'hue', role: 'melody', swatch: '#f00', ...over });
const drums: ColourChannel = { id: 'd', kind: 'black', role: 'drums', swatch: '#000' };

describe('each colour plays one note or a tune', () => {
  it('by part: one melody counter plays one note, only on its own beat', () => {
    const { e, p } = engine([melody()]);
    e.setActiveCells([{ row: 3, col: 2, colour: 'm' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.length).toBe(1);
    expect(fired[0]).toMatchObject({ row: 3, col: 2, origin: 'placed' });
  });

  it('by default one drum counter plays a whole groove', () => {
    const { e, p } = engine([drums]);
    e.setActiveCells([{ row: 4, col: 0, colour: 'd' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    expect(e.drainFiredNotes().every((f) => f.origin === 'phrase')).toBe(true);
    expect(p.drumKit!.play.mock.calls.length).toBeGreaterThan(1);
  });

  it('a melody set to "a tune" plays a phrase from its counter', () => {
    const { e, p } = engine([melody({ plays: 'tune' })]);
    e.setActiveCells([{ row: 3, col: 2, colour: 'm' }]);
    p.fireStep(2, 2, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.length).toBeGreaterThan(0);
    for (const f of fired) expect(f.origin).toBe('phrase');
  });

  it('drums set to "one note" play only where counters sit', () => {
    const { e, p } = engine([{ ...drums, plays: 'note' }]);
    e.setActiveCells([{ row: 4, col: 0, colour: 'd' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.length).toBe(1);
    expect(fired[0].origin).toBe('placed');
  });

  it('notes and tunes play together in one step', () => {
    const { e, p } = engine([melody(), drums]);
    e.setActiveCells([{ row: 3, col: 0, colour: 'm' }, { row: 4, col: 0, colour: 'd' }]);
    p.fireStep(0, 0, 1, null);
    const origins = new Set(e.drainFiredNotes().map((f) => `${f.colour}:${f.origin}`));
    expect(origins.has('m:placed')).toBe(true);
    expect(origins.has('d:phrase')).toBe(true);
  });

  it('with phrases off every colour plays one note', () => {
    const { e, p } = engine([{ ...drums, plays: 'tune' }], { phrases: false });
    e.setActiveCells([{ row: 4, col: 0, colour: 'd' }]);
    for (let beat = 0; beat < 8; beat++) p.fireStep(beat, beat, 1, null);
    expect(e.drainFiredNotes().length).toBe(1);
  });
});

describe('Sounds change moves a one-note counter', () => {
  /** The pitch of one melody counter on each of `passes` passes of an 8-step board. */
  const pitches = (over: Partial<ColourChannel> = {}, evolve = 0.7, passes = 16, seed = 5, holdLap: number | null = null): number[] => {
    const { e, p } = engine([melody(over)]);
    e.setEvolve({ amount: evolve, sceneLoops: 8, seed, holdLap });
    e.setActiveCells([{ row: 3, col: 2, colour: 'm' }]);
    const out: number[] = [];
    for (let lap = 0; lap < passes; lap++) {
      p.fireStep(lap * 8 + 2, lap * 8 + 2, 1, null);
      out.push(e.drainFiredNotes()[0].midi!);
    }
    return out;
  };

  it('stays exactly on the placed note with Sounds change off', () => {
    expect(new Set(pitches({}, 0)).size).toBe(1);
  });

  it('wanders to nearby notes, and is home every fourth pass', () => {
    const p = pitches();
    expect(new Set(p).size).toBeGreaterThan(1);
    // Home is the placed note (Evolve may have moved the whole colour an octave).
    for (let lap = 0; lap < p.length; lap += 4) expect(((p[lap] - p[0]) % 12 + 12) % 12).toBe(0);
    for (let lap = 0; lap < p.length; lap++) expect(Math.abs(p[lap] - p[lap - (lap % 4)])).toBeLessThanOrEqual(5); // two scale steps at most
  });

  it('only moves to notes of the scale', () => {
    const scale = new Set([0, 2, 4, 7, 9]);
    for (const m of pitches()) expect(scale.has(((m - 60) % 12 + 12) % 12)).toBe(true);
  });

  it('More moves more passes than Slowly', () => {
    const moved = (a: number): number => {
      const p = pitches({}, a, 64);
      return p.filter((m) => m !== p[0]).length;
    };
    expect(moved(0.7)).toBeGreaterThan(moved(0.35));
  });

  it('a colour with Changes over time off keeps its note', () => {
    expect(new Set(pitches({ changes: false })).size).toBe(1);
  });

  it('Freeze holds one pass; another idea moves differently', () => {
    expect(new Set(pitches({}, 0.7, 8, 5, 3)).size).toBe(1);
    expect(pitches({}, 0.7, 16, 5)).not.toEqual(pitches({}, 0.7, 16, 99));
  });
});

describe('Loops vary: a saved loop is not the same notes every pass', () => {
  /** What one melody counter plays on each pass: from a launched loop, or from the board. */
  const passes = (opts: { from: 'loop' | 'board'; vary: number; plays?: 'note' | 'tune'; changes?: boolean; n?: number }): string[] => {
    const { e, p } = engine([melody({ plays: opts.plays, changes: opts.changes })]);
    e.setLoopVary(opts.vary);
    const cell = { row: 3, col: 0, colour: 'm' };
    if (opts.from === 'loop') e.setLaunchedLoops([0], [[cell]]);
    else e.setActiveCells([cell]);
    const out: string[] = [];
    for (let lap = 0; lap < (opts.n ?? 24); lap++) {
      for (let b = 0; b < 8; b++) p.fireStep(lap * 8 + b, lap * 8 + b, 1, null);
      out.push(e.drainFiredNotes().map((f) => f.midi).join(','));
    }
    return out;
  };

  it('a one-note loop moves to nearby notes on some passes, and is as saved every 4th', () => {
    const p = passes({ from: 'loop', vary: 0.7 });
    expect(new Set(p).size).toBeGreaterThan(1);
    for (let lap = 0; lap < p.length; lap += 4) expect(p[lap]).toBe(p[0]);
  });

  it('a loop that plays a tune plays other versions of it', () => {
    expect(new Set(passes({ from: 'loop', vary: 0.7, plays: 'tune' })).size).toBeGreaterThan(1);
  });

  it('Off replays the loop exactly as saved', () => {
    expect(new Set(passes({ from: 'loop', vary: 0 })).size).toBe(1);
    expect(new Set(passes({ from: 'loop', vary: 0, plays: 'tune' })).size).toBe(1);
  });

  it("the player's own counters are not changed by it", () => {
    expect(new Set(passes({ from: 'board', vary: 1 })).size).toBe(1);
  });

  it('a colour with Changes over time off keeps its loop as saved', () => {
    expect(new Set(passes({ from: 'loop', vary: 1, changes: false })).size).toBe(1);
  });
});

describe('layered loops talk to each other', () => {
  /** Two one-note melody loops with a note on the same step: who plays on each pass. */
  const whoPlays = (live = false): string[] => {
    const { e, p } = engine([melody()]);
    e.setLoopVary(0);
    e.setLaunchedLoops([0, 1], [[{ row: 3, col: 0, colour: 'm' }], [{ row: 5, col: 0, colour: 'm' }]]);
    if (live) e.setActiveCells([{ row: 1, col: 0, colour: 'm' }]);
    const out: string[] = [];
    for (let lap = 0; lap < 6; lap++) {
      p.fireStep(lap * 8, lap * 8, 1, null);
      out.push(e.drainFiredNotes().map((f) => `${f.source}:${f.row}`).sort().join(' '));
    }
    return out;
  };

  it('two loops on the same step take turns, pass by pass, instead of both at once', () => {
    const passes = whoPlays();
    for (const p of passes) expect(p.split(' ')).toHaveLength(1);
    expect(new Set(passes).size).toBe(2);
    expect(passes[0]).not.toBe(passes[1]);
  });

  it("the player's own counter always leads", () => {
    for (const p of whoPlays(true)) expect(p).toBe('live:1');
  });

  it('a loop note answers, softer, on a step where the leader is silent', () => {
    const { e, p } = engine([melody()]);
    e.setLoopVary(0);
    e.setLaunchedLoops([0, 1], [[{ row: 3, col: 0, colour: 'm' }], [{ row: 5, col: 4, colour: 'm' }]]);
    for (let b = 0; b < 8; b++) p.fireStep(b, b, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired).toHaveLength(2);
    expect(new Set(fired.map((f) => f.velocity)).size).toBe(2); // the leader full, the answer softer
  });

  it('with Loops vary on, a loop sometimes adds a passing note', () => {
    const { e, p } = engine([melody()]);
    e.setLoopVary(0.7);
    e.setLaunchedLoops([0], [[{ row: 3, col: 0, colour: 'm' }]]);
    let extra = 0;
    for (let lap = 0; lap < 32; lap++) {
      p.fireStep(lap * 8, lap * 8, 1, null);
      if (e.drainFiredNotes().length > 1) extra++;
    }
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(24); // and every 4th pass is as saved
  });
});

describe('Energy', () => {
  const velocityAt = (energy: number): number => {
    const { e, p } = engine([melody()]);
    e.setEnergy(energy);
    e.setActiveCells([{ row: 3, col: 0, colour: 'm' }]);
    p.fireStep(0, 0, 1, null);
    return e.drainFiredNotes()[0].velocity ?? 0;
  };

  it('the middle leaves notes as set; up is louder, down is softer', () => {
    expect(velocityAt(0.5)).toBeCloseTo(0.5, 6);
    expect(velocityAt(1)).toBeGreaterThan(velocityAt(0.5));
    expect(velocityAt(0)).toBeLessThan(velocityAt(0.5));
    expect(velocityAt(1)).toBeLessThanOrEqual(1);
  });
});

describe('Space', () => {
  it('moves the reverb and echo when no counter owns them', () => {
    const { e, p } = engine([melody()]);
    p.reverbBus = fakeGain();
    p.delayBus = fakeGain();
    e.setSpace(0);
    expect(p.reverbBus.gain.setTargetAtTime).toHaveBeenCalled();
    expect(p.delayBus.gain.setTargetAtTime).toHaveBeenCalled();
  });

  it('leaves a bus alone while a counter owns it', () => {
    const { e, p } = engine([melody()]);
    p.reverbBus = fakeGain();
    p.delayBus = fakeGain();
    e.setControlValues({ reverb: 0.4 });
    p.reverbBus.gain.setTargetAtTime.mockClear();
    e.setSpace(1);
    expect(p.reverbBus.gain.setTargetAtTime).not.toHaveBeenCalled();
    expect(p.delayBus.gain.setTargetAtTime).toHaveBeenCalled();
  });
});

describe('the new settings are saved per player', () => {
  it('plays and changes survive sanitising and the rig / player split', () => {
    const cfg = sanitizeBoardSequencerConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG,
      channels: [melody({ plays: 'tune', changes: false })],
      energy: 0.8, space: 2,
    })!;
    expect(cfg.channels[0]).toMatchObject({ plays: 'tune', changes: false });
    expect(cfg.energy).toBeCloseTo(0.8, 6);
    expect(cfg.space).toBe(1);
    const { rig, settings, channelSettings } = splitBoardConfig(cfg);
    expect(channelSettings.m).toMatchObject({ plays: 'tune', changes: false });
    const back = resolveBoardConfig(rig, { settings, channelSettings } as Parameters<typeof resolveBoardConfig>[1]);
    expect(back.channels[0]).toMatchObject({ plays: 'tune', changes: false });
  });

  it('old saves default to the middle', () => {
    const cfg = sanitizeBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, energy: undefined, space: undefined })!;
    expect(cfg.energy).toBe(0.5);
    expect(cfg.space).toBe(0.5);
  });
});
