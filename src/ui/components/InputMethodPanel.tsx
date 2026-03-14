/**
 * InputMethodPanel - Tabbed input source selector
 *
 * Allows switching between different input methods:
 * - Body tracking (pose/hands/face)
 * - Theremin mode (two-hand pitch/volume)
 * - Device motion (accelerometer/gyroscope)
 * - Color tracking (colored object tracking)
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../state/store';
import { getDeviceMotionTracker, getThereminMode, getTrackingManager } from '../../tracking';
import { getMappingEngine } from '../../mapping/MappingEngine';

export type InputMethod = 'body' | 'theremin' | 'motion' | 'color';

interface InputMethodPanelProps {
  isExpanded: boolean;
  onToggle: () => void;
  onInputMethodChange?: (method: InputMethod) => void;
}

const INPUT_METHODS: Array<{
  id: InputMethod;
  name: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'body',
    name: 'Body',
    description: 'Use pose, hands, and face tracking',
    icon: 'BDY',
  },
  {
    id: 'theremin',
    name: 'Theremin',
    description: 'Two-hand pitch/volume control',
    icon: 'THR',
  },
  {
    id: 'motion',
    name: 'Motion',
    description: 'Tilt and shake your device',
    icon: 'MOT',
  },
  {
    id: 'color',
    name: 'Color',
    description: 'Track colored objects',
    icon: 'CLR',
  },
];

function InputMethodPanel({
  isExpanded,
  onToggle,
  onInputMethodChange,
}: InputMethodPanelProps) {
  const [activeMethod, setActiveMethod] = useState<InputMethod>('body');
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [motionPermission, setMotionPermission] = useState<boolean | null>(null);
  const setActiveModalities = useAppStore((s) => s.setActiveModalities);

  // Check motion availability on mount
  useEffect(() => {
    const motionTracker = getDeviceMotionTracker();
    setMotionAvailable(motionTracker.isAvailable());
  }, []);

  const handleMethodChange = useCallback(
    async (method: InputMethod) => {
      if (method === activeMethod) return;

      // Handle special setup for different methods
      if (method === 'motion') {
        const motionTracker = getDeviceMotionTracker();
        const granted = await motionTracker.requestPermission();
        setMotionPermission(granted);
        if (!granted) {
          console.warn('[InputMethodPanel] Motion permission denied');
          return;
        }
        await motionTracker.start();
      } else if (activeMethod === 'motion') {
        // Stop motion tracking when switching away
        const motionTracker = getDeviceMotionTracker();
        motionTracker.stop();
      }

      if (method === 'theremin') {
        // Enable both hands for theremin mode
        const thereminModalities = {
          pose: false,
          leftHand: true,
          rightHand: true,
          face: false,
        };
        setActiveModalities(thereminModalities);
        // IMPORTANT: Also update TrackingManager directly to enable hand detection
        const trackingManager = getTrackingManager();
        await trackingManager.setActiveModalities(thereminModalities);
        // Enable theremin mode in MappingEngine
        getMappingEngine().setThereminMode(true);
        // Reset theremin state
        getThereminMode().reset();
        console.log('[InputMethodPanel] Theremin mode enabled with hand tracking');
      } else {
        // Disable theremin mode when switching to any other method
        getMappingEngine().setThereminMode(false);

        if (method === 'body') {
          // Default body tracking modalities
          const bodyModalities = {
            pose: true,
            leftHand: false,
            rightHand: false,
            face: false,
          };
          setActiveModalities(bodyModalities);
          // Update TrackingManager
          const trackingManager = getTrackingManager();
          await trackingManager.setActiveModalities(bodyModalities);
        }
      }

      setActiveMethod(method);
      onInputMethodChange?.(method);
    },
    [activeMethod, setActiveModalities, onInputMethodChange]
  );

  const currentMethod = INPUT_METHODS.find((m) => m.id === activeMethod);

  return (
    <div className={`input-method-panel ${isExpanded ? 'input-method-panel--expanded' : ''}`}>
      <button
        className="input-method-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide input methods' : 'Show input methods'}
      >
        <span className="input-method-toggle-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="input-method-toggle-label">Input Method</span>
        <span className="input-method-current">
          {currentMethod?.icon} {currentMethod?.name}
        </span>
      </button>

      {isExpanded && (
        <div className="input-method-content">
          <div className="input-method-grid">
            {INPUT_METHODS.map((method) => {
              const isDisabled = method.id === 'motion' && !motionAvailable;
              const isActive = activeMethod === method.id;

              return (
                <button
                  key={method.id}
                  className={`input-method-option ${isActive ? 'input-method-option--active' : ''}`}
                  onClick={() => handleMethodChange(method.id)}
                  disabled={isDisabled}
                  title={isDisabled ? 'Device motion not available' : method.description}
                >
                  <span className="input-method-option-icon">{method.icon}</span>
                  <span className="input-method-option-name">{method.name}</span>
                  <span className="input-method-option-desc">{method.description}</span>
                </button>
              );
            })}
          </div>

          {/* Method-specific settings */}
          {activeMethod === 'theremin' && <ThereminSettings />}
          {activeMethod === 'motion' && (
            <MotionStatus
              isAvailable={motionAvailable}
              hasPermission={motionPermission}
            />
          )}
          {activeMethod === 'color' && <ColorTrackingInfo />}
        </div>
      )}

      <style>{`
        .input-method-panel {
          background: var(--color-surface);
          border-radius: 8px;
          overflow: hidden;
        }

        .input-method-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: none;
          border: none;
          color: var(--color-text);
          cursor: pointer;
          text-align: left;
        }

        .input-method-toggle:hover {
          background: var(--color-surface-hover);
        }

        .input-method-toggle-icon {
          font-size: 10px;
          opacity: 0.6;
        }

        .input-method-toggle-label {
          flex: 1;
          font-weight: 500;
        }

        .input-method-current {
          font-size: 0.9em;
          color: var(--color-primary);
          font-weight: 600;
        }

        .input-method-content {
          padding: 0 16px 16px;
        }

        .input-method-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .input-method-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 8px;
          background: var(--color-background);
          border: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .input-method-option:hover:not(:disabled) {
          border-color: var(--color-primary);
          background: var(--color-surface-hover);
        }

        .input-method-option--active {
          border-color: var(--color-primary);
          background: color-mix(in srgb, var(--color-primary) 15%, transparent);
        }

        .input-method-option:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .input-method-option-icon {
          font-size: 24px;
          margin-bottom: 4px;
        }

        .input-method-option-name {
          font-weight: 600;
          font-size: 0.9em;
        }

        .input-method-option-desc {
          font-size: 0.7em;
          color: var(--color-text-secondary);
          text-align: center;
          margin-top: 2px;
        }

        .input-method-settings {
          padding-top: 12px;
          border-top: 1px solid var(--color-border);
        }

        .input-method-settings-title {
          font-size: 0.85em;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--color-text-secondary);
        }

        .input-method-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--color-background);
          border-radius: 4px;
          font-size: 0.85em;
        }

        .input-method-status--success {
          color: var(--color-success);
        }

        .input-method-status--warning {
          color: var(--color-warning);
        }

        .input-method-status--error {
          color: var(--color-error);
        }

        @media (max-width: 400px) {
          .input-method-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

/** Theremin-specific settings */
function ThereminSettings() {
  const thereminMode = getThereminMode();
  const config = thereminMode.getConfig();

  return (
    <div className="input-method-settings">
      <div className="input-method-settings-title">Theremin Settings</div>
      <div className="input-method-status">
        <span>Pitch Range: {config.pitchMin} - {config.pitchMax} (MIDI)</span>
      </div>
      <p style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)', marginTop: 8 }}>
        <strong>MusiKraken-style control:</strong><br/>
        • Move hand left/right → Change pitch<br/>
        • Raise hand up → Increase volume<br/>
        • Lower hand down → Decrease volume<br/>
        • Spread/close fingers → Filter expression<br/>
        • Only ONE hand needed!
      </p>
    </div>
  );
}

/** Motion tracking status */
function MotionStatus({
  isAvailable,
  hasPermission,
}: {
  isAvailable: boolean;
  hasPermission: boolean | null;
}) {
  return (
    <div className="input-method-settings">
      <div className="input-method-settings-title">Motion Status</div>
      <div
        className={`input-method-status ${
          !isAvailable
            ? 'input-method-status--error'
            : hasPermission
            ? 'input-method-status--success'
            : 'input-method-status--warning'
        }`}
      >
        {!isAvailable
          ? '⚠️ Device motion not supported'
          : hasPermission
          ? '✓ Motion tracking active'
          : '⚠️ Permission required - tap to allow'}
      </div>
      <p style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)', marginTop: 8 }}>
        Tilt your device to control pitch and filter. Shake for triggers.
      </p>
    </div>
  );
}

/** Color tracking info */
function ColorTrackingInfo() {
  return (
    <div className="input-method-settings">
      <div className="input-method-settings-title">Color Tracking</div>
      <div className="input-method-status">
        Tracking: Red, Green, Blue, Yellow
      </div>
      <p style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)', marginTop: 8 }}>
        Hold a colored object in front of the camera. Position controls pitch/volume.
      </p>
    </div>
  );
}

export default InputMethodPanel;
