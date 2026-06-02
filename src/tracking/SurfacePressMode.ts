/**
 * SurfacePressMode — turns coloured objects on a table into press triggers.
 *
 * Pure (no audio, no DOM). Sibling of ThereminMode. Given a calibrated
 * surface line and one tracked point per button each frame (the bottom of
 * the object's colour blob, or a fingertip), it runs a per-button
 * hysteresis state machine and emits typed press/release events.
 *
 * "Descends to the surface line" = the point's y rises to pressLine(x).
 * Release requires rising clear of a higher releaseLine(x) — the gap
 * between them is the anti-chatter hysteresis band. All thresholds are
 * supplied by config (calibrated per user); none are hardcoded here.
 *
 * The camera angle (front/side/oblique) is irrelevant: the surface line
 * is whatever was fitted from the user's touched points.
 */

import { surfaceY, type SurfaceLine } from './SurfaceModel';

export interface SurfacePressButtonConfig {
  /** Stable button id, e.g. "press-1". Own namespace, NOT a baton ColorRole. */
  id: string;
  /** Resting image x, used to evaluate surfaceY(x) for this button. */
  x: number;
  /** Minimum blob area to accept (reject noise). 0 in fingertip mode. */
  minBlobArea: number;
}

export interface SurfacePressConfigInput {
  line: SurfaceLine;
  /** Gap above the surface at which a press fires (≥0). */
  pressGap: number;
  /** Larger gap above the surface at which a release fires (> pressGap). */
  releaseGap: number;
  /** Per-frame descent (Δy) mapping to full velocity. */
  descentForFullVelocity: number;
  /** Velocity used when descent can't be measured. */
  defaultVelocity: number;
  buttons: SurfacePressButtonConfig[];
}

/** One tracked point per button for the current frame. */
export interface SurfaceTrackPoint {
  id: string;
  x: number;
  /** Tracked y (0 top … 1 bottom): blob bottom-edge or fingertip. */
  y: number;
  found: boolean;
  /** Blob area (0..1); 0 for fingertips. */
  area: number;
}

export interface SurfacePressEvent {
  type: 'press' | 'release';
  buttonId: string;
  /** 0..1; release is always 0. */
  velocity: number;
  timestamp: number;
}

type Phase = 'idle' | 'down';

interface ButtonState {
  phase: Phase;
  lastY: number;
  initialised: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class SurfacePressMode {
  private config: SurfacePressConfigInput | null = null;
  private states = new Map<string, ButtonState>();

  setConfig(config: SurfacePressConfigInput): void {
    this.config = config;
    // Drop state for buttons that no longer exist.
    const ids = new Set(config.buttons.map((b) => b.id));
    for (const id of [...this.states.keys()]) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }

  reset(): void {
    this.states.clear();
  }

  /** Process one frame; returns the press/release events fired this frame. */
  step(points: SurfaceTrackPoint[], timestamp: number): SurfacePressEvent[] {
    if (!this.config) return [];
    const events: SurfacePressEvent[] = [];

    for (const btn of this.config.buttons) {
      const pt = points.find((p) => p.id === btn.id);
      if (!pt || !pt.found || pt.area < btn.minBlobArea) continue;

      const sy = surfaceY(this.config.line, pt.x);
      const pressLine = sy - this.config.pressGap;     // larger y (lower in image)
      const releaseLine = sy - this.config.releaseGap; // smaller y (higher in image)

      let state = this.states.get(btn.id);
      if (!state || !state.initialised) {
        // First reading: arm without firing. If it's already resting on the
        // surface, start "down" silently so it must be lifted then pressed
        // before it makes a sound (mirrors the engine's start-muted rule).
        state = {
          phase: pt.y >= pressLine ? 'down' : 'idle',
          lastY: pt.y,
          initialised: true,
        };
        this.states.set(btn.id, state);
        continue;
      }

      if (state.phase === 'idle' && pt.y >= pressLine) {
        const descent = pt.y - state.lastY;
        const velocity =
          descent > 0
            ? clamp(descent / this.config.descentForFullVelocity, 0.1, 1)
            : this.config.defaultVelocity;
        events.push({ type: 'press', buttonId: btn.id, velocity, timestamp });
        state.phase = 'down';
      } else if (state.phase === 'down' && pt.y <= releaseLine) {
        events.push({ type: 'release', buttonId: btn.id, velocity: 0, timestamp });
        state.phase = 'idle';
      }

      state.lastY = pt.y;
    }

    return events;
  }
}
