import { describe, it, expect } from 'vitest';
import {
  ENERGY_LEVELS, energyBandGain, energyMixGain, energyBrightHz, energyExtras, energyLine, energyShape, sanitizeSceneEnergy,
} from '../songs/performance/energy';
import {
  freshIdeas, ideaKey, ideasFor, keepIdea, MAX_IDEA_NOTES, MAX_KEPT_IDEAS, mixSeeds, sanitizeIdeas, sanitizeKeptIdeas, sceneIdeas, withIdeas,
  type KeptIdea,
} from '../songs/performance/ideas';
import { bandEventsAtStep, grooveHits, type BandInput } from '../songs/band/band';
import { withTuneDefault } from '../songs/beyondLoop';
import type { FillNote } from '../songs/generative/rulesFill';

/** Harmony spec stage 3: a shape across the piece (Energy), and an AI that repeats (ideas). */

describe('Energy, 1 to 5', () => {
  it('off is as before: nothing moves', () => {
    expect(energyShape(0)).toBeNull();
    expect(energyBandGain(0)).toBe(1);
    expect(energyMixGain(0)).toBe(1);
    expect(energyExtras(0.4, 0)).toBe(0.4);
    expect(energyBrightHz(0, 6500)).toBe(6500);
  });

  it('level, busyness, extra notes and brightness all rise with Energy', () => {
    for (let k = 1; k < ENERGY_LEVELS.length; k++) {
      const lo = ENERGY_LEVELS[k - 1];
      const hi = ENERGY_LEVELS[k];
      expect(energyMixGain(hi)).toBeGreaterThan(energyMixGain(lo));
      expect(energyBandGain(hi)).toBeGreaterThan(energyBandGain(lo));
      expect(energyShape(hi)!.drumsBusy).toBeGreaterThanOrEqual(energyShape(lo)!.drumsBusy);
      expect(energyExtras(0.4, hi)).toBeGreaterThan(energyExtras(0.4, lo));
      expect(energyBrightHz(hi, 20000)).toBeGreaterThan(energyBrightHz(lo, 20000));
    }
    // 3 is the band as set.
    expect(energyBandGain(3)).toBe(1);
  });

  it('never turns extra notes on, never above all, and never brighter than the world', () => {
    expect(energyExtras(0, 5)).toBe(0);
    expect(energyExtras(0.9, 5)).toBe(1);
    expect(energyBrightHz(5, 6500)).toBe(6500);
  });

  it('keeps headroom: at 5 the band is at most 3 dB over its usual', () => {
    expect(20 * Math.log10(energyBandGain(5))).toBeLessThanOrEqual(3.0001);
  });

  it('a stored Energy is made safe; anything else (or none) is off', () => {
    expect(sanitizeSceneEnergy(4)).toBe(4);
    for (const bad of [undefined, null, -1, 6, 2.5, '3']) expect(sanitizeSceneEnergy(bad)).toBe(0);
  });

  it('the line across the piece follows the scenes in time', () => {
    const s = (name: string, at: number | null, e: 0 | 1 | 2 | 3 | 4 | 5) => ({ name, at, settings: { sceneEnergy: e } });
    expect(energyLine([s('Open', 210, 5), s('Arrival', 0, 2), s('Hand', null, 4)]))
      .toEqual([{ name: 'Arrival', at: 0, energy: 2 }, { name: 'Open', at: 210, energy: 5 }]);
  });
});

describe('the band’s drums at each Energy', () => {
  const C = { root: 60, tones: [60, 64, 67] };
  const input = (over: Partial<BandInput>): BandInput => ({
    level: 'full', step: 0, loop: 16, style: 'warm', harmony: C, chordChange: true, chordSpan: 4,
    playerRoles: new Set(), playerCounters: 1, jobs: { asBefore: false, pads: false, bass: false, drums: true, counter: true }, ...over,
  });
  const hitsOverPass = (over: Partial<BandInput>): number => {
    let n = 0;
    for (let step = 0; step < 16; step++) n += bandEventsAtStep(input({ ...over, step, chordChange: step % 4 === 0 })).filter((e) => e.part === 'groove').length;
    return n;
  };

  it('sparser below, busier above, at Quiet and at Full; 0 is as before', () => {
    for (const level of ['gentle', 'full'] as const) {
      const n = [-2, -1, 0, 1].map((busy) => hitsOverPass({ level, busy }));
      for (let k = 1; k < n.length; k++) expect(n[k]).toBeGreaterThan(n[k - 1]);
      expect(hitsOverPass({ level })).toBe(n[2]);
    }
    expect(grooveHits('warm', false, 0).filter((h) => h.drum === 'hat')).toHaveLength(8);
  });

  it('at a low Energy the counter-melody keeps to the main beats, even at Full', () => {
    const counters = (busy: number): number[] => {
      const out: number[] = [];
      for (let step = 0; step < 16; step++) {
        if (bandEventsAtStep(input({ step, busy, chordChange: false })).some((e) => e.part === 'counter')) out.push(step);
      }
      return out;
    };
    expect(counters(0).length).toBeGreaterThan(counters(-1).length);
    for (const step of counters(-1)) expect(step % 2).toBe(0);
  });
});

