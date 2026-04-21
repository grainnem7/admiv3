/**
 * CalibrationModal - Full-screen overlay containing CalibrationScreen.
 *
 * Allows recalibration from the performance screen without navigating away.
 */

import { useAppStore, useShowCalibrationOverlay } from '../../../state/store';
import CalibrationScreen from '../../screens/CalibrationScreen';
import { IconX } from '../../design-system/Icons';

export default function CalibrationModal() {
  const show = useShowCalibrationOverlay();
  const close = useAppStore((s) => s.closeCalibrationOverlay);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
      }}
      role="dialog"
      aria-label="Calibration"
      aria-modal="true"
    >
      {/* Close bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 'var(--text-md)', fontWeight: 'var(--font-semibold)',
          color: 'var(--color-text)',
        }}>
          Calibrate Your Instrument
        </span>
        <button
          onClick={close}
          className="btn btn--ghost btn--sm"
          aria-label="Close calibration"
        >
          <IconX size={16} /> Close
        </button>
      </div>

      {/* Calibration content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <CalibrationScreen />
      </div>
    </div>
  );
}
