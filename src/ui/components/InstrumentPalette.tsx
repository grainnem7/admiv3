/**
 * Instrument Palette - Draggable instruments that can be placed in the webcam view
 */

import { useCallback } from 'react';
import { INSTRUMENTS, type InstrumentDefinition } from '../../state/instrumentZones';

interface InstrumentPaletteProps {
  onDragStart: (instrument: InstrumentDefinition, e: React.DragEvent) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function InstrumentPalette({ onDragStart, isExpanded, onToggle }: InstrumentPaletteProps) {
  const handleDragStart = useCallback(
    (instrument: InstrumentDefinition, e: React.DragEvent) => {
      e.dataTransfer.setData('instrument', JSON.stringify(instrument));
      e.dataTransfer.effectAllowed = 'copy';
      onDragStart(instrument, e);
    },
    [onDragStart]
  );

  return (
    <div className={`instrument-palette ${isExpanded ? 'instrument-palette--expanded' : ''}`}>
      <button
        className="instrument-palette-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide instruments' : 'Show instruments'}
      >
        <span className="instrument-palette-toggle-icon">
          {isExpanded ? '◀' : '▶'}
        </span>
        <span className="instrument-palette-toggle-label">
          {isExpanded ? 'Instruments' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="instrument-palette-content">
          <p className="instrument-palette-hint">
            Drag instruments onto the video
          </p>

          <div className="instrument-grid">
            {INSTRUMENTS.map((instrument) => (
              <div
                key={instrument.type}
                className="instrument-item"
                draggable
                onDragStart={(e) => handleDragStart(instrument, e)}
                style={{ '--instrument-color': instrument.color } as React.CSSProperties}
                title={`Drag ${instrument.name} to video`}
              >
                <span className="instrument-icon">{instrument.icon}</span>
                <span className="instrument-name">{instrument.name}</span>
              </div>
            ))}
          </div>

          <div className="instrument-palette-help">
            <p>Drop on video to create a trigger zone</p>
            <p>Click zone to configure trigger</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default InstrumentPalette;
