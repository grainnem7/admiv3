/**
 * Surface-press configuration persistence.
 *
 * Stores the calibrated surface line, per-user thresholds, and per-button
 * colour + instrument under a dedicated localStorage key — mirroring the
 * BatonAssignments pattern (separate key, sanitised on load, exposed via
 * InputProfileManager). A corrupt store can never break loading: any
 * failure yields null and the screen falls back to "not yet calibrated".
 */

import type { TrackedColor } from '../tracking/ColorTracker';
import {
  DEFAULT_INSTRUMENT_KEY,
  INSTRUMENT_PALETTE_BY_KEY,
} from '../songs/voices/presets/instrumentPalette';

const STORAGE_KEY = 'admi-surface-press';

export interface SurfacePressButtonStored {
  id: string;
  x: number;
  minBlobArea: number;
  instrumentKey: string;
  color: TrackedColor;
}

export interface SurfacePressStored {
  enabled: boolean;
  surface: { a: number; b: number; points: { x: number; y: number }[] };
  pressGap: number;
  releaseGap: number;
  descentForFullVelocity: number;
  defaultVelocity: number;
  /** Colour-blob bottom edge (false) vs HandDetector fingertip (true). */
  useFingertip: boolean;
  /**
   * How close (in normalised x) the pressing finger must be to a key's
   * centre to count as "over" that key. Half the spacing between adjacent
   * keys is a good value; calibratable per setup.
   */
  keyZoneHalfWidth: number;
  buttons: SurfacePressButtonStored[];
}

export function loadSurfacePressConfig(): SurfacePressStored | null {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return sanitize(parsed);
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to load:', error);
    return null;
  }
}

export function saveSurfacePressConfig(config: SurfacePressStored): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitize(config);
    if (!clean) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to save:', error);
  }
}

export function clearSurfacePressConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to clear:', error);
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitize(input: unknown): SurfacePressStored | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  const surface = o.surface as Record<string, unknown> | undefined;
  if (!surface || !isNum(surface.a) || !isNum(surface.b) || !Array.isArray(surface.points)) {
    return null;
  }
  const points = surface.points
    .filter((p): p is { x: number; y: number } =>
      typeof p === 'object' &&
      p !== null &&
      isNum((p as Record<string, unknown>).x) &&
      isNum((p as Record<string, unknown>).y),
    )
    .map((p) => ({ x: p.x, y: p.y }));

  const buttonsRaw = Array.isArray(o.buttons) ? o.buttons : [];
  const buttons: SurfacePressButtonStored[] = [];
  for (const b of buttonsRaw) {
    if (typeof b !== 'object' || b === null) continue;
    const bo = b as Record<string, unknown>;
    const color = bo.color as Record<string, unknown> | undefined;
    if (typeof bo.id !== 'string' || !isNum(bo.x) || !color) continue;
    const key =
      typeof bo.instrumentKey === 'string' && INSTRUMENT_PALETTE_BY_KEY[bo.instrumentKey]
        ? bo.instrumentKey
        : DEFAULT_INSTRUMENT_KEY;
    buttons.push({
      id: bo.id,
      x: bo.x,
      minBlobArea: isNum(bo.minBlobArea) ? bo.minBlobArea : 0.0005,
      instrumentKey: key,
      color: {
        id: typeof color.id === 'string' ? color.id : bo.id,
        hue: isNum(color.hue) ? color.hue : 0,
        hueTolerance: isNum(color.hueTolerance) ? color.hueTolerance : 15,
        minSaturation: isNum(color.minSaturation) ? color.minSaturation : 30,
        minValue: isNum(color.minValue) ? color.minValue : 30,
        minArea: isNum(color.minArea) ? color.minArea : 0.0005,
      },
    });
  }

  return {
    enabled: o.enabled === true,
    surface: { a: surface.a, b: surface.b, points },
    pressGap: isNum(o.pressGap) ? o.pressGap : 0,
    releaseGap: isNum(o.releaseGap) ? o.releaseGap : 0.1,
    descentForFullVelocity: isNum(o.descentForFullVelocity) ? o.descentForFullVelocity : 0.1,
    defaultVelocity: isNum(o.defaultVelocity) ? o.defaultVelocity : 0.6,
    useFingertip: o.useFingertip === true,
    keyZoneHalfWidth: isNum(o.keyZoneHalfWidth) ? o.keyZoneHalfWidth : 0.06,
    buttons,
  };
}
