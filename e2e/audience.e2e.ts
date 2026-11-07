import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { headerButton, makePlan, notesPlayed, openLaptopBoard, pageErrors, pickColour, place, sessionLog, startPiece } from './app';

/**
 * The audience screen (spec 2026-10-29): a window of its own for the projector, fed by the
 * laptop page. The test browser has one screen and can't place windows, so the window
 * opens where the browser puts it and the laptop asks for a drag (the fallback); the
 * choice of screen is tested in src/__tests__/audienceFeed.test.ts.
 */

/** A pause measured inside the page (the runner can lag by hundreds of milliseconds). */
const pause = (page: Page, ms: number) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);

/** The audience screen's picture, and what it says about itself for the tests. */
const picture = (aud: Page): Locator => aud.locator('#root > div');

/** Open the audience screen from the laptop page; it says it is there. */
async function openAudience(page: Page): Promise<Page> {
  const [aud] = await Promise.all([
    page.context().waitForEvent('page'),
    headerButton(page, 'Open the audience screen').then((b) => b.click()),
  ]);
  await aud.waitForLoadState();
  await expect(picture(aud)).toHaveAttribute('data-connected', 'yes', { timeout: 20_000 });
  return aud;
}

/** Everything the squares in `blooms` showed while watching for `ms`, gathered inside the window. */
async function bloomsSeen(aud: Page, ms: number): Promise<string[]> {
  return aud.evaluate((t) => new Promise<string[]>((resolve) => {
    const el = document.querySelector<HTMLElement>('#root > div');
    const seen = new Set<string>();
    const id = setInterval(() => { for (const s of (el?.dataset.blooms ?? '').split(' ')) if (s) seen.add(s); }, 30);
    setTimeout(() => { clearInterval(id); resolve([...seen]); }, t);
  }), ms);
}

test('opening the audience screen shows the board and nothing else, and the laptop shows no other tab', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5]]);
  const aud = await openAudience(page);
  // The board: Tim's counters, dim before the piece.
  await expect(picture(aud)).toHaveAttribute('data-counters', '3');
  await expect(picture(aud)).toHaveAttribute('data-awake', 'no');
  // No buttons, no words (no scene before the piece).
  await expect(aud.getByRole('button')).toHaveCount(0);
  expect((await aud.locator('body').innerText()).trim()).toBe('');
  // One screen, no placing: the laptop says to drag it.
  await expect(page.getByRole('status', { name: 'Audience screen' })).toContainText('Drag the audience screen to the projector, then click it to fill the screen, then click back on this laptop screen.');
  // Not another copy of ADMI: the laptop never hears of another tab.
  await pause(page, 3000);
  await expect(page.getByText(/open in another tab/)).toHaveCount(0);
  await expect(await headerButton(page, 'Close the audience screen')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
  // Closing it from the laptop takes a second press (B4), then closes it.
  await (await headerButton(page, 'Close the audience screen')).click();
  await pause(page, 1000);
  expect(aud.isClosed()).toBe(false);
  await page.getByRole('button', { name: 'Press again to close the audience screen' }).first().click();
  await expect.poll(() => aud.isClosed(), { timeout: 10_000 }).toBe(true);
  await expect(await headerButton(page, 'Open the audience screen')).toBeVisible();
});

test('a note that sounds blooms its square; no words at all, before or after a scene change (owner, 7 Nov 2026)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  const aud = await openAudience(page);
  await startPiece(page);
  await expect(picture(aud)).toHaveAttribute('data-awake', 'yes', { timeout: 20_000 });
  // The counter on step 1 (column 0) blooms as it sounds.
  await expect.poll(async () => (await bloomsSeen(aud, 3000)).some((s) => s.endsWith(',0')), { timeout: 20_000 }).toBe(true);
  // Nothing to read: no scene name, no clock, no buttons.
  expect((await aud.locator('body').innerText()).trim()).toBe('');
  await expect(aud.getByRole('button')).toHaveCount(0);
  await page.getByRole('region', { name: 'Now and next' }).getByRole('button', { name: 'Next scene ▶' }).click();
  await pause(page, 3000);
  expect((await aud.locator('body').innerText()).trim()).toBe('');
  expect(pageErrors(page)).toEqual([]);
});

test('after Stop the audience screen fades slowly to the dim board, and stays open', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  const aud = await openAudience(page);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(picture(aud)).toHaveAttribute('data-awake', 'yes', { timeout: 20_000 });
  await expect.poll(async () => Number(await picture(aud).getAttribute('data-presence')), { timeout: 10_000 }).toBe(1);
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await expect(picture(aud)).toHaveAttribute('data-awake', 'no', { timeout: 10_000 });
  // Slowly: still fading three seconds on (timed inside the window).
  await pause(aud, 3000);
  expect(Number(await picture(aud).getAttribute('data-presence'))).toBeGreaterThan(0.6);
  // Then the same dim board as before the piece, counters and all.
  await expect(picture(aud)).toHaveAttribute('data-presence', '0.40', { timeout: 15_000 });
  await expect(picture(aud)).toHaveAttribute('data-counters', '2');
  expect(aud.isClosed()).toBe(false);
  // Leave Show and back changes nothing for it either.
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: 'Leave Show' }).click();
  await pause(page, 1500);
  expect(aud.isClosed()).toBe(false);
  await expect(picture(aud)).toHaveAttribute('data-connected', 'yes');
  expect(pageErrors(page)).toEqual([]);
});

