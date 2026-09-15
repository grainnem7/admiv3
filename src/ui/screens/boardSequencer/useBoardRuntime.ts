/**
 * The Board Sequencer's runtime: camera lifecycle, 1 Hz camera check, detection once
 * per NEW camera frame (settle + loop bank + engine hand-off), and a rAF draw loop.
 * Views stay thin: they supply callbacks (via a ref, so effects never restart) and
 * read/drive the returned refs (start/stop still set engineRef/modeRef/runningRef).
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CameraManager, type CameraTrackInfo } from '../../../tracking/CameraManager';
import { BoardReader } from '../../../tracking/BoardReader';
import type { ActiveCell, BoardSequencerMode, CellReading } from '../../../tracking/BoardSequencerMode';
import { ColourRecognizer } from '../../../tracking/PieceRecognizer';
import { buildChannelMatchers, channelPriority, type ColourMatcher } from '../../../tracking/boardColours';
import { frameMeanSaturation } from '../../../tracking/cameraCheck';
import { startVideoFrameLoop } from '../../../tracking/videoFrameLoop';
import { stepBoardFrame, suppressSpill, type BoardFrameOutput } from '../../../tracking/boardFrame';
import type { BoardSequencerEngine } from '../../../songs/BoardSequencerEngine';
import { emptyLoopBank, type LoopBankState } from '../../../songs/loopBank';
import type { Mat3 } from '../../../utils/homography';
import type { BoardSequencerStored } from '../../../profiles/BoardSequencerConfig';
import { homographyForCorners } from './homographyForCorners';

export interface RuntimeFrame {
  readings: CellReading[];
  frame: BoardFrameOutput;
  /** performance.now() of the camera frame this came from. */
  atMs: number;
}

export interface BoardRuntimeCallbacks {
  onCameraStarted(fellBack: boolean, trackInfo: CameraTrackInfo | null): void;
  onCameraError(message: string): void;
  onCameraCheck(saturation: number | null, trackInfo: CameraTrackInfo | null): void;
  onLoopSlotsCaptured(saved: (ActiveCell[] | null)[]): void;
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
  latestFrameRef: MutableRefObject<RuntimeFrame | null>;
}

const CAMERA_CHECK_MS = 1000;
const STATE_THROTTLE_MS = 100;

export function useBoardRuntime(opts: {
  cameraDeviceId: string;
  cameraRetry: number;
  calibrated: boolean;
  configRef: MutableRefObject<BoardSequencerStored>;
  callbacksRef: MutableRefObject<BoardRuntimeCallbacks>;
}): BoardRuntimeRefs {
  const { cameraDeviceId, cameraRetry, calibrated, configRef, callbacksRef } = opts;
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

  // Camera lifecycle — (re)opens whenever the chosen camera changes or Try again is pressed.
  useEffect(() => {
    const cam = new CameraManager();
    cameraRef.current = cam;
    readerRef.current = new BoardReader();
    homographyRef.current = null;
    let cancelled = false;
    const video = videoRef.current;
    if (video) {
      cam.start(video, cameraDeviceId || undefined).then(({ fellBack }) => {
        if (!cancelled) callbacksRef.current.onCameraStarted(fellBack, cam.getTrackInfo());
      }).catch((err: unknown) => {
        if (!cancelled) callbacksRef.current.onCameraError(err instanceof Error ? err.message : 'Camera failed');
      });
    }
    return () => {
      cancelled = true;
      cam.stop();
    };
  }, [cameraDeviceId, cameraRetry, callbacksRef]);

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
      const sat = frameMeanSaturation(ctx.getImageData(0, 0, cv.width, cv.height).data);
      callbacksRef.current.onCameraCheck(sat, cameraRef.current?.getTrackInfo() ?? null);
    }, CAMERA_CHECK_MS);
    return () => window.clearInterval(id);
  }, [callbacksRef]);

  // Detection once per camera frame + drawing on rAF, while calibrated.
  useEffect(() => {
    if (!calibrated) return;
    const video = videoRef.current;
    if (!video) return;
    let matchersFor: { channels: BoardSequencerStored['channels']; minFill: number } | null = null;
    let matchers: ColourMatcher[] = [];
    let recognizer = new ColourRecognizer(0.1, []);

    const stopFrames = startVideoFrameLoop(video, ({ nowMs, dtMs }) => {
      const reader = readerRef.current;
      const cfg = configRef.current;
      if (!reader || video.videoWidth <= 0) return;
      if (!homographyRef.current) {
        try {
          homographyRef.current = homographyForCorners(cfg.corners, video.videoWidth, video.videoHeight);
        } catch {
          return; // degenerate corners — wait for recalibration
        }
      }
      if (!matchersFor || matchersFor.channels !== cfg.channels || matchersFor.minFill !== cfg.minFilledFraction) {
        matchers = buildChannelMatchers(cfg.channels);
        recognizer = new ColourRecognizer(cfg.minFilledFraction, channelPriority(cfg.channels));
        matchersFor = { channels: cfg.channels, minFill: cfg.minFilledFraction };
      }
      // One counter, one box: a counter on a grid line is seen by both cells, so the
      // spill is cleared before anything settles or plays.
      const readings = suppressSpill(reader.read(video, {
        homography: homographyRef.current, rows: cfg.rows, cols: cfg.cols, colours: matchers, recognizer,
        mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY, samplesPerAxis: cfg.samplesPerAxis, dtMs,
      }), cfg);
      modeRef.current?.setVariation(cfg.variationEnabled, cfg.variationOffsetThreshold);
      engineRef.current?.setPingPong(cfg.pingPong);
      const running = runningRef.current && !!modeRef.current && !!engineRef.current;
      const modeResult = running && modeRef.current ? modeRef.current.step(readings, dtMs, nowMs) : null;
      const frame = stepBoardFrame({ readings, cfg, running, modeResult, loopBank: loopBankRef.current });
      const engine = engineRef.current;
      if (running && engine) {
        loopBankRef.current = frame.loopBank;
        if (frame.captured.length > 0) callbacksRef.current.onLoopSlotsCaptured(frame.loopBank.saved);
        engine.setActiveCells(frame.patternCells);
        engine.setActiveLoops(frame.activeLoops);
        activeCellsRef.current = frame.patternCells;
        if (frame.fireTick) engine.fireTick();
      }
      const rf: RuntimeFrame = { readings, frame, atMs: nowMs };
      latestFrameRef.current = rf;
      callbacksRef.current.onFrame?.(rf, dtMs);
    });

    let raf = 0;
    let lastStateMs = 0;
    const draw = (now: number): void => {
      const f = latestFrameRef.current;
      if (f) {
        callbacksRef.current.draw(f);
        if (now - lastStateMs > STATE_THROTTLE_MS) {
          lastStateMs = now;
          callbacksRef.current.onThrottledState(f);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      stopFrames();
      cancelAnimationFrame(raf);
    };
  }, [calibrated, cameraDeviceId, cameraRetry, configRef, callbacksRef]);

  return {
    videoRef, cameraRef, readerRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef, activeCellsRef, latestFrameRef,
  };
}
