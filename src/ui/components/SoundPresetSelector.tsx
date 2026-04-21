/**
 * Sound Preset Selector - Choose different oscillator types and sound styles
 *
 * Redesigned with clear visual cards, waveform icons, and proper states.
 */

import { useState, type ReactNode } from 'react';
import { useAppStore, useCurrentSoundPreset } from '../../state/store';
import { getAudioEngine } from '../../sound/AudioEngine';
import {
  IconWaveformSine, IconWaveformTriangle, IconWaveformSquare, IconWaveformSawtooth,
} from '../design-system/Icons';

interface SoundPreset {
  id: string;
  name: string;
  oscillatorType: OscillatorType;
  description: string;
  icon: ReactNode;
}

const PRESETS: SoundPreset[] = [
  { id: 'sine', name: 'Soft', oscillatorType: 'sine', description: 'Pure, smooth tone', icon: <IconWaveformSine size={24} /> },
  { id: 'triangle', name: 'Warm', oscillatorType: 'triangle', description: 'Mellow, rounded', icon: <IconWaveformTriangle size={24} /> },
  { id: 'square', name: 'Bright', oscillatorType: 'square', description: 'Buzzy, 8-bit feel', icon: <IconWaveformSquare size={24} /> },
  { id: 'sawtooth', name: 'Sharp', oscillatorType: 'sawtooth', description: 'Brassy, rich', icon: <IconWaveformSawtooth size={24} /> },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-2)',
      }}>
        {PRESETS.map((preset) => {
          const isSelected = selected === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset.id)}
              aria-pressed={isSelected}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding: 'var(--space-3) var(--space-2)',
                backgroundColor: isSelected ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease-default)',
                color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
              }}
            >
              <span style={{
                opacity: isSelected ? 1 : 0.6,
                display: 'flex',
                alignItems: 'center',
              }}>
                {preset.icon}
              </span>
              <span style={{
                fontSize: 'var(--text-base)',
                fontWeight: 'var(--font-semibold)',
              }}>
                {preset.name}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
              }}>
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SoundPresetSelector;
