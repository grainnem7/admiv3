import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { drawOriented, orientedSize, quarterTurns } from '../../../tracking/frameOrientation';

export interface CameraSurfaceProps {
  videoRef: RefObject<HTMLVideoElement>;
  overlayRef: RefObject<HTMLCanvasElement>;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Clockwise quarter turns, applied before the mirrors (see frameOrientation). */
  rotation?: number;
  /**
   * Hidden surfaces stay in the document with the stream attached — never unmounted and
   * never `display: none`, so switching view or entering Big board doesn't restart the
   * camera or black out the preview.
   */
  hidden?: boolean;
  /** Step-specific layers (corner editor, square picker, colour rings) drawn over the video. */
  children?: ReactNode;
  /** Click position as a fraction of the full camera frame, in displayed orientation. */
  onPick?(point: { x: number; y: number }): void;
  label?: string;
}

/** The tallest a sideways (turned 90° or 270°) picture may be, as a share of the screen. */
const SIDEWAYS_MAX_VH = 75;

/**
 * The Board Sequencer's one camera element. Everything that needs the picture uses this
 * surface; views provide layers rather than their own `<video>`.
 *
 * Its aspect ratio comes from the live stream, so there is no crop and no letterbox:
 * a click maps straight to a fraction of the frame that `BoardReader` samples.
 *
 * Turned a quarter, the picture is drawn onto a canvas with the same `drawOriented` the
 * frame readers use, and the video itself is kept playing but unseen. Turning the
 * `<video>` with CSS left Chrome drawing it black inside the rounded, clipped surface,
 * and a canvas also means the preview is by construction the picture that is read.
 */

export function CameraSurface({
  videoRef, overlayRef, mirrorX, mirrorY, rotation = 0, hidden = false, children, onPick, label,
}: CameraSurfaceProps): JSX.Element {
  const [ratio, setRatio] = useState<number | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const read = (): void => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setRatio(video.videoWidth / video.videoHeight);
    };
    read();
    video.addEventListener('loadedmetadata', read);
    video.addEventListener('resize', read);
    return () => {
      video.removeEventListener('loadedmetadata', read);
      video.removeEventListener('resize', read);
    };
  }, [videoRef]);

  const turns = quarterTurns(rotation);
  const sideways = turns % 2 === 1;

  // The sideways preview: redraw the turned picture every animation frame.
  useEffect(() => {
    if (!sideways) return;
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const video = videoRef.current;
      const cv = previewRef.current;
      if (!video || !cv || video.videoWidth <= 0 || video.readyState < 2) return;
      const { width, height } = orientedSize(video.videoWidth, video.videoHeight, turns);
      if (cv.width !== width) cv.width = width;
      if (cv.height !== height) cv.height = height;
      const ctx = cv.getContext('2d');
      if (ctx) drawOriented(ctx, video, width, height, { mirrorX, mirrorY, rotation: turns });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sideways, turns, mirrorX, mirrorY, videoRef]);

  // Square-on or upside down, the video is shown directly. CSS applies transforms right
  // to left: turn first, then mirror — the order the frame readers use.
  const transform = sideways ? undefined : [
    mirrorX ? 'scaleX(-1)' : '', mirrorY ? 'scaleY(-1)' : '', turns ? `rotate(${turns * 90}deg)` : '',
  ].filter(Boolean).join(' ') || undefined;
  // The surface takes the picture's shape as displayed: a quarter turn makes it tall.
  const shownRatio = ratio ? (sideways ? 1 / ratio : ratio) : null;
  // Sideways, the video stays in place and playing (the readers draw from it) but is not
  // what is seen: the canvas above it is.
  const videoBox: React.CSSProperties = sideways
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }
    : { width: '100%', height: '100%' };
  // A sideways picture is tall: at full width it ran far off the bottom of the screen.
  // Cap its height to the screen and centre it; a small surface (the Play thumbnail) is
  // still limited by its own width.
  const sizing: React.CSSProperties = sideways && shownRatio
    ? { width: `min(100%, calc(${SIDEWAYS_MAX_VH}vh * ${shownRatio}))`, margin: '0 auto' }
    : { width: '100%' };

  return (
    <div
      aria-hidden={hidden || undefined}
      style={{
        position: 'relative',
        ...sizing,
        aspectRatio: shownRatio ? `${shownRatio}` : '4 / 3',
        borderRadius: 'var(--bs-radius-lg)',
        overflow: 'hidden',
        background: 'var(--bs-elev)',
        border: '1px solid var(--bs-border)',
        // Visual only: the element keeps its stream and its place in the document.
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : undefined,
      }}
      onClick={onPick ? (e) => {
        const box = e.currentTarget.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return;
        onPick({
          x: (e.clientX - box.left) / box.width,
          y: (e.clientY - box.top) / box.height,
        });
      } : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label={label ?? 'Board camera'}
        style={{ ...videoBox, display: 'block', objectFit: 'fill', transform }}
      />
      {sideways && (
        <canvas
          ref={previewRef}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      )}
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {children}
    </div>
  );
}
