import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openLaptopBoard, pageErrors, pickColour, place } from './app';

type RGB = readonly [number, number, number];

/**
 * A video file Chromium can play as its camera (YUV4MPEG2, 4:2:0): `colourAt(f, x, y)` is
 * the colour of frame f at pixel (x, y). Written to a temporary folder.
 */
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
    for (let y = 0; y < H / 2; y++) {
      for (let x = 0; x < W / 2; x++) {
        const c = toYuv(colourAt(f, x * 2 + 1, y * 2 + 1));
        U[y * (W / 2) + x] = c[1]; V[y * (W / 2) + x] = c[2];
      }
    }
    parts.push(Buffer.from('FRAME\n'), Y, U, V);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'admi-cap-')), name);
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

const WALL: RGB = [120, 120, 125];

/**
 * The red cap through a real (fake) camera: Chromium plays a video of a red disc moving
 * from left to right as its camera, and the speed has to follow it. This is the whole
 * camera path — the stream, the picture, finding the cap, the controls — with no person.
 */
function capVideo(): string {
  const W = 160; const H = 120; const frames = 120;
  const red: RGB = [200, 30, 40];
  return y4m('cap.y4m', W, H, 30, frames, (f, x, y) => {
    // Two seconds on the left, two on the right.
    const cx = f < frames / 2 ? 0.15 : 0.85;
    return Math.hypot(x / W - cx, (y / H - 0.4) * (H / W)) < 0.08 ? red : WALL;
  });
}

/**
 * For Learn the hat: a room with a red chair in it all the time, and a player (shapes, no
 * person) whose hat — a slightly different red — is off for the first half of each loop and
 * on for the second, moving side to side. Each half is long enough for a step of Learn the
 * hat to fit inside it (2 s to get ready, 3 s watching, and 3 s more on a busy page).
 */
const HAT_PHASE_S = 11;
function hatVideo(): string {
  const W = 160; const H = 120; const fps = 15; const half = fps * HAT_PHASE_S;
  const SKIN: RGB = [205, 150, 125]; const SHIRT: RGB = [60, 80, 120];
  const CHAIR: RGB = [170, 50, 45]; const HAT: RGB = [200, 30, 40];
  const disc = (x: number, y: number, cx: number, cy: number, r: number): boolean => Math.hypot(x / W - cx, (y / H - cy) * (H / W)) < r;
  /** Where the head is across the picture, and whether the hat is on. */
  const at = (f: number): { x: number; hat: boolean } => {
    if (f < half) return { x: 0.32 + 0.03 * Math.sin((2 * Math.PI * f) / (3 * fps)), hat: false };
    const s = (f - half) / fps;
    // On at the left, over to the right, a moment there, back, a moment there.
    const ramp = (a: number, b: number): number => Math.min(1, Math.max(0, (s - a) / (b - a)));
    return { x: 0.32 + 0.3 * (ramp(1.5, 4) - ramp(6.5, 9)), hat: true };
  };
  return y4m('hat.y4m', W, H, fps, 2 * half, (f, x, y) => {
    const p = at(f);
    const u = x / W; const v = y / H;
    let c = WALL;
    if (u >= p.x - 0.15 && u < p.x + 0.15 && v >= 0.62) c = SHIRT;
    if (disc(x, y, p.x, 0.45, 0.09)) c = SKIN;
    if (u >= 0.8 && u < 0.97 && v >= 0.55 && v < 0.97) c = CHAIR;
    if (p.hat && disc(x, y, p.x, 0.33, 0.07)) c = HAT;
    return c;
  });
}

/**
 * For the hat on Speed: the red disc in the middle of the picture for 3 s, then at its
 * right-hand edge for 3 s, and round again.
 */
function middleThenEdgeVideo(): string {
  const W = 160; const H = 120; const fps = 15; const half = fps * 3;
  const red: RGB = [200, 30, 40];
  return y4m('middle-edge.y4m', W, H, fps, 2 * half, (f, x, y) => {
    const cx = f < half ? 0.5 : 0.97;
    return Math.hypot(x / W - cx, (y / H - 0.4) * (H / W)) < 0.08 ? red : WALL;
  });
}

/** For Show's status row: the red disc in the middle for 4 s, then gone for 4 s, and round again. */
function inThenOutVideo(): string {
  const W = 160; const H = 120; const fps = 15; const half = fps * 4;
  const red: RGB = [200, 30, 40];
  return y4m('in-out.y4m', W, H, fps, 2 * half, (f, x, y) => (
    f < half && Math.hypot(x / W - 0.5, (y / H - 0.4) * (H / W)) < 0.08 ? red : WALL
  ));
}

