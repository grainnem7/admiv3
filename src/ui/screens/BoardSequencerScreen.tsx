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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { BoardReader } from '../../tracking/BoardReader';
import { BoardSequencerMode, type PieceColour, type ActiveCell } from '../../tracking/BoardSequencerMode';
import { ColourRecognizer } from '../../tracking/PieceRecognizer';
import { rgbToHsv } from '../../tracking/ColorTracker';
import {
  buildChannelMatchers, channelPriority, calibrationFromHsv,
  describeChannel, freshChannelId, isFaderRole, ROLE_LABELS,
  type ColourChannel, type ColourId, type ColourRole,
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

/** Collapsible, titled group for the controls rail (keeps the rail uncluttered). */
function Section({ title, hint, open, onToggle, children }: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div style={{ borderTop: '1px solid #ffffff1a' }}>
      <button
        type="button" onClick={onToggle} aria-expanded={open}
        style={{
          width: '100%', background: 'none', border: 'none', color: 'inherit',
          padding: '9px 2px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', font: 'inherit',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.2 }}>{title}</span>
        <span style={{ opacity: 0.55, fontSize: 11 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 2px 12px' }}>
          {hint && <span style={{ fontSize: 11, opacity: 0.65 }}>{hint}</span>}
          {children}
        </div>
      )}
    </div>
  );
}

/** Overlay tint from a channel swatch hex at a strong/weak alpha. */
function colourTint(hex: string, strong: boolean): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  const r = m ? parseInt(m[1], 16) : 200;
  const g = m ? parseInt(m[2], 16) : 200;
  const b = m ? parseInt(m[3], 16) : 200;
  return `rgba(${r},${g},${b},${strong ? 0.6 : 0.32})`;
}

/** Average RGB → CSS hex (for a channel swatch). */
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface DetStats {
  /** Live count of settled pieces per colour channel id. */
  byColour: Partial<Record<ColourId, number>>;
  settled: number;
}

