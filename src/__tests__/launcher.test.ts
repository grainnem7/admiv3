import { describe, it, expect, vi } from 'vitest';
import {
  LAUNCH_SLOTS, loopLabel, nextSceneIndex, sanitizeLoopNames, sanitizeScenes, sceneFromNow, slotState, toggleSlot,
  type SceneSettings,
} from '../songs/performance/launcher';

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0.3, evolveAmount: 0.4, bpm: 96 };

describe('launching loops', () => {
  it('a slot is starting or stopping until the engine has caught up', () => {
    expect(slotState(2, true, new Set([2]), new Set())).toBe('starting');
    expect(slotState(2, true, new Set([2]), new Set([2]))).toBe('playing');
    expect(slotState(2, true, new Set(), new Set([2]))).toBe('stopping');
    expect(slotState(2, true, new Set(), new Set())).toBe('stopped');
    expect(slotState(2, false, new Set([2]), new Set([2]))).toBe('empty');
  });

  it('toggling wants a loop in or out; an empty slot cannot be wanted', () => {
    expect([...toggleSlot(new Set([1]), 3, true)]).toEqual([1, 3]);
    expect([...toggleSlot(new Set([1, 3]), 3, true)]).toEqual([1]);
    expect([...toggleSlot(new Set([1]), 5, false)]).toEqual([1]);
  });
});

describe('scenes', () => {
  it('captures the loops wanted now and the settings that go with them', () => {
    const s = sceneFromNow('  Verse  one ', new Set([4, 1, 20]), settings, 'id1');
    expect(s).toEqual({ id: 'id1', name: 'Verse one', loops: [1, 4], settings });
  });

  it('walks the set list and wraps', () => {
    expect(nextSceneIndex(null, 3)).toBe(0);
    expect(nextSceneIndex(0, 3)).toBe(1);
    expect(nextSceneIndex(2, 3)).toBe(0);
    expect(nextSceneIndex(0, 0)).toBeNull();
  });

  it('stored scenes are made safe', () => {
    const scenes = sanitizeScenes([
      { id: 'a', name: 'Intro', loops: [0, 0, 9, -1, 2.5, 3], settings: { bpm: 5000, fillAmount: 2, soundWorld: 'disco' } },
      'junk',
      { id: 'a', name: 'duplicate id' },
      { name: '', loops: 'no' },
    ], settings);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toEqual({ id: 'a', name: 'Intro', loops: [0, 3], settings: { ...settings, bpm: 400, fillAmount: 1 } });
    expect(scenes[1].name).toBe('Scene 2');
    expect(sanitizeScenes('nope', settings)).toEqual([]);
  });

  it('names loops by number unless the player named them', () => {
    const names = sanitizeLoopNames(['Bass line', 42, '   ']);
    expect(names).toHaveLength(LAUNCH_SLOTS);
    expect(loopLabel(names, 0)).toBe('Bass line');
    expect(loopLabel(names, 1)).toBe('Loop 2');
  });
});

// ---- the engine: launched loops start and stop at the next pass ----

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
  timer: unknown;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
}
function engine() {
  const e = new BoardSequencerEngine({
    bpm: 60, rows: 8, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
    noteLengthBeats: 0.5, velocity: 0.8, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
    faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, band: 'off',
  });
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  p.voiceByChannel = new Map([['m', { voice: { play: vi.fn() } }]]);
  p.drumKit = null;
  p.timer = 1; // "running": launches wait for the pass boundary
  return { e, p };
}
const loop = [{ row: 2, col: 1, colour: 'm' }, { row: 3, col: 3, colour: 'm' }];
const loopNotes = (e: BoardSequencerEngine) => e.drainFiredNotes().filter((f) => f.source === 'loop');

describe('engine — launched loops', () => {
  it('a loop launched mid-pass starts at the next pass, and stops at the one after it is stopped', () => {
    const { e, p } = engine();
    p.fireStep(0, 0, 1, null);
    e.setLaunchedLoops([3], [loop]);         // asked for on beat 0 of pass 0 — already past the boundary
    expect(e.isLaunchPending()).toBe(true);
    for (let b = 1; b < 4; b++) p.fireStep(b, b, 1, null);
    expect(loopNotes(e)).toEqual([]);        // the rest of this pass: nothing
    for (let b = 4; b < 8; b++) p.fireStep(b, b, 1, null);
    expect(loopNotes(e).length).toBe(2);     // next pass: in
    expect(e.getLaunchedSlots()).toEqual([3]);
    // Stopped halfway through pass 2: the rest of that pass still plays, then silence.
    p.fireStep(8, 8, 1, null);
    p.fireStep(9, 9, 1, null);
    e.drainFiredNotes();
    e.setLaunchedLoops([], []);
    p.fireStep(10, 10, 1, null);
    p.fireStep(11, 11, 1, null);
    expect(loopNotes(e).length).toBe(1);
    for (let b = 12; b < 16; b++) p.fireStep(b, b, 1, null);
    expect(loopNotes(e)).toEqual([]);
  });

  it('while stopped, a launch applies at once so Play starts with it', () => {
    const { e, p } = engine();
    p.timer = null;
    e.setLaunchedLoops([0], [loop]);
    expect(e.isLaunchPending()).toBe(false);
    p.timer = 1;
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    expect(loopNotes(e).length).toBe(2);
  });
});

