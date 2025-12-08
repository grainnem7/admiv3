/**
 * Tracking Manager - Orchestrates all tracking modalities
 * Produces a unified TrackingFrame from pose, hands, and face detection
 */

import { PoseDetector } from './PoseDetector';
import { HandDetector } from './HandDetector';
import { FaceDetector } from './FaceDetector';
import type { TrackingFrame, ActiveModalities, PoseLandmarks } from '../state/types';

export interface TrackingManagerConfig {
  /** Which modalities to initialize */
  modalities?: ActiveModalities;
  /** Use GPU acceleration */
  useGpu?: boolean;
}

const DEFAULT_CONFIG: Required<TrackingManagerConfig> = {
  modalities: {
    pose: true,
    leftHand: false,
    rightHand: false,
    face: false,
  },
  useGpu: true,
};

type TrackingFrameCallback = (frame: TrackingFrame) => void;

export class TrackingManager {
  private poseDetector: PoseDetector | null = null;
  private handDetector: HandDetector | null = null;
  private faceDetector: FaceDetector | null = null;

  private config: Required<TrackingManagerConfig>;
  private activeModalities: ActiveModalities;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private callbacks: Set<TrackingFrameCallback> = new Set();

  // Cached results from each detector
  private lastPose: PoseLandmarks | null = null;

  constructor(config: TrackingManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeModalities = { ...this.config.modalities };
  }

  /**
   * Initialize all required detectors based on active modalities
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // Always initialize pose detector (it's the base)
    this.poseDetector = new PoseDetector({ useGpu: this.config.useGpu });
    initPromises.push(this.poseDetector.initialize());

    // Initialize hand detector if hands are enabled
    if (this.activeModalities.leftHand || this.activeModalities.rightHand) {
      this.handDetector = new HandDetector({ useGpu: this.config.useGpu });
      initPromises.push(this.handDetector.initialize());
    }

    // Initialize face detector if face is enabled
    if (this.activeModalities.face) {
      this.faceDetector = new FaceDetector({ useGpu: this.config.useGpu });
      initPromises.push(this.faceDetector.initialize());
    }

    await Promise.all(initPromises);
  }

  /**
   * Enable or disable modalities dynamically
   */
  async setActiveModalities(modalities: ActiveModalities): Promise<void> {
    const needsHandDetector = modalities.leftHand || modalities.rightHand;
    const hasHandDetector = this.handDetector !== null;

    // Initialize hand detector if newly needed
    if (needsHandDetector && !hasHandDetector) {
      this.handDetector = new HandDetector({ useGpu: this.config.useGpu });
      await this.handDetector.initialize();
    }

    // Initialize face detector if newly needed
    if (modalities.face && !this.faceDetector) {
      this.faceDetector = new FaceDetector({ useGpu: this.config.useGpu });
      await this.faceDetector.initialize();
    }

    this.activeModalities = { ...modalities };
  }

  /**
   * Get current active modalities
   */
  getActiveModalities(): ActiveModalities {
    return { ...this.activeModalities };
  }

  /**
   * Start unified tracking from video element
   */
  start(videoElement: HTMLVideoElement): void {
    if (this.isRunning) {
      return;
    }

    if (!this.poseDetector?.isReady()) {
      throw new Error('TrackingManager not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    this.detectLoop(videoElement);
  }

  /**
   * Stop all tracking
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.lastVideoTime = -1;
  }

  /**
   * Subscribe to unified tracking frame updates
   */
  onFrame(callback: TrackingFrameCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stop();
    this.poseDetector?.dispose();
    this.handDetector?.dispose();
    this.faceDetector?.dispose();
    this.poseDetector = null;
    this.handDetector = null;
    this.faceDetector = null;
    this.callbacks.clear();
  }

  /**
   * Check if manager is ready
   */
  isReady(): boolean {
    return this.poseDetector?.isReady() ?? false;
  }

  /**
   * Check if manager is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Main detection loop - runs all active detectors and merges results
   */
  private detectLoop(videoElement: HTMLVideoElement): void {
    if (!this.isRunning) {
      return;
    }

    const timestamp = performance.now();

    // Only process new frames
    if (videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = videoElement.currentTime;

      // Create unified tracking frame
      const frame = this.detectAll(videoElement, timestamp);
      this.notifyCallbacks(frame);
    }

    this.animationFrameId = requestAnimationFrame(() => this.detectLoop(videoElement));
  }

  /**
   * Run all active detectors and merge into TrackingFrame
   */
  private detectAll(videoElement: HTMLVideoElement, timestamp: number): TrackingFrame {
    const frame: TrackingFrame = {
      pose: null,
      leftHand: null,
      rightHand: null,
      face: null,
      timestamp,
    };

    // Pose detection (always run if enabled)
    if (this.activeModalities.pose && this.poseDetector?.isReady()) {
      try {
        const poseResult = this.poseDetector.detectForVideo(videoElement, timestamp);
        frame.pose = poseResult;
        this.lastPose = poseResult;
      } catch (error) {
        console.error('Pose detection error in TrackingManager:', error);
      }
    }

    // Hand detection
    if ((this.activeModalities.leftHand || this.activeModalities.rightHand) && this.handDetector?.isReady()) {
      try {
        const handResult = this.handDetector.detectForVideo(videoElement, timestamp);
        if (this.activeModalities.leftHand) {
          frame.leftHand = handResult.leftHand;
        }
        if (this.activeModalities.rightHand) {
          frame.rightHand = handResult.rightHand;
        }
      } catch (error) {
        console.error('Hand detection error in TrackingManager:', error);
      }
    }

    // Face detection
    if (this.activeModalities.face && this.faceDetector?.isReady()) {
      try {
        const faceResult = this.faceDetector.detectForVideo(videoElement, timestamp);
        frame.face = faceResult.face;
      } catch (error) {
        console.error('Face detection error in TrackingManager:', error);
      }
    }

    return frame;
  }

  /**
   * Notify all callbacks with new tracking frame
   */
  private notifyCallbacks(frame: TrackingFrame): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(frame);
      } catch (error) {
        console.error('TrackingManager callback error:', error);
      }
    });
  }

  /**
   * Get the last pose result (for backward compatibility)
   */
  getLastPose(): PoseLandmarks | null {
    return this.lastPose;
  }
}

// Singleton instance for easy access
let trackingManagerInstance: TrackingManager | null = null;

export function getTrackingManager(): TrackingManager {
  if (!trackingManagerInstance) {
    trackingManagerInstance = new TrackingManager();
  }
  return trackingManagerInstance;
}

export function resetTrackingManager(): void {
  trackingManagerInstance?.dispose();
  trackingManagerInstance = null;
}
