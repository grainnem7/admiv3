import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { channelPan, ducksForKick, legatoBeats } from '../audio/boardMix';
import { DEFAULT_BOARD_MIX } from '../audio/audioConfig';
import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

const ch = (id: string, role: ColourChannel['role'], instrument?: string): ColourChannel =>
  ({ id, kind: 'hue', role, swatch: '#f00', ...(instrument ? { instrument } : {}) });

describe('channelPan', () => {
  it('keeps bass in the centre', () => {
    expect(channelPan([ch('b', 'bass')], 'b')).toBe(0);
  });

  it('puts two melody colours on different sides', () => {
    const chans = [ch('m1', 'melody'), ch('b', 'bass'), ch('m2', 'melody')];
    const a = channelPan(chans, 'm1');
    const b = channelPan(chans, 'm2');
    expect(a).not.toBe(0);
    expect(Math.sign(a)).not.toBe(Math.sign(b));
  });

  it('centres anything that is not a pitched part, and unknown ids', () => {
    expect(channelPan([ch('d', 'drums')], 'd')).toBe(0);
    expect(channelPan([], 'x')).toBe(0);
  });
});

describe('ducksForKick', () => {
  it('bass, chords and pads make room; a melody keeps its line', () => {
    expect(ducksForKick({ role: 'bass' })).toBe(true);
    expect(ducksForKick({ role: 'chord' })).toBe(true);
    expect(ducksForKick({ role: 'melody', instrument: 'pad' })).toBe(true);
    expect(ducksForKick({ role: 'melody', instrument: 'piano' })).toBe(false);
  });
});

describe('legatoBeats', () => {
  it('rings up to the next note in the channel', () => {
    expect(legatoBeats(1, [1, 3, 6], 8, 4)).toBe(2);
  });

  it('wraps round the loop to find the next note', () => {
    expect(legatoBeats(6, [1, 6], 8, 4)).toBe(3);
  });

  it('a lone note rings as long as allowed, never the whole loop', () => {
    expect(legatoBeats(2, [2], 8, 4)).toBe(4);
    expect(legatoBeats(2, [2], 3, 4)).toBe(3);
  });

  it('ignores notes that sit outside a shortened loop', () => {
    expect(legatoBeats(0, [0, 5], 4, 8)).toBe(4);
  });

  it('two notes in one column are not each other\'s "next"', () => {
    expect(legatoBeats(2, [2, 2, 4], 8, 4)).toBe(2);
  });
});

// The engine, with its private parts swapped for spies, as the other engine tests do.
const fakeParam = () => ({ value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const fakeGain = () => ({ gain: fakeParam() });

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> }; pan?: { pan: ReturnType<typeof fakeParam> }; panBase?: number }>;
  drumKit: { play: ReturnType<typeof vi.fn>; setPans: ReturnType<typeof vi.fn> } | null;
  duckBus: ReturnType<typeof fakeGain> | null;
  studioOut: ReturnType<typeof fakeGain> | null;
  classicOut: ReturnType<typeof fakeGain> | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}

const channels = [ch('m', 'melody'), ch('d', 'drums')];

function engine(over: Partial<BoardEngineConfig> = {}) {
  const cfg: BoardEngineConfig = {
    bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
  };
  const e = new BoardSequencerEngine(cfg);
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const play = vi.fn();
  const pan = { pan: fakeParam() };
  p.voiceByChannel = new Map([['m', { voice: { play }, pan, panBase: 0.2 }]]);
  p.drumKit = { play: vi.fn(), setPans: vi.fn() };
  p.duckBus = fakeGain();
  p.studioOut = fakeGain();
  p.classicOut = fakeGain();
  return { e, p, play, pan };
}

/** The duration (seconds) of the last note the melody voice was asked to play. */
const lastDur = (play: ReturnType<typeof vi.fn>): number => play.mock.calls.at(-1)?.[2] as number;

describe('studio mix in the engine', () => {
  it('a melody note rings on to the next one', () => {
    const { e, p, play } = engine();
    e.setActiveCells([{ row: 0, col: 1, colour: 'm' }, { row: 1, col: 4, colour: 'm' }]);
    p.fireStep(1, 0, 1, null);
    expect(lastDur(play)).toBeCloseTo(3, 6);
    // And the fired-note log, which draws the note, agrees with what sounds.
    expect(e.drainFiredNotes()[0].durSec).toBeCloseTo(3, 6);
  });

  it('the original mix keeps Note length exactly', () => {
    const { e, p, play } = engine({ studioMix: false });
    e.setActiveCells([{ row: 0, col: 1, colour: 'm' }, { row: 1, col: 4, colour: 'm' }]);
    p.fireStep(1, 0, 1, null);
    expect(lastDur(play)).toBeCloseTo(0.5, 6);
  });

  it('never shortens a note the player made long', () => {
    const { e, p, play } = engine({ noteLengthBeats: 3 });
    e.setActiveCells([{ row: 0, col: 1, colour: 'm' }, { row: 1, col: 2, colour: 'm' }]);
    p.fireStep(1, 0, 1, null);
    expect(lastDur(play)).toBeCloseTo(3, 6);
  });

  it('does not ring on with ping-pong, where "next" depends on direction', () => {
    const { e, p, play } = engine({ pingPong: true });
    e.setActiveCells([{ row: 0, col: 1, colour: 'm' }, { row: 1, col: 4, colour: 'm' }]);
    p.fireStep(1, 0, 1, null);
    expect(lastDur(play)).toBeCloseTo(0.5, 6);
  });

  it('a kick dips the ducked parts and lets them recover', () => {
    const { e, p } = engine({ rows: 8 });
    // Bottom row of the default kit is the kick.
    e.setActiveCells([{ row: 7, col: 0, colour: 'd' }]);
    p.fireStep(0, 2, 1, null);
    const calls = p.duckBus!.gain.setTargetAtTime.mock.calls;
    expect(calls[0][0]).toBeCloseTo(1 - DEFAULT_BOARD_MIX.duck.depth, 6);
    expect(calls[0][1]).toBe(2);
    expect(calls[1][0]).toBe(1);
  });

  it('the original mix does not duck', () => {
    const { e, p } = engine({ rows: 8, studioMix: false });
    e.setActiveCells([{ row: 7, col: 0, colour: 'd' }]);
    p.fireStep(0, 2, 1, null);
    expect(p.duckBus!.gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it('switching crossfades the two outputs and centres everything', () => {
    const { e, p, pan } = engine();
    e.setStudioMix(false);
    expect(p.studioOut!.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(0);
    expect(p.classicOut!.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(1);
    expect(pan.pan.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(0);
    expect(p.drumKit!.setPans).toHaveBeenLastCalledWith({});
    e.setStudioMix(true);
    expect(pan.pan.setTargetAtTime.mock.calls.at(-1)?.[0]).toBe(0.2);
    expect(p.drumKit!.setPans).toHaveBeenLastCalledWith(DEFAULT_BOARD_MIX.drumPans);
  });
});
