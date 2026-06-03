/**
 * BoardSequencerScreen — standalone "physical board → step sequencer" mode.
 *
 * Place red pieces on a physical grid in view of the camera; each settled piece
 * activates a cell. A playhead sweeps the columns at the chosen tempo and sounds
 * the active cells (rows = a fixed pentatonic scale, or a drum kit). Reached by
 * explicit navigation from the Welcome screen; OFF by default. It does not touch
 * any other mode/screen.
 *
 * A single rAF loop runs whenever the board is calibrated: it reads the frame,
 * draws the detection overlay (our grid + per-cell red/active state) onto the
 * camera, and — while running — steps slide-and-settle and drives the audio
 * engine. The UI only calls Tone.start() (audio unlock) and Tone.now() (playhead);
 * all note/tick audio goes through the engine.
 *
 * Orientation (mirrorX/mirrorY) is applied to BOTH the displayed video and the
 * sampled frame, and calibration is captured in that same space — so changing
 * orientation invalidates calibration (you re-click the corners), which prevents
 * a saved calibration from silently mismatching the orientation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { BoardReader } from '../../tracking/BoardReader';
import { BoardSequencerMode, type CellRef, type PieceColour } from '../../tracking/BoardSequencerMode';
import { RedColourRecognizer, ColourRecognizer } from '../../tracking/PieceRecognizer';
import { rgbToHsv } from '../../tracking/ColorTracker';
import { BoardSequencerEngine } from '../../songs/BoardSequencerEngine';
import { SongPresetEngine } from '../../songs/SongPresetEngine';
import { SONG_LIBRARY, type SongConfig } from '../../songs/songLibrary';
import { getChordAtTime } from '../../songs/voices/chordLookup';
import { computeHomography, applyHomography, UNIT_SQUARE, type Mat3 } from '../../utils/homography';
import { stepIndexAt, SCALE_PRESETS, NOTE_NAMES } from '../../songs/boardSequencerScale';
import {
  loadBoardSequencerConfig, saveBoardSequencerConfig, DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored, type BoardPoint,
} from '../../profiles/BoardSequencerConfig';
import BoardCalibrationOverlay from '../components/board/BoardCalibrationOverlay';
import WarpedBoardView from '../components/board/WarpedBoardView';

// Sound options — real sample sets (mapped straight to SAMPLE_CONFIGS) plus the
// sustained pad. These are the better-quality instruments available to us.
const INSTRUMENT_OPTIONS: { key: string; name: string }[] = [
  { key: 'piano', name: 'Piano' },
  { key: 'electricPiano', name: 'Electric piano' },
  { key: 'harp', name: 'Harp' },
  { key: 'organ', name: 'Organ' },
  { key: 'clarinet', name: 'Clarinet' },
  { key: 'frenchHorn', name: 'French horn' },
  { key: 'cello', name: 'Cello' },
  { key: 'guitarNylon', name: 'Nylon guitar' },
  { key: 'bassElectric', name: 'Electric bass' },
  { key: 'pad', name: 'Pad (sustained)' },
];

interface DetStats {
  red: number;
  black: number;
  blue: number;
  settled: number;
  maxRed: number;
}

export default function BoardSequencerScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const readerRef = useRef<BoardReader | null>(null);
  const modeRef = useRef<BoardSequencerMode | null>(null);
  const engineRef = useRef<BoardSequencerEngine | null>(null);
  const homographyRef = useRef<Mat3 | null>(null);
  const runningRef = useRef(false);
  const startSecRef = useRef(0);

  const storedRef = useRef<BoardSequencerStored | null>(loadBoardSequencerConfig());
  const [config, setConfig] = useState<BoardSequencerStored>(
    () => storedRef.current ?? DEFAULT_BOARD_SEQUENCER_CONFIG,
  );
  const configRef = useRef(config);
  configRef.current = config;

  // Not-yet-calibrated is a first-class state: true only once a config has been
  // saved (loaded from storage or calibrated this session).
  const [calibrated, setCalibrated] = useState<boolean>(storedRef.current !== null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibratingRed, setCalibratingRed] = useState(false);
  const [calibratingBlack, setCalibratingBlack] = useState(false);
  const [active, setActive] = useState<CellRef[]>([]);
  const [playheadCol, setPlayheadCol] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Optional backing song (Song Preset engine) the board can lock to.
  const songEngineRef = useRef<SongPresetEngine | null>(null);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [songStatus, setSongStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const songStatusRef = useRef<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  songStatusRef.current = songStatus;
  const [stats, setStats] = useState<DetStats>({ red: 0, black: 0, blue: 0, settled: 0, maxRed: 0 });
  const [calibratingBlue, setCalibratingBlue] = useState(false);
  const [showMixer, setShowMixer] = useState(false);

  type RowMixField = 'rowVolume' | 'rowTone' | 'rowReverbSend' | 'rowDelaySend';
  const setRowMix = useCallback((field: RowMixField, row: number, value: number) => {
    setConfig((prev) => {
      const arr = [...prev[field]];
      const pad = field === 'rowVolume' || field === 'rowTone' ? 1 : 0;
      while (arr.length <= row) arr.push(pad);
      arr[row] = value;
      const next = { ...prev, [field]: arr };
      saveBoardSequencerConfig(next);
      return next;
    });
    const eng = engineRef.current;
    if (!eng) return;
    if (field === 'rowVolume') eng.setRowVolume(row, value);
    else if (field === 'rowTone') eng.setRowTone(row, value);
    else if (field === 'rowReverbSend') eng.setRowReverbSend(row, value);
    else eng.setRowDelaySend(row, value);
  }, []);

  const update = useCallback((patch: Partial<BoardSequencerStored>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  // Set the instrument for one row (per-row-instrument mode), growing the array
  // to cover the current row count.
  const setRowInstrument = useCallback((row: number, key: string) => {
    setConfig((prev) => {
      const arr = [...prev.rowInstruments];
      while (arr.length <= row) arr.push('');
      arr[row] = key;
      const next = { ...prev, rowInstruments: arr };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  const buildHomography = useCallback((corners: BoardPoint[], video: HTMLVideoElement): Mat3 => {
    const dst = corners.map((c) => ({ x: c.x * video.videoWidth, y: c.y * video.videoHeight }));
    return computeHomography(UNIT_SQUARE, dst);
  }, []);

  // Draw our sampling grid onto the camera, tinting cells by detection state +
  // colour (red vs black).
  const drawOverlay = useCallback(
    (
      occupied: Map<string, PieceColour>,
      activeMap: Map<string, PieceColour>,
      cfg: BoardSequencerStored,
      playCol: number,
    ) => {
      const cv = overlayRef.current;
      const video = videoRef.current;
      if (!cv || !video) return;
      const W = video.clientWidth;
      const H = video.clientHeight;
      if (W <= 0 || H <= 0) return;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      let hn: Mat3;
      try {
        hn = computeHomography(UNIT_SQUARE, cfg.corners);
      } catch {
        return;
      }
      const toPx = (ux: number, uy: number) => {
        const p = applyHomography(hn, { x: ux, y: uy });
        return { x: p.x * W, y: p.y * H };
      };
      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          const a = toPx(c / cfg.cols, r / cfg.rows);
          const b = toPx((c + 1) / cfg.cols, r / cfg.rows);
          const d = toPx((c + 1) / cfg.cols, (r + 1) / cfg.rows);
          const e = toPx(c / cfg.cols, (r + 1) / cfg.rows);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(d.x, d.y);
          ctx.lineTo(e.x, e.y);
          ctx.closePath();
          const key = `${r},${c}`;
          const activeColour = activeMap.get(key);
          const occColour = occupied.get(key);
          const colour = activeColour ?? occColour;
          const strong = activeColour !== undefined;
          if (colour === 'blue') ctx.fillStyle = strong ? 'rgba(70,120,255,0.55)' : 'rgba(70,120,255,0.3)';
          else if (colour === 'black') ctx.fillStyle = strong ? 'rgba(170,170,185,0.55)' : 'rgba(170,170,185,0.3)';
          else if (colour === 'red') ctx.fillStyle = strong ? 'rgba(255,40,40,0.5)' : 'rgba(255,170,40,0.32)';
          else ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.fill();
          ctx.lineWidth = c === playCol && runningRef.current ? 3 : 1;
          ctx.strokeStyle = c === playCol && runningRef.current ? 'rgba(80,200,255,0.95)' : 'rgba(80,200,255,0.4)';
          ctx.stroke();
        }
      }
    },
    [],
  );

  // Camera lifecycle.
  useEffect(() => {
    const cam = new CameraManager();
    cameraRef.current = cam;
    readerRef.current = new BoardReader();
    const video = videoRef.current;
    if (video) {
      cam.start(video).catch((err) => {
        setError(err instanceof Error ? err.message : 'Camera failed');
      });
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      songEngineRef.current?.dispose();
      songEngineRef.current = null;
      cam.stop();
    };
  }, []);

  // Single rAF loop while calibrated: read → draw overlay → (if running) step + audio.
  useEffect(() => {
    if (!calibrated) return;
    let raf = 0;
    let last = performance.now();
    let lastStateMs = 0;
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const video = videoRef.current;
      const reader = readerRef.current;
      const cfg = configRef.current;
      if (video && reader && video.videoWidth > 0) {
        if (!homographyRef.current) {
          try {
            homographyRef.current = buildHomography(cfg.corners, video);
          } catch {
            /* degenerate corners — wait for recalibration */
          }
        }
        const h = homographyRef.current;
        if (h) {
          const multi = cfg.blackDrums || cfg.blueBass;
          const recognizer = multi
            ? new ColourRecognizer(cfg.minFilledFraction)
            : new RedColourRecognizer(cfg.minFilledFraction);
          const readings = reader.read(video, {
            homography: h, rows: cfg.rows, cols: cfg.cols, red: cfg.redColour, recognizer,
            mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY,
            black: cfg.blackDrums
              ? { maxValue: cfg.blackMaxValue, maxSaturation: cfg.blackMaxSaturation }
              : undefined,
            blue: cfg.blueBass ? cfg.blueColour : undefined,
          });
          const occupied = new Map<string, PieceColour>();
          let maxRed = 0;
          let redCount = 0;
          let blackCount = 0;
          let blueCount = 0;
          for (const rd of readings) {
            if (rd.occupied && rd.colour) {
              occupied.set(`${rd.row},${rd.col}`, rd.colour);
              if (rd.colour === 'red') redCount++;
              else if (rd.colour === 'black') blackCount++;
              else blueCount++;
            }
            const rf = rd.redFraction ?? 0;
            if (rf > maxRed) maxRed = rf;
          }
          let activeArr: CellRef[] = [];
          const activeMap = new Map<string, PieceColour>();
          let playCol = 0;
          if (runningRef.current && modeRef.current && engineRef.current) {
            const res = modeRef.current.step(readings, dt, now);
            engineRef.current.setActiveCells(res.activeCells);
            if (res.justSettled.length > 0) engineRef.current.fireTick();
            activeArr = res.activeCells;
            for (const c of res.activeCells) activeMap.set(`${c.row},${c.col}`, c.colour);
            playCol = stepIndexAt(Tone.now(), startSecRef.current, 60 / cfg.bpm, cfg.cols);
          }
          drawOverlay(occupied, activeMap, cfg, playCol);
          if (now - lastStateMs > 100) {
            lastStateMs = now;
            setActive(activeArr);
            setPlayheadCol(playCol);
            setStats({ red: redCount, black: blackCount, blue: blueCount, settled: activeMap.size, maxRed });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [calibrated, drawOverlay, buildHomography]);

  const handleCalibrated = useCallback(
    (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint]) => {
      const next = { ...configRef.current, corners, enabled: true };
      setConfig(next);
      saveBoardSequencerConfig(next);
      if (videoRef.current) homographyRef.current = buildHomography(corners, videoRef.current);
      setCalibrated(true);
      setCalibrating(false);
    },
    [buildHomography],
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    modeRef.current = null;
    songEngineRef.current?.stopPlayback();
    setRunning(false);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      engineRef.current?.setMuted(next);
      const se = songEngineRef.current;
      if (se && songStatusRef.current === 'loaded') {
        if (next) se.pause();
        else se.resume();
      }
      return next;
    });
  }, []);

  const handleSelectSong = useCallback(async (id: string) => {
    setSelectedSongId(id);
    if (!id) {
      songEngineRef.current?.stopPlayback();
      setSongStatus('idle');
      return;
    }
    const song: SongConfig | undefined = SONG_LIBRARY.find((s) => s.id === id);
    if (!song) {
      setSongStatus('idle');
      return;
    }
    if (!songEngineRef.current) songEngineRef.current = new SongPresetEngine();
    setSongStatus('loading');
    try {
      await Tone.start();
      await songEngineRef.current.loadSong(song);
      setSongStatus('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Song failed to load');
      setSongStatus('error');
    }
  }, []);

  const start = useCallback(async () => {
    await Tone.start();
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    const cfg = configRef.current;
    if (videoRef.current && !homographyRef.current) {
      homographyRef.current = buildHomography(cfg.corners, videoRef.current);
    }
    modeRef.current = new BoardSequencerMode({
      settleWindowMs: cfg.settleWindowMs,
      velocityFloor: cfg.velocityFloor,
      velocitySmoothing: cfg.velocitySmoothing,
      occupancyGraceMs: cfg.occupancyGraceMs,
      motionConfirmMs: cfg.motionConfirmMs,
    });
    const engine = new BoardSequencerEngine({
      bpm: cfg.bpm, rows: cfg.rows, cols: cfg.cols,
      scaleRootMidi: cfg.scaleRootMidi, scaleSemitones: cfg.scaleSemitones, swing: cfg.swing,
      noteLengthBeats: cfg.noteLengthBeats, velocity: cfg.velocity,
      tickEnabled: cfg.tickEnabled, instrumentKey: cfg.instrumentKey,
      rowMode: cfg.rowMode, blackDrums: cfg.blackDrums, blueBass: cfg.blueBass,
      rowInstruments: cfg.rowInstruments,
      octaveShift: cfg.octaveShift, volume: cfg.volume,
      rowVolume: cfg.rowVolume, rowTone: cfg.rowTone,
      rowReverbSend: cfg.rowReverbSend, rowDelaySend: cfg.rowDelaySend,
    });
    await engine.init();
    engine.setMuted(mutedRef.current);
    // Lock to the backing song (tempo/beat + chords) if one is loaded.
    const songEngine = songEngineRef.current;
    if (songEngine && songStatusRef.current === 'loaded') {
      const loaded = songEngine.getSong();
      const prog = loaded?.chordProgression ?? null;
      engine.setSyncSource({
        getTime: () => songEngine.getCurrentTime(),
        beats: loaded?.beats ?? [],
        chordAt: (tt) => (prog && prog.length ? getChordAtTime(prog, tt) : null),
      });
      songEngine.stopPlayback();
      songEngine.play();
    } else {
      engine.setSyncSource(null);
    }
    engine.start();
    engineRef.current = engine;
    startSecRef.current = Tone.now();
    runningRef.current = true;
    setRunning(true);
  }, [buildHomography]);

  // Changing orientation invalidates calibration (it was captured in the old
  // orientation), so force a fresh corner click in the new space.
  const changeOrientation = useCallback((patch: Partial<BoardSequencerStored>) => {
    homographyRef.current = null;
    setCalibrated(false);
    setConfig((prev) => {
      const next = {
        ...prev, ...patch,
        corners: DEFAULT_BOARD_SEQUENCER_CONFIG.corners,
        enabled: false,
      };
      saveBoardSequencerConfig(next);
      return next;
    });
    setCalibrating(true);
  }, []);

  // Average HSV under a click (in displayed space). Draws the frame with the
  // same mirror transforms so a click on the displayed video samples the right
  // pixels.
  const sampleAvgHsvAt = useCallback((nx: number, ny: number): { h: number; s: number; v: number } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) return null;
    const cfg = configRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.save();
    ctx.translate(cfg.mirrorX ? w : 0, cfg.mirrorY ? h : 0);
    ctx.scale(cfg.mirrorX ? -1 : 1, cfg.mirrorY ? -1 : 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    const px = Math.min(w - 1, Math.max(0, Math.round(nx * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(ny * h)));
    const R = 8;
    const x0 = Math.max(0, px - R);
    const y0 = Math.max(0, py - R);
    const sw = Math.min(2 * R, w - x0);
    const sh = Math.min(2 * R, h - y0);
    const { data } = ctx.getImageData(x0, y0, sw, sh);
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
      n++;
    }
    if (n === 0) return null;
    return rgbToHsv(sr / n, sg / n, sb / n);
  }, []);

  // Set the red band from a clicked piece (matches actual pieces + lighting,
  // including on a dark square).
  const sampleRedAt = useCallback((nx: number, ny: number) => {
    const hsv = sampleAvgHsvAt(nx, ny);
    if (!hsv) return;
    update({
      redColour: {
        id: 'board-red',
        hue: hsv.h,
        hueTolerance: 16,
        minSaturation: Math.max(28, hsv.s * 0.55),
        minValue: Math.max(18, hsv.v * 0.45),
        minArea: 0.0005,
      },
    });
    setCalibratingRed(false);
  }, [sampleAvgHsvAt, update]);

  // Set the black band from a clicked black piece: thresholds a little above the
  // sampled (dark) value/saturation so that piece and similar ones register.
  const sampleBlackAt = useCallback((nx: number, ny: number) => {
    const hsv = sampleAvgHsvAt(nx, ny);
    if (!hsv) return;
    update({
      blackMaxValue: Math.min(60, Math.max(18, hsv.v * 1.6 + 6)),
      blackMaxSaturation: Math.min(70, Math.max(30, hsv.s + 18)),
    });
    setCalibratingBlack(false);
  }, [sampleAvgHsvAt, update]);

  // Set the blue band from a clicked blue piece.
  const sampleBlueAt = useCallback((nx: number, ny: number) => {
    const hsv = sampleAvgHsvAt(nx, ny);
    if (!hsv) return;
    update({
      blueColour: {
        id: 'board-blue',
        hue: hsv.h,
        hueTolerance: 26,
        minSaturation: Math.max(25, hsv.s * 0.5),
        minValue: Math.max(18, hsv.v * 0.45),
        minArea: 0.0005,
      },
    });
    setCalibratingBlue(false);
  }, [sampleAvgHsvAt, update]);

  const transform = `scaleX(${config.mirrorX ? -1 : 1}) scaleY(${config.mirrorY ? -1 : 1})`;

  return (
    <div
      className="board-sequencer-screen"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16, boxSizing: 'border-box', gap: 12 }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        <button type="button" onClick={() => setCurrentScreen('welcome')}>&larr; Back</button>
        <h1 style={{ fontSize: 18, margin: 0 }}>Board Sequencer</h1>
      </header>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Controls rail */}
        <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <button type="button" onClick={() => setCalibrating(true)}>
            {calibrated ? 'Recalibrate corners' : 'Calibrate corners'}
          </button>
          <button type="button" onClick={() => { setCalibratingRed((v) => !v); setCalibratingBlack(false); }}>
            {calibratingRed ? 'Cancel red calibration' : 'Calibrate red (click a piece)'}
          </button>
          {config.blackDrums && (
            <button type="button" onClick={() => { setCalibratingBlack((v) => !v); setCalibratingRed(false); setCalibratingBlue(false); }}>
              {calibratingBlack ? 'Cancel black calibration' : 'Calibrate black (click a piece)'}
            </button>
          )}
          {config.blueBass && (
            <button type="button" onClick={() => { setCalibratingBlue((v) => !v); setCalibratingRed(false); setCalibratingBlack(false); }}>
              {calibratingBlue ? 'Cancel blue calibration' : 'Calibrate blue (click a piece)'}
            </button>
          )}
          <button type="button" disabled={!calibrated || running} onClick={() => void start()}>
            Start
          </button>
          <button type="button" disabled={!running} onClick={stop}>Stop</button>
          <button type="button" onClick={toggleMuted}>
            {muted ? 'Resume sound' : 'Pause sound'}
          </button>

          <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0' }}>
            Red: <strong>{stats.red}</strong>
            {config.blackDrums && <> · Black: <strong>{stats.black}</strong></>}
            {config.blueBass && <> · Blue: <strong>{stats.blue}</strong></>}
            {' '}· Settled: <strong>{stats.settled}</strong> · max red {Math.round(stats.maxRed * 100)}%
          </p>

          <label>
            Min red fill {Math.round(config.minFilledFraction * 100)}%
            <input
              type="range" min={5} max={50} value={Math.round(config.minFilledFraction * 100)}
              onChange={(e) => update({ minFilledFraction: Number(e.target.value) / 100 })}
            />
          </label>
          {config.blackDrums && (
            <label>
              Black darkness ≤ {config.blackMaxValue}%
              <input
                type="range" min={10} max={70} value={Math.round(config.blackMaxValue)}
                onChange={(e) => update({ blackMaxValue: Number(e.target.value) })}
              />
            </label>
          )}

          <label>
            Tempo {config.bpm} BPM
            <input
              type="range" min={50} max={300} value={config.bpm}
              onChange={(e) => update({ bpm: Number(e.target.value) })}
            />
          </label>
          <label>
            Swing {Math.round(config.swing * 100)}%
            <input
              type="range" min={0} max={60} value={Math.round(config.swing * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                update({ swing: v });
                engineRef.current?.setSwing(v);
              }}
            />
          </label>
          <label>
            Key
            <select
              value={config.scaleRootMidi}
              onChange={(e) => {
                const root = Number(e.target.value);
                update({ scaleRootMidi: root });
                engineRef.current?.setScale(root, configRef.current.scaleSemitones);
              }}
            >
              {NOTE_NAMES.map((n, i) => (
                <option key={n} value={60 + i}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Scale
            <select
              value={config.scaleName}
              onChange={(e) => {
                const preset = SCALE_PRESETS.find((s) => s.name === e.target.value) ?? SCALE_PRESETS[0];
                update({ scaleName: preset.name, scaleSemitones: preset.semitones });
                engineRef.current?.setScale(configRef.current.scaleRootMidi, preset.semitones);
              }}
            >
              {SCALE_PRESETS.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Octave {config.octaveShift > 0 ? `+${config.octaveShift}` : config.octaveShift}
            <input
              type="range" min={-2} max={2} step={1} value={config.octaveShift}
              onChange={(e) => {
                const v = Number(e.target.value);
                update({ octaveShift: v });
                engineRef.current?.setOctaveShift(v);
              }}
            />
          </label>
          <label>
            Note length {config.noteLengthBeats.toFixed(1)} beats
            <input
              type="range" min={1} max={40} value={Math.round(config.noteLengthBeats * 10)}
              onChange={(e) => {
                const v = Number(e.target.value) / 10;
                update({ noteLengthBeats: v });
                engineRef.current?.setNoteLength(v);
              }}
            />
          </label>
          <label>
            Volume {Math.round(config.volume * 100)}%
            <input
              type="range" min={0} max={100} value={Math.round(config.volume * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                update({ volume: v });
                engineRef.current?.setVolume(v);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox" checked={config.tickEnabled}
              onChange={(e) => update({ tickEnabled: e.target.checked })}
            />
            Confirmation tick
          </label>

          <label>
            Backing song
            <select value={selectedSongId} disabled={running} onChange={(e) => void handleSelectSong(e.target.value)}>
              <option value="">None (standalone)</option>
              {SONG_LIBRARY.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
          {selectedSongId && (
            <p style={{ fontSize: 11, opacity: 0.75, margin: 0 }}>
              {songStatus === 'loading' && 'Loading song…'}
              {songStatus === 'loaded' && 'Song ready — board will lock to its tempo + chords'}
              {songStatus === 'error' && 'Song failed to load'}
            </p>
          )}

          <label>
            <input
              type="checkbox" checked={config.mirrorX} disabled={running}
              onChange={(e) => changeOrientation({ mirrorX: e.target.checked })}
            />
            Mirror horizontally
          </label>
          <label>
            <input
              type="checkbox" checked={config.mirrorY} disabled={running}
              onChange={(e) => changeOrientation({ mirrorY: e.target.checked })}
            />
            Flip vertically
          </label>

          <label>
            Row mode
            <select
              value={config.rowMode} disabled={running}
              onChange={(e) => {
                const v = e.target.value;
                const rowMode: BoardSequencerStored['rowMode'] =
                  v === 'drumKit' ? 'drumKit' : v === 'instruments' ? 'instruments' : 'pitched';
                update({ rowMode });
              }}
            >
              <option value="pitched">Pitched (melody)</option>
              <option value="instruments">Per-row instruments</option>
              <option value="drumKit">Drum kit</option>
            </select>
          </label>
          {config.rowMode !== 'drumKit' && (
            <label>
              <input
                type="checkbox" checked={config.blackDrums} disabled={running}
                onChange={(e) => update({ blackDrums: e.target.checked })}
              />
              Black pieces = drums
            </label>
          )}
          {config.rowMode !== 'drumKit' && (
            <label>
              <input
                type="checkbox" checked={config.blueBass} disabled={running}
                onChange={(e) => update({ blueBass: e.target.checked })}
              />
              Blue pieces = bass
            </label>
          )}
          {config.rowMode !== 'drumKit' && (
            <>
              <label>
                Default instrument
                <select
                  value={config.instrumentKey} disabled={running}
                  onChange={(e) => update({ instrumentKey: e.target.value })}
                >
                  {INSTRUMENT_OPTIONS.map((i) => (
                    <option key={i.key} value={i.key}>{i.name}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  Per-row sound{config.blackDrums ? ' (red pieces; black = drums)' : ''} — “Default” uses the instrument above
                </span>
                {Array.from({ length: config.rows }, (_, r) => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 64 }}>
                      Row {r + 1}{r === 0 ? ' (top)' : r === config.rows - 1 ? ' (bottom)' : ''}
                    </span>
                    <select
                      value={config.rowInstruments[r] ?? ''} disabled={running}
                      onChange={(e) => setRowInstrument(r, e.target.value)}
                    >
                      <option value="">Default</option>
                      {INSTRUMENT_OPTIONS.map((i) => (
                        <option key={i.key} value={i.key}>{i.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          <label>
            Rows
            <select
              value={config.rows} disabled={running}
              onChange={(e) => update({ rows: Number(e.target.value) })}
            >
              {[4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Steps
            <select
              value={config.cols} disabled={running}
              onChange={(e) => update({ cols: Number(e.target.value) })}
            >
              {[4, 8, 16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {config.rowMode !== 'drumKit' && (
            <div>
              <button type="button" style={{ fontSize: 12 }} onClick={() => setShowMixer((v) => !v)}>
                {showMixer ? '▾ Per-row mixer' : '▸ Per-row mixer'}
              </button>
              {showMixer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  <div style={{ display: 'flex', gap: 4, fontSize: 10, opacity: 0.7 }}>
                    <span style={{ width: 44 }} />
                    <span style={{ width: 50, textAlign: 'center' }}>Vol</span>
                    <span style={{ width: 50, textAlign: 'center' }}>Tone</span>
                    <span style={{ width: 50, textAlign: 'center' }}>Rev</span>
                    <span style={{ width: 50, textAlign: 'center' }}>Dly</span>
                  </div>
                  {Array.from({ length: config.rows }, (_, r) => (
                    <div key={r} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ width: 44, fontSize: 11 }}>Row {r + 1}</span>
                      {(['rowVolume', 'rowTone', 'rowReverbSend', 'rowDelaySend'] as RowMixField[]).map((f) => {
                        const fallback = f === 'rowVolume' || f === 'rowTone' ? 1 : 0;
                        return (
                          <input
                            key={f} type="range" min={0} max={100} style={{ width: 50 }}
                            value={Math.round((config[f][r] ?? fallback) * 100)}
                            onChange={(e) => setRowMix(f, r, Number(e.target.value) / 100)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>Stop to change grid/mode/orientation</p>
        </div>

        {/* Camera + grid/detection overlay + calibration */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', display: 'block', transform, borderRadius: 6 }}
            />
            <canvas
              ref={overlayRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {calibrating && <BoardCalibrationOverlay onComplete={handleCalibrated} />}
            {calibratingRed && (
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  sampleRedAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                role="button"
                tabIndex={0}
                aria-label="Click a red piece to calibrate its colour"
              >
                <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
                  Click a red piece (ideally on a dark square)
                </div>
              </div>
            )}
            {calibratingBlack && (
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  sampleBlackAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                role="button"
                tabIndex={0}
                aria-label="Click a black piece to calibrate its darkness"
              >
                <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
                  Click a black piece
                </div>
              </div>
            )}
            {calibratingBlue && (
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  sampleBlueAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                role="button"
                tabIndex={0}
                aria-label="Click a blue piece to calibrate its colour"
              >
                <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
                  Click a blue piece
                </div>
              </div>
            )}
            {error && <div style={{ position: 'absolute', top: 8, left: 8, color: '#ff8080' }}>{error}</div>}
          </div>
        </div>

        {/* Warped board (abstract view) */}
        <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <WarpedBoardView rows={config.rows} cols={config.cols} active={active} playheadCol={playheadCol} />
        </div>
      </div>
    </div>
  );
}
