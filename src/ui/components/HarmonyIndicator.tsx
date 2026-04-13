/**
 * HarmonyIndicator - Visual overlay showing current harmonic context
 *
 * Small overlay on the video view showing:
 * - Current chord name and scale
 * - Performance mode indicator
 * - Color-coded by mood
 * - Pulses on chord changes (visual feedback for deaf/HoH users)
 */

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import type { PerformanceMode } from '../../accompaniment/types';
import type { Mood } from '../../sound/ChordProgressions';

// ============================================
// Mood Colors
// ============================================

const MOOD_COLORS: Record<Mood, string> = {
  contemplative: '#6366f1',
  deeper: '#8b5cf6',
  brightening: '#f59e0b',
  bright: '#eab308',
  returning: '#06b6d4',
  peaceful: '#10b981',
  hopeful: '#22c55e',
  resolved: '#14b8a6',
  mysterious: '#a855f7',
  floating: '#67e8f9',
  ethereal: '#c4b5fd',
};

const MODE_LABELS: Record<PerformanceMode, { label: string; color: string }> = {
  free: { label: 'FREE', color: '#6b7280' },
  constrained: { label: 'GUIDED', color: '#3b82f6' },
  accompaniment: { label: 'ACCOMP', color: '#10b981' },
};

// ============================================
// Component
// ============================================

const HarmonyIndicator: React.FC = () => {
  const performanceMode = useAppStore((s) => s.performanceMode);
  const currentHarmonyContext = useAppStore((s) => s.currentHarmonyContext);
  const accompanimentSettings = useAppStore((s) => s.accompanimentSettings);
  const musicSettings = useAppStore((s) => s.musicSettings);

  const [isPulsing, setIsPulsing] = useState(false);

  // Pulse on chord change
  useEffect(() => {
    if (currentHarmonyContext?.currentChord) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 400);
      return () => clearTimeout(timer);
    }
  }, [currentHarmonyContext?.currentChordIndex]);

  // Don't show in free mode
  if (performanceMode === 'free') return null;

  const chord = currentHarmonyContext?.currentChord;
  const moodColor = chord?.mood ? MOOD_COLORS[chord.mood] : '#6b7280';
  const modeInfo = MODE_LABELS[performanceMode];

  return (
    <div
      style={{
        position: 'absolute',
        top: 'var(--space-3)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isPulsing ? moodColor : 'rgba(255, 255, 255, 0.1)'}`,
        transition: 'border-color 0.3s ease',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      role="status"
      aria-label={`Current key: ${musicSettings.rootNote} ${musicSettings.scale}${chord ? `, chord: ${chord.name}` : ''}`}
      aria-live="polite"
    >
      {/* Mode badge */}
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          color: modeInfo.color,
          letterSpacing: '0.05em',
          padding: '1px 6px',
          borderRadius: '3px',
          background: `${modeInfo.color}20`,
        }}
      >
        {modeInfo.label}
      </span>

      {/* Key display */}
      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: '#fff',
        }}
      >
        {musicSettings.rootNote} {musicSettings.scale}
      </span>

      {/* Chord display */}
      {chord && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>|</span>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: moodColor,
              transition: 'color 0.3s ease',
              transform: isPulsing ? 'scale(1.1)' : 'scale(1)',
              display: 'inline-block',
            }}
          >
            {chord.name}
          </span>
        </>
      )}

      {/* Accompaniment status */}
      {performanceMode === 'accompaniment' && accompanimentSettings.enabled && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>|</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              display: 'inline-block',
              animation: 'pulse 2s infinite',
            }}
          />
        </>
      )}
    </div>
  );
};

export default HarmonyIndicator;
