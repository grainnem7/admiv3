import { describe, it, expect, vi } from 'vitest';
import { startVideoFrameLoop, type VideoFrameSource } from '../tracking/videoFrameLoop';

describe('startVideoFrameLoop', () => {
  it('uses requestVideoFrameCallback: one callback per presented frame, dt from timestamps', () => {
    let pending: ((now: number) => void) | null = null;
    const cancel = vi.fn();
    const video: VideoFrameSource = {
      currentTime: 0,
      requestVideoFrameCallback: (cb) => { pending = (now) => cb(now, { mediaTime: 0 }); return 1; },
      cancelVideoFrameCallback: cancel,
    };
    const frames: number[] = [];
    const stop = startVideoFrameLoop(video, ({ dtMs }) => frames.push(dtMs));
    const fire = (t: number) => (pending as unknown as (now: number) => void)(t);
    fire(1000);
    fire(1033);
    fire(1066);
    expect(frames[0]).toBeCloseTo(1000 / 30, 6);
    expect(frames.slice(1)).toEqual([33, 33]);
    stop();
    expect(cancel).toHaveBeenCalled();
  });

  it('falls back to rAF and skips ticks where currentTime has not changed', () => {
    const cbs: FrameRequestCallback[] = [];
    const raf = (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length; };
    const video: VideoFrameSource = { currentTime: 0 };
    const frames: number[] = [];
    startVideoFrameLoop(video, ({ nowMs }) => frames.push(nowMs), raf, () => {});
    cbs.shift()!(16);
    cbs.shift()!(33);
    video.currentTime = 0.033;
    cbs.shift()!(50);
    expect(frames).toEqual([16, 50]);
  });
});
