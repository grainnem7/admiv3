/**
 * AccompanimentPanel - Collaborative Accompaniment Mode Controls
 *
 * Provides accessible UI for:
 * - Performance mode selection (Free / Constrained / Accompaniment)
 * - Key and scale selection
 * - Accompaniment pattern, tension, density, and volume controls
 * - Current harmony context display
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import type { PerformanceMode, AccompanimentPattern } from '../../accompaniment/types';
import { NOTE_NAMES } from '../../sound/MusicTheory';
import type { MusicScaleType } from '../../state/types';
import { PROGRESSIONS } from '../../sound/ChordProgressions';
import { getMusicController } from '../../core/MusicController';

// ============================================
// Constants
// ============================================

const MODE_OPTIONS: { value: PerformanceMode; label: string; description: string }[] = [
  { value: 'free', label: 'Free', description: 'No harmonic constraints' },
  { value: 'constrained', label: 'Guided', description: 'Notes snap to selected scale' },
  { value: 'accompaniment', label: 'Accompany', description: 'Backing harmonies assist you' },
];

const SCALE_OPTIONS: { value: MusicScaleType; label: string; plainLabel: string }[] = [
  { value: 'major', label: 'Major', plainLabel: 'Bright / Happy' },
  { value: 'minor', label: 'Minor', plainLabel: 'Sad / Moody' },
  { value: 'pentatonic', label: 'Pentatonic', plainLabel: 'Simple / Safe' },
  { value: 'pentatonicMinor', label: 'Pent. Minor', plainLabel: 'Bluesy / Soulful' },
  { value: 'blues', label: 'Blues', plainLabel: 'Blues feel' },
  { value: 'dorian', label: 'Dorian', plainLabel: 'Jazz / Funky' },
  { value: 'mixolydian', label: 'Mixolydian', plainLabel: 'Rock / Bluesy' },
  { value: 'wholeTone', label: 'Whole Tone', plainLabel: 'Dreamy / Floating' },
];

const PATTERN_OPTIONS: { value: AccompanimentPattern; label: string; description: string }[] = [
  { value: 'pad', label: 'Pad', description: 'Sustained chord' },
  { value: 'drone', label: 'Drone', description: 'Root note hum' },
  { value: 'arpeggio', label: 'Arpeggio', description: 'Flowing notes' },
  { value: 'bassline', label: 'Bass', description: 'Walking bass' },
];

type SectionId = 'mode' | 'key' | 'accompaniment';

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-3)',
  },
  section: {
    borderBottom: '1px solid var(--color-border)',
    paddingBottom: 'var(--space-3)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: 'var(--space-2) 0',
    userSelect: 'none' as const,
  },
  sectionTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
  },
  sectionStatus: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
  },
  modeGroup: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  modeButton: (isActive: boolean) => ({
    flex: 1,
    padding: 'var(--space-2) var(--space-1)',
    border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)',
    background: isActive ? 'var(--color-primary)' : 'transparent',
    color: isActive ? '#fff' : 'var(--color-text-secondary)',
    fontSize: 'var(--text-xs)',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s ease',
  }),
  modeDescription: {
    fontSize: '10px',
    opacity: 0.7,
    marginTop: '2px',
  },
  label: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-1)',
    display: 'block',
  },
  select: {
    width: '100%',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },
  row: {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'flex-end',
  },
  fieldHalf: {
    flex: 1,
  },
  slider: {
    width: '100%',
    cursor: 'pointer',
    accentColor: 'var(--color-primary)',
  },
  sliderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  sliderLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    minWidth: '60px',
  },
  sliderValue: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
    minWidth: '30px',
    textAlign: 'right' as const,
  },
  patternGroup: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-1)',
  },
  patternButton: (isActive: boolean) => ({
    padding: 'var(--space-2)',
    border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-sm)',
    background: isActive ? 'rgba(66, 133, 244, 0.15)' : 'transparent',
    color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.15s ease',
  }),
  patternDescription: {
    fontSize: '10px',
    opacity: 0.6,
    marginTop: '1px',
  },
  contextDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-secondary)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
  },
  contextChord: {
    fontWeight: 700,
    fontSize: 'var(--text-sm)',
    color: 'var(--color-primary)',
  },
  enableToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-secondary)',
    cursor: 'pointer',
  },
  toggleSwitch: (isOn: boolean) => ({
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    background: isOn ? 'var(--color-primary)' : 'var(--color-border)',
    position: 'relative' as const,
    transition: 'background 0.15s ease',
    cursor: 'pointer',
    border: 'none',
    padding: 0,
  }),
  toggleKnob: (isOn: boolean) => ({
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: '2px',
    left: isOn ? '18px' : '2px',
    transition: 'left 0.15s ease',
  }),
};

// ============================================
// Component
// ============================================

const AccompanimentPanel: React.FC = () => {
  const performanceMode = useAppStore((s) => s.performanceMode);
  const setPerformanceMode = useAppStore((s) => s.setPerformanceMode);
  const accompanimentSettings = useAppStore((s) => s.accompanimentSettings);
  const setAccompanimentSettings = useAppStore((s) => s.setAccompanimentSettings);
  const musicSettings = useAppStore((s) => s.musicSettings);
  const setMusicSettings = useAppStore((s) => s.setMusicSettings);
  const currentHarmonyContext = useAppStore((s) => s.currentHarmonyContext);

  const [expandedSection, setExpandedSection] = useState<SectionId | null>('mode');

  // Sync accompaniment settings to engine when they change
  useEffect(() => {
    try {
      const controller = getMusicController();
      controller.syncAccompanimentSettings();
    } catch {
      // Controller may not be initialized yet
    }
  }, [accompanimentSettings]);

  // Sync performance mode to controller when it changes
  useEffect(() => {
    try {
      const controller = getMusicController();
      controller.setPerformanceMode(performanceMode);
    } catch {
      // Controller may not be initialized yet
    }
  }, [performanceMode]);

  // Sync key/scale changes to HarmonyManager via controller
  useEffect(() => {
    try {
      const controller = getMusicController();
      controller.setScale(
        musicSettings.rootNote as Parameters<typeof controller.setScale>[0],
        musicSettings.scale as Parameters<typeof controller.setScale>[1]
      );
    } catch {
      // Controller may not be initialized yet
    }
  }, [musicSettings.rootNote, musicSettings.scale]);

  // Sync progression changes
  useEffect(() => {
    try {
      const controller = getMusicController();
      controller.setProgression(musicSettings.chordProgression);
    } catch {
      // Controller may not be initialized yet
    }
  }, [musicSettings.chordProgression]);

  const toggleSection = useCallback((section: SectionId) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  const handleModeChange = useCallback(
    (mode: PerformanceMode) => {
      setPerformanceMode(mode);
      // Enable accompaniment engine when switching to accompaniment mode
      if (mode === 'accompaniment') {
        setAccompanimentSettings({ enabled: true });
      } else {
        setAccompanimentSettings({ enabled: false });
      }
      // Haptic feedback for mode change
      if (navigator.vibrate) {
        navigator.vibrate([50]);
      }
    },
    [setPerformanceMode, setAccompanimentSettings]
  );

  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setMusicSettings({ rootNote: e.target.value });
      if (navigator.vibrate) navigator.vibrate([30, 50]);
    },
    [setMusicSettings]
  );

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setMusicSettings({ scale: e.target.value as MusicScaleType });
      if (navigator.vibrate) navigator.vibrate([30, 50]);
    },
    [setMusicSettings]
  );

  const handleProgressionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setMusicSettings({ chordProgression: e.target.value });
    },
    [setMusicSettings]
  );

  const handlePatternChange = useCallback(
    (pattern: AccompanimentPattern) => {
      setAccompanimentSettings({ pattern });
    },
    [setAccompanimentSettings]
  );

  const showKeyControls = performanceMode !== 'free';
  const showAccompanimentControls = performanceMode === 'accompaniment';

  // ============================================
  // Section Renderer
  // ============================================

  const renderSection = (
    id: SectionId,
    title: string,
    statusText: string,
    content: React.ReactNode
  ) => {
    const isExpanded = expandedSection === id;
    return (
      <div style={styles.section} key={id}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection(id)}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-label={`${title} section`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleSection(id);
            }
          }}
        >
          <span style={styles.sectionTitle}>
            {isExpanded ? '▾' : '▸'} {title}
          </span>
          <span style={styles.sectionStatus}>{statusText}</span>
        </div>
        {isExpanded && <div style={{ paddingTop: 'var(--space-1)' }}>{content}</div>}
      </div>
    );
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div style={styles.container}>
      {/* Mode Selection */}
      {renderSection(
        'mode',
        'Performance Mode',
        MODE_OPTIONS.find((m) => m.value === performanceMode)?.label ?? '',
        <div>
          <div style={styles.modeGroup} role="radiogroup" aria-label="Performance mode">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                style={styles.modeButton(performanceMode === option.value)}
                onClick={() => handleModeChange(option.value)}
                role="radio"
                aria-checked={performanceMode === option.value}
                aria-label={`${option.label}: ${option.description}`}
              >
                <div>{option.label}</div>
                <div style={styles.modeDescription}>{option.description}</div>
              </button>
            ))}
          </div>

          {/* Context display */}
          {currentHarmonyContext && showKeyControls && (
            <div style={{ ...styles.contextDisplay, marginTop: 'var(--space-2)' }}>
              <span>Key:</span>
              <span style={styles.contextChord}>
                {currentHarmonyContext.rootNote} {musicSettings.scale}
              </span>
              {currentHarmonyContext.currentChord && (
                <>
                  <span style={{ margin: '0 var(--space-1)', opacity: 0.3 }}>|</span>
                  <span>Chord:</span>
                  <span style={styles.contextChord}>
                    {currentHarmonyContext.currentChord.name}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Key / Scale Selection - only shown in constrained or accompaniment mode */}
      {showKeyControls &&
        renderSection(
          'key',
          'Key & Scale',
          `${musicSettings.rootNote} ${SCALE_OPTIONS.find((s) => s.value === musicSettings.scale)?.label ?? ''}`,
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={styles.row}>
              <div style={styles.fieldHalf}>
                <label style={styles.label} htmlFor="accomp-key">
                  Key
                </label>
                <select
                  id="accomp-key"
                  style={styles.select}
                  value={musicSettings.rootNote}
                  onChange={handleKeyChange}
                  aria-label="Select key"
                >
                  {NOTE_NAMES.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.fieldHalf}>
                <label style={styles.label} htmlFor="accomp-scale">
                  Scale
                </label>
                <select
                  id="accomp-scale"
                  style={styles.select}
                  value={musicSettings.scale}
                  onChange={handleScaleChange}
                  aria-label="Select scale"
                >
                  {SCALE_OPTIONS.map((scale) => (
                    <option key={scale.value} value={scale.value}>
                      {scale.label} — {scale.plainLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chord progression selector - only in accompaniment mode */}
            {showAccompanimentControls && (
              <div>
                <label style={styles.label} htmlFor="accomp-progression">
                  Chord Progression
                </label>
                <select
                  id="accomp-progression"
                  style={styles.select}
                  value={musicSettings.chordProgression}
                  onChange={handleProgressionChange}
                  aria-label="Select chord progression"
                >
                  {Object.entries(PROGRESSIONS).map(([id, prog]) => (
                    <option key={id} value={id}>
                      {prog.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

      {/* Accompaniment Controls - only in accompaniment mode */}
      {showAccompanimentControls &&
        renderSection(
          'accompaniment',
          'Accompaniment',
          accompanimentSettings.enabled
            ? `${PATTERN_OPTIONS.find((p) => p.value === accompanimentSettings.pattern)?.label ?? ''}`
            : 'Off',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Enable toggle */}
            <div
              style={styles.enableToggle}
              onClick={() =>
                setAccompanimentSettings({ enabled: !accompanimentSettings.enabled })
              }
              role="switch"
              aria-checked={accompanimentSettings.enabled}
              aria-label="Enable accompaniment"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAccompanimentSettings({ enabled: !accompanimentSettings.enabled });
                }
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Accompaniment {accompanimentSettings.enabled ? 'On' : 'Off'}
              </span>
              <button
                style={styles.toggleSwitch(accompanimentSettings.enabled)}
                tabIndex={-1}
                aria-hidden="true"
              >
                <div style={styles.toggleKnob(accompanimentSettings.enabled)} />
              </button>
            </div>

            {accompanimentSettings.enabled && (
              <>
                {/* Pattern selector */}
                <div>
                  <span style={styles.label}>Pattern</span>
                  <div style={styles.patternGroup} role="radiogroup" aria-label="Accompaniment pattern">
                    {PATTERN_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        style={styles.patternButton(
                          accompanimentSettings.pattern === option.value
                        )}
                        onClick={() => handlePatternChange(option.value)}
                        role="radio"
                        aria-checked={accompanimentSettings.pattern === option.value}
                        aria-label={`${option.label}: ${option.description}`}
                      >
                        <div>{option.label}</div>
                        <div style={styles.patternDescription}>{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brightness (tension) slider */}
                <div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Brightness</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(accompanimentSettings.tension * 100)}
                      onChange={(e) =>
                        setAccompanimentSettings({ tension: Number(e.target.value) / 100 })
                      }
                      style={styles.slider}
                      aria-label="Brightness (harmonic tension)"
                    />
                    <span style={styles.sliderValue}>
                      {Math.round(accompanimentSettings.tension * 100)}%
                    </span>
                  </div>
                </div>

                {/* Fullness (density) slider */}
                <div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Fullness</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(accompanimentSettings.density * 100)}
                      onChange={(e) =>
                        setAccompanimentSettings({ density: Number(e.target.value) / 100 })
                      }
                      style={styles.slider}
                      aria-label="Fullness (accompaniment density)"
                    />
                    <span style={styles.sliderValue}>
                      {Math.round(accompanimentSettings.density * 100)}%
                    </span>
                  </div>
                </div>

                {/* Volume slider */}
                <div>
                  <div style={styles.sliderRow}>
                    <span style={styles.sliderLabel}>Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(accompanimentSettings.volume * 100)}
                      onChange={(e) =>
                        setAccompanimentSettings({ volume: Number(e.target.value) / 100 })
                      }
                      style={styles.slider}
                      aria-label="Accompaniment volume"
                    />
                    <span style={styles.sliderValue}>
                      {Math.round(accompanimentSettings.volume * 100)}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
    </div>
  );
};

export default AccompanimentPanel;
