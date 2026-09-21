import { useEffect, useState } from 'react';
import { CameraManager } from '../../../tracking/CameraManager';
import { CAMERA_RESOLUTIONS, type CameraChoice } from '../../../tracking/cameraChoice';

export interface CameraPickerProps {
  value: CameraChoice;
  onChange(next: CameraChoice): void;
  /** Shown under the controls: the greyscale warning, or anything else worth saying. */
  notice?: string | null;
  disabled?: boolean;
}

/**
 * Pick the camera and the size, deliberately.
 *
 * Both halves matter for a bridged phone. The device list is the only way to choose a
 * virtual camera over the built-in webcam the browser would otherwise default to; and the
 * size is not a quality dial — a virtual camera can negotiate a different pixel format per
 * resolution and hand back a black-and-white picture at one size and proper colour at
 * another, so changing it is the first thing to try when the colour disappears.
 */
export function CameraPicker({ value, onChange, notice = null, disabled = false }: CameraPickerProps): JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      CameraManager.listDevices()
        .then((d) => { if (!cancelled) { setDevices(d); setListError(null); } })
        .catch(() => { if (!cancelled) setListError('This browser will not list cameras.'); });
    };
    refresh();
    // Labels only arrive after permission is granted, and a phone bridge appears and
    // disappears as the app is opened and closed.
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  const label = (d: MediaDeviceInfo, i: number): string => d.label || `Camera ${i + 1}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        <span>Camera</span>
        <select
          value={value.deviceId}
          disabled={disabled}
          onChange={(e) => {
            const d = devices.find((x) => x.deviceId === e.target.value);
            onChange({ ...value, deviceId: e.target.value, label: d ? label(d, 0) : '' });
          }}
        >
          <option value="">Browser default</option>
          {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i)}</option>)}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        <span>Size</span>
        <select
          value={`${value.width}x${value.height}`}
          disabled={disabled}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            onChange({ ...value, width: w, height: h });
          }}
        >
          {CAMERA_RESOLUTIONS.map((r) => (
            <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>
          ))}
        </select>
      </label>

      {listError && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{listError}</p>}
      {notice && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: '#ffb4a2' }}>{notice}</p>
      )}
    </div>
  );
}
