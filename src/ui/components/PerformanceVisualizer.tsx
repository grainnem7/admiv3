/**
 * Performance Visualizer - Multi-mode visual feedback for "Between Us"
 *
 * Provides visual feedback for musicians and participants:
 * - Large simple indicator (readable from distance)
 * - Waveform/spectrum visualization
 * - Note/pitch display
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PresenceState, SoundLayer } from '../../performance';
import { frequencyToMidi, midiToNoteName } from '../../utils/math';

export type VisualizationMode = 'indicator' | 'waveform' | 'notes' | 'all';

export interface PerformanceVisualizerProps {
  /** Current presence state */
  presenceState: PresenceState | null;
  /** Active sound layers */
  layers: SoundLayer[];
  /** Which visualization mode to show */
  mode: VisualizationMode;
  /** Audio analyser node for waveform */
  analyser?: AnalyserNode | null;
  /** Size preset */
  size?: 'compact' | 'standard' | 'large';
}

// Color palette for musical visualization
const COLORS = {
  active: '#00ff88',
  inactive: '#334455',
  background: '#1a1a2e',
  accent: '#00d4ff',
  warm: '#ff6b6b',
  cool: '#4ecdc4',
  neutral: '#95a5a6',
};

// Map pitch to color (chromatic)
function pitchToColor(midiNote: number): string {
  const hue = ((midiNote % 12) / 12) * 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// Map activity level to size
function activityToSize(activity: number, baseSize: number): number {
  return baseSize * (0.5 + activity * 0.5);
}

export function PerformanceVisualizer({
  presenceState,
  layers,
  mode,
  analyser,
  size = 'standard',
}: PerformanceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // Size configurations
  const sizeConfig = {
    compact: { width: 300, height: 200, fontSize: 24 },
    standard: { width: 500, height: 350, fontSize: 36 },
    large: { width: 800, height: 500, fontSize: 64 },
  };

  const config = sizeConfig[size];

  useEffect(() => {
    setDimensions({ width: config.width, height: config.height });
  }, [config.width, config.height]);

  // Animation loop for waveform
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    if (mode === 'waveform' || mode === 'all') {
      drawWaveform(ctx, analyser, dimensions, presenceState);
    }

    if (mode === 'indicator' || mode === 'all') {
      drawIndicator(ctx, presenceState, layers, dimensions, config.fontSize);
    }

    if (mode === 'notes' || mode === 'all') {
      drawNotes(ctx, presenceState, layers, dimensions, config.fontSize);
    }

    // Draw layers visualization
    drawLayers(ctx, layers, dimensions);

    animationRef.current = requestAnimationFrame(animate);
  }, [mode, analyser, presenceState, layers, dimensions, config.fontSize]);

  useEffect(() => {
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  return (
    <div
      className="performance-visualizer"
      style={{
        position: 'relative',
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block' }}
      />

      {/* Overlay info */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          right: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: COLORS.neutral,
          opacity: 0.7,
        }}
      >
        <span>Layers: {layers.length}</span>
        <span>
          {presenceState?.isPresent ? 'Participant detected' : 'Waiting for participant'}
        </span>
      </div>
    </div>
  );
}

/**
 * Draw waveform visualization
 */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode | null | undefined,
  dimensions: { width: number; height: number },
  presenceState: PresenceState | null
) {
  if (!analyser) {
    // Draw placeholder waveform based on presence
    drawPlaceholderWaveform(ctx, dimensions, presenceState);
    return;
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  const { width, height } = dimensions;
  const centerY = height / 2;

  ctx.lineWidth = 2;
  ctx.strokeStyle = presenceState?.isPresent ? COLORS.active : COLORS.inactive;
  ctx.beginPath();

  const sliceWidth = width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * centerY;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(width, centerY);
  ctx.stroke();
}

/**
 * Draw placeholder waveform when no analyser
 */
function drawPlaceholderWaveform(
  ctx: CanvasRenderingContext2D,
  dimensions: { width: number; height: number },
  presenceState: PresenceState | null
) {
  const { width, height } = dimensions;
  const centerY = height / 2;
  const activity = presenceState?.activityLevel ?? 0;
  const frequency = presenceState?.musicalParams.frequency ?? 220;

  ctx.lineWidth = 2;
  ctx.strokeStyle = presenceState?.isPresent ? COLORS.active : COLORS.inactive;
  ctx.beginPath();

  // Generate sine wave based on activity and frequency
  const amplitude = 20 + activity * 80;
  const wavelength = Math.max(20, 200 - frequency / 5);

  for (let x = 0; x < width; x++) {
    const t = Date.now() / 1000;
    const y = centerY + Math.sin((x / wavelength + t * 2) * Math.PI * 2) * amplitude;

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

/**
 * Draw large indicator
 */
function drawIndicator(
  ctx: CanvasRenderingContext2D,
  presenceState: PresenceState | null,
  _layers: SoundLayer[],
  dimensions: { width: number; height: number },
  _fontSize: number
) {
  const { width, height } = dimensions;
  const centerX = width / 2;
  const centerY = height / 3;

  if (!presenceState?.isPresent) {
    // Draw inactive indicator
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.inactive;
    ctx.fill();
    return;
  }

  // Draw active indicator with pitch-based color
  const midiNote = presenceState.musicalParams.midiNote;
  const color = pitchToColor(midiNote);
  const activity = presenceState.activityLevel;
  const baseRadius = 40;
  const radius = activityToSize(activity, baseRadius);

  // Outer glow
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.5,
    centerX,
    centerY,
    radius * 2
  );
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.5, `${color}88`);
  gradient.addColorStop(1, 'transparent');

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Core indicator
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Pulsing effect based on activity
  const pulseRadius = radius * (1 + Math.sin(Date.now() / 200) * 0.1 * activity);
  ctx.beginPath();
  ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = `${color}aa`;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/**
 * Draw note/pitch display
 */
function drawNotes(
  ctx: CanvasRenderingContext2D,
  presenceState: PresenceState | null,
  _layers: SoundLayer[],
  dimensions: { width: number; height: number },
  fontSize: number
) {
  const { width, height } = dimensions;

  if (!presenceState?.isPresent) {
    ctx.font = `${fontSize * 0.6}px monospace`;
    ctx.fillStyle = COLORS.inactive;
    ctx.textAlign = 'center';
    ctx.fillText('---', width / 2, height * 0.65);
    return;
  }

  const midiNote = presenceState.musicalParams.midiNote;
  const noteName = midiToNoteName(midiNote);
  const color = pitchToColor(midiNote);

  // Draw current note prominently
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(noteName, width / 2, height * 0.65);

  // Draw frequency below
  ctx.font = `${fontSize * 0.3}px monospace`;
  ctx.fillStyle = COLORS.neutral;
  ctx.fillText(
    `${presenceState.musicalParams.frequency.toFixed(1)} Hz`,
    width / 2,
    height * 0.65 + fontSize * 0.5
  );

  // Draw velocity bar
  const barWidth = width * 0.4;
  const barHeight = 8;
  const barX = (width - barWidth) / 2;
  const barY = height * 0.75;

  ctx.fillStyle = COLORS.inactive;
  ctx.fillRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, barWidth * presenceState.musicalParams.velocity, barHeight);
}

/**
 * Draw accumulated layers visualization
 */
function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: SoundLayer[],
  dimensions: { width: number; height: number }
) {
  if (layers.length === 0) return;

  const { width, height } = dimensions;
  const layerHeight = Math.min(20, height / (layers.length + 1));
  const startY = height - layerHeight * layers.length - 10;

  layers.forEach((layer, index) => {
    const y = startY + index * layerHeight;
    const midiNote = frequencyToMidi(layer.frequency);
    const color = pitchToColor(midiNote);

    // Layer bar
    const barWidth = width * 0.6 * layer.currentGain;
    ctx.fillStyle = layer.isFading ? `${color}66` : color;
    ctx.fillRect(width * 0.2, y, barWidth, layerHeight - 2);

    // Layer label
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.neutral;
    ctx.textAlign = 'left';
    ctx.fillText(
      `${midiToNoteName(midiNote)} ${layer.isFading ? '(fading)' : ''}`,
      width * 0.82,
      y + layerHeight / 2 + 3
    );
  });
}

/**
 * Simplified large indicator for maximum visibility
 */
export function LargeIndicator({
  presenceState,
  size = 200,
}: {
  presenceState: PresenceState | null;
  size?: number;
}) {
  if (!presenceState?.isPresent) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 0,
          backgroundColor: COLORS.inactive,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
        }}
      >
        <span style={{ color: '#666', fontSize: size * 0.15 }}>No input</span>
      </div>
    );
  }

  const { midiNote, velocity } = presenceState.musicalParams;
  const noteName = midiToNoteName(midiNote);
  const color = pitchToColor(midiNote);
  const glowSize = size * (0.8 + velocity * 0.4);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Glow effect */}
      <div
        style={{
          position: 'absolute',
          width: glowSize,
          height: glowSize,
          borderRadius: 0,
          backgroundColor: color,
          opacity: 0.3,
          filter: 'blur(20px)',
          transition: 'all 0.1s ease',
        }}
      />

      {/* Main circle */}
      <div
        style={{
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: 0,
          backgroundColor: color,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.1s ease',
          boxShadow: `0 0 ${30 * velocity}px ${color}`,
        }}
      >
        <span
          style={{
            color: '#fff',
            fontSize: size * 0.2,
            fontWeight: 'bold',
            fontFamily: 'monospace',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {noteName}
        </span>
        <span
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: size * 0.08,
            fontFamily: 'monospace',
          }}
        >
          {presenceState.musicalParams.frequency.toFixed(0)} Hz
        </span>
      </div>
    </div>
  );
}

/**
 * Simple spectrum bars for accumulated layers
 */
export function LayerSpectrum({
  layers,
  width = 300,
  height = 100,
}: {
  layers: SoundLayer[];
  width?: number;
  height?: number;
}) {
  if (layers.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor: COLORS.background,
          borderRadius: 'var(--border-radius)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.inactive,
        }}
      >
        No active layers
      </div>
    );
  }

  const barWidth = Math.min(40, (width - 20) / layers.length);

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: COLORS.background,
        borderRadius: 'var(--border-radius)',
        padding: '10px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: '4px',
      }}
    >
      {layers.map((layer) => {
        const midiNote = frequencyToMidi(layer.frequency);
        const color = pitchToColor(midiNote);
        const barHeight = (height - 20) * layer.currentGain;

        return (
          <div
            key={layer.id}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              opacity: layer.isFading ? 0.5 : 1,
              borderRadius: 0,
              transition: 'height 0.1s ease, opacity 0.3s ease',
            }}
            title={`${midiToNoteName(midiNote)} - ${layer.frequency.toFixed(0)} Hz`}
          />
        );
      })}
    </div>
  );
}

export default PerformanceVisualizer;
