/**
 * EffectChainSelector - UI for selecting effect presets
 *
 * Displays available presets and allows switching between them.
 */

import { useState, useCallback } from 'react';
import {
  EFFECT_PRESETS,
  type EffectChainPreset,
  type FilterConfig,
  type DelayConfig,
  type ReverbConfig,
  type ChorusConfig,
} from '../../effects';
import { getSoundEngine } from '../../sound/SoundEngine';

interface EffectChainSelectorProps {
  isExpanded: boolean;
  onToggle: () => void;
}

function EffectChainSelector({ isExpanded, onToggle }: EffectChainSelectorProps) {
  const [presets] = useState<EffectChainPreset[]>(EFFECT_PRESETS);
  const [currentPresetId, setCurrentPresetId] = useState<string>('clean');
  const [isLoading, setIsLoading] = useState(false);

  // Apply preset to SoundEngine
  const applyPresetToSoundEngine = useCallback((preset: EffectChainPreset) => {
    const soundEngine = getSoundEngine();

    // Extract effect configs
    const filterConfig = preset.effects.find((e) => e.type === 'filter')?.config as FilterConfig | undefined;
    const delayConfig = preset.effects.find((e) => e.type === 'delay')?.config as DelayConfig | undefined;
    const reverbConfig = preset.effects.find((e) => e.type === 'reverb')?.config as ReverbConfig | undefined;
    const chorusConfig = preset.effects.find((e) => e.type === 'chorus')?.config as ChorusConfig | undefined;

    // Apply to sound engine
    soundEngine.applyEffectConfig({
      filterFrequency: filterConfig?.frequency,
      filterQ: filterConfig?.Q,
      delayFeedback: delayConfig?.feedback,
      delayWet: delayConfig?.wet,
      reverbWet: reverbConfig?.wet,
      chorusFrequency: chorusConfig?.frequency,
      chorusDepth: chorusConfig?.depth,
      chorusWet: chorusConfig?.wet,
    });

    // Apply master gain
    soundEngine.setMasterVolume(Math.pow(10, preset.masterGain / 20) * 0.7);

    console.log(`[EffectChainSelector] Applied preset: ${preset.name}`);
  }, []);

  // Handle preset selection
  const handlePresetChange = useCallback(async (presetId: string) => {
    if (presetId === currentPresetId) return;

    setIsLoading(true);

    try {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        applyPresetToSoundEngine(preset);
        setCurrentPresetId(presetId);
      }
    } catch (error) {
      console.error('Error applying preset:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPresetId, presets, applyPresetToSoundEngine]);

  const currentPreset = presets.find((p) => p.id === currentPresetId);

  // Category colors for visual organization
  const getCategoryColor = (category: EffectChainPreset['category']): string => {
    switch (category) {
      case 'clean':
        return 'var(--color-success)';
      case 'warm':
        return '#ff9966';
      case 'space':
        return '#9966ff';
      case 'lofi':
        return '#ffcc66';
      case 'electronic':
        return '#66ccff';
      case 'experimental':
        return '#ff66cc';
      default:
        return 'var(--color-text-secondary)';
    }
  };

  return (
    <div className={`effect-chain-selector ${isExpanded ? 'effect-chain-selector--expanded' : ''}`}>
      <button
        className="effect-chain-toggle"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide effect presets' : 'Show effect presets'}
      >
        <span className="effect-chain-toggle-icon">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="effect-chain-toggle-label">Sound Style</span>
        <span
          className="effect-chain-current"
          style={{ color: currentPreset ? getCategoryColor(currentPreset.category) : undefined }}
        >
          {currentPreset?.name ?? 'None'}
        </span>
      </button>

      {isExpanded && (
        <div className="effect-chain-content">
          {/* Preset grid */}
          <div className="effect-chain-presets">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`effect-chain-preset ${currentPresetId === preset.id ? 'effect-chain-preset--active' : ''}`}
                onClick={() => handlePresetChange(preset.id)}
                disabled={isLoading}
                style={{
                  '--preset-color': getCategoryColor(preset.category),
                } as React.CSSProperties}
              >
                <span className="effect-chain-preset-name">{preset.name}</span>
                <span className="effect-chain-preset-desc">{preset.description}</span>
              </button>
            ))}
          </div>

          {/* Current preset info */}
          {currentPreset && (
            <div className="effect-chain-info">
              <p className="effect-chain-info-text">
                Effects: {currentPreset.effects.map((e) => e.type).join(' → ')}
              </p>
            </div>
          )}

          {isLoading && (
            <div className="effect-chain-loading">
              Applying...
            </div>
          )}
        </div>
      )}

      <style>{`
        .effect-chain-selector {
          background: var(--color-surface);
          border-radius: 8px;
          overflow: hidden;
        }

        .effect-chain-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: none;
          border: none;
          color: var(--color-text);
          cursor: pointer;
          text-align: left;
        }

        .effect-chain-toggle:hover {
          background: var(--color-surface-hover);
        }

        .effect-chain-toggle-icon {
          font-size: 10px;
          opacity: 0.6;
        }

        .effect-chain-toggle-label {
          flex: 1;
          font-weight: 500;
        }

        .effect-chain-current {
          font-size: 0.9em;
          font-weight: 600;
        }

        .effect-chain-content {
          padding: 0 16px 16px;
        }

        .effect-chain-presets {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .effect-chain-preset {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 10px 12px;
          background: var(--color-background);
          border: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .effect-chain-preset:hover {
          border-color: var(--preset-color, var(--color-primary));
          background: var(--color-surface-hover);
        }

        .effect-chain-preset--active {
          border-color: var(--preset-color, var(--color-primary));
          background: color-mix(in srgb, var(--preset-color, var(--color-primary)) 15%, transparent);
        }

        .effect-chain-preset:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .effect-chain-preset-name {
          font-weight: 600;
          font-size: 0.95em;
          color: var(--preset-color, var(--color-text));
        }

        .effect-chain-preset-desc {
          font-size: 0.75em;
          color: var(--color-text-secondary);
          margin-top: 2px;
        }

        .effect-chain-info {
          padding-top: 8px;
          border-top: 1px solid var(--color-border);
        }

        .effect-chain-info-text {
          font-size: 0.8em;
          color: var(--color-text-secondary);
          margin: 0;
        }

        .effect-chain-loading {
          text-align: center;
          padding: 8px;
          font-size: 0.85em;
          color: var(--color-text-secondary);
        }

        @media (max-width: 400px) {
          .effect-chain-presets {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default EffectChainSelector;
