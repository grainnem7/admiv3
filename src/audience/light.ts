/**
 * The audience screen's picture, as numbers (spec 2026-10-29): where Tim's light is, how
 * warm and bright, how it pulses, the sound world's tint, how awake the board is, and how a
 * note blooms. Pure, so it is tested without a window; the audience window only draws it.
 *
 * Two rules hold everywhere here:
 * - nothing jumps: every change glides, and the light never moves faster than
 *   MAX_LIGHT_SPEED, whatever the hat does;
 * - nothing flashes: no large area pulses more than MAX_PULSE_HZ (WCAG 2.3.1).
 */
import type { AudienceHat } from './protocol';

export type Rgb = [number, number, number];

/** A glide towards `target` over about `tauSec` (63 % of the way per tau), frame-rate free. */
const glide = (from: number, to: number, dt: number, tauSec: number): number =>
  from + (to - from) * (1 - Math.exp(-Math.max(0, dt) / tauSec));
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- Tim's light ----

/**
 * Where on the screen the hat's range lands. Tim's learnt range is already stretched to
 * 0..1 by the hat (capTracker), so a small movement of his crosses most of the screen; the
 * light's centre stays a little in from the edges so the glow is never half off it.
 */
const X_LEFT = 0.14;
const X_RIGHT = 0.86;
const Y_TOP = 0.16;
const Y_BOTTOM = 0.84;

/** The fastest the light moves, in screens a second: quick enough to follow, never a jump. */
export const MAX_LIGHT_SPEED = 1.6;
/** How bright the light stays while the hat is out of sight: dimmer, never gone. */
export const LOST_LEVEL = 0.7;
/** How bright it is with no hat in use. */
const FREE_LEVEL = 0.85;
/** How far it sways around where it was held while the hat is out of sight. */
const LOST_DRIFT = 0.02;

export interface LightState {
  /** Where the light is (0..1 across and down the screen). */
  x: number;
  y: number;
  /** Where it is heading: the hat, the spot it was held at, or its own slow wander. */
  ax: number;
  ay: number;
  /** How much it sways around that spot now. */
  drift: number;
  /** Brightness from the hat being in sight (1) or not (LOST_LEVEL). */
  level: number;
  /** Warmth from the Brightness, 0..1. */
  warmth: number;
}

export const INITIAL_LIGHT: LightState = { x: 0.5, y: 0.5, ax: 0.5, ay: 0.5, drift: 0, level: FREE_LEVEL, warmth: 0.5 };

/** The light's own slow wander when no hat is in use: a gentle loop round the middle. */
function wander(t: number): [number, number] {
  return [0.5 + 0.2 * Math.sin((2 * Math.PI * t) / 23), 0.5 + 0.12 * Math.sin((2 * Math.PI * t) / 17 + 1)];
}

/** A small sway, so a held light still looks alive. */
function sway(t: number): [number, number] {
  return [Math.sin((2 * Math.PI * t) / 7), Math.sin((2 * Math.PI * t) / 9 + 2)];
}

/** One frame of Tim's light: `dt` seconds since the last, `t` the time now (seconds). */
export function stepLight(st: LightState, hat: AudienceHat, dt: number, t: number): LightState {
  let { ax, ay, drift, level, warmth } = st;
  let tau: number;
  if (hat.mode === 'follow' && hat.x !== null && hat.y !== null) {
    ax = X_LEFT + (X_RIGHT - X_LEFT) * Math.max(0, Math.min(1, hat.x));
    ay = Y_BOTTOM - (Y_BOTTOM - Y_TOP) * Math.max(0, Math.min(1, hat.y));
    drift = glide(drift, 0, dt, 0.5);
    level = glide(level, 1, dt, 0.6);
    if (hat.warmth !== null) warmth = glide(warmth, Math.max(0, Math.min(1, hat.warmth)), dt, 0.35);
    tau = 0.15;
  } else if (hat.mode === 'lost') {
    // Held where it was, swaying a little, a little dimmer; the warmth stays.
    drift = glide(drift, LOST_DRIFT, dt, 1);
    level = glide(level, LOST_LEVEL, dt, 1.2);
    tau = 0.8;
  } else {
    const [wx, wy] = wander(t);
    ax = glide(ax, wx, dt, 3);
    ay = glide(ay, wy, dt, 3);
    drift = glide(drift, 0, dt, 1);
    level = glide(level, FREE_LEVEL, dt, 1.2);
    warmth = glide(warmth, 0.5, dt, 3);
    tau = 0.8;
  }
  const [sx, sy] = sway(t);
  const tx = ax + sx * drift;
  const ty = ay + sy * drift;
  let nx = glide(st.x, tx, dt, tau);
  let ny = glide(st.y, ty, dt, tau);
  // Never faster than MAX_LIGHT_SPEED: a hat seen again across the room glides there.
  const step = Math.hypot(nx - st.x, ny - st.y);
  const most = MAX_LIGHT_SPEED * Math.max(0, dt);
  if (step > most && step > 0) {
    nx = st.x + ((nx - st.x) * most) / step;
    ny = st.y + ((ny - st.y) * most) / step;
  }
  return { x: nx, y: ny, ax, ay, drift, level, warmth };
}

