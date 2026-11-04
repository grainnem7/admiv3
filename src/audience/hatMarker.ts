/**
 * The hat's marker on the audience screen: a crisp ring in the cap's red that goes where
 * Tim's light goes, with a short fading trail, so the audience can see him steering from the
 * back of the room (Tim's light alone is too soft and too big to read). Pure numbers, like
 * light.ts; AudienceScreen draws them.
 *
 * The spec's rules hold here too:
 * - nothing jumps: it moves with the light (already no faster than MAX_LIGHT_SPEED), holds
 *   still while the hat is out of sight, and glides from there when the hat is seen again;
 *   a change of mode fades over a fraction of a second, never at once;
 * - nothing flashes: it is small and hollow, so what it adds to any third of the screen is far
 *   under a flash (markerShare, checked in the tests with the blooms);
 * - less motion asked for (the system setting): no trail, the ring still moves.
 */
import { CAP_RED } from '../ui/screens/boardSequencer/theme/boardTokens';
import { MAX_LIGHT_SPEED, type Rgb } from './light';
import type { AudienceHat } from './protocol';

type HatMode = AudienceHat['mode'];

/** The ring's radius, as a share of the screen's shorter side. */
export const MARKER_RADIUS = 0.065;
/** How long the trail is, in seconds of movement. */
export const TRAIL_SEC = 1;
/** How strongly the ring is drawn in each mode: clear, dimmed (dashed), or not at all. */
export const MARKER_ALPHA: Readonly<Record<HatMode, number>> = { follow: 0.95, lost: 0.4, free: 0 };
/** The ring's line, as a share of its radius. */
export const RING_WIDTH = 0.2;
/** The solid dot at its centre (so it reads as a pointer, not a bloom's ripple), of its radius. */
export const DOT_RADIUS = 0.17;
/** The soft red at its middle, at the centre (fading to nothing at CORE_REACH radii). */
export const CORE_ALPHA = 0.22;
export const CORE_REACH = 0.9;
/** The trail at its newest end: its strength (of the ring's) and width (of the ring's radius). */
export const TRAIL_ALPHA = 0.55;
export const TRAIL_WIDTH = 0.32;
/** The most trail points kept (about 30 frames a second for TRAIL_SEC). */
const MAX_TRAIL = 40;
/** A new trail point no sooner than this, and only once the ring has moved this far. */
const TRAIL_GAP_SEC = 0.025;
const TRAIL_MIN_MOVE = 0.002;
/** Below this strength the ring is not seen: it may take the light's place at once. */
const UNSEEN = 0.02;

/** The cap's red, as numbers. */
export const MARKER_RGB: Rgb = [
  parseInt(CAP_RED.slice(1, 3), 16), parseInt(CAP_RED.slice(3, 5), 16), parseInt(CAP_RED.slice(5, 7), 16),
];

export interface TrailPoint { x: number; y: number; t: number }

export interface MarkerState {
  /** Where the ring is (0..1 across and down the screen). */
  x: number;
  y: number;
  /** How strongly it is drawn now, 0..1. */
  alpha: number;
  /** Where it has just been, oldest first. */
  trail: TrailPoint[];
}

export const INITIAL_MARKER: MarkerState = { x: 0.5, y: 0.5, alpha: 0, trail: [] };

const glide = (from: number, to: number, dt: number, tauSec: number): number =>
  from + (to - from) * (1 - Math.exp(-Math.max(0, dt) / tauSec));

/** What the tests read: the ring follows, is held dimmed, or is off. */
export function markerMode(mode: HatMode): 'follow' | 'lost' | 'off' {
  return mode === 'free' ? 'off' : mode;
}

/**
 * The mode the ring takes: the laptop's, or, while the laptop is quiet (null), held where it
 * was and dimmed if a hat was in use, still off if none was.
 */
export function markerHatMode(connected: HatMode | null, previous: HatMode): HatMode {
  if (connected) return connected;
  return previous === 'free' ? 'free' : 'lost';
}

