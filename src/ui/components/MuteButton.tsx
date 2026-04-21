/**
 * MuteButton — Redesigned
 *
 * Always-visible floating safety control with clear state indication.
 */

import { useAppStore, useIsMuted } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { IconVolume, IconVolumeMute } from '../design-system/Icons';

function MuteButton() {
  const isMuted = useIsMuted();
  const toggleMute = useAppStore((s) => s.toggleMute);

  const handleClick = async () => {
    await getAudioEngine().resume();
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
        bottom: 24, right: 24,
        width: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        border: 'none', cursor: 'pointer',
        zIndex: 200,
        transition: 'all 150ms ease',
        background: isMuted
          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
          : 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: '#fff',
        fontSize: 22,
        boxShadow: isMuted
          ? '0 4px 16px rgba(239,68,68,0.4), 0 2px 4px rgba(0,0,0,0.3)'
          : '0 4px 16px rgba(34,197,94,0.4), 0 2px 4px rgba(0,0,0,0.3)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {isMuted ? <IconVolumeMute size={24} /> : <IconVolume size={24} />}
    </button>
  );
}

export default MuteButton;
