import { describe, it, expect, vi, beforeEach } from 'vitest';

const clock = vi.hoisted(() => ({ now: 0, immediate: 0 }));
const magenta = vi.hoisted(() => ({ status: 'ready' as 'ready' | 'failed' | 'loading' | 'idle' }));
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
vi.mock('../songs/voices/BoardSequencerVoice', () => ({ BoardSequencerVoice: class { setBrightness = vi.fn(); connect = vi.fn(); dispose = vi.fn(); play = vi.fn(); isReady = () => true; } }));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({ RoundRobinDrumKit: vi.fn() }));
vi.mock('../songs/generative/magentaFill', () => ({
  loadMagenta: vi.fn(() => Promise.resolve()),
  magentaFill: vi.fn(() => Promise.resolve([])),
  magentaStatus: vi.fn(() => magenta.status),
}));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

/**
 * Keeping time in the engine (spec 2026-10-28): the meter reads the audio clock against
 * the wall clock and counts late and skipped beats; the valve drops extras in order when
 * the sound falls behind; Simplify strips the sound to the player and the bed.
 */

const cfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 120, rows: 4, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.9, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: [],
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, fillEngine: 'rules', ...over,
});

interface Priv {
  startSec: number;
  lastInternalBeat: number;
  timer: unknown;
  fillAmount: number;
  evolve: { amount: number };
  wallNow: () => number;
  scheduleInternal(): void;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
  fireCell(cell: ActiveCell & { layer?: string }): void;
  fireBand(): void;
  fireFill(): void;
}

let wall = 0;

/** An engine whose beats are only counted, on a wall clock the test moves. */
function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(cfg(over));
  const p = e as unknown as Priv;
  p.wallNow = () => wall;
  const fired: number[] = [];
  return { e, p, fired };
}

/** The scheduler's own timer stopped: the test ticks it by hand. */
function halt(p: Priv): void {
  clearInterval(p.timer as ReturnType<typeof setInterval>);
  p.timer = null;
}

/** Start the clock at 0 without a real timer, with fireStep counting beats. */
function startCounting(e: BoardSequencerEngine, p: Priv, fired: number[]): void {
  e.start();
  halt(p);
  p.fireStep = (i: number) => { fired.push(i); };
  p.startSec = 0;
  p.lastInternalBeat = -1;
}

/** Tick the scheduler every 25 ms from `fromSec` to `toSec`, the wall clock in step. */
function tickThrough(p: Priv, fromSec: number, toSec: number): void {
  for (let t = fromSec; t <= toSec + 1e-9; t += 0.025) {
    clock.now = t;
    wall = t * 1000;
    p.scheduleInternal();
  }
}

/** The page stalls: nothing runs until `toSec`, then one tick. */
function stallUntil(p: Priv, toSec: number): void {
  clock.now = toSec;
  wall = toSec * 1000;
  p.scheduleInternal();
}

beforeEach(() => { clock.now = 0; clock.immediate = 0; wall = 0; magenta.status = 'ready'; });

describe('the meter in the engine', () => {
  it('a simulated audio clock running 1 % slow gives the expected drift', () => {
    const { e, p } = engine();
    e.start();
    halt(p);
    clock.now = 99;
    wall = 100_000;
    const r = e.getKeepingTime();
    expect(r.driftSec).toBeCloseTo(1, 6);
    expect(r.driftRate).toBeCloseTo(0.01, 6);
    expect(r.drifting).toBe(true);
  });

  it('late and skipped beats are counted from a stalled tick', () => {
    const { e, p, fired } = engine();
    startCounting(e, p, fired);
    tickThrough(p, 0, 2);
    expect(e.getKeepingTime().lateBeats).toBe(0);
    // 3 s with no tick at 120 BPM: beat 5 (due at 2.5 s) is owed 2.5 s late; the cap of 4
    // beats of catch-up drops beat 5; beats 6 to 9 go out late, beat 10 is on time.
    stallUntil(p, 5);
    const r = e.getKeepingTime();
    expect(r.skippedBeats).toBe(1);
    expect(r.lateBeats).toBe(4);
    expect(r.worstLateSec).toBeCloseTo(2.5, 6);
    expect(r.behind).toBe(true);
  });

  it('a healthy run gives fine: nothing late, nothing skipped, no drift', () => {
    const { e, p, fired } = engine();
    startCounting(e, p, fired);
    tickThrough(p, 0, 60);
    const r = e.getKeepingTime();
    expect(r).toMatchObject({ lateBeats: 0, skippedBeats: 0, behind: false, everBehind: false, drifting: false });
    expect(fired).toEqual(Array.from({ length: fired.length }, (_, i) => i));
  });

  it('swing is not lateness: an off-beat played later on purpose never counts', () => {
    const { e, p, fired } = engine({ swing: 0.6 });
    startCounting(e, p, fired);
    tickThrough(p, 0, 30);
    expect(e.getKeepingTime().lateBeats).toBe(0);
  });
});

