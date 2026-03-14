/**
 * Music Settings Panel
 *
 * Comprehensive music configuration UI bringing all settings from
 * movement-to-music-ai into ADMIv3. Covers:
 * - Presets (built-in + custom save/load/delete)
 * - Per-voice synth type selection
 * - Envelope (attack, release)
 * - Expression (vibrato, portamento)
 * - Dynamics & feel (velocity range, swing)
 * - Harmony & filter controls
 * - Effects (reverb, delay)
 * - Sensitivity controls
 * - Visual feedback toggles
 */

import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../state/store';
import type { MusicSettings, SynthType, FilterType, MusicScaleType, MusicSettingsPreset, BodyPartMusicalRole, BodyPartMusicConfig } from '../../state/types';
import { DEFAULT_MUSIC_SETTINGS } from '../../state/musicSettingsDefaults';
import { BUILT_IN_MUSIC_PRESETS } from '../../sound/MusicSettingsPresets';
import { NOTE_NAMES } from '../../sound/MusicTheory';
import { PROGRESSIONS } from '../../sound/ChordProgressions';

// ============================================
// Constants
// ============================================

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
];

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'lowpass', label: 'Lowpass' },
  { value: 'highpass', label: 'Highpass' },
  { value: 'bandpass', label: 'Bandpass' },
];

const SCALE_OPTIONS: { value: MusicScaleType; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'pentatonic', label: 'Pentatonic' },
  { value: 'pentatonicMinor', label: 'Pent. Minor' },
  { value: 'blues', label: 'Blues' },
  { value: 'dorian', label: 'Dorian' },
  { value: 'mixolydian', label: 'Mixolydian' },
  { value: 'wholeTone', label: 'Whole Tone' },
];

type SectionId = 'presets' | 'voice' | 'envelope' | 'expression' | 'dynamics' | 'harmony' | 'effects' | 'sensitivity' | 'visual' | 'bodyParts';

const BODY_PARTS: { id: string; label: string }[] = [
  { id: 'rightWrist', label: 'Right Wrist' },
  { id: 'rightElbow', label: 'Right Elbow' },
  { id: 'rightShoulder', label: 'Right Shoulder' },
  { id: 'rightHip', label: 'Right Hip' },
  { id: 'rightKnee', label: 'Right Knee' },
  { id: 'rightAnkle', label: 'Right Ankle' },
  { id: 'leftWrist', label: 'Left Wrist' },
  { id: 'leftElbow', label: 'Left Elbow' },
  { id: 'leftShoulder', label: 'Left Shoulder' },
  { id: 'leftHip', label: 'Left Hip' },
  { id: 'leftKnee', label: 'Left Knee' },
  { id: 'leftAnkle', label: 'Left Ankle' },
  { id: 'head', label: 'Head' },
];

const ROLE_OPTIONS: { value: BodyPartMusicalRole; label: string }[] = [
  { value: 'melodic', label: 'Melodic' },
  { value: 'bass', label: 'Bass' },
  { value: 'chord', label: 'Chord' },
  { value: 'disabled', label: 'Disabled' },
];

const ROLE_COLORS: Record<BodyPartMusicalRole, string> = {
  melodic: '#4285f4',
  bass: '#9c27b0',
  chord: '#4caf50',
  disabled: '#888',
};

/** Default octave ranges when switching roles */
const ROLE_DEFAULT_OCTAVES: Record<BodyPartMusicalRole, [number, number]> = {
  melodic: [4, 6],
  bass: [1, 3],
  chord: [2, 4],
  disabled: [4, 5],
};

// ============================================
// Component
// ============================================

