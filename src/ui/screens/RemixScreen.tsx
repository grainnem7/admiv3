/**
 * RemixScreen — camera + touch input screen driving RemixEngine.
 *
 * Two input paths:
 *   Webcam: ColorTracker tracking up to 5 colour roles; click-to-calibrate.
 *   Touch:  usePadState single-pointer pad; uses the 'red' ColorRole.
 *
 * Per frame:
 *   1. Build baton inputs from camera blobs or touch pad state.
 *   2. For each input, get/create a RemixBaton, call baton.update().
 *   3. Call engine.applyBaton() for each output.
 *   4. Call engine.renderFrame(transport.seconds) once.
 *   5. Read engine.getStemStates() once and render the 4 stem tiles.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { ColorTracker } from '../../tracking/ColorTracker';
import type { ColorBlob } from '../../tracking/ColorTracker';
import { FaceDetector } from '../../tracking/FaceDetector';
import { RemixEngine } from '../../remix/RemixEngine';
import type { RemixStemState } from '../../remix/RemixEngine';
import { RemixBaton } from '../../remix/RemixBaton';
import type { StemId } from '../../remix/RemixBaton';
import { STEM_CYCLE_ORDER } from '../../remix/RemixBaton';
import { BatonTouchDetector } from '../../remix/BatonTouchDetector';
import { RemixLoopBaton } from '../../remix/RemixLoopBaton';
import { keyToRemixAction } from '../../remix/remixKeyMap';
import { SONG_LIBRARY, COLOR_ROLES } from '../../songs/songLibrary';
import type { SongConfig, ColorRole } from '../../songs/songLibrary';
import { usePadState } from './songPreset/usePadState';
import type { AxisRange } from '../../remix/batonCalibration';

// ============================================
// Constants
// ============================================

/** ColorRole used for the single touch baton. */
const TOUCH_BATON_ROLE: ColorRole = 'red';

/** ColorRole dedicated to the loop-layer baton (not a stem). */
const LOOP_BATON_ROLE: ColorRole = 'orange';

/** Duration (ms) of the cycle-flash highlight on the destination tile. */
const CYCLE_FLASH_MS = 300;

/** Human-readable label + accent colour for each stem tile. */
const STEM_META: Record<StemId, { label: string; color: string }> = {
  vocals: { label: 'Vocals', color: '#a78bfa' },
  drums:  { label: 'Drums',  color: '#f97316' },
  bass:   { label: 'Bass',   color: '#3b82f6' },
  other:  { label: 'Other',  color: '#22c55e' },
};

// ============================================
// Component
// ============================================