/**
 * One frame of the ring: `light` is where Tim's light is now (stepLight), `dt` the seconds
 * since the last frame, `t` the time now (seconds).
 */
export function stepMarker(
  st: MarkerState, mode: HatMode, light: { x: number; y: number }, dt: number, t: number, reduced: boolean,
): MarkerState {
  const target = MARKER_ALPHA[mode];
  let alpha = glide(st.alpha, target, dt, target > st.alpha ? 0.3 : 0.45);
  if (target === 0 && alpha < 0.005) alpha = 0;

  let { x, y } = st;
  if (st.alpha < UNSEEN) {
    // Not seen yet: it starts where the light is, so it never appears somewhere else.
    x = light.x;
    y = light.y;
  } else if (mode === 'follow') {
    const dx = light.x - x;
    const dy = light.y - y;
    const d = Math.hypot(dx, dy);
    const most = MAX_LIGHT_SPEED * Math.max(0, dt);
    if (d <= most) { x = light.x; y = light.y; } else { x += (dx * most) / d; y += (dy * most) / d; }
  }
  // Lost or off: held where it is.

  let trail: TrailPoint[] = [];
  if (!reduced) {
    trail = st.trail.filter((p) => t - p.t <= TRAIL_SEC);
    const lastPoint = trail[trail.length - 1];
    const moved = !lastPoint || Math.hypot(x - lastPoint.x, y - lastPoint.y) >= TRAIL_MIN_MOVE;
    const due = !lastPoint || t - lastPoint.t >= TRAIL_GAP_SEC;
    if (mode === 'follow' && alpha >= UNSEEN && moved && due) trail.push({ x, y, t });
    if (trail.length > MAX_TRAIL) trail = trail.slice(trail.length - MAX_TRAIL);
  }
  return { x, y, alpha, trail };
}

export interface TrailSegment {
  x0: number; y0: number; x1: number; y1: number;
  /** Strength, 0..1 (already times the ring's own). */
  alpha: number;
  /** Width, as a share of the ring's radius. */
  width: number;
}

/** The trail as line pieces, oldest first: fading and thinning towards the old end. */
export function trailSegments(trail: readonly TrailPoint[], now: number, alpha: number): TrailSegment[] {
  const out: TrailSegment[] = [];
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const f = Math.max(0, 1 - (now - b.t) / TRAIL_SEC);
    if (f <= 0) continue;
    out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, alpha: alpha * TRAIL_ALPHA * f, width: TRAIL_WIDTH * f });
  }
  return out;
}

/** The ring's radius in pixels on a screen of `w` by `h`. */
export function markerSize(w: number, h: number): number {
  return Math.min(w, h) * MARKER_RADIUS;
}

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/**
 * At most how much light the ring, its core and its whole trail add to one third of the
 * screen, at full strength, as a share of the brightest a third can be. An upper bound: all
 * of it is counted in one third, and the trail as long as the light can travel in TRAIL_SEC.
 */
export function markerShare(w: number, h: number): number {
  const R = markerSize(w, h);
  const lum = 0.2126 * lin(MARKER_RGB[0]) + 0.7152 * lin(MARKER_RGB[1]) + 0.0722 * lin(MARKER_RGB[2]);
  const ring = 2 * Math.PI * R * R * RING_WIDTH + Math.PI * (R * DOT_RADIUS) ** 2;
  const core = (CORE_ALPHA * Math.PI * (R * CORE_REACH) ** 2) / 3;
  // The trail's strength and width both fall to nothing along it: half the full strip is
  // more than it ever is (a third, exactly).
  const trailLength = MAX_LIGHT_SPEED * TRAIL_SEC * Math.max(w, h);
  const trail = (trailLength * TRAIL_WIDTH * R * TRAIL_ALPHA) / 2;
  return ((ring + core + trail) * lum) / Math.max(1, (w * h) / 3);
}
