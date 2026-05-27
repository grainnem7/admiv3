/**
 * RemixLoopBaton — maps the loop baton's calibrated centroid to a loop
 * selection + volume. X picks among N equally-wide zones (one per loop)
 * with boundary hysteresis so a drifting hand doesn't flicker between
 * loops; Y is the loop volume; presence brings the layer in/out.
 */

import { applyAxisCalibration, type AxisRange } from './batonCalibration';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Pick a loop index from a 0–1 X value across `n` equal zones.
 * @param current the previously-selected index, or -1 to snap directly.
 * @param hysteresis margin past a zone boundary required to switch.
 */
export function selectLoopZone(x: number, n: number, current: number, hysteresis: number): number {
  if (n <= 1) return 0;
  const cx = clamp01(x);
  const direct = Math.min(n - 1, Math.max(0, Math.floor(cx * n)));
  if (current < 0 || current > n - 1) return direct;
  const lower = current / n;
  const upper = (current + 1) / n;
  if (cx > upper + hysteresis) return direct;
  if (cx < lower - hysteresis) return direct;
  return current;
}

export interface RemixLoopBatonOutput {
  present: boolean;
  loopIndex: number; // 0..count-1; latched when absent
  volume: number;    // 0..1
}

const REACH_MARGIN = 0.1;   // matches the stem batons' forgiving extremes
const ZONE_HYSTERESIS = 0.04;

export interface Centroid {
  x: number;
  y: number;
}

export class RemixLoopBaton {
  private loopCount = 1;
  private xRange: AxisRange | null = null;
  private yRange: AxisRange | null = null;
  private currentIndex = -1;
  private lastVolume = 0;

  setLoopCount(n: number): void {
    this.loopCount = Math.max(1, Math.floor(n));
    if (this.currentIndex > this.loopCount - 1) this.currentIndex = this.loopCount - 1;
  }

  setCalibration(x: AxisRange | null, y: AxisRange | null): void {
    this.xRange = x;
    this.yRange = y;
  }

  /**
   * Seed the selected index (e.g. after a keyboard cycle) so that when the
   * baton next appears, hysteresis continues from this loop rather than
   * snapping from a stale value.
   */
  setCurrentIndex(i: number): void {
    this.currentIndex = Math.max(0, Math.min(this.loopCount - 1, Math.floor(i)));
  }

  process(centroid: Centroid | null): RemixLoopBatonOutput {
    if (!centroid) {
      return {
        present: false,
        loopIndex: Math.max(0, this.currentIndex),
        volume: this.lastVolume,
      };
    }
    const x = applyAxisCalibration(centroid.x, this.xRange, REACH_MARGIN);
    const y = applyAxisCalibration(centroid.y, this.yRange, REACH_MARGIN);
    this.currentIndex = selectLoopZone(x, this.loopCount, this.currentIndex, ZONE_HYSTERESIS);
    this.lastVolume = y;
    return { present: true, loopIndex: this.currentIndex, volume: y };
  }
}
