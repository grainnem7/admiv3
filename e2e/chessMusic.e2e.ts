import { test, expect } from '@playwright/test';
import { listenToOutput, openWelcome, outputLevels, pageErrors } from './app';

/** Chess music: the built in game is heard, move by move. */
test('Chess music plays the built in game: a move is heard, Pause stops, Restart goes back', async ({ page }) => {
  await listenToOutput(page);
  await openWelcome(page);
  await page.getByRole('button', { name: 'Chess music' }).click();
  await expect(page.getByRole('heading', { name: 'Chess music' })).toBeVisible();
  const quiet = Math.max(...await outputLevels(page, 2, 200));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText(/Move 1: e4/)).toBeVisible();
  const levels = await outputLevels(page, 12, 250);
  expect(Math.max(...levels)).toBeGreaterThan(Math.max(0.005, quiet * 4));
  await expect.poll(() => page.getByRole('list', { name: 'Moves' }).getByRole('listitem').count()).toBeGreaterThanOrEqual(3); // a move a second
  // The tension comes from Stockfish, in a worker in the page.
  await expect(page.getByTestId('tension')).toContainText('tension from Stockfish', { timeout: 20_000 });
  await expect(page.getByRole('img', { name: /^Evaluation: / })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  // Sounds for each piece: change one, mute one.
  await page.getByText('Sounds for each piece').click();
  await page.getByRole('combobox', { name: 'Sound for White queen' }).selectOption('violin');
  const mute = page.getByRole('button', { name: 'Mute White pawns' });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByText('Press Play to hear the game.')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
