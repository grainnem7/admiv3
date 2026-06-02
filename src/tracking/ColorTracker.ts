/**
 * ColorTracker - Track colored objects in camera view
 *
 * Provides musical control by tracking colored objects:
 * - Position → pitch/volume/pan
 * - Multiple color zones for different parameters
 * - Click-to-calibrate color selection
 */

import { axisFromMoments, type AxisSegment } from './segmentGeometry';

// ============================================
// Types
// ============================================

export interface TrackedColor {
  /** Color identifier */
  id: string;
  /** Target hue (0-360) */
  hue: number;
  /** Hue tolerance (default: 15) */
  hueTolerance: number;
  /** Minimum saturation (0-100, default: 30) */
  minSaturation: number;
  /** Minimum value/brightness (0-100, default: 30) */
  minValue: number;
  /** Minimum blob area to detect (0-1, default: 0.001) */
  minArea: number;
  /**
   * Optional normalised search box (0-1). When set, only pixels inside it
   * are considered for this colour — used by surface-press to track each
   * tube near its calibrated position, so background regions sharing the
   * tube's hue (a wall, clothing, skin) can't pollute the blob. Omitted →
   * the whole frame is searched (baton behaviour, unchanged).
   */
  searchRegion?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface ColorBlob {
  /** Color ID this blob matches */
  colorId: string;
  /** Center X position (0-1, normalized) */
  x: number;
  /** Center Y position (0-1, normalized) */
  y: number;
  /** Blob area (0-1, relative to frame) */
  area: number;
  /** Whether this blob was found this frame */
  found: boolean;
  /**
   * Normalised y (0 top … 1 bottom) of the LOWEST matched pixel — the
   * blob's bottom edge. Used by SurfacePressMode to detect an object
   * descending to the table. Optional and additive: existing consumers
   * (baton path) ignore it. Undefined when the blob is not found.
   */
  bottomY?: number;
  /**
   * The blob's long-axis line segment in normalised coords (the principal
   * axis of the matched pixels), near end (larger y) first. For an
   * elongated object like a tube this is its full length as a vector —
   * used by SurfacePressMode so a finger can press anywhere along the
   * tube. Optional/additive; undefined when the blob is not found.
   */
  axis?: AxisSegment;
}

export interface ColorTrackingOutput {
  /** All detected color blobs */
  blobs: ColorBlob[];
  /** Primary blob (largest of tracked colors) */
  primaryBlob: ColorBlob | null;
  /** Whether any colors are being tracked */
  isTracking: boolean;
}

export interface ColorTrackerConfig {
  /** Frame skip for performance (process every N frames, default: 2) */
  frameSkip?: number;
  /** Downscale factor for processing (default: 4) */
  downscaleFactor?: number;
  /** Smoothing factor for position (default: 0.3) */
  smoothing?: number;
}

type ColorTrackingCallback = (output: ColorTrackingOutput) => void;

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: Required<ColorTrackerConfig> = {
  frameSkip: 2,
  downscaleFactor: 4,
  smoothing: 0.3,
};

/**
 * No default colors — user must click-to-calibrate from the video feed.
 * Pre-defined colors (red/blue/etc.) cause false positives on skin, hair, and clothing.
 */
const DEFAULT_COLORS: TrackedColor[] = [];

// ============================================
// ColorTracker Class
// ============================================

export class ColorTracker {
  private config: Required<ColorTrackerConfig>;
  private trackedColors: TrackedColor[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private isRunning: boolean = false;
  private frameCount: number = 0;
  private animationFrameId: number | null = null;

  // Smoothed blob positions (centroid, area, bottom edge, and long-axis ends)
  private smoothedBlobs: Map<
    string,
    { x: number; y: number; area: number; bottomY: number; axis: AxisSegment }
  > = new Map();

  // Callbacks
  private callbacks: Set<ColorTrackingCallback> = new Set();

  constructor(config: ColorTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.trackedColors = [...DEFAULT_COLORS];
    this.initCanvas();
  }

  /**
   * Initialize offscreen canvas for processing
   */
  private initCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Add a color to track. Replaces any existing entry with the same id
   * (upsert semantics) — safe to call from per-field update handlers.
   */
  addColor(color: TrackedColor): void {
    // Remove existing color with same ID
    this.trackedColors = this.trackedColors.filter((c) => c.id !== color.id);
    this.trackedColors.push(color);
  }

  /**
   * Remove a tracked color
   */
  removeColor(colorId: string): void {
    this.trackedColors = this.trackedColors.filter((c) => c.id !== colorId);
    this.smoothedBlobs.delete(colorId);
  }

  /**
   * Get all tracked colors
   */
  getTrackedColors(): TrackedColor[] {
    return [...this.trackedColors];
  }

  /** Returns the TrackedColor for the given id, or null if not found */
  getColor(id: string): TrackedColor | null {
    return this.trackedColors.find((c) => c.id === id) ?? null;
  }

  /**
   * Bulk-set the minimum-area threshold on every tracked colour.  Used
   * by the facilitator panel slider so all batons share a coherent
   * sensitivity floor — without this, raising the threshold to reject a
   * background colour clash would require editing each colour
   * individually.  Per-colour overrides are still possible via the
   * per-field UI; this just sets the floor.
   *
   * Value is clamped to a safe range (0.00005 ≈ a handful of pixels,
   * up to 0.05 ≈ 5% of the downscaled frame).
   */
  setMinAreaForAll(value: number): void {
    const clamped = Math.max(0.00005, Math.min(0.05, value));
    for (const color of this.trackedColors) {
      color.minArea = clamped;
    }
  }

  /**
   * Calibrate color from a pixel in the video
   */
  calibrateFromPixel(
    videoElement: HTMLVideoElement,
    x: number,
    y: number,
    colorId: string
  ): TrackedColor | null {
    if (!this.canvas || !this.ctx) return null;

    // Set canvas to full video resolution for accurate sampling
    this.canvas.width = videoElement.videoWidth;
    this.canvas.height = videoElement.videoHeight;

    // Draw current frame
    this.ctx.drawImage(videoElement, 0, 0);

    // Get pixel at click position
    const pixelX = Math.floor(x * videoElement.videoWidth);
    const pixelY = Math.floor(y * videoElement.videoHeight);

    // Sample a small area for better color averaging
    const sampleSize = 5;
    let totalR = 0, totalG = 0, totalB = 0;
    let count = 0;

    for (let dy = -sampleSize; dy <= sampleSize; dy++) {
      for (let dx = -sampleSize; dx <= sampleSize; dx++) {
        const sx = Math.max(0, Math.min(this.canvas.width - 1, pixelX + dx));
        const sy = Math.max(0, Math.min(this.canvas.height - 1, pixelY + dy));

        const imageData = this.ctx.getImageData(sx, sy, 1, 1);
        totalR += imageData.data[0];
        totalG += imageData.data[1];
        totalB += imageData.data[2];
        count++;
      }
    }

    const avgR = totalR / count;
    const avgG = totalG / count;
    const avgB = totalB / count;

    // Convert to HSV
    const hsv = this.rgbToHsv(avgR, avgG, avgB);

    // Orange and red hues (0-40°, 340-360°) overlap heavily with skin tone.
    // Under bright lighting skin saturation can reach 50-55%, so we push the
    // floor much higher and tighten hue tolerance for these ranges.
    const isOrangeAdjacent = hsv.h <= 40 || hsv.h >= 340;
    const hueTol = hsv.s > 60 ? (isOrangeAdjacent ? 9 : 12) : 16;
    const minSatFloor = isOrangeAdjacent ? 62 : 30;
    const minSatScale = isOrangeAdjacent ? 0.78 : 0.6;

    const newColor: TrackedColor = {
      id: colorId,
      hue: hsv.h,
      hueTolerance: hueTol,
      minSaturation: Math.max(minSatFloor, hsv.s * minSatScale),
      minValue: Math.max(30, hsv.v * 0.6),
      // Default minArea lowered from 0.002 to 0.0005 (≈64 px on a 1080p frame
      // downscaled by 4×) so small batons at the edge of a limited movement
      // range still register. Adjustable per colour via the UI sensitivity slider.
      minArea: 0.0005,
    };

    this.addColor(newColor);
    console.log(`[ColorTracker] Calibrated color "${colorId}":`, newColor);

    return newColor;
  }

  /**
   * Start tracking from video element
   */
  start(videoElement: HTMLVideoElement): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.trackLoop(videoElement);
    console.log('[ColorTracker] Started tracking');
  }

