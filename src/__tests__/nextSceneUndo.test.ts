import { describe, it, expect } from 'vitest';
import { nextSceneUndo, nextUndoOffered } from '../ui/screens/boardSequencer/play/nextSceneUndo';

/**
 * B13 (audit 2026-10-30): Next scene changed the scene at one press with no Undo. Now, for
 * one pass, "Back to <scene>" returns to the scene before.
 */
describe('Next scene: Back to the scene before, for one pass (B13)', () => {
  const scenes = [{ name: 'Arrival' }, { name: 'Build' }, { name: 'Open' }];

  it('from a scene to the next: offers the scene before, until one pass has gone', () => {
    const u = nextSceneUndo(0, 1, scenes, 10_000, 5_000);
    expect(u).toEqual({ backTo: 0, name: 'Arrival', from: 1, untilMs: 15_000 });
    expect(nextUndoOffered(u, 14_999, 1)).toBe(true);
    expect(nextUndoOffered(u, 15_000, 1)).toBe(false);
  });

  it('nothing to go back to before the first scene, or when Next went nowhere', () => {
    expect(nextSceneUndo(null, 0, scenes, 0, 5_000)).toBeNull();
    expect(nextSceneUndo(2, null, scenes, 0, 5_000)).toBeNull();
    expect(nextSceneUndo(1, 1, scenes, 0, 5_000)).toBeNull();
  });

  it('gone as soon as another scene comes in (the clock, a jump, the iPad)', () => {
    const u = nextSceneUndo(0, 1, scenes, 0, 5_000);
    expect(nextUndoOffered(u, 1_000, 2)).toBe(false);
    expect(nextUndoOffered(null, 1_000, 1)).toBe(false);
  });

  it('a very short pass still leaves time to press it', () => {
    const u = nextSceneUndo(0, 1, scenes, 0, 800);
    expect(u?.untilMs).toBeGreaterThanOrEqual(3_000);
  });
});
