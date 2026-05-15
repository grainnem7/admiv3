/**
 * ShakeDetector — fires once on a rising velocity crossing above a
 * threshold, then requires the velocity to drop back below threshold
 * AND a cooldown to elapse before it can fire again.
 *
 * "Fast shake" is the Remix stutter trigger; the rising-edge + cooldown
 * design stops a single sustained fast move from spraying triggers.
 */

export interface ShakeConfig {
  /** Smoothed velocity (0–1) above which a shake fires. */
  threshold?: number;
  /** Minimum gap (ms) between fires. */
  cooldownMs?: number;
}

const DEFAULTS: Required<ShakeConfig> = {
  threshold: 0.55,
  cooldownMs: 600,
};

export class ShakeDetector {
  private threshold: number;
  private cooldownMs: number;
  private wasAbove = false;
  private lastFireMs = Number.NEGATIVE_INFINITY;

  constructor(cfg: ShakeConfig = {}) {
    this.threshold = cfg.threshold ?? DEFAULTS.threshold;
    this.cooldownMs = cfg.cooldownMs ?? DEFAULTS.cooldownMs;
  }

  /** Feed smoothed velocity; returns true on the frame a shake fires. */
  update(velocity: number, nowMs: number): boolean {
    const above = velocity >= this.threshold;
    const risingEdge = above && !this.wasAbove;
    this.wasAbove = above;

    if (risingEdge && nowMs - this.lastFireMs >= this.cooldownMs) {
      this.lastFireMs = nowMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wasAbove = false;
    this.lastFireMs = Number.NEGATIVE_INFINITY;
  }
}
