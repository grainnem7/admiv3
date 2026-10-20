/**
 * The Board Sequencer's runtime: camera lifecycle, 1 Hz camera check, detection once
 * per NEW camera frame (settle + loop bank + engine hand-off), and a rAF draw loop.
 * Views stay thin: they supply callbacks (via a ref, so effects never restart) and
 * read/drive the returned refs (start/stop still set engineRef/modeRef/runningRef).
 */
import { orientedSize } from '../../../tracking/frameOrientation';
import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CameraManager, type CameraTrackInfo } from '../../../tracking/CameraManager';
import { BoardReader } from '../../../tracking/BoardReader';
import type { ActiveCell, BoardSequencerMode, CellReading } from '../../../tracking/BoardSequencerMode';
import { ColourRecognizer } from '../../../tracking/PieceRecognizer';
import {
  buildChannelMatchers, channelPriority, isControlRole, isLoopRole, isSequencedRole,
  type ColourId, type ColourMatcher,
} from '../../../tracking/boardColours';
import { initialControlState, stepControls, type ControlsResult } from '../../../tracking/controlCounters';
import { dismissNudge, initialNudgeState, stepNudge, type NudgeKind, type NudgeSignal, type NudgeState } from './playNudge';
import {
  buildWatchGrid, initialWatchState, stepWatcher, type WatchGrid, type WatchState,
} from '../../../tracking/handGuard/intruderMask';
import {
  initialKnockState, letGo, releaseGhostsAt, stepKnock, type KnockState,
} from '../../../tracking/handGuard/knockGuard';
import {
  estimateBoardShift, shiftCorners, TRACK_INTERVAL_MS,
} from '../../../tracking/handGuard/boardTrack';
import { frameMeanSaturation } from '../../../tracking/cameraCheck';
import { readLighting, type LightingReading } from '../../../tracking/lightingCheck';
import { startVideoFrameLoop } from '../../../tracking/videoFrameLoop';
import { stepBoardFrame, suppressSpill, type BoardFrameOutput } from '../../../tracking/boardFrame';
import { splitByZone, zoneContains, zoneSlotCount } from '../../../tracking/zones';
import type { BoardSequencerEngine } from '../../../songs/BoardSequencerEngine';
import { emptyLoopBank, seedLoopBank, type LoopBankState } from '../../../songs/loopBank';
import type { Mat3 } from '../../../utils/homography';
import type { BoardSequencerStored } from '../../../profiles/BoardSequencerConfig';
import { homographyForCorners } from './homographyForCorners';
import { laptopReadings } from '../../../tracking/laptopBoard';

export interface RuntimeFrame {
  readings: CellReading[];
  frame: BoardFrameOutput;
  /** The control counters' committed values this frame (drives the legend). */
  controls: ControlsResult;
  /** The hint to show, if any: the board seems to have moved, or a colour matches it. */
  nudge: NudgeSignal | null;
  /** Cells the hand guard is holding, and the knocked cells still sounding. */
  held: ReadonlySet<string>;
  ghosts: ReadonlyMap<string, ActiveCell>;
  /** False until the watcher has seen a clear view of the board. */
  handGuardReady: boolean;
  /** performance.now() of the camera frame this came from. */
  atMs: number;
  /** Per loop slot with a loop colour: whether such a counter is on the board this frame. */
  loopColours: ReadonlyMap<number, boolean>;
}

export interface BoardRuntimeCallbacks {
  onCameraStarted(fellBack: boolean, trackInfo: CameraTrackInfo | null): void;
  onCameraError(message: string): void;
  onCameraCheck(
    saturation: number | null, trackInfo: CameraTrackInfo | null, lighting: LightingReading | null,
  ): void;
  onLoopSlotsCaptured(saved: (ActiveCell[] | null)[]): void;
  /** The board was nudged and the grid followed it; save the new corners (throttled). */
  onCornersTracked?(corners: BoardSequencerStored['corners']): void;
  /** Called on every processed camera frame, after the engine hand-off (pure bookkeeping only). */
  onFrame?(frame: RuntimeFrame, dtMs: number): void;
  draw(frame: RuntimeFrame): void;
  onThrottledState(frame: RuntimeFrame): void;
}

export const NOOP_RUNTIME_CALLBACKS: BoardRuntimeCallbacks = {
  onCameraStarted: () => {},
  onCameraError: () => {},
  onCameraCheck: () => {},
  onLoopSlotsCaptured: () => {},
  draw: () => {},
  onThrottledState: () => {},
};

