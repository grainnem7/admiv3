import { test, expect, type Locator, type Page } from '@playwright/test';
import { makePlan, openEmptyLaptopBoard, openLaptopBoard, openLaptopSetup, pageErrors, pickColour, pieceStep, place } from './app';

/**
 * Keyboard only: after each main button, focus lands on what took its place, never on the
 * page itself (T1-04, T4-09). Each button is pressed with Enter, as the owner does on the
 * laptop, and focus is read straight after.
 */

/** Press a button the way a keyboard user does: focus it, then Enter. */
async function enter(page: Page, button: Locator): Promise<void> {
  await button.focus();
  await page.keyboard.press('Enter');
}

/** Focus is on this, and so not on the page. */
async function focusIsOn(target: Locator, timeout?: number): Promise<void> {
  await expect(target).toBeFocused(timeout === undefined ? undefined : { timeout });
  expect(await target.page().evaluate(() => document.activeElement !== document.body)).toBe(true);
}

test('set-up: Add four colours leads to the colours, ▶ Play to ■ Stop', async ({ page }) => {
  await openLaptopSetup(page);
  await enter(page, page.getByRole('button', { name: 'Add four colours' }));
  await focusIsOn(page.getByRole('heading', { name: 'Your colours (4)' }));
  await enter(page, page.getByRole('button', { name: 'Continue' }));
  await focusIsOn(page.getByRole('heading', { name: 'Ready to play' }));
  await enter(page, page.getByRole('button', { name: '▶ Play', exact: true }));
  // One button that reads ▶ Play, then ■ Stop once the sound is ready: one press from stopping.
  const transport = page.getByRole('button', { name: '■ Stop', exact: true });
  await focusIsOn(transport, 20_000);
  expect(pageErrors(page)).toEqual([]);
});

test('the laptop board: Add four colours leads to the colour to put down', async ({ page }) => {
  await openEmptyLaptopBoard(page);
  await enter(page, page.getByRole('button', { name: 'Add four colours' }));
  await focusIsOn(page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { checked: true }));
  expect(pageErrors(page)).toEqual([]);
});

test('loops: New loop, Start with these, Keep, Done and Leave each leave focus where the next step is', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await pieceStep(page, 'Loops');
  const newLoop = page.getByRole('button', { name: 'New loop', exact: true });
  await enter(page, newLoop);
  const heading = page.getByRole('heading', { name: /^New loop 1/ });
  await focusIsOn(heading);
  await enter(page, page.getByRole('button', { name: 'Start with these' }));
  await focusIsOn(heading);
  await enter(page, page.getByRole('button', { name: 'Keep', exact: true }));
  await focusIsOn(page.getByRole('textbox', { name: 'Name of the new loop' }));
  // Done: back on New loop, so the next loop is one Enter away.
  await enter(page, page.getByRole('button', { name: 'Done', exact: true }));
  await focusIsOn(newLoop);
  await page.keyboard.press('Enter');
  await focusIsOn(page.getByRole('heading', { name: /^New loop 2/ }));
  // Leave: the same.
  await enter(page, page.getByRole('button', { name: 'Leave', exact: true }));
  await focusIsOn(newLoop);
  expect(pageErrors(page)).toEqual([]);
});

test('the piece: Make my plan, Delete scene, Undo and Rehearse from here each leave focus where the next step is', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceStep(page, 'Scenes');
  // Make my plan: onto the first scene.
  await enter(page, page.getByRole('button', { name: /Make my plan/ }));
  await focusIsOn(page.getByRole('button', { name: /^0:00 · Arrival/ }));
  // Delete scene: onto Undo, its opposite; Undo: onto the scene that came back.
  await enter(page, page.getByRole('button', { name: /^1:30 · Build/ }));
  await enter(page, page.getByRole('button', { name: 'Delete scene' }));
  await focusIsOn(page.getByRole('button', { name: 'Undo', exact: true }));
  await page.keyboard.press('Enter');
  await focusIsOn(page.getByRole('button', { name: /^1:30 · Build/ }));
  // Rehearse from here: onto ■ Stop once the rehearsal plays, one press from stopping it.
  await enter(page, page.getByRole('button', { name: /^Rehearse from Home/ }));
  await focusIsOn(page.getByRole('button', { name: '■ Stop', exact: true }), 20_000);
  expect(pageErrors(page)).toEqual([]);
});

test('Show: ▶ Start the piece leads to ■ Stop, and the second press of Stop back to ▶ Start the piece', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await enter(page, page.getByRole('button', { name: /^Show: the board, the clock/ }));
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await enter(page, show.getByRole('button', { name: '▶ Start the piece' }));
  await focusIsOn(show.getByRole('button', { name: '■ Stop', exact: true }), 20_000);
  // The clock runs, so the first press only gets Stop ready (it waits 4 s for the second).
  await page.keyboard.press('Enter');
  await focusIsOn(show.getByRole('button', { name: '■ Press again to stop' }));
  await page.keyboard.press('Enter');
  await focusIsOn(show.getByRole('button', { name: '▶ Start the piece' }));
  // Leave Show: back on the Show button.
  await enter(page, show.getByRole('button', { name: 'Leave Show' }));
  await focusIsOn(page.getByRole('button', { name: /^Show: the board, the clock/ }));
  expect(pageErrors(page)).toEqual([]);
});