const WARM_GOLD: Rgb = [255, 190, 110];
const WHITE: Rgb = [255, 255, 255];

/** How the light looks: warmer, whiter and brighter as the Brightness goes up. */
export function lightGlow(st: LightState, tint: Rgb): { core: Rgb; edge: Rgb; alpha: number; radius: number } {
  const w = Math.max(0, Math.min(1, st.warmth));
  return {
    core: mix(mix(tint, WARM_GOLD, 0.55 * w), WHITE, 0.25 + 0.35 * w),
    edge: mix(tint, WARM_GOLD, 0.4 * w),
    alpha: st.level * (0.35 + 0.5 * w),
    /** Of the screen's smaller side. */
    radius: 0.42 + 0.12 * w,
  };
}

// ---- The pulse ----

/** No large area pulses faster than this (WCAG 2.3.1: no more than 3 flashes a second). */
export const MAX_PULSE_HZ = 3;
/** The slow breath while nothing plays. */
const BREATH_HZ = 0.12;

/**
 * How fast the light pulses: with the beat, halved (and halved again) whenever the beat is
 * faster than MAX_PULSE_HZ. At 240 a minute the beat is 4 a second and the light 2.
 */
export function pulseHz(bpm: number, playing: boolean): number {
  if (!playing || !(bpm > 0)) return BREATH_HZ;
  let hz = bpm / 60;
  while (hz > MAX_PULSE_HZ) hz /= 2;
  return hz;
}

/** The pulse moves on by its rate: a change of speed changes the pace, never the place. */
export function stepPulse(phase: number, hz: number, dt: number): number {
  const p = (phase + hz * Math.max(0, dt)) % 1;
  return p < 0 ? p + 1 : p;
}

/** 0..1 through the pulse: a smooth swell, never a flash. */
export const pulseLevel = (phase: number): number => 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);

// ---- The sound world's tint ----

const TINTS: Record<string, Rgb> = {
  none: [255, 226, 170], // a neutral white-gold
  warm: [255, 170, 80], // amber
  lofi: [214, 140, 160], // dusty rose
  ambient: [120, 170, 255], // soft blue
  electronic: [165, 110, 255], // violet
};

export function worldTint(world: string): Rgb {
  return [...(TINTS[world] ?? TINTS.none)] as Rgb;
}

/** A change of world glides over a few seconds (about 95 % in 3.5 s): it never cuts. */
export function glideTint(cur: Rgb, target: Rgb, dt: number): Rgb {
  return [glide(cur[0], target[0], dt, 1.2), glide(cur[1], target[1], dt, 1.2), glide(cur[2], target[2], dt, 1.2)];
}

// ---- Before and after the piece ----

/** How awake the board is before the piece and after it: dim, but there (audit A5: 0.22 was lost on a projector). */
export const DIM_PRESENCE = 0.4;
/** After the piece, or Stop: the slow fade back to the dim board. */
export const FADE_SEC = 8;
/** The first note: how quickly the board wakes up. */
const WAKE_SEC = 1.5;

/** Awake while the piece plays, from its first note, and only while the laptop is heard. */
export function isAwake(s: { playing: boolean; heard: boolean; connected: boolean }): boolean {
  return s.playing && s.heard && s.connected;
}

export function stepPresence(p: number, awake: boolean, dt: number): number {
  const d = Math.max(0, dt);
  return awake
    ? Math.min(1, p + ((1 - DIM_PRESENCE) / WAKE_SEC) * d)
    : Math.max(DIM_PRESENCE, p - ((1 - DIM_PRESENCE) / FADE_SEC) * d);
}

// ---- Blooms ----

export const BLOOM_SEC = 1.2;

/** A counter is this share of its square, as a radius (audit A5: 0.34 was small from the back). */
export const COUNTER_RADIUS = 0.42;


/**
 * A counter that blooms again too soon is left out (audit A6): about 3 times a second at
 * most, so no spot flashes faster than WCAG 2.3.1 allows, however fast the board plays.
 */
export const REBLOOM_MIN_GAP_SEC = 0.35;

/** Whether a counter last bloomed at `lastAt` (seconds) may bloom again at `now`. */
export function canRebloom(lastAt: number, now: number): boolean {
  return now - lastAt >= REBLOOM_MIN_GAP_SEC - 1e-9;
}

