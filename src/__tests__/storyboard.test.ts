/** K2 (Keep design, 5 Nov 2026): the storyboard's pure parts. */
import { describe, it, expect } from 'vitest';
import { cardWords, freeSceneName, giveTimes, joinWords, moveCard, sceneCards, waySteps, withFirstAtZero, withLength } from '../songs/performance/storyboard';
import { MAX_PIECE_SEC } from '../songs/performance/clock';
import type { Scene } from '../songs/performance/launcher';

const DEFAULTS = { sceneEnergy: 2 } as unknown as Scene['settings'];
const sc = (id: string, at: number | undefined, loops: number[] = [], energy = 2): Scene =>
  ({ id, name: id, loops, settings: { ...DEFAULTS, sceneEnergy: energy } as Scene['settings'], ...(at === undefined ? {} : { at }) });

describe('the storyboard (K2)', () => {
  it('cards: one per scene, the timed ones in order with their length to the next scene or the end, then any with no time; the one on now marked', () => {
    const cards = sceneCards([sc('a', 0, [0]), sc('b', 90, [0, 2]), sc('c', undefined)], 420, 1);
    expect(cards.map((c) => [c.index, c.name, c.at, c.lengthSec, c.loops, c.current])).toEqual([
      [0, 'a', 0, 90, [0], false],
      [1, 'b', 90, 330, [0, 2], true],
      [2, 'c', null, 0, [], false],
    ]);
    expect(cards[0].energy).toBe(2);
    expect(sceneCards([], 420, null)).toEqual([]);
  });

  it('giveTimes: an untimed scene lands after the last by the same gap; with no room it stays untimed, in last place', () => {
    expect(giveTimes([sc('a', 0), sc('b', 60), sc('c', undefined)], 420).map((s) => s.at)).toEqual([0, 60, 120]);
    expect(giveTimes([sc('a', 0), sc('c', undefined), sc('b', 60)], 420).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(giveTimes([sc('a', 0), sc('b', 415), sc('c', undefined)], 420).map((s) => s.at)).toEqual([0, 415, undefined]);
    expect(giveTimes([sc('x', undefined)], 420).map((s) => s.at)).toEqual([0]);
  });

  it('withLength: later scenes move by the difference, snapped to 5 s, never past the end; the last one clamped is named', () => {
    const r = withLength([sc('a', 0), sc('b', 90), sc('c', 210)], 0, 123, 420, 10);
    expect(r.scenes.map((s) => s.at)).toEqual([0, 125, 245]);
    expect(r.lengthSec).toBe(420);
    expect(r.said).toBeNull();
    const clamp = withLength([sc('a', 0), sc('b', 90), sc('c', 400)], 0, 300, 420, 10);
    expect(clamp.scenes.map((s) => s.at)).toEqual([0, 300, 410]);
    expect(clamp.said).toBe('c is now 0:10 long');
    // Shorter than a pass: a pass.
    expect(withLength([sc('a', 0), sc('b', 90)], 0, 2, 420, 10).scenes[1].at).toBe(10);
  });

  it('withLength on the last scene sets the piece length, within its limits', () => {
    const ok = withLength([sc('a', 0), sc('b', 90)], 1, 300, 420, 10);
    expect(ok.lengthSec).toBe(390);
    expect(ok.said).toBeNull();
    const tooLong = withLength([sc('a', 0), sc('b', 90)], 1, 400, 420, 10);
    expect(tooLong.lengthSec).toBe(420);
    expect(tooLong.scenes.map((s) => s.at)).toEqual([0, 90]);
    expect(tooLong.said).toContain(`at most`);
    expect(90 + 400).toBeGreaterThan(MAX_PIECE_SEC);
  });

  it('moveCard: arrows, Home and End, never past the ends; nothing else', () => {
    expect(moveCard(1, 'ArrowRight', 3)).toBe(2);
    expect(moveCard(2, 'ArrowRight', 3)).toBe(2);
    expect(moveCard(0, 'ArrowLeft', 3)).toBe(0);
    expect(moveCard(2, 'Home', 3)).toBe(0);
    expect(moveCard(0, 'End', 3)).toBe(2);
    expect(moveCard(0, 'Enter', 3)).toBeNull();
  });

  it('cardWords: the energy word, the world, then anything else the scene changes; energy Off says nothing', () => {
    const card = sceneCards([sc('a', 0, [], 3)], 420, null)[0];
    expect(cardWords(card, 'Warm', ['up a tone'])).toBe('Lively · Warm · up a tone');
    expect(cardWords(sceneCards([sc('a', 0, [], 0)], 420, null)[0], 'Warm', [])).toBe('Warm');
  });
});

describe('the way into a scene, on the join and in steps (K3)', () => {
  it('joinWords: the way in a word or two', () => {
    expect(joinWords({ kind: 'fade', passes: 1 })).toBe('fade 1');
    expect(joinWords({ kind: 'fade', passes: 2 })).toBe('fade 2');
    expect(joinWords({ kind: 'overlap', passes: 1 })).toBe('overlap 1');
    expect(joinWords({ kind: 'cut' })).toBe('cut');
  });

  it('waySteps: fade over the passes; overlap holds the leaving loops for the passes; cut does neither', () => {
    expect(waySteps({ kind: 'fade', passes: 1 }, 8)).toEqual({ fadeSteps: 8, holdOutSteps: 0 });
    expect(waySteps({ kind: 'fade', passes: 2 }, 8)).toEqual({ fadeSteps: 16, holdOutSteps: 0 });
    expect(waySteps({ kind: 'overlap', passes: 2 }, 8)).toEqual({ fadeSteps: 0, holdOutSteps: 16 });
    expect(waySteps({ kind: 'cut' }, 8)).toEqual({ fadeSteps: 0, holdOutSteps: 0 });
  });
});

describe('the review of 5 Nov: lengths stay inside the piece, the first scene stays at 0:00, every scene has a card', () => {
  it('withLength never pushes a later scene past the end: the length is capped so the later scenes keep a pass each, and none share a time', () => {
    const r = withLength([sc('a', 0), sc('b', 60)], 1, 600, 420, 10);
    expect(r.scenes.map((s) => s.at)).toEqual([0, 60]);
    expect(r.lengthSec).toBe(420);
    expect(r.said).toContain('at most');
    const mid = withLength([sc('a', 0), sc('b', 60), sc('c', 120)], 1, 400, 420, 10);
    expect(mid.scenes.map((s) => s.at)).toEqual([0, 60, 410]);
    expect(mid.said).toBe('c is now 0:10 long');
    const crowd = withLength([sc('a', 0), sc('b', 60), sc('c', 400), sc('d', 410)], 1, 400, 420, 10);
    expect(crowd.scenes.map((s) => s.at)).toEqual([0, 60, 400, 410]);
    expect(crowd.said).toBe('d is now 0:10 long');
    const pushed = withLength([sc('a', 0), sc('b', 60), sc('c', 100), sc('d', 110)], 0, 390, 420, 10);
    expect(pushed.scenes.map((s) => s.at)).toEqual([0, 390, 400, 410]);
  });

  it('withFirstAtZero: the earliest timed scene is moved to 0:00 (a deleted first scene, or an older piece)', () => {
    expect(withFirstAtZero([sc('b', 30), sc('c', 90)]).map((s) => s.at)).toEqual([0, 90]);
    expect(withFirstAtZero([sc('a', 0), sc('c', 90)]).map((s) => s.at)).toEqual([0, 90]);
    expect(withFirstAtZero([sc('x', undefined)]).map((s) => s.at)).toEqual([undefined]);
    // On load an older piece is left as it was made: a late first scene stays late (the editor offers the move).
    expect(giveTimes([sc('b', 30), sc('x', undefined)], 420).map((s) => s.at)).toEqual([30, 90]);
  });

  it('sceneCards: a scene with no time has a card too, after the timed ones, so it can be opened and deleted', () => {
    const cards = sceneCards([sc('a', 0, [0]), sc('x', undefined), sc('b', 90)], 420, null);
    expect(cards.map((c) => [c.index, c.name, c.at, c.lengthSec])).toEqual([[0, 'a', 0, 90], [2, 'b', 90, 330], [1, 'x', null, 0]]);
  });

  it('freeSceneName: "Scene N" one more than there are, skipping a name a scene already has', () => {
    expect(freeSceneName([sc('Scene 1', 0), sc('Scene 3', 60)])).toBe('Scene 4');
    expect(freeSceneName([sc('Arrival', 0), sc('Build', 60)])).toBe('Scene 3');
    expect(freeSceneName([])).toBe('Scene 1');
  });
});
