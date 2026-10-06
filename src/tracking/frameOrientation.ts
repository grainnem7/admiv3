/**
 * How the camera picture is turned and flipped before anyone looks at it.
 *
 * The displayed picture is the raw camera frame turned clockwise by `rotation` quarter
 * turns, THEN mirrored. Everything that reads pixels or maps a tap — the preview, the
 * board reader, board and colour finding, tap sampling — goes through these helpers, so a
 * corner tapped on screen and the pixels read for it can never disagree.
 *
 * Mirroring after turning means the two flip switches always act on what the player sees:
 * "flip left to right" flips the picture on screen whichever way the camera is mounted.
 */

export type QuarterTurns = 0 | 1 | 2 | 3;

export interface FrameOrientation {
  mirrorX: boolean;
  mirrorY: boolean;
  /** Clockwise quarter turns applied before mirroring. */
  rotation?: QuarterTurns;
}

export interface Fraction {
  x: number;
  y: number;
}

/** Normalise any whole number of quarter turns to 0–3. */
export function quarterTurns(n: unknown): QuarterTurns {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return (((v % 4) + 4) % 4) as QuarterTurns;
}

/** The displayed picture's size for a raw frame of w × h. */
export function orientedSize(w: number, h: number, rotation: QuarterTurns = 0): { width: number; height: number } {
  return rotation % 2 === 1 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Draw `source` (raw camera orientation) into a context whose canvas is `outW` × `outH`
 * in DISPLAYED orientation, scaling to fill it.
 */
export function drawOriented(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  outW: number,
  outH: number,
  o: FrameOrientation,
): void {
  const r = o.rotation ?? 0;
  // The raw picture's size once scaled: a quarter turn swaps which side is which.
  const rawW = r % 2 === 1 ? outH : outW;
  const rawH = r % 2 === 1 ? outW : outH;
  ctx.save();
  // Canvas transforms apply to the drawing in reverse order: mirror (in displayed space)
  // is set first so it happens last.
  ctx.translate(o.mirrorX ? outW : 0, o.mirrorY ? outH : 0);
  ctx.scale(o.mirrorX ? -1 : 1, o.mirrorY ? -1 : 1);
  if (r === 1) { ctx.translate(outW, 0); ctx.rotate(Math.PI / 2); }
  else if (r === 2) { ctx.translate(outW, outH); ctx.rotate(Math.PI); }
  else if (r === 3) { ctx.translate(0, outH); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(source, 0, 0, rawW, rawH);
  ctx.restore();
}

/** One clockwise quarter turn of a fraction of the frame. */
const turnCw = (p: Fraction): Fraction => ({ x: 1 - p.y, y: p.x });
/** One anticlockwise quarter turn. */
const turnCcw = (p: Fraction): Fraction => ({ x: p.y, y: 1 - p.x });
const mirror = (p: Fraction, o: FrameOrientation): Fraction => ({
  x: o.mirrorX ? 1 - p.x : p.x,
  y: o.mirrorY ? 1 - p.y : p.y,
});

/** A point in the raw camera frame, as a fraction, to where it is displayed. */
export function rawToDisplayed(p: Fraction, o: FrameOrientation): Fraction {
  let q = p;
  for (let i = 0; i < (o.rotation ?? 0); i++) q = turnCw(q);
  return mirror(q, o);
}

/** A displayed point, as a fraction, back to the raw camera frame. */
export function displayedToRaw(p: Fraction, o: FrameOrientation): Fraction {
  let q = mirror(p, o);
  for (let i = 0; i < (o.rotation ?? 0); i++) q = turnCcw(q);
  return q;
}

/**
 * Re-express displayed points after the orientation changes, so they stay on the same
 * physical spot — the board's corners must not be left where the board used to appear.
 */
export function reorientPoints<T extends Fraction>(
  points: readonly T[], from: FrameOrientation, to: FrameOrientation,
): T[] {
  return points.map((p) => ({ ...p, ...rawToDisplayed(displayedToRaw(p, from), to) }));
}
