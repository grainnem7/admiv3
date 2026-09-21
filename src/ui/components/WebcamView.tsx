/**
 * Webcam View - Video feed with pose overlay
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { CameraManager } from '../../tracking/CameraManager';
import { loadCameraChoice, saveCameraChoice, type CameraChoice } from '../../tracking/cameraChoice';
import { cameraDebugEnabled } from '../../tracking/cameraDebugFlag';
import { CameraPicker } from './camera/CameraPicker';
import { CameraDebugPanel } from './camera/CameraDebugPanel';
import { useColourWatch } from './camera/useColourWatch';
import { PoseDetector } from '../../tracking/PoseDetector';
import { useAppStore } from '../../state/store';
import type { PoseLandmarks } from '../../state/types';

interface WebcamViewProps {
  onPose?: (landmarks: PoseLandmarks | null) => void;
  showOverlay?: boolean;
  trackedLandmark?: number;
}

function WebcamView({ onPose, showOverlay = true, trackedLandmark = 16 }: WebcamViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which camera and size to open. Remembered across sessions, because finding the
  // combination that works is the slow part of setting a workshop up.
  const [choice, setChoice] = useState<CameraChoice>(() => loadCameraChoice());
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const showDebug = cameraDebugEnabled();
  const choiceKey = `${choice.deviceId}|${choice.width}x${choice.height}`;
  // Judged on the pixels the TRACKER reads, not on what the screen shows.
  const { verdict, notice } = useColourWatch(videoEl, choiceKey);

  const setTracking = useAppStore((s) => s.setTracking);
  const setLandmarks = useAppStore((s) => s.setLandmarks);
  const setCameraError = useAppStore((s) => s.setCameraError);

  // Draw pose overlay on canvas
  const drawOverlay = useCallback(
    (landmarks: PoseLandmarks) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Match canvas size to video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Clear previous frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!showOverlay) return;

      // Draw all landmarks as small dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      landmarks.landmarks.forEach((landmark) => {
        if ((landmark.visibility ?? 0) > 0.5) {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Highlight tracked landmark
      const tracked = landmarks.landmarks[trackedLandmark];
      if (tracked && (tracked.visibility ?? 0) > 0.5) {
        const x = tracked.x * canvas.width;
        const y = tracked.y * canvas.height;

        // Outer glow
        ctx.fillStyle = 'rgba(0, 217, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();

        // Inner circle
        ctx.fillStyle = '#00d9ff';
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [showOverlay, trackedLandmark]
  );

  // Handle pose detection results
  const handlePose = useCallback(
    (landmarks: PoseLandmarks | null) => {
      setLandmarks(landmarks);

      if (landmarks) {
        drawOverlay(landmarks);
      }

      onPose?.(landmarks);
    },
    [setLandmarks, drawOverlay, onPose]
  );

  // Initialize camera and pose detector
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check camera support
        if (!(await CameraManager.isSupported())) {
          throw new Error('Camera not supported in this browser');
        }

        // Initialize camera
        const camera = new CameraManager();
        cameraRef.current = camera;

        if (!videoRef.current) return;
        await camera.start(videoRef.current, choice.deviceId || undefined, choice);
        setVideoEl(videoRef.current);

        if (!mounted) {
          camera.stop();
          return;
        }

        // Initialize pose detector
        const detector = new PoseDetector();
        detectorRef.current = detector;
        await detector.initialize();

        if (!mounted) {
          detector.dispose();
          camera.stop();
          return;
        }

        // Subscribe to pose updates
        detector.onPose(handlePose);

        // Start detection
        detector.start(videoRef.current);
        setTracking(true);
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;

        const message = err instanceof Error ? err.message : 'Failed to initialize camera';
        setError(message);
        setCameraError(message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      detectorRef.current?.dispose();
      cameraRef.current?.stop();
      setTracking(false);
    };
  }, [handlePose, setTracking, setCameraError, choice]);

  // Only remember a combination once it has been SEEN to deliver colour: remembering one
  // that handed back a grey picture would serve the same failure up again next session.
  useEffect(() => {
    if (verdict === 'colour') saveCameraChoice(choice);
  }, [verdict, choice]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Camera feed showing your movements"
      />
      <canvas ref={canvasRef} className="video-overlay" aria-hidden="true" />

      <CameraPicker value={choice} onChange={setChoice} notice={notice} disabled={isLoading} />
      {showDebug && <CameraDebugPanel video={videoEl} camera={cameraRef.current} />}

      {isLoading && (
        <div
          className="video-overlay"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
          }}
        >
          <p>Loading camera...</p>
        </div>
      )}

      {error && (
        <div
          className="video-overlay"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>Camera Error</p>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default WebcamView;
