/**
 * The red cap: a player wears it, a camera facing them finds it, and where it is turns
 * into control values — left–right and up–down each driving one control (volume, speed,
 * reverb…) the same way a control counter on the board does.
 *
 * Built for Tim (see the project notes): he can't hold still or make fast or precise
 * movements, and his reach covers only part of the picture. So: his own comfortable range
 * is learnt and stretched to the full control; small movements are ignored and changes
 * glide; an optional few clear steps instead of a continuous slide; and when the cap
 * leaves the picture the values HOLD — losing sight of him must never mean a jump.
 *
 * Pure: pixels in, values out, so it is tested without a camera and the same code runs in
 * the app's mouse test mode.
 */
import { rgbToHsv } from '../ColorTracker';
import { applyAxisCalibration, type AxisRange } from '../../remix/batonCalibration';
import type { ControlRange, FaderRole } from '../../profiles/BoardSequencerConfig';
import { hatMask, sanitizeLearntHat, type HatModel, type StoredLearntHat } from './hatColour';

export interface CapColour {
  /** Hue 0..360 (red ≈ 0). */
  hue: number;
  /** How far from that hue still counts. */
  hueTolerance: number;
  /** Saturation and brightness floors, 0..100. High saturation keeps skin out. */
  minSaturation: number;
  minValue: number;
}

/** A strongly red object: what a red cap looks like to most webcams. */
export const DEFAULT_CAP_COLOUR: CapColour = { hue: 0, hueTolerance: 18, minSaturation: 55, minValue: 25 };

export interface CapSighting {
  /** Centre of the cap, 0..1 across and down the picture. */
  x: number;
  y: number;
  /** Its size, as a share of the picture. */
  area: number;
}

export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Smaller than this share of the picture is a speck, not a cap. */
export const MIN_CAP_AREA = 0.002;

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function matchesCap(r: number, g: number, b: number, c: CapColour): boolean {
  const hsv = rgbToHsv(r, g, b);
  return hsv.s >= c.minSaturation && hsv.v >= c.minValue && hueDistance(hsv.h, c.hue) <= c.hueTolerance;
}

/** The pixels of the clicked cap colour (1 = cap colour). */
export function capMask(f: Frame, colour: CapColour): Uint8Array {
  const { width: w, height: h, data } = f;
  const n = w * h;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (matchesCap(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], colour)) mask[i] = 1;
  }
  return mask;
}

/** A connected patch of a mask, big enough to be a cap. */
export interface CapPatch {
  /** Its centre, 0..1 across and down the picture. */
  x: number;
  y: number;
  /** Its size, as a share of the picture. */
  area: number;
  /** The box around it, 0..1. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Its number in `labels`. */
  id: number;
}

/**
 * The patches of a mask (each pixel joined to the four next to it) at least the size floor,
 * in the order they are first met; `labels` gives each pixel's patch number (0 = none).
 */
export function capPatches(mask: Uint8Array, w: number, h: number): { patches: CapPatch[]; labels: Int32Array } {
  const n = w * h;
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const patches: CapPatch[] = [];
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (!mask[start] || labels[start]) continue;
    id++;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    let count = 0; let sx = 0; let sy = 0;
    let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w; const y = (p - x) / w;
      count++; sx += x; sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = id; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = id; stack[top++] = p + w; }
    }
    const area = count / n;
    if (area < MIN_CAP_AREA) continue;
    patches.push({
      x: (sx / count + 0.5) / w, y: (sy / count + 0.5) / h, area,
      x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h, id,
    });
  }
  return { patches, labels };
}

/**
 * The cap among the patches: the biggest, preferring the one nearest where it was last time
 * (a red jumper or a poster elsewhere in the room shouldn't steal it). Null when none.
 */
export function pickCap(patches: readonly CapPatch[], prev: { x: number; y: number } | null): CapSighting | null {
  let best: CapSighting | null = null;
  let bestScore = 0;
  for (const c of patches) {
    // Nearness to the last sighting counts as much as size: a patch half as big right
    // where the cap was beats a bigger one across the room.
    const near = prev ? 1 / (1 + 4 * Math.hypot(c.x - prev.x, c.y - prev.y)) : 1;
    const score = c.area * near;
    if (score > bestScore) { bestScore = score; best = { x: c.x, y: c.y, area: c.area }; }
  }
  return best;
}

