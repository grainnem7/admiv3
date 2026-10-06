/**
 * One frame of the camera, in the space everything else uses.
 *
 * Detection, sampling and the saved corners all live in DISPLAYED orientation — what the
 * player sees, mirror and flip applied — so a tap on the picture maps straight onto the
 * board without anyone having to think about which way round the camera is.
 */
import { drawOriented, orientedSize, type QuarterTurns } from '../frameOrientation';
import { WORKING_WIDTH } from './gray';

export interface CapturedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** The video's own size, for mapping a result back to frame fractions. */
  videoWidth: number;
  videoHeight: number;
}

/**
 * Draw the video into an offscreen canvas at the detector's working width, with the
 * display transform applied. Returns null before the camera has a picture.
 */
export function captureDisplayedFrame(
  video: HTMLVideoElement, mirrorX: boolean, mirrorY: boolean, targetW = WORKING_WIDTH,
  rotation: QuarterTurns = 0,
): CapturedFrame | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw <= 0 || vh <= 0) return null;
  const shown = orientedSize(vw, vh, rotation);
  const width = Math.min(shown.width, targetW);
  const height = Math.max(1, Math.round((shown.height / shown.width) * width));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  drawOriented(ctx, video, width, height, { mirrorX, mirrorY, rotation });
  return {
    data: ctx.getImageData(0, 0, width, height).data,
    width,
    height,
    videoWidth: vw,
    videoHeight: vh,
  };
}
