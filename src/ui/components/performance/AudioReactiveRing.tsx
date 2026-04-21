/**
 * AudioReactiveRing - Visual ring around the video area that reacts to audio output.
 *
 * Ring thickness and color intensity scale with volume.
 * When muted: thin grey line.
 * Critical for deaf/HoH musicians as the primary visual confirmation
 * that sound is being produced.
 */

import { useEffect, useRef, useState } from 'react';
import { useIsMuted, useMasterVolume } from '../../../state/store';

interface AudioReactiveRingProps {
  isActive: boolean;
}

export default function AudioReactiveRing({ isActive }: AudioReactiveRingProps) {
  const isMuted = useIsMuted();
  const masterVolume = useMasterVolume();
  const [intensity, setIntensity] = useState(0);
  const rafRef = useRef<number>(0);

  // Smooth the intensity changes
  useEffect(() => {
    const targetIntensity = isMuted ? 0 : isActive ? masterVolume : 0;

    const animate = () => {
      setIntensity(prev => {
        const diff = targetIntensity - prev;
        if (Math.abs(diff) < 0.01) return targetIntensity;
        return prev + diff * 0.15; // Smooth interpolation
      });
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isMuted, isActive, masterVolume]);

  const borderWidth = Math.max(1, intensity * 4);
  const glowSize = intensity * 12;
  const baseColor = isMuted ? 'var(--color-text-tertiary)' : 'var(--color-primary)';

  return (
    <div
      className="audio-reactive-ring"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        border: `${borderWidth}px solid`,
        borderColor: baseColor,
        boxShadow: intensity > 0.05
          ? `inset 0 0 ${glowSize}px rgba(249, 115, 22, ${intensity * 0.3}), 0 0 ${glowSize}px rgba(249, 115, 22, ${intensity * 0.2})`
          : 'none',
        transition: isMuted
          ? 'all var(--duration-slow) var(--ease-default)'
          : 'border-color var(--duration-fast) var(--ease-default)',
        zIndex: 1,
      }}
    />
  );
}
