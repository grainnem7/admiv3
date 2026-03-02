/**
 * Mute Button - Always visible safety control
 *
 * Fixed position button for quick audio mute/unmute.
 * Designed with high visibility for workshop/performance use.
 */

import { useAppStore, useIsMuted } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { IconVolume, IconVolumeMute } from '../design-system/Icons';

function MuteButton() {
  const isMuted = useIsMuted();
  const toggleMute = useAppStore((s) => s.toggleMute);

  const handleClick = async () => {
    // Resume audio context on user interaction
    const audioEngine = getAudioEngine();
    await audioEngine.resume();

    toggleMute();
  };

  return (
    <button
      onClick={handleClick}
      aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
      aria-pressed={!isMuted}
      title={isMuted ? 'Click to unmute (Space)' : 'Click to mute (Space)'}
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        width: 56,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        cursor: 'pointer',
        zIndex: 'var(--z-sticky)',
        transition: 'all var(--duration-fast) var(--ease-default)',
        backgroundColor: isMuted ? 'var(--color-error)' : 'var(--color-success)',
        color: 'var(--color-text)',
        boxShadow: isMuted
          ? '0 4px 12px rgba(239, 68, 68, 0.4)'
          : '0 4px 12px rgba(34, 197, 94, 0.4)',
      }}
    >
      {isMuted ? <IconVolumeMute size={24} /> : <IconVolume size={24} />}
    </button>
  );
}

export default MuteButton;
