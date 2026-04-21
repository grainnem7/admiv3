/**
 * InputMethodPanel - Tabbed input source selector
 *
 * Allows switching between different input methods:
 * - Body tracking (pose/hands/face)
 * - Theremin mode (two-hand pitch/volume)
 * - Device motion (accelerometer/gyroscope)
 * - Color tracking (colored object tracking)
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '../../state/store';
import { getDeviceMotionTracker, getThereminMode, getTrackingManager, getColorTracker } from '../../tracking';
import { getMappingEngine } from '../../mapping/MappingEngine';
import type { ColorBlob } from '../../tracking/ColorTracker';
import {
  IconBody, IconHand, IconSmartphone, IconPalette,
  IconChevronDown, IconChevronRight,
} from '../design-system/Icons';

export type InputMethod = 'body' | 'theremin' | 'motion' | 'color';

interface InputMethodPanelProps {
  isExpanded: boolean;
  onToggle: () => void;
  onInputMethodChange?: (method: InputMethod) => void;
  /** Called when user wants to calibrate a color by clicking the video */
  onRequestColorCalibration?: (colorId: string) => void;
}

const INPUT_METHODS: Array<{
  id: InputMethod;
  name: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: 'body',
    name: 'Body',
    description: 'Track your arms, head, and torso with the camera',
    icon: <IconBody size={20} />,
  },
  {
    id: 'theremin',
    name: 'Theremin',
    description: 'Use one hand for pitch, one for volume',
    icon: <IconHand size={20} />,
  },
  {
    id: 'motion',
    name: 'Motion',
    description: 'Tilt and shake your phone or tablet',
    icon: <IconSmartphone size={20} />,
  },
  {
    id: 'color',
    name: 'Color',
    description: 'Move a colored object to control sound',
    icon: <IconPalette size={20} />,
  },
];

function InputMethodPanel({
  isExpanded,
  onToggle,
  onInputMethodChange,
  onRequestColorCalibration,
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

      // Disable color expression when switching away from color
      if (activeMethod === 'color' && method !== 'color') {
        getMappingEngine().enableColorExpression(false);
      }

      if (method === 'color') {
        // Disable theremin mode if it was active
        getMappingEngine().setThereminMode(false);

        const colorModalities = {
          pose: false,
          leftHand: false,
          rightHand: false,
          face: false,
          color: true,
        };
        setActiveModalities(colorModalities);
        const trackingManager = getTrackingManager();
        await trackingManager.setActiveModalities(colorModalities);
        // Enable color expression node and default to theremin auto mode
        getMappingEngine().enableColorExpression(true);
        getMappingEngine().setColorAutoMode('theremin');
        console.log('[InputMethodPanel] Color tracking mode enabled');
      } else if (method === 'theremin') {
        // Enable both hands for theremin mode
        const thereminModalities = {
          pose: false,
          leftHand: true,
          rightHand: true,
          face: false,
          color: false,
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
            color: false,
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
        <span className="input-method-toggle-icon">{isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}</span>
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
          {activeMethod === 'color' && (
            <ColorTrackingSettings
              onRequestCalibration={onRequestColorCalibration}
            />
          )}
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
          ? 'Device motion not supported'
          : hasPermission
          ? 'Motion tracking active'
          : 'Permission required - tap to allow'}
      </div>
      <p style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)', marginTop: 8 }}>
        Tilt your device to control pitch and filter. Shake for triggers.
      </p>
    </div>
  );
}

/**
 * Color Tracking Settings — "click to start" flow.
 *
 * User flow:
 * 1. No colors tracked initially → show "Click on your object" prompt
 * 2. User clicks object in video → color calibrated → tracking starts
 * 3. Panel shows tracked color with LIVE status
 * 4. User can add more colors or change what they control
 */
/** What a tracked color controls */
type ColorRole = 'pitch' | 'volume' | 'filter' | 'pitch+volume';
/** Which voice/sound to use */
type ColorVoice = 'melody' | 'bass' | 'chord';

const ROLE_LABELS: Record<ColorRole, string> = {
  'pitch+volume': 'Pitch + Volume',
  pitch: 'Pitch only',
  volume: 'Volume only',
  filter: 'Filter',
};

const VOICE_LABELS: Record<ColorVoice, string> = {
  melody: 'Melody',
  bass: 'Bass',
  chord: 'Chords',
};

export interface ColorConfig {
  role: ColorRole;
  voice: ColorVoice;
}

