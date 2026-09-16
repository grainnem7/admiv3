/**
 * Safe control counters, as a pure step.
 *
 * A control counter (volume, reverb, delay, tone, tempo, or a toggle colour) is read
 * from the RAW per-frame readings rather than the 600 ms settle, so a slide follows the
 * hand — but a value only commits after `controlStillMs` of stillness, and only when it
 * has moved by more than the hysteresis band. The value itself comes from the counter's
 * position on the BOARD (its centroid along the fader axis), not the cell index, so a
 * 4 × 4 grid still gives a smooth fader. The outermost end zones snap to exactly 0/1 so
 * the ends are always reachable. When the counter leaves, the control holds its last
 * value by default — a lifted counter must never mean sudden silence.
 */
import type { CellReading } from './BoardSequencerMode';
import type { ColourChannel, ColourRole } from './boardColours';
import { isFaderRole, isToggleRole } from './boardColours';
import type { ControlRange, ControlRemoval, FaderRole } from '../profiles/BoardSequencerConfig';
import { zoneContains, zonePosition, type Zone } from './zones';

/** A move smaller than this never commits, so a resting hand can't dither the value. */
export const CONTROL_HYSTERESIS = 0.05;
/** The outermost band (in board squares) that reads as exactly 0 or 1. */
export const CONTROL_END_SNAP_SQUARES = 0.3;

export interface ControlsConfig {
  faderAxis: 'row' | 'col';
  boardSquares: number;
  controlStillMs: number;
  controlReturnMs: number;
  controlRanges: Record<FaderRole, ControlRange>;
  controlRemoval: Record<FaderRole, ControlRemoval>;
  /** Normalised position each fader returns to under 'default' removal (0 when unset). */
  defaults?: Partial<Record<FaderRole, number>>;
  /**
   * Where control counters live. In a lane, the value is read ALONG the lane and a
   * control counter outside it is ignored, so a stray volume counter in the middle of
   * the pattern does nothing rather than something surprising.
   */
  zone?: Zone;
  /**
   * Colours whose counter is under a hand. The hand guard's whole premise is that a
   * covered counter is still there, so its value holds instead of being treated as gone.
   */
  heldColours?: ReadonlySet<string>;
}

export interface RoleState {
  /** Committed position 0..1, or null while the control has never been set. */
  position: number | null;
  candidate: number | null;
  stillMs: number;
  missingMs: number;
  /** Committed toggle state and its own debounce. */
  on: boolean;
  onCandidate: boolean | null;
  onStillMs: number;
}

/** Per channel id, so each counter keeps its own debounce and hold. */
export type ControlState = Record<string, RoleState>;

export interface ControlsResult {
  state: ControlState;
  /** Final values, mapped through each control's range. */
  values: Partial<Record<FaderRole, number>>;
  /** Raw committed positions 0..1, before the range is applied (for the legend). */
  positions: Partial<Record<FaderRole, number>>;
  toggles: Partial<Record<ColourRole, boolean>>;
  /** Roles whose counter is off the board but whose value still stands. */
  held: Set<ColourRole>;
}

export function initialControlState(): ControlState {
  return {};
}

const freshRole = (): RoleState => ({
  position: null, candidate: null, stillMs: 0, missingMs: 0, on: false, onCandidate: null, onStillMs: 0,
});

/** A centroid (unit board coords) as a fader position, with the end zones snapped. */
export function faderPositionFromCentroid(
  centroid: { x: number; y: number }, axis: 'row' | 'col', boardSquares: number,
): number {
  // The row axis runs up the board: the far edge is the top of the fader.
  const raw = axis === 'row' ? 1 - centroid.y : centroid.x;
  const snap = CONTROL_END_SNAP_SQUARES / Math.max(1, boardSquares);
  if (raw <= snap) return 0;
  if (raw >= 1 - snap) return 1;
  return Math.max(0, Math.min(1, raw));
}

