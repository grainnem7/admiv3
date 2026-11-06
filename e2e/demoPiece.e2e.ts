import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors } from './app';

/**
 * The demo piece, Rising Light (2026-11-06): opened from Who's playing?, as a player of its
 * own, it starts with Dawn and brings the Theme in at 0:44, on its pass.
 */

test('▶ Open the demo piece: a player called Demo piece, its loops named, and the piece starts with Dawn, then the Theme at 0:44', async ({ page }) => {
  test.setTimeout(150_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await chooser.getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  const rail = page.locator('[data-loop-rail]');
  for (const name of ['Bells', 'Piano theme', 'Pulse', 'Swells', 'Percussion heartbeat']) await expect(rail.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  const nowNext = page.getByRole('region', { name: 'Now and next' });
  await expect(nowNext).toContainText('Now: Dawn', { timeout: 15_000 });
  await expect(nowNext).toContainText('Theme');
  await expect(nowNext).toContainText('Now: Theme', { timeout: 70_000 });
  // The player the demo was made from is still there, as it was.
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});