describe('the valve in the engine', () => {
  it('steps in order, one stall at a time: Magenta first, then Extra notes, then Sounds change', () => {
    const { e, p, fired } = engine({ fillEngine: 'magenta' });
    e.setFill(0.5, 1, null);
    e.setEvolve({ amount: 0.5, sceneLoops: 8, seed: 1, holdLap: null });
    startCounting(e, p, fired);
    tickThrough(p, 0, 2);
    expect(e.getValveSteps()).toEqual([]);
    stallUntil(p, 5);
    expect(e.getValveSteps()).toEqual(['magenta']);
    expect(e.getFillStatus()).toBe('rules');
    expect(p.fillAmount).toBe(0.5); // the extra notes still play, from the rules
    tickThrough(p, 5.025, 8);
    stallUntil(p, 11);
    expect(e.getValveSteps()).toEqual(['magenta', 'fill']);
    expect(p.fillAmount).toBe(0);
    expect(e.getFillNotes()).toEqual([]);
    expect(p.evolve.amount).toBe(0.5);
    tickThrough(p, 11.025, 14);
    stallUntil(p, 17);
    expect(e.getValveSteps()).toEqual(['magenta', 'fill', 'evolve']);
    expect(p.evolve.amount).toBe(0);
  });

  it('never steps without lateness, however long it plays', () => {
    const { e, p, fired } = engine();
    e.setFill(0.5, 1, null);
    e.setEvolve({ amount: 0.5, sceneLoops: 8, seed: 1, holdLap: null });
    startCounting(e, p, fired);
    tickThrough(p, 0, 120);
    expect(e.getValveSteps()).toEqual([]);
    expect(p.fillAmount).toBe(0.5);
    expect(p.evolve.amount).toBe(0.5);
  });

  it('with the simple rules, the first step is Extra notes; Magenta that failed to load is not a step', () => {
    const { e, p, fired } = engine({ fillEngine: 'magenta' });
    magenta.status = 'failed';
    e.setFill(0.5, 1, null);
    startCounting(e, p, fired);
    tickThrough(p, 0, 2);
    stallUntil(p, 5);
    expect(e.getValveSteps()).toEqual(['fill']);
  });

  it('switched off in Sound → Advanced, it never steps, but the meter still reports', () => {
    const { e, p, fired } = engine();
    e.setKeepingTimeLimits({ behindSec: 1, driftSec: 1, valve: false });
    e.setFill(0.5, 1, null);
    startCounting(e, p, fired);
    tickThrough(p, 0, 2);
    stallUntil(p, 5);
    expect(e.getValveSteps()).toEqual([]);
    expect(e.getKeepingTime().behind).toBe(true);
  });

  it('stays off when the setting or a counter asks for more; the owner switches it back on', () => {
    const { e, p, fired } = engine();
    e.setFill(0.5, 1, null);
    startCounting(e, p, fired);
    tickThrough(p, 0, 2);
    stallUntil(p, 5);
    expect(e.getValveSteps()).toEqual(['fill']);
    e.setFill(0.8, 2, null);
    e.setControlValues({ fill: 0.9 }, {});
    expect(p.fillAmount).toBe(0);
    e.resetValve();
    expect(e.getValveSteps()).toEqual([]);
    expect(p.fillAmount).toBe(0.9);
    // Back on, it does not step again on the lateness from before.
    tickThrough(p, 5.025, 6);
    expect(e.getValveSteps()).toEqual([]);
  });
});