export default function RemixScreen() {
  // ---- Refs ----
  const videoRef      = useRef<HTMLVideoElement>(null);
  const cameraRef     = useRef<CameraManager | null>(null);
  const trackerRef    = useRef<ColorTracker | null>(null);
  const engineRef     = useRef(new RemixEngine());
  /**
   * Face detector for Head Nod → drums (Tim's gross-motor replacement for the
   * shake gesture).  Lazily started — only initialised when the user toggles
   * head-nod on, so users who don't want it don't pay the MediaPipe
   * face-landmarker load cost.
   */
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  /** Latest blobs from ColorTracker callback — written off the RAF path. */
  const blobsRef      = useRef<ColorBlob[]>([]);
  /**
   * Per-role RemixBaton instances.  Lazily created on first frame a given
   * colour is seen.  Kept in a ref so Task 9 can read baton state (e.g.
   * dwellProgress) without prop-drilling.
   */
  const batonsRef     = useRef<Map<ColorRole, RemixBaton>>(new Map());
  /** Track last baton outputs so Task 9 can extend (dwell ring, cycle flash). */
  const lastOutputsRef = useRef<Map<ColorRole, ReturnType<RemixBaton['update']>>>(new Map());
  const rafRef        = useRef<number | null>(null);
  /**
   * Per-frame "found" flag per role.  Written inside the RAF loop; read during
   * render to derive activeBatonRoles.  Using a separate map (not lastOutputsRef)
   * avoids the stale-non-null problem: a role not seen this frame is explicitly
   * false, so tiles go latched as soon as the baton leaves.
   */
  const lastFoundRef  = useRef<Map<ColorRole, boolean>>(new Map());
  /**
   * Per-role timestamp (performance.now()) of the last observed cycled=true frame.
   * Used to compute cycle-flash opacity without React state or setTimeout.
   * Flash is active while (now - flashTime) < CYCLE_FLASH_MS.
   */
  const cycleFlashRef = useRef<Map<ColorRole, number>>(new Map());
  /** BatonTouchDetector for the two-baton touch-to-cycle gesture. */
  const touchDetectorRef = useRef(new BatonTouchDetector({ touchRadius: 0.12, cooldownMs: 600 }));
  /**
   * Last two "present" baton centroids used for the touch proximity visual.
   * Written each RAF frame; read in render.
   */
  const lastTouchPairRef = useRef<{
    a: { x: number; y: number; role: ColorRole } | null;
    b: { x: number; y: number; role: ColorRole } | null;
    withinRadius: boolean;
  }>({ a: null, b: null, withinRadius: false });

  // ---- Touch pad ----
  const { state: padState, bind: padBind, reset: resetPad } = usePadState();
  const padStateRef = useRef(padState);
  useEffect(() => { padStateRef.current = padState; }, [padState]);

  /**
   * usePadState's padReducer deliberately keeps held:true after pointer-up
   * ("persist-on-lift") — this is the StemMixerTouchPad contract, pinned by
   * its own tests.  RemixScreen needs the opposite: latch-on-release.  We
   * achieve this without touching usePadState by calling resetPad() after the
   * original onPointerUp/onPointerCancel handlers.  After reset, state becomes
   * INITIAL_PAD_STATE (held:false), so the RAF builds found:false, baton.update
   * returns filterNorm:null, engine.applyBaton no-ops, and the stem latches.
   */
  const handlePadPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      padBind.onPointerUp(e);
      resetPad();
    },
    [padBind, resetPad],
  );

  // ---- Baton-touch + dwell toggles ----
  const [batonTouchEnabled,  setBatonTouchEnabled]  = useState(true);
  const [dwellCycleEnabled,  setDwellCycleEnabled]  = useState(true);
  const [touchRadius,        setTouchRadius]        = useState(0.12);

  /**
   * Head Nod → drums toggle.  When on, a FaceDetector is started and each
   * detected downward head nod fires a percussion hit — Tim's gross-motor
   * replacement for the shake gesture.
   */
  const [headNodEnabled,      setHeadNodEnabled]      = useState(false);

  // ---- Percussion controls ----
  const [percussionEnabled, setPercussionEnabled] = useState(false);
  const [percussionVolume,  setPercussionVolume]  = useState(0.8);
  // Refs so handleSelectSong (useCallback []) can read current values without stale closure.
  const percussionEnabledRef = useRef(false);
  const percussionVolumeRef  = useRef(0.8);
  useEffect(() => { percussionEnabledRef.current = percussionEnabled; }, [percussionEnabled]);
  useEffect(() => { percussionVolumeRef.current  = percussionVolume;  }, [percussionVolume]);

  // ---- Loop baton + loop layer ----
  const loopBatonRef       = useRef(new RemixLoopBaton());
  const loopInfoRef        = useRef<{ count: number; activeIndex: number; names: string[] }>({ count: 0, activeIndex: 0, names: [] });
  const loopPresentRef     = useRef(false);
  const loopActiveIndexRef = useRef(0);
  const [loopInfo, setLoopInfo]       = useState<{ count: number; activeIndex: number; names: string[] }>({ count: 0, activeIndex: 0, names: [] });
  const [loopPresent, setLoopPresent] = useState(false);
  const [headNodMinExcursion, setHeadNodMinExcursion] = useState(0.025);
  const [headNodCooldownMs,   setHeadNodCooldownMs]   = useState(200);
  const batonTouchEnabledRef = useRef(true);
  const dwellCycleEnabledRef = useRef(true);
  const touchRadiusRef       = useRef(0.12);
  useEffect(() => { batonTouchEnabledRef.current = batonTouchEnabled; }, [batonTouchEnabled]);
  useEffect(() => { touchRadiusRef.current       = touchRadius;       }, [touchRadius]);
  useEffect(() => {
    dwellCycleEnabledRef.current = dwellCycleEnabled;
    // Propagate live to all existing batons
    for (const baton of batonsRef.current.values()) {
      baton.setDwellCycleEnabled(dwellCycleEnabled);
    }
  }, [dwellCycleEnabled]);

  // ---- UI state ----
  const [inputMode,    setInputMode]    = useState<'webcam' | 'touch'>('webcam');
  const [isInit,       setIsInit]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<SongConfig | null>(null);
  const [loadingMsg,   setLoadingMsg]   = useState<string | null>(null);
  const [isLoaded,     setIsLoaded]     = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);

  // Color calibration
  const [colorCalState,  setColorCalState]  = useState<Record<ColorRole, boolean>>({
    blue: false, red: false, green: false, yellow: false, orange: false,
  });
  const [colorCalMode,   setColorCalMode]   = useState<ColorRole | null>(null);
  const colorCalModeRef = useRef<ColorRole | null>(null);
  useEffect(() => { colorCalModeRef.current = colorCalMode; }, [colorCalMode]);

  // Per-colour sensitivity (mirrors SongPresetScreen)
  const [colorSensitivity, setColorSensitivity] = useState<Record<ColorRole, number>>({
    blue: 0.0005, red: 0.0005, green: 0.0005, yellow: 0.0005, orange: 0.0005,
  });

  /**
   * Stem-tile visual state — updated every ~10 frames via setInterval-
   * style frame-counter.  We store the whole Record so the render always
   * has a coherent snapshot; initialise to zeros so the tiles show
   * immediately even before playback starts.
   */
  const [stemStates, setStemStates] = useState<Record<StemId, RemixStemState>>(() => {
    const out = {} as Record<StemId, RemixStemState>;
    for (const s of STEM_CYCLE_ORDER) {
      out[s] = { filterNorm: 0, targetFilterNorm: 0, gain: 0 };
    }
    return out;
  });
  const frameCountRef = useRef(0);

  // ---- Range calibration ----
  /** Reach margin applied to all batons (0–0.3). */
  const [reachMargin, setReachMargin] = useState(0.1);
  const reachMarginRef = useRef(0.1);
  /** Whether a range-capture session is currently active. */
  const [calibratingRange, setCalibratingRange] = useState(false);
  const calibratingRangeRef = useRef(false);
  /** Countdown seconds remaining during capture (for display). */
  const [calCountdown, setCalCountdown] = useState(0);
  /** Captured per-role axis ranges (persisted for the session). */
  const capturedRangesRef = useRef<Map<ColorRole, { x: AxisRange; y: AxisRange }>>(new Map());
  /**
   * Accumulator for the current capture session.
   * Per role: tracks running min/max of x and y.
   */
  const calAccRef = useRef<Map<ColorRole, { xMin: number; xMax: number; yMin: number; yMax: number }>>(new Map());
  /** Handle for the capture-end setTimeout — cleared on unmount. */
  const calTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Handle for the countdown setInterval — cleared on unmount. */
  const calTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Roles that have captured range data — drives the status message in render. */
  const [capturedRoles, setCapturedRoles] = useState<ColorRole[]>([]);

  // Beat dot: derive beat phase from Tone transport once we have beats.
  const [beatPhase,  setBeatPhase]  = useState(0); // 0–1 across one beat

  // Keyboard test mode
  const [keyboardMode,       setKeyboardMode]       = useState(false);
  const [focusedStemIndex,   setFocusedStemIndex]   = useState<0 | 1 | 2 | 3>(0);
  const [loopLengthBars,     setLoopLengthBars]     = useState<0 | 4 | 8 | 16>(8);
  // Song duration in seconds (derived after load)
  const [songDurationSec,    setSongDurationSec]    = useState(0);
  // Loop timeline display — updated each render frame alongside stemStates
  const [loopRegionDisplay,  setLoopRegionDisplay]  = useState<{
    startSec: number; endSec: number; lengthBars: number; originBar: number;
  } | null>(null);
  const [transportSec,       setTransportSec]       = useState(0);
  // Refs so keyboard handler sees current values without stale closure
  const focusedStemIndexRef  = useRef<0 | 1 | 2 | 3>(0);
  const loopLengthBarsRef    = useRef<0 | 4 | 8 | 16>(8);
  const keyboardModeRef      = useRef(false);
  useEffect(() => { focusedStemIndexRef.current  = focusedStemIndex;  }, [focusedStemIndex]);
  useEffect(() => { loopLengthBarsRef.current    = loopLengthBars;    }, [loopLengthBars]);
  useEffect(() => { keyboardModeRef.current      = keyboardMode;      }, [keyboardMode]);
  useEffect(() => { reachMarginRef.current       = reachMargin;       }, [reachMargin]);
  useEffect(() => { calibratingRangeRef.current  = calibratingRange;  }, [calibratingRange]);

  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // ============================================
  // Camera + tracker init
  // ============================================

  useEffect(() => {
    if (inputMode !== 'webcam') {
      setIsInit(true);
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
        trackerRef.current = tracker;

        unsubTracking = tracker.onTracking((output) => {
          blobsRef.current = output.blobs;
        });

        tracker.start(video);

        if (!cancelled) setIsInit(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Camera failed');
      }
    };

    init();

    return () => {
      cancelled = true;
      trackerRef.current?.stop();
      trackerRef.current?.dispose();
      trackerRef.current = null;
      cameraRef.current?.stop();
      cameraRef.current = null;
      unsubTracking?.();
    };
  }, [inputMode]);

  // Dispose engine once on unmount (separate from camera effect so engine
  // survives input-mode switches).  Also clear any in-flight capture timers
  // so setState is never called after unmount.
  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      engine.dispose();
      if (calTimerRef.current !== null) {
        clearTimeout(calTimerRef.current);
        calTimerRef.current = null;
      }
      if (calTickRef.current !== null) {
        clearInterval(calTickRef.current);
        calTickRef.current = null;
      }
    };
  }, []);

  // Head Nod lifecycle.  When toggled on, lazily initialise the FaceDetector
  // (loads MediaPipe face-landmarker model on first use), start it on the
  // video element, and push each frame's landmarks into the engine.  When
  // toggled off, stop the detector but keep it alive — the model is expensive
  // to load, so re-toggling shouldn't pay that cost again.
  useEffect(() => {
    const engine = engineRef.current;
    engine.setHeadNodEnabled(headNodEnabled);
    if (!headNodEnabled) {
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
        console.error('[RemixScreen] Face detector init failed:', err);
        setHeadNodEnabled(false);
      }
    };

    void startFace();

    return () => {
      cancelled = true;
      unsub?.();
      faceDetectorRef.current?.stop();
    };
  }, [headNodEnabled]);

  // Dispose the FaceDetector entirely on unmount (the lifecycle effect above
  // only stops it on toggle-off so the model stays cached).
  useEffect(() => {
    return () => {
      faceDetectorRef.current?.dispose();
      faceDetectorRef.current = null;
    };
  }, []);

  // Apply sensitivity whenever the sliders change (also applied on enable via
  // the headNodEnabled effect, which always sets enabled=true before the
  // detector starts, so we don't need a combined effect).
  useEffect(() => {
    engineRef.current.setHeadNodSensitivity(headNodMinExcursion, headNodCooldownMs);
  }, [headNodMinExcursion, headNodCooldownMs]);

  // ============================================
  // Main RAF loop
  // ============================================

  useEffect(() => {
    if (!isInit) return;
    let running = true;

    const loop = () => {
      if (!running) return;

      const nowMs = performance.now();
      const engine = engineRef.current;

      // --- Build baton inputs ---
      // Clear per-frame found map so roles not seen this frame are false.
      lastFoundRef.current.clear();

      if (inputMode === 'touch') {
        const pad = padStateRef.current;
        const role = TOUCH_BATON_ROLE;
        let baton = batonsRef.current.get(role);
        if (!baton) {
          baton = new RemixBaton(role);
          // Apply current dwell-cycle toggle to newly-created batons
          baton.setDwellCycleEnabled(dwellCycleEnabledRef.current);
          batonsRef.current.set(role, baton);
        }
        const found = pad.held;
        // Apply captured calibration live, before update
        const capturedRange = capturedRangesRef.current.get(role);
        baton.setCalibration(
          { x: capturedRange?.x ?? null, y: capturedRange?.y ?? null },
          reachMarginRef.current,
        );
        // Accumulate raw positions during capture
        if (calibratingRangeRef.current && found) {
          const acc = calAccRef.current.get(role) ?? { xMin: pad.x, xMax: pad.x, yMin: pad.y, yMax: pad.y };
          acc.xMin = Math.min(acc.xMin, pad.x);
          acc.xMax = Math.max(acc.xMax, pad.x);
          acc.yMin = Math.min(acc.yMin, pad.y);
          acc.yMax = Math.max(acc.yMax, pad.y);
          calAccRef.current.set(role, acc);
        }
        const out = baton.update({ x: pad.x, y: pad.y, found }, nowMs);
        lastOutputsRef.current.set(role, out);
        lastFoundRef.current.set(role, found);
        if (out.cycled) cycleFlashRef.current.set(role, nowMs);
        engine.applyBaton(out);
        if (out.shake) engine.triggerPercussion(Tone.getTransport().seconds, 0.9);
      } else {
        // Camera mode: iterate all tracked colour roles
        const blobs = blobsRef.current;
        for (const role of COLOR_ROLES) {
          const blob = blobs.find((b) => b.colorId === role.id);
          // Mirror X (video is CSS-mirrored) to match SongPresetScreen convention
          const found = blob?.found ?? false;
          const x = found ? 1 - (blob?.x ?? 0.5) : 0.5;
          const y = found ? (blob?.y ?? 0.5) : 0.5;

          // Loop baton: routes to the loop LAYER, not a stem.
          if (role.id === LOOP_BATON_ROLE) {
            const lb = loopBatonRef.current;
            const capturedRange = capturedRangesRef.current.get(role.id);
            lb.setCalibration(capturedRange?.x ?? null, capturedRange?.y ?? null);
            // Accumulate raw range during calibration capture (same convention as stems).
            if (found && calibratingRangeRef.current) {
              const rawX = blob?.x ?? 0.5;
              const acc = calAccRef.current.get(role.id) ?? { xMin: rawX, xMax: rawX, yMin: y, yMax: y };
              acc.xMin = Math.min(acc.xMin, rawX);
              acc.xMax = Math.max(acc.xMax, rawX);
              acc.yMin = Math.min(acc.yMin, y);
              acc.yMax = Math.max(acc.yMax, y);
              calAccRef.current.set(role.id, acc);
            }
            // In keyboard test mode the keyboard owns the loop layer; the camera
            // path must not drive it (an absent orange blob would otherwise send
            // present:false every frame and disable what the keyboard enabled).
            if (!keyboardModeRef.current) {
              const lout = lb.process(found ? { x, y } : null);
              engine.applyLoopBaton(lout);
              lastFoundRef.current.set(role.id, found);
              loopPresentRef.current = lout.present;
              if (lout.present) loopActiveIndexRef.current = lout.loopIndex;
            }
            continue;
          }

          if (!found) {
            // Only update existing batons; don't create one for absent colours
            const baton = batonsRef.current.get(role.id);
            if (baton) {
              // Apply captured calibration live, before update
              const capturedRange = capturedRangesRef.current.get(role.id);
              baton.setCalibration(
                { x: capturedRange?.x ?? null, y: capturedRange?.y ?? null },
                reachMarginRef.current,
              );
              const out = baton.update({ x, y, found: false }, nowMs);
              lastOutputsRef.current.set(role.id, out);
              lastFoundRef.current.set(role.id, false);
              // out.cycled is always false when found=false, but guard for safety
              if (out.cycled) cycleFlashRef.current.set(role.id, nowMs);
              engine.applyBaton(out);
              if (out.shake) engine.triggerPercussion(Tone.getTransport().seconds, 0.9);
            }
            continue;
          }

          // Colour present — lazily create baton
          let baton = batonsRef.current.get(role.id);
          if (!baton) {
            baton = new RemixBaton(role.id);
            // Apply current dwell-cycle toggle to newly-created batons
            baton.setDwellCycleEnabled(dwellCycleEnabledRef.current);
            batonsRef.current.set(role.id, baton);
          }
          // Apply captured calibration live, before update
          const capturedRange = capturedRangesRef.current.get(role.id);
          baton.setCalibration(
            { x: capturedRange?.x ?? null, y: capturedRange?.y ?? null },
            reachMarginRef.current,
          );
          // Accumulate raw positions during capture (pre-mirror x to stay in tracker space)
          if (calibratingRangeRef.current) {
            const rawX = blob?.x ?? 0.5; // raw tracker x (before mirror)
            const acc = calAccRef.current.get(role.id) ?? { xMin: rawX, xMax: rawX, yMin: y, yMax: y };
            acc.xMin = Math.min(acc.xMin, rawX);
            acc.xMax = Math.max(acc.xMax, rawX);
            acc.yMin = Math.min(acc.yMin, y);
            acc.yMax = Math.max(acc.yMax, y);
            calAccRef.current.set(role.id, acc);
          }
          const out = baton.update({ x, y, found }, nowMs);
          lastOutputsRef.current.set(role.id, out);
          lastFoundRef.current.set(role.id, true);
          if (out.cycled) cycleFlashRef.current.set(role.id, nowMs);
          engine.applyBaton(out);
          if (out.shake) engine.triggerPercussion(Tone.getTransport().seconds, 0.9);
        }
      }

      // --- Baton-touch detection ---
      // Gather the two highest-priority PRESENT baton centroids (COLOR_ROLES order).
      // In touch mode only one baton exists, so touch detection naturally no-ops.
      {
        const presentPair: { centroid: { x: number; y: number; found: boolean }; role: ColorRole; baton: RemixBaton }[] = [];
        for (const role of COLOR_ROLES) {
          if (presentPair.length >= 2) break;
          const b = batonsRef.current.get(role.id);
          if (!b) continue;
          const c = b.centroid();
          if (c.found) presentPair.push({ centroid: c, role: role.id, baton: b });
        }
        if (presentPair.length >= 2) {
          const aEntry = presentPair[0];
          const bEntry = presentPair[1];
          const dx = aEntry.centroid.x - bEntry.centroid.x;
          const dy = aEntry.centroid.y - bEntry.centroid.y;
          const within = Math.sqrt(dx * dx + dy * dy) <= touchRadiusRef.current;
          lastTouchPairRef.current = {
            a: { x: aEntry.centroid.x, y: aEntry.centroid.y, role: aEntry.role },
            b: { x: bEntry.centroid.x, y: bEntry.centroid.y, role: bEntry.role },
            withinRadius: within,
          };
          if (batonTouchEnabledRef.current) {
            const fired = touchDetectorRef.current.update(aEntry.centroid, bEntry.centroid, nowMs);
            if (fired) {
              // PRIMARY = higher-priority baton (first in COLOR_ROLES order = aEntry)
              const primaryBaton = aEntry.baton;
              const primaryRole  = aEntry.role;
              const newStem = primaryBaton.forceCycle();
              cycleFlashRef.current.set(primaryRole, nowMs);
              const filterNorm = 1 - Math.min(1, Math.max(0, primaryBaton.centroid().y));
              engine.applyBaton({ stem: newStem, filterNorm, cycled: true, shake: false, dwellProgress: 0 });
              engine.setFocusedStem(newStem);
            }
          }
        } else {
          // Fewer than two batons present — clear proximity visual
          lastTouchPairRef.current = { a: null, b: null, withinRadius: false };
        }
      }

      // --- Render frame (audio) ---
      engine.renderFrame(Tone.getTransport().seconds);

      // --- Read stem states ONCE per frame ---
      const states = engine.getStemStates();

      // --- Update React state periodically (~10 fps feels smooth for tiles) ---
      frameCountRef.current++;
      if (frameCountRef.current % 6 === 0) {
        setStemStates(states);
        setIsPlaying(engine.isPlaying());
        setLoopRegionDisplay(engine.getLoopRegion());
        setTransportSec(Tone.getTransport().seconds);

        if (loopInfoRef.current.count > 0) {
          setLoopPresent(loopPresentRef.current);
          if (loopActiveIndexRef.current !== loopInfoRef.current.activeIndex) {
            const nextLoopInfo = { ...loopInfoRef.current, activeIndex: loopActiveIndexRef.current };
            loopInfoRef.current = nextLoopInfo;
            setLoopInfo(nextLoopInfo);
          }
        }

        // Beat dot: find next beat after current playback position
        const nowSec = Tone.getTransport().seconds;
        // We use states reference only for rendering; beat calc is local.
        // (states is only used for setStemStates above — keep this separate.)
        if (selectedSong) {
          const beats = (selectedSong as SongConfig & { beats?: number[] }).beats;
          if (beats && beats.length > 0) {
            // Find the beat interval we're currently in
            let phase = 0;
            for (let i = 0; i < beats.length - 1; i++) {
              if (nowSec >= beats[i] && nowSec < beats[i + 1]) {
                const interval = beats[i + 1] - beats[i];
                phase = interval > 0 ? (nowSec - beats[i]) / interval : 0;
                break;
              }
            }
            setBeatPhase(phase);
          } else if (selectedSong.bpm > 0) {
            // Fallback: derive beat phase from BPM
            const beatDur = 60 / selectedSong.bpm;
            setBeatPhase((nowSec % beatDur) / beatDur);
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isInit, inputMode, selectedSong]);

  // ============================================
  // Song loading
  // ============================================

  const handleSelectSong = useCallback(async (song: SongConfig) => {
    setSelectedSong(song);
    setIsLoaded(false);
    setLoadingMsg(`Loading stems… 0/${Object.keys(song.stems).length}`);
    const engine = engineRef.current;
    try {
      await engine.loadSong(song);
      setIsLoaded(true);
      setLoadingMsg(null);
      // Derive song duration from the off-loop region (loopLen=0 ⇒ endSec = full duration).
      // We temporarily read at loopLen=0 then restore the previous length.
      const currentLen = engine.getLoopRegion()?.lengthBars ?? 8;
      engine.setLoopLengthBars(0);
      const fullRegion = engine.getLoopRegion();
      const dur = fullRegion?.endSec ?? 0;
      setSongDurationSec(dur);
      // Restore loop length
      const restoredLen = currentLen as 0 | 4 | 8 | 16;
      engine.setLoopLengthBars(restoredLen);
      // Sync state to what engine actually set after load
      const afterRegion = engine.getLoopRegion();
      const effectiveLen = afterRegion?.lengthBars ?? 0;
      setLoopLengthBars(effectiveLen as 0 | 4 | 8 | 16);
      loopLengthBarsRef.current = effectiveLen as 0 | 4 | 8 | 16;
      // Re-apply percussion layer state to the freshly-rebuilt layer
      // (loadSong rebuilds it disabled at default volume).
      engine.setLayerVolume('percussion', percussionVolumeRef.current);
      engine.setLayerEnabled('percussion', percussionEnabledRef.current);
      // Initialise the loop baton + UI from the freshly-built loop layer.
      const loopInfoNow = engine.getLoopInfo();
      loopBatonRef.current.setLoopCount(Math.max(1, loopInfoNow.count));
      loopActiveIndexRef.current = loopInfoNow.activeIndex;
      loopPresentRef.current = false;
      loopInfoRef.current = loopInfoNow;
      setLoopInfo(loopInfoNow);
      setLoopPresent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load song');
      setLoadingMsg(null);
    }
  }, []);

  // ============================================
  // Transport handlers
  // ============================================

  const handlePlay = useCallback(async () => {
    await Tone.start();
    engineRef.current.play();
    setIsPlaying(true);
  }, []);

  const handleStop = useCallback(() => {
    engineRef.current.stop();
    setIsPlaying(false);
  }, []);

  const handleRestart = useCallback(async () => {
    engineRef.current.stop();
    await Tone.start();
    engineRef.current.play();
    setIsPlaying(true);
  }, []);

  // ============================================
  // Color calibration (mirrors SongPresetScreen)
  // ============================================

  const handleVideoAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const mode = colorCalModeRef.current;
    if (!mode || !trackerRef.current || !videoRef.current) return;

    const videoEl = videoRef.current;
    const rect = videoEl.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) / rect.width;
    const y       = (e.clientY - rect.top)  / rect.height;
    if (screenX < 0 || screenX > 1 || y < 0 || y > 1) return;

    // Video is CSS-mirrored — flip X back to raw video coords for pixel sampling
    const rawX = 1 - screenX;
    trackerRef.current.calibrateFromPixel(videoEl, rawX, y, mode);

    setColorCalState((prev) => ({ ...prev, [mode]: true }));
    setColorSensitivity((prev) => ({ ...prev, [mode]: 0.0005 }));
    setColorCalMode(null);
  }, []);

  const handleColorSensitivityChange = useCallback((role: ColorRole, minArea: number) => {
    setColorSensitivity((prev) => ({ ...prev, [role]: minArea }));
    const tracker = trackerRef.current;
    if (!tracker) return;
    const existing = tracker.getColor(role);
    if (!existing) return;
    tracker.addColor({ ...existing, minArea });
  }, []);

  // ============================================
  // Range calibration handlers
  // ============================================

  const CAPTURE_DURATION_MS = 5000;

  const handleStartRangeCalibration = useCallback(() => {
    // Reset accumulator and start capture
    calAccRef.current.clear();
    calibratingRangeRef.current = true;
    setCalibratingRange(true);
    setCalCountdown(5);

    // Countdown ticks
    let remaining = 4;
    calTickRef.current = setInterval(() => {
      setCalCountdown(remaining);
      remaining--;
    }, 1000);

    // End capture after CAPTURE_DURATION_MS
    calTimerRef.current = setTimeout(() => {
      if (calTickRef.current !== null) {
        clearInterval(calTickRef.current);
        calTickRef.current = null;
      }
      calTimerRef.current = null;
      calibratingRangeRef.current = false;
      setCalibratingRange(false);
      setCalCountdown(0);

      // Write accumulated ranges to capturedRangesRef
      calAccRef.current.forEach((acc, role) => {
        capturedRangesRef.current.set(role, {
          x: { min: acc.xMin, max: acc.xMax },
          y: { min: acc.yMin, max: acc.yMax },
        });
      });
      // Update state so render reflects captured roles immediately
      setCapturedRoles(Array.from(capturedRangesRef.current.keys()));
    }, CAPTURE_DURATION_MS);
  }, []);

  // ============================================
  // Keyboard test mode handler (mirrors SongPresetScreen pattern)
  // ============================================

  useEffect(() => {
    if (!keyboardMode) return;

    const LOOP_LENGTH_CYCLE: (0 | 4 | 8 | 16)[] = [0, 4, 8, 16];

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = keyToRemixAction(e.key);
      if (!action) return;
      e.preventDefault();
      const engine = engineRef.current;

      if (action.kind === 'focusStem') {
        const idx = action.index;
        focusedStemIndexRef.current = idx;
        setFocusedStemIndex(idx);
        engine.setFocusedStem(STEM_CYCLE_ORDER[idx]);
      } else if (action.kind === 'filter') {
        const stem = STEM_CYCLE_ORDER[focusedStemIndexRef.current];
        const cur  = engine.getStemFilterNorm(stem);
        const next = Math.max(0, Math.min(1, cur + action.dir * 0.1));
        engine.setStemFilterNorm(stem, next);
      } else if (action.kind === 'percussion') {
        engine.triggerPercussion(Tone.getTransport().seconds, 0.8);
      } else if (action.kind === 'nudgeLoop') {
        engine.nudgeLoop(action.dir);
      } else if (action.kind === 'loopLen') {
        const cur    = loopLengthBarsRef.current;
        const curIdx = LOOP_LENGTH_CYCLE.indexOf(cur);
        const nextIdx = Math.max(0, Math.min(LOOP_LENGTH_CYCLE.length - 1, curIdx + action.dir));
        const next   = LOOP_LENGTH_CYCLE[nextIdx];
        engine.setLoopLengthBars(next);
        loopLengthBarsRef.current = next;
        setLoopLengthBars(next);
      } else if (action.kind === 'cycleLoop') {
        const info = engine.getLoopInfo();
        if (info.count > 0) {
          const next = (info.activeIndex + 1) % info.count;
          engine.selectLoop(next);
          engine.setLayerEnabled('loop', true); // keyboard test mode brings the loop in
          loopBatonRef.current.setLoopCount(info.count);
          loopActiveIndexRef.current = next;
          loopPresentRef.current = true;
          const updated = { ...info, activeIndex: next };
          loopInfoRef.current = updated;
          setLoopInfo(updated);
          setLoopPresent(true);
        }
      } else if (action.kind === 'togglePlay') {
        void Tone.start().then(() => { engine.togglePlay(); });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [keyboardMode]);

  // ============================================
  // Navigation
  // ============================================

  const handleBack = useCallback(() => {
    engineRef.current.stop();
    resetPad();
    setCurrentScreen('performance');
  }, [setCurrentScreen, resetPad]);

  // ============================================
  // Derived render data
  // ============================================

  /**
   * Which roles have an active baton THIS frame (found:true in the most recent
   * RAF tick).  Derived from lastFoundRef (written each frame) rather than
   * lastOutputsRef.filterNorm, which would stay non-null after a baton lifts
   * and make tiles show LIVE permanently.
   */
  const activeBatonRoles: ColorRole[] = [];
  for (const [role, found] of lastFoundRef.current) {
    if (found) activeBatonRoles.push(role);
  }

  // ============================================
  // Render
  // ============================================

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
    <div id="main-content" style={styles.container}>

      {/* ---- Stage (left panel) ---- */}
      <div style={styles.stage}>

        {/* Stem tiles */}
        <div style={styles.stemGrid}>
          {STEM_CYCLE_ORDER.map((stem, stemIdx) => {
            const state  = stemStates[stem];
            const meta   = STEM_META[stem];
            const filterN = state?.filterNorm ?? 0;
            const isFocused = keyboardMode && focusedStemIndex === stemIdx;

            // Collect ALL baton roles assigned to this stem (two batons may share a tile).
            const assignedRoles: ColorRole[] = [];
            for (const [role, baton] of batonsRef.current) {
              if (baton.assignedStem === stem) assignedRoles.push(role);
            }
            // Primary role for border/bar colour (first found; preserved Task-8 behaviour).
            const assignedRole: ColorRole | null = assignedRoles[0] ?? null;
            const isLive = assignedRoles.some((r) => activeBatonRoles.includes(r));
            const assignedColor = assignedRole
              ? (COLOR_ROLES.find((r) => r.id === assignedRole)?.cssColor ?? meta.color)
              : meta.color;

            // ---- Cycle flash ----
            // Active when any role that currently occupies this stem flashed within CYCLE_FLASH_MS.
            const nowMs = performance.now();
            let cycleFlashOpacity = 0;
            let cycleFlashColor = '#ffffff';
            for (const role of assignedRoles) {
              const flashTime = cycleFlashRef.current.get(role);
              if (flashTime !== undefined) {
                const elapsed = nowMs - flashTime;
                if (elapsed < CYCLE_FLASH_MS) {
                  // Fade from 1 → 0 over the window
                  const opacity = 1 - elapsed / CYCLE_FLASH_MS;
                  if (opacity > cycleFlashOpacity) {
                    cycleFlashOpacity = opacity;
                    cycleFlashColor = COLOR_ROLES.find((r) => r.id === role)?.cssColor ?? '#ffffff';
                  }
                }
              }
            }

            // ---- Dwell progress ----
            // Collect dwell progress for each present baton on this stem.
            const dwellEntries: { role: ColorRole; progress: number; color: string }[] = [];
            for (const role of assignedRoles) {
              if (!activeBatonRoles.includes(role)) continue;
              const out = lastOutputsRef.current.get(role);
              if (out && out.dwellProgress > 0) {
                dwellEntries.push({
                  role,
                  progress: out.dwellProgress,
                  color: COLOR_ROLES.find((r) => r.id === role)?.cssColor ?? meta.color,
                });
              }
            }

            return (
              <div
                key={stem}
                style={{
                  ...styles.stemTile,
                  border: isFocused
                    ? `2px solid #facc15`
                    : isLive
                      ? `2px solid ${assignedColor}`
                      : `2px solid rgba(255,255,255,0.08)`,
                  boxShadow: isFocused ? '0 0 0 2px rgba(250,204,21,0.3)' : undefined,
                  position: 'relative',
                }}
                aria-label={`${meta.label} stem${isFocused ? ', focused' : ''}: level ${Math.round(filterN * 100)}%${assignedRoles.length > 0 ? `, controlled by ${assignedRoles.join(' and ')} baton${assignedRoles.length > 1 ? 's' : ''}` : ''}`}
              >
                {/* Cycle flash overlay — fades out over CYCLE_FLASH_MS on the destination tile */}
                {cycleFlashOpacity > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 10,
                      background: cycleFlashColor,
                      opacity: cycleFlashOpacity * 0.25,
                      pointerEvents: 'none',
                    }}
                    aria-label={`Baton arrived — cycle flash`}
                  />
                )}

                {/* Tile header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isFocused && (
                      <span
                        style={{ fontSize: 11, color: '#facc15', fontWeight: 700 }}
                        aria-hidden="true"
                      >
                        ▸
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: isFocused ? '#facc15' : isLive ? assignedColor : meta.color }}>
                      {meta.label}
                    </span>
                    {isFocused && (
                      <span style={{ fontSize: 9, color: '#facc15', fontWeight: 600, marginLeft: 2 }}>
                        focused
                      </span>
                    )}
                  </div>
                  {/* Baton markers — one badge per assigned role (never colour-only: text + colour) */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    {assignedRoles.map((role) => {
                      const roleColor = COLOR_ROLES.find((r) => r.id === role)?.cssColor ?? meta.color;
                      const present   = activeBatonRoles.includes(role);
                      const out       = lastOutputsRef.current.get(role);
                      const dwell     = out?.dwellProgress ?? 0;
                      // Ring dimensions
                      const R = 9; // radius of SVG arc
                      const cx = 12; const cy = 12; const size = 24;
                      // Arc: sweep from 12-o'clock (−π/2) clockwise by dwell * 2π
                      const angle = dwell * 2 * Math.PI;
                      const endX  = cx + R * Math.sin(angle);
                      const endY  = cy - R * Math.cos(angle);
                      const largeArc = angle > Math.PI ? 1 : 0;
                      const arcPath  = dwell >= 1
                        // Full circle
                        ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.001} ${cy - R} Z`
                        : dwell > 0
                          ? `M ${cx} ${cy - R} A ${R} ${R} 0 ${largeArc} 1 ${endX} ${endY}`
                          : '';
                      return (
                        <div
                          key={role}
                          style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                          title={`${role} baton${present ? ' — active' : ' — latched'}${dwell > 0 ? `, dwell ${Math.round(dwell * 100)}%` : ''}`}
                        >
                          {/* Dwell ring SVG — shown whenever progress > 0 */}
                          {dwell > 0 && (
                            <svg
                              width={size}
                              height={size}
                              style={{ flexShrink: 0 }}
                              aria-label={`${role} dwell ${Math.round(dwell * 100)}%`}
                              role="img"
                            >
                              {/* Track */}
                              <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2} />
                              {/* Progress arc */}
                              <path
                                d={arcPath}
                                fill="none"
                                stroke={roleColor}
                                strokeWidth={2.5}
                                strokeLinecap="round"
                              />
                              {/* Numeric percent inside ring */}
                              <text
                                x={cx}
                                y={cy + 3.5}
                                textAnchor="middle"
                                fontSize={6}
                                fill={roleColor}
                                fontWeight="bold"
                              >
                                {Math.round(dwell * 100)}
                              </text>
                            </svg>
                          )}
                          {/* Role badge — text + colour; always visible when assigned */}
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: `${roleColor}30`,
                              color: roleColor,
                              border: `1px solid ${roleColor}${present ? 'aa' : '60'}`,
                              textTransform: 'uppercase' as const,
                              opacity: present ? 1 : 0.65,
                            }}
                          >
                            {role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Level bar — accessibility: numeric label + bar so deaf/HoH/colour-blind users get state */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 10,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 5,
                      overflow: 'hidden',
                    }}
                    role="progressbar"
                    aria-valuenow={Math.round(filterN * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${meta.label} level`}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${filterN * 100}%`,
                        background: isLive
                          ? assignedColor
                          : `color-mix(in srgb, ${meta.color} ${Math.round(40 + filterN * 60)}%, #333)`,
                        borderRadius: 5,
                        transition: 'width 80ms linear',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: '#a1a1b8',
                      width: 34,
                      textAlign: 'right' as const,
                      flexShrink: 0,
                    }}
                  >
                    {Math.round(filterN * 100)}%
                  </span>
                </div>

                {/* Status row */}
                <div style={{ display: 'flex', gap: 6, marginTop: 5, fontSize: 10, color: '#71718a' }}>
                  <span>{isLive ? 'LIVE' : 'latched'}</span>
                </div>

                {/* Standalone dwell progress bars — shown below status for present batons */}
                {dwellEntries.map(({ role, progress, color }) => (
                  <div
                    key={role}
                    style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}
                    aria-label={`${role} dwell ${Math.round(progress * 100)}%`}
                  >
                    <span style={{ fontSize: 8, color, textTransform: 'uppercase', width: 28, flexShrink: 0 }}>
                      {role}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 3,
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                      role="progressbar"
                      aria-valuenow={Math.round(progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${role} dwell progress`}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${progress * 100}%`,
                          background: color,
                          borderRadius: 2,
                          transition: 'width 50ms linear',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 8, color, fontFamily: 'monospace', width: 24, textAlign: 'right', flexShrink: 0 }}>
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Beat dot — always visible; shows song pulse even when all stems silent */}
        <div style={styles.beatDotRow} aria-label={`Beat phase: ${Math.round(beatPhase * 100)}%`}>
          <span style={{ fontSize: 11, color: '#555570', marginRight: 8 }}>Beat</span>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: isPlaying
                ? `rgba(249,115,22,${0.3 + beatPhase * 0.7})`
                : 'rgba(255,255,255,0.08)',
              border: `2px solid ${isPlaying ? '#f97316' : 'rgba(255,255,255,0.15)'}`,
              transition: isPlaying ? 'none' : 'background 0.3s',
            }}
          />
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#555570', marginLeft: 8 }}>
            {Math.round(beatPhase * 100)}%
          </span>
        </div>

        {/* Camera view / touch pad */}
        {inputMode === 'touch' ? (
          <div
            {...padBind}
            onPointerUp={handlePadPointerUp}
            onPointerCancel={handlePadPointerUp}
            style={{
              flex: 1,
              background: '#0d0d18',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: padState.held ? 'none' : 'crosshair',
              position: 'relative',
              userSelect: 'none',
              touchAction: 'none',
            }}
            aria-label="Touch pad — drag to control the red baton"
          >
            <span style={{ fontSize: 13, color: '#555570', pointerEvents: 'none' }}>
              Touch &amp; drag to control remix
            </span>
            {padState.held && (
              <div
                style={{
                  position: 'absolute',
                  left: `${padState.x * 100}%`,
                  top: `${padState.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '3px solid #ef4444',
                  background: 'rgba(239,68,68,0.2)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              position: 'relative',
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
              cursor: colorCalMode ? 'crosshair' : 'default',
            }}
            onClick={handleVideoAreaClick}
          >
            <video ref={videoRef} autoPlay playsInline muted style={styles.video} />

            {/* Baton-touch proximity overlay — connecting line when two batons are close */}
            {(() => {
              const pair = lastTouchPairRef.current;
              if (!batonTouchEnabled || !pair.a || !pair.b) return null;
              const aColor = COLOR_ROLES.find((r) => r.id === pair.a!.role)?.cssColor ?? '#ffffff';
              const bColor = COLOR_ROLES.find((r) => r.id === pair.b!.role)?.cssColor ?? '#ffffff';
              const lineColor = pair.withinRadius ? '#ffffff' : 'rgba(255,255,255,0.25)';
              const lineWidth = pair.withinRadius ? 2.5 : 1.5;
              return (
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                  aria-label={pair.withinRadius ? 'Batons touching — cycle will fire' : 'Two batons tracked'}
                  role="img"
                >
                  {/* Connecting line */}
                  <line
                    x1={`${pair.a.x * 100}%`}
                    y1={`${pair.a.y * 100}%`}
                    x2={`${pair.b.x * 100}%`}
                    y2={`${pair.b.y * 100}%`}
                    stroke={lineColor}
                    strokeWidth={lineWidth}
                    strokeDasharray={pair.withinRadius ? undefined : '4 4'}
                  />
                  {/* Dot for baton A (primary / higher priority) */}
                  <circle
                    cx={`${pair.a.x * 100}%`}
                    cy={`${pair.a.y * 100}%`}
                    r={pair.withinRadius ? 7 : 5}
                    fill={aColor}
                    opacity={pair.withinRadius ? 0.9 : 0.5}
                  />
                  {/* Dot for baton B */}
                  <circle
                    cx={`${pair.b.x * 100}%`}
                    cy={`${pair.b.y * 100}%`}
                    r={pair.withinRadius ? 7 : 5}
                    fill={bColor}
                    opacity={pair.withinRadius ? 0.9 : 0.5}
                  />
                </svg>
              );
            })()}

            {/* Color calibration prompt */}
            {colorCalMode && (
              <div style={styles.colorCalBanner}>
                Click on the{' '}
                <strong style={{ margin: '0 4px', color: COLOR_ROLES.find((r) => r.id === colorCalMode)?.cssColor }}>
                  {COLOR_ROLES.find((r) => r.id === colorCalMode)?.label}
                </strong>{' '}
                coloured object in the video
                <button
                  onClick={(e) => { e.stopPropagation(); setColorCalMode(null); }}
                  style={{ ...styles.btn, marginLeft: 12, fontSize: 11 }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Loading overlay */}
            {loadingMsg && (
              <div style={styles.loadingOverlay}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{loadingMsg}</div>
                <div style={styles.spinner} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Controls panel (right) ---- */}
      <div style={styles.controlsPanel}>

        {/* Header */}
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            &larr; Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Remix</h2>
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

        {/* Song picker */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Song Library</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SONG_LIBRARY.map((song) => (
              <button
                key={song.id}
                onClick={() => { void handleSelectSong(song); }}
                style={selectedSong?.id === song.id ? styles.songBtnActive : styles.songBtn}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{song.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {song.artist} · {song.key} · {song.bpm} BPM
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Transport */}
        {isLoaded && selectedSong && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Transport</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button
                onClick={() => { void handlePlay(); }}
                style={isPlaying ? styles.btn : styles.btnPrimary}
                disabled={isPlaying}
                aria-label="Play"
              >
                ▶ Play
              </button>
              <button
                onClick={handleStop}
                style={styles.btn}
                disabled={!isPlaying}
                aria-label="Stop"
              >
                ■ Stop
              </button>
              <button
                onClick={() => { void handleRestart(); }}
                style={styles.btn}
                aria-label="Restart"
              >
                ⏮ Restart
              </button>
            </div>
          </div>
        )}

        {/* Keyboard mode + Loop controls */}
        {isLoaded && selectedSong && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Keyboard Mode</h3>

            {/* Keyboard-mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setKeyboardMode((k) => !k)}
                style={keyboardMode ? styles.btnActive : styles.btn}
                aria-pressed={keyboardMode}
                aria-label={keyboardMode ? 'Keyboard mode on' : 'Keyboard mode off'}
              >
                {keyboardMode ? 'Keys ON' : 'Keys OFF'}
              </button>
              {keyboardMode && (
                <span style={{ fontSize: 10, color: '#71718a' }}>
                  1–4 stem · ↑↓ filter · S drum · ←→ loop · [ ] length · space play
                </span>
              )}
            </div>

            {/* Play/Pause button (keyboard equivalent) */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              <button
                onClick={() => { void Tone.start().then(() => { engineRef.current.togglePlay(); }); }}
                style={styles.btn}
                aria-label={isPlaying ? 'Pause playback' : 'Resume playback'}
              >
                {isPlaying ? '⏸ Pause' : '▶ Resume'}
              </button>
            </div>

            {/* Loop length selector */}
            <div>
              <div style={{ fontSize: 11, color: '#71718a', marginBottom: 4 }}>Loop length</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {([0, 4, 8, 16] as (0 | 4 | 8 | 16)[]).map((len) => (
                  <button
                    key={len}
                    onClick={() => {
                      engineRef.current.setLoopLengthBars(len);
                      loopLengthBarsRef.current = len;
                      setLoopLengthBars(len);
                    }}
                    style={loopLengthBars === len ? styles.btnActive : styles.btnSmall}
                    aria-pressed={loopLengthBars === len}
                    aria-label={len === 0 ? 'Loop off' : `Loop ${len} bars`}
                  >
                    {len === 0 ? 'Off' : `${len}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Loop nudge buttons */}
            {loopLengthBars > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#71718a' }}>Nudge loop</span>
                <button
                  onClick={() => { engineRef.current.nudgeLoop(-1); }}
                  style={styles.btnSmall}
                  aria-label="Nudge loop earlier"
                >
                  ◀
                </button>
                <button
                  onClick={() => { engineRef.current.nudgeLoop(1); }}
                  style={styles.btnSmall}
                  aria-label="Nudge loop later"
                >
                  ▶
                </button>
              </div>
            )}

            {/* Loop-window timeline */}
            {(() => {
              const region = loopRegionDisplay;
              const dur    = songDurationSec;
              const loopLabel = region && region.lengthBars > 0
                ? `Loop: bars ${region.originBar + 1}–${region.originBar + region.lengthBars} (${region.lengthBars} bars)`
                : 'Loop: off';
              const curSec  = transportSec;
              const totalSec = dur > 0 ? dur : 1;
              const curM  = Math.floor(curSec / 60);
              const curS  = Math.floor(curSec % 60);
              const totM  = Math.floor(totalSec / 60);
              const totS  = Math.floor(totalSec % 60);
              const fmtSec = (m: number, s: number) =>
                `${m}:${s.toString().padStart(2, '0')}`;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Text label — never colour-only */}
                  <div style={{ fontSize: 11, color: '#a1a1b8', fontFamily: 'monospace' }}>
                    {loopLabel}
                  </div>
                  {/* Transport position readout */}
                  <div style={{ fontSize: 10, color: '#71718a', fontFamily: 'monospace' }}>
                    {fmtSec(curM, curS)} / {fmtSec(totM, totS)}
                  </div>
                  {/* Timeline bar */}
                  {dur > 0 && (
                    <div
                      style={{
                        position: 'relative',
                        height: 18,
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                      role="img"
                      aria-label={`Song timeline. ${loopLabel}. Position ${fmtSec(curM, curS)} of ${fmtSec(totM, totS)}`}
                    >
                      {/* Loop window highlight */}
                      {region && region.lengthBars > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left:  `${(region.startSec / totalSec) * 100}%`,
                            width: `${((region.endSec - region.startSec) / totalSec) * 100}%`,
                            background: 'rgba(249,115,22,0.25)',
                            borderLeft:  '2px solid #f97316',
                            borderRight: '2px solid #f97316',
                          }}
                          aria-hidden="true"
                        />
                      )}
                      {/* Playhead */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${(curSec / totalSec) * 100}%`,
                          width: 2,
                          background: '#ffffff',
                          opacity: 0.8,
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Color calibration (webcam only) */}
        {inputMode === 'webcam' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Color Calibration</h3>
            <p style={styles.hint}>Click a button, then click the coloured object in the video</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
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

            {/* Per-colour sensitivity sliders (calibrated colours only) */}
            {COLOR_ROLES.filter((r) => colorCalState[r.id]).length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {COLOR_ROLES.filter((r) => colorCalState[r.id]).map((role) => {
                  const sliderId = `remix-sensitivity-${role.id}`;
                  const value    = colorSensitivity[role.id];
                  return (
                    <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label
                        htmlFor={sliderId}
                        style={{ fontSize: 11, color: role.cssColor, width: 90, flexShrink: 0 }}
                      >
                        {role.label} sens.
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
                        aria-label={`${role.label} detection sensitivity`}
                      />
                      <span style={{ fontSize: 10, color: '#71718a', width: 56, textAlign: 'right' as const, fontFamily: 'monospace' }}>
                        {value.toFixed(4)}
                      </span>
                    </div>
                  );
                })}
                <p style={{ ...styles.hint, marginTop: 2 }}>
                  Decrease number to detect smaller blobs; increase to reduce false positives.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- Triggers (facilitator) ---- */}
        <div style={{ ...styles.section, borderTop: '2px solid rgba(249,115,22,0.25)', paddingTop: 10 }}>
          <h3 style={{ ...styles.sectionTitle, color: '#f97316' }}>Triggers (facilitator)</h3>
          <p style={styles.hint}>
            Compose the player&apos;s trigger scheme. For Tim: dwell off, baton-touch on,
            head-nod on, shake off.
          </p>

          {/* ---- Cycle triggers ---- */}
          <div style={{ fontSize: 11, color: '#71718a', fontWeight: 600, marginTop: 4 }}>Cycle</div>

          {/* Dwell-cycle toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setDwellCycleEnabled((v) => !v)}
              style={dwellCycleEnabled ? styles.btnActive : styles.btn}
              aria-pressed={dwellCycleEnabled}
              aria-label={dwellCycleEnabled ? 'Dwell to cycle: on' : 'Dwell to cycle: off'}
            >
              {dwellCycleEnabled ? 'Dwell ON' : 'Dwell OFF'}
            </button>
            <span style={{ fontSize: 11, color: '#555570' }}>Hold still 1.2 s to cycle stem</span>
          </div>

          {/* Baton touch toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setBatonTouchEnabled((v) => !v)}
              style={batonTouchEnabled ? styles.btnActive : styles.btn}
              aria-pressed={batonTouchEnabled}
              aria-label={batonTouchEnabled ? 'Baton touch cycle: on' : 'Baton touch cycle: off'}
            >
              {batonTouchEnabled ? 'Baton touch ON' : 'Baton touch OFF'}
            </button>
            <span style={{ fontSize: 11, color: '#555570' }}>Two batons together to cycle</span>
          </div>

          {/* Touch radius slider — shown when baton-touch is enabled */}
          {batonTouchEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
              <label
                htmlFor="remix-touch-radius"
                style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}
              >
                Touch radius
              </label>
              <input
                id="remix-touch-radius"
                type="range"
                min={0.05}
                max={0.3}
                step={0.01}
                value={touchRadius}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTouchRadius(v);
                  touchDetectorRef.current.setTouchRadius(v);
                }}
                style={{ flex: 1 }}
                aria-label={`Touch radius: ${touchRadius.toFixed(2)}`}
              />
              <span style={{ fontSize: 10, color: '#71718a', width: 32, textAlign: 'right' as const, fontFamily: 'monospace', flexShrink: 0 }}>
                {touchRadius.toFixed(2)}
              </span>
            </div>
          )}

          {/* ---- Percussion triggers ---- */}
          <div style={{ fontSize: 11, color: '#71718a', fontWeight: 600, marginTop: 6 }}>Percussion</div>

          {/* Percussion enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => {
                const next = !percussionEnabled;
                setPercussionEnabled(next);
                engineRef.current.setLayerEnabled('percussion', next);
              }}
              style={percussionEnabled ? styles.btnActive : styles.btn}
              aria-pressed={percussionEnabled}
              aria-label={percussionEnabled ? 'Percussion: on' : 'Percussion: off'}
            >
              {percussionEnabled ? 'Drums ON' : 'Drums OFF'}
            </button>
            <span style={{ fontSize: 11, color: '#555570' }}>Add percussion layer</span>
          </div>

          {/* Percussion volume slider */}
          {percussionEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
              <label
                htmlFor="remix-percussion-volume"
                style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}
              >
                Drums vol.
              </label>
              <input
                id="remix-percussion-volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={percussionVolume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPercussionVolume(v);
                  engineRef.current.setLayerVolume('percussion', v);
                }}
                style={{ flex: 1 }}
                aria-label={`Percussion volume: ${percussionVolume.toFixed(2)}`}
              />
              <span style={{ fontSize: 10, color: '#71718a', width: 32, textAlign: 'right' as const, fontFamily: 'monospace', flexShrink: 0 }}>
                {percussionVolume.toFixed(2)}
              </span>
            </div>
          )}

          {/* ---- Loop layer readout (deaf/HoH feedback) ---- */}
          {loopInfo.count > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#71718a', fontWeight: 600, marginTop: 6 }}>Loop layer</div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                aria-label={`Loop layer ${loopPresent ? `in: ${loopInfo.names[loopInfo.activeIndex] ?? ''}` : 'off'}`}
              >
                <span style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}>
                  {loopPresent ? 'In' : 'Off'}
                </span>
                <span
                  style={{ fontSize: 11, color: loopPresent ? '#22c55e' : '#555570', fontFamily: 'monospace' }}
                  aria-live="polite"
                >
                  {loopPresent ? `▶ ${loopInfo.names[loopInfo.activeIndex] ?? ''}` : 'off'}
                </span>
              </div>
            </>
          )}

          {/* Head-nod toggle — webcam only */}
          {inputMode === 'webcam' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setHeadNodEnabled((v) => !v)}
                  style={headNodEnabled ? styles.btnActive : styles.btn}
                  aria-pressed={headNodEnabled}
                  aria-label={headNodEnabled ? 'Head nod → drums: on' : 'Head nod → drums: off'}
                >
                  {headNodEnabled ? 'Head nod ON' : 'Head nod OFF'}
                </button>
                <span style={{ fontSize: 11, color: '#555570' }}>Nod down → drums</span>
              </div>
              {headNodEnabled && (
                <>
                  {/* Min excursion slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                    <label
                      htmlFor="remix-nod-excursion"
                      style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}
                    >
                      Min excursion
                    </label>
                    <input
                      id="remix-nod-excursion"
                      type="range"
                      min={0.01}
                      max={0.08}
                      step={0.005}
                      value={headNodMinExcursion}
                      onChange={(e) => setHeadNodMinExcursion(Number(e.target.value))}
                      style={{ flex: 1 }}
                      aria-label={`Minimum nod excursion: ${headNodMinExcursion.toFixed(3)}`}
                    />
                    <span style={{ fontSize: 10, color: '#71718a', width: 40, textAlign: 'right' as const, fontFamily: 'monospace', flexShrink: 0 }}>
                      {headNodMinExcursion.toFixed(3)}
                    </span>
                  </div>
                  {/* Cooldown slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                    <label
                      htmlFor="remix-nod-cooldown"
                      style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}
                    >
                      Cooldown (ms)
                    </label>
                    <input
                      id="remix-nod-cooldown"
                      type="range"
                      min={100}
                      max={600}
                      step={50}
                      value={headNodCooldownMs}
                      onChange={(e) => setHeadNodCooldownMs(Number(e.target.value))}
                      style={{ flex: 1 }}
                      aria-label={`Nod cooldown: ${headNodCooldownMs} ms`}
                    />
                    <span style={{ fontSize: 10, color: '#71718a', width: 40, textAlign: 'right' as const, fontFamily: 'monospace', flexShrink: 0 }}>
                      {headNodCooldownMs}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---- Reach calibration ---- */}
          <div style={{ fontSize: 11, color: '#71718a', fontWeight: 600, marginTop: 6 }}>Reach</div>
          <p style={styles.hint}>
            Move each baton across its full reach for 5 s to calibrate the filter range.
          </p>
          <button
            onClick={handleStartRangeCalibration}
            disabled={calibratingRange}
            style={calibratingRange ? styles.btnActive : styles.btn}
            aria-label={calibratingRange ? `Capturing range — ${calCountdown}s remaining` : 'Start 5-second range capture'}
          >
            {calibratingRange ? `Capturing… ${calCountdown}s` : 'Calibrate range'}
          </button>
          {capturedRoles.length > 0 && !calibratingRange && (
            <p style={{ ...styles.hint, color: '#22c55e' }}>
              Range captured for: {capturedRoles.join(', ')}
            </p>
          )}
          {/* Reach margin slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              htmlFor="remix-reach-margin"
              style={{ fontSize: 11, color: '#a1a1b8', flexShrink: 0, width: 80 }}
            >
              Reach margin
            </label>
            <input
              id="remix-reach-margin"
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={reachMargin}
              onChange={(e) => { setReachMargin(Number(e.target.value)); }}
              style={{ flex: 1 }}
              aria-label={`Reach margin: ${reachMargin.toFixed(2)}`}
            />
            <span style={{ fontSize: 10, color: '#71718a', width: 32, textAlign: 'right' as const, fontFamily: 'monospace', flexShrink: 0 }}>
              {reachMargin.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Stem assignment info */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Baton Assignments</h3>
          <p style={styles.hint}>Dwell (hold still 1.2 s) to cycle a baton to the next stem.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEM_CYCLE_ORDER.map((stem) => {
              const meta = STEM_META[stem];
              // Find role assigned to this stem
              let assignedRole: ColorRole | null = null;
              for (const [role, baton] of batonsRef.current) {
                if (baton.assignedStem === stem) {
                  assignedRole = role;
                  break;
                }
              }
              const roleColor = assignedRole
                ? (COLOR_ROLES.find((r) => r.id === assignedRole)?.cssColor ?? '#71718a')
                : '#71718a';
              return (
                <div key={stem} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#a1a1b8', flex: 1 }}>{meta.label}</span>
                  {assignedRole ? (
                    <span style={{ fontSize: 11, color: roleColor, fontWeight: 600 }}>{assignedRole}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#555570' }}>unassigned</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* How-to hint */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>How to Play</h3>
          <p style={styles.hint}>
            Y position (up/down) opens each stem's filter. Shake or nod to hit drums.
            Dwell in one spot for 1.2 s to cycle your baton to the next stem.
            {inputMode === 'webcam'
              ? ' Calibrate a colour, then hold that object in view.'
              : ' Touch and drag in the stage area on the left.'}
          </p>
        </div>

      </div>
    </div>
  );
}

// ============================================
// Styles (inline — matches SongPresetScreen idiom)
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
    flexDirection: 'column',
    background: '#000',
    minWidth: 0,
  },
  stemGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    padding: 12,
  },
  stemTile: {
    borderRadius: 10,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'rgba(20,20,30,0.95)',
    minHeight: 80,
  },
  beatDotRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transform: 'scaleX(-1)',
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
    textTransform: 'uppercase',
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
    textAlign: 'left',
  },
  songBtnActive: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(249,115,22,0.4)',
    background: 'rgba(249,115,22,0.1)',
    color: '#f97316',
    cursor: 'pointer',
    textAlign: 'left',
  },
  errorBox: {
    textAlign: 'center',
    padding: 32,
  },
  colorCalBanner: {
    position: 'absolute',
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    flexDirection: 'column',
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
};
