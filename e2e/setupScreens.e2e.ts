import { test, expect, type Page } from '@playwright/test';
import { makePlan, openLaptopBoard, openLaptopSetup, pageErrors, pickColour, pieceStep, place, sceneMore } from './app';

/**
 * The set-up screens (audit 2026-10-30, batch 4): the folds (A1), one word list (A2), the
 * layout (A3), the visible questions and the Ready check's buttons (A14), the session log
 * folded (A15), and ↶ kept from set-up (A16). Laptop board only.
 */

const boardBox = async (page: Page): Promise<string> => {
  const b = await page.getByRole('grid', { name: /Laptop board/ }).boundingBox();
  return b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'none';
};
/** The header's buttons, in rows by their top edge. */
const headerRows = (page: Page): Promise<number> => page.locator('header').evaluate((h) => new Set(
  [...h.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent !== null).map((b) => Math.round(b.getBoundingClientRect().top / 10)),
).size);
const sideways = (page: Page): Promise<boolean> => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test('the header: one row, the less-used buttons under More at every width, and the board keeps its place and size (A3, U4)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  expect(await headerRows(page)).toBe(1);
  // Under More: the audience screen, Set up, Camera / Laptop. The same buttons, doing the same.
  await expect(page.getByRole('button', { name: 'Open the audience screen' })).toBeHidden();
  const more = page.getByRole('button', { name: 'More ▾', exact: true });
  await more.click();
  const menu = page.getByRole('group', { name: 'More', exact: true });
  await expect(menu.getByRole('button', { name: 'Open the audience screen' })).toBeVisible();
  await expect(menu.getByRole('button', { name: '⚙ Set up' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^Camera board/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'More ▾', exact: true })).toBeFocused();
  // One width of panel, 400 to 480 px: the board doesn't move between Board and Make a piece,
  // nor when play starts, nor when a notice (Undo) comes.
  const board = await boardBox(page);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  expect(await boardBox(page)).toBe(board);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => headerRows(page)).toBe(1);
  expect(await boardBox(page)).toBe(board);
  await page.locator('#bs-play-stop').click();
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Board cleared.' }).filter({ has: page.getByRole('button', { name: 'Undo' }) })).toBeVisible();
  expect(await boardBox(page)).toBe(board);
  // Wide: still under More (U4), still one row: at 1400 the header used to wrap.
  for (const w of [1400, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await expect(page.getByRole('button', { name: 'Open the audience screen' })).toBeHidden();
    await expect(page.locator('header').getByRole('button', { name: /^More [▾▴]$/ })).toBeVisible();
    await expect.poll(() => headerRows(page), { message: `at ${w}` }).toBe(1);
  }
  for (const [w, h] of [[1024, 768], [1180, 820], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(() => headerRows(page), { message: `at ${w}` }).toBe(1);
    // The card itself (U8): its padding is inside the 400 to 480 px.
    const panel = await page.locator('.bs-panel').evaluate((el) => el.getBoundingClientRect().width);
    expect(panel, `panel at ${w}`).toBeGreaterThanOrEqual(399);
    expect(panel, `panel at ${w}`).toBeLessThanOrEqual(481);
    expect(await sideways(page), `at ${w}`).toBe(false);
  }
  // At 320 px nothing scrolls sideways, on the Board view or in Make a piece.
  await page.setViewportSize({ width: 320, height: 640 });
  // Once the board has resized to the narrow window (it follows the size a moment later).
  await expect.poll(() => sideways(page), { timeout: 5000 }).toBe(false);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await expect.poll(() => sideways(page), { timeout: 5000 }).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test('Make a piece: a scene shows its name, time, loops and Energy, the rest under More for this scene, which still edits it and is remembered (A1, A2)', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  // Folded: Energy by the Sound tab's names, in view; More says the rest in one line.
  const energy = page.getByRole('radiogroup', { name: 'Energy of this scene' });
  await expect(energy.getByRole('radio')).toHaveText(['Off', 'Calm', 'Steady', 'Lively', 'Driving', 'Big']);
  const more = page.getByRole('button', { name: /More for this scene/ });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toContainText('90 BPM');
  await expect(page.getByRole('radiogroup', { name: 'Sound world' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete scene' })).toBeVisible();
  // Open: everything it set, and a change is kept.
  await sceneMore(page);
  await page.getByRole('radiogroup', { name: 'Sound world' }).getByRole('radio', { name: 'Lo-fi' }).click();
  await page.getByRole('slider', { name: /^Speed/ }).fill('120');
  await page.getByRole('radiogroup', { name: 'Extra notes' }).getByRole('radio', { name: 'Some', exact: true }).click();
  await page.waitForTimeout(1200); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(page, 'Scenes');
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  // Remembered for the session: More is still open after the reload.
  await expect(page.getByRole('button', { name: /More for this scene/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Sound world' }).getByRole('radio', { name: 'Lo-fi' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: /^Speed/ })).toHaveValue('120');
  await expect(page.getByRole('radiogroup', { name: 'Extra notes' }).getByRole('radio', { name: 'Some', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(pageErrors(page)).toEqual([]);
});

test('the Sound tab: each helper one line until opened; the Timing tab; New idea; the session log folded (A1, A2, A15)', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Sound' }).click();
  const extra = page.getByRole('group', { name: 'Extra notes' });
  const fold = extra.getByRole('button', { name: /^▸?\s*Extra notes/ });
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toContainText('Off');
  await expect(extra.getByRole('radiogroup', { name: 'How many' })).toHaveCount(0);
  await fold.click();
  await extra.getByRole('radiogroup', { name: 'How many' }).getByRole('radio', { name: 'Some' }).click();
  await expect(extra.getByRole('button', { name: 'New idea: other extra notes' })).toHaveText('↻ New idea');
  await expect(page.getByRole('button', { name: /Try another/ })).toHaveCount(0);
  // Timing, not Groove: the speed is Speed, and the two swings say which is which.
  await expect(page.getByRole('tab', { name: 'Groove' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Timing' }).click();
  await expect(page.getByRole('slider', { name: /^Speed/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: /^Loose timing/ })).toBeVisible();
  await expect(page.getByText(/Groove \(Straight, Swung, Lazy\) sets Swing and Loose timing in one step/)).toBeVisible();
  // The research tools: folded under Session log, inside Details (U4), both closed by default.
  await expect(page.getByRole('button', { name: /^Save session/ })).toBeHidden();
  await page.locator('details[data-board-details] > summary').click();
  await expect(page.getByRole('button', { name: /^Save session/ })).toBeHidden();
  await page.locator('details[data-session-log] > summary').click();
  await expect(page.getByRole('button', { name: /^Save session/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Describe board' })).toBeVisible();
  // The hat's line says Hat, not a cap emoji.
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // On the laptop board there is no camera for the hat, so no hat line under the board (U7);
  // the word is Hat, not a cap emoji, where it shows (the camera board: capCamera.e2e.ts).
  await expect(page.getByRole('status', { name: 'Red cap' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('the Ready check: a fix made elsewhere has a button that goes there (A14)', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Ending & check');
  // No scenes yet: Go to Scenes opens step 2.
  await page.getByRole('button', { name: /^Go to Scenes: No scenes yet/ }).click();
  await expect(page.getByRole('heading', { name: '2 · Scenes' })).toBeVisible();
  await pieceStep(page, 'Ending & check');
  // The laptop board is advice, with the button that changes it, not "press 📷 Camera at the top".
  // Advice is one line until pressed (U7).
  await page.getByRole('button', { name: /^Board: the laptop board/ }).click();
  await expect(page.getByText('For the performance with the real board, use the camera board.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Use the camera board: Board: the laptop board/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('↶ keeps the sound before from Set up into the Board view, and the laptop set-up says nothing of a camera (A16)', async ({ page }) => {
  await openLaptopSetup(page);
  await expect(page.getByText(/Camera: /)).toHaveCount(0);
  const sound = page.getByRole('combobox', { name: 'Red: sound' });
  const before = await sound.inputValue();
  const other = await sound.locator('option').evaluateAll((os, b) => (os as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== '' && v !== b) ?? '', before);
  await sound.selectOption(other);
  await page.getByRole('button', { name: 'Continue' }).click();
  // Ready → ▶ Play the board: the Board view, where the Sound tab has its own colour table.
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
  await page.getByRole('tab', { name: 'Sound' }).click();
  const back = page.getByRole('button', { name: "Back to Red's sound before" });
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page.getByRole('combobox', { name: 'Red: sound' })).toHaveValue(before);
  expect(pageErrors(page)).toEqual([]);
});
