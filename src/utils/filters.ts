/**
 * Signal filtering utilities for smoothing pose data
 */

import type { Point2D, Point3D } from './math';

/**
 * Exponential Moving Average filter for smoothing single values
 */
export class ExponentialFilter {
  private value: number | null = null;
  private readonly alpha: number;

  /**
   * @param alpha Smoothing factor (0-1). Lower = more smoothing, higher = more responsive
   */
  constructor(alpha: number = 0.3) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  /**
   * Apply filter to new sample
   */
  filter(sample: number): number {
    if (this.value === null) {
      this.value = sample;
    } else {
      this.value = this.alpha * sample + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  /**
   * Reset filter state
   */
  reset(): void {
    this.value = null;
  }

  /**
   * Get current filtered value
   */
  getValue(): number | null {
    return this.value;
  }
}

/**
 * Exponential filter for 2D points
 */
export class ExponentialFilter2D {
  private readonly xFilter: ExponentialFilter;
  private readonly yFilter: ExponentialFilter;

  constructor(alpha: number = 0.3) {
    this.xFilter = new ExponentialFilter(alpha);
    this.yFilter = new ExponentialFilter(alpha);
  }

  filter(point: Point2D): Point2D {
    return {
      x: this.xFilter.filter(point.x),
      y: this.yFilter.filter(point.y),
    };
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
  }
}

/**
 * Exponential filter for 3D points
 */
export class ExponentialFilter3D {
  private readonly xFilter: ExponentialFilter;
  private readonly yFilter: ExponentialFilter;
  private readonly zFilter: ExponentialFilter;

  constructor(alpha: number = 0.3) {
    this.xFilter = new ExponentialFilter(alpha);
    this.yFilter = new ExponentialFilter(alpha);
    this.zFilter = new ExponentialFilter(alpha);
  }

  filter(point: Point3D): Point3D {
    return {
      x: this.xFilter.filter(point.x),
      y: this.yFilter.filter(point.y),
      z: this.zFilter.filter(point.z),
    };
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }
}

/**
 * Moving average filter using a sliding window
 */
export class MovingAverageFilter {
  private readonly windowSize: number;
  private readonly buffer: number[] = [];

  constructor(windowSize: number = 5) {
    this.windowSize = Math.max(1, windowSize);
  }

  filter(sample: number): number {
    this.buffer.push(sample);
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }
    return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

/**
 * One Euro Filter - adaptive low-pass filter that reduces jitter while maintaining responsiveness
 * Based on: https://cristal.univ-lille.fr/~casiez/1euro/
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private xFilter: ExponentialFilter;
  private dxFilter: ExponentialFilter;
  private lastTime: number | null = null;
  private lastValue: number | null = null;

  /**
   * @param minCutoff Minimum cutoff frequency (higher = less smoothing at rest)
   * @param beta Speed coefficient (higher = less lag during fast movement)
   * @param dCutoff Derivative cutoff frequency
   */
  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.xFilter = new ExponentialFilter(this.computeAlpha(minCutoff, 1 / 60));
    this.dxFilter = new ExponentialFilter(this.computeAlpha(dCutoff, 1 / 60));
  }

  private computeAlpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp: number): number {
    if (this.lastTime === null || this.lastValue === null) {
      this.lastTime = timestamp;
      this.lastValue = value;
      return value;
    }

    const dt = Math.max((timestamp - this.lastTime) / 1000, 1e-6);
    this.lastTime = timestamp;

    // Estimate derivative
    const dx = (value - this.lastValue) / dt;
    const edx = this.dxFilter.filter(dx);

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Update filter alpha
    this.xFilter = new ExponentialFilter(this.computeAlpha(cutoff, dt));

    const filtered = this.xFilter.filter(value);
    this.lastValue = filtered;

    return filtered;
  }

  reset(): void {
    this.lastTime = null;
    this.lastValue = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

/**
 * Median filter for removing outliers
 */
export class MedianFilter {
  private readonly windowSize: number;
  private readonly buffer: number[] = [];

  constructor(windowSize: number = 5) {
    this.windowSize = Math.max(1, windowSize);
  }

  filter(sample: number): number {
    this.buffer.push(sample);
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }

    const sorted = [...this.buffer].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  reset(): void {
    this.buffer.length = 0;
  }
}
