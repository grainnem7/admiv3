/**
 * Greyscale and blur for the board detector. Typed arrays, no DOM, no dependencies.
 *
 * Detection runs at a fixed working width so its thresholds mean the same thing whatever
 * camera is plugged in: a 1080p webcam and a 480p phone feed both arrive here at 320 px.
 */

/** The one working width for every detector, so thresholds are camera-independent. */
export const WORKING_WIDTH = 320;

export interface GrayImage {
  data: Float32Array;
  width: number;
  height: number;
  /** How much the source was reduced, so results can be mapped back to frame fractions. */
  scale: number;
}

/** Box-average an RGBA frame down to `targetW` and convert to grey (0–255). */
export function toGrayDownscaled(
  rgba: Uint8ClampedArray, width: number, height: number, targetW = WORKING_WIDTH,
): GrayImage {
  const scale = width > targetW ? width / targetW : 1;
  const w = Math.max(1, Math.round(width / scale));
  const h = Math.max(1, Math.round(height / scale));
  const out = new Float32Array(w * h);
  const step = Math.max(1, Math.floor(scale));

  for (let y = 0; y < h; y++) {
    const sy0 = Math.min(height - 1, Math.round(y * scale));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.min(width - 1, Math.round(x * scale));
      let sum = 0;
      let count = 0;
      // Average the source block, so downscaling doesn't alias the squares away.
      for (let dy = 0; dy < step; dy++) {
        const sy = sy0 + dy;
        if (sy >= height) break;
        for (let dx = 0; dx < step; dx++) {
          const sx = sx0 + dx;
          if (sx >= width) break;
          const i = (sy * width + sx) * 4;
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          count++;
        }
      }
      out[y * w + x] = count > 0 ? sum / count : 0;
    }
  }
  return { data: out, width: w, height: h, scale };
}

/** Separable Gaussian blur. `sigma` in pixels of the working image. */
export function gaussianBlur(img: GrayImage, sigma: number): GrayImage {
  if (sigma <= 0) return img;
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += data[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return { data: out, width: w, height: h, scale: img.scale };
}

/** Bilinear sample, clamped at the edges. */
export function sampleGray(img: GrayImage, x: number, y: number): number {
  const { width: w, height: h, data } = img;
  const cx = Math.min(w - 1, Math.max(0, x));
  const cy = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const a = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
  const b = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}
