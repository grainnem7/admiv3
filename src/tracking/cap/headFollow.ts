/**
 * Following the way the head points, with the hat as backup (owner, 4 Nov 2026). The face
 * tracking already running for the face check also tells which way the head is turned and
 * tipped, from the shape of the face: no colour, no light, no hat peak, and a turn is never
 * read as a nod. Its one weak moment is a deep bow, when the camera sees the top of the head
 * and the face is lost; but that is exactly when the hat sits low, so a bow takes the
 * up-and-down control to the bottom of its range instead of holding.
 *
 * Positions are 0..1 like the hat's place in the picture (across: turned to the player's
 * right is further right in a mirrored picture; up and down: tipped down is further down),
 * so the reach, the glide, the holds and the Lock all work on them unchanged.
 */

import type { AxisRange } from '../../remix/batonCalibration';
import type { CapSighting } from './capTracker';

/** MediaPipe face landmarks used: the nose tip, the face's two sides, the brow and the chin. */
export const NOSE = 1;
export const LEFT_EDGE = 234;
export const RIGHT_EDGE = 454;
export const BROW = 10;
export const CHIN = 152;

/** How far the nose sits off the face's middle (as a share of its width or height), to 0..1. */
const TURN_GAIN = 2;
const TIP_GAIN = 2;

export interface HeadPose { x: number; y: number }

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Which way the head points, from the face's landmarks: 0.5, 0.5 looking straight ahead.
 * `flipX` as for faceBoxFromLandmarks (the points come mirrored; flip when the picture isn't).
 */
export function headPoseFromLandmarks(points: readonly { x: number; y: number }[], flipX: boolean): HeadPose | null {
  if (points.length <= Math.max(NOSE, LEFT_EDGE, RIGHT_EDGE, BROW, CHIN)) return null;
  const x = (i: number): number => (flipX ? 1 - points[i].x : points[i].x);
  const width = Math.abs(x(RIGHT_EDGE) - x(LEFT_EDGE));
  const height = Math.abs(points[CHIN].y - points[BROW].y);
  if (width < 1e-4 || height < 1e-4) return null;
  const turn = (x(NOSE) - (x(LEFT_EDGE) + x(RIGHT_EDGE)) / 2) / width;
  const tip = (points[NOSE].y - (points[BROW].y + points[CHIN].y) / 2) / height;
  return { x: clamp01(0.5 + turn * TURN_GAIN), y: clamp01(0.5 + tip * TIP_GAIN) };
}

/** Where the bottom of the nod is, and from where a lost face counts as a bow. */
export interface HeadBounds { bottom: number; low: number }

/** From the learnt up-and-down range (or the whole range): "low" is its lowest 30%. */
export function headBounds(reachY: AxisRange | null): HeadBounds {
  const min = reachY?.min ?? 0;
  const max = reachY?.max ?? 1;
  return { bottom: max, low: min + 0.7 * (max - min) };
}

export interface HeadFollowState {
  /** The head's last pose, while the face was seen. */
  lastPose: HeadPose | null;
  /** Where the hat was in the picture when the face was last seen. */
  hatWhenSeen: number | null;
  /** Lost in a bow: stays at the bottom until the face is back. */
  bowed: boolean;
}

export const initialHeadFollow = (): HeadFollowState => ({ lastPose: null, hatWhenSeen: null, bowed: false });

/** The hat this much lower in the picture than when the face was last seen: the head went down. */
const BOW_DROP = 0.05;

export interface HeadFollowReading {
  sighting: CapSighting | null;
  /** 'head': the face. 'bow': the face lost in a bow, at the bottom. 'none': holding. */
  source: 'head' | 'bow' | 'none';
  state: HeadFollowState;
}

/**
 * One frame. The face seen: the head. The face lost and either the hat has dropped since, or
 * the head was already low in its nod: a bow, so up and down goes to the bottom (side to side
 * holds where it was), and stays there until the face is back. Otherwise: nothing, so the
 * values hold (someone walked in front, or the head turned right away).
 */
export function followHead(pose: HeadPose | null, hat: CapSighting | null, st: HeadFollowState, b: HeadBounds): HeadFollowReading {
  if (pose) {
    return {
      sighting: { x: pose.x, y: pose.y, area: 0 },
      source: 'head',
      state: { lastPose: pose, hatWhenSeen: hat ? hat.y : st.hatWhenSeen, bowed: false },
    };
  }
  const last = st.lastPose;
  if (!last) return { sighting: null, source: 'none', state: st };
  const dropped = hat !== null && st.hatWhenSeen !== null && hat.y > st.hatWhenSeen + BOW_DROP;
  if (st.bowed || dropped || last.y >= b.low) {
    return { sighting: { x: last.x, y: b.bottom, area: 0 }, source: 'bow', state: { ...st, bowed: true } };
  }
  return { sighting: null, source: 'none', state: st };
}
