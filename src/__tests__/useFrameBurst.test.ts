import { describe, it, expect, vi } from 'vitest';
import { runFrameBurst, BURST_MAX_FRAMES } from '../ui/screens/boardSequencer/useFrameBurst';

/** A stand-in video whose "picture" is a 4 × 4 block of flat grey. */
function fakeVideo(): HTMLVideoElement {
  const video = { videoWidth: 8, videoHeight: 6 } as HTMLVideoElement;
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(8 * 6 * 4) }),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
  return video;
}

const opts = () => ({
  video: fakeVideo(),
  mirrorX: false,
  mirrorY: false,
  wait: async () => {},
  now: () => 0,
});

describe('runFrameBurst', () => {
  it('stops as soon as enough frames agree', async () => {
    const detect = vi.fn(() => 'ok');
    const out = await runFrameBurst({ ...opts(), detect, enough: (r) => r.length >= 3 });
    expect(out.results).toHaveLength(3);
    expect(out.frames).toHaveLength(3);
    expect(out.cancelled).toBe(false);
  });

  it('never takes more than the frame cap, even when nothing agrees', async () => {
    const out = await runFrameBurst({ ...opts(), detect: () => null, enough: () => false });
    expect(out.frames).toHaveLength(BURST_MAX_FRAMES);
    expect(out.results).toHaveLength(0);
  });

  it('gives up when it has waited long enough', async () => {
    let t = 0;
    const out = await runFrameBurst({
      ...opts(), now: () => { t += 2000; return t; }, maxMs: 4000, enough: () => false,
    });
    expect(out.frames.length).toBeLessThan(BURST_MAX_FRAMES);
  });

  it('Cancel stops it and reports that it was cancelled', async () => {
    const controller = new AbortController();
    const detect = vi.fn(() => { controller.abort(); return 'ok'; });
    const out = await runFrameBurst({ ...opts(), detect, signal: controller.signal, enough: () => false });
    expect(out.cancelled).toBe(true);
    expect(out.frames.length).toBeLessThan(BURST_MAX_FRAMES);
  });

  it('keeps the frames, so a detector can be re-run on the same pictures', async () => {
    const out = await runFrameBurst({ ...opts(), enough: (r) => r.length >= 1, maxFrames: 4 });
    expect(out.frames).toHaveLength(4);
    expect(out.frames[0].videoWidth).toBe(8);
  });
});
