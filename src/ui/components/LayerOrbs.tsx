/**
 * Layer Orbs - Creative floating orb visualization for sound layers
 *
 * Each layer is represented as a glowing orb with color based on pitch.
 * Orbs pulse and float based on their gain/activity level.
 */

import { useMemo } from 'react';
import type { SoundLayer } from '../../performance/LayerAccumulator';
import { frequencyToMidi } from '../../utils/math';

interface LayerOrbsProps {
  layers: SoundLayer[];
  width?: number;
  height?: number;
}

function pitchToColor(midiNote: number): string {
  const hue = ((midiNote % 12) / 12) * 360;
  return `hsl(${hue}, 75%, 55%)`;
}

function LayerOrbs({ layers, width = 300, height = 300 }: LayerOrbsProps) {
  // Calculate orb positions in a pleasing arrangement
  const orbs = useMemo(() => {
    return layers.map((layer, index) => {
      const midiNote = frequencyToMidi(layer.frequency);
      const color = pitchToColor(midiNote);

      // Distribute orbs in a spiral/circular pattern
      const angle = (index / Math.max(layers.length, 1)) * Math.PI * 2;
      const radius = 0.25 + (index % 3) * 0.1;
      const x = 0.5 + Math.cos(angle) * radius;
      const y = 0.5 + Math.sin(angle) * radius;

      // Size based on gain
      const size = 30 + layer.currentGain * 50;

      return {
        id: layer.id,
        x,
        y,
        size,
        color,
        gain: layer.currentGain,
        isFading: layer.isFading,
        animationDelay: index * 0.2,
      };
    });
  }, [layers]);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        background: 'radial-gradient(circle at center, #1a1a2e 0%, #0a0a12 100%)',
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow in center when layers exist */}
      {layers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60%',
            height: '60%',
            background: 'radial-gradient(circle, rgba(100, 150, 255, 0.1) 0%, transparent 70%)',
            animation: 'ambientPulse 4s ease-in-out infinite',
          }}
        />
      )}

      {/* Floating orbs */}
      {orbs.map((orb) => (
        <div
          key={orb.id}
          style={{
            position: 'absolute',
            left: `${orb.x * 100}%`,
            top: `${orb.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: orb.size,
            height: orb.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${orb.color}, ${orb.color}88 50%, ${orb.color}22 100%)`,
            boxShadow: `0 0 ${orb.size * 0.5}px ${orb.color}66, inset 0 0 ${orb.size * 0.3}px ${orb.color}44`,
            opacity: orb.isFading ? 0.4 : 0.9,
            transition: 'width 0.3s ease, height 0.3s ease, opacity 0.5s ease',
            animation: `orbFloat 3s ease-in-out infinite ${orb.animationDelay}s, orbPulse 2s ease-in-out infinite ${orb.animationDelay}s`,
          }}
        >
          {/* Inner highlight */}
          <div
            style={{
              position: 'absolute',
              top: '15%',
              left: '20%',
              width: '30%',
              height: '30%',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.4)',
              filter: 'blur(2px)',
            }}
          />
        </div>
      ))}

      {/* Empty state */}
      {layers.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.3)',
            fontSize: '14px',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              margin: '0 auto 12px',
              borderRadius: '50%',
              border: '2px dashed rgba(255, 255, 255, 0.2)',
              animation: 'emptyPulse 3s ease-in-out infinite',
            }}
          />
          Awaiting sound
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes orbFloat {
          0%, 100% { transform: translate(-50%, -50%) translateY(0); }
          50% { transform: translate(-50%, -50%) translateY(-8px); }
        }
        @keyframes orbPulse {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.2); }
        }
        @keyframes ambientPulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes emptyPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

export default LayerOrbs;
