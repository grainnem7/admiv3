/**
 * ColorTrackingOverlay - Simple, clear visual feedback
 *
 * Shows:
 * - A small colored dot where the tracked object is
 * - A label showing what it controls
 * - Calibration prompt when in calibration mode
 * - "Object not found" when tracking is lost
 */

import { useEffect, useRef } from 'react';
import type { ColorLandmarks } from '../../state/types';
import type { ColorExpressionMapping } from '../../mapping/nodes/ColorExpressionNode';
import { getColorTracker } from '../../tracking/ColorTracker';

interface ColorTrackingOverlayProps {
  colorLandmarks: ColorLandmarks | null;
  mappings: ColorExpressionMapping[];
  containerWidth: number;
  containerHeight: number;
  isCalibrating?: boolean;
  /**
   * When true, draws a per-blob role label and blob-area readout next to
   * each tracked centroid.  Off by default to keep the performance view
   * uncluttered; the facilitator panel turns it on so blob area is
   * visible while tuning min-area thresholds.
   * @default false
   */
  showRoleLabels?: boolean;
}

function ColorTrackingOverlay({
  colorLandmarks,
  mappings,
  containerWidth,
  containerHeight,
  isCalibrating = false,
  showRoleLabels = false,
}: ColorTrackingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = containerWidth;
    canvas.height = containerHeight;
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    // Calibration mode: dim screen + prompt
    if (isCalibrating) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, containerWidth, containerHeight);

      const text = 'Click on the object you want to track';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Background pill
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      roundRect(ctx, (containerWidth - tw) / 2 - 20, containerHeight / 2 - 22, tw + 40, 44, 10);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, containerWidth / 2, containerHeight / 2);
      ctx.textBaseline = 'alphabetic';
      return;
    }

    // Nothing to track
    if (!colorLandmarks || colorLandmarks.blobs.length === 0) return;

    const foundBlobs = colorLandmarks.blobs.filter(b => b.found);

    if (foundBlobs.length === 0) {
      // Show "looking..." message
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText('Move your object back into view', containerWidth / 2, containerHeight - 30);
      return;
    }

    // Draw each found blob as a small tracking indicator
    // Flip X because video is CSS-mirrored (scaleX(-1)) but blob coords are from raw video
    for (const blob of foundBlobs) {
      const x = (1 - blob.x) * containerWidth;
      const y = blob.y * containerHeight;
      const hueColor = `hsl(${getHueForBlob(blob.colorId)}, 70%, 55%)`;

      // Small filled dot
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = hueColor;
      ctx.fill();

      // Ring around it
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = hueColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Short crosshair
      ctx.beginPath();
      ctx.moveTo(x - 24, y);
      ctx.lineTo(x - 12, y);
      ctx.moveTo(x + 12, y);
      ctx.lineTo(x + 24, y);
      ctx.moveTo(x, y - 24);
      ctx.lineTo(x, y - 12);
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x, y + 24);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Optional per-blob role label + area readout (Change 8 + 5).
      // Two short lines: the role this baton plays, and its current
      // pixel-area share — the latter helps the facilitator tune the
      // min-area threshold against background colour clashes.
      if (showRoleLabels) {
        const role = describeBlobRole(blob.colorId, mappings);
        const areaPct = (blob.area * 100).toFixed(2);
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelX = x + 22;

        // Role line
        const roleText = role;
        const roleW = ctx.measureText(roleText).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        roundRect(ctx, labelX - 4, y - 18, roleW + 8, 16, 4);
        ctx.fill();
        ctx.fillStyle = hueColor;
        ctx.fillText(roleText, labelX, y - 10);

        // Area readout line
        const areaText = `${areaPct}%`;
        const areaW = ctx.measureText(areaText).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        roundRect(ctx, labelX - 4, y + 2, areaW + 8, 14, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(areaText, labelX, y + 9);

        ctx.textBaseline = 'alphabetic';
      }
    }

    // Show what it controls — single label at top
    if (mappings.length > 0) {
      const paramNames = [...new Set(mappings.map(m => {
        const labels: Record<string, string> = {
          pitch: 'Pitch', volume: 'Volume', filter_cutoff: 'Filter',
          reverb_mix: 'Reverb', pan: 'Pan',
        };
        return labels[m.parameter] ?? m.parameter;
      }))];

      const label = `Controlling: ${paramNames.join(' + ')}`;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      const lw = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      roundRect(ctx, (containerWidth - lw) / 2 - 10, 10, lw + 20, 28, 6);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, containerWidth / 2, 24);
      ctx.textBaseline = 'alphabetic';
    }
  }, [colorLandmarks, mappings, containerWidth, containerHeight, isCalibrating]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      aria-hidden="true"
    />
  );
}

/** Get hue for display color from the tracker's calibrated data */
function getHueForBlob(colorId: string): number {
  const colors = getColorTracker().getTrackedColors();
  const found = colors.find(c => c.id === colorId);
  return found?.hue ?? 60;
}

/**
 * Look up what musical role a given tracked colour is bound to, based
 * on the active ColorExpressionMappings.  Returns a short, glanceable
 * label like "PITCH" or "FILTER + REVERB"; falls back to the colour ID
 * (uppercased) if no mappings target this colour.
 */
function describeBlobRole(
  colorId: string,
  mappings: ColorExpressionMapping[],
): string {
  const labels: Record<string, string> = {
    pitch: 'PITCH',
    volume: 'VOLUME',
    filter_cutoff: 'FILTER',
    reverb_mix: 'REVERB',
    pan: 'PAN',
  };
  const matched = mappings.filter((m) => m.colorId === colorId);
  if (matched.length === 0) return colorId.toUpperCase();
  const parts = [...new Set(matched.map((m) => labels[m.parameter] ?? m.parameter.toUpperCase()))];
  return parts.join(' + ');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default ColorTrackingOverlay;
