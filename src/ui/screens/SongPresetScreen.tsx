/**
 * SongPresetScreen — Play along with a song using 5 color-tracked instruments.
 *
 * Five colored objects each represent a musical role:
 *   Blue   = Stem Mixer (controls original recording)
 *   Red    = Chord Pad (warm synth pad)
 *   Green  = Melody Notes (quantized pentatonic)
 *   Yellow = Arpeggio (rhythmic pattern)
 *   Orange = Bass Synth (deep bass)
 *
 * Only 2 colours can be active at once (whichever 2 the camera sees).
 * The generated accompaniment is locked to the song's key, tempo, and chords.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, useIsMuted } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { ColorTracker } from '../../tracking/ColorTracker';
import type { ColorBlob } from '../../tracking/ColorTracker';
import { FaceDetector } from '../../tracking/FaceDetector';
import { SongPresetEngine } from '../../songs/SongPresetEngine';
import type {
  VoicePosition,
  SongPresetStatus,
  SongCalibration,
  BatonMode,
} from '../../songs/SongPresetEngine';
import { SONG_LIBRARY, COLOR_ROLES } from '../../songs/songLibrary';
import type { SongConfig, ColorRole } from '../../songs/songLibrary';
import { PAD_PRESET_LIST } from '../../songs/voices/ChordPadVoice';
import { MELODY_PRESET_LIST } from '../../songs/voices/MelodicVoice';
import { ARP_PRESET_LIST } from '../../songs/voices/ArpeggioVoice';
import { BASS_PRESET_LIST } from '../../songs/voices/BassSynthVoice';
import {
  INSTRUMENT_PALETTE_LIST,
  INSTRUMENT_PALETTE_BY_KEY,
  DEFAULT_INSTRUMENT_KEY,
} from '../../songs/voices/presets/instrumentPalette';
import { getInputProfileManager } from '../../profiles/InputProfileManager';
import { SurfacePressMode, type SurfaceKeyFrame, type FingerPoint } from '../../tracking/SurfacePressMode';
import { HandDetector, type HandDetectionResult } from '../../tracking/HandDetector';
import { indexFingertip } from '../../tracking/handPressPoint';
import type { SurfacePressStored } from '../../profiles/SurfacePressConfig';
import { StemMixerStrip } from './songPreset/StemMixerStrip';
import { StemMixerTouchPad } from './songPreset/StemMixerTouchPad';
import type { PadState } from './songPreset/usePadState';

// ============================================
// Constants
// ============================================

const VOICE_PRESET_OPTIONS: Record<string, Array<{ key: string; name: string }>> = {
  red:    PAD_PRESET_LIST,
  green:  MELODY_PRESET_LIST,
  yellow: ARP_PRESET_LIST,
  orange: BASS_PRESET_LIST,
};

const CALIBRATION_DURATION_MS = 10_000;
const LEFT_THRESHOLD = 0.30;
const RIGHT_THRESHOLD = 0.70;

// Surface-press defaults (commissioner-overridable).
const SURFACE_DEFAULT_INSTRUMENT = 'piano';
// Per-tube colour-search box around the calibration click: tight horizontally
// (neighbours differ in hue), generous vertically up from the click and down
// to the near edge (tubes are long, foreshortened toward the camera).
const SURFACE_SEARCH_HALF_W = 0.15;
const SURFACE_SEARCH_UP = 0.22;

const ROLE_KEYS: Record<string, ColorRole> = {
  '1': 'blue',
  '2': 'red',
  '3': 'green',
  '4': 'yellow',
  '5': 'orange',
};

// ============================================
// Component
// ============================================

function SongPresetScreen() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const colorTrackerRef = useRef<ColorTracker | null>(null);
  /**
   * Face detector for the Head Bopping channel (Session 5 Change ID 6).
   * Lazily started — only initialised when the user toggles head
   * bopping on, so users who don't want it don't pay the MediaPipe
   * face-landmarker load cost.
   */
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const engineRef = useRef(new SongPresetEngine());

  // Latest blob data
  const blobsRef = useRef<ColorBlob[]>([]);

  // ---- Surface-press mode (opt-in; default off) ----
  // Coloured objects on a table act as press-triggers. Entirely behind the
  // surfacePressEnabled flag: when off, no colours are added, the detector is
  // not fed, and no overlay is drawn, so the baton path is unchanged.
  const surfacePressModeRef = useRef<SurfacePressMode | null>(null);
  const surfaceConfigRef = useRef<SurfacePressStored | null>(
    getInputProfileManager().getSurfacePressConfig(),
  );
  // Always start OFF on load, even if a calibration is saved — surface press
  // is opt-in and must never auto-fire notes when the screen loads. The saved
  // calibration is still loaded (so the toggle is ready), the user turns it on.
  const [surfacePressEnabled, setSurfacePressEnabled] = useState<boolean>(false);
  const [surfaceCalStage, setSurfaceCalStage] =
    useState<'idle' | 'keys'>('idle');
  const surfaceCalStageRef = useRef<'idle' | 'keys'>('idle');
  // Mirror of surfacePressEnabled for the rAF loop (whose effect deps don't
  // include it, so it must read the live value via a ref).
  const surfacePressEnabledRef = useRef<boolean>(false);
  const surfaceKeysRef = useRef<SurfacePressStored['keys']>([]);
  // Bump to force a re-render of the calibration progress hints (refs alone
  // don't trigger React updates).
  const [surfaceCalTick, setSurfaceCalTick] = useState(0);
  // Hand tracking for the pressing finger (lazily started while surface mode
  // is on). Latest result is stashed for the rAF loop. `pressedTubesRef`
  // tracks which keys are currently down, for the facilitator overlay.
  const handDetectorRef = useRef<HandDetector | null>(null);
  const handsRef = useRef<HandDetectionResult | null>(null);
  const pressedTubesRef = useRef<Set<string>>(new Set());

  // UI state
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showNoteNames, setShowNoteNames] = useState(true);

  // Song selection & loading
  const [selectedSong, setSelectedSong] = useState<SongConfig | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Transport state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMutedLocal, setIsMutedLocal] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  /**
   * Beat Bopping toggle.  When on, every instrument-mode baton trigger
   * is quantised to the next beat in the song's beat grid — Tim's
   * baton-driven notes always land on-rhythm with the accompaniment.
   */
  const [beatSnap, setBeatSnap] = useState(false);

  /**
   * Head Bopping toggle.  When on, a FaceDetector is started and each
   * detected downward head bop fires a kick-drum sample on the engine
   * — beat-snapped if Beat Bopping is also on.
   */
  const [headBopEnabled, setHeadBopEnabled] = useState(false);

  // Live status
  const [liveStatus, setLiveStatus] = useState<SongPresetStatus | null>(null);
  const statusFrameCount = useRef(0);

  // Color calibration (5 colors)
  const [colorCalState, setColorCalState] = useState<Record<ColorRole, boolean>>({
    blue: false, red: false, green: false, yellow: false, orange: false,
  });
  const [colorCalMode, setColorCalMode] = useState<ColorRole | null>(null);
  const colorCalModeRef = useRef<ColorRole | null>(null);

  // Per-colour detection sensitivity (minArea threshold on the ColorTracker).
  // Lower values = more sensitive to small blobs; default matches
  // ColorTracker.calibrateFromPixel()'s default of 0.0005.
  const [colorSensitivity, setColorSensitivity] = useState<Record<ColorRole, number>>({
    blue: 0.0005, red: 0.0005, green: 0.0005, yellow: 0.0005, orange: 0.0005,
  });

  // Range calibration
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState<ColorRole | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const calibrationDataRef = useRef<Record<string, { minX: number; maxX: number; minY: number; maxY: number }> | null>(null);
  const calibrationStepRef = useRef<ColorRole | null>(null);

  // Volume controls
  const [accompVolume, setAccompVolume] = useState(1.0);
  const [stemVolume, setStemVolume] = useState(1.0);

  // Voice instrument presets
  const [voicePresets, setVoicePresets] = useState<Record<string, string>>({
    red: 'warmPad', green: 'bell', yellow: 'sparkle', orange: 'sub',
  });

  // Per-baton mode and instrument selection (instrument mode only).
  // Initialised from the persisted profile in the effect below so the
  // user's previous choices survive a page refresh.
  const [batonModes, setBatonModes] = useState<Record<ColorRole, BatonMode>>({
    blue: 'parameter',
    red: 'parameter',
    green: 'parameter',
    yellow: 'parameter',
    orange: 'parameter',
  });
  const [batonInstruments, setBatonInstruments] = useState<Record<ColorRole, string>>({
    blue: DEFAULT_INSTRUMENT_KEY,
    red: DEFAULT_INSTRUMENT_KEY,
    green: DEFAULT_INSTRUMENT_KEY,
    yellow: DEFAULT_INSTRUMENT_KEY,
    orange: DEFAULT_INSTRUMENT_KEY,
  });

  // Continuous backing
  const [continuousBackingEnabled, setContinuousBackingEnabled] = useState(true);
  const [continuousBackingLevel, setContinuousBackingLevel] = useState(0.4);

  // Timing fine-tune
  const [chordOffset, setChordOffset] = useState(0);
  const [bpmAdjust, setBpmAdjust] = useState(0);
  const [tappedTimes, setTappedTimes] = useState<number[]>([]);

  // Keyboard test mode
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState<ColorRole[]>([]);
  const keyboardActiveRef = useRef<ColorRole[]>([]);
  const mousePosRef = useRef({ x: 0.5, y: 0.5 });

  // Input mode (webcam | touch). Session-only — not persisted.
  const [inputMode, setInputMode] = useState<'webcam' | 'touch'>('webcam');
  // Touch pad state pushed up from StemMixerTouchPad.
  const padStateRef = useRef<PadState>({ x: 0.5, y: 0.0, held: false });

  // Store
  const isMuted = useIsMuted();
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // Keep refs in sync
  useEffect(() => { colorCalModeRef.current = colorCalMode; }, [colorCalMode]);
  useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);
  useEffect(() => { keyboardActiveRef.current = keyboardActive; }, [keyboardActive]);
  useEffect(() => { surfaceCalStageRef.current = surfaceCalStage; }, [surfaceCalStage]);
  useEffect(() => { surfacePressEnabledRef.current = surfacePressEnabled; }, [surfacePressEnabled]);

  // ---- Initialize camera + color tracker ----
  useEffect(() => {
    if (inputMode !== 'webcam') {
      // Touch mode: skip camera/tracker, mark "initialised" so the draw loop can run.
      setIsInitialized(true);
      return;
    }

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

        unsubTracking = tracker.onTracking((output) => {
          blobsRef.current = output.blobs;
        });

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
  }, [inputMode]);

  // Dispose engine once on unmount (separated from camera init effect because
  // the engine should survive input-mode switches but the camera should not).
  useEffect(() => {
    const engine = engineRef.current;
    return () => { engine.dispose(); };
  }, []);

  // Head Bopping lifecycle.  When toggled on, lazily initialise the
  // FaceDetector (loads MediaPipe face-landmarker model on first use),
  // start it on the video element, and push each frame's landmarks
  // into the engine.  When toggled off, stop the detector but keep it
  // alive — the model is expensive to load, so re-toggling shouldn't
  // pay that cost again.
  useEffect(() => {
    const engine = engineRef.current;
    engine.setHeadBopEnabled(headBopEnabled);
    if (!headBopEnabled) {
      faceDetectorRef.current?.stop();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;

    const startFace = async () => {
      try {
        if (!faceDetectorRef.current) {
          const detector = new FaceDetector();
          await detector.initialize();
          if (cancelled) {
            detector.dispose();
            return;
          }
          faceDetectorRef.current = detector;
        }
        const detector = faceDetectorRef.current;
        unsub = detector.onFace((result) => {
          engine.processFaceLandmarks(result.face, result.timestamp);
        });
        detector.start(video);
      } catch (err) {
        console.error('[SongPresetScreen] Face detector init failed:', err);
        setHeadBopEnabled(false);
      }
    };

    startFace();

    return () => {
      cancelled = true;
      unsub?.();
      faceDetectorRef.current?.stop();
    };
  }, [headBopEnabled]);

  // Dispose the FaceDetector entirely on unmount (the lifecycle effect
  // above only stops it on toggle-off so the model stays cached).
  useEffect(() => {
    return () => {
      faceDetectorRef.current?.dispose();
      faceDetectorRef.current = null;
    };
  }, []);

  // ---- Surface-press enable/disable ----
  // Pushes the calibrated config into both the engine (instrument mapping)
  // and the pure detector (line + thresholds), registers each button's
  // colour for tracking, and persists the enabled flag. When disabling, the
  // detector is reset and NO colours/overlay/feed are produced — the baton
  // path is untouched.
  useEffect(() => {
    const engine = engineRef.current;
    engine.setSurfacePressEnabled(surfacePressEnabled);

    const cfg = surfaceConfigRef.current;
    if (surfacePressEnabled && cfg) {
      if (!surfacePressModeRef.current) surfacePressModeRef.current = new SurfacePressMode();
      surfacePressModeRef.current.setConfig({
        touchDist: cfg.touchDist,
        releaseDist: cfg.releaseDist,
        occlusionEnter: cfg.occlusionEnter,
        occlusionExit: cfg.occlusionExit,
        defaultVelocity: cfg.defaultVelocity,
      });
      engine.setSurfacePressConfig({
        buttons: cfg.keys.map((k) => ({ id: k.id, instrumentKey: k.instrumentKey })),
      });
      // Register each key's colour so the tracker locates its tube (and the
      // tube's live long-axis line) every frame.
      for (const k of cfg.keys) colorTrackerRef.current?.addColor(k.color);
    } else {
      surfacePressModeRef.current?.reset();
    }

    if (cfg) {
      getInputProfileManager().saveSurfacePressConfig({ ...cfg, enabled: surfacePressEnabled });
    }
  }, [surfacePressEnabled]);

  // Surface-press hand tracking. The pressing finger is tracked by MediaPipe
  // Hands, started lazily only while surface mode is on (the model is
  // expensive to load). Each frame's result is stashed in handsRef for the
  // rAF loop, which maps the lowest fingertip onto the table keys.
  useEffect(() => {
    if (!surfacePressEnabled || inputMode !== 'webcam') {
      handDetectorRef.current?.stop();
      handsRef.current = null;
      pressedTubesRef.current.clear();
      return;
    }
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
        const detector = handDetectorRef.current;
        unsub = detector.onHands((result) => { handsRef.current = result; });
        detector.start(video);
      } catch (err) {
        console.error('[SongPresetScreen] Hand detector init failed:', err);
      }
    };

    startHands();

    return () => {
      cancelled = true;
      unsub?.();
      handDetectorRef.current?.stop();
      handsRef.current = null;
    };
    // isInitialized is a dependency so this re-runs once the camera is ready:
    // if surface press is already enabled on load, videoRef is null on the
    // first pass and we must retry when the video element exists.
  }, [surfacePressEnabled, inputMode, isInitialized]);

  // Dispose the HandDetector entirely on unmount (the effect above only stops
  // it on toggle-off so the model stays cached).
  useEffect(() => {
    return () => {
      handDetectorRef.current?.dispose();
      handDetectorRef.current = null;
    };
  }, []);

  // ---- Sync mute ----
  useEffect(() => {
    engineRef.current.setMuted(isMuted || isMutedLocal);
  }, [isMuted, isMutedLocal]);
  // (Baton-assignment restore effect is declared further down, alongside
  // the restoreBatonAssignments callback it depends on.)

  // ---- Keyboard test mode listeners ----
  useEffect(() => {
    if (!keyboardMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const role = ROLE_KEYS[e.key];
      if (!role) return;
      e.preventDefault();

      setKeyboardActive((prev) => {
        if (prev.includes(role)) {
          // Toggle off
          return prev.filter((r) => r !== role);
        }
        // Toggle on — max 2 active
        const next = [...prev, role];
        if (next.length > 2) {
          return [next[1], next[2]]; // drop oldest
        }
        return next;
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const video = videoRef.current;
      if (!video) return;
      const rect = video.getBoundingClientRect();
      mousePosRef.current = {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [keyboardMode]);

  // ---- Main draw/update loop ----
  useEffect(() => {
    if (!isInitialized) return;
    let running = true;

    const buildPositions = (): Map<ColorRole, VoicePosition> => {
      const positions = new Map<ColorRole, VoicePosition>();
      if (inputMode === 'touch') {
        const pad = padStateRef.current;
        for (const role of COLOR_ROLES) {
          if (role.id === 'blue') {
            positions.set(role.id, { x: pad.x, y: pad.y, found: pad.held });
          } else {
            positions.set(role.id, { x: 0, y: 0, found: false });
          }
        }
      } else if (keyboardMode) {
        const active = keyboardActiveRef.current;
        const mouse = mousePosRef.current;
        for (const role of COLOR_ROLES) {
          const isActive = active.includes(role.id);
          positions.set(role.id, {
            x: isActive ? mouse.x : 0.5,
            y: isActive ? mouse.y : 0.5,
            found: isActive,
          });
        }
      } else {
        const blobs = blobsRef.current;
        for (const role of COLOR_ROLES) {
          const blob = blobs.find((b) => b.colorId === role.id);
          positions.set(role.id, blob?.found
            ? { x: 1 - blob.x, y: blob.y, found: true }
            : { x: 0, y: 0, found: false });
        }
      }
      return positions;
    };

    const loop = () => {
      if (!running) return;

      // Surface-press mode and moving-baton mode are mutually exclusive — it
      // makes no sense to expect both at once. While surface press is on, feed
      // the engine all-"not found" positions so the continuous baton voices
      // stay silent and the instrument is purely tap-based. (The engine still
      // tracks chord/beat, which the tap voices need.)
      const positions = surfacePressEnabledRef.current
        ? new Map<ColorRole, VoicePosition>(
            COLOR_ROLES.map((r) => [r.id, { x: 0, y: 0, found: false }]),
          )
        : buildPositions();

      // Feed to engine
      engineRef.current.setAllPositions(positions);

      // ---- Surface-press: press a tube anywhere along its length ----
      // Each tube appears as a line (its colour blob's live long axis). The
      // pressing finger is the lowest fingertip of each tracked hand. The
      // detector fires a key when a finger touches its line (perpendicular
      // distance), releasing when the finger leaves. `press-N` ids never
      // collide with baton ColorRoles, so the baton path is untouched.
      // Tube axes and fingers are both in RAW (unmirrored) coords; HandDetector
      // mirrors x to screen space, so raw = 1 - x.
      if (
        surfacePressEnabledRef.current &&
        surfacePressModeRef.current &&
        surfaceConfigRef.current
      ) {
        const cfg = surfaceConfigRef.current;
        const blobs = blobsRef.current;
        const hands = handsRef.current;

        const fingers: FingerPoint[] = [];
        for (const hand of [hands?.leftHand, hands?.rightHand]) {
          const tip = indexFingertip(hand?.landmarks ?? null);
          if (tip) fingers.push({ x: 1 - tip.x, y: tip.y });
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

        for (const ev of surfacePressModeRef.current.step(keyFrames, fingers, performance.now())) {
          if (ev.type === 'press') {
            engineRef.current.pressSurfaceButton(ev.buttonId, ev.velocity);
            pressedTubesRef.current.add(ev.buttonId);
          } else {
            engineRef.current.releaseSurfaceButton(ev.buttonId);
            pressedTubesRef.current.delete(ev.buttonId);
          }
        }
      }

      // Accumulate calibration data (only meaningful with a positional input + ongoing calibration)
      if (calibrationDataRef.current && calibrationStepRef.current) {
        const role = calibrationStepRef.current;
        const pos = positions.get(role);
        if (pos?.found && calibrationDataRef.current[role]) {
          const d = calibrationDataRef.current[role];
          d.minX = Math.min(d.minX, pos.x);
          d.maxX = Math.max(d.maxX, pos.x);
          d.minY = Math.min(d.minY, pos.y);
          d.maxY = Math.max(d.maxY, pos.y);
        }
      }

      // Get status
      const status = engineRef.current.getStatus();

      // Update React state periodically
      statusFrameCount.current++;
      if (statusFrameCount.current % 10 === 0) {
        setLiveStatus(status);
        setIsPlaying(status.isPlaying);
        setIsPaused(status.isPaused);
      }

      // Draw overlay onto the canvas (webcam mode only — canvas/video don't exist in touch mode).
      if (inputMode === 'webcam') {
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
            if (showOverlay && selectedSong) {
              drawOverlay(ctx, canvas.width, canvas.height, positions, status, selectedSong, showNoteNames);
            }
            // Surface-press facilitator overlay: the calibrated surface line
            // plus a marker per button (red when at/past the surface, white
            // otherwise). Drawn whenever surface mode is on, independent of
            // the researcher-overlay toggle, so facilitators always get
            // surface feedback. Sound is the primary feedback; this is modest.
            if (surfacePressEnabledRef.current && surfaceConfigRef.current) {
              drawSurfaceOverlay(
                ctx, canvas.width, canvas.height,
                surfaceConfigRef.current, blobsRef.current,
                pressedTubesRef.current, handsRef.current,
              );
            }
          }
        }
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => { running = false; };
  }, [isInitialized, showOverlay, showNoteNames, selectedSong, keyboardMode, inputMode]);

  // ---- Per-baton mode + instrument ----
  //
  // Declared here (above handleSelectSong) because loadSong rebuilds
  // every voice, so handleSelectSong needs to call restoreBatonAssignments
  // after the load completes.

  const persistBatonAssignments = useCallback(
    (modes: Record<ColorRole, BatonMode>, instruments: Record<ColorRole, string>) => {
      const assignments: Partial<Record<ColorRole, { mode: BatonMode; instrumentKey: string }>> = {};
      for (const role of ['red', 'green', 'yellow', 'orange'] as ColorRole[]) {
        assignments[role] = {
          mode: modes[role],
          instrumentKey: instruments[role],
        };
      }
      getInputProfileManager().saveBatonAssignments(assignments);
    },
    [],
  );

  const handleBatonModeChange = useCallback((role: ColorRole, mode: BatonMode) => {
    if (role === 'blue') return;
    setBatonModes((prev) => {
      if (prev[role] === mode) return prev;
      const next = { ...prev, [role]: mode };
      engineRef.current.setBatonMode(role, mode);
      persistBatonAssignments(next, batonInstruments);
      return next;
    });
  }, [batonInstruments, persistBatonAssignments]);

  const handleBatonInstrumentChange = useCallback((role: ColorRole, instrumentKey: string) => {
    if (role === 'blue') return;
    if (!INSTRUMENT_PALETTE_BY_KEY[instrumentKey]) return;
    setBatonInstruments((prev) => {
      const next = { ...prev, [role]: instrumentKey };
      engineRef.current.setBatonInstrument(role, instrumentKey);
      persistBatonAssignments(batonModes, next);
      return next;
    });
  }, [batonModes, persistBatonAssignments]);

  /**
   * Pull baton assignments back from the persisted profile and apply
   * them to the engine and React state.  Called on mount AND after
   * every loadSong (because loadSong rebuilds voices from scratch).
   */
  const restoreBatonAssignments = useCallback(() => {
    const stored = getInputProfileManager().getBatonAssignments();
    if (Object.keys(stored).length === 0) return;

    // Apply to engine first so the audible state matches the UI state
    // by the time the React commit runs.
    engineRef.current.applyBatonAssignments(stored);

    setBatonModes((prev) => {
      const next = { ...prev };
      for (const [role, assignment] of Object.entries(stored)) {
        if (assignment) next[role as ColorRole] = assignment.mode;
      }
      return next;
    });
    setBatonInstruments((prev) => {
      const next = { ...prev };
      for (const [role, assignment] of Object.entries(stored)) {
        if (assignment) next[role as ColorRole] = assignment.instrumentKey;
      }
      return next;
    });
  }, []);

  // Restore on mount so the UI reflects the user's saved choices on
  // first render — even before they pick a song.
  useEffect(() => {
    restoreBatonAssignments();
  }, [restoreBatonAssignments]);

  // ---- Song loading ----
  const handleSelectSong = useCallback(async (song: SongConfig) => {
    setSelectedSong(song);
    setIsLoaded(false);
    setLoadingStatus('Loading stems... 0/' + Object.keys(song.stems).length);

    const engine = engineRef.current;
    engine.setLoadProgressCallback((loaded, total) => {
      setLoadingStatus(`Loading stems... ${loaded}/${total}`);
    });

    try {
      await engine.loadSong(song);
      setIsLoaded(true);
      setLoadingStatus(null);
      setLoopEnd(engine.getStatus().duration);
      // loadSong rebuilds every voice from scratch, so any previously
      // applied baton modes must be re-applied to the newly-built
      // voices.  Without this, the user's saved preferences would only
      // take effect after a manual UI toggle.
      restoreBatonAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load song');
      setLoadingStatus(null);
    }
  }, [restoreBatonAssignments]);

  // ---- Transport handlers ----
  const handlePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine.isLoaded()) return;

    if (isPaused) {
      engine.resume();
    } else if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  }, [isPlaying, isPaused]);

  const handleRestart = useCallback(() => {
    engineRef.current.restart();
  }, []);

  const handleToggleLoop = useCallback(() => {
    const newVal = !loopEnabled;
    setLoopEnabled(newVal);
    engineRef.current.setLoopEnabled(newVal);
  }, [loopEnabled]);

  const handleToggleBeatSnap = useCallback(() => {
    const newVal = !beatSnap;
    setBeatSnap(newVal);
    engineRef.current.setBeatSnap(newVal);
  }, [beatSnap]);

  const handleLoopStartChange = useCallback((val: number) => {
    setLoopStart(val);
    engineRef.current.setLoopRegion(val, loopEnd);
  }, [loopEnd]);

  const handleLoopEndChange = useCallback((val: number) => {
    setLoopEnd(val);
    engineRef.current.setLoopRegion(loopStart, val);
  }, [loopStart]);

  const handleToggleMute = useCallback(() => {
    setIsMutedLocal((m) => !m);
  }, []);

  const handleVoicePresetChange = useCallback((role: ColorRole, preset: string) => {
    setVoicePresets((prev) => ({ ...prev, [role]: preset }));
    engineRef.current.setVoicePreset(role, preset);
  }, []);

  const handleAccompVolumeChange = useCallback((val: number) => {
    setAccompVolume(val);
    engineRef.current.setAccompanimentVolume(val);
  }, []);

  const handleStemVolumeChange = useCallback((val: number) => {
    setStemVolume(val);
    engineRef.current.setStemVolume(val);
  }, []);

  const handleContinuousBackingToggle = useCallback(() => {
    setContinuousBackingEnabled((prev) => {
      const next = !prev;
      engineRef.current.setContinuousBackingEnabled(next);
      return next;
    });
  }, []);

  const handleContinuousBackingLevelChange = useCallback((val: number) => {
    setContinuousBackingLevel(val);
    engineRef.current.setContinuousBackingLevel(val);
  }, []);

  const handleChordOffsetChange = useCallback((val: number) => {
    setChordOffset(val);
    engineRef.current.setChordOffset(val);
  }, []);

  const handleBpmAdjustChange = useCallback((val: number) => {
    setBpmAdjust(val);
    engineRef.current.setBpmAdjust(val);
  }, []);

  const handleTapChord = useCallback(() => {
    engineRef.current.tapChordMark();
    setTappedTimes(engineRef.current.getTappedChordTimes());
  }, []);

  const handleClearTaps = useCallback(() => {
    engineRef.current.clearTappedChordTimes();
    setTappedTimes([]);
  }, []);

  // ---- Color calibration ----
  const handleVideoAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // ---- Surface-press calibration routing (takes priority when active) ----
    // Click each tube once to sample its colour. The tube's line (and which
    // tube a finger presses) is derived live from the colour blob, so only
    // the colour + instrument is stored. Coords are RAW (1 - screenX) to match
    // the raw video coords the tracker works in.
    const surfaceStage = surfaceCalStageRef.current;
    if (surfaceStage === 'keys' && videoRef.current) {
      const videoEl = videoRef.current;
      const rect = videoEl.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width;
      const sy = (e.clientY - rect.top) / rect.height;
      if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return;
      const rawX = 1 - sx;

      const id = `press-${surfaceKeysRef.current.length + 1}`;
      const color = colorTrackerRef.current?.calibrateFromPixel(videoEl, rawX, sy, id);
      if (color) {
        // Constrain this tube's colour search to a box around where it was
        // clicked, so a same-hue wall / sweater / skin elsewhere in the frame
        // can't pollute the tube's blob (and its derived line). Generous
        // vertically (tubes are long) and down to the near edge; tight
        // horizontally (neighbours are a different hue anyway).
        color.searchRegion = {
          minX: Math.max(0, rawX - SURFACE_SEARCH_HALF_W),
          maxX: Math.min(1, rawX + SURFACE_SEARCH_HALF_W),
          minY: Math.max(0, sy - SURFACE_SEARCH_UP),
          maxY: 1,
        };
        colorTrackerRef.current?.addColor(color); // upsert with the region
        surfaceKeysRef.current.push({
          id,
          instrumentKey: SURFACE_DEFAULT_INSTRUMENT,
          color,
        });
      }
      // Any number of tubes: keep registering on each click. The facilitator
      // clicks "Done" (finishSurfaceCalibration) to finalise.
      setSurfaceCalTick((t) => t + 1);
      return;
    }

    const mode = colorCalModeRef.current;
    if (!mode || !colorTrackerRef.current || !videoRef.current) return;

    const videoEl = videoRef.current;
    const rect = videoEl.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (screenX < 0 || screenX > 1 || y < 0 || y > 1) return;

    // Video is CSS-mirrored: flip X back to raw video coordinates for pixel sampling
    const rawX = 1 - screenX;
    colorTrackerRef.current.calibrateFromPixel(videoEl, rawX, y, mode);

    setColorCalState((prev) => ({ ...prev, [mode]: true }));
    // Reset slider to match the default minArea written by calibrateFromPixel.
    setColorSensitivity((prev) => ({ ...prev, [mode]: 0.0005 }));
    setColorCalMode(null);
  }, []);

  // Slider handler: update only the minArea field of a tracked colour.
  // Read-before-write via getColor() preserves hue, hueTolerance, minSaturation,
  // and minValue. addColor() has upsert semantics (replaces by id), so this
  // cannot create duplicate tracked-colour entries.
  const handleColorSensitivityChange = useCallback((role: ColorRole, minArea: number) => {
    setColorSensitivity((prev) => ({ ...prev, [role]: minArea }));
    const tracker = colorTrackerRef.current;
    if (!tracker) return;
    const existing = tracker.getColor(role);
    if (!existing) return;
    // addColor() replaces by id — safe to call for updates.
    tracker.addColor({ ...existing, minArea });
  }, []);

  // ---- Range calibration (per color) ----
  const handleCalibrateColor = useCallback((role: ColorRole) => {
    if (!calibrationDataRef.current) {
      calibrationDataRef.current = {};
    }
    calibrationDataRef.current[role] = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
    setCalibrationStep(role);
    setCalibrationProgress(0);
    setIsCalibrating(true);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / CALIBRATION_DURATION_MS, 1);
      setCalibrationProgress(progress);

      if (progress >= 1) {
        clearInterval(interval);
        // Apply calibration for this color
        if (calibrationDataRef.current) {
          const cal: SongCalibration = engineRef.current.getCalibration() ?? {};
          cal[role] = calibrationDataRef.current[role];
          engineRef.current.setCalibration(cal);
        }
        setIsCalibrating(false);
        setCalibrationStep(null);
      }
    }, 100);
  }, []);

  const handleClearCalibration = useCallback(() => {
    engineRef.current.clearCalibration();
    calibrationDataRef.current = null;
  }, []);

  // ---- Surface-press calibration ----
  const startSurfaceCalibration = useCallback(() => {
    surfaceKeysRef.current = [];
    setSurfaceCalStage('keys');
    setSurfaceCalTick((t) => t + 1);
  }, []);

  // Finalise surface calibration with however many tubes were registered.
  const finishSurfaceCalibration = useCallback(() => {
    if (surfaceKeysRef.current.length === 0) return;
    const cfg: SurfacePressStored = {
      enabled: true,
      touchDist: 0.06,      // finger within ~6% of frame of the tube line
      releaseDist: 0.1,     // larger → anti-chatter distance hysteresis
      occlusionEnter: 0.65, // press once ≥35% of the tube is covered
      occlusionExit: 0.85,  // release once ≥85% is visible again
      defaultVelocity: 0.7,
      keys: surfaceKeysRef.current,
    };
    surfaceConfigRef.current = cfg;
    getInputProfileManager().saveSurfacePressConfig(cfg);
    setSurfaceCalStage('idle');
    setSurfacePressEnabled(true);
    setSurfaceCalTick((t) => t + 1);
  }, []);

  // Change the instrument a tube plays. Persists and rebuilds that voice.
  const handleSurfaceInstrumentChange = useCallback((keyId: string, instrumentKey: string) => {
    const cfg = surfaceConfigRef.current;
    if (!cfg) return;
    const key = cfg.keys.find((k) => k.id === keyId);
    if (!key) return;
    key.instrumentKey = instrumentKey;
    getInputProfileManager().saveSurfacePressConfig(cfg);
    engineRef.current.setSurfacePressConfig({
      buttons: cfg.keys.map((k) => ({ id: k.id, instrumentKey: k.instrumentKey })),
    });
    setSurfaceCalTick((t) => t + 1);
  }, []);

  const handleBack = useCallback(() => {
    engineRef.current.stopPlayback();
    setCurrentScreen('performance');
  }, [setCurrentScreen]);

  // ---- Format time helper ----
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  const currentTime = liveStatus?.currentTime ?? 0;
  const duration = liveStatus?.duration ?? 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeColors = liveStatus?.activeColors ?? [];
  const blueActive = activeColors.includes('blue');

  return (
    <div style={styles.container}>
      <div style={styles.stage}>
        <StemMixerStrip song={selectedSong} status={liveStatus} active={inputMode === 'touch' ? padStateRef.current.held : blueActive} />
      {inputMode === 'touch' ? (
        <StemMixerTouchPad
          song={selectedSong}
          status={liveStatus}
          onChange={(s) => { padStateRef.current = s; }}
        />
      ) : (
      <div
        style={{
          ...styles.videoContainer,
          cursor: colorCalMode || surfaceCalStage !== 'idle' ? 'crosshair' : 'default',
        }}
        onClick={handleVideoAreaClick}
      >
        <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Progress bar at bottom of video */}
        {isLoaded && (
          <div style={styles.transportBar}>
            <div style={{ ...styles.transportProgress, width: `${progressPct}%` }} />
            {loopEnabled && duration > 0 && loopStart > 0 && (
              <div style={{
                position: 'absolute',
                left: `${(loopStart / duration) * 100}%`,
                width: `${((loopEnd - loopStart) / duration) * 100}%`,
                height: '100%',
                background: 'rgba(249,115,22,0.2)',
                borderLeft: '2px solid #f97316',
                borderRight: '2px solid #f97316',
              }} />
            )}
          </div>
        )}

        {/* Calibration banner */}
        {isCalibrating && calibrationStep && (
          <div style={styles.calibrationBanner}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              Move the <span style={{ color: COLOR_ROLES.find(r => r.id === calibrationStep)?.cssColor }}>{calibrationStep}</span> object to your comfortable edges
            </p>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${calibrationProgress * 100}%` }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              {Math.round(calibrationProgress * 100)}%
            </p>
          </div>
        )}

        {/* Color calibration prompt */}
        {colorCalMode && (
          <div style={styles.colorCalBanner}>
            Click on the <strong style={{ margin: '0 4px', color: COLOR_ROLES.find(r => r.id === colorCalMode)?.cssColor }}>
              {COLOR_ROLES.find(r => r.id === colorCalMode)?.label}
            </strong> coloured object in the video
            <button
              onClick={(e) => { e.stopPropagation(); setColorCalMode(null); }}
              style={{ ...styles.btn, marginLeft: 12, fontSize: 11 }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Loading overlay */}
        {loadingStatus && (
          <div style={styles.loadingOverlay}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{loadingStatus}</div>
            <div style={styles.spinner} />
          </div>
        )}
      </div>
      )}
      </div>

      {/* Controls panel */}
      <div style={styles.controlsPanel}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            &larr; Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Song Preset</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={() => setInputMode('webcam')}
              style={inputMode === 'webcam' ? styles.btnActive : styles.btnSmall}
              aria-pressed={inputMode === 'webcam'}
            >
              Webcam
            </button>
            <button
              onClick={() => setInputMode('touch')}
              style={inputMode === 'touch' ? styles.btnActive : styles.btnSmall}
              aria-pressed={inputMode === 'touch'}
            >
              Touch
            </button>
          </div>
        </div>

        {/* Color Legend */}
        {inputMode === 'webcam' && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Instruments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {COLOR_ROLES.map((role) => {
              const isActive = activeColors.includes(role.id);
              const isCalibrated = colorCalState[role.id];
              return (
                <div
                  key={role.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: isActive ? `${role.cssColor}15` : 'transparent',
                    border: isActive ? `1px solid ${role.cssColor}40` : '1px solid transparent',
                    opacity: isActive ? 1 : 0.5,
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: isActive ? role.cssColor : 'transparent',
                    border: `2px solid ${role.cssColor}`,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? role.cssColor : '#a1a1b8' }}>
                      {role.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#71718a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {role.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: '#555570' }}>
                      {isCalibrated ? 'cal' : ''}
                      {keyboardMode && ` [${role.keyNumber}]`}
                    </div>
                    {role.id !== 'blue' && (() => {
                      const r = role.id as ColorRole;
                      const mode = batonModes[r];
                      const isInstrument = mode === 'instrument';
                      const isHarmonizer = mode === 'harmonizer';
                      const isWalk = mode === 'walk';
                      const isParameter = !isInstrument && !isHarmonizer && !isWalk;
                      const canHarmonize = r === 'green';
                      const buttonStyle = (active: boolean) => ({
                        flex: 1,
                        padding: '0 4px',
                        fontSize: 9,
                        background: active ? role.cssColor : '#1c1c2a',
                        color: active ? '#000' : '#a1a1b8',
                        border: `1px solid ${active ? role.cssColor : '#2a2a3a'}`,
                        cursor: 'pointer',
                        fontWeight: active ? 700 : 400,
                      } as React.CSSProperties);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {/* Mode toggle: parameter / instrument / harmonizer (green only) / walk */}
                          <div
                            role="group"
                            aria-label={`${role.label} mode`}
                            style={{ display: 'flex', gap: 1, height: 18 }}
                          >
                            <button
                              type="button"
                              onClick={() => handleBatonModeChange(r, 'parameter')}
                              aria-pressed={isParameter}
                              title="Parameter mode (default behaviour)"
                              style={buttonStyle(isParameter)}
                            >
                              Param
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBatonModeChange(r, 'instrument')}
                              aria-pressed={isInstrument}
                              title="Instrument mode (plays chord-tone notes on a chosen instrument)"
                              style={buttonStyle(isInstrument)}
                            >
                              Instr
                            </button>
                            {canHarmonize && (
                              <button
                                type="button"
                                onClick={() => handleBatonModeChange(r, 'harmonizer')}
                                aria-pressed={isHarmonizer}
                                title="Harmonizer mode (sings chord-aware harmony to the vocal). Hand height picks the interval. Only works on songs that have a vocal-harmony track."
                                style={buttonStyle(isHarmonizer)}
                              >
                                Harm
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleBatonModeChange(r, 'walk')}
                              aria-pressed={isWalk}
                              title="Walk mode (auto-arpeggiates chord tones on each beat while you move). Y picks loudness; X is ignored. Designed for users with limited horizontal range."
                              style={buttonStyle(isWalk)}
                            >
                              Walk
                            </button>
                          </div>
                          {/* Preset selector — list depends on mode */}
                          {isHarmonizer || isInstrument || isWalk ? (
                            <select
                              className="form-field__select"
                              value={batonInstruments[r] ?? DEFAULT_INSTRUMENT_KEY}
                              onChange={(e) =>
                                handleBatonInstrumentChange(r, e.target.value)
                              }
                              aria-label={
                                isHarmonizer
                                  ? `${role.label} harmoniser instrument`
                                  : isWalk
                                    ? `${role.label} walk instrument`
                                    : `${role.label} instrument`
                              }
                              title={
                                isHarmonizer
                                  ? 'Pick the instrument the harmoniser uses'
                                  : isWalk
                                    ? 'Pick the instrument walk mode plays'
                                    : undefined
                              }
                              style={{ height: 26, fontSize: 10, width: 86, flexShrink: 0 }}
                            >
                              {INSTRUMENT_PALETTE_LIST.map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.name}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              className="form-field__select"
                              value={voicePresets[role.id] ?? ''}
                              onChange={(e) => handleVoicePresetChange(r, e.target.value)}
                              aria-label={`${role.label} preset`}
                              style={{ height: 26, fontSize: 10, width: 86, flexShrink: 0 }}
                              disabled={!isLoaded}
                            >
                              {(VOICE_PRESET_OPTIONS[role.id] ?? []).map((opt) => (
                                <option key={opt.key} value={opt.key}>{opt.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Song Selector */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Song Library</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SONG_LIBRARY.map((song) => (
              <button
                key={song.id}
                onClick={() => handleSelectSong(song)}
                style={selectedSong?.id === song.id ? styles.songBtnActive : styles.songBtn}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{song.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{song.artist} · {song.key} · {song.bpm} BPM</div>
              </button>
            ))}
          </div>
        </div>

        {/* Transport + Chord display */}
        {selectedSong && isLoaded && (
          <>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Transport</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handlePlayPause} style={styles.btnPrimary}>
                  {isPlaying && !isPaused ? '⏸ Pause' : '▶ Play'}
                </button>
                <button onClick={handleRestart} style={styles.btn}>
                  ⏮ Restart
                </button>
                <button
                  onClick={handleToggleMute}
                  style={isMutedLocal ? styles.btnActive : styles.btn}
                >
                  {isMutedLocal ? '🔇 Unmute' : '🔊 Mute'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#a1a1b8', fontFamily: 'monospace', marginTop: 4 }}>
                {formatTime(currentTime)} / {formatTime(duration)}
                {liveStatus?.currentChordName && (
                  <span style={{ marginLeft: 12, color: '#f97316', fontWeight: 600 }}>
                    Chord: {liveStatus.currentChordName}
                  </span>
                )}
              </div>
            </div>

            {/* Volume Controls */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Volume</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1b8', width: 60, flexShrink: 0 }}>Backing</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={stemVolume}
                  onChange={(e) => handleStemVolumeChange(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: '#71718a', width: 32, textAlign: 'right' }}>
                  {Math.round(stemVolume * 100)}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#a1a1b8', width: 60, flexShrink: 0 }}>Accomp</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={accompVolume}
                  onChange={(e) => handleAccompVolumeChange(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: '#71718a', width: 32, textAlign: 'right' }}>
                  {Math.round(accompVolume * 100)}%
                </span>
              </div>
            </div>

            {/* Continuous Backing */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Continuous Backing</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={continuousBackingEnabled}
                  onChange={handleContinuousBackingToggle}
                />
                Stems play without blue object
              </label>
              {continuousBackingEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#a1a1b8', width: 60, flexShrink: 0 }}>Level</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={continuousBackingLevel}
                    onChange={(e) => handleContinuousBackingLevelChange(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, color: '#71718a', width: 32, textAlign: 'right' }}>
                    {Math.round(continuousBackingLevel * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Beat Bopping toggle (Session 5 Change ID 7) — beat-snap
                every instrument-mode baton trigger to the song's beat
                grid so triggered notes always land on rhythm.  Head
                Bopping toggle below adds a percussion channel driven by
                head movement; honours the beat-snap setting too. */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Beat Bopping</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
                <input type="checkbox" checked={beatSnap} onChange={handleToggleBeatSnap} />
                Snap instrument-baton notes to the beat
              </label>
              <div style={{ fontSize: 11, color: '#71718a', marginTop: 4 }}>
                Only affects batons in instrument mode and songs with beat analysis.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={headBopEnabled}
                  onChange={(e) => setHeadBopEnabled(e.target.checked)}
                />
                Head bopping (kick on each downward nod)
              </label>
              <div style={{ fontSize: 11, color: '#71718a', marginTop: 4 }}>
                Loads the face tracker the first time you toggle it on.
                Kick fires on each nod, beat-snapped when the toggle
                above is also on.
              </div>
            </div>

            {/* Loop controls */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Loop</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
                <input type="checkbox" checked={loopEnabled} onChange={handleToggleLoop} />
                Loop playback
              </label>
              {loopEnabled && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#71718a', marginTop: 4 }}>
                  <label>
                    Start:
                    <input
                      type="number"
                      value={Math.round(loopStart)}
                      onChange={(e) => handleLoopStartChange(Number(e.target.value))}
                      min={0}
                      max={Math.floor(duration)}
                      step={1}
                      style={styles.numberInput}
                    />s
                  </label>
                  <label>
                    End:
                    <input
                      type="number"
                      value={Math.round(loopEnd)}
                      onChange={(e) => handleLoopEndChange(Number(e.target.value))}
                      min={0}
                      max={Math.ceil(duration)}
                      step={1}
                      style={styles.numberInput}
                    />s
                  </label>
                </div>
              )}
            </div>
          </>
        )}

        {/* Chord / Timing Fine-Tune */}
        {selectedSong && isLoaded && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Chord &amp; Timing</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#a1a1b8', width: 70, flexShrink: 0 }}>Chord offset</span>
              <input
                type="range"
                min={-5}
                max={5}
                step={0.1}
                value={chordOffset}
                onChange={(e) => handleChordOffsetChange(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: '#71718a', width: 40, textAlign: 'right' }}>
                {chordOffset >= 0 ? '+' : ''}{chordOffset.toFixed(1)}s
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#a1a1b8', width: 70, flexShrink: 0 }}>BPM adjust</span>
              <input
                type="range"
                min={-3}
                max={3}
                step={0.1}
                value={bpmAdjust}
                onChange={(e) => handleBpmAdjustChange(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: '#71718a', width: 40, textAlign: 'right' }}>
                {bpmAdjust >= 0 ? '+' : ''}{bpmAdjust.toFixed(1)}
              </span>
            </div>
            <p style={{ ...styles.hint, marginTop: 2 }}>
              Effective BPM: {((selectedSong?.bpm ?? 67) + bpmAdjust).toFixed(1)}
            </p>

            {/* Tap-to-mark chord changes */}
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={handleTapChord}
                  style={{ ...styles.btnPrimary, fontSize: 11, padding: '4px 12px' }}
                  disabled={!isPlaying || isPaused}
                >
                  Tap Chord Change
                </button>
                <button
                  onClick={handleClearTaps}
                  style={{ ...styles.btn, fontSize: 10, padding: '3px 8px' }}
                >
                  Clear
                </button>
                <span style={{ fontSize: 10, color: '#71718a' }}>
                  {tappedTimes.length} marks
                </span>
              </div>
              {tappedTimes.length > 0 && (
                <div style={{
                  marginTop: 4,
                  maxHeight: 80,
                  overflowY: 'auto',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: '#71718a',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 4,
                  padding: '4px 6px',
                }}>
                  [{tappedTimes.map((t) => t.toFixed(2)).join(', ')}]
                </div>
              )}
              <p style={styles.hint}>
                Play the song and tap the button each time you hear a chord change.
                Copy the timestamps to update the chord progression data.
              </p>
            </div>
          </div>
        )}

        {inputMode === 'webcam' && (<>
        {/* Color Calibration */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Color Calibration</h3>
          <p style={styles.hint}>Click a button, then click the coloured object in the video</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {COLOR_ROLES.map((role) => (
              <button
                key={role.id}
                onClick={() => setColorCalMode(role.id)}
                style={{
                  ...styles.btn,
                  fontSize: 10,
                  padding: '4px 8px',
                  borderColor: colorCalState[role.id] ? `${role.cssColor}60` : undefined,
                  color: colorCalState[role.id] ? role.cssColor : undefined,
                }}
              >
                {colorCalState[role.id] ? '✓' : '●'} {role.label}
              </button>
            ))}
          </div>

          {/* Per-colour detection sensitivity sliders (calibrated colours only) */}
          {COLOR_ROLES.filter((r) => colorCalState[r.id]).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {COLOR_ROLES.filter((r) => colorCalState[r.id]).map((role) => {
                const sliderId = `sensitivity-${role.id}`;
                const value = colorSensitivity[role.id];
                return (
                  <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label
                      htmlFor={sliderId}
                      style={{ fontSize: 11, color: role.cssColor, width: 90, flexShrink: 0 }}
                    >
                      {role.label} sensitivity
                    </label>
                    <input
                      id={sliderId}
                      type="range"
                      min={0.0001}
                      max={0.005}
                      step={0.0001}
                      value={value}
                      onChange={(e) => handleColorSensitivityChange(role.id, Number(e.target.value))}
                      style={{ flex: 1 }}
                      aria-label={`${role.label} detection sensitivity (minimum blob area)`}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: '#71718a',
                        width: 56,
                        textAlign: 'right',
                        fontFamily: 'monospace',
                      }}
                    >
                      {value.toFixed(4)}
                    </span>
                  </div>
                );
              })}
              <p style={{ ...styles.hint, marginTop: 2 }}>
                Increase sensitivity (lower number) if small movements are not detected.
                Decrease (higher number) if wrong objects trigger sounds.
              </p>
            </div>
          )}
        </div>

        {/* Range Calibration */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Range Calibration</h3>
          <p style={styles.hint}>Calibrate each colour's movement range (10 s each)</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {COLOR_ROLES.filter(r => colorCalState[r.id]).map((role) => (
              <button
                key={role.id}
                onClick={() => handleCalibrateColor(role.id)}
                style={{ ...styles.btn, fontSize: 10, padding: '4px 8px' }}
                disabled={isCalibrating}
              >
                Cal {role.label}
              </button>
            ))}
            <button onClick={handleClearCalibration} style={{ ...styles.btn, fontSize: 10, padding: '4px 8px' }}>
              Clear All
            </button>
          </div>
        </div>

        {/* Surface Press (opt-in; default off) — coloured objects on a table
            become press triggers. Behind the surfacePressEnabled flag; when
            off the baton path is unchanged. surfaceCalTick re-renders the
            progress hints (which read ref counts). */}
        <div style={styles.section} data-cal-tick={surfaceCalTick}>
          <h3 style={styles.sectionTitle}>Surface Press</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={surfacePressEnabled}
              disabled={!surfaceConfigRef.current}
              onChange={(e) => setSurfacePressEnabled(e.target.checked)}
            />
            Surface press mode {surfaceConfigRef.current ? '' : '(calibrate first)'}
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <button
              onClick={startSurfaceCalibration}
              style={{ ...styles.btn, fontSize: 10, padding: '4px 8px' }}
              disabled={surfaceCalStage !== 'idle'}
            >
              Calibrate surface press
            </button>
            {surfaceCalStage === 'keys' && (
              <>
                <span style={{ fontSize: 11, color: '#0ff' }}>
                  {surfaceKeysRef.current.length} tube(s) — click each, then Done
                </span>
                <button
                  onClick={finishSurfaceCalibration}
                  style={{ ...styles.btn, fontSize: 10, padding: '4px 8px' }}
                  disabled={surfaceKeysRef.current.length === 0}
                >
                  Done
                </button>
              </>
            )}
          </div>
          <p style={styles.hint}>
            Click the MIDDLE of each tube once to register its colour. Then press
            a finger anywhere along a tube to play its note — the whole tube is live.
          </p>

          {/* Per-tube instrument assignment (once calibrated). */}
          {surfaceCalStage === 'idle' && surfaceConfigRef.current && surfaceConfigRef.current.keys.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {surfaceConfigRef.current.keys.map((k, i) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    title={`Tube ${i + 1}`}
                    style={{
                      width: 14, height: 14, borderRadius: 7, flexShrink: 0,
                      background: `hsl(${Math.round(k.color.hue)}, 80%, 50%)`,
                      border: '1px solid rgba(255,255,255,0.4)',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#a1a1b8', width: 48 }}>Tube {i + 1}</span>
                  <select
                    className="form-field__select"
                    value={k.instrumentKey}
                    onChange={(e) => handleSurfaceInstrumentChange(k.id, e.target.value)}
                    aria-label={`Tube ${i + 1} instrument`}
                    style={{ fontSize: 11, flex: 1 }}
                  >
                    {INSTRUMENT_PALETTE_LIST.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Keyboard Test Mode */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Testing</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={keyboardMode}
              onChange={(e) => {
                setKeyboardMode(e.target.checked);
                if (!e.target.checked) setKeyboardActive([]);
              }}
            />
            Keyboard test mode
          </label>
          {keyboardMode && (
            <div style={{ fontSize: 11, color: '#71718a', marginTop: 4 }}>
              Keys 1-5 toggle colours. Mouse = position. Max 2 active.
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {COLOR_ROLES.map((role) => (
                  <span
                    key={role.id}
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      background: keyboardActive.includes(role.id) ? role.cssColor : 'rgba(255,255,255,0.05)',
                      color: keyboardActive.includes(role.id) ? '#000' : '#555570',
                      border: `1px solid ${role.cssColor}40`,
                    }}
                  >
                    {role.keyNumber}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        </>)}

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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1b8', fontSize: 13, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={showNoteNames}
              onChange={(e) => setShowNoteNames(e.target.checked)}
              disabled={!showOverlay}
            />
            Show note name zones
          </label>
        </div>

        {/* Status readout */}
        {isLoaded && liveStatus && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Status</h3>
            <div style={{ fontSize: 12, color: '#a1a1b8', lineHeight: 1.6, fontFamily: 'monospace' }}>
              <div>Active: {liveStatus.activeColors.join(', ') || 'none'}</div>
              <div>Reverb: {Math.round(liveStatus.reverbWet * 100)}%</div>
              <div>Distance: {liveStatus.distance.toFixed(2)}</div>
              <div>Chord: {liveStatus.currentChordName ?? '---'}</div>
              <div>Accomp: {Math.round(liveStatus.accompVolume * 100)}%</div>
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

const MELODY_ZONE_COLORS = ['#a78bfa', '#818cf8', '#60a5fa', '#34d399', '#86efac'];
const MELODY_NOTE_NAMES  = ['D', 'E', 'F#', 'A', 'B'];

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  positions: Map<ColorRole, VoicePosition>,
  status: SongPresetStatus,
  song: SongConfig,
  showNoteNames: boolean,
): void {
  const leftX  = LEFT_THRESHOLD * w;
  const rightX = RIGHT_THRESHOLD * w;
  const activeRoles = status.activeColors;
  const greenPos = positions.get('green');

  // === Melody note zone grid (when green blob visible and note names enabled) ===
  if (showNoteNames && greenPos?.found) {
    const activeZone = Math.min(Math.floor(greenPos.x * 5), 4);
    for (let i = 0; i < 5; i++) {
      const x0 = (i / 5) * w;
      const x1 = ((i + 1) / 5) * w;
      ctx.globalAlpha = i === activeZone ? 0.12 : 0.05;
      ctx.fillStyle = MELODY_ZONE_COLORS[i];
      ctx.fillRect(x0, 0, x1 - x0, h);
    }
    // Zone dividers
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    for (let i = 1; i < 5; i++) {
      const x = (i / 5) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Note name labels at top — update with current chord
    ctx.globalAlpha = 0.8;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const lx = ((i + 0.5) / 5) * w;
      ctx.fillStyle = MELODY_ZONE_COLORS[i];
      ctx.fillText(MELODY_NOTE_NAMES[i], lx, 14);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  } else {
    // Generic X-axis threshold guides when no melody blob
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(leftX, 0);  ctx.lineTo(leftX, h);
    ctx.moveTo(rightX, 0); ctx.lineTo(rightX, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // === Distance line between 2 active objects ===
  if (activeRoles.length >= 2) {
    const p1 = positions.get(activeRoles[0]);
    const p2 = positions.get(activeRoles[1]);
    if (p1?.found && p2?.found) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // === Object markers + callouts ===
  for (const role of COLOR_ROLES) {
    const pos = positions.get(role.id);
    if (pos?.found) {
      const isActive = activeRoles.includes(role.id);
      drawMarker(ctx, pos.x * w, pos.y * h, w, role, pos, isActive, status);
    }
  }

  // === Bottom status strip ===
  ctx.globalAlpha = 0.6;
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(
    `${song.title}  ♩${status.effectiveBpm.toFixed(0)}  ${status.currentChordName ?? '—'}`,
    8,
    h - 8,
  );
  ctx.globalAlpha = 1;
}

/**
 * Surface-press facilitator overlay.
 *
 * Draws each tube's live long-axis line (from its colour blob) and the
 * pressing fingertip(s). Tube axes are raw coords, mirrored to screen via
 * (`1 - x`); fingertips come from HandDetector already in screen space. A
 * tube's line turns red and thickens while it is currently pressed.
 */
function drawSurfaceOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cfg: SurfacePressStored,
  blobs: ColorBlob[],
  pressed: Set<string>,
  hands: HandDetectionResult | null,
): void {
  ctx.save();

  // Each tube's full length, as its live colour-blob principal axis.
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

  // Pressing fingertip(s) — already in screen space (HandDetector mirrors x).
  if (hands) {
    ctx.fillStyle = 'rgba(80,255,140,0.9)';
    for (const hand of [hands.leftHand, hands.rightHand]) {
      const tip = indexFingertip(hand?.landmarks ?? null);
      if (tip) {
        ctx.beginPath();
        ctx.arc(tip.x * w, tip.y * h, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  canvasW: number,
  role: { id: ColorRole; cssColor: string; label: string },
  pos: VoicePosition,
  isActive: boolean,
  status: SongPresetStatus,
): void {
  const radius = isActive ? 18 : 12;
  const color = role.cssColor;

  ctx.globalAlpha = isActive ? 1 : 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = isActive ? 3 : 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.globalAlpha = isActive ? 0.9 : 0.3;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (isActive) {
    let lines: string[];
    if (role.id === 'blue') {
      lines = getBlueMixerLines(status);
    } else {
      const mode = status.batonModes?.[role.id] ?? 'parameter';
      lines =
        mode === 'instrument'
          ? getInstrumentModeLines(role.id, pos, status)
          : mode === 'walk'
            ? getWalkModeLines(role.id, pos, status)
            : getRoleStateLines(role.id, pos, status.voicePresets[role.id] ?? '');
    }
    drawCallout(ctx, x, y, canvasW, color, lines);
  } else {
    // Inactive: just the label
    ctx.globalAlpha = 0.45;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(role.label, x + radius + 4, y + 4);
    ctx.globalAlpha = 1;
  }
}

/** Callout for the blue (stem mixer) baton: current zone + filter %. */
function getBlueMixerLines(status: SongPresetStatus): string[] {
  const zone = status.stemMixerZone;
  const zoneText =
    zone === 'left' ? 'Left zone' :
    zone === 'right' ? 'Right zone' :
    zone === 'center' ? 'Mid zone' :
    '—';
  const filterHz = status.filterHz || 200;
  const filterPct = Math.round(
    Math.max(0, Math.min(100,
      (Math.log(filterHz / 200) / Math.log(8000 / 200)) * 100
    ))
  );
  return [`Mixer: ${zoneText}`, `Filter ${filterPct}%`];
}

/**
 * Callout lines for a baton in instrument mode.  Shows the assigned
 * instrument name and the current pitch zone — same minimal idiom as
 * the parameter-mode callouts so Tim and Chris can read both at a
 * glance during a session.
 */
function getInstrumentModeLines(
  roleId: ColorRole,
  pos: VoicePosition,
  status: SongPresetStatus,
): string[] {
  const instrumentKey = status.batonInstruments?.[roleId] ?? DEFAULT_INSTRUMENT_KEY;
  const entry = INSTRUMENT_PALETTE_BY_KEY[instrumentKey];
  const instrumentLabel = entry?.name ?? instrumentKey;
  // Y → pitch within the chord ladder.  Top = high, bottom = low.
  const pitchHint = pos.y < 0.33 ? 'high' : pos.y > 0.66 ? 'low' : 'mid';
  // X → octave register.  Matches getOctaveShift in InstrumentVoice.
  const octaveHint =
    pos.x < LEFT_THRESHOLD ? 'oct -1' : pos.x > RIGHT_THRESHOLD ? 'oct +1' : 'oct 0';
  return [`♩ ${instrumentLabel}`, `${pitchHint} · ${octaveHint}`];
}

/**
 * Callout for an active baton in walk mode.
 *
 * Walk mode ignores X entirely, so only the instrument label and a
 * Y-based dynamic hint are surfaced — there's no register / zone
 * information to report. Keeps the callout short and consistent with
 * the other instrument-style modes.
 */
function getWalkModeLines(
  roleId: ColorRole,
  pos: VoicePosition,
  status: SongPresetStatus,
): string[] {
  const instrumentKey = status.batonInstruments?.[roleId] ?? DEFAULT_INSTRUMENT_KEY;
  const entry = INSTRUMENT_PALETTE_BY_KEY[instrumentKey];
  const instrumentLabel = entry?.name ?? instrumentKey;
  // Y → dynamics. Top of frame = loud, bottom = soft.
  const dynHint = pos.y < 0.33 ? 'loud' : pos.y > 0.66 ? 'soft' : 'mid';
  return [`♩ ${instrumentLabel} (walk)`, dynHint];
}

function getRoleStateLines(roleId: ColorRole, pos: VoicePosition, preset: string): string[] {
  const x = pos.x;
  const y = pos.y;

  if (roleId === 'green') {
    const zone = Math.min(Math.floor(x * 5), 4);
    const shift = Math.round((0.5 - y) * 2);
    const oct = shift > 0 ? `+${shift} oct` : shift < 0 ? `${shift} oct` : 'mid oct';
    return [`♩ ${MELODY_NOTE_NAMES[zone]}  ${oct}`, preset];
  }
  if (roleId === 'red') {
    const voicing = x < LEFT_THRESHOLD ? 'Close voicing' : x > RIGHT_THRESHOLD ? 'Wide voicing' : 'Std voicing';
    const brightness = Math.round((1 - y) * 100);
    return [voicing, `Filter ${brightness}%`, preset];
  }
  if (roleId === 'yellow') {
    const speed = x < LEFT_THRESHOLD ? 'Slow (♩)' : x > RIGHT_THRESHOLD ? 'Fast (♬)' : 'Mid (♪)';
    const range = y < 0.4 ? '2 oct range' : '1 oct range';
    return [speed, range, preset];
  }
  if (roleId === 'orange') {
    const pattern = x < LEFT_THRESHOLD ? 'Minimal' : x > RIGHT_THRESHOLD ? 'Walking' : 'Driving';
    const tone = Math.round((1 - y) * 100);
    return [`${pattern} bass`, `Tone ${tone}%`, preset];
  }
  return [];
}

function drawCallout(
  ctx: CanvasRenderingContext2D,
  blobX: number,
  blobY: number,
  canvasW: number,
  color: string,
  lines: string[],
): void {
  if (lines.length === 0) return;
  const pad = 6;
  const lineH = 13;
  ctx.font = '10px monospace';
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = textW + pad * 2;
  const boxH = lines.length * lineH + pad * 2 - 2;
  const offset = 22;
  let boxX = blobX + offset;
  if (boxX + boxW > canvasW - 4) boxX = blobX - offset - boxW;
  const boxY = blobY - boxH / 2;

  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#080812';
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#d4d4e8';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxX + pad, boxY + pad + (i + 1) * lineH - 2);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
  stage: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#000',
    minWidth: 0,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: 'scaleX(-1)',
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
    width: 300,
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
  songBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    color: '#a1a1b8',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  songBtnActive: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(249,115,22,0.4)',
    background: 'rgba(249,115,22,0.1)',
    color: '#f97316',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  numberInput: {
    width: 50,
    padding: '2px 4px',
    marginLeft: 4,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)',
    background: '#1a1a24',
    color: '#e2e2e8',
    fontSize: 11,
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
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    color: '#e2e2e8',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#f97316',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  transportBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    background: 'rgba(255,255,255,0.1)',
  },
  transportProgress: {
    height: '100%',
    background: '#22c55e',
    transition: 'width 200ms linear',
  },
};

export default SongPresetScreen;
