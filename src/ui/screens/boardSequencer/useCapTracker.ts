/**
 * Runs the red cap: its own camera (the one facing the player), the cap found about 25
 * times a second, checked against the face (when face assist is on) about 8 times a
 * second, and turned into control values the board runtime merges with its own. A mouse
 * test mode does the same with the pointer, so it can be tried without a camera or a cap.
 *
 * The cap is found by its clicked colour or, once the hat has been learnt against the room
 * (Learn the hat: two short steps, run here), by the learnt hat.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  capColourAt, capMask, capPatches, capPauseReason, faceBoxFromLandmarks, findLearntHat, handOverAxis, fitSideArc, fuseWithFace,
  initialCapState, lookAlikes, MIN_REACH, pickCap, stepCap, widenReach,
  type BoardActivity, type CapColour, type CapOffset, type CapPatch, type CapSettings, type CapSighting, type FaceBox, type Frame,
  type SideArc,
} from '../../../tracking/cap/capTracker';
import { HAT_SURE_DEFAULT, loadLearntHat, storeLearntHat, type HatModel, type StoredLearntHat } from '../../../tracking/cap/hatColour';
import {
  hatLearner, roomLearner, type HatBox, type HatLearner, type HatOutcome, type LearntRoom, type RoomLearner,
} from '../../../tracking/cap/learnHat';
import { FaceDetector } from '../../../tracking/FaceDetector';
import type { AxisRange } from '../../../remix/batonCalibration';
import type { ControlRange, FaderRole } from '../../../profiles/BoardSequencerConfig';

/** The picture the cap is looked for in: small is fast, and a cap is big. */
const FRAME_W = 160;
const FRAME_H = 120;
const TICK_MS = 40;
/** Face tracking costs more: every few frames is plenty for checking and bridging. */
const FACE_EVERY = 3;
/** A face older than this is no longer where the player is. */
const FACE_STALE_MS = 400;
const UI_EVERY_MS = 125;
/** Learn the hat: a moment to get ready after the press, then this long watching. */
const HAT_READY_MS = 2000;
const HAT_WATCH_MS = 3000;
/**
 * While watching, a picture is taken once at least this long has passed since the last one:
 * about 12 a second, or every frame when the page is busy and frames come slower (counting
 * frames instead left a busy page too few pictures to learn from).
 */
const HAT_PICTURE_MS = 75;
/**
 * Fewer pictures than this when the watching is up (a busy page: frames came slowly): it
 * watches once more for as long, rather than learn from too little. A page that isn't busy
 * takes about 37 in the 3 seconds.
 */
const HAT_MIN_PICTURES = 12;

/** 'only-board': the only camera there is is the board's, and the cap won't take it. */
export type CapCameraStatus = 'off' | 'starting' | 'running' | 'no-camera' | 'only-board' | 'mouse';
/** Why the cap is holding still: hands on the board, a counter moved, or learning the range. */
export type CapPause = 'hands' | 'board' | 'learning';
export type FaceStatus = 'off' | 'loading' | 'on' | 'unavailable';

/** Learn the hat's two steps: the room with the hat off, then the hat on. */
export type HatStep = 'room' | 'hat';

/** A step of Learn the hat under way. */
export interface HatLearningView {
  step: HatStep;
  /** 'ready': a moment to get ready before it starts watching. */
  phase: 'ready' | 'watching';
  /** Seconds left in this phase. */
  seconds: number;
  /** How far through the watching it will be at the end of this second, 0..1. */
  progress: number;
}

/** What the last step of Learn the hat came to. */
export type HatResult =
  | { step: 'room'; ok: boolean }
  | { step: 'hat'; outcome: HatOutcome; found: number; of: number; lookAlike: HatBox | null };

export interface CapView {
  camera: CapCameraStatus;
  face: FaceStatus;
  /** The cap is in sight (or, with face assist, the player's head is). */
  seen: boolean;
  source: 'cap' | 'face' | 'none';
  /** Where each direction is, 0..1, for the bars. */
  axes: { x: number | null; y: number | null };
  values: Partial<Record<FaderRole, number>>;
  /** Learning the reach: seconds left, or null. */
  learning: number | null;
  /** Holding still, and why; null when the cap is moving things. */
  paused: CapPause | null;
  /** Learn the hat: the step under way, or null. */
  hatLearning: HatLearningView | null;
  /** What the last step came to (this session), or null. */
  hatResult: HatResult | null;
  /** Step 1 has been done this session, so step 2 can be. */
  roomLearnt: boolean;
}

