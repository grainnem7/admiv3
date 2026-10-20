import { test, expect } from '@playwright/test';
import { notesPlayed, openLaptopBoard, pageErrors, pickColour, pieceStep, place } from './app';

/**
 * The Sound tab and the loop edit window, as a musician uses them: each colour's own
 * sound, the overall feel, and a loop compared with the board before it is changed.
 */

test('a colour card changes that colour, and the choice is kept after a reload', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Sound' }).click();
  const red = page.getByRole('group', { name: /^Red: Melody/ });
  await expect(red).toBeVisible();
  // By part: the melody plays one note per counter until it is told otherwise.
  const plays = red.getByRole('radiogroup', { name: 'Each counter plays' });
  await expect(plays.getByRole('radio', { name: 'One note' })).toHaveAttribute('aria-checked', 'true');
  await plays.getByRole('radio', { name: 'A tune' }).click();
  await red.getByRole('button', { name: 'Next sound' }).click();
  await expect(red.getByRole('button', { name: /Reset Red/ })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Lively' }).click();

  await page.waitForTimeout(800); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await page.getByRole('tab', { name: 'Sound' }).click();
  const after = page.getByRole('group', { name: /^Red: Melody/ });
  await expect(after.getByRole('radiogroup', { name: 'Each counter plays' }).getByRole('radio', { name: 'A tune' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Lively' })).toHaveAttribute('aria-checked', 'true');

  // Reset puts the colour back to the world's sound.
  await after.getByRole('button', { name: /Reset Red/ }).click();
  await expect(after.getByRole('radiogroup', { name: 'Each counter plays' }).getByRole('radio', { name: 'One note' })).toHaveAttribute('aria-checked', 'true');
  expect(pageErrors(page)).toEqual([]);
});

test('the helpers play: extra notes on, then frozen', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5]]);
  await page.getByRole('tab', { name: 'Sound' }).click();
  const extra = page.getByRole('group', { name: 'Extra notes' });
  await extra.getByRole('radio', { name: 'Some' }).click();
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  const freeze = extra.getByRole('button', { name: /Freeze/ });
  await expect(freeze).toBeEnabled({ timeout: 15_000 });
  await freeze.click();
  await expect(extra.getByRole('button', { name: /Frozen/ })).toHaveAttribute('aria-pressed', 'true');
  expect(pageErrors(page)).toEqual([]);
});

test('the loop edit window shows the board beside the loop, and copies one into the other', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await place(page, [[2, 2], [6, 4]]);

  await page.getByRole('button', { name: 'Edit the notes of loop 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /The board now · 2 counters/ })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Loop 1 as saved' })).toBeVisible();
  // The loop has notes, so copying asks for a second press.
  const copy = dialog.getByRole('button', { name: /Copy the board into this loop/ });
  await copy.click();
  await dialog.getByRole('button', { name: /Press again/ }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /^Loop 1: .*2 notes/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the laptop board can add more colours, each with a job, and they play', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: '+ Add a colour' }).click();
  await page.getByRole('group', { name: "The new colour's job" }).getByRole('button', { name: 'Melody' }).click();
  await page.getByRole('button', { name: '+ Add a colour' }).click();
  await page.getByRole('group', { name: "The new colour's job" }).getByRole('button', { name: 'Drums' }).click();
  const colours = page.getByRole('radiogroup', { name: 'Counter to put down' });
  await expect(colours.getByRole('radio', { name: /Orange/ })).toBeVisible();
  await expect(colours.getByRole('radio', { name: /Purple/ })).toBeVisible();
  await pickColour(page, 'Orange');
  await place(page, [[4, 1]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.getByRole('group', { name: /^Orange: Melody/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