/**
 * Find the cap by its clicked colour: the biggest patch of cap colour, preferring the one
 * nearest where it was last time. Null when nothing cap-coloured is big enough.
 */
export function findCap(f: Frame, colour: CapColour, prev: { x: number; y: number } | null = null): CapSighting | null {
  return pickCap(capPatches(capMask(f, colour), f.width, f.height).patches, prev);
}

/**
 * Find the cap by the learnt hat (Learn the hat): the same patches, size floor and choice as
 * `findCap`, from the pixels the learnt model takes for the hat. The mask and the patches
 * come back too, so the preview can show what is taken for the hat.
 */
export function findLearntHat(
  f: Frame, model: HatModel, sure: number, prev: { x: number; y: number } | null,
): { sighting: CapSighting | null; mask: Uint8Array; patches: CapPatch[] } {
  const mask = hatMask(f, model, sure);
  const { patches } = capPatches(mask, f.width, f.height);
  return { sighting: pickCap(patches, prev), mask, patches };
}

/**
 * Everything else taken for the cap, besides the patch it follows (`pickCap` gives that
 * patch's own centre): what "Show what it sees as the hat" outlines as looking like the hat.
 */
export function lookAlikes(patches: readonly CapPatch[], followed: CapSighting | null): CapPatch[] {
  return patches.filter((c) => !followed || c.x !== followed.x || c.y !== followed.y);
}

/**
 * The colour of the cap where the facilitator tapped it: the median of a small patch, with
 * a band around it wide enough for the cap in shadow and in light.
 */
export function capColourAt(f: Frame, x: number, y: number): CapColour | null {
  const px = Math.round(x * f.width); const py = Math.round(y * f.height);
  const hs: number[] = []; const ss: number[] = []; const vs: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = px + dx; const yy = py + dy;
      if (xx < 0 || yy < 0 || xx >= f.width || yy >= f.height) continue;
      const i = (yy * f.width + xx) * 4;
      const hsv = rgbToHsv(f.data[i], f.data[i + 1], f.data[i + 2]);
      hs.push(hsv.h); ss.push(hsv.s); vs.push(hsv.v);
    }
  }
  if (hs.length === 0) return null;
  const med = (a: number[]): number => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  // Hue wraps at red: average on the circle rather than the median of 355° and 5°.
  const rad = hs.map((d) => (d * Math.PI) / 180);
  const hue = ((Math.atan2(rad.reduce((s, r) => s + Math.sin(r), 0), rad.reduce((s, r) => s + Math.cos(r), 0)) * 180) / Math.PI + 360) % 360;
  const s = med(ss); const v = med(vs);
  if (s < 25) return null; // not a colour — grey, white or black can't be tracked like this
  return { hue, hueTolerance: 18, minSaturation: Math.max(30, Math.round(s * 0.6)), minValue: Math.max(15, Math.round(v * 0.4)) };
}

// ---- reinforced by the face -------------------------------------------------------------

/** The face as a box, 0..1 in the same picture as the cap. */
export interface FaceBox { x: number; y: number; w: number; h: number }

