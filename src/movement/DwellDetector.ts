/**
 * Dwell Detector - Detects when user holds position to trigger an action
 */

import { MOVEMENT } from '../utils/constants';
import { distance2D } from '../utils/math';

export interface DwellConfig {
  /** Time in ms to hold position before triggering */
  dwellTimeMs?: number;
  /** Maximum movement radius to still count as dwelling */
  dwellRadius?: number;
  /** Cooldown after trigger before next dwell can start */
  cooldownMs?: number;
}

const DEFAULT_CONFIG: Required<DwellConfig> = {
  dwellTimeMs: MOVEMENT.DEFAULT_DWELL_MS,
  dwellRadius: 0.03, // 3% of screen
  cooldownMs: 300,
};

export type DwellState = 'idle' | 'dwelling' | 'triggered' | 'cooldown';

export interface DwellResult {
  state: DwellState;
  progress: number; // 0-1, how close to trigger
  position: { x: number; y: number } | null;
}

export class DwellDetector {
  private config: Required<DwellConfig>;
  private state: DwellState = 'idle';
  private dwellStartTime: number | null = null;
  private dwellPosition: { x: number; y: number } | null = null;
  private triggerTime: number | null = null;

  constructor(config: DwellConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update dwell detection with new position
   */
  update(position: { x: number; y: number }, timestamp: number): DwellResult {
    switch (this.state) {
      case 'idle':
        return this.handleIdle(position, timestamp);

      case 'dwelling':
        return this.handleDwelling(position, timestamp);

      case 'triggered':
        // Immediately transition to cooldown
        this.state = 'cooldown';
        this.triggerTime = timestamp;
        return { state: 'triggered', progress: 1, position: this.dwellPosition };

      case 'cooldown':
        return this.handleCooldown(position, timestamp);

      default:
        return { state: 'idle', progress: 0, position: null };
    }
  }

  /**
   * Handle idle state - waiting for dwell to start
   */
  private handleIdle(
    position: { x: number; y: number },
    timestamp: number
  ): DwellResult {
    // Start new dwell
    this.dwellStartTime = timestamp;
    this.dwellPosition = position;
    this.state = 'dwelling';

    return { state: 'dwelling', progress: 0, position };
  }

  /**
   * Handle dwelling state - user is holding position
   */
  private handleDwelling(
    position: { x: number; y: number },
    timestamp: number
  ): DwellResult {
    if (!this.dwellPosition || !this.dwellStartTime) {
      this.reset();
      return { state: 'idle', progress: 0, position: null };
    }

    // Check if position has moved too far
    const distance = distance2D(this.dwellPosition, position);
    if (distance > this.config.dwellRadius) {
      // Restart dwell at new position
      this.dwellStartTime = timestamp;
      this.dwellPosition = position;
      return { state: 'dwelling', progress: 0, position };
    }

    // Calculate progress
    const elapsed = timestamp - this.dwellStartTime;
    const progress = Math.min(1, elapsed / this.config.dwellTimeMs);

    // Check if dwell is complete
    if (progress >= 1) {
      this.state = 'triggered';
      return { state: 'triggered', progress: 1, position: this.dwellPosition };
    }

    return { state: 'dwelling', progress, position: this.dwellPosition };
  }

  /**
   * Handle cooldown state - waiting before next dwell can start
   */
  private handleCooldown(
    position: { x: number; y: number },
    timestamp: number
  ): DwellResult {
    if (!this.triggerTime) {
      this.reset();
      return { state: 'idle', progress: 0, position: null };
    }

    const elapsed = timestamp - this.triggerTime;
    if (elapsed >= this.config.cooldownMs) {
      this.reset();
      return this.handleIdle(position, timestamp);
    }

    return { state: 'cooldown', progress: 0, position: null };
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.state = 'idle';
    this.dwellStartTime = null;
    this.dwellPosition = null;
    this.triggerTime = null;
  }

  /**
   * Get current state
   */
  getState(): DwellState {
    return this.state;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DwellConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set dwell time
   */
  setDwellTime(ms: number): void {
    this.config.dwellTimeMs = Math.max(100, Math.min(3000, ms));
  }
}