test('a reload of the laptop page keeps the audience screen, and it picks up again by itself', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  const aud = await openAudience(page);
  await startPiece(page);
  await expect(picture(aud)).toHaveAttribute('data-awake', 'yes', { timeout: 20_000 });
  await page.reload();
  // The window stays; with the laptop gone a moment, it shows the dim board, never an error.
  expect(aud.isClosed()).toBe(false);
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing' });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  // The laptop finds it again without a click.
  await expect(await headerButton(page, 'Close the audience screen')).toBeVisible({ timeout: 10_000 });
  await expect(aud.getByRole('button')).toHaveCount(0);
  await offer.getByRole('button', { name: /Carry on from/ }).click();
  await expect(picture(aud)).toHaveAttribute('data-connected', 'yes');
  await expect(picture(aud)).toHaveAttribute('data-awake', 'yes', { timeout: 20_000 });
  await expect.poll(async () => (await bloomsSeen(aud, 3000)).some((s) => s.endsWith(',0')), { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await aud.locator('body').innerText()).trim()).toBe('Arrival');
  expect(pageErrors(page)).toEqual([]);
});

interface Timing { lateBeats: number; skippedBeats: number; lostSec: number; worstLateSec: number; driftSec: number }

/** The keeping-time reading of the last run, from the session log saved as JSON. */
async function lastTiming(page: Page): Promise<Timing> {
  await sessionLog(page); // folded under the board (A15)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Save session/ }).click(),
  ]);
  const log = JSON.parse(readFileSync(await download.path(), 'utf-8')) as { events: ({ kind: string } & Partial<Timing>)[] };
  const t = log.events.filter((e) => e.kind === 'timing').at(-1);
  if (!t) throw new Error('no keeping-time reading in the log');
  return { lateBeats: t.lateBeats ?? 0, skippedBeats: t.skippedBeats ?? 0, lostSec: t.lostSec ?? 0, worstLateSec: t.worstLateSec ?? 0, driftSec: t.driftSec ?? 0 };
}

/** Play the board for `sec` seconds (timed inside the page), then Stop. */
async function playFor(page: Page, sec: number): Promise<void> {
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await pause(page, sec * 1000);
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
}

test('the keeping-time meter reads the same with the audience screen open as without', async ({ page }) => {
  test.setTimeout(360_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7], [2, 2], [7, 6]]);
  // Turn about, twice: this machine's own load swings a single run by a second or more
  // either way (measured: 0.5 to 3 s lost in 15 s runs with no audience screen at all).
  const without: Timing[] = [];
  const withIt: Timing[] = [];
  for (let i = 0; i < 2; i++) {
    await playFor(page, 12);
    without.push(await lastTiming(page));
    const aud = await openAudience(page);
    await playFor(page, 12);
    withIt.push(await lastTiming(page));
    // It was really there and drawing all along.
    expect(aud.isClosed()).toBe(false);
    await expect(picture(aud)).toHaveAttribute('data-connected', 'yes');
    await (await headerButton(page, 'Close the audience screen')).click();
    await page.getByRole('button', { name: 'Press again to close the audience screen' }).first().click();
    await expect.poll(() => aud.isClosed(), { timeout: 10_000 }).toBe(true);
  }
  const lost = (ts: Timing[]): number => ts.reduce((n, t) => n + t.lostSec, 0);
  const note = `without ${JSON.stringify(without)}; with the audience screen ${JSON.stringify(withIt)}`;
  test.info().annotations.push({ type: 'keeping time', description: note });
  console.log(`[keeping time] ${note}`);
  // No beat dropped with it open, the sound's clock no further behind, and no more sound
  // lost than the machine's own swing.
  for (const t of withIt) expect(t.skippedBeats).toBe(0);
  for (let i = 0; i < 2; i++) expect(Math.abs(withIt[i].driftSec)).toBeLessThanOrEqual(Math.abs(without[i].driftSec) + 0.05);
  expect(lost(withIt)).toBeLessThanOrEqual(lost(without) + 1.5);
  expect(pageErrors(page)).toEqual([]);
});