/** The face's box from its landmarks. */
export function faceBoxFromLandmarks(points: readonly { x: number; y: number }[], mirror: boolean): FaceBox | null {
  if (points.length === 0) return null;
  let x0 = 1; let x1 = 0; let y0 = 1; let y1 = 0;
  for (const p of points) {
    const x = mirror ? 1 - p.x : p.x;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Whether a red patch sits where a cap on this face would: over it, or just above it. */
export function onTheHead(c: { x: number; y: number }, f: FaceBox): boolean {
  return c.x >= f.x - f.w * 0.6 && c.x <= f.x + f.w * 1.6
    && c.y >= f.y - f.h * 1.2 && c.y <= f.y + f.h * 0.6;
}

/** Where the cap sits relative to the face's centre (learnt while both are seen). */
export interface CapOffset { dx: number; dy: number }

export interface FusedSighting {
  sighting: CapSighting | null;
  offset: CapOffset | null;
  /** What the position came from this frame, for the on-screen status. */
  source: 'cap' | 'face' | 'none';
}

/**
 * The cap, reinforced by the face. Both seen: the cap counts only if it is on the head (a
 * red jumper across the room can't take over), and where it sits on the face is learnt.
 * Cap hidden or off the head, face seen: the face carries on, placed where the cap was,
 * so the controls keep following the player instead of freezing. Neither: nothing (the
 * values hold).
 */
export function fuseWithFace(cap: CapSighting | null, face: FaceBox | null, offset: CapOffset | null): FusedSighting {
  if (!face) return { sighting: cap, offset, source: cap ? 'cap' : 'none' };
  const fx = face.x + face.w / 2;
  const fy = face.y + face.h / 2;
  if (cap && onTheHead(cap, face)) {
    const seen = { dx: cap.x - fx, dy: cap.y - fy };
    const next = offset ? { dx: offset.dx + (seen.dx - offset.dx) * 0.2, dy: offset.dy + (seen.dy - offset.dy) * 0.2 } : seen;
    return { sighting: cap, offset: next, source: 'cap' };
  }
  // No cap on the head: follow the face, where the cap would be (the top of the face until
  // the two have been seen together).
  const o = offset ?? { dx: 0, dy: -face.h * 0.6 };
  return { sighting: { x: fx + o.dx, y: fy + o.dy, area: 0 }, offset, source: 'face' };
}

// ---- from position to controls ---------------------------------------------------------

export type CapRole = FaderRole | 'off';
export type CapResponse = 'steady' | 'medium' | 'quick';

export interface CapSettings {
  enabled: boolean;
  /** The camera facing the player ('' = the first one found). */
  cameraId: string;
  colour: CapColour;
  /**
   * The hat learnt against the room (Learn the hat): when there is one, it finds the cap
   * instead of the clicked colour. Null = not learnt: the clicked colour, as before.
   */
  learntHat: StoredLearntHat | null;
  /** The player's comfortable reach, learnt; null = the whole picture. */
  reachX: AxisRange | null;
  reachY: AxisRange | null;
  /** What moving the cap left–right and up–down controls. */
  xRole: CapRole;
  yRole: CapRole;
  /** 0 = smooth; otherwise this many clear steps. */
  steps: 0 | 3 | 5;
  response: CapResponse;
  /** Show the picture like a mirror, so moving to your right moves right on screen. */
  mirror: boolean;
  /** Frozen by the facilitator: values stay where they are. */
  locked: boolean;
  /** Reinforce the cap with face tracking (checks it is on the head; bridges gaps). */
  faceAssist: boolean;
  /**
   * One direction at a time: a control only changes while the head is clearly moving its
   * way. Turning to the side lowers the head a little (it moves in an arc), which read as
   * "quieter" whenever the player sped up; with this on, a sideways move leaves up–down
   * alone, and a nod leaves left–right alone. A diagonal move changes both.
   */
  oneAtATime: boolean;
  /**
   * The player's natural side-to-side curve, learnt: picture height as a curve of picture
   * position across, y = a + b·x + c·x². Up–down is then read relative to this curve, so
   * moving along it is not "up" or "down" at all. Null = not learnt.
   */
  sideArc: SideArc | null;
  /**
   * Hold still while counters are being moved: reaching for the board moves the head too,
   * and that must not change the music. The head starts moving before the hand gets
   * there, so a pause also slides back to where things were `rewindMs` before it began.
   */
  pauseOnBoard: boolean;
  /** How long the board must be quiet before the cap works again. */
  resumeAfterMs: number;
  /** How far back a pause slides to, to undo the start of the reach. */
  rewindMs: number;
  /** A hand lying still on the board stops holding the cap after this long. */
  restMs: number;
}

export interface SideArc { a: number; b: number; c: number }

export const DEFAULT_CAP_SETTINGS: CapSettings = {
  enabled: false,
  cameraId: '',
  colour: DEFAULT_CAP_COLOUR,
  learntHat: null,
  reachX: null,
  reachY: null,
  xRole: 'tempo',
  yRole: 'volume',
  steps: 0,
  response: 'steady',
  mirror: true,
  locked: false,
  faceAssist: true,
  oneAtATime: true,
  sideArc: null,
  pauseOnBoard: true,
  resumeAfterMs: 1000,
  rewindMs: 500,
  restMs: 3000,
};

export const CAP_RESUME_MIN_MS = 300;
export const CAP_RESUME_MAX_MS = 4000;
export const CAP_REWIND_MAX_MS = 1500;
export const CAP_REST_MIN_MS = 1000;
export const CAP_REST_MAX_MS = 15000;
/** After a pause, the head must be still this long before the cap follows it again. */
export const CAP_SETTLE_MS = 300;
/**
 * Out of sight at least this long, then seen again, counts as found again: the controls glide
 * to where it now is. Shorter is a dropped frame or two, and changes nothing.
 */
export const CAP_REFOUND_MS = 500;
/** How much of the cap's recent past is kept, for sliding back. */
const HISTORY_MS = CAP_REWIND_MAX_MS + 100;

/**
 * What the board has been doing, from the board runtime (performance.now() times):
 * when it last changed (a counter, a hand moving) and since when a hand has been on it.
 */
export interface BoardActivity {
  lastChangeMs: number | null;
  handSinceMs: number | null;
}

export type CapPauseReason = 'hands' | 'board';

/** Whether the cap should hold still now, and why. */
export function capPauseReason(a: BoardActivity, nowMs: number, s: CapSettings): CapPauseReason | null {
  if (!s.pauseOnBoard) return null;
  const hand = a.handSinceMs !== null;
  if (a.handSinceMs !== null && nowMs - a.handSinceMs < s.restMs) return 'hands';
  if (a.lastChangeMs !== null && nowMs - a.lastChangeMs < s.resumeAfterMs) return hand ? 'hands' : 'board';
  return null;
}

/** How quickly a control follows the cap: time to cover most of a move. */
const GLIDE_MS: Record<CapResponse, number> = { steady: 700, medium: 350, quick: 150 };
/** Movements smaller than this (of the learnt reach) are ignored. */
export const CAP_DEAD_ZONE = 0.04;
/** The outer part of the learnt reach that already counts as the very end. */
export const CAP_REACH_MARGIN = 0.1;

export interface CapAxisState {
  /** The committed position, 0..1, or null before the cap has been seen. */
  target: number | null;
  /** Where the control is now (gliding towards target). */
  pos: number | null;
  /** The current step, when stepped. */
  step: number | null;
  /** Handed to another control (the iPad): only a real move of the head takes it back. */
  waitMove?: boolean;
}

export interface CapState {
  x: CapAxisState;
  y: CapAxisState;
  last: { x: number; y: number } | null;
  /** How long the cap has been out of sight. */
  lostMs: number;
  /** The previous control-space position and how fast it is moving each way (per second). */
  prev: { x: number; y: number } | null;
  vx: number;
  vy: number;
  /** Time since the start, and where each control was lately: for sliding back. */
  t: number;
  history: { t: number; x: number | null; y: number | null }[];
  paused: boolean;
  /** A pause has ended; waiting for the head to be still before following it. */
  settling: boolean;
  stillMs: number;
}

export const initialCapState = (): CapState => ({
  x: { target: null, pos: null, step: null },
  y: { target: null, pos: null, step: null },
  last: null,
  lostMs: 0,
  prev: null,
  vx: 0,
  vy: 0,
  t: 0,
  history: [],
  paused: false,
  settling: false,
  stillMs: 0,
});

/** Where the controls were at a moment: the latest record at or before it, else the oldest. */
function positionAt(history: CapState['history'], t: number): CapState['history'][number] | null {
  let found: CapState['history'][number] | null = history[0] ?? null;
  for (const h of history) {
    if (h.t > t) break;
    found = h;
  }
  return found;
}

const rewindAxis = (a: CapAxisState, p: number | null): CapAxisState =>
  (p === null || a.target === null ? a : { ...a, target: p, step: null });

/** Snap to N steps, with a little stickiness so a position on a boundary doesn't flicker. */
export function quantise(v: number, steps: number, current: number | null): number {
  if (steps < 2) return v;
  const exact = v * (steps - 1);
  const nearest = Math.round(exact);
  if (current !== null && Math.abs(exact - current) < 0.65) return current;
  return nearest;
}

function stepAxis(
  a: CapAxisState, raw: number | null, s: CapSettings, dtMs: number, allow = true, moving = false,
): CapAxisState {
  let { target, pos, step, waitMove } = a;
  if (raw !== null && !s.locked && (allow || target === null) && (!waitMove || moving)) {
    if (target === null || Math.abs(raw - target) > CAP_DEAD_ZONE) { target = raw; waitMove = false; }
  }
  if (target === null) return a;
  let goal = target;
  if (s.steps > 0) {
    step = quantise(target, s.steps, step);
    goal = step / (s.steps - 1);
  }
  if (pos === null) pos = goal;
  else if (!s.locked) {
    const k = 1 - Math.exp(-Math.max(0, dtMs) / (GLIDE_MS[s.response] / 3));
    pos += (goal - pos) * k;
  }
  return { target, pos, step, ...(waitMove ? { waitMove } : {}) };
}

/**
 * Another control (the iPad) set this axis's control to `p` (0..1 of its range): the cap
 * takes that as where it is, and holds it until the head really moves — otherwise the
 * next frame would put the cap's value straight back and the iPad would do nothing.
 */
export function handOverAxis(st: CapState, axis: 'x' | 'y', p: number): CapState {
  const v = Math.max(0, Math.min(1, p));
  return { ...st, [axis]: { target: v, pos: v, step: null, waitMove: true } };
}

export interface CapReading {
  state: CapState;
  /** Control values to apply, in each control's own units (via its range). */
  values: Partial<Record<FaderRole, number>>;
  /** Where each axis is, 0..1, for the on-screen bars. */
  axes: { x: number | null; y: number | null };
  seen: boolean;
}

/**
 * The hat on Speed: the speed for a position `p` (0..1) of Tim's range, around `centre`, the
 * speed in force without the hat (the scene's, a glide's, or the player's own). The middle
 * is the centre, one end Fastest and the other Slowest, linear on each side, so from any
 * scene both ends can still be reached. The centre is held between Slowest and Fastest.
 */
export function hatTempo(centre: number, p: number, slowest: number, fastest: number): number {
  const lo = Math.min(slowest, fastest);
  const hi = Math.max(slowest, fastest);
  const c = Math.max(lo, Math.min(hi, centre));
  const k = Math.max(0, Math.min(1, p));
  return Math.round(k >= 0.5 ? c + (k - 0.5) * 2 * (hi - c) : c - (0.5 - k) * 2 * (c - lo));
}

/**
 * The way back: where the hat would be for a speed, around `centre`. For a speed set by
 * another control (the iPad), and where the cap starts from, so it changes nothing until
 * the head moves.
 */
export function hatPosition(centre: number, bpm: number, slowest: number, fastest: number): number {
  const lo = Math.min(slowest, fastest);
  const hi = Math.max(slowest, fastest);
  const c = Math.max(lo, Math.min(hi, centre));
  if (bpm >= c) return hi > c ? Math.min(1, 0.5 + (0.5 * (bpm - c)) / (hi - c)) : 0.5;
  return c > lo ? Math.max(0, 0.5 - (0.5 * (c - bpm)) / (c - lo)) : 0.5;
}

/**
 * The cap's values, then the board's control counters on top: a counter put down on purpose
 * is the more deliberate choice, so a Speed counter wins over the hat.
 */
export function withCounterValues(
  cap: Partial<Record<FaderRole, number>>, counters: Partial<Record<FaderRole, number>>,
): Partial<Record<FaderRole, number>> {
  return { ...cap, ...counters };
}

/**
 * One frame: the cap's sighting (or none) → the control values. Positions are stretched
 * from the player's learnt reach to the whole control; up the picture is up the control.
 * While `paused`, the controls hold (after sliding back to before the reach began). With a
 * `tempoCentre`, Speed moves around it (hatTempo); without one, across its whole range.
 */
export function stepCap(
  st: CapState, sighting: CapSighting | null, s: CapSettings, ranges: Record<FaderRole, ControlRange>, dtMs: number,
  paused = false, tempoCentre?: number,
): CapReading {
  let rawX: number | null = null;
  let rawY: number | null = null;
  if (sighting) {
    rawX = applyAxisCalibration(sighting.x, s.reachX, s.reachX ? CAP_REACH_MARGIN : 0);
    // Height relative to the player's own side-to-side curve, when it has been learnt.
    const level = s.sideArc
      ? arcAt(s.sideArc, sighting.x) - arcAt(s.sideArc, reachMiddle(s.reachX))
      : 0;
    rawY = 1 - applyAxisCalibration(sighting.y - level, s.reachY, s.reachY ? CAP_REACH_MARGIN : 0);
  }
  // Which way is the head moving? A short smoothing of its speed each way.
  let { vx, vy } = st;
  if (rawX !== null && rawY !== null && st.prev && dtMs > 0) {
    const k = 1 - Math.exp(-dtMs / MOTION_SMOOTH_MS);
    vx += (((rawX - st.prev.x) * 1000) / dtMs - vx) * k;
    vy += (((rawY - st.prev.y) * 1000) / dtMs - vy) * k;
  } else if (rawX === null) {
    vx = 0; vy = 0;
  }
  const moving = Math.hypot(vx, vy) > MOTION_FLOOR;
  let allowX = true;
  let allowY = true;
  if (s.oneAtATime) {
    allowX = moving && Math.abs(vx) >= DOMINANCE * Math.abs(vy);
    allowY = moving && Math.abs(vy) >= DOMINANCE * Math.abs(vx);
  }
  // Paused, or just after: the head is coming back from the board and must settle first,
  // or the way back would move the controls as much as the reach did.
  const t = st.t + Math.max(0, dtMs);
  let settling = st.settling || (st.paused && !paused);
  const stillMs = settling && !moving ? st.stillMs + dtMs : 0;
  // Settled: wherever the head came to rest is where the cap picks up (gliding there).
  // One direction at a time only follows a MOVING head, so a head that moved while the
  // cap waited, then stopped, would otherwise be left behind for good.
  const pickUp = settling && stillMs >= CAP_SETTLE_MS;
  if (pickUp) settling = false;
  // Found again after being lost: wherever it is now is where the controls glide to, still
  // or not (one direction at a time would otherwise wait for the head to move). A value
  // another control (the iPad) set still waits for a real move of the head.
  const refound = sighting !== null && st.lostMs >= CAP_REFOUND_MS;
  const hold = paused || settling;
  let fromX = st.x;
  let fromY = st.y;
  if (paused && !st.paused) {
    const back = positionAt(st.history, t - s.rewindMs);
    if (back) { fromX = rewindAxis(st.x, back.x); fromY = rewindAxis(st.y, back.y); }
  }
  const x = stepAxis(fromX, rawX, s, dtMs, (allowX || pickUp || refound) && !hold, moving || pickUp);
  const y = stepAxis(fromY, rawY, s, dtMs, (allowY || pickUp || refound) && !hold, moving || pickUp);
  const history = st.history.filter((h) => h.t >= t - HISTORY_MS);
  history.push({ t, x: x.pos, y: y.pos });
  const values: Partial<Record<FaderRole, number>> = {};
  const put = (role: CapRole, p: number | null): void => {
    if (role === 'off' || p === null) return;
    const r = ranges[role];
    if (role === 'tempo' && tempoCentre !== undefined) { values.tempo = hatTempo(tempoCentre, p, r.min, r.max); return; }
    const v = r.min + p * (r.max - r.min);
    values[role] = role === 'tempo' ? Math.round(v) : v;
  };
  put(s.xRole, x.pos);
  if (s.yRole !== s.xRole) put(s.yRole, y.pos);
  return {
    state: {
      x, y,
      last: sighting ? { x: sighting.x, y: sighting.y } : st.last,
      lostMs: sighting ? 0 : st.lostMs + dtMs,
      prev: rawX !== null && rawY !== null ? { x: rawX, y: rawY } : null,
      vx, vy,
      t, history, paused, settling, stillMs,
    },
    values,
    axes: { x: x.pos, y: y.pos },
    seen: sighting !== null,
  };
}

/** How quickly "which way is it moving" follows the head. */
const MOTION_SMOOTH_MS = 120;
/** Slower than this (control range per second), the head counts as still. */
const MOTION_FLOOR = 0.06;
/**
 * A control follows only when its direction is at least this share of the other one. A
 * sideways turn droops by well under half as much as it travels, so it stays below this;
 * a deliberate diagonal is above it for both.
 */
const DOMINANCE = 0.6;

function arcAt(a: SideArc, x: number): number {
  return a.a + a.b * x + a.c * x * x;
}
const reachMiddle = (r: AxisRange | null): number => (r ? (r.min + r.max) / 2 : 0.5);

/**
 * The player's side-to-side curve, from positions seen while they move the head left and
 * right at a comfortable height: a least-squares parabola through them. Null when they
 * didn't move far enough sideways to tell.
 */
export function fitSideArc(points: readonly { x: number; y: number }[]): SideArc | null {
  if (points.length < 8) return null;
  const xs = points.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < 0.15) return null;
  // Normal equations for y = a + b x + c x².
  let n = 0; let sx = 0; let sx2 = 0; let sx3 = 0; let sx4 = 0; let sy = 0; let sxy = 0; let sx2y = 0;
  for (const { x, y } of points) {
    const x2 = x * x;
    n++; sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2; sy += y; sxy += x * y; sx2y += x2 * y;
  }
  const m = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]];
  const v = [sy, sxy, sx2y];
  const det = (a: number[][]): number => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;
  const solve = (col: number): number => det(m.map((row, i) => row.map((val, j) => (j === col ? v[i] : val)))) / d;
  return { a: solve(0), b: solve(1), c: solve(2) };
}