describe('ideas: the seed of every random choice', () => {
  it('none (0) leaves a seed exactly as it was: pieces saved before play as before', () => {
    expect(mixSeeds(0, 0)).toBe(0);
    expect(withIdeas(1234, 0)).toBe(1234);
    expect(sceneIdeas(0, {})).toBe(0);
    expect(sceneIdeas(0, null)).toBe(0);
  });

  it('the same ideas, the same seed; other ideas, another', () => {
    expect(withIdeas(1, 77)).toBe(withIdeas(1, 77));
    expect(withIdeas(1, 77)).not.toBe(withIdeas(1, 78));
    expect(sceneIdeas(5, { ideas: 9 })).not.toBe(sceneIdeas(5, {}));
    expect(sceneIdeas(5, { ideas: 9 })).not.toBe(sceneIdeas(6, { ideas: 9 }));
    expect(mixSeeds(3, 4)).toBeGreaterThan(0);
  });

  it('New ideas is never 0 ("as before")', () => {
    expect(freshIdeas(() => 0)).toBeGreaterThan(0);
    expect(freshIdeas(() => 0.999999)).toBeLessThanOrEqual(0x7fffffff);
  });

  it('the scene on now owns the ideas; plain Play has the piece’s and keeps none', () => {
    const scenes = [{ id: 'a' }, { id: 'b', ideas: 42 }];
    expect(ideasFor({ pieceIdeas: 7, currentScene: 1, scenes })).toEqual({ seed: mixSeeds(7, 42), owner: 'b' });
    expect(ideasFor({ pieceIdeas: 7, currentScene: null, scenes })).toEqual({ seed: mixSeeds(7, 0), owner: null });
    expect(ideasFor({ pieceIdeas: 0, currentScene: 0, scenes })).toEqual({ seed: 0, owner: 'a' });
  });

  it('a stored ideas number is made safe', () => {
    expect(sanitizeIdeas(12)).toBe(12);
    for (const bad of [undefined, -3, 0, 1.5, 'x', 2 ** 33]) expect(sanitizeIdeas(bad)).toBe(0);
  });
});

describe('Magenta’s ideas, kept per scene', () => {
  const note = (step: number): FillNote => ({ step, offset: 0, role: 'melody', colour: 'm', midi: 72, dur: 0.5, accent: 0.6, cell: { row: 1, col: step }, rule: 'ai' });
  const idea = (key: string, n = 2): KeptIdea => ({ key, notes: Array.from({ length: n }, (_, i) => note(i)) });

  it('the same board’s idea is replaced; a few at most, the newest kept', () => {
    let list: KeptIdea[] = [];
    for (let i = 0; i < MAX_KEPT_IDEAS + 3; i++) list = keepIdea(list, idea(`k${i}`));
    expect(list).toHaveLength(MAX_KEPT_IDEAS);
    expect(list[list.length - 1].key).toBe(`k${MAX_KEPT_IDEAS + 2}`);
    list = keepIdea(list, idea(`k${MAX_KEPT_IDEAS + 2}`, 5));
    expect(list).toHaveLength(MAX_KEPT_IDEAS);
    expect(list[list.length - 1].notes).toHaveLength(5);
    expect(keepIdea([], idea('big', MAX_IDEA_NOTES + 40))[0].notes).toHaveLength(MAX_IDEA_NOTES);
  });

  it('a key names a board: the same text, the same key', () => {
    expect(ideaKey('abc')).toBe(ideaKey('abc'));
    expect(ideaKey('abc')).not.toBe(ideaKey('abd'));
    expect(ideaKey('x'.repeat(5000))).toHaveLength(16);
  });

  it('from storage: only well-formed ideas survive', () => {
    expect(sanitizeKeptIdeas(undefined)).toEqual([]);
    expect(sanitizeKeptIdeas([{ key: 'a', notes: [note(0)] }, { key: '', notes: [note(1)] }, { key: 'b', notes: 'x' }, 7]))
      .toEqual([{ key: 'a', notes: [note(0)] }]);
  });
});

type Plays = { role: 'melody' | 'bass' | 'chord' | 'drums'; plays?: 'note' | 'tune' };
const ch = (role: Plays['role'], plays?: Plays['plays']): Plays => (plays ? { role, plays } : { role });

describe('tunes made easy', () => {
  it('a new player’s melody, bass and chords colours play tunes; drums and chosen ones are left', () => {
    expect(withTuneDefault(ch('melody'), true).plays).toBe('tune');
    expect(withTuneDefault(ch('bass'), true).plays).toBe('tune');
    expect(withTuneDefault(ch('chord'), true).plays).toBe('tune');
    expect(withTuneDefault(ch('drums'), true).plays).toBeUndefined();
    expect(withTuneDefault(ch('melody', 'note'), true).plays).toBe('note');
  });

  it('an existing player keeps theirs', () => {
    expect(withTuneDefault(ch('melody'), false).plays).toBeUndefined();
  });
});