test("the hat's marker: it follows the hat, holds dimmed when the hat is lost, and is off with no hat", async ({ page, context }) => {
  await page.goto('/audience.html');
  const laptop = await context.newPage();
  await laptop.goto('/favicon.svg');
  const state = (hat: Record<string, unknown>) => ({
    kind: 'state', rows: 8, cols: 8, counters: [{ row: 1, col: 0, colour: '#43a047' }], playing: true, scene: 'Arrival', world: 'none', bpm: 100, hat,
  });
  /** Says how things are every quarter second until `until` holds (as the laptop does). */
  const keepUntil = async (hat: Record<string, unknown>, attr: string, value: string) => {
    await expect.poll(async () => {
      await laptop.evaluate((m) => { new BroadcastChannel('admi-audience').postMessage(m); }, state(hat));
      return picture(page).getAttribute(attr);
    }, { timeout: 15_000, intervals: [250] }).toBe(value);
  };
  // No hat in use (the laptop board): no marker.
  await keepUntil({ mode: 'free', x: null, y: null, warmth: null }, 'data-hat-marker', 'off');
  await keepUntil({ mode: 'follow', x: 0.2, y: 0.8, warmth: 0.5 }, 'data-hat-marker', 'follow');
  await keepUntil({ mode: 'lost', x: null, y: null, warmth: null }, 'data-hat-marker', 'lost');
  // The light holds too (the marker goes where the light is).
  await expect(picture(page)).toHaveAttribute('data-light', 'lost');
  await keepUntil({ mode: 'free', x: null, y: null, warmth: null }, 'data-hat-marker', 'off');
  // Still nothing to read on the projector.
  expect((await page.locator('body').innerText()).trim()).toBe('Arrival');
  expect(pageErrors(page)).toEqual([]);
});

/**
 * Pictures of the audience screen for the owner to look at (not a check): synthetic boards
 * sent straight to an audience window, no people. Only with ADMI_AUDIENCE_SHOTS set to a folder.
 */
test('pictures of the audience screen', async ({ page, context }) => {
  const dir = process.env.ADMI_AUDIENCE_SHOTS;
  test.skip(!dir, 'only when pictures are asked for');
  await page.goto('/audience.html');
  await page.setViewportSize({ width: 1280, height: 720 });
  const laptop = await context.newPage();
  await laptop.goto('/favicon.svg');
  const send = (m: unknown) => laptop.evaluate((msg) => { new BroadcastChannel('admi-audience').postMessage(msg); }, m);
  const counters = [
    { row: 1, col: 0, colour: '#e53935' }, { row: 3, col: 2, colour: '#fdd835' }, { row: 5, col: 4, colour: '#1e88e5' },
    { row: 2, col: 5, colour: '#43a047' }, { row: 6, col: 7, colour: '#e53935' }, { row: 4, col: 6, colour: '#fdd835' },
  ];
  const state = (over: Record<string, unknown>) => ({
    kind: 'state', rows: 8, cols: 8, counters, playing: false, scene: null, world: 'none', bpm: 100,
    hat: { mode: 'free', x: null, y: null, warmth: null }, ...over,
  });
  const keep = async (over: Record<string, unknown>, ms: number, notes?: { row: number; col: number; colour: string; band: boolean }[]) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await send(state(over));
      if (notes) await send({ kind: 'notes', notes });
      await page.waitForTimeout(250);
    }
  };
  await keep({}, 2500);
  await page.screenshot({ path: join(dir!, 'a-shot-1-before.png') });
  const playing = { playing: true, scene: 'Arrival', world: 'warm', bpm: 96, hat: { mode: 'follow', x: 0.25, y: 0.7, warmth: 0.8 } };
  await keep(playing, 3000, [{ row: 1, col: 0, colour: '#e53935', band: false }, { row: -1, col: -1, colour: '#888', band: true }]);
  await send({ kind: 'notes', notes: [{ row: 3, col: 2, colour: '#fdd835', band: false }, { row: 2, col: 6, colour: '#43a047', band: false }] });
  await page.waitForTimeout(180);
  await page.screenshot({ path: join(dir!, 'a-shot-2-warm-hat-left-bright.png') });
  const ambient = { ...playing, scene: 'Open', world: 'ambient', bpm: 140, hat: { mode: 'follow', x: 0.85, y: 0.2, warmth: 0.15 } };
  await keep(ambient, 5000, [{ row: 5, col: 4, colour: '#1e88e5', band: false }, { row: -1, col: -1, colour: '#888', band: true }]);
  await send({ kind: 'notes', notes: [{ row: 6, col: 7, colour: '#e53935', band: false }] });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(dir!, 'a-shot-3-ambient-hat-right-dull.png') });
  // The hat's marker moving from the left to the right: the trail behind it.
  await keep({ ...ambient, hat: { mode: 'follow', x: 0.1, y: 0.4, warmth: 0.5 } }, 2500);
  await send(state({ ...ambient, hat: { mode: 'follow', x: 0.9, y: 0.6, warmth: 0.5 } }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(dir!, 'a-shot-3b-hat-marker-moving-trail.png') });
  await keep({ ...ambient, hat: { mode: 'follow', x: 0.9, y: 0.6, warmth: 0.5 } }, 2000);
  await page.screenshot({ path: join(dir!, 'a-shot-3c-hat-marker-following.png') });
  await keep({ ...ambient, world: 'electronic', scene: 'Build', hat: { mode: 'lost', x: null, y: null, warmth: null } }, 5000, [{ row: 4, col: 6, colour: '#fdd835', band: false }]);
  await page.screenshot({ path: join(dir!, 'a-shot-4-electronic-hat-out-of-sight.png') });
  await keep({}, 10_000);
  await page.screenshot({ path: join(dir!, 'a-shot-5-after-the-fade.png') });
});
