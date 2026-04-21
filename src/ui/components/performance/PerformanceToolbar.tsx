/**
 * PerformanceToolbar — Redesigned
 *
 * Clean top bar with transport controls, mode selector,
 * profile name, and tracking quality indicator.
 */

import { useAppStore, useIsMuted, useUISize } from '../../../state/store';
import type { InputProfile, TrackingFrame } from '../../../state/types';
import { IconSettings, IconCalibrate, IconHelpCircle, IconExpand, IconCollapse } from '../../design-system/Icons';
import ModeSelector from './ModeSelector';

interface PerformanceToolbarProps {
  currentProfile: InputProfile;
  isActive: boolean;
  currentFrame: TrackingFrame | null;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
}

function getTrackingColor(frame: TrackingFrame | null, isActive: boolean): string {
  if (!frame) return '#3a3a4a';
  const has = frame.pose || frame.leftHand || frame.rightHand || frame.face;
  if (!has) return '#3a3a4a';
  return isActive ? '#22c55e' : '#f59e0b';
}

export default function PerformanceToolbar({
  currentProfile, isActive, currentFrame, rightPanelOpen, onToggleRightPanel,
}: PerformanceToolbarProps) {
  const isMuted = useIsMuted();
  const uiSize = useUISize();
  const setUISize = useAppStore((s) => s.setUISize);
  const openCalibration = useAppStore((s) => s.openCalibrationOverlay);
  const toggleHelp = useAppStore((s) => s.toggleHelpDescriptions);
  const trackingColor = getTrackingColor(currentFrame, isActive);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      height: 48, padding: '0 16px',
      background: '#0e0e14',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }} role="toolbar" aria-label="Performance controls">

      {/* Play status indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isActive && !isMuted ? 'var(--color-success)' : isMuted ? 'var(--color-error)' : 'var(--color-text-disabled)',
          boxShadow: isActive && !isMuted ? '0 0 6px var(--color-success)' : isMuted ? '0 0 6px var(--color-error)' : 'none',
          transition: 'all 200ms ease',
        }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
          {isMuted ? 'Muted' : isActive ? 'Playing' : 'Ready'}
        </span>
      </div>

      {/* Mode selector */}
      <ModeSelector />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Profile & tracking */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#71718a', fontWeight: 500 }}>
          {currentProfile.name}
        </span>

        {/* Tracking quality dot */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: trackingColor,
            boxShadow: `0 0 4px ${trackingColor}`,
            transition: 'all 300ms ease',
          }} />
          <span style={{ fontSize: 11, color: '#71718a', fontWeight: 500 }}>
            {!currentFrame ? 'No signal' : isActive ? 'Tracking' : 'Detecting'}
          </span>
        </div>
      </div>

      {/* Panel toggle */}
      {/* Calibrate */}
      <button
        onClick={openCalibration}
        title="Calibrate your movement range"
        aria-label="Calibrate"
        className="btn btn--ghost btn--sm"
        style={{ gap: 4 }}
      >
        <IconCalibrate size={14} />
      </button>

      {/* Help toggle */}
      <button
        onClick={toggleHelp}
        title="Show help descriptions"
        aria-label="Toggle help"
        className="btn btn--ghost btn--sm"
      >
        <IconHelpCircle size={14} />
      </button>

      {/* Large UI toggle */}
      <button
        onClick={() => setUISize(uiSize === 'large' ? 'standard' : 'large')}
        title={uiSize === 'large' ? 'Standard UI size' : 'Large UI for distance'}
        aria-label={uiSize === 'large' ? 'Switch to standard size' : 'Switch to large size'}
        className={`btn btn--sm ${uiSize === 'large' ? 'btn--active' : 'btn--ghost'}`}
      >
        {uiSize === 'large' ? <IconCollapse size={14} /> : <IconExpand size={14} />}
      </button>

      {/* Settings panel toggle */}
      <button
        onClick={onToggleRightPanel}
        title={rightPanelOpen ? 'Close panel' : 'Open panel'}
        aria-label={rightPanelOpen ? 'Close settings panel' : 'Open settings panel'}
        className={`btn btn--sm ${rightPanelOpen ? 'btn--active' : 'btn--ghost'}`}
      >
        <IconSettings size={14} />
      </button>
    </div>
  );
}
