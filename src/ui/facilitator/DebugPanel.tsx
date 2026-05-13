/**
 * Debug Panel - Real-time data visualization for facilitators
 */

import { useEffect, useState } from 'react';
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
  useActiveInputProfile,
} from '../../state/store';
import type { SmoothingLevel } from '../../state/types';
import { getAudioEngine } from '../../sound/AudioEngine';
import { getColorTracker } from '../../tracking/ColorTracker';
import { getMultiModalProcessor } from '../../movement/MultiModalProcessor';

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
  const setActiveInputProfile = useAppStore((s) => s.setActiveInputProfile);
  const saveInputProfile = useAppStore((s) => s.saveInputProfile);

  // Active input profile — read-write so we can adjust smoothing /
  // velocity threshold in-session without restarting.  Changes are
  // pushed back through MultiModalProcessor immediately so movement
  // processing reflects the new settings on the very next frame.
  const activeProfile = useActiveInputProfile();

  // Colour-tracker min-area slider state.  Initialised from the first
  // tracked colour (they're synchronised via setMinAreaForAll), and
  // pushed back to the tracker live as the user drags so a poster
  // colour clash can be tuned out without restarting the session.
  const [minArea, setMinArea] = useState<number>(() => {
    const colors = getColorTracker().getTrackedColors();
    return colors[0]?.minArea ?? 0.0005;
  });
  const trackedColorCount = getColorTracker().getTrackedColors().length;

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
              borderRadius: 0,
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

        {/* Movement-threshold controls (Change ID 2).  Edits the active
            InputProfile in place and re-pushes it through the
            MultiModalProcessor so the new thresholds apply on the next
            tracked frame — useful for in-session tuning of fine motion. */}
        {activeProfile && (
          <>
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
                Smoothing
              </label>
              <select
                value={activeProfile.movementSettings.smoothingLevel}
                onChange={(e) => {
                  const updated = {
                    ...activeProfile,
                    movementSettings: {
                      ...activeProfile.movementSettings,
                      smoothingLevel: e.target.value as SmoothingLevel,
                    },
                  };
                  setActiveInputProfile(updated);
                  saveInputProfile(updated);
                  getMultiModalProcessor().setProfile(updated);
                }}
                style={{
                  width: '100%',
                  padding: '4px',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-text-muted)',
                  borderRadius: 0,
                  fontSize: '12px',
                }}
              >
                <option value="none">None</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="heavy">Heavy</option>
              </select>
            </div>

            <div style={{ marginTop: 'var(--space-sm)' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
                Velocity threshold: {activeProfile.movementSettings.velocityThreshold.toFixed(3)}
              </label>
              <input
                type="range"
                min="0.001"
                max="0.1"
                step="0.001"
                value={activeProfile.movementSettings.velocityThreshold}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  const updated = {
                    ...activeProfile,
                    movementSettings: {
                      ...activeProfile.movementSettings,
                      velocityThreshold: value,
                    },
                  };
                  setActiveInputProfile(updated);
                  saveInputProfile(updated);
                  getMultiModalProcessor().setProfile(updated);
                }}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Lower = picks up smaller intentional movements; raise to reject tremor.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Colour tracker section — visible whenever colour modality is active.
          Disabled when no colours are calibrated so the slider doesn't
          mislead a facilitator into thinking they're tuning something. */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div className="debug-panel__title" style={{ fontSize: '12px', opacity: 0.7 }}>
          COLOUR TRACKER
        </div>
        <div className="debug-panel__row">
          <span className="debug-panel__label">Calibrated:</span>
          <span className="debug-panel__value">{trackedColorCount}</span>
        </div>
        <div style={{ marginTop: 'var(--space-sm)' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>
            Min blob area: {(minArea * 100).toFixed(3)}%
          </label>
          <input
            type="range"
            min="0.0001"
            max="0.01"
            step="0.0001"
            value={minArea}
            disabled={trackedColorCount === 0}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              setMinArea(value);
              getColorTracker().setMinAreaForAll(value);
            }}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Raise to reject small background patches; lower to keep distant batons.
          </div>
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