  /**
   * Stop tracking
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log('[ColorTracker] Stopped tracking');
  }

  /**
   * Main tracking loop
   */
  private trackLoop(videoElement: HTMLVideoElement): void {
    if (!this.isRunning) return;

    this.frameCount++;

    // Skip frames for performance
    if (this.frameCount % this.config.frameSkip === 0) {
      const output = this.processFrame(videoElement);
      this.notifyCallbacks(output);
    }

    this.animationFrameId = requestAnimationFrame(() => this.trackLoop(videoElement));
  }

  /**
   * Process a single video frame
   */
  processFrame(videoElement: HTMLVideoElement): ColorTrackingOutput {
    if (!this.canvas || !this.ctx) {
      return { blobs: [], primaryBlob: null, isTracking: false };
    }

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) {
      return { blobs: [], primaryBlob: null, isTracking: false };
    }

    // Downscale for faster processing
    const scale = this.config.downscaleFactor;
    const width = Math.floor(videoWidth / scale);
    const height = Math.floor(videoHeight / scale);

    this.canvas.width = width;
    this.canvas.height = height;

    // Draw downscaled frame
    this.ctx.drawImage(videoElement, 0, 0, width, height);

    // Get image data
    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Find blobs for each tracked color
    const blobs: ColorBlob[] = [];