describe('Simplify', () => {
  const cell = (row: number, col: number, colour: string): ActiveCell => ({ row, col, colour });

  /** Which layers sound on a beat: 'live' for the player's own counters, else the loop. */
  function layersOn(p: Priv, beat: number): string[] {
    const out: string[] = [];
    p.fireCell = (c) => { out.push(c.layer ?? 'live'); };
    p.fireStep(beat, beat * 0.5, 0.5, null);
    return [...new Set(out)].sort();
  }

  function simplifiable() {
    const { e, p } = engine();
    p.fireBand = () => {};
    p.fireFill = () => {};
    e.setBand('gentle');
    e.setFill(0.5, 1, null);
    e.setEvolve({ amount: 0.5, sceneLoops: 8, seed: 1, holdLap: null });
    e.setActiveCells([cell(1, 0, 'red')]);
    e.setLaunchedLoops([0, 2], [[cell(2, 0, 'yellow')], [cell(3, 0, 'blue')]]);
    return { e, p };
  }

  it('one press: the band, Extra notes and Sounds change off, only the first loop (the bed) and the player play', () => {
    const { e, p } = simplifiable();
    expect(layersOn(p, 0)).toEqual(['live', 'slot0', 'slot2']);
    e.setSimplified(true);
    expect(e.getSimplify()).toBe('on');
    expect(e.getBandStatus().level).toBe('off');
    expect(p.fillAmount).toBe(0);
    expect(p.evolve.amount).toBe(0);
    expect(layersOn(p, 1)).toEqual(['live', 'slot0']);
  });

  it('while simplified, a scene that arrives brings its own bed, and its extras stay off', () => {
    const { e, p } = simplifiable();
    p.timer = 1; // playing: a launch waits for the pass
    e.setSimplified(true);
    // The next scene: loops 3 and 4, a full band, more extra notes.
    e.setLaunchedLoops([3, 4], [[cell(0, 0, 'green')], [cell(3, 0, 'blue')]]);
    e.setBand('full');
    e.setFill(0.9, 1, null);
    e.setEvolve({ amount: 0.9, sceneLoops: 8, seed: 1, holdLap: null });
    expect(layersOn(p, 4)).toEqual(['live', 'slot3']);
    expect(e.getBandStatus().level).toBe('off');
    expect(p.fillAmount).toBe(0);
    expect(p.evolve.amount).toBe(0);
  });

  it('Back to full brings the scene back from the next pass, not before', () => {
    const { e, p } = simplifiable();
    p.timer = 1;
    e.setSimplified(true);
    expect(layersOn(p, 1)).toEqual(['live', 'slot0']);
    e.setSimplified(false);
    expect(e.getSimplify()).toBe('leaving');
    expect(layersOn(p, 2)).toEqual(['live', 'slot0']);
    expect(e.getBandStatus().level).toBe('off');
    expect(layersOn(p, 4)).toEqual(['live', 'slot0', 'slot2']); // beat 4: the pass boundary
    expect(e.getSimplify()).toBe('off');
    expect(e.getBandStatus().level).toBe('gentle');
    expect(p.fillAmount).toBe(0.5);
    expect(p.evolve.amount).toBe(0.5);
  });

  it('stopped, Back to full is at once', () => {
    const { e, p } = simplifiable();
    e.setSimplified(true);
    e.setSimplified(false);
    expect(e.getSimplify()).toBe('off');
    expect(p.fillAmount).toBe(0.5);
  });

  it('Stop ends it, and the valve with it', () => {
    const { e, p } = simplifiable();
    p.timer = 1;
    e.setSimplified(true);
    e.stop();
    expect(e.getSimplify()).toBe('off');
    expect(e.getBandStatus().level).toBe('gentle');
    expect(p.fillAmount).toBe(0.5);
    expect(e.getValveSteps()).toEqual([]);
  });

  it('a loop fading out is never the bed', () => {
    const { e, p } = engine();
    p.fireBand = () => {};
    p.fireFill = () => {};
    e.setLaunchFade(4);
    e.setLaunchedLoops([0, 2], [[cell(2, 0, 'yellow')], [cell(3, 0, 'blue')]]);
    p.timer = 1;
    e.setLaunchedLoops([2], [[cell(3, 0, 'blue')]]); // loop 1 fades out from the next pass
    layersOn(p, 0);
    e.setSimplified(true);
    expect(layersOn(p, 1)).toEqual(['slot2']);
  });
});
