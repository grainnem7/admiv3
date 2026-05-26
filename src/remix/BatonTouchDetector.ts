/**
 * BatonTouchDetector — fires once when two baton centroids come within
 * `touchRadius`, then requires them to separate beyond the radius AND a
 * cooldown to elapse before firing again. A gross-motor "bring the batons
 * together" trigger, far more reliable for limited motor control than a
 * still-hold or a fast shake. Pure; mirrors ShakeDetector's shape.
 */

export interface BatonPoint {
  x: number;
  y: number;
  found: boolean;
}

export interface BatonTouchConfig {
  touchRadius?: number;
  cooldownMs?: number;
}

const DEFAULTS: Required<BatonTouchConfig> = {
  touchRadius: 0.12,
  cooldownMs: 600,
};

export class BatonTouchDetector {
  private touchRadius: number;
  private cooldownMs: number;
  private wasWithin = false;
  private lastFireMs = Number.NEGATIVE_INFINITY;

  constructor(cfg: BatonTouchConfig = {}) {
    this.touchRadius = cfg.touchRadius ?? DEFAULTS.touchRadius;
    this.cooldownMs = cfg.cooldownMs ?? DEFAULTS.cooldownMs;
  }

  setTouchRadius(r: number): void {
    this.touchRadius = Math.max(0, r);
  }

  /** Feed both batons; returns true on the frame a touch fires. */
  update(a: BatonPoint, b: BatonPoint, nowMs: number): boolean {
    if (!a.found || !b.found) {
      this.wasWithin = false;
      return false;
    }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const within = Math.sqrt(dx * dx + dy * dy) <= this.touchRadius;
    const risingEdge = within && !this.wasWithin;
    this.wasWithin = within;

    if (risingEdge && nowMs - this.lastFireMs >= this.cooldownMs) {
      this.lastFireMs = nowMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wasWithin = false;
    this.lastFireMs = Number.NEGATIVE_INFINITY;
  }
}