    for (const trackedColor of this.trackedColors) {
      const blob = this.findColorBlob(data, width, height, trackedColor);
      blobs.push(blob);
    }

    // Find primary blob (largest found)
    let primaryBlob: ColorBlob | null = null;
    for (const blob of blobs) {
      if (blob.found && (!primaryBlob || blob.area > primaryBlob.area)) {
        primaryBlob = blob;
      }
    }

    return {
      blobs,
      primaryBlob,
      isTracking: this.isRunning,
    };
  }

  /**
   * Find blob of a specific color in image data
   */
  private findColorBlob(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    color: TrackedColor
  ): ColorBlob {
    let totalX = 0;
    let totalY = 0;
    let totalXX = 0;           // pixel-space second moments, for the long axis
    let totalYY = 0;
    let totalXY = 0;
    let maxYpx = -1;            // lowest matched pixel row (bottom edge)
    let matchingPixels = 0;

    const totalPixels = width * height;

    // Optional search box (normalised → pixel bounds). Restricting the scan to
    // where a tube actually sits keeps same-hue background out of the blob.
    const sr = color.searchRegion;
    const x0 = sr ? Math.max(0, Math.floor(sr.minX * width)) : 0;
    const x1 = sr ? Math.min(width, Math.ceil(sr.maxX * width)) : width;
    const y0 = sr ? Math.max(0, Math.floor(sr.minY * height)) : 0;
    const y1 = sr ? Math.min(height, Math.ceil(sr.maxY * height)) : height;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Convert to HSV
        const hsv = this.rgbToHsv(r, g, b);

        // Check if pixel matches target color
        if (this.matchesColor(hsv, color)) {
          totalX += x;
          totalY += y;
          totalXX += x * x;
          totalYY += y * y;
          totalXY += x * y;
          if (y > maxYpx) maxYpx = y;
          matchingPixels++;
        }
      }
    }

    const area = matchingPixels / totalPixels;

    // Check minimum area threshold
    if (matchingPixels === 0 || area < color.minArea) {
      // Apply smoothing to last position
      const smoothed = this.smoothedBlobs.get(color.id);
      if (smoothed) {
        // Decay towards no detection
        const alpha = 0.9;
        smoothed.area *= alpha;
        if (smoothed.area < 0.0001) {
          return { colorId: color.id, x: 0.5, y: 0.5, area: 0, found: false };
        }
        return { colorId: color.id, x: smoothed.x, y: smoothed.y, area: smoothed.area, found: false, bottomY: smoothed.bottomY, axis: smoothed.axis };
      }
      return { colorId: color.id, x: 0.5, y: 0.5, area: 0, found: false };
    }

    // Calculate centroid
    const rawX = totalX / matchingPixels / width;
    const rawY = totalY / matchingPixels / height;
    const rawBottomY = maxYpx / height;

    // Long-axis segment from the matched pixels' moments, in normalised
    // space (x/width, y/height) so it lives in the same 0..1 frame as the
    // fingertip coordinates the detector compares against.
    const rawAxis = axisFromMoments(
      totalX / width,
      totalY / height,
      totalXX / (width * width),
      totalYY / (height * height),
      totalXY / (width * height),
      matchingPixels,
    );

    // Apply smoothing
    const alpha = this.config.smoothing;
    const prev = this.smoothedBlobs.get(color.id);

    let smoothedX = rawX;
    let smoothedY = rawY;
    let smoothedArea = area;
    let smoothedBottomY = rawBottomY;
    let smoothedAxis = rawAxis;

    if (prev) {
      smoothedX = alpha * prev.x + (1 - alpha) * rawX;
      smoothedY = alpha * prev.y + (1 - alpha) * rawY;
      smoothedArea = alpha * prev.area + (1 - alpha) * area;
      smoothedBottomY = alpha * prev.bottomY + (1 - alpha) * rawBottomY;
      smoothedAxis = {
        ax: alpha * prev.axis.ax + (1 - alpha) * rawAxis.ax,
        ay: alpha * prev.axis.ay + (1 - alpha) * rawAxis.ay,
        bx: alpha * prev.axis.bx + (1 - alpha) * rawAxis.bx,
        by: alpha * prev.axis.by + (1 - alpha) * rawAxis.by,
      };
    }

    this.smoothedBlobs.set(color.id, { x: smoothedX, y: smoothedY, area: smoothedArea, bottomY: smoothedBottomY, axis: smoothedAxis });

    return {
      colorId: color.id,
      x: smoothedX,
      y: smoothedY,
      area: smoothedArea,
      found: true,
      bottomY: smoothedBottomY,
      axis: smoothedAxis,
    };
  }

  /**
   * Check if HSV values match a tracked color
   */
  private matchesColor(hsv: { h: number; s: number; v: number }, color: TrackedColor): boolean {
    // Check saturation and value thresholds
    if (hsv.s < color.minSaturation || hsv.v < color.minValue) {
      return false;
    }

    // Skin tone exclusion for orange/red-adjacent tracked colors.
    // When the target hue is in the orange range, additionally reject any
    // pixel whose hue lands in the skin-tone band AND whose saturation is
    // below 60 — vivid orange objects stay well above this even under
    // bright overhead lighting; skin does not.
    if (color.hue <= 40 || color.hue >= 340) {
      const ph = hsv.h;
      if ((ph <= 32 || ph >= 345) && hsv.s < 60) return false;
    }

    // Check hue with wrap-around handling
    let hueDiff = Math.abs(hsv.h - color.hue);
    if (hueDiff > 180) {
      hueDiff = 360 - hueDiff;
    }

    return hueDiff <= color.hueTolerance;
  }

  /**
   * Convert RGB to HSV
   */
  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    const s = max === 0 ? 0 : (diff / max) * 100;
    const v = max * 100;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = ((g - b) / diff) % 6;
          break;
        case g:
          h = (b - r) / diff + 2;
          break;
        case b:
          h = (r - g) / diff + 4;
          break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    return { h, s, v };
  }

  /**
   * Subscribe to tracking updates
   */
  onTracking(callback: ColorTrackingCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notify all callbacks
   */
  private notifyCallbacks(output: ColorTrackingOutput): void {
    for (const callback of this.callbacks) {
      try {
        callback(output);
      } catch (error) {
        console.error('[ColorTracker] Callback error:', error);
      }
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ColorTrackerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset to default colors
   */
  resetColors(): void {
    this.trackedColors = [...DEFAULT_COLORS];
    this.smoothedBlobs.clear();
  }

  /**
   * Check if currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    this.callbacks.clear();
    this.smoothedBlobs.clear();
    this.canvas = null;
    this.ctx = null;
  }
}

// ============================================
// Singleton Instance
// ============================================

let colorTrackerInstance: ColorTracker | null = null;

export function getColorTracker(): ColorTracker {
  if (!colorTrackerInstance) {
    colorTrackerInstance = new ColorTracker();
  }
  return colorTrackerInstance;
}

export function resetColorTracker(): void {
  colorTrackerInstance?.dispose();
  colorTrackerInstance = null;
}
