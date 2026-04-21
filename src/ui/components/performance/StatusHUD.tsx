/**
 * StatusHUD - Minimal floating overlay on video.
 *
 * Shows only: active note frequency + volume bar.
 * Tracking state and modalities are shown in toolbar and status bar (no duplication).
 */

import { useIsMuted, useActiveNotes } from '../../../state/store';
import { frequencyToMidi, midiToNote } from '../../../sound/MusicTheory';

interface StatusHUDProps {
  currentFrame: unknown; // kept for interface compat, not used
  currentProfile: unknown;
  isActive: boolean;
  masterVolume: number;
}

export default function StatusHUD({ isActive, masterVolume }: StatusHUDProps) {
  const isMuted = useIsMuted();
  const activeNotes = useActiveNotes();
  const latestNote = activeNotes.length > 0 ? activeNotes[activeNotes.length - 1] : null;

  // Don't render anything if muted and no activity
  if (isMuted && !latestNote) return null;

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 30,
      display: 'flex', flexDirection: 'column', gap: 6,
      pointerEvents: 'none',
      opacity: isMuted ? 0.4 : 1,
      transition: 'opacity 200ms ease',
    }} role="status" aria-label="Current note">

      {/* Active note — shows note name (A4) with frequency below */}
      {latestNote && !isMuted && (
        <div style={{
          padding: '6px 12px', borderRadius: 'var(--radius-md)',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          width: 'fit-content',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 20, fontWeight: 700,
            color: 'var(--color-primary)',
            lineHeight: 1,
          }}>
            {midiToNote(Math.round(frequencyToMidi(latestNote.frequency)))}
          </span>
          <span style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 10, color: 'var(--color-text-tertiary)',
            lineHeight: 1, marginTop: 2,
          }}>
            {Math.round(latestNote.frequency)} Hz
          </span>
        </div>
      )}

      {/* Volume bar */}
      {isActive && (
        <div style={{
          padding: '5px 10px', borderRadius: 'var(--radius-md)',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          width: 80,
        }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${(isMuted ? 0 : masterVolume) * 125}%`,
              background: isMuted ? 'var(--color-error)'
                : masterVolume > 0.7 ? 'linear-gradient(90deg, var(--color-success), var(--color-warning), var(--color-error))'
                : masterVolume > 0.4 ? 'linear-gradient(90deg, var(--color-success), var(--color-warning))'
                : 'var(--color-success)',
              transition: 'width 150ms ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
