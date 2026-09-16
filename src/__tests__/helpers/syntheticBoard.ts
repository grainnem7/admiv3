/**
 * A synthetic board picture for the hand-guard tests: a plain board, counters placed on
 * it, and a hand or arm drawn as a rectangle that can either reach in from outside
 * (as a real arm must) or float wholly inside the squares (as only a counter can).
 *
 * Deliberately simple: the point of the watcher is *where* a difference starts, not what
 * it looks like, so a flat rectangle is a fair stand-in for an arm.
 */
export interface SyntheticFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  downscale: number;
}

export interface Rect {
  /** Board coordinates: 0..1 across the playing squares; negative reaches off the board. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rgb: [number, number, number];
}

export const BOARD_RGB: [number, number, number] = [120, 96, 70];
/** The board's dark squares, so "plain board" isn't a flat colour. */
export const DARK_RGB: [number, number, number] = [70, 54, 40];

export interface SceneOptions {
  width?: number;
  height?: number;
  /** Where the playing squares sit in the picture, as fractions of the frame. */
  boardBox?: { x: number; y: number; w: number; h: number };
  squares?: number;
  shapes?: Rect[];
  /** Multiplies every pixel, to fake an exposure dip. */
  gain?: number;
  /** Adds the same value to every pixel, to fake a bump-free lighting lift. */
  lift?: number;
}

const DEFAULT_BOX = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

/** Build one frame. Board coordinates map linearly onto `boardBox`. */
export function scene(opts: SceneOptions = {}): SyntheticFrame {
  const width = opts.width ?? 80;
  const height = opts.height ?? 60;
  const box = opts.boardBox ?? DEFAULT_BOX;
  const squares = opts.squares ?? 8;
  const data = new Uint8ClampedArray(width * height * 4);
  const gain = opts.gain ?? 1;
  const lift = opts.lift ?? 0;

  const toBoard = (px: number, py: number): { u: number; v: number } => ({
    u: (px / width - box.x) / box.w,
    v: (py / height - box.y) / box.h,
  });

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const { u, v } = toBoard(px, py);
      let rgb: [number, number, number];
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        const sq = (Math.floor(u * squares) + Math.floor(v * squares)) % 2;
        rgb = sq === 0 ? BOARD_RGB : DARK_RGB;
      } else {
        rgb = [30, 30, 34]; // the table around the board
      }
      for (const s of opts.shapes ?? []) {
        if (u >= s.x0 && u <= s.x1 && v >= s.y0 && v <= s.y1) rgb = s.rgb;
      }
      const i = (py * width + px) * 4;
      data[i] = rgb[0] * gain + lift;
      data[i + 1] = rgb[1] * gain + lift;
      data[i + 2] = rgb[2] * gain + lift;
      data[i + 3] = 255;
    }
  }
  return { data, width, height, downscale: 1 };
}

/** The homography that maps the unit board onto `boardBox` in this frame. */
export function sceneCorners(
  opts: SceneOptions = {},
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const width = opts.width ?? 80;
  const height = opts.height ?? 60;
  const box = opts.boardBox ?? DEFAULT_BOX;
  const x0 = box.x * width;
  const y0 = box.y * height;
  const x1 = (box.x + box.w) * width;
  const y1 = (box.y + box.h) * height;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** An arm reaching in from the left edge, at board row band [y0, y1]. */
export const arm = (y0: number, y1: number, reach = 0.6): Rect =>
  ({ x0: -0.4, y0, x1: reach, y1, rgb: [205, 170, 150] });

/** A counter: wholly inside the squares, so it must never seed the mask. */
export const counter = (u: number, v: number, size = 0.1): Rect =>
  ({ x0: u - size / 2, y0: v - size / 2, x1: u + size / 2, y1: v + size / 2, rgb: [220, 40, 40] });
