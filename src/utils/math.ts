/**
 * Mathematical utilities for vector operations and calculations
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

/**
 * Calculate Euclidean distance between two 2D points
 */
export function distance2D(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate Euclidean distance between two 3D points
 */
export function distance3D(a: Point3D, b: Point3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate velocity vector between two points over time
 */
export function velocity2D(from: Point2D, to: Point2D, deltaTime: number): Point2D {
  if (deltaTime === 0) return { x: 0, y: 0 };
  return {
    x: (to.x - from.x) / deltaTime,
    y: (to.y - from.y) / deltaTime,
  };
}

/**
 * Calculate the magnitude of a velocity vector
 */
export function velocityMagnitude(velocity: Point2D): number {
  return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
}

/**
 * Normalize a value from one range to another
 */
export function normalizeRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number = 0,
  outMax: number = 1
): number {
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + normalized * (outMax - outMin);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Convert MIDI note number to frequency in Hz
 */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Convert frequency in Hz to MIDI note number
 */
export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

/**
 * Calculate the centroid of multiple points
 */
export function centroid2D(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Calculate angle between two points in radians
 */
export function angleBetween(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Convert radians to degrees
 */
export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Convert degrees to radians
 */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
