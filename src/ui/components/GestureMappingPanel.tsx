/**
 * Gesture Mapping Panel - Configure gesture-to-sound mappings
 *
 * Allows users to:
 * - Add new gesture→sound mappings
 * - Remove existing mappings
 * - Preview sounds
 */

import { useState, useCallback } from 'react';
import {
  GESTURE_TYPES,
  INSTRUMENTS,
  type GestureSoundMapping,
  type GestureType,
  type InstrumentType,
  createGestureSoundMapping,
  getGestureTypeDefinition,
  getInstrumentDefinition,
} from '../../state/instrumentZones';
import { getInstrumentSampler } from '../../sound/InstrumentSampler';

interface GestureMappingPanelProps {
  mappings: GestureSoundMapping[];
  onMappingsChange: (mappings: GestureSoundMapping[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function GestureMappingPanel({
  mappings,
  onMappingsChange,
  isExpanded,
  onToggle,
}: GestureMappingPanelProps) {
  const [selectedGesture, setSelectedGesture] = useState<GestureType | null>(null);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType | null>(null);

  // Preview a sound
  const handlePreviewSound = useCallback(async (instrumentType: InstrumentType) => {
    try {
      const sampler = getInstrumentSampler();
      await sampler.resume();
      sampler.trigger(instrumentType, 0.7);
    } catch (err) {
      console.error('Failed to preview sound:', err);
    }
  }, []);

  // Add a new mapping
  const handleAddMapping = useCallback(() => {
    if (!selectedGesture || !selectedInstrument) return;

    // Check if this gesture already has a mapping
    const existingIndex = mappings.findIndex(m => m.gestureType === selectedGesture);

    if (existingIndex >= 0) {
      // Update existing mapping
      const updated = [...mappings];
      updated[existingIndex] = {
        ...updated[existingIndex],
        instrumentType: selectedInstrument,
      };
      onMappingsChange(updated);
    } else {
      // Add new mapping
      const newMapping = createGestureSoundMapping(selectedGesture, selectedInstrument);
      onMappingsChange([...mappings, newMapping]);
    }

    // Reset selection
    setSelectedGesture(null);
    setSelectedInstrument(null);
  }, [selectedGesture, selectedInstrument, mappings, onMappingsChange]);

  // Remove a mapping
  const handleRemoveMapping = useCallback((mappingId: string) => {
    onMappingsChange(mappings.filter(m => m.id !== mappingId));
  }, [mappings, onMappingsChange]);

  // Toggle mapping enabled state
  const handleToggleMapping = useCallback((mappingId: string) => {
    onMappingsChange(mappings.map(m =>
      m.id === mappingId ? { ...m, enabled: !m.enabled } : m
    ));
  }, [mappings, onMappingsChange]);

  // Note: All gestures shown in grid, used ones are disabled
  // This allows users to see what's available while preventing duplicates

  return (
    <div className={`gesture-mapping-panel ${isExpanded ? 'gesture-mapping-panel--expanded' : ''}`}>
      <button
        className="gesture-mapping-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide gesture mappings' : 'Show gesture mappings'}
      >
        <span className="gesture-mapping-toggle-icon">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="gesture-mapping-toggle-label">
          Gesture Sounds
        </span>
        {mappings.length > 0 && (
          <span className="gesture-mapping-count">{mappings.length}</span>
        )}
      </button>

      {isExpanded && (
        <div className="gesture-mapping-content">
          {/* Current mappings */}
          {mappings.length > 0 && (
            <div className="gesture-mapping-list">
              <h4 className="gesture-mapping-section-title">Active Mappings</h4>
              {mappings.map(mapping => {
                const gesture = getGestureTypeDefinition(mapping.gestureType);
                const instrument = getInstrumentDefinition(mapping.instrumentType);
                return (
                  <div
                    key={mapping.id}
                    className={`gesture-mapping-item ${!mapping.enabled ? 'gesture-mapping-item--disabled' : ''}`}
                  >
                    <button
                      className="gesture-mapping-toggle-btn"
                      onClick={() => handleToggleMapping(mapping.id)}
                      title={mapping.enabled ? 'Disable' : 'Enable'}
                    >
                      {mapping.enabled ? '✓' : '○'}
                    </button>
                    <span className="gesture-mapping-gesture">
                      <span className="gesture-icon">{gesture.icon}</span>
                      {gesture.name}
                    </span>
                    <span className="gesture-mapping-arrow">→</span>
                    <span
                      className="gesture-mapping-instrument"
                      style={{ color: instrument.color }}
                      onClick={() => handlePreviewSound(mapping.instrumentType)}
                      title="Click to preview"
                    >
                      <span className="instrument-icon">{instrument.icon}</span>
                      {instrument.name}
                    </span>
                    <button
                      className="gesture-mapping-remove"
                      onClick={() => handleRemoveMapping(mapping.id)}
                      title="Remove mapping"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new mapping */}
          <div className="gesture-mapping-add">
            <h4 className="gesture-mapping-section-title">Add Mapping</h4>

            {/* Gesture selector */}
            <div className="gesture-selector">
              <label className="gesture-selector-label">Gesture:</label>
              <div className="gesture-selector-grid">
                {GESTURE_TYPES.map(gesture => {
                  const isUsed = mappings.some(m => m.gestureType === gesture.type);
                  return (
                    <button
                      key={gesture.type}
                      className={`gesture-option ${selectedGesture === gesture.type ? 'gesture-option--selected' : ''} ${isUsed ? 'gesture-option--used' : ''}`}
                      onClick={() => setSelectedGesture(gesture.type)}
                      disabled={isUsed}
                      title={isUsed ? 'Already mapped' : gesture.description}
                    >
                      <span className="gesture-option-icon">{gesture.icon}</span>
                      <span className="gesture-option-name">{gesture.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instrument selector */}
            {selectedGesture && (
              <div className="instrument-selector">
                <label className="instrument-selector-label">Sound:</label>
                <div className="instrument-selector-grid">
                  {INSTRUMENTS.map(instrument => (
                    <button
                      key={instrument.type}
                      className={`instrument-option ${selectedInstrument === instrument.type ? 'instrument-option--selected' : ''}`}
                      onClick={() => {
                        setSelectedInstrument(instrument.type);
                        handlePreviewSound(instrument.type);
                      }}
                      style={{ '--instrument-color': instrument.color } as React.CSSProperties}
                      title={`Select ${instrument.name}`}
                    >
                      <span className="instrument-option-icon">{instrument.icon}</span>
                      <span className="instrument-option-name">{instrument.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add button */}
            {selectedGesture && selectedInstrument && (
              <button
                className="gesture-mapping-add-btn"
                onClick={handleAddMapping}
              >
                Add Mapping
              </button>
            )}
          </div>

          {/* Help text */}
          <p className="gesture-mapping-help">
            Map gestures to instrument sounds. When you perform a gesture, the mapped sound will play.
          </p>
        </div>
      )}
    </div>
  );
}

export default GestureMappingPanel;