/**
 * How much light all the blooms may add together to any third of the screen, as a share of
 * the brightest it can be. WCAG 2.3.1 counts a flash only from a swing of 0.1 or more, so
 * with this under it a third of the screen cannot flash at all, however many counters
 * sound together; a few blooms glow as they always did.
 */
export const BLOOM_LIGHT_BUDGET = 0.06;

/**
 * The share of a third of the screen that one white counter's bloom lights at full glow,
 * with the swell at its largest: the halo (0.6 at the counter's edge, fading over 2.1
 * radii) and the brightened counter. An upper bound, so a bloom is never brighter than the
 * budget allows. `cell` is a square's side, in pixels.
 */
export function bloomShare(cell: number, width: number, height: number): number {
  const rr = Math.max(0, cell) * COUNTER_RADIUS * 1.32;
  const r0 = rr * 0.5;
  const d = rr * 2.1;
  const halo = (0.6 * Math.PI * d * (r0 + d + r0)) / 3;
  const disc = 0.4 * Math.PI * rr * rr;
  return (halo + disc) / Math.max(1, (width * height) / 3);
}

/**
 * The factor for every live bloom's glow (1 = leave it): the blooms are scaled down together
 * when what they add (each one's glow, its colour's brightness and `share`) would pass
 * BLOOM_LIGHT_BUDGET.
 */
export function bloomGlowScale(blooms: readonly { glow: number; colour: Rgb }[], share: number): number {
  let light = 0;
  for (const b of blooms) light += Math.max(0, b.glow) * luminance(bloomColour(b.colour, b.glow)) * share;
  return light > BLOOM_LIGHT_BUDGET ? BLOOM_LIGHT_BUDGET / light : 1;
}

/**
 * A counter's colour as it blooms: brighter, with the same hue and the same strength of
 * colour (audit A5: the white wash turned red to salmon and green to mint). The brightest
 * channel rises towards full, the others with it.
 */
export function bloomColour(rgb: Rgb, glow: number): Rgb {
  const g = Math.max(0, Math.min(1, glow));
  const top = Math.max(rgb[0], rgb[1], rgb[2]);
  if (g === 0 || top <= 0) return [rgb[0], rgb[1], rgb[2]];
  const gain = Math.min(1 + 0.45 * g, 255 / top);
  return [Math.min(255, rgb[0] * gain), Math.min(255, rgb[1] * gain), Math.min(255, rgb[2] * gain)];
}

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/** WCAG's contrast of one colour against another (1 = the same, 21 = black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The screen's own dark. */
export const AUDIENCE_BACKGROUND: Rgb = [5, 6, 10];

/** A counter this dark would vanish into the screen (audit A5), so it gets a thin light ring. */
export function counterNeedsRing(rgb: Rgb): boolean {
  return contrastRatio(rgb, AUDIENCE_BACKGROUND) < 3;
}

export interface BloomShape {
  /** How much the counter swells (1 = its own size). */
  scale: number;
  /** How much it brightens, 0..1. */
  glow: number;
  /** The ripple spreading from it: radius in counter radii, and how strong. Null: none. */
  ripple: { r: number; alpha: number } | null;
}

/**
 * A note's bloom, `age` seconds after it was heard: a quick swell and brightening that
 * settles, and a ripple spreading out. With less motion asked for (the system setting),
 * only the brightening.
 */
export function bloomAt(age: number, reduced: boolean): BloomShape | null {
  if (age < 0 || age > BLOOM_SEC) return null;
  const u = age / BLOOM_SEC;
  const env = u < 0.08 ? u / 0.08 : ((1 - u) / 0.92) ** 2;
  if (reduced) return { scale: 1, glow: env, ripple: null };
  const out = 1 - (1 - u) ** 3;
  return { scale: 1 + 0.32 * env, glow: env, ripple: { r: 1 + 2.2 * out, alpha: 0.55 * (1 - u) ** 1.5 } };
}

// ---- The band ----

/** The band light rises on a band note, but never more often than this (no flashing). */
const BAND_MIN_GAP_SEC = 1 / MAX_PULSE_HZ;

/** Whether a band note heard at `now` lifts the band light (the last lift was at `lastAt`). */
export function bandBump(lastAt: number, now: number): boolean {
  return now - lastAt >= BAND_MIN_GAP_SEC - 1e-9;
}

// ---- The board ----

/** The board, as big as the screen allows: square cells, centred, a margin round it. */
export function boardLayout(w: number, h: number, rows: number, cols: number): { x0: number; y0: number; cell: number } {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const cell = Math.max(1, Math.min((w * 0.92) / c, (h * 0.88) / r));
  return { x0: (w - cell * c) / 2, y0: (h - cell * r) / 2, cell };
}
