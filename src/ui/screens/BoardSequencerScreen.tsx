/**
 * BoardSequencerScreen — standalone "physical board → step sequencer" mode.
 *
 * Place red pieces on a physical grid in view of the camera; each settled piece
 * activates a cell. A playhead sweeps the columns at the chosen tempo and sounds
 * the active cells (rows = a fixed pentatonic scale). Reached by explicit
 * navigation from the Welcome screen; OFF by default (no auto-enable). It does
 * not touch any other mode/screen.
 *
 * Pipeline: CameraManager → BoardReader (homography + red recognizer) →
 * BoardSequencerMode (slide-and-settle) → BoardSequencerEngine (audio). The UI
 * only calls Tone.start() for the user-gesture audio unlock and Tone.now() for
 * the playhead; all note/tick audio goes through the engine.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { BoardReader } from '../../tracking/BoardReader';
import { BoardSequencerMode, type CellRef } from '../../tracking/BoardSequencerMode';
import { RedColourRecognizer } from '../../tracking/PieceRecognizer';
import { BoardSequencerEngine } from '../../songs/BoardSequencerEngine';
import { computeHomography, UNIT_SQUARE, type Mat3 } from '../../utils/homography';
import { stepIndexAt } from '../../songs/boardSequencerScale';
import {
  loadBoardSequencerConfig, saveBoardSequencerConfig, DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored, type BoardPoint,
} from '../../profiles/BoardSequencerConfig';
import BoardCalibrationOverlay from '../components/board/BoardCalibrationOverlay';
import WarpedBoardView from '../components/board/WarpedBoardView';
import { INSTRUMENT_PALETTE_LIST } from '../../songs/voices/presets/instrumentPalette';

export default function BoardSequencerScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const readerRef = useRef<BoardReader | null>(null);
  const modeRef = useRef<BoardSequencerMode | null>(null);
  const engineRef = useRef<BoardSequencerEngine | null>(null);
  const homographyRef = useRef<Mat3 | null>(null);
  const rafRef = useRef<number>(0);
  const startSecRef = useRef(0);

  const storedRef = useRef<BoardSequencerStored | null>(loadBoardSequencerConfig());
  const [config, setConfig] = useState<BoardSequencerStored>(
    () => storedRef.current ?? DEFAULT_BOARD_SEQUENCER_CONFIG,
  );
  // Not-yet-calibrated is a first-class state: true only once a config has been
  // saved (loaded from storage or calibrated this session). The default corners
  // are the unit square, so corner values cannot be used as the signal.
  const [calibrated, setCalibrated] = useState<boolean>(storedRef.current !== null);
  const [calibrating, setCalibrating] = useState(false);
  const [active, setActive] = useState<CellRef[]>([]);
  const [playheadCol, setPlayheadCol] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((patch: Partial<BoardSequencerStored>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

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
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      cam.stop();
    };
  }, []);

  const buildHomography = useCallback((corners: BoardPoint[], video: HTMLVideoElement): Mat3 => {
    const dst = corners.map((c) => ({ x: c.x * video.videoWidth, y: c.y * video.videoHeight }));
    return computeHomography(UNIT_SQUARE, dst);
  }, []);

  const handleCalibrated = useCallback(
    (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint]) => {
      const next = { ...config, corners, enabled: true };
      setConfig(next);
      saveBoardSequencerConfig(next);
      if (videoRef.current) homographyRef.current = buildHomography(corners, videoRef.current);
      setCalibrated(true);
      setCalibrating(false);
    },
    [config, buildHomography],
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.dispose();
    engineRef.current = null;
    modeRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    await Tone.start();
    if (engineRef.current) { engineRef.current.dispose(); engineRef.current = null; }
    cancelAnimationFrame(rafRef.current);
    if (videoRef.current && !homographyRef.current) {
      homographyRef.current = buildHomography(config.corners, videoRef.current);
    }
    modeRef.current = new BoardSequencerMode({
      settleWindowMs: config.settleWindowMs,
      velocityFloor: config.velocityFloor,
      velocitySmoothing: config.velocitySmoothing,
      occupancyGraceMs: config.occupancyGraceMs,
      motionConfirmMs: config.motionConfirmMs,
    });
    const engine = new BoardSequencerEngine({
      bpm: config.bpm, rows: config.rows, cols: config.cols,
      scaleRootMidi: config.scaleRootMidi, scaleSemitones: config.scaleSemitones,
      noteLengthBeats: config.noteLengthBeats, velocity: config.velocity,
      tickEnabled: config.tickEnabled, instrumentKey: config.instrumentKey,
      rowMode: config.rowMode,
    });
    await engine.init();
    engine.start();
    engineRef.current = engine;
    startSecRef.current = Tone.now();
    setRunning(true);

    const recognizer = new RedColourRecognizer(config.minFilledFraction);
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const video = videoRef.current;
      const reader = readerRef.current;
      const mode = modeRef.current;
      const h = homographyRef.current;
      if (video && reader && mode && h && video.videoWidth > 0) {
        const readings = reader.read(video, {
          homography: h, rows: config.rows, cols: config.cols, red: config.redColour, recognizer,
          mirror: true,
        });
        const res = mode.step(readings, dt, now);
        engine.setActiveCells(res.activeCells);
        if (res.justSettled.length > 0) engine.fireTick();
        setActive(res.activeCells);
        setPlayheadCol(stepIndexAt(Tone.now(), startSecRef.current, 60 / config.bpm, config.cols));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [config, buildHomography]);

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
          <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>Stop to change grid/mode/instrument</p>
        </div>

        {/* Camera + calibration */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', display: 'block', transform: 'scaleX(-1)', borderRadius: 6 }}
            />
            {calibrating && <BoardCalibrationOverlay onComplete={handleCalibrated} />}
            {error && <div style={{ position: 'absolute', top: 8, left: 8, color: '#ff8080' }}>{error}</div>}
          </div>
        </div>

        {/* Warped board (facilitator feedback) */}
        <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <WarpedBoardView rows={config.rows} cols={config.cols} active={active} playheadCol={playheadCol} />
        </div>
      </div>
    </div>
  );
}
