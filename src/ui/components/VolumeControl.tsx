/**
 * Volume Control - Slider for master volume with visual feedback
 */

import { useAppStore, useMasterVolume, useIsMuted } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import { AUDIO } from '../../utils/constants';

function VolumeControl() {
  const volume = useMasterVolume();
  const isMuted = useIsMuted();
  const setMasterVolume = useAppStore((s) => s.setMasterVolume);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setMasterVolume(newVolume);
    getAudioEngine().setMasterVolume(newVolume);
  };

  const volumePercent = Math.round((volume / AUDIO.MAX_SAFE_VOLUME) * 100);

  return (
    <div className="volume-control">
      <label>
        <span>Volume</span>
        <span style={{ color: isMuted ? 'var(--color-error)' : 'var(--color-text)' }}>
          {isMuted ? 'Muted' : `${volumePercent}%`}
        </span>
      </label>
      <input
        type="range"
        min="0"
        max={AUDIO.MAX_SAFE_VOLUME}
        step="0.01"
        value={volume}
        onChange={handleVolumeChange}
        disabled={isMuted}
        aria-label="Master volume"
        style={{ opacity: isMuted ? 0.5 : 1 }}
      />
    </div>
  );
}

export default VolumeControl;