/** The highest position among this colour's counters this frame, or null when it's absent. */
export function rawFaderPosition(
  readings: CellReading[], colour: string,
  cfg: Pick<ControlsConfig, 'faderAxis' | 'boardSquares' | 'zone'>,
): number | null {
  const zone = cfg.zone;
  const inLane = zone !== undefined && (zone.mode === 'row' || zone.mode === 'col');
  let best: number | null = null;
  for (const r of readings) {
    if (!r.occupied || r.colour !== colour || !r.centroid) continue;
    if (inLane && !zoneContains(zone, r)) continue;
    const p = inLane
      ? zonePosition(zone, r.centroid)
      : faderPositionFromCentroid(r.centroid, cfg.faderAxis, cfg.boardSquares);
    if (best === null || p > best) best = p;
  }
  return best;
}

function present(readings: CellReading[], colour: string, zone?: Zone): boolean {
  const inLane = zone !== undefined && (zone.mode === 'row' || zone.mode === 'col');
  return readings.some((r) => r.occupied && r.colour === colour && (!inLane || zoneContains(zone, r)));
}

function stepFader(
  st: RoleState, raw: number | null, role: FaderRole, cfg: ControlsConfig, dtMs: number,
  covered = false,
): boolean {
  if (raw === null && covered) {
    // Under a hand: not a new reading, and not a removal either.
    st.candidate = null;
    st.stillMs = 0;
    return st.position !== null;
  }
  if (raw === null) {
    st.candidate = null;
    st.stillMs = 0;
    st.missingMs += dtMs;
    const removal: ControlRemoval = cfg.controlRemoval[role] ?? 'hold';
    if (removal === 'zero') {
      st.position = 0;
      return false;
    }
    if (removal === 'default' && st.missingMs >= cfg.controlReturnMs) {
      st.position = cfg.defaults?.[role] ?? 0;
      return false;
    }
    return st.position !== null; // holding the last value
  }
  st.missingMs = 0;
  if (st.candidate === null || Math.abs(raw - st.candidate) > CONTROL_HYSTERESIS) {
    st.stillMs = 0;
  } else {
    st.stillMs += dtMs;
  }
  st.candidate = raw;
  if (st.stillMs >= cfg.controlStillMs
    && (st.position === null || Math.abs(raw - st.position) >= CONTROL_HYSTERESIS)) {
    st.position = raw;
  }
  return false;
}

function stepToggle(st: RoleState, on: boolean, cfg: ControlsConfig, dtMs: number): void {
  if (st.onCandidate === on) st.onStillMs += dtMs;
  else { st.onCandidate = on; st.onStillMs = 0; }
  if (st.onStillMs >= cfg.controlStillMs) st.on = on;
}

/**
 * Advance every control colour by one camera frame. Pure: `prev` is not mutated.
 */
export function stepControls(
  prev: ControlState, readings: CellReading[], channels: ColourChannel[], cfg: ControlsConfig, dtMs: number,
): ControlsResult {
  const state: ControlState = {};
  const values: Partial<Record<FaderRole, number>> = {};
  const positions: Partial<Record<FaderRole, number>> = {};
  const toggles: Partial<Record<ColourRole, boolean>> = {};
  const held = new Set<ColourRole>();

  for (const ch of channels) {
    if (!isFaderRole(ch.role) && !isToggleRole(ch.role)) continue;
    const st: RoleState = { ...(prev[ch.id] ?? freshRole()) };
    state[ch.id] = st;
    if (isToggleRole(ch.role)) {
      // A covered toggle counter is still on the board, so it stays on.
      stepToggle(st, present(readings, ch.id, cfg.zone) || cfg.heldColours?.has(ch.id) === true, cfg, dtMs);
      toggles[ch.role] = st.on;
      continue;
    }
    const role = ch.role as FaderRole;
    const isHeld = stepFader(
      st, rawFaderPosition(readings, ch.id, cfg), role, cfg, dtMs, cfg.heldColours?.has(ch.id) === true,
    );
    if (isHeld) held.add(role);
    if (st.position !== null) {
      const range = cfg.controlRanges[role];
      positions[role] = st.position;
      values[role] = range ? range.min + st.position * (range.max - range.min) : st.position;
    }
  }
  return { state, values, positions, toggles, held };
}
