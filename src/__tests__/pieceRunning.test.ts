import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CARRY_ON_SPARE_SEC, forgetPieceRunning, readPieceRunning, rememberEnding, rememberPieceRunning, rememberScene, rememberShowing, reloadOffer } from '../songs/performance/pieceRunning';
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

  it("remembers that the ending has begun (End, the iPad's End piece, the automatic ending), until Cancel the ending (R2-T3-02)", () => {
    const t0 = Date.now() - 370_000;
    rememberPieceRunning(t0, 420, true, 3);
    expect(readPieceRunning()?.ending).toBeUndefined();
    rememberEnding(true);
    expect(readPieceRunning()).toEqual({ startedAt: t0, lengthSec: 420, show: true, scene: 3, ending: true });
    // Show and the scene, changed later, keep it.
    rememberShowing(false);
    rememberScene(2);
    expect(readPieceRunning()).toMatchObject({ show: false, scene: 2, ending: true });
    rememberEnding(false);
    expect(readPieceRunning()?.ending).toBeUndefined();
    // Nothing remembered: nothing to mark.
    forgetPieceRunning();
    rememberEnding(true);
    expect(readPieceRunning()).toBeNull();
  });
});

describe('after a reload: Carry on, or the piece has ended (R2-T3-01, R2-T3-02)', () => {
  const t0 = 1_000_000;
  const at = (sec: number) => t0 + sec * 1000;
  const piece = { startedAt: t0, lengthSec: 420, show: true };
  const lead = 17; // 90 BPM, 8 steps, a 2-pass fade: the ending starts 17 s before the end

  it("Carry on only while more is left than the ending's lead plus a few seconds for the sound to come back", () => {
    expect(CARRY_ON_SPARE_SEC).toBe(5);
    expect(reloadOffer(piece, at(105), lead)).toBe('carryOn');
    expect(reloadOffer(piece, at(390), lead)).toBe('carryOn');            // 0:30 left
    expect(reloadOffer(piece, at(420 - 22.01), lead)).toBe('carryOn');
    expect(reloadOffer(piece, at(420 - 22), lead)).toBe('ended');         // the offer stops at 0:22 left
    expect(reloadOffer(piece, at(414), lead)).toBe('ended');              // 6:54
    expect(reloadOffer(piece, at(407), lead)).toBe('ended');              // 6:47, the ending under way
  });

  it('once the ending had begun, never Carry on, however much time is left', () => {
    expect(reloadOffer({ ...piece, ending: true }, at(373), lead)).toBe('ended'); // End at 6:10, reload at 6:13
    expect(reloadOffer({ ...piece, ending: true }, at(30), lead)).toBe('ended');
  });

  it('a piece over (or none remembered) offers nothing', () => {
    expect(reloadOffer(piece, at(420), lead)).toBeNull();
    expect(reloadOffer({ ...piece, ending: true }, at(430), lead)).toBeNull();
    expect(reloadOffer(null, at(10), lead)).toBeNull();
  });
});
