/**
 * A few camera pictures taken exactly as the board reader takes them: the same reduced
 * size and the same turn and mirror. Learning the board and finding counters against it
 * must see the same pictures play does — learnt from a sharper picture than it is read
 * from, every line between a light and a dark square looked like a counter.
 */
import { drawOriented, orientedSize, type FrameOrientation } from '../../../tracking/frameOrientation';
import type { FrameRGBA } from '../../../tracking/boardReference/boardReference';

/** The reader's frame size (BoardReader's default downscale). */
export const READER_DOWNSCALE = 4;

export async function captureReaderFrames(
  video: HTMLVideoElement, orientation: FrameOrientation, count: number, intervalMs: number, signal?: AbortSignal,
): Promise<{ frames: FrameRGBA[]; shown: { width: number; height: number } }> {
  const shown = orientedSize(video.videoWidth, video.videoHeight, orientation.rotation);
  const w = Math.max(1, Math.floor(shown.width / READER_DOWNSCALE));
  const h = Math.max(1, Math.floor(shown.height / READER_DOWNSCALE));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const frames: FrameRGBA[] = [];
  for (let i = 0; ctx && i < count; i++) {
    if (signal?.aborted) break;
    drawOriented(ctx, video, w, h, orientation);
    frames.push({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h });
    if (i < count - 1) await new Promise((r) => { setTimeout(r, intervalMs); });
  }
  return { frames, shown };
}
