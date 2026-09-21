import { useEffect, useRef, useState } from 'react';
import {
  describeGreyscale, greyscaleVerdict, initialGreyscaleWatch, stepGreyscaleWatch,
  type GreyscaleVerdict, type GreyscaleWatch,
} from '../../../tracking/greyscaleWatch';

/**
 * Watch the pixels the trackers actually read, and say so if there is no colour in them.
 *
 * Read the same way the trackers read: drawn to a 2d canvas and pulled back with
 * getImageData. Watching the <video> element instead would prove nothing — the question
 * is what the tracking code receives, not what the screen shows.
 *
 * The point is that this can never fail quietly. A luma-only feed looks like a perfectly
 * good picture of the room; without this the instrument simply stops responding and the
 * facilitator is left to guess, in front of a musician who is waiting to play.
 *
 * `resetKey` starts the watch again — pass whatever identifies the current camera and
 * size, so a new combination is judged on its own.
 */
export function useColourWatch(
  video: HTMLVideoElement | null, resetKey: string,
): { verdict: GreyscaleVerdict; notice: string | null } {
  const watchRef = useRef<GreyscaleWatch>(initialGreyscaleWatch());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [verdict, setVerdict] = useState<GreyscaleVerdict>('watching');

  useEffect(() => {
    watchRef.current = initialGreyscaleWatch();
    setVerdict('watching');
  }, [resetKey]);

  useEffect(() => {
    if (!video) return undefined;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const cv = canvasRef.current;
    // Small: this only has to answer "are the channels equal?", not show anything.
    cv.width = 64;
    cv.height = 48;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;

    const id = window.setInterval(() => {
      if (video.videoWidth <= 0) return;
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      watchRef.current = stepGreyscaleWatch(watchRef.current, data, performance.now());
      setVerdict(greyscaleVerdict(watchRef.current));
    }, 150);
    return () => window.clearInterval(id);
  }, [video, resetKey]);

  return { verdict, notice: describeGreyscale(verdict) };
}
