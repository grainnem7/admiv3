/**
 * SurfacePressMode — turns coloured tubes on a table into press triggers.
 *
 * Pure (no audio, no DOM). Sibling of ThereminMode.
 *
 * One webcam can't measure height above the table, so "finger touching a
 * tube" can't be read directly. We combine two pragmatic cues — both derived
 * mainly from the tube's COLOUR tracking — and fire only when BOTH hold:
 *
 *   1. PROXIMITY — the pressing fingertip is within `touchDist` of the tube's
 *      line (the colour blob's live long axis). Orientation-agnostic, so it
 *      works for the diagonal tubes that radiate toward the camera.
 *   2. OCCLUSION — the tube's visible colour area has dipped below a fraction
 *      of its (idle-adapted) baseline, i.e. the finger is actually covering
 *      the tube, not hovering beside its line.
 *
 * A hover above the tube fails proximity; a finger near the line but not on
 * the tube fails occlusion. (A finger held on the camera→tube sight-line but
 * hovering is the irreducible single-camera blind spot — accepted.)
 *
 * Release uses hysteresis: the finger pulling beyond `releaseDist` OR the
 * tube's colour recovering past `occlusionExit` of baseline. Each finger
 * presses only its single nearest tube. Thresholds come from config; none
 * are hardcoded except the baseline-adaptation rate.
 */

import { distToSegment, type AxisSegment } from './segmentGeometry';

export interface SurfacePressThresholds {
  /** Press needs the fingertip within this normalised distance of the tube line. */
  touchDist: number;
  /** Release when the fingertip pulls beyond this distance (> touchDist). */
  releaseDist: number;
  /** Press needs visible area ≤ this fraction of baseline (finger covering it). */
  occlusionEnter: number;
  /** Release once visible area recovers ≥ this fraction of baseline. */
  occlusionExit: number;
  /** Velocity for a press (descent speed isn't reliable from one camera). */
  defaultVelocity: number;
}

/** A pressing point (a fingertip), in normalised image coords. */
export interface FingerPoint {
  x: number;
  y: number;
}

/** A key's live state this frame. */
export interface SurfaceKeyFrame {
  id: string;
  /** Live long-axis line from the colour blob (null when the tube isn't seen). */
  segment: AxisSegment | null;
  /** Visible colour area (0..1 of frame); ~0 when fully covered or lost. */
  area: number;
  /** Whether the colour blob met its area threshold this frame. */
  found: boolean;
}

export interface SurfacePressEvent {
  type: 'press' | 'release';
  buttonId: string;
  /** 0..1; release is always 0. */
  velocity: number;
  timestamp: number;
}

/** How fast the unoccluded-area baseline tracks lighting/tube changes (idle only). */
const BASELINE_ALPHA = 0.05;

interface KeyState {
  phase: 'idle' | 'down';
  /** Estimate of the tube's unoccluded visible area. */
  baseline: number;
  /** Last segment seen while found — used for proximity when briefly lost. */
  lastSegment: AxisSegment | null;
}

export class SurfacePressMode {
  private thresholds: SurfacePressThresholds | null = null;
  private states = new Map<string, KeyState>();

  setConfig(thresholds: SurfacePressThresholds): void {
    this.thresholds = thresholds;
  }

  reset(): void {
    this.states.clear();
  }

  /**
   * Process one frame.
   * @param keys    every configured key with its live segment + area + found
   * @param fingers the pressing points (e.g. one lowest-fingertip per hand)
   */
  step(keys: SurfaceKeyFrame[], fingers: FingerPoint[], timestamp: number): SurfacePressEvent[] {
    if (!this.thresholds) return [];
    const { touchDist, releaseDist, occlusionEnter, occlusionExit, defaultVelocity } = this.thresholds;
    const events: SurfacePressEvent[] = [];

    // Per key: refresh state, adapt the idle baseline, and resolve an
    // effective segment (live, or last-seen if briefly covered/lost).
    const eff = new Map<string, { seg: AxisSegment | null; coverage: number; state: KeyState }>();
    for (const key of keys) {
      let st = this.states.get(key.id);
      if (!st) {
        st = { phase: 'idle', baseline: key.found ? key.area : 0, lastSegment: key.segment };
        this.states.set(key.id, st);
      }
      if (key.found && key.segment) st.lastSegment = key.segment;
      // Adapt the baseline only while idle + found, so a held press can't
      // drag the baseline down to itself (which would self-release).
      if (st.phase === 'idle' && key.found) {
        st.baseline = st.baseline <= 0 ? key.area : st.baseline + BASELINE_ALPHA * (key.area - st.baseline);
      }
      const seg = key.segment ?? st.lastSegment;
      const coverage = st.baseline > 0 ? Math.max(0, Math.min(1, 1 - key.area / st.baseline)) : 0;
      eff.set(key.id, { seg, coverage, state: st });
    }

    // Assign each finger to its single nearest key (by distance to the
    // effective segment), so a finger between two tubes can't trigger both.
    const nearestKeyForFinger: (string | null)[] = fingers.map((f) => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const key of keys) {
        const e = eff.get(key.id)!;
        if (!e.seg) continue;
        const d = distToSegment(f.x, f.y, e.seg.ax, e.seg.ay, e.seg.bx, e.seg.by);
        if (d < bestDist) { bestDist = d; bestId = key.id; }
      }
      return bestId;
    });

    for (const key of keys) {
      const e = eff.get(key.id)!;
      const st = e.state;

      let engDist = Infinity;
      if (e.seg) {
        for (let i = 0; i < fingers.length; i++) {
          if (nearestKeyForFinger[i] !== key.id) continue;
          const f = fingers[i];
          const d = distToSegment(f.x, f.y, e.seg.ax, e.seg.ay, e.seg.bx, e.seg.by);
          if (d < engDist) engDist = d;
        }
      }

      if (st.phase === 'idle') {
        if (engDist <= touchDist && e.coverage >= 1 - occlusionEnter) {
          events.push({ type: 'press', buttonId: key.id, velocity: defaultVelocity, timestamp });
          st.phase = 'down';
        }
      } else {
        const recovered = e.coverage <= 1 - occlusionExit;
        if (engDist >= releaseDist || recovered) {
          events.push({ type: 'release', buttonId: key.id, velocity: 0, timestamp });
          st.phase = 'idle';
        }
      }
    }

    return events;
  }
}
