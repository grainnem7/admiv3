import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors, pieceStep, sceneCard, selectScene } from './app';

/**
 * The demo piece, Rising Light version 2 (2026-11-06): opened from Who's playing?, as a player
 * of its own, it starts with the drums alone and brings the brass in at 0:22, on its pass. Its
 * sixteen scenes all show, and the sixteenth plays.
 */

test('▶ Open the demo piece: a player called Demo piece, its loops named, and the piece starts with the Drums, then the Brass at 0:22', async ({ page }) => {
  test.setTimeout(150_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await chooser.getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  const rail = page.locator('[data-loop-rail]');
  for (const name of ['Percussion heartbeat', 'Brass pad', 'Guitar roll', 'Winds theme', 'Bells']) await expect(rail.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  const nowNext = page.getByRole('region', { name: 'Now and next' });
  await expect(nowNext).toContainText('Now: Drums', { timeout: 15_000 });
  await expect(nowNext).toContainText('Brass');
  await expect(nowNext).toContainText('Now: Brass', { timeout: 40_000 });
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});

test('the demo’s sixteen scenes all show on the storyboard, and the sixteenth plays', async ({ page }) => {
  test.setTimeout(90_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  await pieceStep(page, 'Scenes');
  await expect(page.locator('[data-scene-card]')).toHaveCount(16);
  await expect(sceneCard(page, 'Drums')).toBeVisible();
  await selectScene(page, 'Final ascent');
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: 'Jump here now: Final ascent' }).click();
  await expect(sceneCard(page, 'Final ascent')).toHaveAttribute('data-on-now', '');
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  expect(pageErrors(page)).toEqual([]);
});
