/**
 * RemixBaton — per-baton state machine for the Remix screen.
 *
 * One baton owns one stem at a time and cycles through the four stems
 * with a dwell gesture. While present it writes its stem's filterNorm
 * from Y; a fast-shake fires a one-shot stutter. Absent → writes null
 * (the engine latches the stem). Pure logic; no Web Audio.
 */

import type { ColorRole } from '../songs/songLibrary';
import { DwellDetector } from '../movement/DwellDetector';
import { ShakeDetector } from './ShakeDetector';
import { applyAxisCalibration, type AxisRange } from './batonCalibration';

export type StemId = 'vocals' | 'drums' | 'bass' | 'other';

/** Fixed cycle order; wraps. */
export const STEM_CYCLE_ORDER: readonly StemId[] = [
  'vocals',
  'drums',
  'bass',
  'other',
];

/** Dwell hold time (ms) before a baton cycles to the next stem. */
const DWELL_TIME_MS = 1200;
/** Radius (normalised) within which the baton still counts as dwelling. */
const DWELL_RADIUS = 0.05;
/** Dwell re-arm cooldown (ms) after a cycle fires. */
const DWELL_COOLDOWN_MS = 600;
/**
 * If two consecutive update() frames are further apart than this, the
 * elapsed-time DwellDetector would accumulate a phantom completed dwell
 * from a single stale frame. Reset it instead. Derived from the dwell
 * time plus headroom so it always exceeds a legitimate dwell window;
 * only reachable far below the 60 fps design contract (≈ <2.5 fps) or
 * in tests — the `!found` branch already resets on real baton absence.
 */
const GAP_RESET_MS = DWELL_TIME_MS + 300;

export interface BatonInput {
  x: number;
  y: number;
  found: boolean;
}

export interface RemixBatonOutput {
  /** The stem this baton currently controls. */
  stem: StemId;
  /** filterNorm 0–1 to write to that stem, or null when absent (latch). */
  filterNorm: number | null;
  /** True only on the frame a cycle fired (engine applies glide-takeover). */
  cycled: boolean;
  /** True only on the frame a stutter should fire. */
  stutter: boolean;
  /** Dwell ring progress 0–1 for visual feedback. */
  dwellProgress: number;
}

/** Frame-to-frame travel scaled to ~0–1, matching SongPresetEngine. */
function normalizedVelocity(
  px: number,
  py: number,
  x: number,
  y: number,
): number {
  const dx = x - px;
  const dy = y - py;
  const raw = Math.sqrt(dx * dx + dy * dy);
  return Math.min(1, raw * 15);
}

export class RemixBaton {
  readonly role: ColorRole;
  private stemIndex = 0;
  private dwell = new DwellDetector({
    dwellRadius: DWELL_RADIUS,
    dwellTimeMs: DWELL_TIME_MS,
    cooldownMs: DWELL_COOLDOWN_MS,
  });
  private shake = new ShakeDetector({ threshold: 0.55, cooldownMs: 600 });

  private calX: AxisRange | null = null;
  private calY: AxisRange | null = null;
  private reachMargin = 0.1;
  private dwellCycleEnabled = true;
  private lastInput: BatonInput = { x: 0.5, y: 0.5, found: false };

  private prevX = 0.5;
  private prevY = 0.5;
  private smoothVel = 0;
  /** Timestamp of the last update call, used to detect large time gaps. */
  private prevFrameMs = -1;

  /**
   * Guard against double-cycle: DwellDetector returns state='triggered'
   * on two consecutive frames (once from handleDwelling and once from
   * the triggered→cooldown transition). We only advance the stem index
   * once per trigger event.
   */
  private triggeredPending = false;

  constructor(role: ColorRole) {
    this.role = role;
  }

  get assignedStem(): StemId {
    return STEM_CYCLE_ORDER[this.stemIndex];
  }

  setCalibration(cal: { x: AxisRange | null; y: AxisRange | null }, margin: number): void {
    this.calX = cal.x;
    this.calY = cal.y;
    this.reachMargin = margin;
  }

  setDwellCycleEnabled(enabled: boolean): void {
    this.dwellCycleEnabled = enabled;
    if (!enabled) this.dwell.reset();
  }

  centroid(): BatonInput {
    return { ...this.lastInput };
  }

  update(input: BatonInput, nowMs: number): RemixBatonOutput {
    const stem = this.assignedStem;

    if (!input.found) {
      // Absent → detectors idle, nothing written, stem latches.
      this.lastInput = { x: input.x, y: input.y, found: false };
      this.smoothVel = this.smoothVel * 0.7;
      this.dwell.reset();
      this.triggeredPending = false;
      this.prevFrameMs = -1;
      return {
        stem,
        filterNorm: null,
        cycled: false,
        stutter: false,
        dwellProgress: 0,
      };
    }

    // Apply per-axis calibration so a player's limited range maps to full 0–1.
    const cx = applyAxisCalibration(input.x, this.calX, this.reachMargin);
    const cy = applyAxisCalibration(input.y, this.calY, this.reachMargin);
    this.lastInput = { x: cx, y: cy, found: true };

    // See GAP_RESET_MS docblock — reset dwell if this frame arrived too late.
    const frameGap = this.prevFrameMs < 0 ? 0 : nowMs - this.prevFrameMs;
    if (frameGap > GAP_RESET_MS) {
      this.dwell.reset();
      this.triggeredPending = false;
    }
    this.prevFrameMs = nowMs;

    // Velocity (smoothed) for the shake detector.
    // Faster smoothing than walk-mode (SongPresetEngine uses 0.15/0.3):
    // remix shake gestures are deliberate and short, so respond quicker.
    const inst = normalizedVelocity(this.prevX, this.prevY, cx, cy);
    this.smoothVel = this.smoothVel + (inst - this.smoothVel) * 0.4;
    this.prevX = cx;
    this.prevY = cy;

    const stutter = this.shake.update(this.smoothVel, nowMs);

    // DwellDetector uses `!this.dwellStartTime` as a null-guard, which
    // incorrectly treats timestamp=0 as unset. Offset by 1ms to avoid the
    // falsy-zero bug without changing any observable timing behaviour.
    const dwellRes = this.dwell.update({ x: cx, y: cy }, nowMs + 1);

    let cycled = false;
    if (this.dwellCycleEnabled && dwellRes.state === 'triggered') {
      if (!this.triggeredPending) {
        // First triggered frame: advance the stem index, then reset the dwell
        // so that any subsequent update call (even far in the future) starts
        // a fresh dwell rather than instantly re-triggering due to accumulated
        // time since the last dwell position.
        this.stemIndex = (this.stemIndex + 1) % STEM_CYCLE_ORDER.length;
        cycled = true;
        this.triggeredPending = true;
        this.dwell.reset();
      }
      // Second triggered frame (before DwellDetector transitions to cooldown):
      // triggeredPending is already true so we skip advancing again.
    } else if (dwellRes.state !== 'triggered') {
      // Once we leave the triggered state, clear the guard.
      this.triggeredPending = false;
    }

    // posY: 0 = top of frame → open (filterNorm 1); 1 = bottom → 0.
    const filterNorm = 1 - Math.min(1, Math.max(0, cy));

    return {
      stem: cycled ? this.assignedStem : stem,
      filterNorm,
      cycled,
      stutter,
      dwellProgress: dwellRes.progress,
    };
  }

  reset(): void {
    this.stemIndex = 0;
    this.dwell.reset();
    this.shake.reset();
    this.smoothVel = 0;
    this.prevX = 0.5;
    this.prevY = 0.5;
    this.triggeredPending = false;
    this.prevFrameMs = -1;
  }
}