export interface BoardRuntimeRefs {
  videoRef: RefObject<HTMLVideoElement>;
  cameraRef: MutableRefObject<CameraManager | null>;
  readerRef: MutableRefObject<BoardReader | null>;
  homographyRef: MutableRefObject<Mat3 | null>;
  modeRef: MutableRefObject<BoardSequencerMode | null>;
  engineRef: MutableRefObject<BoardSequencerEngine | null>;
  runningRef: MutableRefObject<boolean>;
  loopBankRef: MutableRefObject<LoopBankState>;
  activeCellsRef: MutableRefObject<ActiveCell[]>;
  lastFrameAtRef: MutableRefObject<number>;
  latestFrameRef: MutableRefObject<RuntimeFrame | null>;
  /** "Not now" on a hint: it stays hidden until its condition clears and comes back. */
  dismiss(kind: NudgeKind): void;
  /** Knock guard: drop the ghosts, or read them for "Save as loop". */
  letGoGhosts(): void;
  knockRef: MutableRefObject<KnockState>;
}

/** The watch grid is rebuilt whenever any of this changes. */
function watchKey(
  h: Mat3, cfg: BoardSequencerStored, frame: { width: number; height: number },
): string {
  return `${h.join(',')}|${cfg.rows}|${cfg.cols}|${cfg.boardSquares}|${frame.width}x${frame.height}`;
}

const CAMERA_CHECK_MS = 1000;
const STATE_THROTTLE_MS = 100;
/** The laptop board has no camera frames to wait for: it is read at about 30 a second. */
const LAPTOP_FRAME_MS = 33;
/** A click is a deliberate placement; it only needs a moment to settle, not a hand's. */
const LAPTOP_SETTLE_MS = 120;

/**
 * Every setting the running engine takes from the config. Called whenever the config
 * changes and when the engine starts — independent of camera frames. Each setter is
 * cheap and does nothing when the value is unchanged.
 */
export function applyEngineSettings(engine: BoardSequencerEngine, cfg: BoardSequencerStored): void {
  engine.setPingPong(cfg.pingPong);
  engine.setTickEnabled(cfg.tickEnabled);
  engine.setStudioMix(cfg.studioMix);
  engine.setSoundWorld(cfg.soundWorld);
  engine.setPhrases(cfg.phrases);
  engine.setFill(cfg.fillAmount, cfg.fillSeed, cfg.fillKept);
  engine.setFillEngine(cfg.fillEngine);
  engine.setBand(cfg.band);
  engine.setLaunchFade(Math.round(cfg.loopFadePasses * cfg.cols * Math.max(1, cfg.numPages)));
  engine.setMidiOut({ enabled: cfg.midiEnabled && cfg.midiDeviceId !== '', sends: cfg.midiSends });
  engine.setInternalSound(!cfg.midiEnabled || cfg.midiKeepSound);
  engine.setEvolve({
    amount: cfg.evolveAmount, sceneLoops: cfg.evolveSceneLoops, seed: cfg.evolveSeed, holdLap: cfg.evolveHoldLap,
  });
  engine.setVariationEnabled(cfg.variationEnabled);
}

