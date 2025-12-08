/**
 * Pose Detector - MediaPipe pose estimation wrapper
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { TRACKING } from '../utils/constants';
import type { PoseLandmarks } from '../state/types';

export interface PoseDetectorConfig {
  /** Minimum confidence for detection (0-1) */
  minDetectionConfidence?: number;
  /** Minimum confidence for tracking (0-1) */
  minTrackingConfidence?: number;
  /** Number of poses to detect (1 for single user) */
  numPoses?: number;
  /** Run on GPU if available */
  useGpu?: boolean;
}

const DEFAULT_CONFIG: Required<PoseDetectorConfig> = {
  minDetectionConfidence: TRACKING.MIN_CONFIDENCE,
  minTrackingConfidence: TRACKING.MIN_CONFIDENCE,
  numPoses: 1,
  useGpu: true,
};

type PoseCallback = (result: PoseLandmarks | null) => void;

export class PoseDetector {
  private poseLandmarker: PoseLandmarker | null = null;
  private config: Required<PoseDetectorConfig>;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private callbacks: Set<PoseCallback> = new Set();

  constructor(config: PoseDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the pose detection model
   */
  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: this.config.useGpu ? 'GPU' : 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: this.config.numPoses,
      minPoseDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });
  }

  /**
   * Start continuous pose detection from video element
   */
  start(videoElement: HTMLVideoElement): void {
    if (!this.poseLandmarker) {
      throw new Error('PoseDetector not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.detectLoop(videoElement);
  }

  /**
   * Stop pose detection
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
   * Subscribe to pose detection results
   */
  onPose(callback: PoseCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.poseLandmarker?.close();
    this.poseLandmarker = null;
    this.callbacks.clear();
  }

  /**
   * Check if detector is ready
   */
  isReady(): boolean {
    return this.poseLandmarker !== null;
  }

  /**
   * Check if detector is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Detect pose in a single video frame (called by TrackingManager)
   */
  detectForVideo(videoElement: HTMLVideoElement, timestamp: number): PoseLandmarks | null {
    if (!this.poseLandmarker) {
      return null;
    }

    try {
      const result = this.poseLandmarker.detectForVideo(videoElement, timestamp);
      return this.processResult(result, timestamp);
    } catch (error) {
      console.error('Pose detection error:', error);
      return null;
    }
  }

  /**
   * Main detection loop
   */
  private detectLoop(videoElement: HTMLVideoElement): void {
    if (!this.isRunning || !this.poseLandmarker) {
      return;
    }

    const startTimeMs = performance.now();

    // Only process new frames
    if (videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = videoElement.currentTime;

      try {
        const result = this.poseLandmarker.detectForVideo(videoElement, startTimeMs);
        const landmarks = this.processResult(result, startTimeMs);
        this.notifyCallbacks(landmarks);
      } catch (error) {
        console.error('Pose detection error:', error);
        this.notifyCallbacks(null);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.detectLoop(videoElement));
  }

  /**
   * Process MediaPipe result into our format
   */
  private processResult(
    result: PoseLandmarkerResult,
    timestamp: number
  ): PoseLandmarks | null {
    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    // Take the first detected pose
    const rawLandmarks = result.landmarks[0];
    const rawWorldLandmarks = result.worldLandmarks?.[0] ?? rawLandmarks;

    // Mirror the X coordinates to match the mirrored video display
    // The video is displayed with transform: scaleX(-1), so we need to flip X
    const landmarks = rawLandmarks.map(lm => ({
      ...lm,
      x: 1 - lm.x, // Mirror X coordinate (0-1 range)
    }));

    const worldLandmarks = rawWorldLandmarks.map(lm => ({
      ...lm,
      x: -lm.x, // Mirror X for world coordinates (centered at 0)
    }));

    return {
      landmarks,
      worldLandmarks,
      timestamp,
    };
  }

  /**
   * Notify all callbacks with new pose data
   */
  private notifyCallbacks(landmarks: PoseLandmarks | null): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(landmarks);
      } catch (error) {
        console.error('Pose callback error:', error);
      }
    });
  }

  /**
   * Perform single detection on an image or video frame
   */
  async detectOnce(
    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): Promise<PoseLandmarks | null> {
    if (!this.poseLandmarker) {
      throw new Error('PoseDetector not initialized');
    }

    const timestamp = performance.now();

    // Switch to IMAGE mode for single detection
    const result = this.poseLandmarker.detect(image);
    return this.processResult(result, timestamp);
  }
}
