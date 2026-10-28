import { describe, it, expect } from 'vitest';
import { decideClockTick, editedScene, nowNext, planScenes, sceneAt, sceneTimeProblem, sortScenes, takeLoopOut } from '../songs/performance/piece';
import { CLOCK_NOT_STARTED, DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0.3, evolveAmount: 0.4, bpm: 96 };
const scene = (id: string, at: number | null): Scene => ({ id, name: id, loops: [], settings, ...(at === null ? {} : { at }) });

describe('the piece — scenes in time order', () => {
  it('timed scenes first, by time; untimed after in their order; the current one followed', () => {
    const { scenes, current } = sortScenes([scene('home', 360), scene('spare', null), scene('arrival', 0), scene('build', 90)], 0);
    expect(scenes.map((s) => s.id)).toEqual(['arrival', 'build', 'home', 'spare']);
    expect(current).toBe(2); // 'home' was current
  });

  it('says what is wrong with a time', () => {
    expect(sceneTimeProblem(null, 420, [])).toBeNull();
    expect(sceneTimeProblem(90, 420, [0, 210])).toBeNull();
    expect(sceneTimeProblem(430, 420, [])).toMatch(/after the end/i);
    expect(sceneTimeProblem(90, 420, [90])).toMatch(/same moment/i);
  });
});

describe('the piece — now and next', () => {
  const scenes = [scene('a', 0), scene('b', 90), scene('c', 210), scene('x', null)];
  it('what is on and what the clock brings next, with the time to it', () => {
    expect(nowNext(scenes, 0, 42)).toEqual({ now: scenes[0], next: { scene: scenes[1], inSec: 48 } });
    expect(nowNext(scenes, 2, 300)).toEqual({ now: scenes[2], next: null });
    expect(nowNext(scenes, null, null)).toEqual({ now: null, next: null });
  });

  it('after Next ▶ early, Next is the scene after the one on now, not the one skipped', () => {
    // Build brought in by hand at 0:06: the strip said "Now: Build, Next: Build in 1:24".
    expect(nowNext(scenes, 1, 6)).toEqual({ now: scenes[1], next: { scene: scenes[2], inSec: 204 } });
    expect(nowNext(scenes, 2, 6)).toEqual({ now: scenes[2], next: null });
  });
});

describe('the piece — one tick of the clock', () => {
  const perf = { ...DEFAULT_PERFORMANCE, ending: 'auto' as const, style: 'fade' as const, fadePasses: 2, lengthSec: 420 };
  const base = { scenes: [scene('a', 0), scene('b', 90)], performance: perf, passSec: 5, ending: false, autoEnded: false };

  it('the opening scene on the first tick', () => {
    const d = decideClockTick({ ...base, prev: { remaining: Infinity, elapsed: CLOCK_NOT_STARTED }, now: { remaining: 419.75, elapsed: 0.25 } });
    expect(d).toEqual({ cues: [], scene: 0, end: false, hardStop: false });
  });

  it('at the end time nothing is left playing: the backstop stops it', () => {
    const at = (remaining: number, extra = {}) => decideClockTick({ ...base, prev: { remaining: remaining + 0.25, elapsed: 420 - remaining - 0.25 }, now: { remaining, elapsed: 420 - remaining }, ...extra });
    // It begins a second early, so its own fade and stop are over by the end time.
    expect(at(1.25).hardStop).toBe(false);
    expect(at(1).hardStop).toBe(true);
    expect(at(0).hardStop).toBe(true);
    // Even with an ending running (cancelled, or slowed past its time) or already auto-ended.
    expect(at(0, { ending: true, autoEnded: true }).hardStop).toBe(true);
  });

  it('a scene at its time; none while ending', () => {
    const tick = { prev: { remaining: 330.2, elapsed: 89.8 }, now: { remaining: 329.9, elapsed: 90.1 } };
    expect(decideClockTick({ ...base, ...tick }).scene).toBe(1);
    expect(decideClockTick({ ...base, ...tick, ending: true }).scene).toBeNull();
  });

  it('a scene already passed by hand does not come back at its time', () => {
    const three = [scene('a', 0), scene('b', 90), scene('c', 210)];
    const at90 = { prev: { remaining: 330.2, elapsed: 89.8 }, now: { remaining: 329.9, elapsed: 90.1 } };
    const at210 = { prev: { remaining: 210.2, elapsed: 209.8 }, now: { remaining: 209.9, elapsed: 210.1 } };
    // Next ▶ pressed early: b is on. At 1:30 the clock must not bring b in again…
    expect(decideClockTick({ ...base, scenes: three, current: 1, ...at90 }).scene).toBeNull();
    // …and skipped ahead to c: b at 1:30 must not pull the piece backwards.
    expect(decideClockTick({ ...base, scenes: three, current: 2, ...at90 }).scene).toBeNull();
    // A later scene still comes in at its time.
    expect(decideClockTick({ ...base, scenes: three, current: 1, ...at210 }).scene).toBe(2);
    // Gone back by hand to a: b and c come again, at their times.
    expect(decideClockTick({ ...base, scenes: three, current: 0, ...at90 }).scene).toBe(1);
  });

  it('cues as the end nears, and the automatic ending once', () => {
    const tick = { prev: { remaining: 15.1, elapsed: 404.9 }, now: { remaining: 14.9, elapsed: 405.1 } };
    expect(decideClockTick({ ...base, ...tick }).end).toBe(true);           // lead is 3 passes = 15 s
    expect(decideClockTick({ ...base, ...tick, autoEnded: true }).end).toBe(false);  // cancelled: stays cancelled
    const cue = decideClockTick({ ...base, prev: { remaining: 60.1, elapsed: 359.9 }, now: { remaining: 59.9, elapsed: 360.1 } });
    expect(cue.cues).toEqual([60]);
  });

  it('never ends in the first seconds, however short the piece', () => {
    const short = { ...perf, lengthSec: 30, fadePasses: 4 };
    expect(decideClockTick({ ...base, performance: short, prev: { remaining: 30, elapsed: CLOCK_NOT_STARTED }, now: { remaining: 29, elapsed: 1 } }).end).toBe(false);
  });
});

