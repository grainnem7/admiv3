import { describe, it, expect } from 'vitest';
import { copyName, dragTime, duplicateScene, sceneLengthSec } from '../songs/performance/sceneTools';
import { MAX_SCENES, type Scene } from '../songs/performance/launcher';

const settings = { sceneEnergy: 2 } as unknown as Scene['settings'];
const scene = (id: string, name: string, at: number | null, extra: Partial<Scene> = {}): Scene => ({ id, name, loops: [0], settings, at, ...extra });
const scenes = [scene('a', 'Arrival', 0), scene('b', 'Build', 90), scene('c', 'Open', 210, { ideas: 7, aiIdeas: [] }), scene('d', 'Home', 360)];

describe('a scene’s length (item 7)', () => {
  it('runs until the next timed scene, or the end of the piece', () => {
    expect(sceneLengthSec(scenes, 0, 420)).toBe(90);
    expect(sceneLengthSec(scenes, 2, 420)).toBe(150);
    expect(sceneLengthSec(scenes, 3, 420)).toBe(60);
  });

  it('a scene brought in by hand has no length', () => {
    expect(sceneLengthSec([scene('x', 'By hand', null)], 0, 420)).toBeNull();
  });
});

describe('Duplicate scene (item 7)', () => {
  it('puts a copy right after the original, halfway through it (K2), with a numbered name, its ideas not copied', () => {
    const out = duplicateScene(scenes, 2, 'c2', 420, 10)!;
    expect(out.map((s) => s.name)).toEqual(['Arrival', 'Build', 'Open', 'Open 2', 'Home']);
    const copy = out[3];
    expect(copy.id).toBe('c2');
    // Open runs 210 to 360: the copy takes its second half.
    expect(copy.at).toBe(285);
    expect(copy.loops).toEqual([0]);
    expect(copy.loops).not.toBe(scenes[2].loops);
    expect(copy.ideas).toBeUndefined();
    expect(copy.aiIdeas).toBeUndefined();
  });

  it('the copy lands on a 5 s step; a scene under two passes long, or one with no time, is not split', () => {
    expect(duplicateScene([scene('a', 'A', 0), scene('b', 'B', 15)], 0, 'x', 420, 5)!.map((s) => s.at)).toEqual([0, 5, 15]);
    expect(duplicateScene([scene('a', 'A', 0), scene('b', 'B', 20)], 0, 'x', 420, 10)!.map((s) => s.at)).toEqual([0, 10, 20]);
    expect(duplicateScene([scene('a', 'A', 0), scene('b', 'B', 12)], 0, 'x', 420, 10)).toBeNull();
    expect(duplicateScene([scene('a', 'A', null)], 0, 'x', 420, 10)).toBeNull();
  });

  it('a full piece takes no more', () => {
    const full = Array.from({ length: MAX_SCENES }, (_, i) => scene(`s${i}`, `S${i}`, i * 10));
    expect(duplicateScene(full, 0, 'x', 420, 1)).toBeNull();
  });

  it('names never collide and never run past 24 letters', () => {
    expect(copyName('Build', ['Build', 'Build 2'])).toBe('Build 3');
    expect(copyName('Build 2', ['Build 2'])).toBe('Build 3');
    expect(copyName('A very very long scene name', []).length).toBeLessThanOrEqual(24);
  });
});

describe('dragging a scene’s mark along the timeline (item 7)', () => {
  it('snaps to 5 s and stays between its neighbours', () => {
    expect(dragTime(250, 1000, 420, 0, 210)).toBe(105);
    expect(dragTime(0, 1000, 420, 0, 210)).toBe(5);
    expect(dragTime(999, 1000, 420, 0, 210)).toBe(205);
  });

  it('the last scene can go up to 5 s before the end', () => {
    expect(dragTime(1000, 1000, 420, 210, null)).toBe(415);
  });

  it('the first scene stays at 0:00', () => {
    expect(dragTime(500, 1000, 420, null, 90)).toBe(0);
  });
});
