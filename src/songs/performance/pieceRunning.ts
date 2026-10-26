/**
 * A piece that is playing, remembered for this browser tab, so a reload mid-piece goes
 * straight back to the board (and into Show, if that's where it was) and can carry on
 * from where the clock would be. sessionStorage: a new tab or a closed browser starts fresh.
 */
const KEY = 'admi-piece-running';

export interface PieceRunning {
  startedAt: number;
  lengthSec: number;
  /** Show was open: carrying on goes back into it. */
  show: boolean;
}

export function rememberPieceRunning(startedAt: number, lengthSec: number, show = false): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ startedAt, lengthSec, show })); } catch { /* a reload just starts again */ }
}

export function forgetPieceRunning(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing remembered */ }
}

/** A piece that was playing and is not over yet, or null. */
export function readPieceRunning(now = Date.now()): PieceRunning | null {
  try {
    const o = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<PieceRunning> | null;
    if (!o || typeof o.startedAt !== 'number' || typeof o.lengthSec !== 'number') return null;
    return (now - o.startedAt) / 1000 < o.lengthSec ? { startedAt: o.startedAt, lengthSec: o.lengthSec, show: o.show === true } : null;
  } catch {
    return null;
  }
}

/** Whether Show is open, for the piece remembered now (nothing when none is). */
export function rememberShowing(show: boolean): void {
  const p = readPieceRunning();
  if (p && p.show !== show) rememberPieceRunning(p.startedAt, p.lengthSec, show);
}
