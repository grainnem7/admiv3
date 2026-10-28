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
  /** When the piece first started (Date.now()): carrying on keeps it, so the end never moves. */
  startedAt: number;
  lengthSec: number;
  /** Show was open: carrying on goes back into it. */
  show: boolean;
  /** The scene playing (after a Next, ahead of the plan), so carrying on doesn't lose it. */
  scene?: number;
  /** The ending had begun (End, the iPad's End piece, or by itself): a reload ends the piece. */
  ending?: boolean;
}

function write(p: PieceRunning): void {
  if (!canSave()) return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* a reload just starts again */ }
}

export function rememberPieceRunning(startedAt: number, lengthSec: number, show = false, scene?: number): void {
  write({ startedAt, lengthSec, show, scene });
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
    return {
      startedAt: o.startedAt, lengthSec: o.lengthSec, show: o.show === true,
      ...(scene !== undefined ? { scene } : {}),
      ...(o.ending === true ? { ending: true } : {}),
    };
  } catch {
    return null;
  }
}

/** Whether Show is open, for the piece remembered now (nothing when none is). */
export function rememberShowing(show: boolean): void {
  const p = readPieceRunning();
  if (p && p.show !== show) write({ ...p, show });
}

/** The scene playing now, for the piece remembered now (nothing when none is). */
export function rememberScene(scene: number | null): void {
  const p = readPieceRunning();
  if (p && scene !== null && p.scene !== scene) write({ ...p, scene });
}

/**
 * The ending has begun (true) or been cancelled (false), for the piece remembered now. A
 * fade can't be picked up at the level it had reached after a reload, and starting it
 * again from full was louder and ran past the end (R2-T3-01), or forgot End (R2-T3-02).
 */
export function rememberEnding(on: boolean): void {
  const p = readPieceRunning();
  if (!p || (p.ending === true) === on) return;
  const { ending: _was, ...rest } = p;
  write(on ? { ...rest, ending: true } : rest);
}

/**
 * The seconds Carry on needs before the ending would begin: the sound takes 1.3–2.3 s to
 * come back after a reload, and the ending must start on time after that.
 */
export const CARRY_ON_SPARE_SEC = 5;

/**
 * What a reload, a closed tab or a crash offers for the piece remembered: 'carryOn' while
 * no ending had begun and more is left than the ending's lead (`endingLeadSec`, see
 * clock.ts) plus CARRY_ON_SPARE_SEC; otherwise the piece 'ended' — a few seconds early, in
 * silence, rather than louder or past its length. null: no piece, or it is over.
 */
export function reloadOffer(p: PieceRunning | null, nowMs: number, endingLeadSec: number): 'carryOn' | 'ended' | null {
  if (!p) return null;
  const left = p.lengthSec - (nowMs - p.startedAt) / 1000;
  if (left <= 0) return null;
  if (p.ending === true) return 'ended';
  return left > endingLeadSec + CARRY_ON_SPARE_SEC ? 'carryOn' : 'ended';
}
