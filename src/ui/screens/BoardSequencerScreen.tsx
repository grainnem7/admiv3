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
import { BoardSequencerMode, type CellRef, type PieceColour, type ActiveCell } from '../../tracking/BoardSequencerMode';
import { ColourRecognizer } from '../../tracking/PieceRecognizer';
import { rgbToHsv } from '../../tracking/ColorTracker';
import {
  BOARD_COLOURS, BOARD_COLOUR_BY_ID, buildMatchers,
  ROLE_LABELS, isControlRole, isFaderRole,
  type ColourId, type ColourRole, type ColourCalibration,
} from '../../tracking/boardColours';
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
  { key: 'chord', name: 'Chord stab' },
];

// Per-row drum choices (kit pieces the RoundRobinDrumKit can play). '' keeps the
// default bottom→top mapping (kick, snare, hat, crash) for that row.
const DRUM_OPTIONS: { key: string; name: string }[] = [
  { key: 'kick', name: 'Kick' },
  { key: 'snare', name: 'Snare' },
  { key: 'hat', name: 'Hi-hat' },
  { key: 'crash', name: 'Crash' },
  { key: 'kickCrash', name: 'Kick + crash' },
  { key: 'tom', name: 'Tom' },
  { key: 'clap', name: 'Clap' },
  { key: 'rim', name: 'Rim' },
];

// Polyrhythm roles: each colour/role can loop at its own length (0 = full grid).
const POLY_ROLES: {
  role: 'red' | 'black' | 'blue';
  field: 'loopStepsRed' | 'loopStepsBlack' | 'loopStepsBlue';
  label: string;
}[] = [
  { role: 'red', field: 'loopStepsRed', label: 'Melody' },
  { role: 'black', field: 'loopStepsBlack', label: 'Drums' },
  { role: 'blue', field: 'loopStepsBlue', label: 'Bass' },
];

