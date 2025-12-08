/**
 * Mute Button - Always visible safety control
 */

import { useAppStore, useIsMuted } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';

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
      className={`mute-btn ${!isMuted ? 'mute-btn--unmuted' : ''}`}
      onClick={handleClick}
      aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
      aria-pressed={!isMuted}
      title={isMuted ? 'Click to unmute' : 'Click to mute'}
    >
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}

export default MuteButton;