/** Learning the reach: widen the range to take in every position seen. */
export function widenReach(r: AxisRange | null, v: number): AxisRange {
  return r ? { min: Math.min(r.min, v), max: Math.max(r.max, v) } : { min: v, max: v };
}

/** A reach too small to use (the cap barely moved while learning). */
export const MIN_REACH = 0.05;

// ---- storing ---------------------------------------------------------------------------

const ROLES: CapRole[] = ['off', 'volume', 'tempo', 'reverb', 'delay', 'tone', 'fill', 'evolve'];
const num = (v: unknown, lo: number, hi: number, d: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const range = (v: unknown): AxisRange | null => {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const min = num(o.min, 0, 1, NaN); const max = num(o.max, 0, 1, NaN);
  return Number.isFinite(min) && Number.isFinite(max) && max - min >= MIN_REACH ? { min, max } : null;
};

const sideArc = (v: unknown): SideArc | null => {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 50;
  return ok(o.a) && ok(o.b) && ok(o.c) ? { a: o.a, b: o.b, c: o.c } : null;
};

export function sanitizeCapSettings(v: unknown): CapSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_CAP_SETTINGS;
  const c = (o.colour && typeof o.colour === 'object' ? o.colour : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    cameraId: typeof o.cameraId === 'string' ? o.cameraId : '',
    colour: {
      hue: num(c.hue, 0, 360, d.colour.hue),
      hueTolerance: num(c.hueTolerance, 4, 60, d.colour.hueTolerance),
      minSaturation: num(c.minSaturation, 10, 100, d.colour.minSaturation),
      minValue: num(c.minValue, 0, 100, d.colour.minValue),
    },
    learntHat: sanitizeLearntHat(o.learntHat),
    reachX: range(o.reachX),
    reachY: range(o.reachY),
    xRole: ROLES.includes(o.xRole as CapRole) ? (o.xRole as CapRole) : d.xRole,
    yRole: ROLES.includes(o.yRole as CapRole) ? (o.yRole as CapRole) : d.yRole,
    steps: o.steps === 3 || o.steps === 5 ? o.steps : 0,
    response: o.response === 'medium' || o.response === 'quick' ? o.response : 'steady',
    mirror: o.mirror !== false,
    locked: o.locked === true,
    faceAssist: o.faceAssist !== false,
    oneAtATime: o.oneAtATime !== false,
    sideArc: sideArc(o.sideArc),
    pauseOnBoard: o.pauseOnBoard !== false,
    resumeAfterMs: num(o.resumeAfterMs, CAP_RESUME_MIN_MS, CAP_RESUME_MAX_MS, d.resumeAfterMs),
    rewindMs: num(o.rewindMs, 0, CAP_REWIND_MAX_MS, d.rewindMs),
    restMs: num(o.restMs, CAP_REST_MIN_MS, CAP_REST_MAX_MS, d.restMs),
  };
}
