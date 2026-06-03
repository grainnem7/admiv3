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
import { BoardSequencerMode, type CellRef } from '../../tracking/BoardSequencerMode';
import { RedColourRecognizer } from '../../tracking/PieceRecognizer';
import { BoardSequencerEngine } from '../../songs/BoardSequencerEngine';
import { computeHomography, applyHomography, UNIT_SQUARE, type Mat3 } from '../../utils/homography';
import { stepIndexAt } from '../../songs/boardSequencerScale';
import {
  loadBoardSequencerConfig, saveBoardSequencerConfig, DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored, type BoardPoint,
} from '../../profiles/BoardSequencerConfig';
import BoardCalibrationOverlay from '../components/board/BoardCalibrationOverlay';
import WarpedBoardView from '../components/board/WarpedBoardView';
import { INSTRUMENT_PALETTE_LIST } from '../../songs/voices/presets/instrumentPalette';

interface DetStats {
  occupied: number;
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
  const [active, setActive] = useState<CellRef[]>([]);
  const [playheadCol, setPlayheadCol] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DetStats>({ occupied: 0, settled: 0, maxRed: 0 });

  const update = useCallback((patch: Partial<BoardSequencerStored>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  const buildHomography = useCallback((corners: BoardPoint[], video: HTMLVideoElement): Mat3 => {
    const dst = corners.map((c) => ({ x: c.x * video.videoWidth, y: c.y * video.videoHeight }));
    return computeHomography(UNIT_SQUARE, dst);
  }, []);

  // Draw our sampling grid onto the camera, tinting cells by detection state.
  const drawOverlay = useCallback(
    (occupied: Set<string>, activeSet: Set<string>, cfg: BoardSequencerStored, playCol: number) => {
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
          if (activeSet.has(key)) ctx.fillStyle = 'rgba(255,40,40,0.5)';
          else if (occupied.has(key)) ctx.fillStyle = 'rgba(255,170,40,0.32)';
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
          const recognizer = new RedColourRecognizer(cfg.minFilledFraction);
          const readings = reader.read(video, {
            homography: h, rows: cfg.rows, cols: cfg.cols, red: cfg.redColour, recognizer,
            mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY,
          });
          const occupied = new Set<string>();
          let maxRed = 0;
          for (const rd of readings) {
            if (rd.occupied) occupied.add(`${rd.row},${rd.col}`);
            const rf = rd.redFraction ?? 0;
            if (rf > maxRed) maxRed = rf;
          }
          let activeArr: CellRef[] = [];
          let playCol = 0;
          if (runningRef.current && modeRef.current && engineRef.current) {
            const res = modeRef.current.step(readings, dt, now);
            engineRef.current.setActiveCells(res.activeCells);
            if (res.justSettled.length > 0) engineRef.current.fireTick();
            activeArr = res.activeCells;
            playCol = stepIndexAt(Tone.now(), startSecRef.current, 60 / cfg.bpm, cfg.cols);
          }
          const activeSet = new Set(activeArr.map((c) => `${c.row},${c.col}`));
          drawOverlay(occupied, activeSet, cfg, playCol);
          if (now - lastStateMs > 100) {
            lastStateMs = now;
            setActive(activeArr);
            setPlayheadCol(playCol);
            setStats({ occupied: occupied.size, settled: activeSet.size, maxRed });
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
    setRunning(false);
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
      scaleRootMidi: cfg.scaleRootMidi, scaleSemitones: cfg.scaleSemitones,
      noteLengthBeats: cfg.noteLengthBeats, velocity: cfg.velocity,
      tickEnabled: cfg.tickEnabled, instrumentKey: cfg.instrumentKey,
      rowMode: cfg.rowMode,
    });
    await engine.init();
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
          <button type="button" disabled={!calibrated || running} onClick={() => void start()}>
            Start
          </button>
          <button type="button" disabled={!running} onClick={stop}>Stop</button>

          <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0' }}>
            Detected: <strong>{stats.occupied}</strong> · Settled: <strong>{stats.settled}</strong> · max red {Math.round(stats.maxRed * 100)}%
          </p>

          <label>
            Tempo {config.bpm} BPM
            <input
              type="range" min={50} max={140} value={config.bpm}
              onChange={(e) => update({ bpm: Number(e.target.value) })}
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
              onChange={(e) => update({ rowMode: e.target.value === 'drumKit' ? 'drumKit' : 'pitched' })}
            >
              <option value="pitched">Pitched (melody)</option>
              <option value="drumKit">Drum kit</option>
            </select>
          </label>
          {config.rowMode === 'pitched' && (
            <label>
              Instrument
              <select
                value={config.instrumentKey} disabled={running}
                onChange={(e) => update({ instrumentKey: e.target.value })}
              >
                {INSTRUMENT_PALETTE_LIST.map((i) => (
                  <option key={i.key} value={i.key}>{i.name}</option>
                ))}
              </select>
            </label>
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