describe('the piece — make my plan', () => {
  it('four scenes in proportion to the length, using the saved loops', () => {
    const loops = [[{}], null, [{}], [{}], [{}], null, null, null];
    const plan = planScenes(420, loops, settings, 't');
    expect(plan.map((p) => [p.name, p.at])).toEqual([['Arrival', 0], ['Build', 90], ['Open', 210], ['Home', 360]]);
    expect(plan[0].loops).toEqual([0]);
    expect(plan[1].loops).toEqual([0, 2, 3]);
    // Open is never left without loops: the band and Extra notes only play while a
    // counter is down, so a scene with none was 2½ minutes of silence (T3-01).
    expect(plan[2].loops).toEqual([0, 2]);
    expect(plan[2].settings).toMatchObject({ band: 'full', fillAmount: 0.4, evolveAmount: 0.5, soundWorld: 'warm', bpm: 96 });
    expect(planScenes(300, loops, settings, 't').map((p) => p.at)).toEqual([0, 64, 150, 257]);
    expect(new Set(plan.map((p) => p.id)).size).toBe(4);
  });

  it('with one saved loop, every scene has it; none is ever marked to play alone', () => {
    const plan = planScenes(420, [null, [{}], null], settings, 't');
    expect(plan.map((p) => p.loops)).toEqual([[1], [1], [1], [1]]);
    expect(plan.some((p) => 'alone' in p)).toBe(false);
  });

  it('with nothing saved, the scenes are empty (and the check says so)', () => {
    expect(planScenes(420, [null, null], settings, 't').map((p) => p.loops)).toEqual([[], [], [], []]);
  });
});

describe('the piece — changing a scene', () => {
  it('an emptied time makes the scene by hand only', () => {
    const s = editedScene(scene('a', 90), { at: null });
    expect(s).toEqual({ id: 'a', name: 'a', loops: [], settings });
    expect('at' in s).toBe(false);
    expect(editedScene(scene('a', 90), { at: 150 }).at).toBe(150);
  });

  it('"alone" takes the loops out; adding a loop, or unticking it, ends it', () => {
    const alone = editedScene({ ...scene('a', 0), loops: [0, 2] }, { alone: true });
    expect(alone).toMatchObject({ alone: true, loops: [] });
    expect('alone' in editedScene(alone, { loops: [1] })).toBe(false);
    expect('alone' in editedScene(alone, { alone: false })).toBe(false);
    expect(editedScene(alone, { name: 'Solo', at: 30 })).toMatchObject({ alone: true, loops: [], name: 'Solo', at: 30 });
  });
});

describe('the piece — taking an empty loop out of the scenes', () => {
  it('removes that loop from every scene that uses it, and nothing else', () => {
    const scenes = [{ ...scene('a', 0), loops: [0, 2] }, { ...scene('b', 90), loops: [2] }, { ...scene('c', 210), loops: [1] }];
    expect(takeLoopOut(scenes, 2).map((s) => s.loops)).toEqual([[0], [], [1]]);
    expect(takeLoopOut(scenes, 2)[2]).toBe(scenes[2]);
  });
});

describe('the piece — the scene on at a moment', () => {
  it('is the latest one timed at or before it, for rehearsing from part-way', () => {
    const scenes = [scene('home', 360), scene('arrival', 0), scene('spare', null), scene('build', 90)];
    expect(sceneAt(scenes, 0)).toBe(1);
    expect(sceneAt(scenes, 89)).toBe(1);
    expect(sceneAt(scenes, 90)).toBe(3);
    expect(sceneAt(scenes, 400)).toBe(0);
    expect(sceneAt([scene('late', 30)], 10)).toBe(-1);
  });
});

describe('the piece — a cleared loop put back (Undo)', () => {
  it('goes back into the scenes that had it, once, and nowhere else', async () => {
    const { putLoopBack } = await import('../songs/performance/piece');
    const before = [{ ...scene('a', 0), loops: [0, 2] }, { ...scene('b', 90), loops: [2] }, { ...scene('c', 210), loops: [1] }];
    const cleared = takeLoopOut(before, 2);
    const back = putLoopBack(cleared, 2, ['a', 'b']);
    expect(back.map((s) => s.loops)).toEqual([[0, 2], [2], [1]]);
    expect(back[2]).toBe(cleared[2]);
    expect(putLoopBack(back, 2, ['a']).map((s) => s.loops)).toEqual([[0, 2], [2], [1]]);
  });
});
