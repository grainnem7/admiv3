/**
 * Where the control and loop counters live.
 *
 * Both used to be fixed: a control colour worked anywhere, and the loop pads were always
 * the bottom row. Neither suits every player — a volume counter parked mid-pattern is
 * also sitting on a note, and for someone seated at the low-notes edge the bottom row is
 * the row furthest from their hand. A lane is a placement, not a calibration, so it can
 * be moved at any time, and cells inside a lane never play the pattern.
 */
export type ZoneMode = 'anywhere' | 'row' | 'col' | 'off';

export interface Zone {
  mode: ZoneMode;
  /** Which row or column the lane is, when the mode is 'row' or 'col'. */
  index: number;
}

export const ANYWHERE: Zone = { mode: 'anywhere', index: 0 };
export const NO_ZONE: Zone = { mode: 'off', index: 0 };

/** True when the cell lies in this lane. 'anywhere' and 'off' claim no cells. */
export function zoneContains(zone: Zone, cell: { row: number; col: number }): boolean {
  if (zone.mode === 'row') return cell.row === zone.index;
  if (zone.mode === 'col') return cell.col === zone.index;
  return false;
}

/** How many pads a lane holds. */
export function zoneSlotCount(zone: Zone, rows: number, cols: number): number {
  if (zone.mode === 'row') return cols;
  if (zone.mode === 'col') return rows;
  return 0;
}

/** Which pad along the lane this cell is, or −1 when it isn't in the lane. */
export function zoneSlotOf(zone: Zone, cell: { row: number; col: number }, rows: number): number {
  if (!zoneContains(zone, cell)) return -1;
  // A column lane counts from the bottom, so slot 1 is nearest the player's hand and
  // matches the "low notes at the bottom" the rest of the board already uses.
  return zone.mode === 'row' ? cell.col : rows - 1 - cell.row;
}

/** Which cell a pad sits in — the inverse of `zoneSlotOf`. Null when out of range. */
export function zoneCellOf(
  zone: Zone, slot: number, rows: number, cols: number,
): { row: number; col: number } | null {
  if (slot < 0 || slot >= zoneSlotCount(zone, rows, cols)) return null;
  if (zone.mode === 'row') return { row: zone.index, col: slot };
  if (zone.mode === 'col') return { row: rows - 1 - slot, col: zone.index };
  return null;
}

/**
 * How far along its lane a counter sits, 0…1, from a centroid in unit board coordinates.
 * A row lane reads left → right; a column lane reads bottom → top.
 */
export function zonePosition(zone: Zone, centroid: { x: number; y: number }): number {
  const v = zone.mode === 'row' ? centroid.x : 1 - centroid.y;
  return Math.max(0, Math.min(1, v));
}

export interface ZoneSplit<T> {
  pattern: T[];
  controls: T[];
  pads: T[];
}

/**
 * Split this frame's cells by lane. A cell in a lane is never part of the pattern, so a
 * lane can't make a stray note; if both lanes somehow name the same cell, controls win
 * (the UI stops them being set the same).
 */
export function splitByZone<T extends { row: number; col: number }>(
  cells: readonly T[], controlZone: Zone, loopZone: Zone,
): ZoneSplit<T> {
  const pattern: T[] = [];
  const controls: T[] = [];
  const pads: T[] = [];
  for (const cell of cells) {
    if (zoneContains(controlZone, cell)) controls.push(cell);
    else if (zoneContains(loopZone, cell)) pads.push(cell);
    else pattern.push(cell);
  }
  return { pattern, controls, pads };
}

/** A lane's name, for the legend and the board view's label. */
export function describeZone(zone: Zone): string {
  if (zone.mode === 'row') return `row ${zone.index + 1}`;
  if (zone.mode === 'col') return `step ${zone.index + 1}`;
  if (zone.mode === 'anywhere') return 'anywhere on the board';
  return 'off';
}

/** Keep a lane inside the grid after a rows/steps change. */
/**
 * True when one lane swallows the other entirely. Controls win where lanes meet
 * (splitByZone takes them first), so a loop lane underneath one is completely dead: no
 * pad ever fires, while the board still paints them as pads.
 *
 * A row crossing a column is NOT this. They meet at a single cell, which belongs to the
 * controls and costs one pad — a sensible layout (controls down one side, pads along the
 * bottom) that must not be refused. Nor is "anywhere", which claims no cells at all.
 */
export function zonesCollide(a: Zone, b: Zone): boolean {
  // Only a named lane claims cells. "Anywhere" means controls are recognised by their
  // COLOUR wherever they are put (zoneContains is false for it), so it takes no cells
  // from anyone; "off" takes none either.
  const lane = (z: Zone): boolean => z.mode === 'row' || z.mode === 'col';
  if (!lane(a) || !lane(b)) return false;
  return a.mode === b.mode && a.index === b.index;
}

export function clampZone(zone: Zone, rows: number, cols: number): Zone {
  if (zone.mode === 'row') return { mode: 'row', index: Math.max(0, Math.min(rows - 1, zone.index)) };
  if (zone.mode === 'col') return { mode: 'col', index: Math.max(0, Math.min(cols - 1, zone.index)) };
  return zone;
}
