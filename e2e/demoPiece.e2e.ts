import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors } from './app';

/**
 * The demo piece (owner's request 2026-11-06): opened from Who's playing?, as a player of
 * its own, it starts with the drums alone and brings the trombone in on its pass.
 */

test('▶ Open the demo piece: a player called Demo piece, its loops named, and the piece starts with the drums and pads, then the trombone', async ({ page }) => {
  test.setTimeout(150_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await chooser.getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  const rail = page.locator('[data-loop-rail]');
  for (const name of ['Drums', 'Trombone', 'Guitar', 'Harp', 'Clarinet']) await expect(rail.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  const nowNext = page.getByRole('region', { name: 'Now and next' });
  await expect(nowNext).toContainText('Now: Drums', { timeout: 15_000 });
  await expect(nowNext).toContainText('Trombone');
  await expect(nowNext).toContainText('Now: Trombone', { timeout: 70_000 });
  // The player the demo was made from is still there, as it was.
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});
