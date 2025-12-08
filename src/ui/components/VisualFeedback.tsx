/**
 * Visual Feedback - Shows current movement and sound state
 */

import { useCurrentMovement, useIsMuted, useActiveNotes } from '../../state/store';
import { frequencyToMidi } from '../../utils/math';

interface VisualFeedbackProps {
  frequency?: number;
  isActive?: boolean;
}

function VisualFeedback({ frequency: propFrequency, isActive: propActive }: VisualFeedbackProps) {
  const movement = useCurrentMovement();
  const isMuted = useIsMuted();
  const activeNotes = useActiveNotes();

  const isActive = propActive ?? movement?.isActive ?? false;
  const frequency = propFrequency ?? (activeNotes[0]?.frequency || 0);

  // Convert frequency to note name
  const getNoteName = (freq: number): string => {
    if (freq === 0) return '--';
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = Math.round(frequencyToMidi(freq));
    const noteName = noteNames[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${noteName}${octave}`;
  };

  // Calculate vertical position for pitch indicator (0-100%)
  const getPitchPosition = (): number => {
    if (!frequency) return 50;
    const midi = frequencyToMidi(frequency);
    // Map MIDI 48-72 (C3-C5) to 0-100%
    return Math.max(0, Math.min(100, ((midi - 48) / 24) * 100));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-lg)',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--border-radius-lg)',
        minWidth: '200px',
      }}
    >
      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <div
          className={`feedback-indicator ${isActive && !isMuted ? 'feedback-indicator--active' : ''}`}
        />
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          {isMuted ? 'Muted' : isActive ? 'Playing' : 'Ready'}
        </span>
      </div>

      {/* Pitch display */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-xxl)',
            fontWeight: 700,
            color: isActive ? 'var(--color-secondary)' : 'var(--color-text)',
            transition: 'color var(--transition-fast)',
          }}
        >
          {getNoteName(frequency)}
        </span>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          {frequency > 0 ? `${Math.round(frequency)} Hz` : 'Move to play'}
        </span>
      </div>

      {/* Pitch bar visualization */}
      <div
        style={{
          width: '100%',
          height: '120px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--border-radius)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scale markers */}
        {[0, 25, 50, 75, 100].map((pos) => (
          <div
            key={pos}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${pos}%`,
              height: '1px',
              backgroundColor: 'var(--color-text-muted)',
              opacity: 0.2,
            }}
          />
        ))}

        {/* Current pitch indicator */}
        <div
          style={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            bottom: `${getPitchPosition()}%`,
            height: '8px',
            backgroundColor: isActive ? 'var(--color-secondary)' : 'var(--color-text-muted)',
            borderRadius: '4px',
            transform: 'translateY(50%)',
            transition: 'bottom 0.1s ease-out, background-color var(--transition-fast)',
            boxShadow: isActive ? '0 0 12px var(--color-secondary)' : 'none',
          }}
        />
      </div>

      {/* Position readout */}
      {movement && (
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            fontFamily: 'monospace',
          }}
        >
          Position: ({(movement.position.x * 100).toFixed(0)}%, {(movement.position.y * 100).toFixed(0)}%)
        </div>
      )}
    </div>
  );
}

export default VisualFeedback;
