import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { headerButton, openLaptopBoard, pageErrors, pickColour, place, sessionLog, soundTab } from './app';

/**
 * The Simple iPad page, for playing live only (spec 2026-11-04, "Live only: Drums, Calm/Busy,
 * Melody, Board"), in a touch browser of its own at an upright iPad's size. Loops are made on
 * the laptop (here with its loop rail); the iPad switches drums, how much plays and the board.
 */

const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };
const pause = (page: Page, ms: number) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);

/** iPad controls on, from the Connections tab: a new player has the simple layout. */
async function ipadOn(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await expect(page.getByText('✓ The iPad has the simple layout.')).toBeVisible();
}

/** The iPad: a touch browser of its own, joined with the laptop's code. */
async function ipadFor(page: Page, browser: Browser, testInfo: TestInfo, size = { width: 810, height: 1080 }): Promise<{ ipad: Page; close: () => Promise<void> }> {
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: size, hasTouch: true });
  const ipad = await ctx.newPage();
  await ipad.goto(`/?remote=${code}`);
  return { ipad, close: () => ctx.close() };
}

const rail = (page: Page) => page.locator('[data-loop-rail]');
const grid = (page: Page) => page.getByRole('grid', { name: /Laptop board/ });

/** The board playing, with what is on it now kept as Loop 1 on the laptop (the board then clear). */
async function loopFrom(page: Page, colour: string, steps: number[], row = 1): Promise<void> {
  await pickColour(page, colour);
  await place(page, steps.map((s) => [row, s] as [number, number]));
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await rail(page).getByRole('button', { name: /^Loop 1: empty/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Kept as Loop 1' }).first()).toBeVisible();
}

interface LogFile {
  notes: { t: number; origin: string; source: string; role: string; col: number }[];
  events: { t: number; kind: string; action?: string }[];
}
async function sessionLogFile(page: Page): Promise<LogFile> {
  await sessionLog(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Save session/ }).click()]);
  return JSON.parse(readFileSync(await download.path(), 'utf-8')) as LogFile;
}

