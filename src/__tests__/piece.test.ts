import { describe, it, expect } from 'vitest';
import { decideClockTick, nowNext, planScenes, sceneAt, sceneTimeProblem, sortScenes } from '../songs/performance/piece';
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
});

describe('the piece — one tick of the clock', () => {
  const perf = { ...DEFAULT_PERFORMANCE, ending: 'auto' as const, style: 'fade' as const, fadePasses: 2, lengthSec: 420 };
  const base = { scenes: [scene('a', 0), scene('b', 90)], performance: perf, passSec: 5, ending: false, autoEnded: false };

  it('the opening scene on the first tick', () => {
    const d = decideClockTick({ ...base, prev: { remaining: Infinity, elapsed: CLOCK_NOT_STARTED }, now: { remaining: 419.75, elapsed: 0.25 } });
    expect(d).toEqual({ cues: [], scene: 0, end: false });
  });

  it('a scene at its time; none while ending', () => {
    const tick = { prev: { remaining: 330.2, elapsed: 89.8 }, now: { remaining: 329.9, elapsed: 90.1 } };
    expect(decideClockTick({ ...base, ...tick }).scene).toBe(1);
    expect(decideClockTick({ ...base, ...tick, ending: true }).scene).toBeNull();
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
    expect(plan[2].loops).toEqual([]);
    expect(plan[2].settings).toMatchObject({ band: 'full', fillAmount: 0.4, evolveAmount: 0.5, soundWorld: 'warm', bpm: 96 });
    expect(planScenes(300, loops, settings, 't').map((p) => p.at)).toEqual([0, 64, 150, 257]);
    expect(new Set(plan.map((p) => p.id)).size).toBe(4);
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
