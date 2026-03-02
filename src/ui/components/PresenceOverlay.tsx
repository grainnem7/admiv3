/**
 * Presence Overlay - Dynamic visual feedback overlaid on webcam
 *
 * Creates an immersive visual experience that responds to:
 * - Body position and movement
 * - Left hand (sustain control)
 * - Right hand (dynamics/articulation)
 * - Activity level and velocity
 */

import { useMemo } from 'react';
import type { PresenceState } from '../../performance';
import type { SoundLayer } from '../../performance/LayerAccumulator';
import { frequencyToMidi } from '../../utils/math';

interface PresenceOverlayProps {
  presenceState: PresenceState | null;
  layers: SoundLayer[];
}

// Map pitch to color (chromatic wheel)
function pitchToColor(midiNote: number, saturation = 80, lightness = 60): string {
  const hue = ((midiNote % 12) / 12) * 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function PresenceOverlay({ presenceState, layers }: PresenceOverlayProps) {
  const isPresent = presenceState?.isPresent ?? false;
  const activity = presenceState?.activityLevel ?? 0;
  const velocity = presenceState?.velocity ?? { x: 0, y: 0, magnitude: 0 };
  const midiNote = presenceState?.musicalParams.midiNote ?? 60;
  const musicalVelocity = presenceState?.musicalParams.velocity ?? 0;
  const color = pitchToColor(midiNote);

  // Hand states
  const leftHand = presenceState?.leftHand ?? { x: 0.5, y: 0.5, visible: false, raised: false };
  const rightHand = presenceState?.rightHand ?? { x: 0.5, y: 0.5, visible: false, raised: false };
  const isSustaining = leftHand.visible && leftHand.raised;

  // Calculate intensity from right hand height (lower = more intense)
  const rightHandIntensity = rightHand.visible ? 1 - rightHand.y : 0.5;

  // Dynamic values based on movement
  const pulseSpeed = 1 + activity * 2; // Faster pulse with more movement
  const glowIntensity = 0.3 + activity * 0.5 + rightHandIntensity * 0.2;

  // Memoize layer visuals
  const layerVisuals = useMemo(() => {
    return layers.slice(0, 12).map((layer, index) => ({
      color: pitchToColor(frequencyToMidi(layer.frequency)),
      gain: layer.currentGain,
      isFading: layer.isFading,
      angle: (index / Math.max(layers.length, 1)) * 360,
    }));
  }, [layers]);

  // Calculate wave distortion from velocity
  const waveOffset = velocity.x * 20;
  const waveAmplitude = 10 + activity * 30;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      {/* Dynamic edge glow - responds to activity */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(to right, ${color}${Math.round(glowIntensity * 40).toString(16).padStart(2, '0')} 0%, transparent 15%),
            linear-gradient(to left, ${color}${Math.round(glowIntensity * 40).toString(16).padStart(2, '0')} 0%, transparent 15%),
            linear-gradient(to bottom, ${color}${Math.round(glowIntensity * 30).toString(16).padStart(2, '0')} 0%, transparent 10%),
            linear-gradient(to top, ${color}${Math.round(glowIntensity * 30).toString(16).padStart(2, '0')} 0%, transparent 10%)
          `,
          opacity: isPresent ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />

      {/* Breathing border that pulses with activity */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `${2 + activity * 6}px solid ${color}`,
          borderRadius: 0,
          opacity: isPresent ? 0.3 + activity * 0.4 : 0,
          transition: 'opacity 0.3s ease, border-width 0.15s ease',
          animation: isPresent ? `breathe ${2 / pulseSpeed}s ease-in-out infinite` : 'none',
        }}
      />

      {/* Velocity trails - horizontal lines that respond to movement */}
      {isPresent && activity > 0.1 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
          }}
        >
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${20 + i * 15}%`,
                height: 2,
                background: `linear-gradient(90deg,
                  transparent 0%,
                  ${color}${Math.round((0.3 + activity * 0.4) * 255).toString(16).padStart(2, '0')} ${50 + waveOffset}%,
                  transparent 100%
                )`,
                transform: `translateX(${Math.sin(Date.now() / 500 + i) * waveAmplitude}px) scaleX(${0.5 + activity})`,
                transition: 'transform 0.1s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* Particle field - floating dots that respond to presence */}
      {isPresent && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {[...Array(8)].map((_, i) => {
            const baseX = 10 + (i % 4) * 25;
            const baseY = 15 + Math.floor(i / 4) * 70;
            const size = 4 + activity * 8 + (rightHandIntensity * 6);

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${baseX}%`,
                  top: `${baseY}%`,
                  width: size,
                  height: size,
                  borderRadius: 0,
                  backgroundColor: color,
                  opacity: 0.4 + activity * 0.4,
                  boxShadow: `0 0 ${size * 2}px ${color}`,
                  animation: `float ${3 + i * 0.5}s ease-in-out infinite ${i * 0.3}s`,
                  transform: `translate(${velocity.x * 30}px, ${velocity.y * 30}px)`,
                  transition: 'transform 0.15s ease, width 0.2s ease, height 0.2s ease',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Central energy field - grows with sustain and intensity */}
      {isSustaining && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${30 + rightHandIntensity * 40}%`,
            height: `${30 + rightHandIntensity * 40}%`,
            background: `radial-gradient(circle, ${color}30 0%, ${color}10 40%, transparent 70%)`,
            animation: `energyPulse ${1.5 / pulseSpeed}s ease-in-out infinite`,
          }}
        />
      )}

      {/* Layer rings - concentric circles for each active layer */}
      {layerVisuals.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            height: '80%',
          }}
        >
          {layerVisuals.map((layer, index) => {
            const ringSize = 30 + index * 12;
            return (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${ringSize}%`,
                  height: `${ringSize}%`,
                  transform: `translate(-50%, -50%) rotate(${layer.angle + Date.now() / 100}deg)`,
                  border: `2px solid ${layer.color}`,
                  borderRadius: 0,
                  opacity: layer.isFading ? 0.2 : 0.4 + layer.gain * 0.4,
                  borderStyle: layer.isFading ? 'dashed' : 'solid',
                  transition: 'opacity 0.3s ease',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Right hand dynamics indicator - subtle arc */}
      {rightHand.visible && (
        <div
          style={{
            position: 'absolute',
            right: 20,
            top: `${rightHand.y * 80 + 10}%`,
            width: 8,
            height: `${rightHandIntensity * 30}%`,
            background: `linear-gradient(to top, ${color}, transparent)`,
            borderRadius: 0,
            opacity: 0.6,
            transition: 'top 0.1s ease, height 0.1s ease',
          }}
        />
      )}

      {/* Activity meter - bottom edge */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '10%',
          right: '10%',
          height: 4,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${activity * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            transition: 'width 0.1s ease',
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      </div>

      {/* Velocity indicator - shows musical intensity */}
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: `${musicalVelocity * 40}%`,
          background: `linear-gradient(to top, ${color}44, ${color})`,
          borderRadius: 0,
          opacity: isPresent ? 0.7 : 0,
          transition: 'height 0.15s ease, opacity 0.3s ease',
        }}
      />

      {/* CSS Animations */}
      <style>{`
        @keyframes breathe {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.01);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          33% {
            transform: translateY(-10px) translateX(5px);
          }
          66% {
            transform: translateY(5px) translateX(-5px);
          }
        }
        @keyframes energyPulse {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}

export default PresenceOverlay;