/**
 * For the hat found again (A12): the red disc in the middle for 2 s, gliding left, still there,
 * then out of shot for 4 s, then back on the right and still for 3 s, and round again.
 */
function lostThenRightVideo(): string {
  const W = 160; const H = 120; const fps = 15;
  const red: RGB = [200, 30, 40];
  return y4m('lost-right.y4m', W, H, fps, 12 * fps, (f, x, y) => {
    const s = f / fps;
    const cx = s < 2 ? 0.5 : s < 3.5 ? 0.5 - (0.2 * (s - 2)) / 1.5 : s < 5 ? 0.3 : s < 9 ? null : 0.8;
    return cx !== null && Math.hypot(x / W - cx, (y / H - 0.4) * (H / W)) < 0.08 ? red : WALL;
  });
}

const video = capVideo();
const fakeCamera = (file: string): string[] =>
  ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${file}`];
test.use({ launchOptions: { args: ['--mute-audio', ...fakeCamera(video)] }, permissions: ['camera'] });

test('a red cap seen by a camera moves the speed with it', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // The cap's finer settings are folded under More hat settings (A13).
  await page.getByRole('button', { name: 'More hat settings' }).click();
  // No face in this video, and no internet needed: the cap alone.
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
  const hud = page.getByRole('status', { name: 'Red cap' });
  await expect(hud).toContainText('a red thing followed', { timeout: 15_000 });
  const bpm = async (): Promise<number> => Number(/(\d+) BPM/.exec((await page.getByText(/·\s*\d+ BPM · step/).first().textContent()) ?? '')?.[1] ?? 0);
  const seen: number[] = [];
  for (let i = 0; i < 40; i++) { seen.push(await bpm()); await page.waitForTimeout(200); }
  // Left = slow, right = fast: over the video's loop the speed covers most of its range.
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(50);
  expect(pageErrors(page)).toEqual([]);
});

test('Learn the hat: the room comes first, both steps run by keyboard and say what came of them', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // The cap's finer settings are folded under More hat settings (A13).
  await page.getByRole('button', { name: 'More hat settings' }).click();
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  await expect(page.getByRole('status', { name: 'Red cap' })).toContainText('a red thing followed', { timeout: 15_000 });
  const card = page.getByRole('group', { name: 'Learn the hat' });
  await expect(card).toContainText('Not learnt yet: it follows a red colour, not the hat itself.');
  const room = card.getByRole('button', { name: '1 · Learn the room (hat off)' });
  const hat = card.getByRole('button', { name: '2 · Learn the hat (hat on)' });
  // Step 2 first: it says the room comes first.
  await hat.focus();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Learn the room first, with the hat off.');
  // Step 1: a countdown, then it watches, then the room is learnt; focus stays on the button.
  await room.focus();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Learning the room: starts in');
  await expect(card).toContainText('Watching the room:', { timeout: 5_000 });
  await expect(card).toContainText('Room learnt. Now put the hat on and press 2.', { timeout: 10_000 });
  await expect(room).toBeFocused();
  // Step 2. This video's red disc was in the room too, so it can't be told apart from the
  // room: it says so, and nothing is changed (still the clicked colour).
  await hat.focus();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Watching the hat:', { timeout: 5_000 });
  await expect(card).toContainText('Couldn’t see the hat. Check it is in the picture and learn the hat again.', { timeout: 10_000 });
  await expect(card).toContainText('Nothing was changed.');
  await expect(hat).toBeFocused();
  await expect(card.getByRole('slider')).toHaveCount(0);
  await expect(page.getByText('Looking for the cap’s colour.')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the cap holds still while a counter is put down, then carries on', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // The cap's finer settings are folded under More hat settings (A13).
  await page.getByRole('button', { name: 'More hat settings' }).click();
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
  const hud = page.getByRole('status', { name: 'Red cap' });
  await expect(hud).toContainText('a red thing followed', { timeout: 15_000 });
  // A click on the laptop board is a counter put down: the cap holds still…
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await expect(hud).toContainText('paused: a counter moved');
  // …and once the board has been quiet for a second, it follows the player again.
  await expect(hud).toContainText('a red thing followed', { timeout: 5_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('the hat on Speed moves the speed around the player’s own: in the middle of the range it is 90, moved fully one way it is near Fastest (240)', async ({ playwright }, testInfo) => {
  // A video of its own, so a browser of its own (a browser's fake camera is chosen when it
  // starts). The video, in a folder of its own, is removed afterwards.
  const file = middleThenEdgeVideo();
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...fakeCamera(file)] });
  try {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
    const page = await context.newPage();
    await openLaptopBoard(page);
    await pickColour(page, 'Red');
    await place(page, [[3, 1]]);
    await page.getByRole('button', { name: '▶ Play the board' }).first().click();
    await page.getByRole('tab', { name: 'Cap' }).click();
    await page.getByRole('switch', { name: 'Control with the red cap' }).click();
    // The cap's finer settings are folded under More hat settings (A13).
    await page.getByRole('button', { name: 'More hat settings' }).click();
    await page.getByRole('switch', { name: /Check it is on the head/ }).click();
    await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
    // In 5 steps: the middle of the picture is the middle of the range, the edge its end.
    await page.getByRole('radiogroup', { name: 'Moves' }).getByRole('radio', { name: 'In 5 steps' }).click();
    // Fastest and Slowest are here, in the Cap tab, with the cap on Speed.
    await expect(page.getByRole('spinbutton', { name: /^Fastest/ })).toHaveValue('240');
    await expect(page.getByRole('spinbutton', { name: /^Slowest/ })).toHaveValue('60');
    await expect(page.getByRole('status', { name: 'Red cap' })).toContainText('a red thing followed', { timeout: 15_000 });
    // The speed as shown, read in the page every 100 ms for 8 s: the video goes round more than once.
    const seen = await page.evaluate(async () => {
      const out: number[] = [];
      const end = performance.now() + 8000;
      while (performance.now() < end) {
        // The speed is its own control since item 4 (SpeedControl), the step its own span.
        const stepSpan = [...document.querySelectorAll('span[aria-hidden="true"]')].find((el) => /^ · step /.test(el.textContent ?? ''));
        const pill = stepSpan ? [...document.querySelectorAll('button, span')].map((el) => /^(\d+) BPM/.exec((el.textContent ?? '').trim())).find((m) => m !== null) : null;
        if (pill) out.push(Number(pill[1]));
        await new Promise((r) => setTimeout(r, 100));
      }
      return out;
    });
    // A busy page reads less often than asked: enough to see both places twice.
    expect(seen.length).toBeGreaterThan(15);
    // In the middle: the player's own speed. Fully one way: near Fastest, never past it.
    expect(seen.some((b) => Math.abs(b - 90) <= 2)).toBe(true);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(230);
    expect(Math.max(...seen)).toBeLessThanOrEqual(240);
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await browser.close();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

test('the Cap panel: Learn the hat, the moves and the picture at the top, the rest folded, nothing cut off sideways at 1366 or narrower (B7, B8, A13)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  const panel = page.getByRole('tabpanel');
  // Not learnt: a red thing is found, never "The cap is found" (B7).
  await expect(panel.getByRole('status')).toHaveText('A red thing is found: is it the hat? Learn the hat to be sure.', { timeout: 15_000 });
  // In this order, top to bottom: Learn the hat, the moves, the picture, More hat settings.
  const top = async (l: ReturnType<Page['locator']>): Promise<number> => (await l.boundingBox())?.y ?? -1;
  const learn = await top(panel.getByRole('group', { name: 'Learn the hat' }));
  const side = await top(panel.getByRole('combobox', { name: 'Side to side' }));
  const updown = await top(panel.getByRole('combobox', { name: 'Up and down' }));
  const picture = await top(panel.getByRole('img', { name: /What the cap camera sees/ }));
  const more = panel.getByRole('button', { name: 'More hat settings' });
  expect(learn).toBeGreaterThan(0);
  expect(side).toBeGreaterThan(learn);
  expect(updown).toBeGreaterThan(side);
  expect(picture).toBeGreaterThan(updown);
  expect(await top(more)).toBeGreaterThan(picture);
  await expect(panel.getByRole('combobox', { name: 'Up and down' })).toHaveValue('volume');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('button', { name: 'Learn side to side' })).toBeHidden();
  // Lock is a show-time control: at the top, with the moves. The mouse test stays folded.
  await expect(panel.getByRole('button', { name: /Lock where things are now/ })).toBeVisible();
  expect(await top(panel.getByRole('button', { name: /Lock where things are now/ }))).toBeLessThan(picture);
  await expect(panel.getByRole('button', { name: 'Test with the mouse' })).toBeHidden();
  await more.click();
  await expect(panel.getByRole('button', { name: 'Learn side to side' })).toBeVisible();
  // Nothing reaches past the panel's right-hand edge, at 1366 and narrower.
  for (const width of [1366, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    const over = await panel.evaluate((el) => {
      const right = el.getBoundingClientRect().right + 0.5;
      return [...el.querySelectorAll<HTMLElement>('*')]
        .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > right)
        .map((e) => `${e.tagName} ${(e.textContent ?? '').slice(0, 30)}`);
    });
    expect(over, `at ${width}`).toEqual([]);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `at ${width}`).toBe(true);
  }
  // The Ready check says which job each move does, and that a red thing is not yet the hat (B8, B7).
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Make a piece' }).click();
  await page.getByRole('region', { name: 'The piece', exact: true }).getByRole('button', { name: /^Check/ }).click();
  await expect(page.getByText('Hat: side to side Speed · up and down Volume')).toBeVisible();
  await expect(page.getByText('Red cap: a red thing is found, but the hat is not learnt')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the hat lost and found again elsewhere: the speed glides to where it now is, without waiting for a movement (A12)', async ({ playwright }, testInfo) => {
  const file = lostThenRightVideo();
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...fakeCamera(file)] });
  try {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
    const page = await context.newPage();
    await openLaptopBoard(page);
    await pickColour(page, 'Red');
    await place(page, [[3, 1]]);
    await page.getByRole('button', { name: '▶ Play the board' }).first().click();
    await page.getByRole('tab', { name: 'Cap' }).click();
    await page.getByRole('switch', { name: 'Control with the red cap' }).click();
    // The cap's finer settings are folded under More hat settings (A13).
    await page.getByRole('button', { name: 'More hat settings' }).click();
    await page.getByRole('switch', { name: /Check it is on the head/ }).click();
    await page.getByRole('switch', { name: 'Picture like a mirror' }).click();
    // One direction at a time stays on (the default): it is what made the speed wait.
    await expect(page.getByRole('switch', { name: 'One direction at a time' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('status', { name: 'Red cap' })).toContainText('a red thing followed', { timeout: 15_000 });
    // The speed as shown, read in the page every 100 ms for two rounds of the video.
    const seen = await page.evaluate(async () => {
      const out: number[] = [];
      const end = performance.now() + 24_000;
      while (performance.now() < end) {
        // The speed is its own control since item 4 (SpeedControl), the step its own span.
        const stepSpan = [...document.querySelectorAll('span[aria-hidden="true"]')].find((el) => /^ · step /.test(el.textContent ?? ''));
        const pill = stepSpan ? [...document.querySelectorAll('button, span')].map((el) => /^(\d+) BPM/.exec((el.textContent ?? '').trim())).find((m) => m !== null) : null;
        if (pill) out.push(Number(pill[1]));
        await new Promise((r) => setTimeout(r, 100));
      }
      return out;
    });
    expect(seen.length).toBeGreaterThan(30);
    // Found again on the right, still: the speed goes up towards Fastest (it used to stay at
    // the left-hand speed until the head moved). On the left it is below the player's 90.
    expect(Math.min(...seen)).toBeLessThan(90);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(150);
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await browser.close();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

// ---- Learn the hat, all the way through ---------------------------------------------------

/** One look, in the page, at the cap's preview picture and what the screen says. */
interface HatSample {
  /** ms, the page's clock. */
  t: number;
  /** The camera's picture is showing (not the empty preview before the camera starts). */
  showing: boolean;
  /** The hat is in shot: a hat-sized patch of red (or of the blue tint over it) up where the hat goes. */
  hatIn: boolean;
  /** Where it is across the preview, 0..1 (as the cap is measured), when in shot. */
  hatX: number | null;
  /** Pixels (of those looked at) tinted as "taken for the hat": up where the hat goes, and down where the chair is. */
  tinted: number;
  tintedBelow: number;
  /** The cap's state under the board ("cap found", "cap not in sight (holding)"…). */
  hud: string;
  /** The speed while playing. */
  bpm: number | null;
  /** How long this look took, ms: the probe must not slow the page (and the cap) down. */
  costMs: number;
  /** The Learn the hat card's words, and its progress bar (0..100) while a step runs. */
  card: string;
  progress: number | null;
}
interface HatProbe { sample(): HatSample; log: HatSample[]; timer: number }

/**
 * Before the page loads: canvases kept in memory rather than on the graphics card, so the
 * probe can read the preview cheaply. Read from the graphics card, every read stalled the
 * page for about 400 ms, and the cap's own 25-a-second camera loop with it.
 */
async function readableCanvases(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, type: string, opts?: object) {
      return orig.call(this, type, type === '2d' ? { ...opts, willReadFrequently: true } : opts);
    };
  });
}

/**
 * Watch, from inside the page, whether the hat is in shot: the test reads the video as the
 * app shows it, so it never has to guess where in its loop the video is. A sample every
 * 50 ms is logged.
 */
async function startProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __hatProbe?: HatProbe };
    if (w.__hatProbe) window.clearInterval(w.__hatProbe.timer);
    const sample = (): HatSample => {
      const t0 = performance.now();
      const cv = document.querySelector<HTMLCanvasElement>('canvas[aria-label^="What the cap camera sees"]');
      let red = 0; let sx = 0; let tinted = 0; let tintedBelow = 0; let wall = 0;
      const img = cv?.getContext('2d')?.getImageData(0, 0, cv.width, cv.height);
      if (img) {
        // The hat is drawn above 0.42 of the height; the chair below 0.55. Every other pixel
        // each way: the preview is the camera's picture at twice its size.
        const top = Math.floor(img.height * 0.47);
        for (let y = 0; y < img.height; y += 2) {
          for (let x = 0; x < img.width; x += 2) {
            const i = (y * img.width + x) * 4;
            const r = img.data[i]; const g = img.data[i + 1]; const b = img.data[i + 2];
            const isTint = b > 160 && g > 130 && r > 60 && r < 150;
            const isRed = r > 150 && g < 90 && b < 100;
            if (Math.abs(r - 120) < 20 && Math.abs(g - 120) < 20 && Math.abs(b - 125) < 20) wall++;
            if (y < top) {
              if (isRed || isTint) { red++; sx += x; }
              if (isTint) tinted++;
            } else if (isTint) tintedBelow++;
          }
        }
      }
      // The speed is its own control since item 4 (SpeedControl), the step its own span.
      const stepSpan = [...document.querySelectorAll('span[aria-hidden="true"]')].find((el) => /^ · step /.test(el.textContent ?? ''));
      const pill = stepSpan ? [...document.querySelectorAll('button, span')].map((el) => /^(\d+) BPM/.exec((el.textContent ?? '').trim())).find((m) => m !== null) : null;
      const group = [...document.querySelectorAll('[role="group"]')]
        .find((g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent === 'Learn the hat');
      const bar = group?.querySelector('[role="progressbar"]');
      const hatIn = red > 75;
      return {
        t: performance.now(), showing: wall > 1250, hatIn, hatX: hatIn && img ? sx / red / img.width : null, tinted, tintedBelow,
        hud: document.querySelector('[role="status"][aria-label="Red cap"]')?.textContent ?? '',
        bpm: pill ? Number(pill[1]) : null, card: group?.textContent ?? '',
        progress: bar ? Number(bar.getAttribute('aria-valuenow')) : null, costMs: performance.now() - t0,
      };
    };
    const probe: HatProbe = { sample, log: [], timer: 0 };
    probe.timer = window.setInterval(() => probe.log.push(sample()), 50);
    w.__hatProbe = probe;
  });
}

/** The samples logged since the last call (and forget them). */
async function takeLog(page: Page): Promise<HatSample[]> {
  return page.evaluate(() => {
    const p = (window as unknown as { __hatProbe: HatProbe }).__hatProbe;
    return p.log.splice(0);
  });
}

/** Everything logged over the next `ms` (timed in the page: the runner lags). */
async function recordFor(page: Page, ms: number): Promise<HatSample[]> {
  await takeLog(page);
  await page.evaluate((ms) => new Promise((r) => { window.setTimeout(r, ms); }), ms);
  return takeLog(page);
}

/** Wait, in the page, for the hat to come into shot (or leave it): a fresh change, not a state already there. */
async function waitForHat(page: Page, inShot: boolean): Promise<void> {
  await page.evaluate((want) => new Promise<void>((resolve, reject) => {
    const p = (window as unknown as { __hatProbe: HatProbe }).__hatProbe;
    let other = false;
    const give = window.setTimeout(() => { window.clearInterval(look); reject(new Error('the hat never changed')); }, 40_000);
    const look = window.setInterval(() => {
      const s = p.sample();
      if (!s.showing) return;
      if (s.hatIn !== want) other = true;
      else if (other) { window.clearInterval(look); window.clearTimeout(give); resolve(); }
    }, 30);
  }), inShot);
}

/**
 * The samples well inside a stretch with the hat in shot (or out): at least `settleMs` after
 * it came or went (or the log began, or the camera's picture first showed), so the cap has
 * had time to see the change.
 */
function settled(log: readonly HatSample[], inShot: boolean, settleMs = 700): HatSample[] {
  const shown = log.filter((s) => s.showing);
  let since = shown[0]?.t ?? 0;
  return shown.filter((s, i) => {
    if (i > 0 && s.hatIn !== shown[i - 1].hatIn) since = s.t;
    return s.hatIn === inShot && s.t - since >= settleMs;
  });
}

/**
 * The status line and the preview are drawn separately: the preview on each animation frame,
 * the status line when React next renders (up to 125 ms after the cap's loop, and longer on a
 * busy page). So just as the hat comes into shot, the status can say "cap found" while the
 * preview still shows the picture before. What the status says is judged only on samples at
 * least this far from any picture with the hat in it; what is TAKEN for the hat (the blue
 * tint) is judged on every sample.
 */
const STATUS_LAG_MS = 300;

/** The settled samples with the hat out of shot, away from any picture with it in (see STATUS_LAG_MS). */
function wellOut(log: readonly HatSample[]): HatSample[] {
  const inAt = log.filter((s) => s.showing && s.hatIn).map((s) => s.t);
  return settled(log, false).filter((s) => !inAt.some((t) => Math.abs(t - s.t) < STATUS_LAG_MS));
}

/** The samples with the hat out of shot where anything at all was taken for the hat (the chair would be). */
const takenWithHatOut = (log: readonly HatSample[]): HatSample[] =>
  log.filter((s) => s.showing && !s.hatIn && (s.tinted > 0 || s.tintedBelow > 0));

/** The settled samples with the hat out of shot, in their separate stretches (the hat in shot between them). */
function outStretches(log: readonly HatSample[]): HatSample[][] {
  const out = new Set(wellOut(log));
  const runs: HatSample[][] = [];
  let open = false;
  for (const s of log) {
    if (s.showing && s.hatIn) open = false;
    if (!out.has(s)) continue;
    if (!open) runs.push([]);
    runs[runs.length - 1].push(s);
    open = true;
  }
  return runs;
}

const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('Learn the hat with a red chair in the room: the cap then follows the hat and never takes the chair; kept after a reload; Forget goes back to the colour', async ({ playwright }, testInfo) => {
  test.setTimeout(480_000);
  // This test's camera plays a video of its own, and a browser's fake camera is chosen when
  // it starts: so a browser of its own (traced like the others, the trace kept on failure).
  // Its video (about 10 MB, in a folder of its own) is removed afterwards.
  const file = hatVideo();
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...fakeCamera(file)] });
  try {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
    await learnTheHatThroughout(await context.newPage());
  } finally {
    await browser.close();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

/**
 * The room learnt while the hat is out of shot, the hat while it is in; then a whole loop of
 * the video shows the cap following the hat and never the chair; the learnt hat is kept
 * through a reload; and forgetting it goes back to the colour, which takes the chair.
 */
async function learnTheHatThroughout(page: Page): Promise<void> {
  const loopMs = 2 * HAT_PHASE_S * 1000 + 1500;
  await readableCanvases(page);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // The cap's finer settings are folded under More hat settings (A13).
  await page.getByRole('button', { name: 'More hat settings' }).click();
  // No face in this video, and no internet needed.
  await page.getByRole('switch', { name: /Check it is on the head/ }).click();
  const hud = page.getByRole('status', { name: 'Red cap' });
  await expect(hud).toContainText('a red thing followed', { timeout: 15_000 });
  await expect(page.getByText('Looking for the cap’s colour.')).toBeVisible();
  const card = page.getByRole('group', { name: 'Learn the hat' });
  const room = card.getByRole('button', { name: '1 · Learn the room (hat off)' });
  const hatStep = card.getByRole('button', { name: '2 · Learn the hat (hat on)' });
  await startProbe(page);

  // Learn the room with the hat still on (B7): it asks whether the hat is still on, and the
  // room is not kept (step 2 then says the room comes first).
  await room.focus();
  await waitForHat(page, true);
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Is the hat still on? Take it off and learn the room again.', { timeout: 20_000 });
  await hatStep.focus();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Learn the room first, with the hat off.');

  // Step 1, by keyboard, just after the hat has gone out of shot: a countdown, then it
  // watches with its progress showing (both checked below, from the page's own log), then
  // the room is learnt. Focus stays put.
  await room.focus();
  await waitForHat(page, false);
  await takeLog(page);
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Room learnt. Now put the hat on and press 2.', { timeout: 20_000 });
  await expect(room).toBeFocused();

  // Step 2, by keyboard, just after the hat has come into shot, moving.
  await hatStep.focus();
  await waitForHat(page, true);
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Hat learnt: it stands out well from the room.', { timeout: 20_000 });
  await expect(hatStep).toBeFocused();
  await expect(page.getByText('Looking for the learnt hat.')).toBeVisible();
  await expect(card.getByRole('slider', { name: /How sure before it counts/ })).toHaveValue('0.6');

  // Each step, as the page showed it: a countdown with the bar empty, then watching with the
  // bar filling.
  const steps = await takeLog(page);
  for (const what of ['room', 'hat']) {
    const ready = steps.filter((s) => s.card.includes(`Learning the ${what}: starts in`));
    const watching = steps.filter((s) => s.card.includes(`Watching the ${what}:`));
    expect(ready.length).toBeGreaterThan(0);
    expect(ready.map((s) => s.progress)).toEqual(ready.map(() => 0));
    expect(watching.length).toBeGreaterThan(0);
    expect(watching.filter((s) => !(s.progress !== null && s.progress > 0))).toEqual([]);
    const shown = watching.map((s) => s.progress ?? 0);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
  }
  // Each step saw what it should: the room with no hat at all, the hat all the way through.
  const watchedRoom = steps.filter((s) => s.card.includes('Watching the room:'));
  const watchedHat = steps.filter((s) => s.card.includes('Watching the hat:'));
  expect(watchedRoom.length).toBeGreaterThan(5);
  expect(watchedRoom.filter((s) => s.hatIn)).toEqual([]);
  expect(watchedHat.length).toBeGreaterThan(5);
  expect(watchedHat.filter((s) => !s.hatIn)).toEqual([]);

  // Show what it sees as the hat, by keyboard: then a whole loop of the video.
  const show = page.getByRole('switch', { name: /Show what it sees as the hat/ });
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(show).toHaveAttribute('aria-checked', 'true');
  const loop = await recordFor(page, loopMs);
  // The probe is cheap: watching doesn't slow the page (and the cap) down.
  expect(median(loop.map((s) => s.costMs))).toBeLessThan(10);
  const inShot = settled(loop, true);
  const out = outStretches(loop);
  // Each half of the loop well covered, however busy the page is (it is: the board is playing).
  expect(inShot.length).toBeGreaterThan(Math.max(10, 0.25 * loop.length));
  expect(out.flat().length).toBeGreaterThan(Math.max(10, 0.25 * loop.length));
  // Hat out of shot: the chair is never taken (nothing at all is tinted as the hat); the cap
  // is lost, and the speed holds.
  expect(takenWithHatOut(loop)).toEqual([]);
  expect(out.flat().filter((s) => s.hud.includes('cap found'))).toEqual([]);
  expect(out.flat().every((s) => s.hud.includes('cap not in sight (holding)'))).toBe(true);
  expect(out.some((run) => run.length >= 5)).toBe(true);
  for (const run of out) {
    const speeds = run.map((s) => s.bpm ?? 0);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeLessThanOrEqual(1);
  }
  // Hat in shot: found, and the speed follows it (further right in the picture, faster).
  expect(inShot.filter((s) => s.hud.includes('cap found')).length).toBeGreaterThan(0.8 * inShot.length);
  const left = inShot.filter((s) => (s.hatX ?? 0.5) < 0.45).map((s) => s.bpm ?? 0);
  const right = inShot.filter((s) => (s.hatX ?? 0.5) > 0.6).map((s) => s.bpm ?? 0);
  expect(left.length).toBeGreaterThan(3);
  expect(right.length).toBeGreaterThan(3);
  // How far it gets depends on how often the page lets the cap look (it glides, and moves
  // only while the head moves): on this busy test page, 12 to 30 BPM. The chair, which
  // stays put, would give none.
  expect(median(right) - median(left)).toBeGreaterThan(5);
  const speeds = inShot.map((s) => s.bpm ?? 0);
  expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThanOrEqual(10);
  // What it takes for the hat is tinted on the hat, and never on the chair.
  expect(inShot.filter((s) => s.tinted > 75).length).toBeGreaterThan(0.8 * inShot.length);
  expect(loop.filter((s) => s.tintedBelow > 0)).toEqual([]);

  // How sure before it counts, by keyboard, while playing: a whole loop at its surest and one
  // at its loosest. Surer takes less of the hat's picture; even the loosest never takes the
  // chair, and the hat is found at both.
  const sure = card.getByRole('slider', { name: /How sure before it counts/ });
  await sure.focus();
  await page.keyboard.press('ArrowRight');
  await expect(card).toContainText('65%');
  await page.keyboard.press('End');
  await expect(card).toContainText('90%');
  const surest = await recordFor(page, loopMs);
  await page.keyboard.press('Home');
  await expect(card).toContainText('30%');
  const loosest = await recordFor(page, loopMs);
  const tintedIn = (log: readonly HatSample[]): number[] => settled(log, true).map((s) => s.tinted);
  for (const log of [surest, loosest]) {
    expect(tintedIn(log).length).toBeGreaterThan(Math.max(10, 0.25 * log.length));
    expect(median(tintedIn(log))).toBeGreaterThan(75);
    expect(log.filter((s) => s.tintedBelow > 0)).toEqual([]);
    expect(takenWithHatOut(log)).toEqual([]);
    expect(wellOut(log).filter((s) => s.hud.includes('cap found'))).toEqual([]);
    expect(settled(log, true).filter((s) => s.hud.includes('cap found')).length).toBeGreaterThan(0.8 * settled(log, true).length);
  }
  expect(median(tintedIn(loosest))).toBeGreaterThan(median(tintedIn(surest)));
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(card).toContainText('60%');

  // Kept with the player: the page opened again still uses the learnt hat.
  await page.evaluate(() => new Promise((r) => { window.setTimeout(r, 1000); }));
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await expect(card).toContainText(/A learnt hat is in use \(learnt .+\)\./);
  await expect(page.getByText('Looking for the learnt hat.')).toBeVisible();
  await expect(card.getByRole('slider', { name: /How sure before it counts/ })).toHaveValue('0.6');
  await startProbe(page);
  const again = await recordFor(page, loopMs);
  expect(settled(again, false).length).toBeGreaterThan(Math.max(10, 0.25 * again.length));
  expect(takenWithHatOut(again)).toEqual([]);
  expect(wellOut(again).filter((s) => s.hud.includes('cap found'))).toEqual([]);
  expect(settled(again, true).length).toBeGreaterThan(5);
  expect(settled(again, true).filter((s) => s.hud.includes('cap found')).length).toBeGreaterThan(0.8 * settled(again, true).length);

  // Forget the learnt hat, by keyboard: focus goes to step 1, and the cap is found by its
  // colour again — which takes the chair whenever the hat is out of shot.
  const forget = card.getByRole('button', { name: 'Forget the learnt hat' });
  await forget.focus();
  await page.keyboard.press('Enter');
  await expect(forget).toHaveCount(0);
  await expect(room).toBeFocused();
  await expect(card).toContainText('Not learnt yet: it follows a red colour, not the hat itself.');
  await expect(page.getByText('Looking for the cap’s colour.')).toBeVisible();
  const byColour = await recordFor(page, loopMs);
  expect(settled(byColour, false).length).toBeGreaterThan(Math.max(10, 0.25 * byColour.length));
  expect(wellOut(byColour).every((s) => s.hud.includes('a red thing followed'))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
}

test('Show says what the hat is doing in its status row: not learnt (no ✓) with its Speed, then not in sight (holding) (B1, B7)', async ({ playwright }, testInfo) => {
  const file = inThenOutVideo();
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', ...fakeCamera(file)] });
  try {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1366, height: 768 }, permissions: ['camera'] });
    const page = await context.newPage();
    await openLaptopBoard(page);
    await page.getByRole('tab', { name: 'Cap' }).click();
    await page.getByRole('switch', { name: 'Control with the red cap' }).click();
    // The cap's finer settings are folded under More hat settings (A13).
    await page.getByRole('button', { name: 'More hat settings' }).click();
    await page.getByRole('switch', { name: /Check it is on the head/ }).click();
    await expect(page.getByRole('status', { name: 'Red cap' })).toContainText('a red thing followed', { timeout: 15_000 });
    await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    const row = page.getByRole('region', { name: 'Show', exact: true }).getByRole('group', { name: 'Show status' });
    // Followed, with the controls it moves: not learnt, so a calm note and never a ✓ (B7);
    // then gone, said in amber words; then followed again.
    await expect(row).toContainText(/Hat: not learnt \(a red thing is followed\).*Speed \d+ BPM/, { timeout: 15_000 });
    await expect(row.locator('[data-tone="note"]')).toContainText('Hat: not learnt');
    await expect(row).not.toContainText('Hat ✓');
    await expect(row).toContainText('! Hat not in sight: holding', { timeout: 15_000 });
    await expect(row.locator('[data-tone="warn"]')).toContainText('Hat not in sight');
    await expect(row).toContainText('Hat: not learnt (a red thing is followed)', { timeout: 15_000 });
    await expect(row).not.toContainText('Hat ✓');
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await browser.close();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});
