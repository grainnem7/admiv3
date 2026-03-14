/**
 * ThereminDisplay - Visual pitch/volume representation for MusiKraken-style theremin
 *
 * Shows real-time visualization of theremin control:
 * - X position (horizontal) for pitch
 * - Y position (hand height) for volume
 * - Hand openness for filter expression
 * - Note name display
 * - Hand tracking point visualization
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { getThereminMode, type ThereminOutput } from '../../tracking';
import type { TrackingFrame } from '../../state/types';
import { useAppStore } from '../../state/store';

interface ThereminDisplayProps {
  isActive: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi: number): string {
  if (midi < 0 || midi > 127) return '---';
  const noteName = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

function ThereminDisplay({ isActive }: ThereminDisplayProps) {
  const [output, setOutput] = useState<ThereminOutput | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackingFrame = useAppStore((s) => s.trackingFrame);

  // Process tracking frame through theremin mode
  const processFrame = useCallback((frame: TrackingFrame | null) => {
    if (!isActive || !frame) {
      setOutput(null);
      return;
    }

    const thereminMode = getThereminMode();
    const thereminOutput = thereminMode.process(frame);
    setOutput(thereminOutput);
  }, [isActive]);

  // Update when tracking frame changes
  useEffect(() => {
    processFrame(trackingFrame);
  }, [trackingFrame, processFrame]);

  // Draw visualization
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!output) {
      // No output - show waiting message
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show your hand to play', width / 2, height / 2);
      return;
    }

    // Draw pitch indicator (horizontal bar - X position)
    const pitchBarWidth = width - 40;
    const pitchBarHeight = 24;
    const pitchBarX = 20;
    const pitchBarY = 20;

    // Pitch bar label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PITCH (X)', pitchBarX, pitchBarY - 4);

    // Pitch bar background
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(pitchBarX, pitchBarY, pitchBarWidth, pitchBarHeight);

    // Pitch bar fill (shows position)
    const gradient = ctx.createLinearGradient(pitchBarX, 0, pitchBarX + pitchBarWidth, 0);
    gradient.addColorStop(0, '#4488ff');
    gradient.addColorStop(1, '#ff4488');
    ctx.fillStyle = gradient;
    ctx.fillRect(pitchBarX, pitchBarY, pitchBarWidth, pitchBarHeight);

    // Pitch indicator (current position)
    if (output.handActive) {
      const pitchX = pitchBarX + output.pitch * pitchBarWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pitchX, pitchBarY - 5);
      ctx.lineTo(pitchX, pitchBarY + pitchBarHeight + 5);
      ctx.stroke();

      // White circle at position
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pitchX, pitchBarY + pitchBarHeight / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw volume indicator (vertical bar - hand height)
    const volBarWidth = 24;
    const volBarHeight = 60;
    const volBarX = width - 40;
    const volBarY = 55;

    // Volume bar label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VOL', volBarX + volBarWidth / 2, volBarY - 4);

    // Volume bar background
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(volBarX, volBarY, volBarWidth, volBarHeight);

    // Volume bar fill (from bottom up)
    const volFillHeight = output.volume * volBarHeight;
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(volBarX, volBarY + volBarHeight - volFillHeight, volBarWidth, volFillHeight);

    // Draw note name in center
    const thereminMode = getThereminMode();
    const midiNote = thereminMode.pitchToMidi(output.pitch);
    const noteName = midiToNoteName(midiNote);

    ctx.fillStyle = output.handActive ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(noteName, width / 2 - 20, height / 2 + 35);

    // Draw frequency
    const freq = thereminMode.pitchToFrequency(output.pitch);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px monospace';
    ctx.fillText(`${freq.toFixed(1)} Hz`, width / 2 - 20, height / 2 + 55);

    // Draw hand openness indicator (small bar below volume)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '8px sans-serif';
    ctx.fillText('OPEN', volBarX + volBarWidth / 2, volBarY + volBarHeight + 12);

    const opennessBarY = volBarY + volBarHeight + 16;
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(volBarX, opennessBarY, volBarWidth, 8);
    ctx.fillStyle = '#ffaa44';
    ctx.fillRect(volBarX, opennessBarY, output.openness * volBarWidth, 8);

    // Draw hand status
    ctx.textAlign = 'left';
    ctx.font = '11px sans-serif';
    if (output.handActive) {
      ctx.fillStyle = '#44ff88';
      ctx.fillText(`● ${output.handedness || 'Hand'} detected`, 20, height - 10);
    } else {
      ctx.fillStyle = '#ff6666';
      ctx.fillText('○ No hand detected', 20, height - 10);
    }
  }, [output]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="theremin-display">
      <canvas
        ref={canvasRef}
        width={220}
        height={160}
        className="theremin-canvas"
      />

      <style>{`
        .theremin-display {
          background: var(--color-surface);
          border-radius: 8px;
          padding: 8px;
          margin-top: 8px;
        }

        .theremin-canvas {
          width: 100%;
          height: auto;
          border-radius: 4px;
          background: #1a1a2e;
        }
      `}</style>
    </div>
  );
}

export default ThereminDisplay;
