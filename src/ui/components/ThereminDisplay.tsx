/**
 * ThereminDisplay - Visual pitch/volume representation for dual-hand theremin
 *
 * Shows real-time visualization of both hands:
 * - Shared pitch bar with two indicators (blue=right, purple=left)
 * - Per-hand note name, frequency, and volume
 * - Hand tracking status
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

interface DualOutput {
  left: ThereminOutput;
  right: ThereminOutput;
}

function ThereminDisplay({ isActive }: ThereminDisplayProps) {
  const [dualOutput, setDualOutput] = useState<DualOutput | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackingFrame = useAppStore((s) => s.trackingFrame);

  const processFrame = useCallback((frame: TrackingFrame | null) => {
    if (!isActive || !frame) {
      setDualOutput(null);
      return;
    }

    const thereminMode = getThereminMode();
    setDualOutput(thereminMode.processBothHands(frame));
  }, [isActive]);

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
    const thereminMode = getThereminMode();

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!dualOutput) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show your hands to play', width / 2, height / 2);
      return;
    }

    const { left, right } = dualOutput;
    const leftColor = '#bb66ff';  // purple
    const rightColor = '#4488ff'; // blue

    // ── Shared pitch bar at top ──
    const pitchBarX = 20;
    const pitchBarY = 18;
    const pitchBarWidth = width - 40;
    const pitchBarHeight = 20;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PITCH', pitchBarX, pitchBarY - 4);

    // Bar background with gradient
    const gradient = ctx.createLinearGradient(pitchBarX, 0, pitchBarX + pitchBarWidth, 0);
    gradient.addColorStop(0, 'rgba(68, 136, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 68, 136, 0.15)');
    ctx.fillStyle = gradient;
    ctx.fillRect(pitchBarX, pitchBarY, pitchBarWidth, pitchBarHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(pitchBarX, pitchBarY, pitchBarWidth, pitchBarHeight);

    // Draw pitch indicators for each hand
    const drawPitchIndicator = (output: ThereminOutput, color: string) => {
      if (!output.handActive) return;
      const px = pitchBarX + output.pitch * pitchBarWidth;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, pitchBarY - 3);
      ctx.lineTo(px, pitchBarY + pitchBarHeight + 3);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, pitchBarY + pitchBarHeight / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawPitchIndicator(left, leftColor);
    drawPitchIndicator(right, rightColor);

    // ── Per-hand info: Left side | Right side ──
    const infoY = pitchBarY + pitchBarHeight + 16;
    const halfW = width / 2;

    const drawHandInfo = (
      output: ThereminOutput,
      label: string,
      color: string,
      centerX: number,
      baseY: number
    ) => {
      // Label
      ctx.fillStyle = color;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, centerX, baseY);

      // Note name
      const midi = thereminMode.pitchToMidi(output.pitch);
      const noteName = midiToNoteName(midi);
      ctx.fillStyle = output.handActive ? '#ffffff' : 'rgba(255,255,255,0.25)';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(noteName, centerX, baseY + 28);

      // Frequency
      const freq = thereminMode.pitchToFrequency(output.pitch);
      ctx.fillStyle = output.handActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';
      ctx.font = '10px monospace';
      ctx.fillText(`${freq.toFixed(0)} Hz`, centerX, baseY + 42);

      // Volume bar
      const volBarW = 50;
      const volBarH = 8;
      const volBarX = centerX - volBarW / 2;
      const volBarY = baseY + 50;

      ctx.fillStyle = 'rgba(100,100,100,0.3)';
      ctx.fillRect(volBarX, volBarY, volBarW, volBarH);
      ctx.fillStyle = output.handActive ? '#44ff88' : 'rgba(68,255,136,0.2)';
      ctx.fillRect(volBarX, volBarY, output.volume * volBarW, volBarH);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '8px sans-serif';
      ctx.fillText('vol', centerX, volBarY + volBarH + 10);

      // Status dot
      const statusY = volBarY + volBarH + 22;
      if (output.handActive) {
        ctx.fillStyle = '#44ff88';
        ctx.fillText('● tracking', centerX, statusY);
      } else {
        ctx.fillStyle = '#ff6666';
        ctx.fillText('○ no hand', centerX, statusY);
      }
    };

    drawHandInfo(left, 'L HAND', leftColor, halfW / 2, infoY);
    drawHandInfo(right, 'R HAND', rightColor, halfW + halfW / 2, infoY);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, infoY - 6);
    ctx.lineTo(halfW, height - 5);
    ctx.stroke();

  }, [dualOutput]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="theremin-display">
      <canvas
        ref={canvasRef}
        width={260}
        height={180}
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
