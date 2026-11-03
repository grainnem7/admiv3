/**
 * The piece as a grid (grid investigation, G2): rows are the kept loops, columns are the
 * timed scenes in order, a dot where a loop plays in a scene. Pure helpers for the layout
 * and the keyboard, so the picture is tested without a DOM.
 */
import type { Scene } from './launcher';

export interface GridColumn {
  /** The scene's index in the piece's list. */
  i: number;
  id: string;
  name: string;
  at: number;
  /** Where the column starts and how wide it is, as a share of the piece (percent). */
  leftPct: number;
  widthPct: number;
  current: boolean;
}

/** The columns: every timed scene inside the length, as wide as its share, as the timeline draws them. */
export function gridColumns(scenes: readonly Scene[], lengthSec: number, currentScene: number | null): GridColumn[] {
  const out: GridColumn[] = [];
  if (lengthSec <= 0) return out;
  scenes.forEach((s, i) => {
    if (typeof s.at !== 'number' || s.at >= lengthSec) return;
    const nextAt = scenes.slice(i + 1).map((x) => x.at).find((t): t is number => typeof t === 'number') ?? lengthSec;
    const widthPct = Math.max(2, ((Math.min(lengthSec, nextAt) - s.at) / lengthSec) * 100);
    out.push({ i, id: s.id, name: s.name, at: s.at, leftPct: (s.at / lengthSec) * 100, widthPct, current: currentScene === i });
  });
  return out;
}

/** Whether a loop plays in a scene. */
export function cellOn(scene: Pick<Scene, 'loops'>, slot: number): boolean {
  return scene.loops.includes(slot);
}

/** The scene's loops with one slot turned on or off. */
export function toggledLoops(scene: Pick<Scene, 'loops'>, slot: number): number[] {
  return cellOn(scene, slot) ? scene.loops.filter((x) => x !== slot) : [...scene.loops, slot].sort((a, b) => a - b);
}

/** A cell's name for a screen reader; on or off is its pressed state. */
export function cellLabel(loopName: string, sceneName: string): string {
  return `${loopName} in ${sceneName}`;
}

export interface CellPos { r: number; c: number }

/** Where an arrow key, Home or End takes the focus in a grid of `rows` by `cols`; null for any other key. */
export function moveCell(pos: CellPos, key: string, rows: number, cols: number): CellPos | null {
  if (rows <= 0 || cols <= 0) return null;
  const clamp = (p: CellPos): CellPos => ({ r: Math.max(0, Math.min(rows - 1, p.r)), c: Math.max(0, Math.min(cols - 1, p.c)) });
  switch (key) {
    case 'ArrowUp': return clamp({ r: pos.r - 1, c: pos.c });
    case 'ArrowDown': return clamp({ r: pos.r + 1, c: pos.c });
    case 'ArrowLeft': return clamp({ r: pos.r, c: pos.c - 1 });
    case 'ArrowRight': return clamp({ r: pos.r, c: pos.c + 1 });
    case 'Home': return clamp({ r: pos.r, c: 0 });
    case 'End': return clamp({ r: pos.r, c: cols - 1 });
    default: return null;
  }
}
