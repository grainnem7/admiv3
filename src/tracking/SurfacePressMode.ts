/**
 * SurfacePressMode — turns coloured objects on a table into press triggers.
 *
 * Pure (no audio, no DOM). Sibling of ThereminMode. Given a calibrated
 * surface line and one tracked point per key each frame, it runs a
 * per-key hysteresis state machine and emits typed press/release events.
 *
 * The intended driver (Stage 1) is a fingertip: the keys are coloured
 * objects lying still on the table, and the tracked point for a key is
 * the pressing finger CURRENTLY over that key's x (or absent when no
 * finger is there). "Descends to the surface line" = the point's y rises
 * to pressLine(x). Release requires either rising clear of the higher
 * releaseLine(x) — the anti-chatter hysteresis band — or, when
 * `releaseOnLost` is set, the tracked point disappearing (the finger
 * moving off the key). All thresholds are supplied by config (calibrated
 * per user); none are hardcoded here.
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
  /**
   * When true, a key in the 'down' state is released as soon as its
   * tracked point disappears (e.g. the finger moves off the key) — not
   * only when the point lifts above releaseLine. Required for the
   * fingertip model so moving to the next key doesn't leave a stuck note.
   * @default false (object-bottom model: only release on lift)
   */
  releaseOnLost?: boolean;
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
    const releaseOnLost = this.config.releaseOnLost ?? false;

    for (const btn of this.config.buttons) {
      const pt = points.find((p) => p.id === btn.id);
      const present = !!pt && pt.found && pt.area >= btn.minBlobArea;
      let state = this.states.get(btn.id);

      // No tracked point this frame (e.g. no fingertip over this key).
      if (!present) {
        if (state?.phase === 'down' && releaseOnLost) {
          events.push({ type: 'release', buttonId: btn.id, velocity: 0, timestamp });
          state.phase = 'idle';
        }
        // Initialise as idle (silently) so a finger that later ARRIVES over
        // the key and is already below the line registers as a press.
        if (!state) {
          this.states.set(btn.id, { phase: 'idle', lastY: Number.NaN, initialised: true });
        }
        continue;
      }

      const sy = surfaceY(this.config.line, pt!.x);
      const pressLine = sy - this.config.pressGap;     // larger y (lower in image)
      const releaseLine = sy - this.config.releaseGap; // smaller y (higher in image)

      if (!state || !state.initialised) {
        // First reading WITH a point present: arm without firing. If it's
        // already at/below the surface, start "down" silently so a key that
        // happens to have a finger on it at startup doesn't auto-sound.
        state = {
          phase: pt!.y >= pressLine ? 'down' : 'idle',
          lastY: pt!.y,
          initialised: true,
        };
        this.states.set(btn.id, state);
        continue;
      }

      if (state.phase === 'idle' && pt!.y >= pressLine) {
        // descent is meaningless if lastY is NaN (key was just armed while the
        // finger was absent) — fall back to the calibrated default velocity.
        const descent = Number.isNaN(state.lastY) ? 0 : pt!.y - state.lastY;
        const velocity =
          descent > 0
            ? clamp(descent / this.config.descentForFullVelocity, 0.1, 1)
            : this.config.defaultVelocity;
        events.push({ type: 'press', buttonId: btn.id, velocity, timestamp });
        state.phase = 'down';
      } else if (state.phase === 'down' && pt!.y <= releaseLine) {
        events.push({ type: 'release', buttonId: btn.id, velocity: 0, timestamp });
        state.phase = 'idle';
      }

      state.lastY = pt!.y;
    }

    return events;
  }
}
