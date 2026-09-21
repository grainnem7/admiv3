import { useEffect, useRef, useState } from 'react';
import type { CameraManager } from '../../../tracking/CameraManager';
import {
  channelEquality, greyscaleVerdict, initialGreyscaleWatch, stepGreyscaleWatch,
  type GreyscaleWatch,
} from '../../../tracking/greyscaleWatch';

export interface CameraDebugPanelProps {
  /** The live element the camera is attached to. Shown raw, with no processing at all. */
  video: HTMLVideoElement | null;
  camera: CameraManager | null;
}

interface Probe {
  centre: { r: number; g: number; b: number } | null;
  achromatic: number | null;
  sampled: number;
  label: string;
  deviceId: string;
  settings: string;
  capabilities: string;
  verdict: string;
}

const EMPTY: Probe = {
  centre: null, achromatic: null, sampled: 0,
  label: '—', deviceId: '—', settings: '—', capabilities: '—', verdict: 'watching',
};

/**
 * Side by side: the raw <video>, and the pixels the tracker actually reads.
 *
 * This exists to answer ONE question, which no amount of reading the code can settle —
 * is the picture already grey when it arrives, or are we losing the colour ourselves?
 *
 *   - raw grey, right-hand copy grey  → upstream: the phone bridge or format negotiation
 *   - raw in colour, copy grey        → ours: something in the frame-reading path
 *
 * The right-hand image is produced exactly the way the trackers produce theirs — drawn to
 * a 2d canvas and read back with getImageData — so it is not a re-rendering of the video
 * but the same buffer the colour matching sees.
 */
export function CameraDebugPanel({ video, camera }: CameraDebugPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const watchRef = useRef<GreyscaleWatch>(initialGreyscaleWatch());
  const [probe, setProbe] = useState<Probe>(EMPTY);

  useEffect(() => {
    watchRef.current = initialGreyscaleWatch();
  }, [video, camera]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const cv = canvasRef.current;
      if (!video || !cv || video.videoWidth <= 0) return;
      const w = Math.min(240, video.videoWidth);
      const h = Math.round((w / video.videoWidth) * video.videoHeight);
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      // No mirroring, no filters: the plainest possible read of the frame.
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const eq = channelEquality(data, 1);
      watchRef.current = stepGreyscaleWatch(watchRef.current, data, performance.now());

      const ci = ((Math.floor(h / 2) * w) + Math.floor(w / 2)) * 4;
      const diag = camera?.getTrackDiagnostics() ?? null;
      const info = camera?.getTrackInfo() ?? null;
      const next: Probe = {
        centre: { r: data[ci], g: data[ci + 1], b: data[ci + 2] },
        achromatic: eq ? eq.achromatic : null,
        sampled: eq ? eq.sampled : 0,
        label: info?.label || '—',
        deviceId: info?.deviceId || '—',
        settings: diag ? JSON.stringify(diag.settings) : '—',
        capabilities: diag?.capabilities ? JSON.stringify(diag.capabilities) : 'not reported',
        verdict: greyscaleVerdict(watchRef.current),
      };
      setProbe(next);
      // Once a second, in the console too, so it can be copied into a bug report.
      console.info('[camera-debug]', {
        label: next.label,
        deviceId: next.deviceId,
        settings: diag?.settings,
        capabilities: diag?.capabilities,
        centrePixel: next.centre,
        achromaticShare: next.achromatic,
        verdict: next.verdict,
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [video, camera]);

  const row = (k: string, v: string): JSX.Element => (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.5 }}>
      <span style={{ opacity: 0.7, minWidth: 92 }}>{k}</span>
      <span style={{ wordBreak: 'break-all' }}>{v}</span>
    </div>
  );

  const centre = probe.centre;
  const looksGrey = centre !== null && Math.max(centre.r, centre.g, centre.b) - Math.min(centre.r, centre.g, centre.b) <= 2;

  return (
    <section
      aria-label="Camera debug"
      style={{
        border: '1px solid #666', borderRadius: 8, padding: 10, margin: '8px 0',
        background: '#111', color: '#eee', fontFamily: 'ui-monospace, monospace',
      }}
    >
      <strong style={{ fontSize: 12 }}>Camera debug — raw video vs what the tracker reads</strong>
      <div style={{ display: 'flex', gap: 10, margin: '8px 0', flexWrap: 'wrap' }}>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ fontSize: 10, opacity: 0.7 }}>Raw &lt;video&gt;, no processing</figcaption>
          {/* The live element itself is elsewhere in the tree; this mirrors its stream. */}
          <video
            style={{ width: 240, background: '#000', display: 'block' }}
            autoPlay
            playsInline
            muted
            ref={(el) => { if (el && video?.srcObject && el.srcObject !== video.srcObject) el.srcObject = video.srcObject; }}
          />
        </figure>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ fontSize: 10, opacity: 0.7 }}>Tracker input (getImageData)</figcaption>
          <canvas ref={canvasRef} style={{ width: 240, background: '#000', display: 'block' }} />
        </figure>
      </div>
      {row('verdict', probe.verdict + (probe.verdict === 'greyscale' ? '  ← no colour in the feed' : ''))}
      {row('centre RGB', centre ? `${centre.r}, ${centre.g}, ${centre.b}${looksGrey ? '   (R=G=B)' : ''}` : '—')}
      {row('achromatic', probe.achromatic === null ? '—' : `${(probe.achromatic * 100).toFixed(1)}% of ${probe.sampled} px`)}
      {row('label', probe.label)}
      {row('deviceId', probe.deviceId)}
      {row('settings', probe.settings)}
      {row('capabilities', probe.capabilities)}
    </section>
  );
}
