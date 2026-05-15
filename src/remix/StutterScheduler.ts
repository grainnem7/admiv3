/**
 * StutterScheduler — beat-synced one-shot slice re-trigger for one stem.
 *
 * The window math is pure (computeStutterWindow). The class wraps a
 * dedicated short looping AudioBufferSource that overlays the stem for
 * one bar; the stem's main source never stops, so playback is still
 * sample-aligned when the overlay ends (no re-sync needed).
 */

export interface StutterWindow {
  /** Playback-seconds at which the burst begins (next beat boundary). */
  startSec: number;
  /** Length of one repeated slice (≈ half a beat). */
  sliceDurSec: number;
  /** Total burst length (one bar; fallback 4 beats). */
  burstDurSec: number;
}

const DEFAULT_BEAT_DUR_SEC = 0.5;

/** Next beat strictly-or-equal at/after `nowSec`; extrapolates past end. */
function nextBeatAtOrAfter(beats: readonly number[], nowSec: number): number {
  if (beats.length === 0) return nowSec;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i] >= nowSec) return beats[i];
  }
  const interval =
    beats.length >= 2
      ? beats[beats.length - 1] - beats[beats.length - 2]
      : DEFAULT_BEAT_DUR_SEC;
  return beats[beats.length - 1] + interval;
}

/** Local beat interval near `nowSec` (gap to the following beat). */
function localBeatInterval(beats: readonly number[], nowSec: number): number {
  if (beats.length < 2) return DEFAULT_BEAT_DUR_SEC;
  for (let i = 0; i < beats.length - 1; i++) {
    if (beats[i + 1] > nowSec) return beats[i + 1] - beats[i];
  }
  return beats[beats.length - 1] - beats[beats.length - 2];
}

/** One bar = downbeat-to-downbeat spanning startSec; fallback 4 beats. */
function barDuration(
  downbeats: readonly number[],
  beatInterval: number,
  startSec: number,
): number {
  if (downbeats.length >= 2) {
    for (let i = 0; i < downbeats.length - 1; i++) {
      if (downbeats[i + 1] > startSec) {
        return downbeats[i + 1] - downbeats[i];
      }
    }
    return downbeats[downbeats.length - 1] - downbeats[downbeats.length - 2];
  }
  return beatInterval * 4;
}

export function computeStutterWindow(
  nowSec: number,
  beats: readonly number[],
  downbeats: readonly number[],
): StutterWindow {
  const startSec = nextBeatAtOrAfter(beats, nowSec);
  const beatInterval = localBeatInterval(beats, nowSec);
  const sliceDurSec = beatInterval / 2;
  const burstDurSec = barDuration(downbeats, beatInterval, startSec);
  return { startSec, sliceDurSec, burstDurSec };
}

/**
 * Owns the overlay buffer source for an in-flight burst on one stem.
 * Construction is deferred to RemixEngine which has the AudioContext,
 * the stem buffer, and the stem gain node.
 */
export class StutterScheduler {
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  /**
   * Begin a burst. `startOverlay` is invoked synchronously to create the
   * overlay source. Returns false if a burst is already in flight (one
   * per stem at a time).
   */
  begin(
    win: StutterWindow,
    startOverlay: (win: StutterWindow) => void,
  ): boolean {
    if (this.active) return false;
    this.active = true;
    startOverlay(win);
    return true;
  }

  /** Call each frame with current playback seconds; ends the burst. */
  tick(
    playbackNowSec: number,
    win: StutterWindow,
    stopOverlay: () => void,
  ): void {
    if (!this.active) return;
    if (playbackNowSec >= win.startSec + win.burstDurSec) {
      stopOverlay();
      this.active = false;
    }
  }

  forceStop(stopOverlay: () => void): void {
    if (!this.active) return;
    stopOverlay();
    this.active = false;
  }
}
