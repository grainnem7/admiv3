/**
 * A short burst of camera frames, for the detectors.
 *
 * Detection is a moment, not a stream: press the button, hold still, get an answer. The
 * burst stops as soon as enough frames agree, so a steady board is quick and a difficult
 * one still ends rather than hanging. Cancel is always available and changes nothing.
 */
import type { QuarterTurns } from '../../../tracking/frameOrientation';
import { captureDisplayedFrame, type CapturedFrame } from '../../../tracking/boardDetect/captureFrame';

/** How often a frame is taken. Slow enough that each one is genuinely new. */
export const BURST_INTERVAL_MS = 150;
/** Never take more than this many frames. */
export const BURST_MAX_FRAMES = 10;
/** Nor spend longer than this waiting. */
export const BURST_MAX_MS = 4000;

export interface BurstOptions<T> {
  video: HTMLVideoElement;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Clockwise quarter turns of the picture (see frameOrientation). */
  rotation?: QuarterTurns;
  /** Runs on each frame; return null when the frame told us nothing. */
  detect?(frame: CapturedFrame): T | null;
  /** True when we have seen enough and the burst can stop early. */
  enough?(results: T[]): boolean;
  signal?: AbortSignal;
  maxFrames?: number;
  maxMs?: number;
  intervalMs?: number;
  /** Injectable for tests. */
  now?(): number;
  wait?(ms: number): Promise<void>;
}

export interface BurstResult<T> {
  frames: CapturedFrame[];
  results: T[];
  cancelled: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function runFrameBurst<T>(opts: BurstOptions<T>): Promise<BurstResult<T>> {
  const now = opts.now ?? (() => performance.now());
  const wait = opts.wait ?? sleep;
  const maxFrames = opts.maxFrames ?? BURST_MAX_FRAMES;
  const maxMs = opts.maxMs ?? BURST_MAX_MS;
  const interval = opts.intervalMs ?? BURST_INTERVAL_MS;
  const started = now();
  const frames: CapturedFrame[] = [];
  const results: T[] = [];

  while (frames.length < maxFrames && now() - started < maxMs) {
    if (opts.signal?.aborted) return { frames, results, cancelled: true };
    const frame = captureDisplayedFrame(opts.video, opts.mirrorX, opts.mirrorY, undefined, opts.rotation ?? 0);
    if (frame) {
      frames.push(frame);
      if (opts.detect) {
        const result = opts.detect(frame);
        if (result !== null && result !== undefined) results.push(result);
      }
      if (opts.enough?.(results)) break;
    }
    if (frames.length >= maxFrames) break;
    await wait(interval);
  }
  return { frames, results, cancelled: opts.signal?.aborted === true };
}
