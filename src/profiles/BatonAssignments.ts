/**
 * Baton-assignment persistence.
 *
 * Stores the per-colour-role mode + instrument choice (see
 * SongPresetEngine.BatonAssignment) under a dedicated localStorage key.
 *
 * Why a separate key rather than a field on InputProfile?  InputProfile
 * is shaped for MediaPipe tracking modalities (pose/hand/face/colour
 * config, gestures, smoothing).  Baton output assignments are about
 * which sound the baton makes, not how its input is captured — a
 * different concern that lives more naturally in its own store.
 *
 * InputProfileManager still exposes the persistence as a convenience
 * (see getBatonAssignments / saveBatonAssignments there) so callers
 * don't need to know about both modules.
 */

import type { ColorRole } from '../songs/songLibrary';
import type {
  BatonAssignment,
  BatonMode,
} from '../songs/SongPresetEngine';
import {
  DEFAULT_INSTRUMENT_KEY,
  INSTRUMENT_PALETTE_BY_KEY,
} from '../songs/voices/presets/instrumentPalette';

const STORAGE_KEY = 'admi-baton-assignments';

/** Map of role → assignment.  Roles not present default to parameter mode. */
export type BatonAssignments = Partial<Record<ColorRole, BatonAssignment>>;

const VALID_MODES: ReadonlySet<BatonMode> = new Set(['parameter', 'instrument']);
const SWITCHABLE_ROLES: ReadonlySet<ColorRole> = new Set([
  'red',
  'green',
  'yellow',
  'orange',
]);

/**
 * Load baton assignments from localStorage.
 *
 * Returns an empty object on any failure (missing key, malformed JSON,
 * invalid roles, unknown instrument keys).  The engine then falls back
 * to its built-in defaults, so a corrupt store can never break loading.
 */
export function loadBatonAssignments(): BatonAssignments {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    return sanitize(parsed as Record<string, unknown>);
  } catch (error) {
    console.warn('[BatonAssignments] Failed to load:', error);
    return {};
  }
}

/**
 * Save baton assignments to localStorage.  Unknown roles and invalid
 * fields are dropped silently — we never want a UI bug to poison the
 * stored profile.
 */
export function saveBatonAssignments(assignments: BatonAssignments): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitize(assignments as Record<string, unknown>);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('[BatonAssignments] Failed to save:', error);
  }
}

/** Remove all stored baton assignments (used by reset / clear flows). */
export function clearBatonAssignments(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[BatonAssignments] Failed to clear:', error);
  }
}

function sanitize(input: Record<string, unknown>): BatonAssignments {
  const out: BatonAssignments = {};
  for (const [role, value] of Object.entries(input)) {
    if (!SWITCHABLE_ROLES.has(role as ColorRole)) continue;
    if (typeof value !== 'object' || value === null) continue;

    const v = value as { mode?: unknown; instrumentKey?: unknown };
    const mode: BatonMode = VALID_MODES.has(v.mode as BatonMode)
      ? (v.mode as BatonMode)
      : 'parameter';
    const rawKey = typeof v.instrumentKey === 'string' ? v.instrumentKey : '';
    const instrumentKey =
      rawKey && INSTRUMENT_PALETTE_BY_KEY[rawKey]
        ? rawKey
        : DEFAULT_INSTRUMENT_KEY;

    out[role as ColorRole] = { mode, instrumentKey };
  }
  return out;
}
