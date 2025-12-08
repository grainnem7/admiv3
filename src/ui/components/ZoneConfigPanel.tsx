/**
 * Zone Configuration Panel - Compact body part selector with finger toggles
 *
 * Shows when a zone is clicked, allowing users to configure:
 * - Which body part triggers the zone (button grid)
 * - Which fingers (when hand is selected)
 * - Delete zone option
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ZoneTriggerConfig, TriggerBodyPart, FingerConfig } from '../../state/instrumentZones';
import {
  DEFAULT_FINGER_CONFIG,
  isHandTrigger,
  allFingersEnabled,
  hasEnabledFinger,
} from '../../state/instrumentZones';

interface ZoneConfigPanelProps {
  /** The zone's current trigger configuration */
  triggerConfig: ZoneTriggerConfig;
  /** Zone name for display */
  zoneName: string;
  /** Callback when config changes */
  onConfigChange: (config: ZoneTriggerConfig) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Callback to delete the zone */
  onDelete: () => void;
}

// Compact button definitions for body parts
const BODY_PART_BUTTONS: { id: TriggerBodyPart; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'rightHand', label: 'R Hand' },
  { id: 'leftHand', label: 'L Hand' },
  { id: 'eitherHand', label: 'Both' },
  { id: 'head', label: 'Head' },
  { id: 'rightFoot', label: 'R Foot' },
  { id: 'leftFoot', label: 'L Foot' },
];

// Finger buttons with emoji icons
const FINGER_BUTTONS: { id: keyof FingerConfig; emoji: string; label: string }[] = [
  { id: 'thumb', emoji: '👍', label: 'Thumb' },
  { id: 'index', emoji: '☝️', label: 'Index' },
  { id: 'middle', emoji: '🖕', label: 'Middle' },
  { id: 'ring', emoji: '💍', label: 'Ring' },
  { id: 'pinky', emoji: '🤙', label: 'Pinky' },
];

function ZoneConfigPanel({
  triggerConfig,
  zoneName,
  onConfigChange,
  onClose,
  onDelete,
}: ZoneConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners with a small delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle body part change
  const handleBodyPartChange = useCallback(
    (bodyPart: TriggerBodyPart) => {
      onConfigChange({
        ...triggerConfig,
        bodyPart,
        // Reset fingers to all enabled when switching body parts
        fingers: isHandTrigger(bodyPart) ? { ...triggerConfig.fingers } : { ...DEFAULT_FINGER_CONFIG },
      });
    },
    [triggerConfig, onConfigChange]
  );

  // Handle finger toggle
  const handleFingerToggle = useCallback(
    (finger: keyof FingerConfig) => {
      const newFingers = {
        ...triggerConfig.fingers,
        [finger]: !triggerConfig.fingers[finger],
      };

      // Ensure at least one finger remains enabled
      if (!hasEnabledFinger(newFingers)) {
        return; // Don't allow disabling the last finger
      }

      onConfigChange({
        ...triggerConfig,
        fingers: newFingers,
      });
    },
    [triggerConfig, onConfigChange]
  );

  // Handle "All" toggle
  const handleAllFingersToggle = useCallback(() => {
    const allEnabled = allFingersEnabled(triggerConfig.fingers);
    if (allEnabled) {
      // Can't disable all - keep at least index finger
      onConfigChange({
        ...triggerConfig,
        fingers: {
          thumb: false,
          index: true,
          middle: false,
          ring: false,
          pinky: false,
        },
      });
    } else {
      // Enable all
      onConfigChange({
        ...triggerConfig,
        fingers: { ...DEFAULT_FINGER_CONFIG },
      });
    }
  }, [triggerConfig, onConfigChange]);

  const showFingerConfig = isHandTrigger(triggerConfig.bodyPart);
  const allEnabled = allFingersEnabled(triggerConfig.fingers);

  // Split body parts into two rows
  const row1 = BODY_PART_BUTTONS.slice(0, 4); // Any, R Hand, L Hand, Both
  const row2 = BODY_PART_BUTTONS.slice(4);    // Head, R Foot, L Foot

  return (
    <div
      ref={panelRef}
      className="zone-config-panel"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="zone-config-panel-header">
        <span className="zone-config-panel-title">{zoneName}</span>
        <button
          className="zone-config-panel-close"
          onClick={onClose}
          aria-label="Close configuration"
        >
          ×
        </button>
      </div>

      {/* Body Part Selector */}
      <div className="zone-config-section">
        <label className="zone-config-section-label">Trigger with:</label>
        <div className="zone-config-button-grid">
          <div className="zone-config-button-row">
            {row1.map((part) => (
              <button
                key={part.id}
                className={`zone-config-chip ${triggerConfig.bodyPart === part.id ? 'zone-config-chip--selected' : ''}`}
                onClick={() => handleBodyPartChange(part.id)}
              >
                {part.label}
              </button>
            ))}
          </div>
          <div className="zone-config-button-row">
            {row2.map((part) => (
              <button
                key={part.id}
                className={`zone-config-chip ${triggerConfig.bodyPart === part.id ? 'zone-config-chip--selected' : ''}`}
                onClick={() => handleBodyPartChange(part.id)}
              >
                {part.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Finger Toggles (only visible for hand options) */}
      {showFingerConfig && (
        <div className="zone-config-section zone-config-fingers-section">
          <label className="zone-config-section-label">Fingers:</label>
          <div className="zone-config-finger-grid">
            {/* All toggle */}
            <button
              className={`zone-config-chip zone-config-chip--all ${allEnabled ? 'zone-config-chip--selected' : ''}`}
              onClick={handleAllFingersToggle}
            >
              All
            </button>
            {/* Individual finger toggles */}
            <div className="zone-config-finger-row">
              {FINGER_BUTTONS.map((finger) => (
                <button
                  key={finger.id}
                  className={`zone-config-finger-chip ${triggerConfig.fingers[finger.id] ? 'zone-config-finger-chip--selected' : ''}`}
                  onClick={() => handleFingerToggle(finger.id)}
                  title={finger.label}
                >
                  <span className="zone-config-finger-emoji">{finger.emoji}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Zone Button */}
      <div className="zone-config-section zone-config-delete-section">
        <button
          className="zone-config-delete-btn"
          onClick={onDelete}
          aria-label="Delete zone"
        >
          🗑️ Delete Zone
        </button>
      </div>
    </div>
  );
}

export default ZoneConfigPanel;
