import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLaptopBoard, pageErrors, pickColour, place } from './app';

/**
 * The red cap through a real (fake) camera: Chromium plays a video of a red disc moving
 * from left to right as its camera, and the speed has to follow it. This is the whole
 * camera path — the stream, the picture, finding the cap, the controls — with no person.
 */
function capVideo(): string {
  const W = 160; const H = 120; const frames = 120;
  const toYuv = (r: number, g: number, b: number): [number, number, number] => [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
  const wall = toYuv(120, 120, 125);
  const red = toYuv(200, 30, 40);
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    // Two seconds on the left, two on the right.
    const cx = f < frames / 2 ? 0.15 : 0.85;
    const inDisc = (x: number, y: number): boolean => Math.hypot(x / W - cx, (y / H - 0.4) * (H / W)) < 0.08;
    const Y = Buffer.alloc(W * H); const U = Buffer.alloc((W / 2) * (H / 2)); const V = Buffer.alloc((W / 2) * (H / 2));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Y[y * W + x] = (inDisc(x, y) ? red : wall)[0];
    for (let y = 0; y < H / 2; y++) {
      for (let x = 0; x < W / 2; x++) {
        const c = inDisc(x * 2 + 1, y * 2 + 1) ? red : wall;
        U[y * (W / 2) + x] = c[1]; V[y * (W / 2) + x] = c[2];
      }
    }
    parts.push(Buffer.from('FRAME\n'), Y, U, V);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'admi-cap-')), 'cap.y4m');
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

const video = capVideo();
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  },
  permissions: ['camera'],
});

test('a red cap seen by a camera moves the speed with it', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // No face in this video, and no internet needed: the cap alone.
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
  const hud = page.getByRole('status', { name: 'Red cap' });
  await expect(hud).toContainText('cap found', { timeout: 15_000 });
  const bpm = async (): Promise<number> => Number(/(\d+) BPM/.exec((await page.getByText(/·\s*\d+ BPM · step/).first().textContent()) ?? '')?.[1] ?? 0);
  const seen: number[] = [];
  for (let i = 0; i < 40; i++) { seen.push(await bpm()); await page.waitForTimeout(200); }
  // Left = slow, right = fast: over the video's loop the speed covers most of its range.
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(50);
  expect(pageErrors(page)).toEqual([]);
});

test('the cap holds still while a counter is put down, then carries on', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
  const hud = page.getByRole('status', { name: 'Red cap' });
  await expect(hud).toContainText('cap found', { timeout: 15_000 });
  // A click on the laptop board is a counter put down: the cap holds still…
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await expect(hud).toContainText('paused: a counter moved');
  // …and once the board has been quiet for a second, it follows the player again.
  await expect(hud).toContainText('cap found', { timeout: 5_000 });
  expect(pageErrors(page)).toEqual([]);
});
