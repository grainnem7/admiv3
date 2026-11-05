/** K3 (Keep design, 5 Nov 2026): a launch carries its way in: fade, overlap or cut. */
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

import { BoardSequencerEngine, type BoardEngineConfig, type LaunchWay } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const channels: ColourChannel[] = [{ id: 'green', kind: 'hue', role: 'melody', swatch: '#0f0', instrument: 'piano' }];
const loopChannels: ColourChannel[] = [{ id: 'loop:melody:violin', kind: 'hue', role: 'melody', swatch: '#9a9a9a', instrument: 'violin', changes: false, plays: 'note' }];
const baseCfg = (): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
});

interface Fade { dir: 'in' | 'out'; start: number; beats: number }
interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, ReturnType<typeof fakeVoiceEntry>>;
  timer: unknown;
  launched: { slot: number; fade?: Fade }[];
  pendingLaunch: { way?: LaunchWay | null } | null;
  applyPendingLaunch(beat: number, atTime?: number, secPerBeat?: number): void;
  launchFactor(l: { slot: number; fade?: Fade }, beat: number): number;
}
const gainNode = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() });

function engine() {
  const e = new BoardSequencerEngine(baseCfg());
  const p = e as unknown as Priv & { mix: unknown; duckBus: unknown; reverbBus: unknown; delayBus: unknown; ctx: unknown };
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['green', fakeVoiceEntry(vi.fn())]]);
  p.mix = gainNode(); p.duckBus = gainNode(); p.reverbBus = gainNode(); p.delayBus = gainNode();
  p.ctx = { createGain: gainNode };
  return { e, p };
}
const cell = (row: number, col: number): ActiveCell => ({ row, col, colour: 'loop:melody:violin' });
const factor = (p: Priv, slot: number, beat: number): number => {
  const l = p.launched.find((x) => x.slot === slot);
  return l ? p.launchFactor(l, beat) : 0;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('a launch with its own way in (K3)', () => {
  it('fade: the leaving loop fades out over the steps while the arriving one fades in, whatever the player’s own fade', () => {
    const { e, p } = engine();
    e.setLaunchFade(0); // the player's hand fade: at once
    e.setLaunchedLoops([0], [[cell(1, 2)]], loopChannels);
    p.timer = {};
    e.setLaunchedLoops([1], [[cell(2, 2)]], loopChannels, { fadeSteps: 8, holdOutSteps: 0 });
    p.applyPendingLaunch(16, 0, 1);
    expect(p.launched.find((l) => l.slot === 0)?.fade).toEqual({ dir: 'out', start: 16, beats: 8 });
    expect(p.launched.find((l) => l.slot === 1)?.fade).toEqual({ dir: 'in', start: 16, beats: 8 });
    expect(factor(p, 0, 20)).toBeCloseTo(0.5);
    expect(factor(p, 1, 23)).toBeCloseTo(1);
  });

  it('overlap: the arriving loop starts at full, the leaving one carries on at full for the steps, then stops', () => {
    const { e, p } = engine();
    e.setLaunchFade(8);
    e.setLaunchedLoops([0], [[cell(1, 2)]], loopChannels);
    p.timer = {};
    e.setLaunchedLoops([1], [[cell(2, 2)]], loopChannels, { fadeSteps: 0, holdOutSteps: 16 });
    p.applyPendingLaunch(16, 0, 1);
    expect(p.launched.find((l) => l.slot === 1)?.fade).toBeUndefined();
    expect(factor(p, 0, 16)).toBe(1);
    expect(factor(p, 0, 31)).toBe(1);
    expect(factor(p, 0, 32)).toBe(0);
    // Over: the engine lets it go at beat 32 (the pass's own check uses start + beats).
    const out = p.launched.find((l) => l.slot === 0)?.fade;
    expect(out).toBeDefined();
    expect(out!.dir).toBe('out');
    expect(out!.start + out!.beats).toBe(32);
  });

  it('cut: the leaving loop stops at the boundary, the arriving one starts at full, whatever the player’s own fade', () => {
    const { e, p } = engine();
    e.setLaunchFade(8);
    e.setLaunchedLoops([0], [[cell(1, 2)]], loopChannels);
    p.timer = {};
    e.setLaunchedLoops([1], [[cell(2, 2)]], loopChannels, { fadeSteps: 0, holdOutSteps: 0 });
    p.applyPendingLaunch(16, 0, 1);
    expect(p.launched.map((l) => l.slot)).toEqual([1]);
    expect(p.launched[0].fade).toBeUndefined();
  });

  it('a launch without a way while one is pending inherits it; with none pending it uses the player’s fade', () => {
    const { e, p } = engine();
    e.setLaunchFade(8);
    e.setLaunchedLoops([0], [[cell(1, 2)]], loopChannels);
    p.timer = {};
    // A scene's cut is waiting; a hand press in the same pass adds loop 1: the cut still cuts.
    e.setLaunchedLoops([], [], [], { fadeSteps: 0, holdOutSteps: 0 });
    e.setLaunchedLoops([1], [[cell(2, 2)]], loopChannels);
    expect(p.pendingLaunch?.way).toEqual({ fadeSteps: 0, holdOutSteps: 0 });
    p.applyPendingLaunch(16, 0, 1);
    expect(p.launched.map((l) => l.slot)).toEqual([1]);
    // Nothing pending now: a hand stop uses the player's fade of 8.
    e.setLaunchedLoops([], [], []);
    expect(p.pendingLaunch?.way ?? null).toBeNull();
    p.applyPendingLaunch(24, 0, 1);
    expect(p.launched.find((l) => l.slot === 1)?.fade).toEqual({ dir: 'out', start: 24, beats: 8 });
  });
});