function ColorTrackingSettings({
  onRequestCalibration,
}: {
  onRequestCalibration?: (colorId: string) => void;
}) {
  const [detectedBlobs, setDetectedBlobs] = useState<ColorBlob[]>([]);
  const [trackedColorsList, setTrackedColorsList] = useState(getColorTracker().getTrackedColors());
  const [colorConfigs, setColorConfigs] = useState<Record<string, ColorConfig>>({});
  const pollRef = useRef<number | null>(null);

  // Poll for live detection status
  useEffect(() => {
    const poll = () => {
      const trackingFrame = useAppStore.getState().trackingFrame;
      if (trackingFrame?.color) {
        setDetectedBlobs(trackingFrame.color.blobs);
      }
      // Re-read tracked colors in case calibration happened
      setTrackedColorsList(getColorTracker().getTrackedColors());
      pollRef.current = requestAnimationFrame(poll);
    };
    pollRef.current = requestAnimationFrame(poll);
    return () => {
      if (pollRef.current !== null) cancelAnimationFrame(pollRef.current);
    };
  }, []);

  const hasTrackedColors = trackedColorsList.length > 0;

  const handleAddColor = useCallback(() => {
    const nextId = `color-${trackedColorsList.length + 1}`;
    onRequestCalibration?.(nextId);
  }, [trackedColorsList.length, onRequestCalibration]);

  const handleRemoveColor = useCallback((colorId: string) => {
    getColorTracker().removeColor(colorId);
    setTrackedColorsList(getColorTracker().getTrackedColors());
  }, []);

  const updateColorConfig = useCallback((colorId: string, config: ColorConfig) => {
    const newConfigs = { ...colorConfigs, [colorId]: config };
    setColorConfigs(newConfigs);
    _colorConfigs = newConfigs;
  }, [colorConfigs]);

  return (
    <div className="input-method-settings">
      {!hasTrackedColors ? (
        /* ====== No colors yet — clear call-to-action ====== */
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <p style={{
            fontSize: '0.8em', color: 'var(--color-text-secondary)',
            marginBottom: 10, lineHeight: 1.4,
          }}>
            Hold a coloured object in front of the camera, then click it in the video.
          </p>
          <button
            onClick={handleAddColor}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '0.9em',
              fontWeight: 600,
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Click to choose a color
          </button>
        </div>
      ) : (
        /* ====== Colors tracked — compact list ====== */
        <>
          {/* Action bar: add + reset, always visible at top */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 8,
          }}>
            <button
              onClick={handleAddColor}
              style={{
                flex: 1, padding: '8px 6px',
                fontSize: '0.8em', fontWeight: 600,
                background: 'var(--color-primary)',
                border: 'none', borderRadius: 5,
                cursor: 'pointer', color: '#fff',
              }}
            >
              + Add color
            </button>
            <button
              onClick={() => {
                getColorTracker().resetColors();
                setTrackedColorsList([]);
              }}
              style={{
                padding: '8px 10px',
                fontSize: '0.8em', fontWeight: 500,
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                borderRadius: 5, cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              Reset
            </button>
          </div>

          {/* Tracked colors — compact cards */}
          {trackedColorsList.map((color) => {
            const blob = detectedBlobs.find(b => b.colorId === color.id);
            const isDetected = blob?.found ?? false;
            const swatchColor = `hsl(${color.hue}, 70%, 50%)`;
            const config = colorConfigs[color.id] ?? { role: 'pitch+volume', voice: 'melody' };

            return (
              <div
                key={color.id}
                style={{
                  padding: '6px 8px', marginBottom: 4, borderRadius: 5,
                  background: isDetected
                    ? 'rgba(34, 197, 94, 0.08)'
                    : 'var(--color-background)',
                  border: `1px solid ${isDetected ? 'rgba(34, 197, 94, 0.2)' : 'var(--color-border)'}`,
                }}
              >
                {/* Row 1: swatch, name, status, remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: swatchColor, flexShrink: 0,
                    boxShadow: isDetected
                      ? `0 0 6px ${swatchColor}`
                      : 'none',
                  }} />
                  <span style={{ flex: 1, fontSize: '0.8em', fontWeight: 600 }}>
                    {color.id}
                  </span>
                  <span style={{
                    fontSize: '0.65em', fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    background: isDetected ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                    color: isDetected ? '#22c55e' : 'var(--color-text-tertiary)',
                  }}>
                    {isDetected ? 'LIVE' : '---'}
                  </span>
                  <button
                    onClick={() => handleRemoveColor(color.id)}
                    title="Remove this color"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)', fontSize: '0.85em',
                      padding: '0 2px', lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>

                {/* Row 2: controls as a single compact row */}
                <div style={{
                  marginTop: 4, display: 'flex', gap: 3,
                  fontSize: '0.7em',
                }}>
                  <CompactSelect
                    value={config.role}
                    options={ROLE_LABELS}
                    onChange={(v) => updateColorConfig(color.id, { ...config, role: v as ColorRole })}
                  />
                  <CompactSelect
                    value={config.voice}
                    options={VOICE_LABELS}
                    onChange={(v) => updateColorConfig(color.id, { ...config, voice: v as ColorVoice })}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Compact select that fits in a narrow panel */
function CompactSelect({ value, options, onChange }: {
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '2px 4px', fontSize: '1em',
        background: 'var(--color-background)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
        borderRadius: 3,
        flex: 1,
        minWidth: 0,
      }}
    >
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}

/** Global color config map — read by PerformanceScreenV2 for sound routing */
let _colorConfigs: Record<string, ColorConfig> = {};
export function getColorConfigs(): Record<string, ColorConfig> {
  return _colorConfigs;
}

export default InputMethodPanel;
