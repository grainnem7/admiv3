/**
 * Face Detector - MediaPipe face landmark detection wrapper
 * Detects 478 face landmarks with optional blendshapes for expression detection
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { TRACKING } from '../utils/constants';
import type { FaceLandmarks, FaceBlendshape } from '../state/types';

export interface FaceDetectorConfig {
  /** Minimum confidence for detection (0-1) */
  minDetectionConfidence?: number;
  /** Minimum confidence for tracking (0-1) */
  minTrackingConfidence?: number;
  /** Number of faces to detect */
  numFaces?: number;
  /** Output blendshapes for expression detection */
  outputBlendshapes?: boolean;
  /** Output face transformation matrix */
  outputTransformMatrix?: boolean;
  /** Run on GPU if available */
  useGpu?: boolean;
}

const DEFAULT_CONFIG: Required<FaceDetectorConfig> = {
  minDetectionConfidence: TRACKING.MIN_CONFIDENCE,
  minTrackingConfidence: TRACKING.MIN_CONFIDENCE,
  numFaces: 1,
  outputBlendshapes: true,
  outputTransformMatrix: false,
  useGpu: true,
};

export interface FaceDetectionResult {
  face: FaceLandmarks | null;
  timestamp: number;
}

type FaceCallback = (result: FaceDetectionResult) => void;

export class FaceDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private config: Required<FaceDetectorConfig>;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastVideoTime: number = -1;
  private callbacks: Set<FaceCallback> = new Set();

  constructor(config: FaceDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the face detection model
   */
  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: this.config.useGpu ? 'GPU' : 'CPU',
      },
      runningMode: 'VIDEO',
      numFaces: this.config.numFaces,
      minFaceDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
      outputFaceBlendshapes: this.config.outputBlendshapes,
      outputFacialTransformationMatrixes: this.config.outputTransformMatrix,
    });
  }

  /**
   * Detect face in a single video frame (called by TrackingManager)
   */
  detectForVideo(videoElement: HTMLVideoElement, timestamp: number): FaceDetectionResult {
    if (!this.faceLandmarker) {
      return { face: null, timestamp };
    }

    try {
      const result = this.faceLandmarker.detectForVideo(videoElement, timestamp);
      return this.processResult(result, timestamp);
    } catch (error) {
      console.error('Face detection error:', error);
      return { face: null, timestamp };
    }
  }

  /**
   * Start continuous face detection from video element
   */
  start(videoElement: HTMLVideoElement): void {
    if (!this.faceLandmarker) {
      throw new Error('FaceDetector not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.detectLoop(videoElement);
  }

  /**
   * Stop face detection
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
   * Subscribe to face detection results
   */
  onFace(callback: FaceCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.faceLandmarker?.close();
    this.faceLandmarker = null;
    this.callbacks.clear();
  }

  /**
   * Check if detector is ready
   */
  isReady(): boolean {
    return this.faceLandmarker !== null;
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
    if (!this.isRunning || !this.faceLandmarker) {
      return;
    }

    const startTimeMs = performance.now();

    // Only process new frames
    if (videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = videoElement.currentTime;

      try {
        const result = this.faceLandmarker.detectForVideo(videoElement, startTimeMs);
        const face = this.processResult(result, startTimeMs);
        this.notifyCallbacks(face);
      } catch (error) {
        console.error('Face detection error:', error);
        this.notifyCallbacks({ face: null, timestamp: startTimeMs });
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.detectLoop(videoElement));
  }

  /**
   * Process MediaPipe result into our format
   */
  private processResult(
    result: FaceLandmarkerResult,
    timestamp: number
  ): FaceDetectionResult {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return { face: null, timestamp };
    }

    // Take the first detected face and mirror X coordinates
    // to match the mirrored video display
    const rawLandmarks = result.faceLandmarks[0];
    const landmarks = rawLandmarks.map(lm => ({
      ...lm,
      x: 1 - lm.x, // Mirror X coordinate (0-1 range)
    }));

    // Extract blendshapes if available
    const blendshapes: FaceBlendshape[] = [];
    if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
      const faceBlendshapes = result.faceBlendshapes[0];
      for (const category of faceBlendshapes.categories) {
        blendshapes.push({
          categoryName: category.categoryName,
          score: category.score,
        });
      }
    }

    // Extract transformation matrix if available
    let transformMatrix: number[] | undefined;
    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      transformMatrix = Array.from(result.facialTransformationMatrixes[0].data);
    }

    const face: FaceLandmarks = {
      landmarks,
      blendshapes,
      transformMatrix,
    };

    return { face, timestamp };
  }

  /**
   * Notify all callbacks with new face data
   */
  private notifyCallbacks(result: FaceDetectionResult): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(result);
      } catch (error) {
        console.error('Face callback error:', error);
      }
    });
  }

  /**
   * Get a specific blendshape value from the last detection
   */
  getBlendshapeValue(face: FaceLandmarks, categoryName: string): number {
    const blendshape = face.blendshapes.find((b) => b.categoryName === categoryName);
    return blendshape?.score ?? 0;
  }
}
