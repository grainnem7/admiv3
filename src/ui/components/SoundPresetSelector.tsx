/**
 * Sound Preset Selector - Choose different oscillator types and sound styles
 */

import { useState } from 'react';
import { useAppStore, useCurrentSoundPreset } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';

interface SoundPreset {
  id: string;
  name: string;
  oscillatorType: OscillatorType;
  description: string;
}

const PRESETS: SoundPreset[] = [
  { id: 'sine', name: 'Soft', oscillatorType: 'sine', description: 'Pure tone' },
  { id: 'triangle', name: 'Warm', oscillatorType: 'triangle', description: 'Mellow' },
  { id: 'square', name: 'Bright', oscillatorType: 'square', description: 'Buzzy' },
  { id: 'sawtooth', name: 'Sharp', oscillatorType: 'sawtooth', description: 'Brassy' },
];

function SoundPresetSelector() {
  const currentPreset = useCurrentSoundPreset();
  const setSoundPreset = useAppStore((s) => s.setSoundPreset);
  const [selected, setSelected] = useState(currentPreset || 'sine');

  const handlePresetChange = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSelected(presetId);
    setSoundPreset(presetId);
    getAudioEngine().setOscillatorType(preset.oscillatorType);
  };

  return (
    <div className="sound-preset-selector">
      <label>
        <span>Sound Style</span>
      </label>
      <div className="sound-preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetChange(preset.id)}
            className={`mode-option ${selected === preset.id ? 'mode-option--selected' : ''}`}
            aria-pressed={selected === preset.id}
            title={preset.description}
          >
            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{preset.name}</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {preset.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SoundPresetSelector;
