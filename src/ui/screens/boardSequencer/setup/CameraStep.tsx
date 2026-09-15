import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Disclosure } from '../ui/Disclosure';
import type { CameraStatus } from '../boardSetupFlow';
import type { CameraTrackInfo } from '../../../../tracking/CameraManager';

export interface CameraStepProps {
  cameras: MediaDeviceInfo[];
  deviceId: string;
  onPickCamera(deviceId: string, label: string): void;
  onTryAgain(): void;
  camera: CameraStatus;
  trackInfo: CameraTrackInfo | null;
  saturation: number | null;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Mirror/Flip change what the camera sees, so corners are reset (colours are kept). */
  onViewChange(patch: { mirrorX?: boolean; mirrorY?: boolean }): void;
  /** Permission may not have been asked for yet. */
  onRefreshCameras(): void;
}

export function CameraStep({
  cameras, deviceId, onPickCamera, onTryAgain, camera, trackInfo, saturation,
  mirrorX, mirrorY, onViewChange, onRefreshCameras,
}: CameraStepProps): JSX.Element {
  const colourless = camera.colourless === true;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span id="camera-list-label" style={{ fontWeight: 600 }}>Which camera?</span>
        <div role="radiogroup" aria-labelledby="camera-list-label" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[{ deviceId: '', label: 'Browser default' }, ...cameras].map((c) => {
            const selected = c.deviceId === deviceId;
            return (
              <button
                key={c.deviceId || 'default'}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPickCamera(c.deviceId, c.label)}
                style={{
                  minHeight: 'var(--bs-target)', textAlign: 'left', padding: '0 12px',
                  background: selected ? 'var(--bs-accent-muted)' : 'var(--bs-raised)',
                  borderColor: selected ? 'var(--bs-accent)' : 'var(--bs-border-control)',
                  borderWidth: selected ? 2 : 1,
                  fontWeight: selected ? 600 : 400,
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 8 }}>{selected ? '●' : '○'}</span>
                {c.label || 'Camera'}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button tone="secondary" onClick={onRefreshCameras}>Refresh the list</Button>
          <Button tone="secondary" onClick={onTryAgain}>Try again</Button>
        </div>
      </div>

      {/* Plain language first; the numbers live in Details. */}
      <div
        role="status"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--bs-radius-md)',
          background: colourless ? 'var(--bs-warn-tint)' : 'var(--bs-raised)',
          border: '1px solid var(--bs-border-control)',
        }}
      >
        <span aria-hidden="true" style={{ color: colourless ? 'var(--bs-warn)' : 'var(--bs-ok)', fontWeight: 700 }}>
          {colourless ? '!' : '✓'}
        </span>
        <span>
          {camera.phase === 'starting' && 'Starting the camera…'}
          {camera.phase === 'error' && "The camera isn't working."}
          {(camera.phase === 'running' || camera.phase === 'fallback') && (colourless
            ? 'The picture looks black and white. Colours can\'t be told apart like this — check the camera app\'s settings.'
            : 'Picture has colour')}
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--bs-fg2)', fontSize: 12 }}>
        {trackInfo ? `${trackInfo.label || 'Camera'} · ${trackInfo.width} × ${trackInfo.height}` : 'No camera details yet'}
      </p>

      <Switch
        label="Mirror the picture"
        checked={mirrorX}
        onChange={(v) => onViewChange({ mirrorX: v })}
        hint="Changing this asks for the board corners again. Your colours are kept."
      />
      <Switch label="Flip the picture upside down" checked={mirrorY} onChange={(v) => onViewChange({ mirrorY: v })} />

      <Disclosure summary="Details">
        <p style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)' }}>
          {`Colour in the frames the app reads: ${saturation === null ? 'not measured yet' : saturation.toFixed(1)}`}
        </p>
      </Disclosure>
    </>
  );
}
