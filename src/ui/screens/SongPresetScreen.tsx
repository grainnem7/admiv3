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
import { SongPresetEngine } from '../../songs/SongPresetEngine';
import type { VoicePosition, SongPresetStatus, SongCalibration } from '../../songs/SongPresetEngine';
import { SONG_LIBRARY, COLOR_ROLES } from '../../songs/songLibrary';
import type { SongConfig, ColorRole } from '../../songs/songLibrary';
import { PAD_PRESET_LIST } from '../../songs/voices/ChordPadVoice';
import { MELODY_PRESET_LIST } from '../../songs/voices/MelodicVoice';
import { ARP_PRESET_LIST } from '../../songs/voices/ArpeggioVoice';
import { BASS_PRESET_LIST } from '../../songs/voices/BassSynthVoice';

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
  const engineRef = useRef(new SongPresetEngine());

  // Latest blob data
  const blobsRef = useRef<ColorBlob[]>([]);

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

  // Live status
  const [liveStatus, setLiveStatus] = useState<SongPresetStatus | null>(null);
  const statusFrameCount = useRef(0);

  // Color calibration (5 colors)
  const [colorCalState, setColorCalState] = useState<Record<ColorRole, boolean>>({
    blue: false, red: false, green: false, yellow: false, orange: false,
  });
  const [colorCalMode, setColorCalMode] = useState<ColorRole | null>(null);
  const colorCalModeRef = useRef<ColorRole | null>(null);

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

  // Store
  const isMuted = useIsMuted();
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);

  // Keep refs in sync
  useEffect(() => { colorCalModeRef.current = colorCalMode; }, [colorCalMode]);
  useEffect(() => { calibrationStepRef.current = calibrationStep; }, [calibrationStep]);
  useEffect(() => { keyboardActiveRef.current = keyboardActive; }, [keyboardActive]);

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
      engineRef.current.dispose();
    };
  }, []);

  // ---- Sync mute ----
  useEffect(() => {
    engineRef.current.setMuted(isMuted || isMutedLocal);
  }, [isMuted, isMutedLocal]);

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

    const loop = () => {
      if (!running) return;

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

          // Build positions for all 5 colors
          const positions = new Map<ColorRole, VoicePosition>();

          if (keyboardMode) {
            // Keyboard test: use synthetic positions
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
            // Real camera tracking
            // Mirror X so "left in the mirror" = low X for musical zones
            const blobs = blobsRef.current;
            for (const role of COLOR_ROLES) {
              const blob = blobs.find((b) => b.colorId === role.id);
              positions.set(role.id, blob?.found
                ? { x: 1 - blob.x, y: blob.y, found: true }
                : { x: 0, y: 0, found: false });
            }
          }

          // Feed to engine
          engineRef.current.setAllPositions(positions);

          // Accumulate calibration data
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

          // Draw overlay
          if (showOverlay && selectedSong) {
            drawOverlay(ctx, canvas.width, canvas.height, positions, status, selectedSong, showNoteNames);
          }
        }
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => { running = false; };
  }, [isInitialized, showOverlay, showNoteNames, selectedSong, keyboardMode]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load song');
      setLoadingStatus(null);
    }
  }, []);

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
    setColorCalMode(null);
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

  return (
    <div style={styles.container}>
      {/* Video + overlay */}
      <div
        style={{
          ...styles.videoContainer,
          cursor: colorCalMode ? 'crosshair' : 'default',
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

      {/* Controls panel */}
      <div style={styles.controlsPanel}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            &larr; Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Song Preset</h2>
        </div>

        {/* Color Legend */}
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
                    {role.id !== 'blue' && (
                      <select
                        className="form-field__select"
                        value={voicePresets[role.id] ?? ''}
                        onChange={(e) => handleVoicePresetChange(role.id as ColorRole, e.target.value)}
                        style={{ height: 26, fontSize: 10, width: 86, flexShrink: 0 }}
                        disabled={!isLoaded}
                      >
                        {(VOICE_PRESET_OPTIONS[role.id] ?? []).map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
              <div>Mixer zone: {liveStatus.stemMixerZone ?? 'none'}</div>
              {Object.entries(liveStatus.stemVolumes).map(([id, vol]) => (
                <div key={id}>{id}: {Math.round(vol * 100)}%</div>
              ))}
              <div>Filter: {Math.round(liveStatus.filterHz)} Hz</div>
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

  if (isActive && role.id !== 'blue') {
    const preset = status.voicePresets[role.id] ?? '';
    const lines = getRoleStateLines(role.id, pos, preset);
    drawCallout(ctx, x, y, canvasW, color, lines);
  } else {
    // Inactive or blue: just the label
    ctx.globalAlpha = isActive ? 0.9 : 0.45;
    ctx.font = `${isActive ? 'bold ' : ''}10px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(role.label, x + radius + 4, y + 4);
    ctx.globalAlpha = 1;
  }
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
