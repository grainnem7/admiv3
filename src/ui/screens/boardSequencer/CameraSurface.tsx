import { useEffect, useState, type ReactNode, type RefObject } from 'react';

export interface CameraSurfaceProps {
  videoRef: RefObject<HTMLVideoElement>;
  overlayRef: RefObject<HTMLCanvasElement>;
  mirrorX: boolean;
  mirrorY: boolean;
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

/**
 * The Board Sequencer's one camera element. Everything that needs the picture uses this
 * surface; views provide layers rather than their own `<video>`.
 *
 * Its aspect ratio comes from the live stream, so there is no crop and no letterbox:
 * a click maps straight to a fraction of the frame that `BoardReader` samples.
 */
export function CameraSurface({
  videoRef, overlayRef, mirrorX, mirrorY, hidden = false, children, onPick, label,
}: CameraSurfaceProps): JSX.Element {
  const [ratio, setRatio] = useState<number | null>(null);

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

  const transform = `${mirrorX ? 'scaleX(-1) ' : ''}${mirrorY ? 'scaleY(-1)' : ''}`.trim() || undefined;

  return (
    <div
      aria-hidden={hidden || undefined}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: ratio ? `${ratio}` : '4 / 3',
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
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill', transform }}
      />
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {children}
    </div>
  );
}
