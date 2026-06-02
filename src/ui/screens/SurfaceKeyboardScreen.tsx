/**
 * SurfaceKeyboardScreen — standalone "tubes as a keyboard" mode.
 *
 * Play coloured tubes on a table as a free pentatonic keyboard: press a tube
 * (index finger touching it + its colour occluded) and its note sounds
 * immediately. No backing song, no chord lock, no beat grid.
 *
 * Reuses the surface-press detection stack (ColorTracker tube axes,
 * HandDetector index fingertip, SurfacePressMode two-cue contact) and the
 * SHARED surface-press calibration (same SurfacePressConfig storage as the
 * in-song surface press). Audio goes through SurfaceKeyboardEngine (sampled
 * voices + master chain) — the UI never touches Tone directly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { ColorTracker } from '../../tracking/ColorTracker';
import type { ColorBlob } from '../../tracking/ColorTracker';
import { HandDetector, type HandDetectionResult } from '../../tracking/HandDetector';
import { indexFingertip } from '../../tracking/handPressPoint';
import {
  SurfacePressMode,
  type SurfaceKeyFrame,
  type FingerPoint,
} from '../../tracking/SurfacePressMode';
import { getInputProfileManager } from '../../profiles/InputProfileManager';
import type { SurfacePressStored } from '../../profiles/SurfacePressConfig';
import { SurfaceKeyboardEngine } from '../../songs/SurfaceKeyboardEngine';
import { INSTRUMENT_PALETTE_LIST } from '../../songs/voices/presets/instrumentPalette';
import { midiToNoteName } from '../../mapping/events';

const SURFACE_DEFAULT_INSTRUMENT = 'piano';
const SURFACE_SEARCH_HALF_W = 0.15;
const SURFACE_SEARCH_UP = 0.22;

// Base-note choices for the pentatonic keyboard (C across a few octaves).
const BASE_NOTE_OPTIONS = [
  { midi: 48, label: 'C3 (low)' },
  { midi: 60, label: 'C4 (mid)' },
  { midi: 72, label: 'C5 (high)' },
];

function SurfaceKeyboardScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // ---- Refs ----
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const colorTrackerRef = useRef<ColorTracker | null>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const handsRef = useRef<HandDetectionResult | null>(null);
  const blobsRef = useRef<ColorBlob[]>([]);
  const pressModeRef = useRef<SurfacePressMode | null>(null);
  const engineRef = useRef(new SurfaceKeyboardEngine());
  const pressedRef = useRef<Set<string>>(new Set());

  // Shared surface-press calibration (same store as the in-song mode).
  const configRef = useRef<SurfacePressStored | null>(
    getInputProfileManager().getSurfacePressConfig(),
  );

  // ---- State ----
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);
  const [calStage, setCalStage] = useState<'idle' | 'keys'>('idle');
  const calStageRef = useRef<'idle' | 'keys'>('idle');
  const calKeysRef = useRef<SurfacePressStored['keys']>([]);
  const [calTick, setCalTick] = useState(0);
  const [baseMidi, setBaseMidi] = useState(60);

  useEffect(() => { calStageRef.current = calStage; }, [calStage]);

  // ---- Camera + colour tracker ----
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const init = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        const camera = new CameraManager();
        cameraRef.current = camera;
        await camera.start(video);
        const tracker = new ColorTracker({ frameSkip: 1, smoothing: 0.3 });
        colorTrackerRef.current = tracker;
        unsub = tracker.onTracking((output) => { blobsRef.current = output.blobs; });
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
      unsub?.();
    };
  }, []);

  // ---- Apply shared calibration to the detector + register colours ----
  const applyConfig = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg) return;
    if (!pressModeRef.current) pressModeRef.current = new SurfacePressMode();
    pressModeRef.current.setConfig({
      touchDist: cfg.touchDist,
      releaseDist: cfg.releaseDist,
      occlusionEnter: cfg.occlusionEnter,
      occlusionExit: cfg.occlusionExit,
      defaultVelocity: cfg.defaultVelocity,
    });
    for (const k of cfg.keys) colorTrackerRef.current?.addColor(k.color);
    engineRef.current.setKeys(cfg.keys.map((k) => ({ id: k.id, instrumentKey: k.instrumentKey })));
  }, []);

  useEffect(() => {
    if (isInitialized) applyConfig();
  }, [isInitialized, applyConfig]);

  useEffect(() => {
    engineRef.current.setBaseMidi(baseMidi);
  }, [baseMidi]);

  // ---- Hand tracking (index fingertip) ----
  useEffect(() => {
    if (!isInitialized) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const startHands = async () => {
      try {
        if (!handDetectorRef.current) {
          const detector = new HandDetector({ numHands: 2 });
          await detector.initialize();
          if (cancelled) { detector.dispose(); return; }
          handDetectorRef.current = detector;
        }
        unsub = handDetectorRef.current.onHands((r) => { handsRef.current = r; });
        handDetectorRef.current.start(video);
      } catch (err) {
        console.error('[SurfaceKeyboardScreen] Hand detector init failed:', err);
      }
    };
    startHands();
    return () => {
      cancelled = true;
      unsub?.();
      handDetectorRef.current?.stop();
      handsRef.current = null;
    };
  }, [isInitialized]);

  // Dispose engine + hand detector on unmount.
  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      engine.dispose();
      handDetectorRef.current?.dispose();
      handDetectorRef.current = null;
    };
  }, []);

  // ---- Start audio (needs a user gesture) ----
  const startAudio = useCallback(async () => {
    await engineRef.current.start();
    applyConfig();
    setAudioStarted(true);
  }, [applyConfig]);

  // ---- Per-frame detection loop ----
  useEffect(() => {
    if (!isInitialized) return;
    let running = true;
    const loop = () => {
      if (!running) return;
      const cfg = configRef.current;
      const pressMode = pressModeRef.current;
      if (cfg && pressMode && engineRef.current.isReady()) {
        const blobs = blobsRef.current;
        const hands = handsRef.current;

        const fingers: FingerPoint[] = [];
        for (const hand of [hands?.leftHand, hands?.rightHand]) {
          const tip = indexFingertip(hand?.landmarks ?? null);
          if (tip) fingers.push({ x: 1 - tip.x, y: tip.y }); // raw (unmirrored) x
        }
        const keyFrames: SurfaceKeyFrame[] = cfg.keys.map((k) => {
          const blob = blobs.find((bl) => bl.colorId === k.id);
          const found = blob?.found ?? false;
          return {
            id: k.id,
            segment: found ? (blob!.axis ?? null) : null,
            area: found ? blob!.area : 0,
            found,
          };
        });
        for (const ev of pressMode.step(keyFrames, fingers, performance.now())) {
          if (ev.type === 'press') {
            engineRef.current.press(ev.buttonId, ev.velocity);
            pressedRef.current.add(ev.buttonId);
          } else {
            engineRef.current.release(ev.buttonId);
            pressedRef.current.delete(ev.buttonId);
          }
        }
      }

      // Overlay
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          if (canvas.width !== vw) canvas.width = vw;
          if (canvas.height !== vh) canvas.height = vh;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawOverlay(ctx, canvas.width, canvas.height, cfg, blobsRef.current, pressedRef.current, handsRef.current);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [isInitialized]);

  // ---- Calibration (writes the SHARED surface-press config) ----
  const startCalibration = useCallback(() => {
    calKeysRef.current = [];
    setCalStage('keys');
    setCalTick((t) => t + 1);
    void startAudio();
  }, [startAudio]);

  const finishCalibration = useCallback(() => {
    if (calKeysRef.current.length === 0) return;
    const cfg: SurfacePressStored = {
      enabled: true,
      touchDist: 0.06,
      releaseDist: 0.1,
      occlusionEnter: 0.65,
      occlusionExit: 0.85,
      defaultVelocity: 0.7,
      keys: calKeysRef.current,
    };
    configRef.current = cfg;
    getInputProfileManager().saveSurfacePressConfig(cfg);
    setCalStage('idle');
    applyConfig();
    setCalTick((t) => t + 1);
  }, [applyConfig]);

  const handleVideoClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Any click starts audio (browser gesture requirement).
    if (!audioStarted) void startAudio();
    if (calStageRef.current !== 'keys' || !videoRef.current) return;
    const videoEl = videoRef.current;
    const rect = videoEl.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return;
    const rawX = 1 - sx;
    const id = `press-${calKeysRef.current.length + 1}`;
    const color = colorTrackerRef.current?.calibrateFromPixel(videoEl, rawX, sy, id);
    if (color) {
      color.searchRegion = {
        minX: Math.max(0, rawX - SURFACE_SEARCH_HALF_W),
        maxX: Math.min(1, rawX + SURFACE_SEARCH_HALF_W),
        minY: Math.max(0, sy - SURFACE_SEARCH_UP),
        maxY: 1,
      };
      colorTrackerRef.current?.addColor(color);
      calKeysRef.current.push({ id, instrumentKey: SURFACE_DEFAULT_INSTRUMENT, color });
    }
    setCalTick((t) => t + 1);
  }, [audioStarted, startAudio]);

  const handleInstrumentChange = useCallback((keyId: string, instrumentKey: string) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const key = cfg.keys.find((k) => k.id === keyId);
    if (!key) return;
    key.instrumentKey = instrumentKey;
    getInputProfileManager().saveSurfacePressConfig(cfg);
    applyConfig();
    setCalTick((t) => t + 1);
  }, [applyConfig]);

  const cfg = configRef.current;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0c0c14', color: '#e8e8f0' }}>
      <div
        onClick={handleVideoClick}
        style={{ position: 'relative', flex: 1, cursor: calStage === 'keys' ? 'crosshair' : 'default' }}
      >
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)', pointerEvents: 'none' }} />
        {error && <div style={{ position: 'absolute', top: 8, left: 8, color: '#ff8080' }}>{error}</div>}
        {!audioStarted && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 13, color: '#0ff' }}>
            Tap the video to start sound.
          </div>
        )}
      </div>

      <div style={{ width: 300, padding: 16, overflowY: 'auto', borderLeft: '1px solid #222' }}>
        <button onClick={() => setCurrentScreen('performance')} style={btn}>← Back</button>
        <h2 style={{ fontSize: 18, margin: '12px 0' }}>Surface Keyboard</h2>
        <p style={{ fontSize: 12, color: '#a1a1b8' }}>
          Play the tubes as a pentatonic keyboard — press a tube with your index finger to sound
          its note. No backing song needed. Calibration is shared with in-song surface press.
        </p>

        <div style={{ margin: '12px 0' }}>
          <label style={{ fontSize: 12, color: '#a1a1b8', display: 'flex', gap: 8, alignItems: 'center' }}>
            Base note
            <select value={baseMidi} onChange={(e) => setBaseMidi(Number(e.target.value))} className="form-field__select">
              {BASE_NOTE_OPTIONS.map((o) => <option key={o.midi} value={o.midi}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={startCalibration} style={btn} disabled={calStage !== 'idle'}>Calibrate tubes</button>
          {calStage === 'keys' && (
            <>
              <span style={{ fontSize: 11, color: '#0ff' }}>{calKeysRef.current.length} tube(s) — click each, then Done</span>
              <button onClick={finishCalibration} style={btn} disabled={calKeysRef.current.length === 0}>Done</button>
            </>
          )}
        </div>

        {calStage === 'idle' && cfg && cfg.keys.length > 0 && (
          <div data-cal-tick={calTick} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cfg.keys.map((k, i) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, flexShrink: 0, background: `hsl(${Math.round(k.color.hue)},80%,50%)`, border: '1px solid rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 11, color: '#a1a1b8', width: 70 }}>
                  Tube {i + 1} · {midiToNoteName(engineRef.current.midiForKey(k.id))}
                </span>
                <select className="form-field__select" value={k.instrumentKey} onChange={(e) => handleInstrumentChange(k.id, e.target.value)} aria-label={`Tube ${i + 1} instrument`} style={{ fontSize: 11, flex: 1 }}>
                  {INSTRUMENT_PALETTE_LIST.map((opt) => <option key={opt.key} value={opt.key}>{opt.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        {calStage === 'idle' && (!cfg || cfg.keys.length === 0) && (
          <p style={{ fontSize: 12, color: '#71718a' }}>No tubes calibrated yet — click "Calibrate tubes", then click the middle of each tube.</p>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#1c1c2a', color: '#e8e8f0', border: '1px solid #333',
  borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
};

/** Draw each tube's live long-axis line (red when pressed) + the fingertips. */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: SurfacePressStored | null,
  blobs: ColorBlob[],
  pressed: Set<string>,
  hands: HandDetectionResult | null,
): void {
  ctx.save();
  if (cfg) {
    for (const key of cfg.keys) {
      const blob = blobs.find((bl) => bl.colorId === key.id);
      if (!blob?.found || !blob.axis) continue;
      const { ax, ay, bx, by } = blob.axis;
      const down = pressed.has(key.id);
      ctx.strokeStyle = down ? 'rgba(255,80,80,0.95)' : 'rgba(0,200,255,0.7)';
      ctx.lineWidth = down ? 7 : 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo((1 - ax) * w, ay * h);
      ctx.lineTo((1 - bx) * w, by * h);
      ctx.stroke();
    }
  }
  if (hands) {
    ctx.fillStyle = 'rgba(80,255,140,0.9)';
    for (const hand of [hands.leftHand, hands.rightHand]) {
      const tip = indexFingertip(hand?.landmarks ?? null);
      if (tip) { ctx.beginPath(); ctx.arc(tip.x * w, tip.y * h, 7, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

export default SurfaceKeyboardScreen;
