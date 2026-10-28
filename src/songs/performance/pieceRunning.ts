import { canSave } from '../../storage/tabSaving';

/**
 * A piece that is playing, remembered by the browser, so a reload mid-piece goes straight
 * back to the board (and into Show, if that's where it was) and can carry on from where
 * the clock would be. Kept in localStorage with the time it started: a closed and reopened
 * tab, or a browser that crashed, can carry on too while the piece would still be playing
 * (T3-08); after its length it is over and nothing is offered. Kept in the tab alone
 * (sessionStorage), a closed tab lost it. Only the tab that saves writes it, so a second
 * tab of ADMI never changes it (src/storage/tabSaving.ts), and it is forgotten when the
 * piece ends or is stopped.
 */
const KEY = 'admi-piece-running';

export interface PieceRunning {
  startedAt: number;
  lengthSec: number;
  /** Show was open: carrying on goes back into it. */
  show: boolean;
  /** The scene playing (after a Next, ahead of the plan), so carrying on doesn't lose it. */
  scene?: number;
}

export function rememberPieceRunning(startedAt: number, lengthSec: number, show = false, scene?: number): void {
  if (!canSave()) return;
  try { localStorage.setItem(KEY, JSON.stringify({ startedAt, lengthSec, show, scene })); } catch { /* a reload just starts again */ }
}

export function forgetPieceRunning(): void {
  if (!canSave()) return;
  try { localStorage.removeItem(KEY); } catch { /* nothing remembered */ }
}

/** A piece that was playing and is not over yet, or null. */
export function readPieceRunning(now = Date.now()): PieceRunning | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PieceRunning> | null;
    if (!o || typeof o.startedAt !== 'number' || typeof o.lengthSec !== 'number') return null;
    if ((now - o.startedAt) / 1000 >= o.lengthSec) return null;
    const scene = typeof o.scene === 'number' && o.scene >= 0 ? Math.round(o.scene) : undefined;
    return { startedAt: o.startedAt, lengthSec: o.lengthSec, show: o.show === true, ...(scene !== undefined ? { scene } : {}) };
  } catch {
    return null;
  }
}

/** Whether Show is open, for the piece remembered now (nothing when none is). */
export function rememberShowing(show: boolean): void {
  const p = readPieceRunning();
  if (p && p.show !== show) rememberPieceRunning(p.startedAt, p.lengthSec, show, p.scene);
}

/** The scene playing now, for the piece remembered now (nothing when none is). */
export function rememberScene(scene: number | null): void {
  const p = readPieceRunning();
  if (p && scene !== null && p.scene !== scene) rememberPieceRunning(p.startedAt, p.lengthSec, p.show, scene);
}
