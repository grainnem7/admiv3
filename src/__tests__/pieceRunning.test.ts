import { describe, it, expect, beforeEach } from 'vitest';
import { forgetPieceRunning, readPieceRunning, rememberPieceRunning, rememberScene, rememberShowing } from '../songs/performance/pieceRunning';

describe('a piece remembered across a reload', () => {
  beforeEach(() => forgetPieceRunning());

  it('is remembered until it would be over, with whether Show was open', () => {
    const t0 = Date.now() - 30_000;
    rememberPieceRunning(t0, 60);
    expect(readPieceRunning(t0 + 30_000)).toEqual({ startedAt: t0, lengthSec: 60, show: false });
    rememberShowing(true);
    expect(readPieceRunning(t0 + 30_000)?.show).toBe(true);
    expect(readPieceRunning(t0 + 60_001)).toBeNull();
  });

  it('nothing remembered: nothing to carry on, and Show changes nothing', () => {
    rememberShowing(true);
    expect(readPieceRunning()).toBeNull();
  });

  it('remembers the scene that was playing, so a Next before the reload is kept', () => {
    rememberPieceRunning(Date.now() - 10_000, 60);
    rememberScene(2);
    rememberShowing(true);
    expect(readPieceRunning()).toMatchObject({ scene: 2, show: true });
    rememberScene(null); // between scenes: the last one stands
    expect(readPieceRunning()?.scene).toBe(2);
  });
});
