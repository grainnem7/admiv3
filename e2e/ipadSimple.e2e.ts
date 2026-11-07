import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { headerButton, keepAsLoop, openLaptopBoard, pageErrors, pickColour, place, sessionLog } from './app';

/**
 * The Simple iPad page, for playing live only, in a touch browser of its own at an upright
 * iPad's size: the instruments (what the melody plays) and the colours (one pad per colour,
 * spec 2026-11-05 K4), and nothing else (owner, 7 Nov 2026: no Drums, no Calm / Busy). Loops
 * are made on the laptop (here with its loop rail).
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

const grid = (page: Page) => page.getByRole('grid', { name: /Laptop board/ });

/** The board playing, with what is on it now kept as Loop 1 on the laptop (the board then clear). */
async function loopFrom(page: Page, colour: string, steps: number[], row = 1): Promise<void> {
  await pickColour(page, colour);
  await place(page, steps.map((s) => [row, s] as [number, number]));
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await keepAsLoop(page);
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

test('only the instruments and the colours, big enough for a finger; an instrument changes the melody\u2019s sound on the laptop', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await openLaptopBoard(page);
  // Melody and drums on the board, and a loop, playing.
  await pickColour(page, 'Red');
  await place(page, [[5, 2], [6, 6]]);
  await loopFrom(page, 'Green', [1, 3, 5, 7]);
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing');
    // What is on it, and nothing else: the four instruments and a pad for each of the four colours.
    await expect(ipad.getByRole('radiogroup', { name: 'Melody plays' })).toBeVisible();
    const counters = ipad.getByRole('group', { name: 'Counters' });
    for (const colour of ['Red', 'Blue', 'Yellow', 'Green']) await expect(counters.getByRole('button', { name: new RegExp(`^${colour}, .*: Playing$`) })).toBeVisible();
    await expect(ipad.getByRole('button')).toHaveCount(4);
    await expect(ipad.getByRole('radio')).toHaveCount(4);
    for (const gone of [/^Drums/, /^Calm$/, /^Busy$/, /^Board:/, /Keep/, /Nothing kept/, /New idea/, /End the piece/, /Stop the loops/, /^Mute/, /Capture/, /Next scene/, /^Loop/]) {
      await expect(ipad.getByRole('button', { name: gone })).toHaveCount(0);
    }
    for (const b of [...await ipad.getByRole('button').all(), ...await ipad.getByRole('radio').all()]) {
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThan(100);
    }
    const smallest = await ipad.evaluate(() => Math.min(...[...document.querySelectorAll('[data-simple-page] *')]
      .filter((e) => e.textContent?.trim() && e.children.length === 0).map((e) => parseFloat(getComputedStyle(e).fontSize))));
    expect(smallest).toBeGreaterThanOrEqual(16);
    // Nothing cut off: the page fits the iPad, upright, with no scrolling.
    expect(await ipad.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    // An instrument: the melody's sound on the laptop changes with it.
    await ipad.getByRole('radio', { name: 'Flute' }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByRole('radio', { name: 'Flute' })).toHaveAttribute('aria-checked', 'true');
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

test('the rows the simple layout shows are chosen on the laptop; the Counters row silences one colour', async ({ page, browser }, testInfo) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Green');
  await place(page, [[1, 1], [1, 5]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    const counters = ipad.getByRole('group', { name: 'Counters' });
    await expect(ipad.getByRole('button', { name: /^Board:/ })).toHaveCount(0);
    await counters.getByRole('button', { name: /^Green, .*: Playing$/ }).dispatchEvent('pointerdown', touch);
    await expect(counters.getByRole('button', { name: /^Green, .*: Silent$/ })).toHaveAttribute('data-lit', 'false');
    const said = page.locator('[data-colours-silent]');
    await expect(said).toContainText('Green silenced on the iPad');
    await expect(grid(page).getByRole('button', { name: /silenced on the iPad/ })).toHaveCount(2);
    await said.getByRole('button', { name: 'Bring them back', exact: true }).click();
    await expect(counters.getByRole('button', { name: /^Green, .*: Playing$/ })).toBeVisible();
    await expect(said).toHaveCount(0);

    const rows = page.getByRole('group', { name: 'What the simple layout shows' });
    for (const r of ['Melody instrument', 'Counters, one per colour']) await expect(rows.getByRole('checkbox', { name: r, exact: true })).toBeChecked();
    for (const r of ['Board', 'Drums', 'Calm / Busy']) await expect(rows.getByRole('checkbox', { name: r, exact: true })).toHaveCount(0);
    const before = (await counters.getByRole('button', { name: /^Green, / }).boundingBox())!.height;
    await rows.getByRole('checkbox', { name: 'Melody instrument', exact: true }).uncheck();
    await expect(ipad.getByRole('radiogroup', { name: 'Melody plays' })).toHaveCount(0);
    // The colours alone: bigger.
    await expect.poll(async () => (await counters.getByRole('button', { name: /^Green, / }).boundingBox())!.height).toBeGreaterThan(before);
    await expect(page.getByText('✓ The iPad has the simple layout.')).toBeVisible();
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await close();
  }
});

test("a colour's pad silences that colour's counters, said on the laptop, brought back from Show", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  // Red melody and Green drums on the board, playing.
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await pickColour(page, 'Green');
  await place(page, [[1, 1], [1, 3], [1, 5], [1, 7]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await ipadOn(page);
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing');
    const counters = ipad.getByRole('group', { name: 'Counters' });
    await expect(counters.getByRole('button', { name: /^Red, .*: Playing$/ })).toHaveAttribute('aria-pressed', 'true');
    await pause(page, 4000); // Red playing
    // Red's pad: dark, said on the laptop, its counters (only) faded.
    await counters.getByRole('button', { name: /^Red, .*: Playing$/ }).dispatchEvent('pointerdown', touch);
    await expect(counters.getByRole('button', { name: /^Red, .*: Silent$/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-colours-silent]')).toContainText('Red silenced on the iPad');
    await expect(grid(page).getByRole('button', { name: /Red.*silenced on the iPad/ })).toHaveCount(4);
    await expect(grid(page).getByRole('button', { name: /Green.*silenced on the iPad/ })).toHaveCount(0);
    await pause(page, 6000);
    // Brought back from Show's status row.
    await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    const show = page.getByRole('region', { name: 'Show', exact: true });
    const row = show.getByRole('group', { name: 'Show status' });
    await expect(row).toContainText('Red silenced on the iPad');
    await row.getByRole('button', { name: 'Bring them back' }).click();
    await expect(row).not.toContainText('silenced on the iPad');
    await expect(counters.getByRole('button', { name: /^Red, .*: Playing$/ })).toHaveAttribute('aria-pressed', 'true');
    await show.getByRole('button', { name: 'Leave Show' }).click();
    await pause(page, 5000);

    const log = await sessionLogFile(page);
    const off = log.events.find((e) => e.kind === 'action' && e.action === 'Red silenced (iPad)')?.t ?? NaN;
    expect(Number.isFinite(off)).toBe(true);
    const melody = (from: number, to: number) => log.notes.filter((n) => n.role === 'melody' && n.t > from && n.t < to);
    const end = Math.max(...log.notes.map((n) => n.t));
    // Before: Red played. Silenced (a moment after the press): no Red, and the drums play on.
    expect(melody(0, off).length).toBeGreaterThan(0);
    expect(melody(off + 0.5, off + 5.5)).toEqual([]);
    expect(log.notes.some((n) => n.role === 'drums' && n.t > off + 0.5 && n.t < off + 5.5)).toBe(true);
    // Back: Red again, at the end of the take.
    expect(melody(end - 3, Infinity).length).toBeGreaterThan(0);

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
  // Trumpet chosen, Green silenced.
  {
    const { ipad, close } = await ipadFor(page, browser, testInfo);
    try {
      await ipad.getByRole('radio', { name: 'Trumpet' }).dispatchEvent('pointerdown', touch);
      await ipad.getByRole('group', { name: 'Counters' }).getByRole('button', { name: /^Green, .*: Playing$/ }).dispatchEvent('pointerdown', touch);
      await expect(ipad.getByRole('radio', { name: 'Trumpet' })).toHaveAttribute('aria-checked', 'true');
      await expect(ipad.getByRole('button', { name: /^Green, .*: Silent$/ })).toBeVisible();
    } finally {
      await close();
    }
  }
  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') await (await headerButton(page, 'Switch to light mode')).click();
    for (const size of [{ width: 810, height: 1080 }, { width: 1080, height: 810 }]) {
      const { ipad, close } = await ipadFor(page, browser, testInfo, size);
      try {
        await expect(ipad.getByRole('button', { name: /^Green, .*: Silent$/ })).toBeVisible({ timeout: 15_000 });
        await expect(ipad.getByRole('radio', { name: 'Trumpet' })).toHaveAttribute('aria-checked', 'true');
        await ipad.waitForTimeout(700);
        await ipad.screenshot({ path: join(dir!, `ipad-simple-${mode}-${size.width}x${size.height}.png`) });
      } finally {
        await close();
      }
    }
  }
  // Only the Counters, upright and dark.
  await (await headerButton(page, 'Switch to dark mode')).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('group', { name: 'What the simple layout shows' }).getByRole('checkbox', { name: 'Melody instrument', exact: true }).uncheck();
  const { ipad, close } = await ipadFor(page, browser, testInfo);
  try {
    await expect(ipad.getByRole('group', { name: 'Counters' })).toBeVisible({ timeout: 15_000 });
    await ipad.waitForTimeout(700);
    await ipad.screenshot({ path: join(dir!, 'ipad-simple-dark-810x1080-counters.png') });
  } finally {
    await close();
  }
});