const MusicSettingsPanel: React.FC = () => {
  const musicSettings = useAppStore((s) => s.musicSettings);
  const setMusicSettings = useAppStore((s) => s.setMusicSettings);
  const activeMusicPresetId = useAppStore((s) => s.activeMusicPresetId);
  const availableMusicPresets = useAppStore((s) => s.availableMusicPresets);
  const saveMusicPreset = useAppStore((s) => s.saveMusicPreset);
  const deleteMusicPreset = useAppStore((s) => s.deleteMusicPreset);

  const [expandedSection, setExpandedSection] = useState<SectionId | null>('presets');
  const [expandedBodyPart, setExpandedBodyPart] = useState<string | null>(null);

  const toggleSection = useCallback((section: SectionId) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  const update = useCallback(
    (updates: Partial<MusicSettings>) => {
      setMusicSettings(updates);
    },
    [setMusicSettings]
  );

  // Load a built-in or custom preset
  const handleLoadPreset = useCallback(
    (preset: MusicSettingsPreset) => {
      setMusicSettings({ ...DEFAULT_MUSIC_SETTINGS, ...preset.settings });
    },
    [setMusicSettings]
  );

  // Save current settings as custom preset
  const handleSavePreset = useCallback(() => {
    const name = window.prompt('Preset name:');
    if (!name) return;
    const preset: MusicSettingsPreset = {
      id: `music-custom-${Date.now()}`,
      name,
      description: 'Custom preset',
      isBuiltIn: false,
      settings: { ...musicSettings },
    };
    saveMusicPreset(preset);
  }, [musicSettings, saveMusicPreset]);

  // Body part config helpers
  const getBodyPartConfig = useCallback(
    (partId: string): BodyPartMusicConfig =>
      musicSettings.bodyPartConfigs[partId] || { role: 'disabled', octaveRange: [4, 5] as [number, number], sensitivity: 1 },
    [musicSettings.bodyPartConfigs]
  );

  const updateBodyPartConfig = useCallback(
    (partId: string, patch: Partial<BodyPartMusicConfig>) => {
      const current = getBodyPartConfig(partId);
      update({
        bodyPartConfigs: {
          ...musicSettings.bodyPartConfigs,
          [partId]: { ...current, ...patch },
        },
      });
    },
    [musicSettings.bodyPartConfigs, getBodyPartConfig, update]
  );

  const handleRoleChange = useCallback(
    (partId: string, role: BodyPartMusicalRole) => {
      const current = getBodyPartConfig(partId);
      // Auto-adjust octave range when switching roles
      const octaveRange = current.role === role ? current.octaveRange : ROLE_DEFAULT_OCTAVES[role];
      updateBodyPartConfig(partId, { role, octaveRange });
    },
    [getBodyPartConfig, updateBodyPartConfig]
  );

  // Compute body part role summary for section status
  const bodyPartSummary = (() => {
    const counts = { melodic: 0, bass: 0, chord: 0, disabled: 0 };
    for (const bp of BODY_PARTS) {
      const config = getBodyPartConfig(bp.id);
      counts[config.role]++;
    }
    const parts: string[] = [];
    if (counts.melodic > 0) parts.push(`${counts.melodic}M`);
    if (counts.bass > 0) parts.push(`${counts.bass}B`);
    if (counts.chord > 0) parts.push(`${counts.chord}C`);
    if (counts.disabled > 0) parts.push(`${counts.disabled}off`);
    return parts.join(' ');
  })();

  // Get progression names for display
  const progressionIds = Object.keys(PROGRESSIONS);

  // ============================================
  // Section Renderer
  // ============================================

  const renderSection = (
    id: SectionId,
    title: string,
    statusText?: string,
    content?: React.ReactNode
  ) => (
    <div className="module-section" key={id}>
      <div className="module-header" onClick={() => toggleSection(id)}>
        <span className={`expand-icon ${expandedSection === id ? 'expanded' : ''}`}>
          {'\u25B6'}
        </span>
        <span className="module-title">{title}</span>
        {statusText && <span className="module-status">{statusText}</span>}
      </div>
      {expandedSection === id && <div className="module-content">{content}</div>}
    </div>
  );

  // ============================================
  // Render
  // ============================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* PRESETS */}
      {renderSection('presets', 'Presets', activeMusicPresetId ? 'Active' : undefined, (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
            {BUILT_IN_MUSIC_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="btn btn--sm"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 8px',
                  background: activeMusicPresetId === preset.id ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: activeMusicPresetId === preset.id ? '#fff' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius)',
                  cursor: 'pointer',
                }}
                title={preset.description}
                onClick={() => handleLoadPreset(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>

          {/* Custom presets */}
          {availableMusicPresets.length > 0 && (
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                Saved:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                {availableMusicPresets.map((preset) => (
                  <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      className="btn btn--sm"
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        padding: '4px 8px',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--border-radius)',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleLoadPreset(preset)}
                    >
                      {preset.name}
                    </button>
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '2px',
                      }}
                      onClick={() => deleteMusicPreset(preset.id)}
                      title="Delete preset"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button
              className="btn btn--sm"
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '4px 8px',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                cursor: 'pointer',
              }}
              onClick={handleSavePreset}
            >
              Save Current
            </button>
            <button
              className="btn btn--sm"
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '4px 8px',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius)',
                cursor: 'pointer',
              }}
              onClick={() => setMusicSettings(DEFAULT_MUSIC_SETTINGS)}
            >
              Reset
            </button>
          </div>
        </>
      ))}

      {/* VOICE CONFIGURATION */}
      {renderSection('voice', 'Voices', `${musicSettings.melodicSynthType}`, (
        <>
          <div className="control-row">
            <label>Melody</label>
            <select
              value={musicSettings.melodicSynthType}
              onChange={(e) => update({ melodicSynthType: e.target.value as SynthType })}
            >
              {SYNTH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Bass</label>
            <select
              value={musicSettings.bassSynthType}
              onChange={(e) => update({ bassSynthType: e.target.value as SynthType })}
            >
              {SYNTH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Chord</label>
            <select
              value={musicSettings.chordSynthType}
              onChange={(e) => update({ chordSynthType: e.target.value as SynthType })}
            >
              {SYNTH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Scale</label>
            <select
              value={musicSettings.scale}
              onChange={(e) => update({ scale: e.target.value as MusicScaleType })}
            >
              {SCALE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Root</label>
            <select
              value={musicSettings.rootNote}
              onChange={(e) => update({ rootNote: e.target.value })}
            >
              {NOTE_NAMES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Chords</label>
            <select
              value={musicSettings.chordProgression}
              onChange={(e) => update({ chordProgression: e.target.value })}
            >
              {progressionIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        </>
      ))}

      {/* ENVELOPE */}
      {renderSection('envelope', 'Envelope', undefined, (
        <>
          <div className="control-row">
            <label>Attack</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.attackTime}
              onChange={(e) => update({ attackTime: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 35, textAlign: 'right' }}>
              {(0.001 + musicSettings.attackTime * 0.499).toFixed(2)}s
            </span>
          </div>
          <div className="control-row">
            <label>Release</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.releaseTime}
              onChange={(e) => update({ releaseTime: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 35, textAlign: 'right' }}>
              {(0.1 + musicSettings.releaseTime * 1.9).toFixed(1)}s
            </span>
          </div>
        </>
      ))}

      {/* EXPRESSION */}
      {renderSection('expression', 'Expression', musicSettings.vibratoDepth > 0 ? 'Vibrato' : undefined, (
        <>
          <div className="control-row">
            <label>Vibrato</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.vibratoDepth}
              onChange={(e) => update({ vibratoDepth: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.vibratoDepth * 100).toFixed(0)}%
            </span>
          </div>
          <div className="control-row">
            <label>Vib Rate</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.vibratoRate}
              onChange={(e) => update({ vibratoRate: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 30, textAlign: 'right' }}>
              {(1 + musicSettings.vibratoRate * 9).toFixed(1)}Hz
            </span>
          </div>
          <div className="control-row">
            <label>Glide</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.portamento}
              onChange={(e) => update({ portamento: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 30, textAlign: 'right' }}>
              {(musicSettings.portamento * 500).toFixed(0)}ms
            </span>
          </div>
        </>
      ))}

      {/* DYNAMICS & FEEL */}
      {renderSection('dynamics', 'Dynamics', undefined, (
        <>
          <div className="control-row">
            <label>Min Vel</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.dynamicsRange[0]}
              onChange={(e) =>
                update({
                  dynamicsRange: [
                    parseFloat(e.target.value),
                    Math.max(parseFloat(e.target.value), musicSettings.dynamicsRange[1]),
                  ],
                })
              }
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.dynamicsRange[0] * 100).toFixed(0)}%
            </span>
          </div>
          <div className="control-row">
            <label>Max Vel</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.dynamicsRange[1]}
              onChange={(e) =>
                update({
                  dynamicsRange: [
                    Math.min(musicSettings.dynamicsRange[0], parseFloat(e.target.value)),
                    parseFloat(e.target.value),
                  ],
                })
              }
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.dynamicsRange[1] * 100).toFixed(0)}%
            </span>
          </div>
          <div className="control-row">
            <label>Swing</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.swingAmount}
              onChange={(e) => update({ swingAmount: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.swingAmount * 100).toFixed(0)}%
            </span>
          </div>
        </>
      ))}

      {/* HARMONY & FILTER */}
      {renderSection('harmony', 'Harmony & Filter', musicSettings.filterType, (
        <>
          <div className="control-row">
            <label>Richness</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.harmonicRichness}
              onChange={(e) => update({ harmonicRichness: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.harmonicRichness * 100).toFixed(0)}%
            </span>
          </div>
          <div className="control-row">
            <label>Filter</label>
            <select
              value={musicSettings.filterType}
              onChange={(e) => update({ filterType: e.target.value as FilterType })}
            >
              {FILTER_TYPES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="control-row">
            <label>Cutoff</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.filterFrequency}
              onChange={(e) => update({ filterFrequency: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 35, textAlign: 'right' }}>
              {Math.round(200 * Math.pow(8000 / 200, musicSettings.filterFrequency))}Hz
            </span>
          </div>
        </>
      ))}

      {/* EFFECTS */}
      {renderSection('effects', 'Effects', undefined, (
        <>
          <div className="control-row">
            <label>Reverb</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.reverbAmount}
              onChange={(e) => update({ reverbAmount: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.reverbAmount * 100).toFixed(0)}%
            </span>
          </div>
          <div className="control-row">
            <label>Delay</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={musicSettings.delayAmount}
              onChange={(e) => update({ delayAmount: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {(musicSettings.delayAmount * 100).toFixed(0)}%
            </span>
          </div>
        </>
      ))}

      {/* SENSITIVITY */}
      {renderSection('sensitivity', 'Sensitivity', undefined, (
        <>
          <div className="control-row">
            <label>Move Thr</label>
            <input
              type="range"
              min="0.01"
              max="0.1"
              step="0.005"
              value={musicSettings.movementThreshold}
              onChange={(e) => update({ movementThreshold: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 30, textAlign: 'right' }}>
              {musicSettings.movementThreshold.toFixed(3)}
            </span>
          </div>
          <div className="control-row">
            <label>Confidence</label>
            <input
              type="range"
              min="0.1"
              max="0.6"
              step="0.05"
              value={musicSettings.confidenceThreshold}
              onChange={(e) => update({ confidenceThreshold: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 25, textAlign: 'right' }}>
              {musicSettings.confidenceThreshold.toFixed(2)}
            </span>
          </div>
          <div className="control-row">
            <label>Note Int.</label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={musicSettings.noteInterval}
              onChange={(e) => update({ noteInterval: parseInt(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 35, textAlign: 'right' }}>
              {musicSettings.noteInterval}ms
            </span>
          </div>
          <div className="control-row">
            <label>Tempo</label>
            <input
              type="range"
              min="30"
              max="200"
              step="1"
              value={musicSettings.tempoRange[0]}
              onChange={(e) =>
                update({
                  tempoRange: [
                    parseInt(e.target.value),
                    Math.max(parseInt(e.target.value), musicSettings.tempoRange[1]),
                  ],
                })
              }
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', minWidth: 55, textAlign: 'right' }}>
              {musicSettings.tempoRange[0]}-{musicSettings.tempoRange[1]}
            </span>
          </div>
        </>
      ))}

      {/* VISUAL FEEDBACK */}
      {renderSection('visual', 'Visual', undefined, (
        <>
          <div className="control-row">
            <label style={{ flex: 1 }}>Active indicators</label>
            <input
              type="checkbox"
              checked={musicSettings.showActiveIndicators}
              onChange={(e) => update({ showActiveIndicators: e.target.checked })}
            />
          </div>
          <div className="control-row">
            <label style={{ flex: 1 }}>Movement intensity</label>
            <input
              type="checkbox"
              checked={musicSettings.showMovementIntensity}
              onChange={(e) => update({ showMovementIntensity: e.target.checked })}
            />
          </div>
          <div className="control-row">
            <label style={{ flex: 1 }}>Current chord</label>
            <input
              type="checkbox"
              checked={musicSettings.showCurrentChord}
              onChange={(e) => update({ showCurrentChord: e.target.checked })}
            />
          </div>
        </>
      ))}

      {/* BODY PART ROLES */}
      {renderSection('bodyParts', 'Body Part Roles', bodyPartSummary, (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-xs)' }}>
            Assign a musical role to each body part
          </div>
          {BODY_PARTS.map((bp) => {
            const config = getBodyPartConfig(bp.id);
            const isExpanded = expandedBodyPart === bp.id;
            return (
              <div
                key={bp.id}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {/* Row: name + role badge/select */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    padding: '6px 0',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedBodyPart(isExpanded ? null : bp.id)}
                >
                  <span style={{ flex: 1, fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
                    {bp.label}
                  </span>
                  <select
                    value={config.role}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleRoleChange(bp.id, e.target.value as BodyPartMusicalRole);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: ROLE_COLORS[config.role],
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--border-radius)',
                      padding: '3px 8px',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <span style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}>
                    {'\u25B6'}
                  </span>
                </div>

                {/* Expanded detail: octave range + sensitivity */}
                {isExpanded && config.role !== 'disabled' && (
                  <div style={{
                    padding: '4px 0 8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-xs)',
                  }}>
                    <div className="control-row">
                      <label style={{ minWidth: 60, fontSize: 'var(--font-size-xs)' }}>Octave</label>
                      <select
                        value={config.octaveRange[0]}
                        onChange={(e) => {
                          const low = parseInt(e.target.value);
                          updateBodyPartConfig(bp.id, {
                            octaveRange: [low, Math.max(low, config.octaveRange[1])],
                          });
                        }}
                        style={{ width: 48 }}
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>to</span>
                      <select
                        value={config.octaveRange[1]}
                        onChange={(e) => {
                          const high = parseInt(e.target.value);
                          updateBodyPartConfig(bp.id, {
                            octaveRange: [Math.min(config.octaveRange[0], high), high],
                          });
                        }}
                        style={{ width: 48 }}
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div className="control-row">
                      <label style={{ minWidth: 60, fontSize: 'var(--font-size-xs)' }}>Sensitivity</label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={config.sensitivity}
                        onChange={(e) =>
                          updateBodyPartConfig(bp.id, { sensitivity: parseFloat(e.target.value) })
                        }
                        style={{ flex: 1 }}
                      />
                      <span style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-muted)',
                        minWidth: 30,
                        textAlign: 'right',
                      }}>
                        {config.sensitivity.toFixed(1)}x
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default MusicSettingsPanel;
