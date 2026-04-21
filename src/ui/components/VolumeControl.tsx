/**
 * Volume Control - Styled slider with visual fill and percentage display
 */

import { useAppStore, useMasterVolume, useIsMuted } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { AUDIO } from '../../utils/constants';
import { IconVolume, IconVolumeMute } from '../design-system/Icons';

function VolumeControl() {
  const volume = useMasterVolume();
  const isMuted = useIsMuted();
  const setMasterVolume = useAppStore((s) => s.setMasterVolume);
  const toggleMute = useAppStore((s) => s.toggleMute);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setMasterVolume(newVolume);
    getAudioEngine().setMasterVolume(newVolume);
  };

  const volumePercent = Math.round((volume / AUDIO.MAX_SAFE_VOLUME) * 100);
  const fillPercent = (volume / AUDIO.MAX_SAFE_VOLUME) * 100;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
      opacity: isMuted ? 0.5 : 1,
      transition: 'opacity var(--duration-fast)',
    }}>
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={toggleMute}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isMuted ? 'var(--color-error)' : 'var(--color-text-secondary)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-medium)',
            padding: 0,
          }}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <IconVolumeMute size={16} /> : <IconVolume size={16} />}
          {isMuted ? 'Muted' : 'Volume'}
        </button>
        <span style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize: 'var(--text-sm)',
          color: isMuted ? 'var(--color-error)' : 'var(--color-text)',
          fontWeight: 'var(--font-semibold)',
          minWidth: 36,
          textAlign: 'right',
        }}>
          {volumePercent}%
        </span>
      </div>

      {/* Slider with custom track fill */}
      <div style={{ position: 'relative' }}>
        <input
          type="range"
          min="0"
          max={AUDIO.MAX_SAFE_VOLUME}
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          disabled={isMuted}
          aria-label="Master volume"
          style={{
            width: '100%',
            height: 'var(--slider-track-height)',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${fillPercent}%, var(--color-bg-overlay) ${fillPercent}%, var(--color-bg-overlay) 100%)`,
            borderRadius: 'var(--radius-full)',
            outline: 'none',
            cursor: isMuted ? 'not-allowed' : 'pointer',
          }}
        />
      </div>
    </div>
  );
}

export default VolumeControl;
