/**
 * Camera Manager - Handles webcam access and stream management
 */

import { loadCameraChoice } from './cameraChoice';

export { CAMERA_RESOLUTIONS } from './cameraChoice';

export interface CameraConfig {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  frameRate?: number;
}

const DEFAULT_CONFIG: Required<CameraConfig> = {
  width: 640,
  height: 480,
  facingMode: 'user',
  frameRate: 30,
};

/** What the running camera actually delivers (may differ from what was requested). */
export interface CameraTrackInfo {
  label: string;
  deviceId: string;
  width: number;
  height: number;
  frameRate: number;
}


export interface CameraEnv {
  /** True on a phone or tablet, where a front/back camera is a real distinction. */
  mobile: boolean;
}

/** Whether this device has a front and a back camera worth choosing between. */
export function detectCameraEnv(): CameraEnv {
  if (typeof navigator === 'undefined') return { mobile: false };
  const ua = navigator.userAgent ?? '';
  const touch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return { mobile: touch && /Mobi|Android|iPhone|iPad|iPod/i.test(ua) };
}

/**
 * Video constraints for getUserMedia.
 *
 * `facingMode` is asked for ONLY on a phone or tablet. On a desktop there is no
 * user-facing camera to prefer, and a virtual camera (a bridged phone, a capture app)
 * usually advertises no facing direction at all — so the constraint is at best noise and
 * at worst pushes the browser away from the camera the facilitator picked.
 *
 * Sizes stay `ideal`, never `exact`: a camera that cannot do 1080p should hand back what
 * it can rather than failing to open.
 */
export function buildVideoConstraints(
  config: Required<CameraConfig>,
  deviceId?: string,
  env: CameraEnv = detectCameraEnv(),
): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    width: { ideal: config.width },
    height: { ideal: config.height },
    frameRate: { ideal: config.frameRate },
  };
  if (deviceId) return { ...base, deviceId: { exact: deviceId } };
  return env.mobile ? { ...base, facingMode: config.facingMode } : base;
}

/**
 * Whether opening a CHOSEN camera failed in a way that should fall back to the
 * browser default: the camera is gone (unplugged, phone app closed) or can't
 * satisfy the pin. Permission / in-use errors are not retried — they must surface.
 */
export function shouldFallBackToDefault(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'NotFoundError' || name === 'OverconstrainedError';
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private config: Required<CameraConfig>;
  // Bumped by stop(); a start() whose generation is stale was cancelled mid-flight.
  private generation = 0;

  constructor(config: CameraConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Request camera access and start the video stream. Pass `deviceId` to use a
   * specific camera; if that camera can't be found, the browser default is used
   * instead and `fellBack` is true.
   *
   * `size` overrides the requested resolution for this start. It matters more than it
   * looks: a virtual camera can negotiate a different pixel format per resolution and
   * deliver proper colour at one size and a luma-only picture at another, so the size is
   * part of "which camera setup works", not just a quality dial. Left out, the size the
   * facilitator last got working on this device is used.
   */
  async start(
    videoElement: HTMLVideoElement,
    deviceId?: string,
    size: { width: number; height: number } = loadCameraChoice(),
  ): Promise<{ fellBack: boolean }> {
    this.config = { ...this.config, width: size.width, height: size.height };
    this.videoElement = videoElement;
    const generation = this.generation;
    let fellBack = false;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraints(this.config, deviceId),
          audio: false,
        });
      } catch (error) {
        if (!deviceId || !shouldFallBackToDefault(error) || generation !== this.generation) throw error;
        fellBack = true;
        stream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraints(this.config),
          audio: false,
        });
      }
      // stop() ran while permission/device was pending (camera switched, screen
      // left): release this stream instead of attaching it, so it can't leak.
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Camera start cancelled');
      }
      this.stream = stream;
      videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play().then(resolve).catch(reject);
        };
        videoElement.onerror = () => reject(new Error('Video element error'));
      });
      return { fellBack };
    } catch (error) {
      // Only tear down if this start still owns the manager (a cancelled start
      // must not clobber a newer one).
      if (generation === this.generation) this.stop();
      throw this.handleCameraError(error);
    }
  }

  /**
   * Stop the camera stream and release resources
   */
  stop(): void {
    this.generation += 1;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /**
   * Check if camera is currently active
   */
  isActive(): boolean {
    return this.stream !== null && this.stream.active;
  }

  /**
   * Get the current video element
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get actual video dimensions (may differ from requested)
   */
  getDimensions(): { width: number; height: number } {
    if (!this.videoElement) {
      return { width: 0, height: 0 };
    }
    return {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight,
    };
  }

  /** Name and live settings of the running camera track, or null when stopped. */
  getTrackInfo(): CameraTrackInfo | null {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return null;
    const s = track.getSettings();
    return {
      label: track.label,
      deviceId: s.deviceId ?? '',
      width: s.width ?? this.videoElement?.videoWidth ?? 0,
      height: s.height ?? this.videoElement?.videoHeight ?? 0,
      frameRate: s.frameRate ?? 0,
    };
  }

  /**
   * Everything the browser will tell us about the running track.
   *
   * `getSettings()` is what the camera actually negotiated — which for a virtual camera
   * is frequently NOT what was asked for — and `getCapabilities()` is what it says it can
   * do. Neither names the pixel format (no browser exposes that), which is exactly why a
   * luma-only feed has to be diagnosed from the pixels instead. Kept together so the
   * debug panel and any bug report show the same thing.
   */
  getTrackDiagnostics(): { settings: MediaTrackSettings; capabilities: MediaTrackCapabilities | null } | null {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return null;
    let capabilities: MediaTrackCapabilities | null = null;
    try {
      // Not implemented everywhere, and throws on some virtual cameras.
      capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
    } catch {
      capabilities = null;
    }
    return { settings: track.getSettings(), capabilities };
  }

  /**
   * Convert camera error to user-friendly message
   */
  private handleCameraError(error: unknown): Error {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error(
            'Camera access was denied. Please allow camera access in your browser settings to use this instrument.'
          );
        case 'NotFoundError':
          return new Error(
            'No camera found. Please connect a webcam to use this instrument.'
          );
        case 'NotReadableError':
          return new Error(
            'Camera is already in use by another application. Please close other apps using the camera.'
          );
        case 'OverconstrainedError':
          return new Error(
            'Camera does not support the requested settings. Try a different camera.'
          );
        case 'SecurityError':
          return new Error(
            'Camera access blocked for security reasons. Ensure you are using HTTPS.'
          );
        default:
          return new Error(`Camera error: ${error.message}`);
      }
    }
    return error instanceof Error ? error : new Error('Unknown camera error');
  }

  /**
   * Check if camera access is available in this browser
   */
  static async isSupported(): Promise<boolean> {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * List available camera devices
   */
  static async listDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  }
}