/** What the next camera click calibrates: a brand-new channel, or an existing one. */
type ColourCalibTarget = { mode: 'new' } | { mode: 'recal'; id: ColourId };

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
  // Colour calibration armed for the next camera click: add a new channel, or
  // recalibrate an existing one (null = not calibrating).
  const [colourCalib, setColourCalib] = useState<ColourCalibTarget | null>(null);
  const colourCalibRef = useRef<ColourCalibTarget | null>(null);
  colourCalibRef.current = colourCalib;
  const [active, setActive] = useState<ActiveCell[]>([]);
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
  // Which controls-rail sections are expanded. Colours open by default (primary
  // task); Camera also opens first run so the corner-calibration step is visible.
  const [openSection, setOpenSection] = useState<Record<string, boolean>>({
    colours: true,
    camera: storedRef.current === null,
  });
  const toggleSection = useCallback(
    (id: string) => setOpenSection((s) => ({ ...s, [id]: !s[id] })),
    [],
  );

  const update = useCallback((patch: Partial<BoardSequencerStored>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  // Patch one field of a colour channel (instrument/drum/volume/tone/sends).
  const patchChannel = useCallback((id: string, patch: Partial<ColourChannel>) => {
    setConfig((prev) => {
      const next = { ...prev, channels: prev.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  // Live per-channel mixer; persists + applies to the running engine.
  type ChannelMixField = 'volume' | 'tone' | 'reverbSend' | 'delaySend';
  const setChannelMix = useCallback((id: string, field: ChannelMixField, value: number) => {
    patchChannel(id, { [field]: value });
    const eng = engineRef.current;
    if (!eng) return;
    if (field === 'volume') eng.setChannelVolume(id, value);
    else if (field === 'tone') eng.setChannelTone(id, value);
    else if (field === 'reverbSend') eng.setChannelReverbSend(id, value);
    else eng.setChannelDelaySend(id, value);
  }, [patchChannel]);

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
      swatchById: Map<ColourId, string>,
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
          const hex = colour ? swatchById.get(colour) : undefined;
          ctx.fillStyle = hex ? colourTint(hex, strong) : 'rgba(0,0,0,0)';
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
          // Build matchers + recognizer from the user's calibrated channels, in
          // detection priority order (vivid hues before black/white).
          const matchers = buildChannelMatchers(cfg.channels);
          const priority = channelPriority(cfg.channels);
          const recognizer = new ColourRecognizer(cfg.minFilledFraction, priority);
          const swatchById = new Map(cfg.channels.map((c) => [c.id, c.swatch]));
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
          let activeArr: ActiveCell[] = [];
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
          drawOverlay(occupied, activeMap, cfg, playCol, swatchById);
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
      tickEnabled: cfg.tickEnabled,
      channels: cfg.channels, faderAxis: cfg.faderAxis,
      loopStepsRed: cfg.loopStepsRed, loopStepsBlack: cfg.loopStepsBlack,
      loopStepsBlue: cfg.loopStepsBlue, numPages: cfg.numPages,
      octaveShift: cfg.octaveShift, volume: cfg.volume,
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
  const sampleAvgHsvAt = useCallback((nx: number, ny: number): { h: number; s: number; v: number; hex: string } | null => {
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
    const R = 10;
    const x0 = Math.max(0, px - R);
    const y0 = Math.max(0, py - R);
    const sw = Math.min(2 * R, w - x0);
    const sh = Math.min(2 * R, h - y0);
    const { data } = ctx.getImageData(x0, y0, sw, sh);
    // The click area on an angled board mixes the counter with the tan wood (and
    // any glare) next to it. Averaging RGB across those different hues cancels to
    // GREY. So instead: find the most vivid pixel (the counter), then average
    // only pixels of THAT hue — isolating the counter's true colour.
    const pxs = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const hsv = rgbToHsv(r, g, b);
      pxs.push({ r, g, b, h: hsv.h, s: hsv.s });
    }
    if (pxs.length === 0) return null;
    // Seed = the most saturated pixel (the vivid counter, not wood/glare).
    const seed = pxs.reduce((best, p) => (p.s > best.s ? p : best), pxs[0]);
    const hueDist = (a: number, bb: number) => {
      const d = Math.abs(a - bb) % 360;
      return d > 180 ? 360 - d : d;
    };
    // Average pixels within ±28° of the seed hue with enough saturation — the
    // counter's body — ignoring the wood/background and desaturated glare.
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (const p of pxs) {
      if (p.s >= seed.s * 0.5 && hueDist(p.h, seed.h) <= 28) {
        sr += p.r; sg += p.g; sb += p.b; n++;
      }
    }
    if (n === 0) { sr = seed.r; sg = seed.g; sb = seed.b; n = 1; }
    const ar = sr / n;
    const ag = sg / n;
    const ab = sb / n;
    return { ...rgbToHsv(ar, ag, ab), hex: rgbToHex(ar, ag, ab) };
  }, []);

  // A camera click while calibrating: sample the piece's colour, then either add
  // a new channel or update the one being recalibrated. The kind (hue/black/
  // white) is inferred from the sample, and the swatch shows the real colour.
  const sampleColourClick = useCallback((nx: number, ny: number) => {
    const target = colourCalibRef.current;
    if (!target) return;
    const s = sampleAvgHsvAt(nx, ny);
    if (!s) return;
    const cal = calibrationFromHsv({ h: s.h, s: s.s, v: s.v });
    setConfig((prev) => {
      let channels: ColourChannel[];
      if (target.mode === 'new') {
        const id = freshChannelId(prev.channels.map((c) => c.id));
        channels = [...prev.channels, {
          id, kind: cal.kind, role: 'melody', swatch: s.hex,
          band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand,
        }];
      } else {
        channels = prev.channels.map((c) => (c.id === target.id
          ? {
            id: c.id, role: c.role, kind: cal.kind, swatch: s.hex,
            band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand,
          }
          : c));
      }
      const next = { ...prev, channels };
      saveBoardSequencerConfig(next);
      return next;
    });
    setColourCalib(null);
  }, [sampleAvgHsvAt]);

  const addColour = useCallback(() => setColourCalib({ mode: 'new' }), []);
  const recalibrateChannel = useCallback(
    (id: ColourId) => setColourCalib((t) => (t && t.mode === 'recal' && t.id === id ? null : { mode: 'recal', id })),
    [],
  );
  const setChannelRole = useCallback((id: ColourId, role: ColourRole) => {
    setConfig((prev) => {
      const next = { ...prev, channels: prev.channels.map((c) => (c.id === id ? { ...c, role } : c)) };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);
  const setChannelBlackDarkness = useCallback((id: ColourId, maxValue: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        channels: prev.channels.map((c) => (c.id === id
          ? { ...c, blackBand: { maxValue, maxSaturation: c.blackBand?.maxSaturation ?? 45 } }
          : c)),
      };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);
  const removeChannel = useCallback((id: ColourId) => {
    setColourCalib((t) => (t && t.mode === 'recal' && t.id === id ? null : t));
    setConfig((prev) => {
      const next = { ...prev, channels: prev.channels.filter((c) => c.id !== id) };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);
  const clearChannels = useCallback(() => {
    setColourCalib(null);
    setConfig((prev) => {
      const next = { ...prev, channels: [] };
      saveBoardSequencerConfig(next);
      return next;
    });
  }, []);

  const transform = `scaleX(${config.mirrorX ? -1 : 1}) scaleY(${config.mirrorY ? -1 : 1})`;
  // Per-render derived: the calibrated channels, whether any drums (drives the
  // per-row drum picker), and a colour-id → channel lookup for labels/swatches.
  const channels = config.channels;
  const anyFader = channels.some((c) => isFaderRole(c.role));
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const labelForId = (id: ColourId) => {
    const c = channelById.get(id);
    return c ? describeChannel(c) : id;
  };
  const calibLabel = colourCalib === null ? ''
    : colourCalib.mode === 'new' ? 'a new colour'
      : labelForId(colourCalib.id);

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
        <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Pinned transport — always visible */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={{ flex: 1 }} disabled={!calibrated || running} onClick={() => void start()}>
                ▶ Start
              </button>
              <button type="button" style={{ flex: 1 }} disabled={!running} onClick={stop}>■ Stop</button>
            </div>
            <button type="button" disabled={!running} onClick={toggleMuted}>
              {muted ? 'Resume sound' : 'Pause sound'}
            </button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.9 }}>
              {channels.map((c) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={describeChannel(c)}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', background: c.swatch, border: '1px solid #0006',
                  }}
                  />
                  <strong>{stats.byColour[c.id] ?? 0}</strong>
                </span>
              ))}
              <span style={{ opacity: 0.7 }}>· Settled <strong>{stats.settled}</strong></span>
            </div>
            {!calibrated && (
              <p style={{ fontSize: 11, opacity: 0.75, margin: 0 }}>
                Open <strong>Camera &amp; board</strong> below and calibrate the corners to begin.
              </p>
            )}
          </div>

          <Section
            title="Camera & board"
            open={!!openSection.camera} onToggle={() => toggleSection('camera')}
          >
            <button type="button" onClick={() => setCalibrating(true)}>
              {calibrated ? 'Recalibrate corners' : 'Calibrate corners'}
            </button>
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
            <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>Stop the sequencer to change orientation.</p>
          </Section>

          <Section
            title="Colours & detection"
            hint="Give each piece colour a job, then calibrate the colours you switch on."
            open={!!openSection.colours} onToggle={() => toggleSection('colours')}
          >
            {channels.length === 0 && (
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                No colours yet. Add one, then click a piece on the camera to calibrate it.
              </span>
            )}
            {channels.map((c) => {
              const isCalib = colourCalib?.mode === 'recal' && colourCalib.id === c.id;
              const isMelodic = c.role === 'melody' || c.role === 'chord' || c.role === 'bass';
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
                    padding: '5px 6px', borderRadius: 6,
                    border: isCalib ? '1px solid #4caf50' : '1px solid #ffffff14',
                    background: '#ffffff08',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      title={`${describeChannel(c)} — click ⟳ then a piece to recalibrate`}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        background: c.swatch, border: '1px solid #0008',
                      }}
                    />
                    <select
                      style={{ flex: 1, minWidth: 0 }}
                      value={c.role}
                      onChange={(e) => setChannelRole(c.id, e.target.value as ColourRole)}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button" title="Recalibrate (then click a piece)"
                      aria-label={`Recalibrate ${describeChannel(c)}`}
                      onClick={() => recalibrateChannel(c.id)}
                      style={{ padding: '2px 6px' }}
                    >
                      {isCalib ? '◉' : '⟳'}
                    </button>
                    <button
                      type="button" title="Remove colour"
                      aria-label={`Remove ${describeChannel(c)}`}
                      onClick={() => removeChannel(c.id)}
                      style={{ padding: '2px 6px' }}
                    >
                      ×
                    </button>
                  </div>
                  {isMelodic && (
                    <select
                      style={{ width: '100%' }}
                      value={c.instrument ?? ''} disabled={running}
                      onChange={(e) => patchChannel(c.id, { instrument: e.target.value })}
                      title="Instrument for this colour"
                    >
                      <option value="">{c.role === 'bass' ? 'Default (electric bass)' : 'Default (electric piano)'}</option>
                      {INSTRUMENT_OPTIONS.map((i) => (
                        <option key={i.key} value={i.key}>{i.name}</option>
                      ))}
                    </select>
                  )}
                  {c.role === 'drums' && (
                    <select
                      style={{ width: '100%' }}
                      value={c.drum ?? ''} disabled={running}
                      onChange={(e) => patchChannel(c.id, { drum: e.target.value })}
                      title="Drum for this colour"
                    >
                      <option value="">Vary by row (kick→crash)</option>
                      {DRUM_OPTIONS.map((d) => (
                        <option key={d.key} value={d.key}>{d.name}</option>
                      ))}
                    </select>
                  )}
                  {c.kind === 'black' && (
                    <label style={{ fontSize: 11 }}>
                      Darkness ≤ {c.blackBand?.maxValue ?? 34}%
                      <input
                        type="range" min={10} max={70} value={Math.round(c.blackBand?.maxValue ?? 34)}
                        onChange={(e) => setChannelBlackDarkness(c.id, Number(e.target.value))}
                      />
                    </label>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button type="button" style={{ flex: 1 }} disabled={running} onClick={addColour}>
                {colourCalib?.mode === 'new' ? 'Click a piece on the camera…' : '+ Add colour'}
              </button>
              {channels.length > 0 && (
                <button
                  type="button" disabled={running} onClick={clearChannels}
                  style={{ fontSize: 11, opacity: 0.8 }}
                  title="Remove all colours"
                >
                  Clear all
                </button>
              )}
            </div>
            {anyFader && (
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
            <label>
              Min fill {Math.round(config.minFilledFraction * 100)}%
              <input
                type="range" min={5} max={50} value={Math.round(config.minFilledFraction * 100)}
                onChange={(e) => update({ minFilledFraction: Number(e.target.value) / 100 })}
              />
            </label>
          </Section>

          <Section
            title="Sound"
            hint="Pitch follows the piece's row (low at the bottom). Each colour's instrument/drum is set in Colours."
            open={!!openSection.sound} onToggle={() => toggleSection('sound')}
          >
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
          </Section>

          <Section
            title="Groove & tempo"
            open={!!openSection.groove} onToggle={() => toggleSection('groove')}
          >
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, opacity: 0.65 }}>
                Polyrhythm — loop length per role (Off = full {config.cols} steps; shorter values drift)
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
          </Section>

          <Section
            title="Pattern length"
            open={!!openSection.pattern} onToggle={() => toggleSection('pattern')}
          >
            <label>
              Rows
              <select
                value={config.rows} disabled={running}
                onChange={(e) => update({ rows: Number(e.target.value) })}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Steps
              <select
                value={config.cols} disabled={running}
                onChange={(e) => update({ cols: Number(e.target.value) })}
              >
                {[2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
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
                <span style={{ fontSize: 11, opacity: 0.65 }}>
                  Selected page (●) plays live; Capture freezes it and moves on. Loop = {config.numPages * config.cols} steps.
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
          </Section>

          <Section
            title="Backing song"
            open={!!openSection.song} onToggle={() => toggleSection('song')}
          >
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
          </Section>

          <Section
            title="Per-colour mixer"
            open={!!openSection.mixer} onToggle={() => toggleSection('mixer')}
          >
            {channels.filter((c) => c.role === 'melody' || c.role === 'chord' || c.role === 'bass').length === 0 ? (
              <span style={{ fontSize: 11, opacity: 0.6 }}>Add a melody/chord/bass colour to mix it.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 4, fontSize: 10, opacity: 0.7 }}>
                  <span style={{ width: 20 }} />
                  <span style={{ width: 48, textAlign: 'center' }}>Vol</span>
                  <span style={{ width: 48, textAlign: 'center' }}>Tone</span>
                  <span style={{ width: 48, textAlign: 'center' }}>Rev</span>
                  <span style={{ width: 48, textAlign: 'center' }}>Dly</span>
                </div>
                {channels.filter((c) => c.role === 'melody' || c.role === 'chord' || c.role === 'bass').map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: c.swatch, border: '1px solid #0008',
                    }}
                    />
                    {([
                      ['volume', c.volume ?? 1],
                      ['tone', c.tone ?? 1],
                      ['reverbSend', c.reverbSend ?? 0.18],
                      ['delaySend', c.delaySend ?? 0],
                    ] as const).map(([field, val]) => (
                      <input
                        key={field} type="range" min={0} max={100} style={{ width: 48 }}
                        value={Math.round(val * 100)}
                        onChange={(e) => setChannelMix(c.id, field, Number(e.target.value) / 100)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Section>
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
            {colourCalib && (
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  sampleColourClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                role="button"
                tabIndex={0}
                aria-label={`Click a piece to calibrate ${calibLabel}`}
              >
                <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
                  Click a piece to set {calibLabel}
                </div>
              </div>
            )}
            {error && <div style={{ position: 'absolute', top: 8, left: 8, color: '#ff8080' }}>{error}</div>}
          </div>
        </div>

        {/* Warped board (abstract view) */}
        <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <WarpedBoardView
            rows={config.rows} cols={config.cols} active={active} playheadCol={playheadCol}
            colourFor={(id) => channelById.get(id)?.swatch ?? '#e23'}
          />
        </div>
      </div>
    </div>
  );
}
