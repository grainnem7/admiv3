/**
 * Run a callback once per NEW camera frame. Uses requestVideoFrameCallback where
 * available; otherwise a rAF loop that skips ticks whose video time hasn't advanced.
 * Detection must not re-read the same camera frame on every display refresh: that
 * made motion thresholds depend on the monitor's refresh rate.
 */
export interface VideoFrameSource {
  currentTime: number;
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export interface VideoFrameInfo {
  nowMs: number;
  dtMs: number;
}

const FIRST_DT_MS = 1000 / 30;
const MAX_DT_MS = 250;

export function startVideoFrameLoop(
  video: VideoFrameSource,
  onFrame: (info: VideoFrameInfo) => void,
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
  caf: (h: number) => void = (h) => cancelAnimationFrame(h),
): () => void {
  let last = -1;
  let stopped = false;
  const emit = (now: number): void => {
    const dtMs = last < 0 ? FIRST_DT_MS : Math.min(MAX_DT_MS, Math.max(1, now - last));
    last = now;
    onFrame({ nowMs: now, dtMs });
  };

  const rvfc = video.requestVideoFrameCallback;
  if (typeof rvfc === 'function') {
    let handle = 0;
    const tick = (now: number): void => {
      if (stopped) return;
      emit(now);
      handle = rvfc.call(video, tick);
    };
    handle = rvfc.call(video, tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback?.call(video, handle);
    };
  }

  let lastMediaTime = Number.NaN;
  let handle = 0;
  const tick = (now: number): void => {
    if (stopped) return;
    if (video.currentTime !== lastMediaTime) {
      lastMediaTime = video.currentTime;
      emit(now);
    }
    handle = raf(tick);
  };
  handle = raf(tick);
  return () => {
    stopped = true;
    caf(handle);
  };
}
