/**
 * Debug Panel - Real-time data visualization for facilitators
 */

import { useEffect } from 'react';
import {
  useAppStore,
  useIsTracking,
  useTrackingConfidence,
  useCurrentMovement,
  useAccessibilityMode,
  useSensitivity,
  useIsMuted,
  useMasterVolume,
  useActiveNotes,
} from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';

function DebugPanel() {
  const isTracking = useIsTracking();
  const confidence = useTrackingConfidence();
  const movement = useCurrentMovement();
  const mode = useAccessibilityMode();
  const sensitivity = useSensitivity();
  const isMuted = useIsMuted();
  const volume = useMasterVolume();
  const activeNotes = useActiveNotes();

  const toggleDebugPanel = useAppStore((s) => s.toggleDebugPanel);
  const setAccessibilityMode = useAppStore((s) => s.setAccessibilityMode);
  const setSensitivity = useAppStore((s) => s.setSensitivity);

  // Keyboard shortcut to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          // Don't toggle if typing in an input
          if (document.activeElement?.tagName !== 'INPUT') {
            toggleDebugPanel();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugPanel]);

  const audioState = getAudioEngine().getState();

  return (
    <div className="debug-panel" role="region" aria-label="Debug information">
      <div className="debug-panel__title">Debug Panel</div>

      {/* Close button */}
      <button
        onClick={toggleDebugPanel}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          fontSize: '16px',
        }}
        aria-label="Close debug panel"
      >
        ×
      </button>

      {/* Tracking section */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="debug-panel__title" style={{ fontSize: '12px', opacity: 0.7 }}>
          TRACKING
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Status:</span>
          <span
            className="debug-panel__value"
            style={{ color: isTracking ? 'var(--color-success)' : 'var(--color-error)' }}
          >
            {isTracking ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Confidence:</span>
          <span className="debug-panel__value">{(confidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Movement section */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="debug-panel__title" style={{ fontSize: '12px', opacity: 0.7 }}>
          MOVEMENT
        </div>
        {movement ? (
          <>
            <div className="debug-panel__row">
              <span className="debug-panel__label">Position:</span>
              <span className="debug-panel__value">
                ({(movement.position.x * 100).toFixed(0)}%, {(movement.position.y * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="debug-panel__row">
              <span className="debug-panel__label">Velocity:</span>
              <span className="debug-panel__value">
                {(movement.velocity.magnitude * 1000).toFixed(1)}
              </span>
            </div>
            <div className="debug-panel__row">
              <span className="debug-panel__label">Active:</span>
              <span
                className="debug-panel__value"
                style={{ color: movement.isActive ? 'var(--color-success)' : 'var(--color-text-muted)' }}
              >
                {movement.isActive ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="debug-panel__row">
              <span className="debug-panel__label">Stable:</span>
              <span className="debug-panel__value">{movement.isStable ? 'Yes' : 'No'}</span>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-muted)' }}>No movement data</div>
        )}
      </div>

      {/* Audio section */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="debug-panel__title" style={{ fontSize: '12px', opacity: 0.7 }}>
          AUDIO
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Context:</span>
          <span className="debug-panel__value">{audioState}</span>
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Muted:</span>
          <span
            className="debug-panel__value"
            style={{ color: isMuted ? 'var(--color-error)' : 'var(--color-success)' }}
          >
            {isMuted ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Volume:</span>
          <span className="debug-panel__value">{(volume * 100).toFixed(0)}%</span>
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Active Notes:</span>
          <span className="debug-panel__value">{activeNotes.length}</span>
        </div>
      </div>

      {/* Settings section */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="debug-panel__title" style={{ fontSize: '12px', opacity: 0.7 }}>
          SETTINGS
        </div>

        {/* Mode selector */}
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
            Accessibility Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setAccessibilityMode(e.target.value as typeof mode)}
            style={{
              width: '100%',
              padding: '4px',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-text-muted)',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <option value="standard">Standard</option>
            <option value="lowMobility">Low Mobility</option>
            <option value="dwell">Dwell-to-Trigger</option>
            <option value="singleSwitch">Single Switch</option>
          </select>
        </div>

        {/* Sensitivity slider */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
            Sensitivity: {sensitivity.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>
        <div>Press D to toggle this panel</div>
        <div>Press Space to toggle mute</div>
      </div>
    </div>
  );
}

export default DebugPanel;
