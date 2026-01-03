/**
 * DeviceMotionTracker - Accelerometer/Gyroscope input tracking
 *
 * Provides musical control through device motion:
 * - Tilt (alpha/beta/gamma) → Various parameters
 * - Shake detection → Triggers
 * - Rotation → Pan/modulation
 */

// ============================================
// Types
// ============================================

export interface MotionOutput {
  /** Device tilt forward/back (-1 to 1, negative = tilted toward user) */
  tiltX: number;
  /** Device tilt left/right (-1 to 1, negative = tilted left) */
  tiltY: number;
  /** Device rotation/compass heading (0-1) */
  rotation: number;
  /** Acceleration magnitude (0-1, movement intensity) */
  acceleration: number;
  /** Whether a shake was detected this frame */
  shakeDetected: boolean;
  /** Current shake intensity (0-1) */
  shakeIntensity: number;
  /** Whether motion tracking is available */
  isAvailable: boolean;
  /** Whether motion tracking has permission */
  hasPermission: boolean;
}

export interface DeviceMotionConfig {
  /** Shake detection threshold (default: 15) */
  shakeThreshold?: number;
  /** Shake cooldown in ms (default: 500) */
  shakeCooldown?: number;
  /** Smoothing factor (0-1, default: 0.2) */
  smoothing?: number;
  /** Tilt sensitivity multiplier (default: 1.0) */
  tiltSensitivity?: number;
  /** Max tilt angle in degrees (default: 45) */
  maxTiltAngle?: number;
}

type MotionCallback = (output: MotionOutput) => void;

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Required<DeviceMotionConfig> = {
  shakeThreshold: 15,
  shakeCooldown: 500,
  smoothing: 0.2,
  tiltSensitivity: 1.0,
  maxTiltAngle: 45,
};

// ============================================
// DeviceMotionTracker Class
// ============================================

export class DeviceMotionTracker {
  private config: Required<DeviceMotionConfig>;
  private isTracking: boolean = false;
  private hasPermission: boolean = false;
  private isSupported: boolean = false;

  // Smoothed values
  private smoothedTiltX: number = 0;
  private smoothedTiltY: number = 0;
  private smoothedRotation: number = 0;
  private smoothedAcceleration: number = 0;

  // Shake detection
  private lastShakeTime: number = 0;
  private accelerationHistory: number[] = [];
  private maxHistoryLength: number = 10;

  // Callbacks
  private callbacks: Set<MotionCallback> = new Set();

  // Bound handlers for event listeners
  private boundMotionHandler: (event: DeviceMotionEvent) => void;
  private boundOrientationHandler: (event: DeviceOrientationEvent) => void;

  constructor(config: DeviceMotionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.boundMotionHandler = this.handleMotion.bind(this);
    this.boundOrientationHandler = this.handleOrientation.bind(this);
    this.checkSupport();
  }

  /**
   * Check if device motion is supported
   */
  private checkSupport(): void {
    this.isSupported =
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceOrientationEvent !== 'undefined';
  }

  /**
   * Request permission for device motion (required on iOS 13+)
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('[DeviceMotionTracker] Device motion not supported');
      return false;
    }

    // Check if we need to request permission (iOS 13+)
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function'
    ) {
      try {
        const permissionState = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        this.hasPermission = permissionState === 'granted';
      } catch (error) {
        console.error('[DeviceMotionTracker] Permission request failed:', error);
        this.hasPermission = false;
      }
    } else {
      // No permission API, assume granted (non-iOS or older iOS)
      this.hasPermission = true;
    }

    return this.hasPermission;
  }

  /**
   * Start tracking device motion
   */
  async start(): Promise<boolean> {
    if (this.isTracking) {
      return true;
    }

    if (!this.isSupported) {
      console.warn('[DeviceMotionTracker] Device motion not supported');
      return false;
    }

    if (!this.hasPermission) {
      const granted = await this.requestPermission();
      if (!granted) {
        return false;
      }
    }

    window.addEventListener('devicemotion', this.boundMotionHandler);
    window.addEventListener('deviceorientation', this.boundOrientationHandler);

    this.isTracking = true;
    console.log('[DeviceMotionTracker] Started tracking');
    return true;
  }

  /**
   * Stop tracking device motion
   */
  stop(): void {
    if (!this.isTracking) {
      return;
    }

    window.removeEventListener('devicemotion', this.boundMotionHandler);
    window.removeEventListener('deviceorientation', this.boundOrientationHandler);

    this.isTracking = false;
    console.log('[DeviceMotionTracker] Stopped tracking');
  }

