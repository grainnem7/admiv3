import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listenToOutput, openWelcome, outputLevels, pageErrors } from './app';

type RGB = readonly [number, number, number];

/** A video Chromium plays as its camera (YUV4MPEG2, 4:2:0). */
function y4m(name: string, W: number, H: number, fps: number, frames: number, colourAt: (f: number, x: number, y: number) => RGB): string {
  const toYuv = ([r, g, b]: RGB): [number, number, number] => [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    const Y = Buffer.alloc(W * H); const U = Buffer.alloc((W / 2) * (H / 2)); const V = Buffer.alloc((W / 2) * (H / 2));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Y[y * W + x] = toYuv(colourAt(f, x, y))[0];
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
      const c = toYuv(colourAt(f, x * 2 + 1, y * 2 + 1));
      U[y * (W / 2) + x] = c[1]; V[y * (W / 2) + x] = c[2];
    }
    parts.push(Buffer.from('FRAME\n'), Y, U, V);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'admi-chess-')), name);
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

/** The board fills x 0.2 to 0.8, y 0.1 to 0.9 of the picture. */
const BOARD = { x0: 0.2, x1: 0.8, y0: 0.1, y1: 0.9 };
const PHASE_S = 14;

/**
 * A chess board seen from straight above, White at the bottom: the start position for the
 * first PHASE_S seconds, then after 1. e4 for as long again. Drawn, no people.
 */
function chessVideo(): string {
  const W = 320; const H = 240; const fps = 5;
  return y4m('chess.y4m', W, H, fps, 2 * PHASE_S * fps, (f, x, y) => {
    const u = (x / W - BOARD.x0) / (BOARD.x1 - BOARD.x0);
    const v = (y / H - BOARD.y0) / (BOARD.y1 - BOARD.y0);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return [60, 90, 60];
    const col = Math.floor(u * 8); const row = Math.floor(v * 8);
    const rank = 8 - row; const file = col;
    let piece: 'w' | 'b' | null = rank <= 2 ? 'w' : rank >= 7 ? 'b' : null;
    if (f >= PHASE_S * fps && file === 4 && rank === 2) piece = null; // e2 empty
    if (f >= PHASE_S * fps && file === 4 && rank === 4) piece = 'w'; // pawn on e4
    if (piece && Math.hypot(u * 8 - col - 0.5, v * 8 - row - 0.5) < 0.3) return piece === 'w' ? [245, 240, 230] : [30, 28, 26];
    return (file + rank) % 2 === 1 ? [225, 200, 160] : [120, 80, 50];
  });
}

const video = chessVideo();
test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
  permissions: ['camera'],
});

test('the real board: learnt from the start position, a move on the board is heard and listed', async ({ page }) => {
  await listenToOutput(page);
  await openWelcome(page);
  await page.getByRole('button', { name: 'Chess music' }).click();
  await page.getByRole('button', { name: 'The real board' }).click();
  await page.getByRole('button', { name: 'Start the camera' }).click();
  await expect(page.getByText(/Camera on/)).toBeVisible();
  // Tap the four corners on the picture.
  await page.getByRole('button', { name: 'Tap the corners' }).click();
  const pic = page.locator('canvas[aria-label^="Tap corner"]');
  const box = (await pic.boundingBox())!;
  for (const [u, v] of [[BOARD.x0, BOARD.y0], [BOARD.x1, BOARD.y0], [BOARD.x1, BOARD.y1], [BOARD.x0, BOARD.y1]]) {
    await page.mouse.click(box.x + u * box.width, box.y + v * box.height);
  }
  await expect(page.getByText(/Board found/)).toBeVisible();
  await page.getByRole('button', { name: 'Learn the start position' }).click();
  await expect(page.getByText(/White sits at the bottom of the picture/)).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Listening to the board.')).toBeVisible();
  // The video moves the pawn after PHASE_S seconds.
  const moves = page.getByRole('list', { name: 'Moves' });
  await expect(moves.getByRole('listitem').first()).toHaveText('e4', { timeout: (PHASE_S + 10) * 1000 });
  await expect(page.locator('[data-square="e4"]')).toHaveText('♙');
  expect(Math.max(...await outputLevels(page, 8, 250))).toBeGreaterThan(0.002);
  expect(pageErrors(page)).toEqual([]);
});
