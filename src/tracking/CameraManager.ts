/**
 * Camera Manager - Handles webcam access and stream management
 */

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

/**
 * Camera auto-adjust capabilities (Image-Capture extensions, not in lib.dom's
 * MediaTrackCapabilities). Each is the list of modes the camera supports.
 */
interface AdjustCapabilities {
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  focusMode?: string[];
}

/** One advanced constraint that pins a camera auto-adjust mode to 'manual'. */
export interface ManualLockConstraint {
  exposureMode?: 'manual';
  whiteBalanceMode?: 'manual';
  focusMode?: 'manual';
}

/**
 * Build the "stop auto-adjusting" advanced constraints for a camera from its
 * reported capabilities — one entry per mode that offers 'manual'. Locking
 * exposure / white-balance / focus stops the image from flashing and hunting,
 * which is what makes hue/brightness colour detection stable. Best-effort:
 * cameras that don't report a mode (or don't offer 'manual') are simply skipped,
 * so the returned list may be empty.
 */
export function manualLockConstraints(
  caps: AdjustCapabilities | null | undefined,
): ManualLockConstraint[] {
  const out: ManualLockConstraint[] = [];
  if (!caps) return out;
  if (caps.exposureMode?.includes('manual')) out.push({ exposureMode: 'manual' });
  if (caps.whiteBalanceMode?.includes('manual')) out.push({ whiteBalanceMode: 'manual' });
  if (caps.focusMode?.includes('manual')) out.push({ focusMode: 'manual' });
  return out;
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private config: Required<CameraConfig>;

  constructor(config: CameraConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Request camera access and start the video stream
   */
  async start(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          facingMode: this.config.facingMode,
          frameRate: { ideal: this.config.frameRate },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play().then(resolve).catch(reject);
        };
        videoElement.onerror = () => reject(new Error('Video element error'));
      });

      // Stop the camera auto-adjusting once it's streaming, so the image stops
      // flashing and colour detection stays stable. Best-effort; never fatal.
      await this.lockAutoAdjust();
    } catch (error) {
      this.stop();
      throw this.handleCameraError(error);
    }
  }

  /**
   * Best-effort: stop the camera auto-adjusting (exposure / white-balance /
   * focus) so the image doesn't flash and hunt — the thing that destabilises
   * hue/brightness colour detection. Silently no-ops on cameras/browsers that
   * don't support manual locks (Firefox, many built-in webcams). Calibrate
   * colours AFTER this so the calibrated hue matches the now-stable image.
   */
  private async lockAutoAdjust(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') return;
    try {
      const caps = track.getCapabilities() as MediaTrackCapabilities & AdjustCapabilities;
      const advanced = manualLockConstraints(caps);
      if (advanced.length > 0) {
        await track.applyConstraints({ advanced } as unknown as MediaTrackConstraints);
      }
    } catch {
      /* best-effort — camera may not support manual locks */
    }
  }

  /**
   * Stop the camera stream and release resources
   */
  stop(): void {
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
