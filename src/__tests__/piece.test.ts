import { describe, it, expect } from 'vitest';
import { decideClockTick, editedScene, nowNext, openingScene, planScenes, sceneAt, sceneTimeProblem, sortScenes, takeLoopOut, withSceneAdded } from '../songs/performance/piece';
import { CLOCK_NOT_STARTED, DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';
import { AS_BEFORE_JOBS } from '../songs/band/bandJobs';

const settings: SceneSettings = {
  soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0.3, evolveAmount: 0.4, bpm: 96, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: AS_BEFORE_JOBS, sceneEnergy: 0,
};
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

  // Harmony spec stage 2: a band that builds. Arrival pads; Build pads and bass; Open all
  // four, at Full; Home pads, quietly. No lead-ins (the default is None).
  // Harmony spec stage 3: Energy draws a build, 2, 3, 5, 2.
  it('draws Energy as a build: 2, 3, 5, 2', () => {
    const plan = planScenes(420, [[{}]], settings, 't');
    expect(plan.map((p) => p.settings.sceneEnergy)).toEqual([2, 3, 5, 2]);
  });

  it('sets band jobs that build, and no lead-ins', () => {
    const plan = planScenes(420, [[{}]], settings, 't');
    const jobsOf = (i: number) => {
      const j = plan[i].settings.bandJobs;
      return [j.asBefore, j.pads, j.bass, j.drums, j.counter];
    };
    expect(jobsOf(0)).toEqual([false, true, false, false, false]);
    expect(jobsOf(1)).toEqual([false, true, true, false, false]);
    expect(jobsOf(2)).toEqual([false, true, true, true, true]);
    expect(jobsOf(3)).toEqual([false, true, false, false, false]);
    expect(plan.map((p) => p.settings.band)).toEqual(['gentle', 'gentle', 'full', 'gentle']);
    expect(plan.some((p) => 'leadIn' in p)).toBe(false);
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

  it('"Reach this speed": gradually keeps the time; at once (0 or none) leaves the scene as before', () => {
    const gliding = editedScene(scene('a', 90), { glideSec: 8 });
    expect(gliding.glideSec).toBe(8);
    expect(editedScene(gliding, { name: 'Build' }).glideSec).toBe(8);
    const atOnce = editedScene(gliding, { glideSec: 0 });
    expect(atOnce).toEqual(scene('a', 90));
    expect('glideSec' in editedScene(gliding, { glideSec: undefined })).toBe(false);
  });

  it('a lead-in is kept; None leaves the scene as it was', () => {
    const fill = editedScene(scene('a', 90), { leadIn: 'drumFill' });
    expect(fill.leadIn).toBe('drumFill');
    expect(editedScene(fill, { name: 'Build' }).leadIn).toBe('drumFill');
    expect(editedScene(fill, { leadIn: 'rising' }).leadIn).toBe('rising');
    expect(editedScene(fill, { leadIn: 'none' })).toEqual(scene('a', 90));
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

describe('the piece — "on now" always comes from the plan at a start (R2-T2-01)', () => {
  const perf = { ...DEFAULT_PERFORMANCE, ending: 'auto' as const, style: 'fade' as const, fadePasses: 2, lengthSec: 420 };
  const plan = [scene('arrival', 0), scene('build', 90), scene('open', 210), scene('home', 360)];

  it('a start opens in the scene the plan has on at that moment, or in none', () => {
    expect(openingScene(plan, 0)).toBe(0);
    expect(openingScene(plan, 215)).toBe(2);
    expect(openingScene([scene('late', 10), scene('later', 90)], 0)).toBeNull();
    expect(openingScene([], 0)).toBeNull();
  });

  it("carrying on: the scene that was on wins only when it is later than the plan's", () => {
    expect(openingScene(plan, 100, 3)).toBe(3);   // a Next taken before the reload is kept
    expect(openingScene(plan, 215, 0)).toBe(2);   // never back to an earlier one
    expect(openingScene(plan, 100, 9)).toBe(1);   // a scene no longer there counts for nothing
    expect(openingScene([scene('late', 10)], 0, null)).toBeNull();
  });

  it('after any start the clock rule gets the opening scene or none, never a stale one: with the first scene at 0:10, it comes in at 0:10', () => {
    const scenes = [scene('a', 10), scene('b', 90), scene('c', 210)];
    // Before: "on now" was left on c from an earlier run, and a and b never came in.
    const current = openingScene(scenes, 0);
    expect(current).toBeNull();
    const tick = (from: number, to: number) => decideClockTick({
      prev: { remaining: 420 - from, elapsed: from }, now: { remaining: 420 - to, elapsed: to },
      scenes, current, performance: perf, passSec: 5, ending: false, autoEnded: false,
    });
    expect(tick(CLOCK_NOT_STARTED, 0.25).scene).toBeNull(); // no scene yet: Now reads "no scene"
    expect(tick(9.8, 10.05).scene).toBe(0);
    expect(decideClockTick({
      prev: { remaining: 330.2, elapsed: 89.8 }, now: { remaining: 329.9, elapsed: 90.1 },
      scenes, current: 0, performance: perf, passSec: 5, ending: false, autoEnded: false,
    }).scene).toBe(1);
  });

  it('adding a scene never marks it on now, and never changes which scene is on now', () => {
    const added = withSceneAdded(plan, null, scene('coda', 390));
    expect(added.scenes.map((s) => s.id)).toEqual(['arrival', 'build', 'open', 'home', 'coda']);
    expect(added.current).toBeNull();
    // During a run, the one on now stays on, wherever the new one sorts to.
    const during = withSceneAdded(plan, 2, scene('early', 30));
    expect(during.scenes.map((s) => s.id)).toEqual(['arrival', 'early', 'build', 'open', 'home']);
    expect(during.scenes[during.current ?? -1]?.id).toBe('open');
    const byHand = withSceneAdded(plan, 1, scene('spare', null));
    expect(byHand.scenes[byHand.current ?? -1]?.id).toBe('build');
  });
});

describe('the piece — how long before its end the ending begins, for a reload (R2-T3-01)', () => {
  it('at 90 BPM, 8 steps a pass and a 2-pass fade it is about 17 s, so Carry on stops at about 0:22 left', async () => {
    const { pieceEndingLeadSec } = await import('../songs/performance/piece');
    const perf = { ...DEFAULT_PERFORMANCE, style: 'fade' as const, fadePasses: 2 };
    expect(pieceEndingLeadSec(perf, 8, [90])).toBeCloseTo(16.8, 1);
  });

  it('is taken at the slowest tempo the piece can be at (the player’s own or any scene’s): the ending is never offered as later than it is', async () => {
    const { pieceEndingLeadSec } = await import('../songs/performance/piece');
    const perf = { ...DEFAULT_PERFORMANCE, style: 'fade' as const, fadePasses: 2 };
    expect(pieceEndingLeadSec(perf, 8, [90, 120, 60])).toBeCloseTo(pieceEndingLeadSec(perf, 8, [60]), 6);
    expect(pieceEndingLeadSec(perf, 8, [60])).toBeGreaterThan(pieceEndingLeadSec(perf, 8, [90]));
    // A tempo the engine would never play (below 20 BPM) counts as 20.
    expect(pieceEndingLeadSec(perf, 8, [5])).toBeCloseTo(pieceEndingLeadSec(perf, 8, [20]), 6);
  });
});

describe('the piece — the ending fits with the hat on Speed', () => {
  const perf = { ...DEFAULT_PERFORMANCE, style: 'fade' as const, fadePasses: 2 };
  const cap = { enabled: true, xRole: 'tempo', yRole: 'volume' };
  const base = { bpm: 90, scenes: [scene('a', 0)], cap, controlRanges: { tempo: { min: 40, max: 240 } } };

  it('the speeds the piece can be at include the hat’s Slowest when the hat is on Speed', async () => {
    const { pieceSpeeds } = await import('../songs/performance/piece');
    expect(pieceSpeeds(base)).toEqual([90, 96, 40]);
    expect(pieceSpeeds({ ...base, cap: { ...cap, xRole: 'volume', yRole: 'tempo' } })).toEqual([90, 96, 40]);
    expect(pieceSpeeds({ ...base, cap: { ...cap, xRole: 'volume', yRole: 'off' } })).toEqual([90, 96]);
    expect(pieceSpeeds({ ...base, cap: { ...cap, enabled: false } })).toEqual([90, 96]);
    // Typed the wrong way round, the lower of the two is the slowest.
    expect(pieceSpeeds({ ...base, controlRanges: { tempo: { min: 200, max: 50 } } })).toEqual([90, 96, 50]);
  });

  it('so the ending is timed for the hat at its slowest: a slowed piece still ends inside its length', async () => {
    const { pieceEndingLeadSec, pieceSpeeds } = await import('../songs/performance/piece');
    expect(pieceEndingLeadSec(perf, 8, pieceSpeeds(base))).toBeCloseTo(pieceEndingLeadSec(perf, 8, [40]), 6);
    expect(pieceEndingLeadSec(perf, 8, pieceSpeeds(base))).toBeGreaterThan(pieceEndingLeadSec(perf, 8, [90, 96]));
  });
});
