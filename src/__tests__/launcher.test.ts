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
