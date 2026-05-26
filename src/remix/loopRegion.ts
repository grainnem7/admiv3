/**
 * loopRegion — pure bar-snap math for the Remix loop window.
 *
 * A "bar" is the span between consecutive downbeats. The loop window is
 * `lengthBars` bars starting at downbeat index `originBar`. All times are
 * downbeat timestamps, so loops are always musically aligned.
 */

export interface LoopRegion {
  startSec: number;
  endSec: number;
}

/**
 * The N-bar window starting at downbeat index `originBar`, clamped so the
 * end never exceeds the last downbeat. Returns null when there is no usable
 * window (fewer than 2 downbeats, or lengthBars <= 0 meaning "Off").
 */
export function computeLoopRegion(
  downbeats: readonly number[],
  originBar: number,
  lengthBars: number,
): LoopRegion | null {
  if (lengthBars <= 0) return null;
  if (downbeats.length < 2) return null;

  const lastBar = downbeats.length - 1; // index of the final downbeat
  const start = Math.max(0, Math.min(originBar, lastBar - 1));
  const end = Math.min(start + lengthBars, lastBar);
  return { startSec: downbeats[start], endSec: downbeats[end] };
}

/**
 * Step the origin downbeat index by `dir * lengthBars`, clamped to
 * [0, max(0, barCount - lengthBars)] so a full window stays in range.
 * `barCount` = number of bars = downbeats.length - 1.
 */
export function nudgeOrigin(
  originBar: number,
  dir: 1 | -1,
  lengthBars: number,
  barCount: number,
): number {
  const lastValidOrigin = Math.max(0, barCount - lengthBars);
  const next = originBar + dir * lengthBars;
  return Math.max(0, Math.min(next, lastValidOrigin));
}
