import { describe, it, expect, vi, beforeEach } from 'vitest';

const clock = vi.hoisted(() => ({ now: 0, immediate: 0 }));
vi.mock('tone', () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(), triggerAttackRelease: vi.fn() });
  return {
    getContext: vi.fn(() => ({ rawContext: { currentTime: 0, createGain: vi.fn() } })),
    now: vi.fn(() => clock.now),
    immediate: vi.fn(() => clock.immediate),
    MembraneSynth: vi.fn(() => node()),
    Limiter: vi.fn(() => node()), Reverb: vi.fn(() => node()), FeedbackDelay: vi.fn(() => node()),
    connect: vi.fn(),
  };
});
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: vi.fn() }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';

const cfg = (): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.9, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: [],
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
});

interface Priv {
  startSec: number;
  cfg: BoardEngineConfig;
  tick: { triggerAttackRelease: ReturnType<typeof vi.fn> } | null;
  audibleNow(): number;
}

describe('BoardSequencerEngine tempo + tick', () => {
  beforeEach(() => { clock.now = 0; clock.immediate = 0; });

  it('setBpm rebases the clock so the beat position is continuous', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    p.startSec = 0;
    clock.now = 10; // beat 10 at 60 BPM
    e.setBpm(120);
    expect(e.getBpm()).toBe(120);
    expect((clock.now - p.startSec) / (60 / 120)).toBeCloseTo(10, 6);
  });

  it('setBpm is a no-op while synced to a song with beats; getBpm reports the song tempo', () => {
    const e = new BoardSequencerEngine(cfg());
    e.setSyncSource({ getTime: () => 0, beats: [0, 0.5, 1, 1.5], chordAt: () => null });
    e.setBpm(150);
    expect(e.getBpm()).toBeCloseTo(120, 6); // 0.5 s spacing
  });

  it('getPlayheadCol follows audible time, not Tone.now()', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    p.startSec = 0;
    clock.now = 2.1; // look-ahead clock says beat 2
    vi.spyOn(p, 'audibleNow').mockReturnValue(1.95); // heard: still beat 1
    expect(e.getPlayheadCol(4)).toBe(1);
  });

  it('fireTick respects setTickEnabled and starts at Tone.immediate()', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    const trigger = vi.fn();
    p.tick = { triggerAttackRelease: trigger };
    clock.immediate = 5;
    e.fireTick();
    expect(trigger).not.toHaveBeenCalled(); // tickEnabled false
    e.setTickEnabled(true);
    e.fireTick();
    expect(trigger).toHaveBeenCalledWith('C2', 0.05, 5);
  });
});