/** What the preview draws: the picture, where the cap is, the face. */
export interface CapPreview {
  frame: Frame | null;
  sighting: CapSighting | null;
  face: FaceBox | null;
  /** The pixels of `frame` taken for the hat (1 = hat), for "Show what it sees as the hat". */
  mask: Uint8Array | null;
  /** Anything else in `frame` taken for the hat, besides what is followed: outlined. */
  others: CapPatch[];
}

export function useCapTracker(opts: {
  settings: CapSettings;
  ranges: Record<FaderRole, ControlRange>;
  /**
   * What each control is set to now. The cap starts from these and changes them only once
   * the head moves: it used to jump them to wherever it first saw the head — the volume to
   * its lowest the moment Play started, which sounded like the music stopping.
   */
  startValues?: Partial<Record<FaderRole, number>>;
  /** Test with the mouse instead of the camera. */
  mouse: boolean;
  /** Where the pointer is over the preview (0..1), or null when it is off it. */
  pointerRef: MutableRefObject<{ x: number; y: number } | null>;
  /** The control values for the board runtime to merge. */
  valuesRef: MutableRefObject<Partial<Record<FaderRole, number>>>;
  onReachLearnt(reachX: AxisRange | null, reachY: AxisRange | null): void;
  onSideLearnt(arc: SideArc | null): void;
  /** A step of Learn the hat is done; `learnt` is the hat to keep (null: nothing changes). */
  onHatLearnt(result: HatResult, learnt: StoredLearntHat | null): void;
  /** The camera the board is actually using ('' = not known yet), so the cap never takes it. */
  boardCameraId: string;
  /** What the board is doing: the cap holds still while counters are being moved. */
  activityRef: MutableRefObject<BoardActivity>;
}): {
  view: CapView;
  previewRef: MutableRefObject<CapPreview>;
  learnReach(seconds: number): void;
  learnSide(seconds: number): void;
  /** Start a step of Learn the hat (ignored while one is under way). */
  learnHatStep(step: HatStep): void;
  /** Forget what the last step came to (the hat was forgotten). */
  clearHatResult(): void;
  colourAt(x: number, y: number): CapColour | null;
  cameras: MediaDeviceInfo[];
  /** Another control (the iPad) set this role: the cap takes its value until the head moves. */
  handOver(role: FaderRole, value: number): void;
} {
  const { settings, ranges, mouse, pointerRef, valuesRef, activityRef } = opts;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;
  const startValuesRef = useRef(opts.startValues);
  startValuesRef.current = opts.startValues;
  const onReachRef = useRef(opts.onReachLearnt);
  onReachRef.current = opts.onReachLearnt;
  const boardCameraIdRef = useRef(opts.boardCameraId);
  boardCameraIdRef.current = opts.boardCameraId;
  const onSideRef = useRef(opts.onSideLearnt);
  onSideRef.current = opts.onSideLearnt;
  const onHatRef = useRef(opts.onHatLearnt);
  onHatRef.current = opts.onHatLearnt;
  const sideRef = useRef<{ until: number; points: { x: number; y: number }[] } | null>(null);
  const previewRef = useRef<CapPreview>({ frame: null, sighting: null, face: null, mask: null, others: [] });
  // Learn the hat: the step under way, the room from step 1, and what the last step came to.
  const hatRef = useRef<{
    step: HatStep; readyUntil: number; watchUntil: number; lastPicture: number; pictures: number; longer: boolean;
    room: RoomLearner | null; hat: HatLearner | null;
  } | null>(null);
  const roomRef = useRef<LearntRoom | null>(null);
  const hatResultRef = useRef<HatResult | null>(null);
  // The learnt hat, unpacked once (not every frame) from what is stored.
  const modelRef = useRef<{ stored: StoredLearntHat | null; model: HatModel | null }>({ stored: null, model: null });
  const learnRef = useRef<{ until: number; x: AxisRange | null; y: AxisRange | null } | null>(null);
  const handOverRef = useRef(new Map<FaderRole, number>());
  const [view, setView] = useState<CapView>({
    camera: 'off', face: 'off', seen: false, source: 'none', axes: { x: null, y: null }, values: {}, learning: null,
    paused: null, hatLearning: null, hatResult: null, roomLearnt: false,
  });
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  // The cameras there are to choose from.
  useEffect(() => {
    if (!settings.enabled || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    let alive = true;
    const list = (): void => {
      void navigator.mediaDevices.enumerateDevices().then((d) => {
        if (alive) setCameras(d.filter((x) => x.kind === 'videoinput'));
      });
    };
    list();
    navigator.mediaDevices.addEventListener?.('devicechange', list);
    return () => { alive = false; navigator.mediaDevices.removeEventListener?.('devicechange', list); };
  }, [settings.enabled]);

  useEffect(() => {
    if (!settings.enabled) {
      valuesRef.current = {};
      setView((v) => ({ ...v, camera: 'off', face: 'off', seen: false, source: 'none', hatLearning: null }));
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let face: FaceDetector | null = null;
    let faceStatus: FaceStatus = 'off';
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let camera: CapCameraStatus = mouse ? 'mouse' : 'starting';
    let state = initialCapState();
    {
      const s0 = settingsRef.current;
      for (const [axis, role] of [['x', s0.xRole], ['y', s0.yRole]] as const) {
        if (role === 'off') continue;
        const v = startValuesRef.current?.[role];
        const r = rangesRef.current[role];
        if (v === undefined || !(r.max > r.min)) continue;
        state = handOverAxis(state, axis, (v - r.min) / (r.max - r.min));
      }
    }
    let offset: CapOffset | null = null;
    let lastFace: { box: FaceBox; at: number } | null = null;
    let frameNo = 0;
    let lastTick = performance.now();
    let lastUi = 0;

    if (!mouse) {
      void (async () => {
        // No camera chosen: the first one that ISN'T the board's (the board camera looks
        // down at the board and can't see the player's head). Never "the default camera"
        // when the board is using one: the default usually IS the board's, and the cap would
        // then look for red among the counters.
        let id = settings.cameraId;
        if (!id) {
          const all = (await navigator.mediaDevices?.enumerateDevices?.() ?? []).filter((d) => d.kind === 'videoinput');
          id = all.find((d) => d.deviceId && d.deviceId !== boardCameraIdRef.current)?.deviceId ?? '';
          if (!id && boardCameraIdRef.current) return 'only-board' as const;
        }
        // 1280×720, as for the board: at 640×480 some phone cameras (Camo) have their
        // colours read the wrong way — red came out tan — and the cap would never be found.
        return navigator.mediaDevices?.getUserMedia({
          video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      })().then((s) => {
        if (s === 'only-board') { camera = 'only-board'; return; }
        if (!s) { camera = 'no-camera'; return; }
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        void video.play();
        camera = 'running';
      }).catch(() => { camera = 'no-camera'; });
    }

    const startFace = (): void => {
      if (face || faceStatus === 'unavailable') return;
      faceStatus = 'loading';
      const f = new FaceDetector({ numFaces: 1, outputBlendshapes: false });
      face = f;
      // The model loads from the internet the first time; without it the cap works alone.
      f.initialize().then(() => { if (!stopped) faceStatus = 'on'; }).catch(() => { faceStatus = 'unavailable'; face = null; });
    };

    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(250, now - lastTick);
      lastTick = now;
      const s = settingsRef.current;
      let cap: CapSighting | null = null;
      let frame: Frame | null = null;
      let mask: Uint8Array | null = null;
      let patches: CapPatch[] = [];
      // The learnt hat, unpacked again only when what is stored changes (not the sureness).
      const cache = modelRef.current;
      if (s.learntHat !== cache.stored) {
        const was = cache.stored;
        const same = was !== null && s.learntHat !== null
          && was.hat === s.learntHat.hat && was.room === s.learntHat.room && was.picture === s.learntHat.picture;
        if (!same) cache.model = s.learntHat ? loadLearntHat(s.learntHat) : null;
        cache.stored = s.learntHat;
      }
      if (mouse) {
        const p = pointerRef.current;
        cap = p ? { x: p.x, y: p.y, area: 0.02 } : null;
      } else if (camera === 'running' && ctx && video.readyState >= 2) {
        ctx.save();
        if (s.mirror) { ctx.translate(FRAME_W, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        ctx.restore();
        const img = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
        frame = { data: img.data, width: FRAME_W, height: FRAME_H };
        if (cache.model && s.learntHat) {
          ({ sighting: cap, mask, patches } = findLearntHat(frame, cache.model, s.learntHat.sure, state.last));
        } else {
          // The clicked colour, as findCap does it, keeping the mask and patches for the preview.
          mask = capMask(frame, s.colour);
          ({ patches } = capPatches(mask, FRAME_W, FRAME_H));
          cap = pickCap(patches, state.last);
        }
        if (s.faceAssist) {
          startFace();
          if (face && faceStatus === 'on' && frameNo % FACE_EVERY === 0) {
            try {
              const r = face.detectForVideo(video, now);
              // FaceDetector hands back its points ALREADY mirrored (for a selfie view), so they
              // only need flipping when this picture is NOT a mirror. Flipping them again for a
              // mirrored picture put the face on the wrong side: the real cap was rejected as
              // "not on the head" and the cap followed a spot across the room.
              const box = r.face ? faceBoxFromLandmarks(r.face.landmarks, !s.mirror) : null;
              if (box) lastFace = { box, at: now };
            } catch { /* a missed frame */ }
          }
        }
      }
      frameNo++;
      const faceBox = s.faceAssist && lastFace && now - lastFace.at < FACE_STALE_MS ? lastFace.box : null;
      const fused = fuseWithFace(cap, faceBox, offset);
      offset = fused.offset;
      // Hold still while counters are being moved, and while learning (the player is
      // stretching to the ends on purpose: that must not swing the music about).
      const learning = learnRef.current !== null || sideRef.current !== null || hatRef.current !== null;
      const paused: CapPause | null = learning ? 'learning' : capPauseReason(activityRef.current, now, s);
      for (const [role, v] of handOverRef.current) {
        const r = rangesRef.current[role];
        const p = r.max > r.min ? (v - r.min) / (r.max - r.min) : 0;
        if (s.xRole === role) state = handOverAxis(state, 'x', p);
        if (s.yRole === role) state = handOverAxis(state, 'y', p);
      }
      handOverRef.current.clear();
      const reading = stepCap(state, fused.sighting, s, rangesRef.current, dt, paused !== null);
      state = reading.state;
      valuesRef.current = reading.values;
      // What it follows is the cap's patch, unless the face check turned it down.
      const others = lookAlikes(patches, fused.source === 'cap' ? cap : null);
      previewRef.current = { frame, sighting: fused.sighting, face: faceBox, mask, others };

      // Learn the hat: a moment to get ready, then a picture taken about every 75 ms and
      // learnt from as it comes, so the end of the step has only a short check left.
      const hl = hatRef.current;
      if (hl) {
        if (now >= hl.watchUntil && hl.pictures < HAT_MIN_PICTURES && !hl.longer) {
          // A busy page brought too few pictures: watch once more for as long.
          hl.longer = true;
          hl.watchUntil = now + HAT_WATCH_MS;
        }
        if (now >= hl.watchUntil) {
          hatRef.current = null;
          let result: HatResult;
          let learnt: StoredLearntHat | null = null;
          if (hl.room) {
            const room = hl.room.finish();
            roomRef.current = room;
            result = { step: 'room', ok: room !== null };
          } else {
            const sure = s.learntHat?.sure ?? HAT_SURE_DEFAULT;
            const r = hl.hat ? hl.hat.finish(sure) : null;
            if (r?.model) learnt = storeLearntHat(r.model, sure, Date.now());
            result = r
              ? { step: 'hat', outcome: r.outcome, found: r.found, of: r.of, lookAlike: r.lookAlike }
              : { step: 'hat', outcome: 'no-room', found: 0, of: 0, lookAlike: null };
          }
          hatResultRef.current = result;
          onHatRef.current(result, learnt);
        } else if (now >= hl.readyUntil && frame && now - hl.lastPicture >= HAT_PICTURE_MS) {
          hl.lastPicture = now;
          hl.pictures++;
          hl.room?.add(frame);
          hl.hat?.add(frame, faceBox);
        }
      }

      // Learning the reach: take in every position seen, raw (before any calibration).
      const learn = learnRef.current;
      if (learn) {
        if (fused.sighting) {
          learn.x = widenReach(learn.x, fused.sighting.x);
          learn.y = widenReach(learn.y, fused.sighting.y);
        }
        if (now >= learn.until) {
          learnRef.current = null;
          const ok = (r: AxisRange | null): AxisRange | null => (r && r.max - r.min >= MIN_REACH ? r : null);
          onReachRef.current(ok(learn.x), ok(learn.y));
        }
      }
      // Learning the side-to-side curve: every position seen, as it is in the picture.
      const side = sideRef.current;
      if (side) {
        if (fused.sighting) side.points.push({ x: fused.sighting.x, y: fused.sighting.y });
        if (now >= side.until) {
          sideRef.current = null;
          onSideRef.current(fitSideArc(side.points));
        }
      }
      if (now - lastUi >= UI_EVERY_MS) {
        lastUi = now;
        const h = hatRef.current;
        const next: CapView = {
          camera, face: s.faceAssist && !mouse ? faceStatus : 'off', seen: reading.seen, source: fused.source,
          axes: reading.axes, values: reading.values, paused,
          learning: learn && learnRef.current ? Math.max(0, Math.ceil((learn.until - now) / 1000))
            : side && sideRef.current ? Math.max(0, Math.ceil((side.until - now) / 1000)) : null,
          // Once a second, like the countdowns above: every change re-renders the whole screen,
          // and at several a second that starved this very loop of frames while it watched.
          // The progress is where it will be at the end of this second (the bar glides there).
          hatLearning: h ? {
            step: h.step,
            phase: now < h.readyUntil ? 'ready' : 'watching',
            seconds: Math.max(1, Math.ceil(((now < h.readyUntil ? h.readyUntil : h.watchUntil) - now) / 1000)),
            progress: now < h.readyUntil ? 0 : Math.min(1, (Math.floor((now - h.readyUntil) / 1000) + 1) / (HAT_WATCH_MS / 1000)),
          } : null,
          hatResult: hatResultRef.current,
          roomLearnt: roomRef.current !== null,
        };
        // A still head changes nothing on screen: don't re-render the screen for it.
        setView((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      }
    }, TICK_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      // A step of Learn the hat stops with the camera: what it saw so far is not enough.
      hatRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      face?.dispose();
      valuesRef.current = {};
    };
  // The camera restarts only when it must: switched on, another camera, mouse test.
  // The board's camera too, once it is known: the cap may have taken it while it wasn't.
  }, [settings.enabled, settings.cameraId, mouse, pointerRef, valuesRef, activityRef, opts.boardCameraId]);

  const learnReach = useCallback((seconds: number) => {
    learnRef.current = { until: performance.now() + seconds * 1000, x: null, y: null };
  }, []);

  const learnSide = useCallback((seconds: number) => {
    sideRef.current = { until: performance.now() + seconds * 1000, points: [] };
  }, []);

  const learnHatStep = useCallback((step: HatStep) => {
    if (hatRef.current) return;
    if (step === 'hat' && !roomRef.current) {
      const result: HatResult = { step: 'hat', outcome: 'no-room', found: 0, of: 0, lookAlike: null };
      hatResultRef.current = result;
      setView((v) => ({ ...v, hatResult: result }));
      onHatRef.current(result, null);
      return;
    }
    const now = performance.now();
    hatRef.current = {
      step, readyUntil: now + HAT_READY_MS, watchUntil: now + HAT_READY_MS + HAT_WATCH_MS, lastPicture: -Infinity,
      pictures: 0, longer: false,
      room: step === 'room' ? roomLearner() : null,
      hat: step === 'hat' ? hatLearner(roomRef.current) : null,
    };
    hatResultRef.current = null;
    setView((v) => ({
      ...v, hatResult: null,
      hatLearning: { step, phase: 'ready', seconds: Math.ceil(HAT_READY_MS / 1000), progress: 0 },
    }));
  }, []);

  const clearHatResult = useCallback(() => {
    hatResultRef.current = null;
    setView((v) => ({ ...v, hatResult: null }));
  }, []);

  const colourAt = useCallback((x: number, y: number): CapColour | null => {
    const f = previewRef.current.frame;
    return f ? capColourAt(f, x, y) : null;
  }, []);

  const handOver = useCallback((role: FaderRole, value: number) => {
    if (settingsRef.current.enabled) handOverRef.current.set(role, value);
  }, []);

  return { view, previewRef, learnReach, learnSide, learnHatStep, clearHatResult, colourAt, cameras, handOver };
}