// Role options for the colour→role picker, grouped for the dropdown.
const ROLE_OPTIONS: { value: ColourRole; label: string }[] =
  (Object.keys(ROLE_LABELS) as ColourRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** The colours currently assigned a role (≠ off), in detection priority order. */
function inUseColours(cfg: BoardSequencerStored): ColourId[] {
  return BOARD_COLOURS
    .map((c) => c.id)
    .filter((id) => (cfg.colourRoles[id] ?? 'off') !== 'off');
}

/** Assemble the calibration bundle the matcher builder needs from config. */
function colourCalibration(cfg: BoardSequencerStored): ColourCalibration {
  return { hueBands: cfg.hueBands, black: cfg.blackBand, white: cfg.whiteBand };
}

/** Overlay tint for a detected colour: its palette swatch at a strong/weak alpha. */
function colourTint(colour: ColourId, strong: boolean): string {
  const hex = BOARD_COLOUR_BY_ID[colour]?.swatch ?? '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${strong ? 0.6 : 0.32})`;
}

interface DetStats {
  /** Live count of settled pieces per colour. */
  byColour: Partial<Record<ColourId, number>>;
  settled: number;
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
  // Freshest live settled cells (with colour), for capturing page snapshots.
  const activeCellsRef = useRef<ActiveCell[]>([]);

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
  // Which colour's band we're calibrating from the next click (null = none).
  const [calibratingColour, setCalibratingColour] = useState<ColourId | null>(null);
  const calibratingColourRef = useRef<ColourId | null>(null);
  calibratingColourRef.current = calibratingColour;
  const [active, setActive] = useState<CellRef[]>([]);
  const [playheadCol, setPlayheadCol] = useState(0);
  // Pattern chaining: which page the live camera edits, and which is playing now.
  const [selectedPage, setSelectedPage] = useState(0);
  const selectedPageRef = useRef(0);
  selectedPageRef.current = selectedPage;
  const [playingPage, setPlayingPage] = useState(0);
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
  const [stats, setStats] = useState<DetStats>({ byColour: {}, settled: 0 });
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

  // Set the drum for one row (per-row drum choice), growing the array to cover
  // the current row count. '' = use the default kit mapping for that row.
  const setRowDrum = useCallback((row: number, drum: string) => {
    setConfig((prev) => {
      const arr = [...prev.rowDrums];
      while (arr.length <= row) arr.push('');
      arr[row] = drum;
      const next = { ...prev, rowDrums: arr };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  // Pattern chaining: select which page the live camera edits.
  const selectPage = useCallback((i: number) => {
    setSelectedPage(i);
    engineRef.current?.setSelectedPage(i);
  }, []);

  // Change how many pages the sequence chains across; clamp the selection.
  const setPagesCount = useCallback((n: number) => {
    setConfig((prev) => {
      const next = { ...prev, numPages: n };
      saveBoardSequencerConfig(next);
      return next;
    });
    engineRef.current?.setNumPages(n);
    if (selectedPageRef.current >= n) selectPage(0);
  }, [selectPage]);

  // Freeze the current live board into the selected page, then auto-advance so
  // the next page can be laid down.
  const capturePage = useCallback(() => {
    const i = selectedPageRef.current;
    const cells = activeCellsRef.current.map((c) => ({ row: c.row, col: c.col, colour: c.colour }));
    setConfig((prev) => {
      const pages = prev.pages.map((p) => [...p]);
      while (pages.length <= i) pages.push([]);
      pages[i] = cells;
      const next = { ...prev, pages };
      saveBoardSequencerConfig(next);
      return next;
    });
    engineRef.current?.setPageSnapshot(i, activeCellsRef.current);
    const n = Math.max(1, configRef.current.numPages);
    const nextPage = (i + 1) % n;
    setSelectedPage(nextPage);
    engineRef.current?.setSelectedPage(nextPage);
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
          ctx.fillStyle = colour ? colourTint(colour, strong) : 'rgba(0,0,0,0)';
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
          // Build matchers + recognizer from the colours currently in use (any
          // colour with a role ≠ off), in detection priority order.
          const inUse = inUseColours(cfg);
          const priority = inUse.length > 0 ? inUse : (['red'] as ColourId[]);
          const matchers = buildMatchers(priority, colourCalibration(cfg));
          const recognizer = new ColourRecognizer(cfg.minFilledFraction, priority);
          const readings = reader.read(video, {
            homography: h, rows: cfg.rows, cols: cfg.cols, colours: matchers, recognizer,
            mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY,
          });
          const occupied = new Map<string, PieceColour>();
          const byColour: Partial<Record<ColourId, number>> = {};
          for (const rd of readings) {
            if (rd.occupied && rd.colour) {
              occupied.set(`${rd.row},${rd.col}`, rd.colour);
              byColour[rd.colour] = (byColour[rd.colour] ?? 0) + 1;
            }
          }
          let activeArr: CellRef[] = [];
          const activeMap = new Map<string, PieceColour>();
          let playCol = 0;
          if (runningRef.current && modeRef.current && engineRef.current) {
            const res = modeRef.current.step(readings, dt, now);
            engineRef.current.setActiveCells(res.activeCells);
            activeCellsRef.current = res.activeCells;
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
            if (cfg.numPages > 1 && engineRef.current) {
              setPlayingPage(engineRef.current.getCurrentPage());
            }
            setStats({ byColour, settled: activeMap.size });
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
      humanize: cfg.humanize,
      noteLengthBeats: cfg.noteLengthBeats, velocity: cfg.velocity,
      tickEnabled: cfg.tickEnabled, instrumentKey: cfg.instrumentKey,
      rowMode: cfg.rowMode, colourRoles: cfg.colourRoles, faderAxis: cfg.faderAxis,
      rowInstruments: cfg.rowInstruments, rowDrums: cfg.rowDrums,
      loopStepsRed: cfg.loopStepsRed, loopStepsBlack: cfg.loopStepsBlack,
      loopStepsBlue: cfg.loopStepsBlue, numPages: cfg.numPages,
      octaveShift: cfg.octaveShift, volume: cfg.volume,
      rowVolume: cfg.rowVolume, rowTone: cfg.rowTone,
      rowReverbSend: cfg.rowReverbSend, rowDelaySend: cfg.rowDelaySend,
    });
    await engine.init();
    engine.setMuted(mutedRef.current);
    // Pattern chaining: load captured page snapshots + the live (selected) page.
    engine.setPages(cfg.pages as ActiveCell[][]);
    engine.setSelectedPage(selectedPageRef.current);
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

  // Calibrate the colour currently armed (calibratingColour) from a click: hue
  // colours set their band's hue + thresholds; black/white set their achromatic
  // band a little outside the sampled value/saturation so similar pieces register.
  const sampleColourAt = useCallback((nx: number, ny: number) => {
    const colour = calibratingColourRef.current;
    if (!colour) return;
    const hsv = sampleAvgHsvAt(nx, ny);
    if (!hsv) return;
    const def = BOARD_COLOUR_BY_ID[colour];
    if (def.kind === 'hue') {
      update({
        hueBands: {
          ...configRef.current.hueBands,
          [colour]: {
            id: `board-${colour}`,
            hue: hsv.h,
            hueTolerance: 22,
            minSaturation: Math.max(25, hsv.s * 0.5),
            minValue: Math.max(18, hsv.v * 0.45),
            minArea: 0.0005,
          },
        },
      });
    } else if (def.kind === 'black') {
      update({
        blackBand: {
          maxValue: Math.min(60, Math.max(18, hsv.v * 1.6 + 6)),
          maxSaturation: Math.min(70, Math.max(30, hsv.s + 18)),
        },
      });
    } else {
      update({
        whiteBand: {
          minValue: Math.min(95, Math.max(55, hsv.v * 0.85)),
          maxSaturation: Math.min(40, Math.max(10, hsv.s + 12)),
        },
      });
    }
    setCalibratingColour(null);
  }, [sampleAvgHsvAt, update]);

  const transform = `scaleX(${config.mirrorX ? -1 : 1}) scaleY(${config.mirrorY ? -1 : 1})`;
  // Colours currently in use (role ≠ off) + whether any colour drums (drives the
  // per-row drum picker), computed once per render for the controls rail.
  const inUseList = inUseColours(config);
  const anyDrums = config.rowMode === 'drumKit'
    || inUseList.some((id) => config.colourRoles[id] === 'drums');
  const colourLabel = (id: ColourId) => BOARD_COLOUR_BY_ID[id].name;

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
          {inUseList.map((id) => (
            <button
              key={id} type="button"
              onClick={() => setCalibratingColour((c) => (c === id ? null : id))}
            >
              {calibratingColour === id
                ? `Cancel ${colourLabel(id)} calibration`
                : `Calibrate ${colourLabel(id)} (click a piece)`}
            </button>
          ))}
          <button type="button" disabled={!calibrated || running} onClick={() => void start()}>
            Start
          </button>
          <button type="button" disabled={!running} onClick={stop}>Stop</button>
          <button type="button" onClick={toggleMuted}>
            {muted ? 'Resume sound' : 'Pause sound'}
          </button>

          <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0' }}>
            {inUseList.map((id) => (
              <span key={id}>{colourLabel(id)}: <strong>{stats.byColour[id] ?? 0}</strong>{' · '}</span>
            ))}
            Settled: <strong>{stats.settled}</strong>
          </p>

          <label>
            Min fill {Math.round(config.minFilledFraction * 100)}%
            <input
              type="range" min={5} max={50} value={Math.round(config.minFilledFraction * 100)}
              onChange={(e) => update({ minFilledFraction: Number(e.target.value) / 100 })}
            />
          </label>
          {inUseList.includes('black') && (
            <label>
              Black darkness ≤ {config.blackBand.maxValue}%
              <input
                type="range" min={10} max={70} value={Math.round(config.blackBand.maxValue)}
                onChange={(e) => update({ blackBand: { ...config.blackBand, maxValue: Number(e.target.value) } })}
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
            Humanize {Math.round(config.humanize * 100)}%
            <input
              type="range" min={0} max={100} value={Math.round(config.humanize * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                update({ humanize: v });
                engineRef.current?.setHumanize(v);
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Colour roles — give each piece colour a job (sequenced sound or live control). Calibrate each colour you switch on.
            </span>
            {BOARD_COLOURS.map((def) => (
              <label key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  background: def.swatch, border: '1px solid #0006',
                }}
                />
                <span style={{ width: 52 }}>{def.name}</span>
                <select
                  value={config.colourRoles[def.id] ?? 'off'} disabled={running}
                  onChange={(e) => update({
                    colourRoles: { ...config.colourRoles, [def.id]: e.target.value as ColourRole },
                  })}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {inUseList.some((id) => isControlRole(config.colourRoles[id] ?? 'off')
            && isFaderRole(config.colourRoles[id] ?? 'off')) && (
            <label>
              Fader reads
              <select
                value={config.faderAxis} disabled={running}
                onChange={(e) => update({ faderAxis: e.target.value === 'col' ? 'col' : 'row' })}
              >
                <option value="row">Vertical (low → high)</option>
                <option value="col">Horizontal (left → right)</option>
              </select>
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
                  Per-row sound (melody/chord colours) — “Default” uses the instrument above
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
          {anyDrums && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                Per-row drum (drum colours) — “Default” = kick/snare/hat/crash bottom→top
              </span>
              {Array.from({ length: config.rows }, (_, r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 64 }}>
                    Row {r + 1}{r === 0 ? ' (top)' : r === config.rows - 1 ? ' (bottom)' : ''}
                  </span>
                  <select
                    value={config.rowDrums[r] ?? ''} disabled={running}
                    onChange={(e) => setRowDrum(r, e.target.value)}
                  >
                    <option value="">Default</option>
                    {DRUM_OPTIONS.map((d) => (
                      <option key={d.key} value={d.key}>{d.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
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
          <label>
            Pages
            <select
              value={config.numPages} disabled={running}
              onChange={(e) => setPagesCount(Number(e.target.value))}
            >
              {[1, 2, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {config.numPages > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                Pages — the selected page (●) plays live from the camera; Capture freezes it and moves to the next. Loop = {config.numPages * config.cols} steps.
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Array.from({ length: config.numPages }, (_, i) => {
                  const isSel = i === selectedPage;
                  const isPlaying = running && i === playingPage;
                  const hasSnapshot = (config.pages[i]?.length ?? 0) > 0;
                  return (
                    <button
                      key={i} type="button" onClick={() => selectPage(i)}
                      style={{
                        fontSize: 12, padding: '4px 10px',
                        fontWeight: isSel ? 700 : 400,
                        border: isPlaying ? '2px solid #4caf50' : '1px solid #888',
                        opacity: hasSnapshot || isSel ? 1 : 0.5,
                      }}
                    >
                      {String.fromCharCode(65 + i)}{isSel ? ' ●' : ''}
                    </button>
                  );
                })}
              </div>
              <button
                type="button" style={{ fontSize: 12 }} disabled={!running}
                onClick={capturePage}
              >
                Capture board → Page {String.fromCharCode(65 + selectedPage)}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Polyrhythm — loop length per role (Off = full {config.cols} steps; shorter values drift against each other)
            </span>
            {POLY_ROLES.map(({ role, field, label }) => (
              <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 64 }}>{label}</span>
                <select
                  value={config[field]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    update({ [field]: n } as Partial<BoardSequencerStored>);
                    engineRef.current?.setLoopSteps(role, n);
                  }}
                >
                  <option value={0}>Off</option>
                  {[2, 3, 4, 5, 6, 7, 8].filter((n) => n <= config.cols).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
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
            {calibratingColour && (
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  sampleColourAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                role="button"
                tabIndex={0}
                aria-label={`Click a ${colourLabel(calibratingColour)} piece to calibrate it`}
              >
                <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
                  Click a {colourLabel(calibratingColour)} piece{calibratingColour === 'red' ? ' (ideally on a dark square)' : ''}
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
