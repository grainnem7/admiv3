/**
 * ModeSelector — Redesigned
 *
 * Segmented control for switching performance views.
 */

import { useAppStore, usePerformanceViewMode } from '../../../state/store';
import type { PerformanceView } from '../../../state/types';

const MODES: { id: PerformanceView; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'betweenUs', label: 'Between Us' },
  { id: 'harmonicBlending', label: 'Harmonic Blend' },
  { id: 'songPreset', label: 'Song Preset' },
  { id: 'remix', label: 'Remix' },
  { id: 'surfaceKeyboard', label: 'Surface Keys' },
  { id: 'minimal', label: 'Minimal' },
];

/** Modes that use their own dedicated screen */
const SCREEN_MODES: Partial<Record<PerformanceView, 'betweenUs' | 'harmonicBlending' | 'songPreset' | 'remix' | 'surfaceKeyboard'>> = {
  betweenUs: 'betweenUs',
  harmonicBlending: 'harmonicBlending',
  songPreset: 'songPreset',
  remix: 'remix',
  surfaceKeyboard: 'surfaceKeyboard',
};

export default function ModeSelector() {
  const currentView = usePerformanceViewMode();
  const setPerformanceView = useAppStore((s) => s.setPerformanceView);
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  const handleModeChange = (id: PerformanceView) => {
    setPerformanceView(id);
    const screen = SCREEN_MODES[id];
    if (screen) {
      setCurrentScreen(screen);
    }
  };

  return (
    <div style={{
      display: 'flex', padding: 2, borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }} role="radiogroup" aria-label="Performance mode">
      {MODES.map((mode) => {
        const active = currentView === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => handleModeChange(mode.id)}
            role="radio" aria-checked={active}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 600 : 500,
              background: active ? 'rgba(249,115,22,0.15)' : 'transparent',
              color: active ? '#f97316' : '#71718a',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#a1a1b8'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#71718a'; }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