describe('engine — launched loops fade', () => {
  const four = [0, 1, 2, 3].map((col) => ({ row: 2, col, colour: 'm' }));
  const vels = (p: Priv) => p.voiceByChannel.get('m')!.voice.play.mock.calls.map((c) => c[1] as number);

  it('a stopped loop fades out over the fade length, then leaves', () => {
    const { e, p } = engine();
    p.timer = null;
    e.setLaunchedLoops([0], [four]);
    p.timer = 1;
    e.setLaunchFade(4);
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    p.fireStep(4, 4, 1, null);
    e.setLaunchedLoops([], []);                       // stop asked for mid-pass
    for (let b = 5; b < 8; b++) p.fireStep(b, b, 1, null);
    expect(vels(p)).toEqual([0.8, 0.8, 0.8, 0.8]);    // the pass it was stopped in: full
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    for (let b = 8; b < 12; b++) p.fireStep(b, b, 1, null);
    expect(vels(p).map((v) => Math.round(v * 100) / 100)).toEqual([0.8, 0.6, 0.4, 0.2]);
    expect(e.getLaunchedSlots()).toEqual([0]);        // still "stopping" while it fades
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    for (let b = 12; b < 16; b++) p.fireStep(b, b, 1, null);
    expect(vels(p)).toEqual([]);
    expect(e.getLaunchedSlots()).toEqual([]);
  });

  it('a launched loop fades in, and with no fade length starts at once', () => {
    const { e, p } = engine();
    e.setLaunchFade(4);
    p.fireStep(0, 0, 1, null);
    e.setLaunchedLoops([0], [four]);
    for (let b = 1; b < 4; b++) p.fireStep(b, b, 1, null);
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    for (let b = 4; b < 8; b++) p.fireStep(b, b, 1, null);
    expect(vels(p).map((v) => Math.round(v * 100) / 100)).toEqual([0.2, 0.4, 0.6, 0.8]);
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    for (let b = 8; b < 12; b++) p.fireStep(b, b, 1, null);
    expect(vels(p)).toEqual([0.8, 0.8, 0.8, 0.8]);

    const dead = engine();
    dead.e.setLaunchFade(0);
    dead.p.fireStep(0, 0, 1, null);
    dead.e.setLaunchedLoops([0], [four]);
    for (let b = 1; b < 8; b++) dead.p.fireStep(b, b, 1, null);
    expect(vels(dead.p).slice(-4)).toEqual([0.8, 0.8, 0.8, 0.8]);
  });

  it('a loop wanted again while fading out comes straight back to full', () => {
    const { e, p } = engine();
    p.timer = null;
    e.setLaunchedLoops([0], [four]);
    p.timer = 1;
    e.setLaunchFade(8);
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    e.setLaunchedLoops([], []);
    for (let b = 4; b < 9; b++) p.fireStep(b, b, 1, null); // fade began at 8
    e.setLaunchedLoops([0], [four]);
    for (let b = 9; b < 12; b++) p.fireStep(b, b, 1, null);
    p.voiceByChannel.get('m')!.voice.play.mockClear();
    for (let b = 12; b < 16; b++) p.fireStep(b, b, 1, null);
    expect(vels(p)).toEqual([0.8, 0.8, 0.8, 0.8]);
  });
});

