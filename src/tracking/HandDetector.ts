/**
 * Hand Detector - MediaPipe hand landmark detection wrapper
 * Detects 21 landmarks per hand with finger tracking
 */

import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { TRACKING } from '../utils/constants';
import type { HandLandmarks } from '../state/types';

export interface HandDetectorConfig {
  /** Minimum confidence for detection (0-1) */
  minDetectionConfidence?: number;
  /** Minimum confidence for tracking (0-1) */
  minTrackingConfidence?: number;
  /** Maximum number of hands to detect */
  numHands?: number;
  /** Run on GPU if available */
  useGpu?: boolean;
}

const DEFAULT_CONFIG: Required<HandDetectorConfig> = {
  minDetectionConfidence: TRACKING.MIN_CONFIDENCE,
  minTrackingConfidence: TRACKING.MIN_CONFIDENCE,
  numHands: 2,
  useGpu: true,
};

export interface HandDetectionResult {
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
  timestamp: number;
}

type HandCallback = (result: HandDetectionResult) => void;

export class HandDetector {
  private handLandmarker: HandLandmarker | null = null;
  private config: Required<HandDetectorConfig>;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private callbacks: Set<HandCallback> = new Set();

  constructor(config: HandDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the hand detection model
   */
  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: this.config.useGpu ? 'GPU' : 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: this.config.numHands,
      minHandDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
    });
  }

  /**
   * Detect hands in a single video frame (called by TrackingManager)
   */
  detectForVideo(videoElement: HTMLVideoElement, timestamp: number): HandDetectionResult {
    if (!this.handLandmarker) {
      return { leftHand: null, rightHand: null, timestamp };
    }

    try {
      const result = this.handLandmarker.detectForVideo(videoElement, timestamp);
      return this.processResult(result, timestamp);
    } catch (error) {
      console.error('Hand detection error:', error);
      return { leftHand: null, rightHand: null, timestamp };
    }
  }

  /**
   * Start continuous hand detection from video element
   */
  start(videoElement: HTMLVideoElement): void {
    if (!this.handLandmarker) {
      throw new Error('HandDetector not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.detectLoop(videoElement);
  }

  /**
   * Stop hand detection
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
   * Subscribe to hand detection results
   */
  onHands(callback: HandCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.callbacks.clear();
  }

  /**
   * Check if detector is ready
   */
  isReady(): boolean {
    return this.handLandmarker !== null;
  }

  /**
   * Check if detector is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Main detection loop
   */
  private detectLoop(videoElement: HTMLVideoElement): void {
    if (!this.isRunning || !this.handLandmarker) {
      return;
    }

    const startTimeMs = performance.now();

    // Only process new frames
    if (videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = videoElement.currentTime;

      try {
        const result = this.handLandmarker.detectForVideo(videoElement, startTimeMs);
        const hands = this.processResult(result, startTimeMs);
        this.notifyCallbacks(hands);
      } catch (error) {
        console.error('Hand detection error:', error);
        this.notifyCallbacks({ leftHand: null, rightHand: null, timestamp: startTimeMs });
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.detectLoop(videoElement));
  }

  /**
   * Process MediaPipe result into our format
   */
  private processResult(
    result: HandLandmarkerResult,
    timestamp: number
  ): HandDetectionResult {
    let leftHand: HandLandmarks | null = null;
    let rightHand: HandLandmarks | null = null;

    if (result.landmarks && result.landmarks.length > 0) {
      for (let i = 0; i < result.landmarks.length; i++) {
        const rawLandmarks = result.landmarks[i];
        const rawWorldLandmarks = result.worldLandmarks?.[i] ?? rawLandmarks;
        const handedness = result.handednesses?.[i]?.[0];

        if (!handedness) continue;

        // Mirror the X coordinates to match the mirrored video display
        const landmarks = rawLandmarks.map(lm => ({
          ...lm,
          x: 1 - lm.x, // Mirror X coordinate (0-1 range)
        }));

        const worldLandmarks = rawWorldLandmarks.map(lm => ({
          ...lm,
          x: -lm.x, // Mirror X for world coordinates (centered at 0)
        }));

        const handData: HandLandmarks = {
          landmarks,
          worldLandmarks,
          handedness: handedness.categoryName as 'Left' | 'Right',
          confidence: handedness.score,
        };

        // Note: MediaPipe reports handedness from the camera's perspective
        // So 'Left' from camera = user's right hand (mirrored view)
        if (handedness.categoryName === 'Left') {
          rightHand = handData; // User's right hand
        } else {
          leftHand = handData; // User's left hand
        }
      }
    }

    return { leftHand, rightHand, timestamp };
  }

  /**
   * Notify all callbacks with new hand data
   */
  private notifyCallbacks(hands: HandDetectionResult): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(hands);
      } catch (error) {
        console.error('Hand callback error:', error);
      }
    });
  }
}
