/**
 * SurfacePressMode — turns coloured tubes on a table into press triggers.
 *
 * Pure (no audio, no DOM). Sibling of ThereminMode.
 *
 * The tubes radiate toward the oblique camera, so each one appears as a
 * LINE SEGMENT in the image (its full length, at whatever angle it lies) —
 * supplied live each frame from the colour blob's principal axis. Tim
 * presses anywhere along a tube, so a press is decided by the perpendicular
 * distance from the pressing fingertip to the tube's line, NOT by a single
 * point or a global surface line:
 *
 *   - press  when a finger is within `touchDist` of a tube's line and that
 *     tube is the finger's nearest;
 *   - release when the finger moves beyond `releaseDist` (anti-chatter
 *     hysteresis) or off the tube entirely (or the tube is lost this frame).
 *
 * Each finger presses only its single nearest tube, so a finger between two
 * tubes can't trigger both. All thresholds come from config (calibrated per
 * user); none are hardcoded here.
 */

import { distToSegment, type AxisSegment } from './segmentGeometry';

export interface SurfacePressThresholds {
  /** Press fires when the finger-to-tube distance ≤ this (normalised). */
  touchDist: number;
  /** Release when the distance ≥ this (> touchDist) — hysteresis band. */
  releaseDist: number;
  /** Velocity for a press (descent speed isn't reliable from one camera). */
  defaultVelocity: number;
}

/** A pressing point (a fingertip), in normalised image coords. */
export interface FingerPoint {
  x: number;
  y: number;
}

/** A key and its live line segment this frame (null when the tube isn't seen). */
export interface SurfaceKeyFrame {
  id: string;
  segment: AxisSegment | null;
}

export interface SurfacePressEvent {
  type: 'press' | 'release';
  buttonId: string;
  /** 0..1; release is always 0. */
  velocity: number;
  timestamp: number;
}

type Phase = 'idle' | 'down';

export class SurfacePressMode {
  private thresholds: SurfacePressThresholds | null = null;
  private phases = new Map<string, Phase>();

  setConfig(thresholds: SurfacePressThresholds): void {
    this.thresholds = thresholds;
  }

  reset(): void {
    this.phases.clear();
  }

  /**
   * Process one frame.
   * @param keys    every configured key with its live segment (or null)
   * @param fingers the pressing points (e.g. one lowest-fingertip per hand)
   */
  step(keys: SurfaceKeyFrame[], fingers: FingerPoint[], timestamp: number): SurfacePressEvent[] {
    if (!this.thresholds) return [];
    const { touchDist, releaseDist, defaultVelocity } = this.thresholds;
    const events: SurfacePressEvent[] = [];

    // Assign each finger to its single nearest key (among keys seen this
    // frame), so a finger between two tubes can't trigger both.
    const nearestKeyForFinger: (string | null)[] = fingers.map((f) => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const k of keys) {
        if (!k.segment) continue;
        const d = distToSegment(f.x, f.y, k.segment.ax, k.segment.ay, k.segment.bx, k.segment.by);
        if (d < bestDist) { bestDist = d; bestId = k.id; }
      }
      return bestId;
    });

    for (const k of keys) {
      // The engaging finger for this key = the closest finger whose nearest
      // key is this one. Distance is Infinity when no finger claims the key.
      let engDist = Infinity;
      if (k.segment) {
        for (let i = 0; i < fingers.length; i++) {
          if (nearestKeyForFinger[i] !== k.id) continue;
          const f = fingers[i];
          const d = distToSegment(f.x, f.y, k.segment.ax, k.segment.ay, k.segment.bx, k.segment.by);
          if (d < engDist) engDist = d;
        }
      }

      const phase = this.phases.get(k.id) ?? 'idle';

      if (phase === 'idle') {
        if (engDist <= touchDist) {
          events.push({ type: 'press', buttonId: k.id, velocity: defaultVelocity, timestamp });
          this.phases.set(k.id, 'down');
        }
      } else {
        // Down: release when the finger pulls beyond the release band or
        // leaves the tube (engDist Infinity).
        if (engDist >= releaseDist) {
          events.push({ type: 'release', buttonId: k.id, velocity: 0, timestamp });
          this.phases.set(k.id, 'idle');
        }
      }
    }

    return events;
  }
}