describe('engine — the ending', () => {
  const cells = [0, 1, 2, 3].map((col) => ({ row: 2, col, colour: 'm' }));
  interface EndPriv extends Priv { endGain: { gain: { cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> } } }
  const endEngine = () => {
    const { e, p } = engine();
    const ep = p as EndPriv;
    ep.endGain = { gain: { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } };
    e.setActiveCells(cells);
    return { e, p: ep };
  };

  it('a fade begins at the next pass boundary, runs its beats, then says it has finished', () => {
    const { e, p } = endEngine();
    const finished = vi.fn();
    p.fireStep(0, 0, 1, null);
    p.fireStep(1, 1, 1, null);
    e.finish(8, finished);                       // asked for mid-pass
    expect(e.isFinishing()).toBe(true);
    for (let b = 2; b < 4; b++) p.fireStep(b, b, 1, null);
    expect(p.endGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    p.fireStep(4, 4, 1, null);                   // the boundary: the ramp starts here
    expect(p.endGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4 + 8);
    for (let b = 5; b < 12; b++) p.fireStep(b, b, 1, null);
    expect(finished).not.toHaveBeenCalled();
    p.fireStep(12, 12, 1, null);                 // 8 beats after it began: over
    expect(finished).toHaveBeenCalledTimes(1);
    expect(e.isFinishing()).toBe(false);
    expect(e.drainFiredNotes().some((f) => f.audioTime === 12)).toBe(false); // nothing played on the beat it ended
  });

  it('a stop ends at the next boundary without a ramp', () => {
    const { e, p } = endEngine();
    const finished = vi.fn();
    p.fireStep(0, 0, 1, null);
    e.finish(0, finished);
    for (let b = 1; b < 4; b++) p.fireStep(b, b, 1, null);
    expect(finished).not.toHaveBeenCalled();
    p.fireStep(4, 4, 1, null);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(p.endGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it('cancelling brings the sound back and the clock carries on', () => {
    const { e, p } = endEngine();
    const finished = vi.fn();
    e.finish(8, finished);
    p.fireStep(0, 0, 1, null);                   // boundary: ramp begins
    e.cancelFinish();
    expect(e.isFinishing()).toBe(false);
    expect(p.endGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, expect.any(Number));
    for (let b = 1; b < 20; b++) p.fireStep(b, b, 1, null);
    expect(finished).not.toHaveBeenCalled();
  });
});

describe('engine — the musical endings', () => {
  const cells = [0, 1, 2, 3].map((col) => ({ row: 2, col, colour: 'm' }));
  interface EndPriv extends Priv { cfg: { bpm: number }; endGain: { gain: Record<string, ReturnType<typeof vi.fn>> } }
  const endEngine = () => {
    const { e, p } = engine();
    const ep = p as EndPriv;
    ep.endGain = { gain: { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } };
    e.setActiveCells(cells);
    return { e, p: ep };
  };

  it('slow down: the tempo eases over the passes and comes back if cancelled', () => {
    const { e, p } = endEngine();
    const finished = vi.fn();
    e.finish(8, finished, 'slow');
    for (let b = 0; b < 7; b++) p.fireStep(b, b, 1, null);
    expect(p.cfg.bpm).toBeLessThan(60);
    expect(p.cfg.bpm).toBeGreaterThan(30);
    e.cancelFinish();
    expect(p.cfg.bpm).toBeCloseTo(60, 6);
    const again = endEngine();
    again.e.finish(8, finished, 'slow');
    for (let b = 0; b < 9; b++) again.p.fireStep(b, b, 1, null);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(again.p.cfg.bpm).toBeLessThan(40);
  });

  it('thin out: the fill leaves at once and the fade is over the last pass only', () => {
    const { e, p } = endEngine();
    e.setFill(1, 5, null);
    p.fireStep(0, 0, 1, null);
    e.drainFiredNotes();
    e.finish(8, vi.fn(), 'thin');
    for (let b = 1; b < 4; b++) p.fireStep(b, b, 1, null);      // before the boundary: fill still plays
    expect(e.drainFiredNotes().some((f) => f.origin === 'fill')).toBe(true);
    for (let b = 4; b < 12; b++) p.fireStep(b, b, 1, null);     // the ending: no fill
    const during = e.drainFiredNotes();
    expect(during.some((f) => f.origin === 'fill')).toBe(false);
    expect(during.some((f) => f.origin === 'placed')).toBe(true);  // the player's notes carry on
    // The ramp starts one pass before the end, not at the start.
    const ramps = p.endGain.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps).toHaveLength(1);
    expect(ramps[0]).toEqual([0, 4 + 8]);
    expect(p.endGain.gain.setValueAtTime.mock.calls.some((c) => c[0] === 1 && c[1] === 4 + 4)).toBe(true);
  });

  it('final chord: the texture thins, the chord lands on the last pass, and nothing else plays after it', () => {
    const { e, p } = endEngine();
    const finished = vi.fn();
    e.finish(4, finished, 'chord');                // one pass of thinning, then a pass of chord
    for (let b = 0; b < 4; b++) p.fireStep(b, b, 1, null);
    e.drainFiredNotes();
    p.fireStep(4, 4, 1, null);                     // the chord
    const fired = e.drainFiredNotes();
    expect(fired.some((f) => f.colour === 'band:final' && f.midis && f.midis.length === 4)).toBe(true);
    expect(fired.some((f) => f.origin === 'placed')).toBe(false);
    for (let b = 5; b < 8; b++) p.fireStep(b, b, 1, null);
    expect(e.drainFiredNotes()).toEqual([]);       // the chord rings alone
    expect(finished).not.toHaveBeenCalled();
    p.fireStep(8, 8, 1, null);
    expect(finished).toHaveBeenCalledTimes(1);
  });
});