export function useBoardRuntime(opts: {
  cameraDeviceId: string;
  cameraRetry: number;
  calibrated: boolean;
  /** Counters come from the laptop board (config.laptopBoard), not the camera. */
  laptop: boolean;
  configRef: MutableRefObject<BoardSequencerStored>;
  callbacksRef: MutableRefObject<BoardRuntimeCallbacks>;
}): BoardRuntimeRefs {
  const { cameraDeviceId, cameraRetry, calibrated, laptop, configRef, callbacksRef } = opts;
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const readerRef = useRef<BoardReader | null>(null);
  const homographyRef = useRef<Mat3 | null>(null);
  const modeRef = useRef<BoardSequencerMode | null>(null);
  const engineRef = useRef<BoardSequencerEngine | null>(null);
  const runningRef = useRef(false);
  const loopBankRef = useRef<LoopBankState>(emptyLoopBank(0));
  const activeCellsRef = useRef<ActiveCell[]>([]);
  const latestFrameRef = useRef<RuntimeFrame | null>(null);
  /** performance.now() of the last frame read without error: the screen's watchdog. */
  const lastFrameAtRef = useRef(0);
  const nudgeRef = useRef<NudgeState>(initialNudgeState());
  const watchRef = useRef<WatchState>(initialWatchState());
  const watchGridRef = useRef<{ grid: WatchGrid; key: string } | null>(null);
  const knockRef = useRef<KnockState>(initialKnockState());
  const letGoGhosts = useCallback(() => { knockRef.current = letGo(knockRef.current); }, []);
  const dismiss = useCallback((kind: NudgeKind) => {
    nudgeRef.current = dismissNudge(nudgeRef.current, kind);
  }, []);

  // Camera lifecycle — (re)opens whenever the chosen camera changes or Try again is pressed.
  useEffect(() => {
    // The laptop board needs no camera, and a laptop without one shouldn't be asked for it.
    if (laptop) return;
    const cam = new CameraManager();
    cameraRef.current = cam;
    readerRef.current = new BoardReader();
    homographyRef.current = null;
    let cancelled = false;
    let raf = 0;
    // The element can arrive a frame late (an overlay covering the screen on the first
    // commit, say). Waiting for it beats never starting the camera at all.
    const startWhenReady = (): void => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) {
        raf = requestAnimationFrame(startWhenReady);
        return;
      }
      cam.start(video, cameraDeviceId || undefined).then(({ fellBack }) => {
        if (!cancelled) callbacksRef.current.onCameraStarted(fellBack, cam.getTrackInfo());
      }).catch((err: unknown) => {
        if (!cancelled) callbacksRef.current.onCameraError(err instanceof Error ? err.message : 'Camera failed');
      });
    };
    startWhenReady();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cam.stop();
    };
  }, [cameraDeviceId, cameraRetry, callbacksRef, laptop]);

  // Camera check: how colourful the frames the app READS are, plus live track settings.
  useEffect(() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 48;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth <= 0) return;
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
      const sat = frameMeanSaturation(data);
      // Same frame, so glare and an uneven lamp are judged on exactly the pixels the
      // colour work will later have to learn the board from.
      const lighting = readLighting(data, cv.width, cv.height, 1);
      callbacksRef.current.onCameraCheck(sat, cameraRef.current?.getTrackInfo() ?? null, lighting);
    }, CAMERA_CHECK_MS);
    return () => window.clearInterval(id);
  }, [callbacksRef]);

  // Detection once per camera frame + drawing on rAF, while calibrated.
  useEffect(() => {
    if (!calibrated && !laptop) return;
    const video = videoRef.current;
    if (!laptop && !video) return;
    let matchersFor: { channels: BoardSequencerStored['channels']; minFill: number } | null = null;
    let matchers: ColourMatcher[] = [];
    let recognizer = new ColourRecognizer(0.1, []);
    let sequencedColours = new Set<ColourId>();
    let controlColours = new Set<ColourId>();
    let controls = initialControlState();
    let prevHeld: ReadonlySet<string> = new Set<string>();
    let lastTrackMs = 0;
    let settledBefore: ActiveCell[] = [];

    let hSize = { w: 0, h: 0 };
    // The last colour each cell showed while it was still visible, so a covered control
    // counter can be recognised through the hand that is covering it.
    const lastColourAt = new Map<string, ColourId>();
    const tick = ({ nowMs, dtMs }: { nowMs: number; dtMs: number }): void => {
      const cfg = configRef.current;
      if (!matchersFor || matchersFor.channels !== cfg.channels || matchersFor.minFill !== cfg.minFilledFraction) {
        matchers = buildChannelMatchers(cfg.channels);
        recognizer = new ColourRecognizer(cfg.minFilledFraction, channelPriority(cfg.channels));
        matchersFor = { channels: cfg.channels, minFill: cfg.minFilledFraction };
        sequencedColours = new Set(cfg.channels.filter((c) => isSequencedRole(c.role)).map((c) => c.id));
        // A loop colour's counter is a trigger, never a note and never a pad press.
        controlColours = new Set(cfg.channels.filter((c) => isControlRole(c.role) || isLoopRole(c.role)).map((c) => c.id));
      }
      let readings: CellReading[];
      let lastFrame: ReturnType<BoardReader['lastFrame']> = null;
      let shown = { width: 0, height: 0 };
      if (laptop) {
        readings = laptopReadings(cfg.laptopBoard, cfg.rows, cfg.cols);
      } else {
        const reader = readerRef.current;
        if (!reader || !video || video.videoWidth <= 0) return;
        // The homography maps the board into full-resolution pixels, so it is only valid for
        // the size the stream was when it was built. Some cameras renegotiate mid-session;
        // keeping the old matrix would read every cell from the wrong part of the picture.
        // Sizes are in DISPLAYED orientation: a quarter turn swaps width and height.
        shown = orientedSize(video.videoWidth, video.videoHeight, cfg.cameraRotation);
        if (homographyRef.current
          && (hSize.w !== shown.width || hSize.h !== shown.height)) {
          homographyRef.current = null;
          watchGridRef.current = null;
        }
        if (!homographyRef.current) {
          try {
            homographyRef.current = homographyForCorners(cfg.corners, shown.width, shown.height);
            hSize = { w: shown.width, h: shown.height };
          } catch {
            return; // degenerate corners — wait for recalibration
          }
        }
        // One counter, one box: a counter on a grid line is seen by both cells, so the
        // spill is cleared before anything settles or plays.
        readings = suppressSpill(reader.read(video, {
          homography: homographyRef.current, rows: cfg.rows, cols: cfg.cols, colours: matchers, recognizer,
          mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY, rotation: cfg.cameraRotation,
          samplesPerAxis: cfg.samplesPerAxis,
          boardSquares: cfg.boardSquares, dtMs,
        }), cfg);
        lastFrame = reader.lastFrame();
      }
      // The hand guard: find what is reaching over the board before anything is read.
      let held = new Set<string>();
      let resting = false;
      let globalChange = false;
      let handGuardReady = false;
      if (cfg.handGuardEnabled && lastFrame && homographyRef.current) {
        const gridKey = watchKey(homographyRef.current, cfg, lastFrame);
        if (watchGridRef.current?.key !== gridKey) {
          watchGridRef.current = {
            key: gridKey,
            grid: buildWatchGrid(
              homographyRef.current, lastFrame, cfg.rows, cfg.cols, cfg.boardSquares,
            ),
          };
          watchRef.current = initialWatchState();
        }
        const watch = stepWatcher(watchRef.current, watchGridRef.current.grid, lastFrame.data, nowMs, {
          sensitivity: cfg.intruderSensitivity,
          marginSquares: cfg.handMarginSquares,
          releaseMs: cfg.handReleaseMs,
          restNudgeMs: cfg.restNudgeMs,
          dtMs,
        });
        watchRef.current = watch.state;
        handGuardReady = watch.ready;
        resting = watch.resting;
        globalChange = watch.global;
        for (const cell of watch.heldCells) {
          held.add(`${Math.floor(cell / cfg.cols)},${cell % cfg.cols}`);
        }
      } else if (!cfg.handGuardEnabled) {
        watchRef.current = initialWatchState();
        watchGridRef.current = null;
      }

      // Follow a nudge: a small rigid move of a board we have already learnt. Never while
      // a hand is over it, never during a whole-picture change, and never more than the
      // limit — a real move is the hint's job, not a guess.
      if (!laptop && cfg.boardTrackingEnabled && cfg.handGuardEnabled && handGuardReady && !globalChange
        && held.size === 0 && watchRef.current.bg && watchGridRef.current && lastFrame && homographyRef.current
        && nowMs - lastTrackMs >= TRACK_INTERVAL_MS) {
        lastTrackMs = nowMs;
        const track = estimateBoardShift(
          watchGridRef.current.grid, watchRef.current.bg, lastFrame.data,
          homographyRef.current, lastFrame,
          { maxShiftSquares: cfg.boardTrackMaxSquares, minImprovement: 0.15 },
        );
        if (track.improved) {
          const moved = shiftCorners(cfg.corners, track.dx, track.dy, track.scale);
          const nextH = homographyForCorners(moved, shown.width, shown.height);
          homographyRef.current = nextH;
          hSize = { w: shown.width, h: shown.height };
          // Re-project the watch grid, but KEEP the background: the same board is still
          // there, just in a slightly different place, and re-learning would blind the
          // hand guard for several frames every time the board is touched.
          watchGridRef.current = {
            key: watchKey(nextH, cfg, lastFrame),
            grid: buildWatchGrid(nextH, lastFrame, cfg.rows, cfg.cols, cfg.boardSquares),
          };
          callbacksRef.current.onCornersTracked?.(moved as BoardSequencerStored['corners']);
        }
      }

      // A held cell isn't read at all: the settle state it had is simply left alone, so a
      // counter under a hand keeps playing and a sleeve can't add a note.
      // The commonest gesture is lifting the hand straight off, which frees every held
      // cell at once — so released has to be computed even when nothing is held now.
      const released: { row: number; col: number }[] = [];
      const heldColours = new Set<ColourId>();
      const visible = held.size === 0 && prevHeld.size === 0 ? readings : readings.filter((r) => {
        const key = `${r.row},${r.col}`;
        if (held.has(key)) {
          // A control counter under a hand is still on the board; its value must hold
          // rather than take the "counter removed" path. The hand is exactly what stops
          // the colour being readable, so this has to use the colour the cell had BEFORE
          // it was covered, not whatever the reader can make out through a hand.
          const remembered = r.colour ?? lastColourAt.get(key) ?? null;
          if (remembered && controlColours.has(remembered) && zoneContains(cfg.controlZone, r)) {
            heldColours.add(remembered);
          }
          return false;
        }
        if (r.colour) lastColourAt.set(key, r.colour);
        else lastColourAt.delete(key);
        if (prevHeld.has(key)) released.push({ row: r.row, col: r.col });
        return true;
      });
      if (released.length > 0) modeRef.current?.restartSettle(released);
      prevHeld = held;

      modeRef.current?.setVariation(cfg.variationEnabled, cfg.variationOffsetThreshold);
      modeRef.current?.setTwoCounters(cfg.twoCounterMode === 'both');
      modeRef.current?.setBoxDetail({
        enabled: cfg.boxDetailEnabled,
        loudness: cfg.boxLoudnessAmount,
        timing: cfg.boxTimingAmount,
        baseVelocity: cfg.velocity,
      });
      // With hands excluded, a counter no longer needs the long window to prove itself.
      modeRef.current?.setSettleWindow(laptop ? LAPTOP_SETTLE_MS
        : cfg.handGuardEnabled && handGuardReady && !globalChange ? cfg.settleAfterHandMs : cfg.settleWindowMs);
      // The engine's settings are applied by the screen whenever they change
      // (applyEngineSettings), not from here: a camera that stalls must not stop a scene
      // change or an iPad strip reaching the sound.
      const running = runningRef.current && !!modeRef.current && !!engineRef.current;
      const modeResult = running && modeRef.current ? modeRef.current.step(visible, dtMs, nowMs) : null;
      // The pads are a lane the player can move at any time, so the bank is kept the
      // right size and seeded from what is saved — otherwise a Clear or a capture could
      // write an empty bank over loops the config still holds.
      const padCount = zoneSlotCount(cfg.loopZone, cfg.rows, cfg.cols);
      if (loopBankRef.current.saved.length !== padCount) {
        loopBankRef.current = seedLoopBank(padCount, cfg.loopSlots, loopBankRef.current);
      }

      // Knock guard: only the cells that actually play a note count. Lifting a counter
      // off a control or loop lane is not a knock, and which cells those are comes from
      // the lanes — the same rule the pattern itself uses.
      let knocked = false;
      // A click that empties the laptop board is a choice, not a knock.
      if (running && modeResult && cfg.knockGuardEnabled && !laptop) {
        const notes = (cells: ActiveCell[]): ActiveCell[] =>
          splitByZone(cells, cfg.controlZone, cfg.loopZone).pattern
            .filter((c) => sequencedColours.has(c.colour));
        const now = notes(modeResult.activeCells);
        const step = stepKnock(knockRef.current, notes(settledBefore), now, held, nowMs, {
          minCount: cfg.knockMinCount,
          minFraction: cfg.knockMinFraction,
          windowMs: cfg.knockWindowMs,
        });
        knockRef.current = releaseGhostsAt(step.state, now, cfg.twoCounterMode === 'both');
        settledBefore = modeResult.activeCells;
      } else {
        // Switching the guard off really does drop the ghosts. Merely pressing Stop does
        // not: the promise of the guard is that a knocked-over pattern waits until the
        // player decides, and Stop is not that decision. They stay silent until Play, and
        // "Save as loop" / "Let go" stay on offer the whole time.
        if (!cfg.knockGuardEnabled && knockRef.current.ghosts.size > 0) {
          knockRef.current = letGo(knockRef.current);
        }
        settledBefore = modeResult ? modeResult.activeCells : [];
      }
      knocked = knockRef.current.ghosts.size > 0;

      const frame = stepBoardFrame({
        readings: visible,
        cfg: { ...cfg, sequencedColours, controlColours },   // zones ride along on cfg
        running,
        modeResult,
        loopBank: loopBankRef.current,
        dtMs,
        held,
        ghosts: knockRef.current.ghosts,
      });
      // Controls read the RAW frame, not the settle: a slide should follow the hand.
      const ctl = stepControls(controls, visible, cfg.channels, {
        faderAxis: cfg.faderAxis,
        boardSquares: cfg.boardSquares,
        controlStillMs: cfg.controlStillMs,
        controlReturnMs: cfg.controlReturnMs,
        controlRanges: cfg.controlRanges,
        controlRemoval: cfg.controlRemoval,
        defaults: { volume: cfg.volume, fill: cfg.fillAmount, evolve: cfg.evolveAmount },
        zone: cfg.controlZone,
        heldColours,
      }, dtMs);
      controls = ctl.state;
      const engine = engineRef.current;
      engine?.setControlValues(ctl.values, ctl.toggles);
      if (running && engine) {
        loopBankRef.current = frame.loopBank;
        if (frame.captured.length > 0) callbacksRef.current.onLoopSlotsCaptured(frame.loopBank.saved);
        engine.setActiveCells(frame.patternCells);
        engine.setActiveLoops(frame.activeLoops);
        activeCellsRef.current = frame.patternCells;
        if (frame.fireTick) engine.fireTick();
      }
      // Nudges: hints only, computed from the same readings, never acting on their own.
      const nudge = stepNudge(nudgeRef.current, readings, {
        boardSquares: cfg.boardSquares,
        rows: cfg.rows,
        cols: cfg.cols,
        variationEnabled: cfg.variationEnabled,
        variationOffsetThreshold: cfg.variationOffsetThreshold,
        enabled: cfg.boardNudgesEnabled && !laptop,
        ignoreColours: controlColours,
        resting,
        global: globalChange,
        knocked,
      }, nowMs);
      nudgeRef.current = nudge.state;

      // Counters as loops: per slot, is a counter of that colour anywhere on the board?
      const loopColours = new Map<number, boolean>();
      for (const c of cfg.channels) {
        if (!isLoopRole(c.role) || c.loopSlot === undefined) continue;
        const here = visible.some((r) => r.occupied && (r.colour === c.id || r.colours?.includes(c.id) === true));
        loopColours.set(c.loopSlot, (loopColours.get(c.loopSlot) ?? false) || here);
      }
      const rf: RuntimeFrame = {
        readings: visible, frame, controls: ctl, nudge: nudge.signal,
        held, ghosts: knockRef.current.ghosts, handGuardReady, atMs: nowMs, loopColours,
      };
      latestFrameRef.current = rf;
      lastFrameAtRef.current = performance.now();
      callbacksRef.current.onFrame?.(rf, dtMs);
    };
    let stopFrames: () => void;
    if (laptop) {
      let last = performance.now();
      const id = window.setInterval(() => {
        const nowMs = performance.now();
        try { tick({ nowMs, dtMs: nowMs - last }); } catch (err) { console.error('[laptop board] frame failed:', err); }
        last = nowMs;
      }, LAPTOP_FRAME_MS);
      stopFrames = () => window.clearInterval(id);
    } else {
      stopFrames = startVideoFrameLoop(video!, tick);
    }

    let raf = 0;
    let lastStateMs = 0;
    const draw = (now: number): void => {
      // The next frame is asked for first: an error drawing this one must not freeze the
      // picture for the rest of the piece.
      raf = requestAnimationFrame(draw);
      const f = latestFrameRef.current;
      if (!f) return;
      try {
        callbacksRef.current.draw(f);
        if (now - lastStateMs > STATE_THROTTLE_MS) {
          lastStateMs = now;
          callbacksRef.current.onThrottledState(f);
        }
      } catch (err) {
        console.error('[board] draw failed:', err);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      stopFrames();
      cancelAnimationFrame(raf);
    };
  }, [calibrated, laptop, cameraDeviceId, cameraRetry, configRef, callbacksRef]);

  return {
    videoRef, cameraRef, readerRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef,
    activeCellsRef, latestFrameRef, lastFrameAtRef, dismiss, letGoGhosts, knockRef,
  };
}