test('Drums silent: no drums anywhere (the board, a playing loop, the band) and everything else plays on; the laptop says so and brings them back; checked in the session log', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  // A loop of drums and melody, then drums and melody on the board as well.
  await pickColour(page, 'Red');
  await place(page, [[5, 2], [6, 6]]);
  await loopFrom(page, 'Green', [1, 3, 5, 7]);
  await pickColour(page, 'Green');
  await place(page, [[2, 2], [2, 6]]);
  await pickColour(page, 'Red');
  await place(page, [[4, 4], [4, 8]]);
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing');
    // What is on it, and nothing else.
    for (const name of ['Drums: Playing', 'Calm', 'Busy', 'Board: Playing']) await expect(ipad.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(ipad.getByRole('radiogroup', { name: 'Melody plays' })).toBeVisible();
    await expect(ipad.getByRole('button')).toHaveCount(4);
    await expect(ipad.getByRole('radio')).toHaveCount(4);
    for (const gone of [/Keep/, /Nothing kept/, /New idea/, /End the piece/, /Stop the loops/, /^Mute/, /Capture/, /Next scene/, /^Loop/]) {
      await expect(ipad.getByRole('button', { name: gone })).toHaveCount(0);
    }
    for (const b of await ipad.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThan(60);
    }
    const smallest = await ipad.evaluate(() => Math.min(...[...document.querySelectorAll('[data-simple-page] *')]
      .filter((e) => e.textContent?.trim() && e.children.length === 0).map((e) => parseFloat(getComputedStyle(e).fontSize))));
    expect(smallest).toBeGreaterThanOrEqual(14);
    await pause(page, 4000); // drums playing

    // Drums silent: lit no more, said on the laptop, the drum counters faded.
    await ipad.getByRole('button', { name: 'Drums: Playing', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByRole('button', { name: 'Drums: Silent', exact: true })).toHaveAttribute('data-lit', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Drums silenced on the iPad' })).toBeVisible();
    await expect(grid(page).getByRole('button', { name: /Green.*silenced on the iPad/ })).toHaveCount(2);
    await expect(grid(page).getByRole('button', { name: /Red.*silenced on the iPad/ })).toHaveCount(0);
    await pause(page, 6000);
    // Back, from the laptop.
    await page.getByRole('button', { name: 'Bring the drums back' }).click();
    await expect(ipad.getByRole('button', { name: 'Drums: Playing', exact: true })).toHaveAttribute('data-lit', 'true');
    await expect(page.getByText('Drums silenced on the iPad')).toHaveCount(0);
    await pause(page, 5000);

    const log = await sessionLogFile(page);
    const at = (a: string): number => log.events.find((e) => e.kind === 'action' && e.action === a)?.t ?? NaN;
    const off = at('drums silenced');
    const back = at('drums back');
    expect([off, back].every(Number.isFinite)).toBe(true);
    const between = (from: number, to: number) => log.notes.filter((n) => n.t > from && n.t < to);
    const drums = (ns: LogFile['notes']) => ns.filter((n) => n.role === 'drums');
    // Before: drums from the board and from the loop.
    expect(drums(between(0, off)).some((n) => n.source === 'loop')).toBe(true);
    expect(drums(between(0, off)).some((n) => n.source !== 'loop' && n.origin !== 'band')).toBe(true);
    // Silent (a moment after the press): no drum at all, not from the board, a loop or the band.
    expect(drums(between(off + 0.5, back))).toEqual([]);
    // Everything else plays on: the melody, from the board and from the loop.
    expect(between(off + 0.5, back).some((n) => n.role === 'melody' && n.source === 'loop')).toBe(true);
    expect(between(off + 0.5, back).some((n) => n.role === 'melody' && n.source !== 'loop')).toBe(true);
    // Back: drums again.
    expect(drums(between(back + 0.5, Infinity)).length).toBeGreaterThan(0);
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

test('Drums silent lasts through Stop and a reload of the laptop, and Show says so with its own button', async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000);
  await openLaptopBoard(page);
  await loopFrom(page, 'Green', [1, 5]);
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await ipad.getByRole('button', { name: 'Drums: Playing', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(page.getByRole('status').filter({ hasText: 'Drums silenced on the iPad' })).toBeVisible();
    await page.locator('#bs-play-stop').click();
    await page.reload();
    await page.getByRole('button', { name: /Play my board/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Drums silenced on the iPad' })).toBeVisible({ timeout: 20_000 });
    await expect(ipad.getByRole('button', { name: 'Drums: Silent', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    const row = page.getByRole('region', { name: 'Show', exact: true }).getByRole('group', { name: 'Show status' });
    await expect(row).toContainText('Drums silenced on the iPad');
    await row.getByRole('button', { name: 'Bring the drums back' }).click();
    await expect(row).not.toContainText('Drums silenced');
    await expect(ipad.getByRole('button', { name: 'Drums: Playing', exact: true })).toBeVisible();
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

test('Calm plays the loops on their main beats only; Busy adds Extra notes; the laptop says so and goes back to normal; checked in the session log', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  // Extra notes from the simple rules (Magenta is never loaded in the tests); none to start with.
  await soundTab(page);
  await page.getByRole('button', { name: /^Advanced: key, scale/ }).click();
  await page.getByRole('radiogroup', { name: 'Extra notes come from' }).getByRole('radio', { name: 'Simple rules' }).click();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await loopFrom(page, 'Green', [1, 2, 3, 4, 5, 6, 7, 8]);
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing');
    // The kept loop comes in on the next pass: the normal window starts once it plays.
    await expect(rail(page).getByRole('button', { name: /^Loop 1: 8 notes, playing/ })).toBeVisible({ timeout: 20_000 });
    await pause(page, 4000); // normal
    await ipad.getByRole('button', { name: 'Busy', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByRole('button', { name: 'Busy', exact: true })).toHaveAttribute('data-lit', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Busy (from the iPad): Extra notes round everything' })).toBeVisible();
    await pause(page, 6000);
    await ipad.getByRole('button', { name: 'Calm', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByRole('button', { name: 'Calm', exact: true })).toHaveAttribute('data-lit', 'true');
    await expect(ipad.getByRole('button', { name: 'Busy', exact: true })).toHaveAttribute('data-lit', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Calm (from the iPad): the loops play only their main beats, and no Extra notes' })).toBeVisible();
    await pause(page, 6000);
    await page.getByRole('button', { name: 'Back to normal' }).click();
    await expect(ipad.getByRole('button', { name: 'Calm', exact: true })).toHaveAttribute('data-lit', 'false');

    const log = await sessionLogFile(page);
    const at = (a: string): number => log.events.find((e) => e.kind === 'action' && e.action === a)?.t ?? NaN;
    const busy = at('busy');
    const calm = at('calm');
    const normal = at('normal');
    expect([busy, calm, normal].every(Number.isFinite)).toBe(true);
    const between = (from: number, to: number) => log.notes.filter((n) => n.t > from + 1 && n.t < to);
    const loopNotes = (from: number, to: number) => between(from, to).filter((n) => n.source === 'loop');
    const strong = (col: number) => col % 4 === 0 || col % 4 === 2;
    expect(loopNotes(0, busy).some((n) => !strong(n.col))).toBe(true);
    expect(between(0, busy).filter((n) => n.origin === 'fill')).toEqual([]);
    expect(between(busy, calm).filter((n) => n.origin === 'fill').length).toBeGreaterThan(0);
    const calmLoop = loopNotes(calm, normal);
    expect(calmLoop.length).toBeGreaterThan(0);
    expect(calmLoop.filter((n) => !strong(n.col))).toEqual([]);
    expect(between(calm, normal).filter((n) => n.origin === 'fill')).toEqual([]);
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

test('the rows the simple layout shows are chosen on the laptop; the Board button still silences the counters', async ({ page, browser }, testInfo) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Green');
  await place(page, [[1, 1], [1, 5]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await ipad.getByRole('button', { name: 'Board: Playing', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByRole('button', { name: 'Board: Silent', exact: true })).toHaveAttribute('data-lit', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Board counters silenced on the iPad' })).toBeVisible();
    await expect(grid(page).getByRole('button', { name: /silenced on the iPad/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Bring them back', exact: true }).click();
    await expect(ipad.getByRole('button', { name: 'Board: Playing', exact: true })).toBeVisible();

    const rows = page.getByRole('group', { name: 'What the simple layout shows' });
    for (const r of ['Drums', 'Calm / Busy', 'Melody instrument', 'Board']) await expect(rows.getByRole('checkbox', { name: r, exact: true })).toBeChecked();
    for (const r of ['Calm / Busy', 'Melody instrument']) await rows.getByRole('checkbox', { name: r, exact: true }).uncheck();
    await expect(ipad.getByRole('radiogroup', { name: 'Melody plays' })).toHaveCount(0);
    await expect(ipad.getByRole('button', { name: 'Calm', exact: true })).toHaveCount(0);
    const tall = (await ipad.getByRole('button', { name: /^Drums:/ }).boundingBox())!.height;
    expect(tall).toBeGreaterThan(350);
    await expect(page.getByText('✓ The iPad has the simple layout.')).toBeVisible();
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

// Pictures for a check by eye (not part of the run): IPAD_SHOTS_DIR=<folder> npx playwright test e2e/ipadSimple.e2e.ts -g pictures
test('pictures of the Simple page, dark and light, upright and on its side', async ({ page, browser }, testInfo) => {
  const dir = process.env.IPAD_SHOTS_DIR;
  test.skip(!dir, 'only when IPAD_SHOTS_DIR is set');
  test.setTimeout(240_000);
  mkdirSync(dir!, { recursive: true });
  await openLaptopBoard(page);
  await loopFrom(page, 'Green', [1, 3, 5, 7]);
  await ipadOn(page);
  // Drums silent and Busy lit, Trumpet chosen.
  {
    const { ipad, close } = await ipadFor(page, browser, testInfo);
    try {
      await ipad.getByRole('button', { name: 'Drums: Playing', exact: true }).dispatchEvent('pointerdown', touch);
      await ipad.getByRole('button', { name: 'Busy', exact: true }).dispatchEvent('pointerdown', touch);
      await ipad.getByRole('radio', { name: 'Trumpet' }).dispatchEvent('pointerdown', touch);
      await expect(ipad.getByRole('button', { name: 'Busy', exact: true })).toHaveAttribute('data-lit', 'true');
      await expect(ipad.getByRole('button', { name: 'Drums: Silent', exact: true })).toBeVisible();
    } finally {
      await close();
    }
  }
  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') await (await headerButton(page, 'Switch to light mode')).click();
    for (const size of [{ width: 810, height: 1080 }, { width: 1080, height: 810 }]) {
      const { ipad, close } = await ipadFor(page, browser, testInfo, size);
      try {
        await expect(ipad.getByRole('button', { name: 'Drums: Silent', exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(ipad.getByRole('radio', { name: 'Trumpet' })).toHaveAttribute('aria-checked', 'true');
        await ipad.waitForTimeout(700);
        await ipad.screenshot({ path: join(dir!, `ipad-simple-${mode}-${size.width}x${size.height}.png`) });
      } finally {
        await close();
      }
    }
  }
  // Only Drums and the Board, upright and dark, the drums playing again.
  await (await headerButton(page, 'Switch to dark mode')).click();
  await page.getByRole('button', { name: 'Bring the drums back' }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  const rows = page.getByRole('group', { name: 'What the simple layout shows' });
  for (const r of ['Calm / Busy', 'Melody instrument']) await rows.getByRole('checkbox', { name: r, exact: true }).uncheck();
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('button', { name: 'Drums: Playing', exact: true })).toBeVisible({ timeout: 15_000 });
    await ipad.waitForTimeout(700);
    await ipad.screenshot({ path: join(dir!, 'ipad-simple-dark-810x1080-drums-and-board.png') });
  } finally {
    await close();
  }
});
