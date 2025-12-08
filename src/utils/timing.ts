/**
 * Timing utilities for performance and event handling
 */

/**
 * Create a debounced version of a function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Create a throttled version of a function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  intervalMs: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= intervalMs) {
      lastCallTime = now;
      fn(...args);
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        fn(...args);
        timeoutId = null;
      }, intervalMs - timeSinceLastCall);
    }
  };
}

/**
 * Frame timer for consistent animation loops
 */
export class FrameTimer {
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private fpsUpdateInterval: number = 500; // Update FPS every 500ms
  private lastFpsUpdate: number = 0;
  private framesSinceLastUpdate: number = 0;

  /**
   * Call at the start of each frame
   * @returns Delta time in seconds since last frame
   */
  tick(timestamp: number): number {
    const deltaTime = this.lastFrameTime === 0 ? 0 : (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    this.frameCount++;
    this.framesSinceLastUpdate++;

    // Update FPS calculation
    if (timestamp - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = (this.framesSinceLastUpdate * 1000) / (timestamp - this.lastFpsUpdate);
      this.lastFpsUpdate = timestamp;
      this.framesSinceLastUpdate = 0;
    }

    return deltaTime;
  }

  /**
   * Get current FPS
   */
  getFps(): number {
    return Math.round(this.fps);
  }

  /**
   * Get total frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Reset timer state
   */
  reset(): void {
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = 0;
    this.framesSinceLastUpdate = 0;
  }
}

/**
 * Simple stopwatch for measuring durations
 */
export class Stopwatch {
  private startTime: number | null = null;
  private pausedTime: number = 0;
  private isPaused: boolean = false;

  start(): void {
    if (this.startTime === null) {
      this.startTime = performance.now();
    } else if (this.isPaused) {
      this.startTime = performance.now() - this.pausedTime;
      this.isPaused = false;
    }
  }

  pause(): void {
    if (this.startTime !== null && !this.isPaused) {
      this.pausedTime = performance.now() - this.startTime;
      this.isPaused = true;
    }
  }

  reset(): void {
    this.startTime = null;
    this.pausedTime = 0;
    this.isPaused = false;
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsed(): number {
    if (this.startTime === null) return 0;
    if (this.isPaused) return this.pausedTime;
    return performance.now() - this.startTime;
  }

  /**
   * Get elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return this.getElapsed() / 1000;
  }
}

/**
 * Rate limiter to ensure a minimum interval between actions
 */
export class RateLimiter {
  private lastActionTime: number = 0;
  private readonly minInterval: number;

  constructor(minIntervalMs: number) {
    this.minInterval = minIntervalMs;
  }

  /**
   * Check if enough time has passed since last action
   */
  canAct(): boolean {
    const now = Date.now();
    return now - this.lastActionTime >= this.minInterval;
  }

  /**
   * Try to perform action, returns true if allowed
   */
  tryAct(): boolean {
    if (this.canAct()) {
      this.lastActionTime = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.lastActionTime = 0;
  }
}
