import { describe, it, expect, beforeEach, vi } from 'vitest';
import { forgetPieceRunning, readPieceRunning, rememberPieceRunning, rememberScene, rememberShowing } from '../songs/performance/pieceRunning';
import * as tabSaving from '../storage/tabSaving';

describe('a piece remembered across a reload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    forgetPieceRunning();
    sessionStorage.clear();
  });

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

  it('is kept by the browser, not the tab: a closed and reopened tab, or a crash, can still carry on (T3-08)', () => {
    const t0 = Date.now() - 12_000;
    rememberPieceRunning(t0, 420, true, 0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('admi-piece-running') ?? 'null')).toMatchObject({ startedAt: t0, lengthSec: 420 });
    // A new tab reads the same store.
    expect(readPieceRunning(t0 + 15_000)).toEqual({ startedAt: t0, lengthSec: 420, show: true, scene: 0 });
  });

  it('is forgotten when the piece ends or is stopped', () => {
    rememberPieceRunning(Date.now(), 420);
    forgetPieceRunning();
    expect(localStorage.getItem('admi-piece-running')).toBeNull();
    expect(readPieceRunning()).toBeNull();
  });

  it('a tab that waits for another tab of ADMI remembers nothing, and forgets nothing', () => {
    rememberPieceRunning(Date.now() - 5_000, 420);
    vi.spyOn(tabSaving, 'canSave').mockReturnValue(false);
    rememberPieceRunning(Date.now(), 60);
    forgetPieceRunning();
    expect(readPieceRunning()).toMatchObject({ lengthSec: 420 });
  });
});
