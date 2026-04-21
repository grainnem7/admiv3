/**
 * HarmonicBlendingScreen - Two-voice harmonic blending with color tracking
 *
 * Full-screen performance mode where two color-tracked objects each
 * control an independent musical voice. Designed for Tim: all feedback
 * is sonic. Visual overlay is for the researcher only.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useAppStore, useIsMuted } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { ColorTracker } from '../../tracking/ColorTracker';
import type { ColorBlob } from '../../tracking/ColorTracker';
import {
  getHarmonicBlendingEngine,
  type HarmonicBlendingCalibration,
  type BlendingStatus,
  type VoicePosition,
  type SampleSetDef,
} from '../../harmonicblending/HarmonicBlendingEngine';

// ============================================
// Constants
// ============================================

const CALIBRATION_DURATION_MS = 10_000;
const LEFT_THRESHOLD = 0.30;
const RIGHT_THRESHOLD = 0.70;

// ============================================
// Component
// ============================================

function HarmonicBlendingScreen() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const colorTrackerRef = useRef<ColorTracker | null>(null);
  const engineRef = useRef(getHarmonicBlendingEngine());

  // Latest blob data (written from tracker callback, read in draw loop)
  const blobsRef = useRef<ColorBlob[]>([]);

  // UI state
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [activeSampleSet, setActiveSampleSet] = useState('funky-blues');
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);

  // Live status (updated from draw loop to trigger re-render for status panel)
  const [liveStatus, setLiveStatus] = useState<BlendingStatus>({
    voice1Zone: null, voice2Zone: null,
    voice1FilterHz: 0, voice2FilterHz: 0,
    reverbWet: 0, distance: 1, loadingState: 'idle',
  });
  const statusFrameCount = useRef(0);

  // Which colors have been set
  const [voice1ColorSet, setVoice1ColorSet] = useState(false);
  const [voice2ColorSet, setVoice2ColorSet] = useState(false);

  // Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState<1 | 2>(1);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const calibrationDataRef = useRef<{
    v1: { minX: number; maxX: number; minY: number; maxY: number };
    v2: { minX: number; maxX: number; minY: number; maxY: number };
  } | null>(null);
  const calibrationStepRef = useRef<1 | 2>(1);

  // Color calibration (click-to-select)
  const [colorCalMode, setColorCalMode] = useState<'voice1' | 'voice2' | null>(null);
  const colorCalModeRef = useRef<'voice1' | 'voice2' | null>(null);

  // Store
  const isMuted = useIsMuted();
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // Keep refs in sync
  useEffect(() => { colorCalModeRef.current = colorCalMode; }, [colorCalMode]);
  useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);

  // ---- Initialize camera + color tracker ----
  useEffect(() => {
    let cancelled = false;
    let unsubTracking: (() => void) | null = null;

    const init = async () => {
      try {
        const video = videoRef.current;
        if (!video) throw new Error('Video element not mounted');

        const camera = new CameraManager();
        cameraRef.current = camera;
        await camera.start(video);

        const tracker = new ColorTracker({ frameSkip: 1, smoothing: 0.3 });
        colorTrackerRef.current = tracker;

        // Subscribe to tracking output — this fires every processed frame
        unsubTracking = tracker.onTracking((output) => {
          blobsRef.current = output.blobs;
        });

        // Use the tracker's built-in loop (calls processFrame + notifies callbacks)
        tracker.start(video);

        if (!cancelled) setIsInitialized(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Camera failed');
      }
    };

    init();

    return () => {
      cancelled = true;
      colorTrackerRef.current?.stop();
      colorTrackerRef.current?.dispose();
      cameraRef.current?.stop();
      unsubTracking?.();
    };
  }, []);

  // ---- Sync mute with global ----
  useEffect(() => {
    engineRef.current.setMuted(isMuted || isMutedLocal);
  }, [isMuted, isMutedLocal]);

  // ---- Main draw/update loop ----
  useEffect(() => {
    if (!isInitialized) return;
    let running = true;

    const loop = () => {
      if (!running) return;

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Build positions from latest blob data
          const blobs = blobsRef.current;
          const blob1 = blobs.find((b) => b.colorId === 'voice1');
          const blob2 = blobs.find((b) => b.colorId === 'voice2');

          const p1: VoicePosition = blob1?.found
            ? { x: blob1.x, y: blob1.y, found: true }
            : { x: 0, y: 0, found: false };
          const p2: VoicePosition = blob2?.found
            ? { x: blob2.x, y: blob2.y, found: true }
            : { x: 0, y: 0, found: false };

          // Feed to audio engine
          engineRef.current.setPositions(p1, p2);

          // Accumulate calibration data
          if (calibrationDataRef.current) {
            const step = calibrationStepRef.current;
            const target = step === 1 ? 'v1' : 'v2';
            const pos = step === 1 ? p1 : p2;
            if (pos.found) {
              const d = calibrationDataRef.current[target];
              d.minX = Math.min(d.minX, pos.x);
              d.maxX = Math.max(d.maxX, pos.x);
              d.minY = Math.min(d.minY, pos.y);
              d.maxY = Math.max(d.maxY, pos.y);
            }
          }

          // Get engine status
          const status = engineRef.current.getStatus();

          // Update React state every ~10 frames to avoid excessive re-renders
          statusFrameCount.current++;
          if (statusFrameCount.current % 10 === 0) {
            setLiveStatus(status);
          }

          // Draw overlay
          if (showOverlay) {
            drawOverlay(ctx, canvas.width, canvas.height, p1, p2, status);
          }
        }
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => { running = false; };
  }, [isInitialized, showOverlay]);

  // ---- Handlers ----

  const handleStart = useCallback(async () => {
    try {
      await Tone.start();
      const engine = engineRef.current;
      if (!engine.isActive()) {
        await engine.initialize();
      }
      engine.start();
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio failed');
    }
  }, []);

  const handleStop = useCallback(() => {
    engineRef.current.stop();
    setIsPlaying(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMutedLocal((m) => !m);
  }, []);

  const handleSampleSetChange = useCallback(async (id: string) => {
    setActiveSampleSet(id);
    setIsLoadingSamples(true);
    try {
      await engineRef.current.setActiveSampleSet(id);
    } catch {
      // Engine handles fallback internally
    }
    setIsLoadingSamples(false);
  }, []);

  const handleStartCalibration = useCallback(() => {
    calibrationDataRef.current = {
      v1: { minX: 1, maxX: 0, minY: 1, maxY: 0 },
      v2: { minX: 1, maxX: 0, minY: 1, maxY: 0 },
    };
    setCalibrationStep(1);
    setCalibrationProgress(0);
    setIsCalibrating(true);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / CALIBRATION_DURATION_MS, 1);
      setCalibrationProgress(progress);

      if (progress >= 1) {
        clearInterval(interval);
        setCalibrationStep(2);
        setCalibrationProgress(0);

        const startTime2 = Date.now();
        const interval2 = setInterval(() => {
          const elapsed2 = Date.now() - startTime2;
          const progress2 = Math.min(elapsed2 / CALIBRATION_DURATION_MS, 1);
          setCalibrationProgress(progress2);

          if (progress2 >= 1) {
            clearInterval(interval2);
            if (calibrationDataRef.current) {
              const cal: HarmonicBlendingCalibration = {
                voice1: calibrationDataRef.current.v1,
                voice2: calibrationDataRef.current.v2,
              };
              engineRef.current.setCalibration(cal);
            }
            calibrationDataRef.current = null;
            setIsCalibrating(false);
          }
        }, 100);
      }
    }, 100);
  }, []);

  const handleClearCalibration = useCallback(() => {
    engineRef.current.clearCalibration();
  }, []);

  /**
   * Handle click anywhere in the video area.
   * We put the handler on the container (not the video) so the canvas
   * overlay doesn't block it.
   */
  const handleVideoAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const mode = colorCalModeRef.current;
    if (!mode || !colorTrackerRef.current || !videoRef.current) return;

    // Compute click position relative to the video element
    const videoEl = videoRef.current;
    const rect = videoEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Ignore clicks outside the video bounds
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    colorTrackerRef.current.calibrateFromPixel(videoEl, x, y, mode);

    if (mode === 'voice1') {
      setVoice1ColorSet(true);
      // Auto-advance to voice2
      setColorCalMode('voice2');
    } else {
      setVoice2ColorSet(true);
      setColorCalMode(null);
    }
  }, []);

  const handleBack = useCallback(() => {
    engineRef.current.stop();
    setCurrentScreen('performance');
  }, [setCurrentScreen]);

  // ---- Render ----

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={handleBack} style={styles.btn}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Video + overlay — click handler on container so canvas doesn't block */}
      <div
        style={{
          ...styles.videoContainer,
          cursor: colorCalMode ? 'crosshair' : 'default',
        }}
        onClick={handleVideoAreaClick}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={styles.video}
        />
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Calibration banner */}
        {isCalibrating && (
          <div style={styles.calibrationBanner}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {calibrationStep === 1
                ? 'Move the Voice 1 object to your comfortable edges (left, right, up, down)'
                : 'Now move the Voice 2 object to your comfortable edges'}
            </p>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${calibrationProgress * 100}%` }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              Step {calibrationStep}/2 — {Math.round(calibrationProgress * 100)}%
            </p>
          </div>
        )}

        {/* Color calibration prompt */}
        {colorCalMode && (
          <div style={styles.colorCalBanner}>
            Click on the <strong style={{ margin: '0 4px' }}>
              {colorCalMode === 'voice1' ? 'Voice 1' : 'Voice 2'}
            </strong> colored object in the video
            <button
              onClick={(e) => { e.stopPropagation(); setColorCalMode(null); }}
              style={{ ...styles.btn, marginLeft: 12, fontSize: 11 }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Controls panel */}
      <div style={styles.controlsPanel}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Harmonic Blending</h2>
        </div>

        {/* Transport */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Transport</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isPlaying ? (
              <button onClick={handleStart} style={styles.btnPrimary} disabled={!isInitialized}>
                Start
              </button>
            ) : (
              <button onClick={handleStop} style={styles.btnDanger}>
                Stop
              </button>
            )}
            <button
              onClick={handleToggleMute}
              style={isMutedLocal ? styles.btnActive : styles.btn}
            >
              {isMutedLocal ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </div>

        {/* Color Selection */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Color Selection</h3>
          <p style={styles.hint}>Click a button, then click the coloured object in the video</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setColorCalMode('voice1')}
              style={colorCalMode === 'voice1' ? styles.btnActive : styles.btn}
            >
              {voice1ColorSet ? 'Re-set Voice 1' : 'Set Voice 1 Color'}
            </button>
            <button
              onClick={() => setColorCalMode('voice2')}
              style={colorCalMode === 'voice2' ? styles.btnActive : styles.btn}
            >
              {voice2ColorSet ? 'Re-set Voice 2' : 'Set Voice 2 Color'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#71718a', marginTop: 2 }}>
            <span>V1: {voice1ColorSet ? 'set' : 'not set'}</span>
            <span>V2: {voice2ColorSet ? 'set' : 'not set'}</span>
          </div>
        </div>

        {/* Range Calibration */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Range Calibration</h3>
          <p style={styles.hint}>Maps Tim's movement range to full musical range</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleStartCalibration} style={styles.btn} disabled={isCalibrating}>
              {isCalibrating ? 'Calibrating...' : 'Calibrate Range'}
            </button>
            <button onClick={handleClearCalibration} style={styles.btn}>
              Clear
            </button>
          </div>
        </div>

        {/* Sample Set */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Sound Set</h3>
          <select
            value={activeSampleSet}
            onChange={(e) => handleSampleSetChange(e.target.value)}
            style={styles.select}
            disabled={isLoadingSamples}
          >
            {engineRef.current.getSampleSets().map((s: SampleSetDef) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {isLoadingSamples && (
            <span style={{ fontSize: 11, color: '#f97316' }}>Loading samples...</span>
          )}
        </div>

        {/* Overlay toggle */}
        <div style={styles.section}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
            />
            Show researcher overlay
          </label>
        </div>

        {/* Status readout */}
        {isPlaying && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Status</h3>
            <div style={{ fontSize: 12, color: '#a1a1b8', lineHeight: 1.6, fontFamily: 'monospace' }}>
              <div>Audio: {liveStatus.loadingState}{liveStatus.loadingState === 'error' ? ' (using fallback)' : ''}</div>
              <div>V1 zone: {liveStatus.voice1Zone ?? 'none'}</div>
              <div>V2 zone: {liveStatus.voice2Zone ?? 'none'}</div>
              <div>V1 filter: {Math.round(liveStatus.voice1FilterHz)} Hz</div>
              <div>V2 filter: {Math.round(liveStatus.voice2FilterHz)} Hz</div>
              <div>Reverb wet: {(liveStatus.reverbWet * 100).toFixed(0)}%</div>
              <div>Distance: {liveStatus.distance.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Overlay drawing
// ============================================

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p1: VoicePosition,
  p2: VoicePosition,
  status: BlendingStatus,
): void {
  // Draw three zones
  const leftX = LEFT_THRESHOLD * w;
  const rightX = RIGHT_THRESHOLD * w;

  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#22c55e'; // green - left zone
  ctx.fillRect(0, 0, leftX, h);
  ctx.fillStyle = '#eab308'; // yellow - center zone
  ctx.fillRect(leftX, 0, rightX - leftX, h);
  ctx.fillStyle = '#3b82f6'; // blue - right zone
  ctx.fillRect(rightX, 0, w - rightX, h);
  ctx.globalAlpha = 1;

  // Zone boundary lines
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(leftX, 0); ctx.lineTo(leftX, h);
  ctx.moveTo(rightX, 0); ctx.lineTo(rightX, h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw object markers
  if (p1.found) {
    drawMarker(ctx, p1.x * w, p1.y * h, '#ef4444', 'V1');
  }
  if (p2.found) {
    drawMarker(ctx, p2.x * w, p2.y * h, '#3b82f6', 'V2');
  }

  // Draw distance line between objects
  if (p1.found && p2.found) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x * w, p1.y * h);
    ctx.lineTo(p2.x * w, p2.y * h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Text readout (top-left corner)
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const lines = [
    `V1: ${status.voice1Zone ?? '---'}  filt: ${Math.round(status.voice1FilterHz)}Hz`,
    `V2: ${status.voice2Zone ?? '---'}  filt: ${Math.round(status.voice2FilterHz)}Hz`,
    `Reverb: ${(status.reverbWet * 100).toFixed(0)}%  dist: ${status.distance.toFixed(2)}`,
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, 8, 16 + i * 16);
  });
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(label, x + 20, y + 4);
}

// ============================================
// Styles
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    background: '#0a0a0f',
    color: '#e2e2e8',
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  controlsPanel: {
    width: 280,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    background: '#111118',
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#71718a',
    fontWeight: 600,
  },
  hint: {
    margin: 0,
    fontSize: 11,
    color: '#555570',
  },
  btn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#a1a1b8',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  btnSmall: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: '#71718a',
    cursor: 'pointer',
    fontSize: 11,
  },
  btnPrimary: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#22c55e',
    color: '#000',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  btnDanger: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  btnActive: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid rgba(249,115,22,0.4)',
    background: 'rgba(249,115,22,0.15)',
    color: '#f97316',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  select: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#1a1a24',
    color: '#e2e2e8',
    fontSize: 12,
  },
  errorBox: {
    textAlign: 'center' as const,
    padding: 32,
  },
  calibrationBanner: {
    position: 'absolute' as const,
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    padding: '12px 24px',
    textAlign: 'center' as const,
    minWidth: 320,
    border: '1px solid rgba(249,115,22,0.3)',
  },
  progressBar: {
    height: 4,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 4,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    background: '#f97316',
    borderRadius: 2,
    transition: 'width 100ms linear',
  },
  colorCalBanner: {
    position: 'absolute' as const,
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    color: '#e2e2e8',
    border: '1px solid rgba(59,130,246,0.4)',
    display: 'flex',
    alignItems: 'center',
  },
};

export default HarmonicBlendingScreen;
