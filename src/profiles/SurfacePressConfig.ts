/**
 * Surface-press configuration persistence.
 *
 * Stores the per-key colour + instrument and the press/release distance
 * thresholds under a dedicated localStorage key — mirroring the
 * BatonAssignments pattern (separate key, sanitised on load, exposed via
 * InputProfileManager). A corrupt store can never break loading: any
 * failure yields null and the screen falls back to "not yet calibrated".
 *
 * Note there is no geometry here: each tube's line is derived LIVE from its
 * colour blob's principal axis (see ColorTracker / SurfacePressMode), so the
 * only thing worth persisting per key is which colour it is and which
 * instrument it plays.
 */

import type { TrackedColor } from '../tracking/ColorTracker';
import {
  DEFAULT_INSTRUMENT_KEY,
  INSTRUMENT_PALETTE_BY_KEY,
} from '../songs/voices/presets/instrumentPalette';

const STORAGE_KEY = 'admi-surface-press';

export interface SurfaceKeyStored {
  /** Stable key id, e.g. "press-1". Own namespace, NOT a baton ColorRole. */
  id: string;
  /** Instrument played when this key is pressed (palette key). */
  instrumentKey: string;
  /** Calibrated colour used to locate + track the tube. */
  color: TrackedColor;
}

export interface SurfacePressStored {
  enabled: boolean;
  /** Press fires when a finger is within this normalised distance of a tube. */
  touchDist: number;
  /** Release when the finger pulls beyond this distance (> touchDist). */
  releaseDist: number;
  /** Press needs visible area ≤ this fraction of baseline (finger covering it). */
  occlusionEnter: number;
  /** Release once visible area recovers ≥ this fraction of baseline. */
  occlusionExit: number;
  /** Velocity for a press. */
  defaultVelocity: number;
  keys: SurfaceKeyStored[];
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

  if (!Array.isArray(o.keys)) return null;

  const keys: SurfaceKeyStored[] = [];
  for (const k of o.keys) {
    if (typeof k !== 'object' || k === null) continue;
    const ko = k as Record<string, unknown>;
    const color = ko.color as Record<string, unknown> | undefined;
    if (typeof ko.id !== 'string' || !color) continue;
    const instrumentKey =
      typeof ko.instrumentKey === 'string' && INSTRUMENT_PALETTE_BY_KEY[ko.instrumentKey]
        ? ko.instrumentKey
        : DEFAULT_INSTRUMENT_KEY;
    const region = color.searchRegion as Record<string, unknown> | undefined;
    const searchRegion =
      region && isNum(region.minX) && isNum(region.minY) && isNum(region.maxX) && isNum(region.maxY)
        ? { minX: region.minX, minY: region.minY, maxX: region.maxX, maxY: region.maxY }
        : undefined;
    keys.push({
      id: ko.id,
      instrumentKey,
      color: {
        id: typeof color.id === 'string' ? color.id : ko.id,
        hue: isNum(color.hue) ? color.hue : 0,
        hueTolerance: isNum(color.hueTolerance) ? color.hueTolerance : 15,
        minSaturation: isNum(color.minSaturation) ? color.minSaturation : 30,
        minValue: isNum(color.minValue) ? color.minValue : 30,
        minArea: isNum(color.minArea) ? color.minArea : 0.0005,
        ...(searchRegion ? { searchRegion } : {}),
      },
    });
  }

  return {
    enabled: o.enabled === true,
    touchDist: isNum(o.touchDist) ? o.touchDist : 0.06,
    releaseDist: isNum(o.releaseDist) ? o.releaseDist : 0.1,
    occlusionEnter: isNum(o.occlusionEnter) ? o.occlusionEnter : 0.65,
    occlusionExit: isNum(o.occlusionExit) ? o.occlusionExit : 0.85,
    defaultVelocity: isNum(o.defaultVelocity) ? o.defaultVelocity : 0.7,
    keys,
  };
}
