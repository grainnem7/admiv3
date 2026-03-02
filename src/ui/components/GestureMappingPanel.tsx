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
  /** When true, parent panel is expanded so use larger layout */
  parentExpanded?: boolean;
}

// Inline styles for gesture panel
const gestureStyles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px',
  },
  gridExpanded: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  option: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '8px 4px',
    background: '#252525',
    border: '1px solid #333',
    color: '#ccc',
    fontSize: '10px',
    cursor: 'pointer',
    gap: '4px',
  },
  optionExpanded: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '12px 8px',
    background: '#252525',
    border: '1px solid #333',
    color: '#ccc',
    fontSize: '12px',
    cursor: 'pointer',
    gap: '6px',
  },
  optionSelected: {
    background: '#f97316',
    borderColor: '#f97316',
    color: '#fff',
  },
  optionUsed: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  icon: {
    fontSize: '20px',
  },
  iconExpanded: {
    fontSize: '24px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#f97316',
    textTransform: 'uppercase' as const,
    marginBottom: '8px',
    marginTop: '12px',
  },
  sectionTitleExpanded: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f97316',
    textTransform: 'uppercase' as const,
    marginBottom: '10px',
    marginTop: '16px',
  },
  label: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '6px',
    display: 'block',
  },
  labelExpanded: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '8px',
    display: 'block',
  },
  mappingItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    background: '#202020',
    border: '1px solid #333',
    marginBottom: '4px',
  },
  mappingItemExpanded: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#202020',
    border: '1px solid #333',
    marginBottom: '6px',
    fontSize: '13px',
  },
  addBtn: {
    width: '100%',
    padding: '10px',
    background: '#f97316',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '12px',
  },
  helpText: {
    fontSize: '11px',
    color: '#666',
    marginTop: '12px',
    lineHeight: 1.4,
  },
};

function GestureMappingPanel({
  mappings,
  onMappingsChange,
  isExpanded,
  onToggle,
  parentExpanded = false,
}: GestureMappingPanelProps) {
  const [selectedGesture, setSelectedGesture] = useState<GestureType | null>(null);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType | null>(null);

  // Use expanded layout when parent panel is expanded
  const useExpandedLayout = parentExpanded;

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
        <div style={{ padding: useExpandedLayout ? '16px' : '12px' }}>
          {/* Current mappings */}
          {mappings.length > 0 && (
            <div>
              <h4 style={useExpandedLayout ? gestureStyles.sectionTitleExpanded : gestureStyles.sectionTitle}>
                Active Mappings
              </h4>
              {mappings.map(mapping => {
                const gesture = getGestureTypeDefinition(mapping.gestureType);
                const instrument = getInstrumentDefinition(mapping.instrumentType);
                return (
                  <div
                    key={mapping.id}
                    style={{
                      ...(useExpandedLayout ? gestureStyles.mappingItemExpanded : gestureStyles.mappingItem),
                      opacity: mapping.enabled ? 1 : 0.5,
                    }}
                  >
                    <button
                      style={{
                        padding: '4px 8px',
                        background: mapping.enabled ? '#22c55e' : '#333',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleMapping(mapping.id)}
                      title={mapping.enabled ? 'Disable' : 'Enable'}
                    >
                      {mapping.enabled ? 'ON' : 'OFF'}
                    </button>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, color: '#fff' }}>
                      <span style={useExpandedLayout ? gestureStyles.iconExpanded : gestureStyles.icon}>{gesture.icon}</span>
                      {gesture.name}
                    </span>
                    <span style={{ color: '#666' }}>-&gt;</span>
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', color: instrument.color, cursor: 'pointer' }}
                      onClick={() => handlePreviewSound(mapping.instrumentType)}
                      title="Click to preview"
                    >
                      <span style={useExpandedLayout ? gestureStyles.iconExpanded : gestureStyles.icon}>{instrument.icon}</span>
                      {instrument.name}
                    </span>
                    <button
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        border: '1px solid #444',
                        color: '#666',
                        fontSize: '16px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleRemoveMapping(mapping.id)}
                      title="Remove mapping"
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new mapping */}
          <div>
            <h4 style={useExpandedLayout ? gestureStyles.sectionTitleExpanded : gestureStyles.sectionTitle}>
              Add Mapping
            </h4>

            {/* Gesture selector */}
            <div>
              <label style={useExpandedLayout ? gestureStyles.labelExpanded : gestureStyles.label}>
                Gesture:
              </label>
              <div style={useExpandedLayout ? gestureStyles.gridExpanded : gestureStyles.grid}>
                {GESTURE_TYPES.map(gesture => {
                  const isUsed = mappings.some(m => m.gestureType === gesture.type);
                  const isSelected = selectedGesture === gesture.type;
                  return (
                    <button
                      key={gesture.type}
                      style={{
                        ...(useExpandedLayout ? gestureStyles.optionExpanded : gestureStyles.option),
                        ...(isSelected ? gestureStyles.optionSelected : {}),
                        ...(isUsed ? gestureStyles.optionUsed : {}),
                      }}
                      onClick={() => !isUsed && setSelectedGesture(gesture.type)}
                      disabled={isUsed}
                      title={isUsed ? 'Already mapped' : gesture.description}
                    >
                      <span style={useExpandedLayout ? gestureStyles.iconExpanded : gestureStyles.icon}>
                        {gesture.icon}
                      </span>
                      <span>{gesture.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instrument selector */}
            {selectedGesture && (
              <div style={{ marginTop: '12px' }}>
                <label style={useExpandedLayout ? gestureStyles.labelExpanded : gestureStyles.label}>
                  Sound:
                </label>
                <div style={useExpandedLayout ? gestureStyles.gridExpanded : gestureStyles.grid}>
                  {INSTRUMENTS.map(instrument => {
                    const isSelected = selectedInstrument === instrument.type;
                    return (
                      <button
                        key={instrument.type}
                        style={{
                          ...(useExpandedLayout ? gestureStyles.optionExpanded : gestureStyles.option),
                          ...(isSelected ? gestureStyles.optionSelected : {}),
                          borderColor: isSelected ? instrument.color : '#333',
                        }}
                        onClick={() => {
                          setSelectedInstrument(instrument.type);
                          handlePreviewSound(instrument.type);
                        }}
                        title={`Select ${instrument.name}`}
                      >
                        <span style={useExpandedLayout ? gestureStyles.iconExpanded : gestureStyles.icon}>
                          {instrument.icon}
                        </span>
                        <span>{instrument.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add button */}
            {selectedGesture && selectedInstrument && (
              <button
                style={gestureStyles.addBtn}
                onClick={handleAddMapping}
              >
                Add Mapping
              </button>
            )}
          </div>

          {/* Help text */}
          <p style={gestureStyles.helpText}>
            Map gestures to instrument sounds. When you perform a gesture, the mapped sound will play.
          </p>
        </div>
      )}
    </div>
  );
}

export default GestureMappingPanel;
