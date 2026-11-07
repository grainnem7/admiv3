import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors, pieceStep, sceneCard, selectScene } from './app';

/**
 * The demo piece, Rising Light version 3 (2026-11-06): opened from Who's playing?, as a player
 * of its own, it starts with the drums alone and the Groove lands at 1:06, on its pass. Its
 * thirteen scenes all show, and the last plays.
 */

test('▶ Open the demo piece: a player called Demo piece, its loops named, and the piece starts with the Drums, then the Groove at 1:06', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await chooser.getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  const rail = page.locator('[data-loop-rail]');
  for (const name of ['Tribal', 'Groove', 'Double time', 'Brass swells', 'Guitar eighths', 'Winds theme', 'Bells in threes']) await expect(rail.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  const nowNext = page.getByRole('region', { name: 'Now and next' });
  await expect(nowNext).toContainText('Now: Drums', { timeout: 15_000 });
  await expect(nowNext).toContainText('Now: Groove', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});

test('the demo’s thirteen scenes all show on the storyboard, and the last plays', async ({ page }) => {
  test.setTimeout(90_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  await pieceStep(page, 'Scenes');
  await expect(page.locator('[data-scene-card]')).toHaveCount(13);
  await expect(sceneCard(page, 'Drums')).toBeVisible();
  await selectScene(page, 'Final ascent');
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: 'Jump here now: Final ascent' }).click();
  await expect(sceneCard(page, 'Final ascent')).toHaveAttribute('data-on-now', '');
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  expect(pageErrors(page)).toEqual([]);
});