  /**
   * Handle device motion events
   */
  private handleMotion(event: DeviceMotionEvent): void {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;

    const { x, y, z } = acceleration;
    if (x === null || y === null || z === null) return;

    // Calculate acceleration magnitude
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    // Track acceleration history for shake detection
    this.accelerationHistory.push(magnitude);
    if (this.accelerationHistory.length > this.maxHistoryLength) {
      this.accelerationHistory.shift();
    }

    // Detect shake
    const now = Date.now();
    const shakeDetected = this.detectShake(magnitude, now);
    const shakeIntensity = this.calculateShakeIntensity();

    // Normalize acceleration (subtract gravity ~9.8)
    const normalizedAccel = Math.abs(magnitude - 9.8) / 10;

    // Apply smoothing
    const alpha = this.config.smoothing;
    this.smoothedAcceleration = alpha * this.smoothedAcceleration + (1 - alpha) * normalizedAccel;

    // Build output
    const output = this.buildOutput(shakeDetected, shakeIntensity);
    this.notifyCallbacks(output);
  }

  /**
   * Handle device orientation events
   */
  private handleOrientation(event: DeviceOrientationEvent): void {
    const { alpha, beta, gamma } = event;

    // Convert orientation to normalized values
    const maxAngle = this.config.maxTiltAngle;
    const sensitivity = this.config.tiltSensitivity;

    // Beta: front/back tilt (-180 to 180, 0 = flat)
    if (beta !== null) {
      const normalizedBeta = Math.max(-1, Math.min(1, (beta * sensitivity) / maxAngle));
      const alpha = this.config.smoothing;
      this.smoothedTiltX = alpha * this.smoothedTiltX + (1 - alpha) * normalizedBeta;
    }

    // Gamma: left/right tilt (-90 to 90, 0 = flat)
    if (gamma !== null) {
      const normalizedGamma = Math.max(-1, Math.min(1, (gamma * sensitivity) / maxAngle));
      const alpha = this.config.smoothing;
      this.smoothedTiltY = alpha * this.smoothedTiltY + (1 - alpha) * normalizedGamma;
    }

    // Alpha: compass heading (0-360)
    if (alpha !== null) {
      const normalizedAlpha = alpha / 360;
      const a = this.config.smoothing;
      this.smoothedRotation = a * this.smoothedRotation + (1 - a) * normalizedAlpha;
    }
  }

  /**
   * Detect if a shake occurred
   */
  private detectShake(magnitude: number, timestamp: number): boolean {
    // Check if magnitude exceeds threshold
    if (magnitude < this.config.shakeThreshold) {
      return false;
    }

    // Check cooldown
    if (timestamp - this.lastShakeTime < this.config.shakeCooldown) {
      return false;
    }

    this.lastShakeTime = timestamp;
    return true;
  }

  /**
   * Calculate current shake intensity from recent acceleration
   */
  private calculateShakeIntensity(): number {
    if (this.accelerationHistory.length < 3) {
      return 0;
    }

    // Calculate variance of acceleration
    const avg = this.accelerationHistory.reduce((a, b) => a + b, 0) / this.accelerationHistory.length;
    const variance = this.accelerationHistory.reduce(
      (sum, val) => sum + Math.pow(val - avg, 2),
      0
    ) / this.accelerationHistory.length;

    // Normalize variance to 0-1
    return Math.min(1, Math.sqrt(variance) / 10);
  }

  /**
   * Build output object
   */
  private buildOutput(shakeDetected: boolean, shakeIntensity: number): MotionOutput {
    return {
      tiltX: this.smoothedTiltX,
      tiltY: this.smoothedTiltY,
      rotation: this.smoothedRotation,
      acceleration: Math.min(1, this.smoothedAcceleration),
      shakeDetected,
      shakeIntensity,
      isAvailable: this.isSupported,
      hasPermission: this.hasPermission,
    };
  }

  /**
   * Subscribe to motion updates
   */
  onMotion(callback: MotionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(output: MotionOutput): void {
    for (const callback of this.callbacks) {
      try {
        callback(output);
      } catch (error) {
        console.error('[DeviceMotionTracker] Callback error:', error);
      }
    }
  }

  /**
   * Get current output (polling mode)
   */
  getCurrentOutput(): MotionOutput {
    return this.buildOutput(false, this.calculateShakeIntensity());
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DeviceMotionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if motion tracking is available
   */
  isAvailable(): boolean {
    return this.isSupported;
  }

  /**
   * Check if currently tracking
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.smoothedTiltX = 0;
    this.smoothedTiltY = 0;
    this.smoothedRotation = 0;
    this.smoothedAcceleration = 0;
    this.accelerationHistory = [];
    this.lastShakeTime = 0;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    this.callbacks.clear();
    this.reset();
  }
}

// ============================================
// Singleton Instance
// ============================================

let deviceMotionInstance: DeviceMotionTracker | null = null;

export function getDeviceMotionTracker(): DeviceMotionTracker {
  if (!deviceMotionInstance) {
    deviceMotionInstance = new DeviceMotionTracker();
  }
  return deviceMotionInstance;
}

export function resetDeviceMotionTracker(): void {
  deviceMotionInstance?.dispose();
  deviceMotionInstance = null;
}
