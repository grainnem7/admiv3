import { test, expect } from '@playwright/test';
import { makePlan, notesPlayed, openLaptopBoard, pageErrors, pickColour, pieceStep, place, startPiece } from './app';

/**
 * The show, end to end on the laptop board: what a facilitator does to build and run a
 * performance, checked in a real browser with real sound scheduling.
 */

test('counters placed on the laptop board are played', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a piece made in Make a piece survives a reload and opens in its first scene', async ({ page }) => {
  await openLaptopBoard(page);
  // Two loops: chords and a bassline, in step 1.
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1], [4, 5]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bed');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('button', { name: 'Clear the board' }).click();

  await page.getByRole('button', { name: /Next: Scenes/ }).click();
  await page.getByRole('button', { name: /Make my plan/ }).click();
  const timeline = page.getByRole('list', { name: 'Timeline of the scenes' });
  await expect(timeline.getByRole('listitem')).toHaveText(['Arrival 0:00', 'Build 1:30', 'Open 3:30', 'Home 6:00']);

  // Saved: a reload brings the loops and the scenes back.
  await page.waitForTimeout(800); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(page, 'Scenes');
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' }).getByRole('listitem')).toHaveCount(4);
  await pieceStep(page, 'Loops');
  await expect(page.getByRole('textbox', { name: 'Name of loop 1' })).toHaveValue('Bed');

  // Play: the opening scene is on from the start, with its loop.
  await startPiece(page);
  const strip = page.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Arrival');
  await expect(strip).toContainText('Next: Build in');
  await expect(strip).toContainText('Bed');
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a scene time is checked as it is typed', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await page.getByRole('button', { name: /1:30 · Build/ }).click();
  await page.getByRole('textbox', { name: /When Build comes in/ }).fill('9:00');
  await expect(page.getByRole('alert').filter({ hasText: 'After the end of the piece' })).toBeVisible();
});

test('while the clock runs, Exit and Set up need a second press too', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await startPiece(page);
  await expect(page.getByRole('timer').first()).toBeVisible();
  // One press of Exit: still here, still playing.
  await page.getByRole('button', { name: 'Exit the Board Sequencer' }).click();
  await expect(page.getByRole('button', { name: 'Press again to stop the piece and exit' })).toBeVisible();
  await expect(page.getByRole('timer').first()).toBeVisible();
  // One press of Set up: the same.
  await page.getByRole('button', { name: '⚙ Set up' }).click();
  await expect(page.getByRole('button', { name: '⚙ Press again to stop and set up' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  // The second press leaves.
  await page.getByRole('button', { name: '⚙ Press again to stop and set up' }).click();
  await expect(page.getByRole('button', { name: '▶ Play' }).first()).toBeHidden();
});

test('while the clock runs, Stop needs a second press', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await startPiece(page);
  await expect(page.getByRole('timer').first()).toBeVisible();
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  await expect(page.getByRole('button', { name: '■ Press again to stop' }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expect(page.getByRole('button', { name: '▶ Play' }).first()).toBeVisible();
});

test('End now: the chosen ending runs, then the piece stops by itself', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page); // Arrival sets band Gentle
  await startPiece(page);
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  await page.getByRole('region', { name: 'Now and next' }).getByRole('button', { name: '⏹ End' }).click();
  await expect(page.getByRole('button', { name: 'Cancel the ending' }).first()).toBeVisible();
  // A fade over two passes, from the next pass: well under a minute at 90 BPM on 8 steps.
  await expect(page.getByRole('button', { name: '▶ Play' }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('region', { name: 'Now and next' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('step 3 checks what is ready, and says what to fix', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Ending & check');
  await expect(page.getByText('Board: the laptop board')).toBeVisible();
  await expect(page.getByText('No scenes yet')).toBeVisible();
  await page.getByRole('button', { name: /← Scenes/ }).click();
  await page.getByRole('button', { name: /Make my plan/ }).click();
  await page.getByRole('button', { name: /Next: Ending & check/ }).click();
  await expect(page.getByText('4 scenes come in on the clock, one at 0:00')).toBeVisible();
});

test('the iPad joins with the code, shows the piece, and its End piece reaches the laptop', async ({ page, context }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('checkbox', { name: 'iPad controls' }).check();
  await page.getByRole('checkbox', { name: 'End piece' }).check();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  expect(code).toMatch(/^\d{4}$/);
  await startPiece(page);

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Now: Arrival')).toBeVisible();
  const end = ipad.getByRole('button', { name: 'End the piece' });
  await end.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, width: 30, height: 30 });
  await ipad.getByRole('button', { name: 'Tap again to end the piece' }).dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, width: 30, height: 30 });
  await expect(page.getByRole('button', { name: 'Cancel the ending' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('rehearse from a scene: the clock starts there, in that scene', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /Rehearse from Home/ }).click();
  const strip = page.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Home');
  // 7:00 piece from 6:00: about a minute left.
  await expect(strip.getByRole('timer')).toHaveText(/^(1:00|0:5\d)$/);
  await expect.poll(() => notesPlayed(page), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a reload mid-piece offers to carry on from where the clock would be', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await startPiece(page);
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  await page.waitForTimeout(1500); // let the board be saved
  await page.reload();
  // Straight back to the board: no home screen, no hunting for it.
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing when the page reloaded' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: /Carry on from/ }).click();
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  expect(pageErrors(page)).toEqual([]);
});

test('a reload during Show carries on in Show', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(page.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  await page.waitForTimeout(1500); // let the board be saved
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'The piece was playing' }).getByRole('button', { name: /Carry on from/ }).click();
  await expect(page.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Show: the board and the piece full screen, started from there', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /Show: the board/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  await page.getByRole('button', { name: 'Leave Show' }).click();
  await expect(page.getByRole('button', { name: 'Make a piece', exact: true })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});


test('the piece never runs over: with "When I press End" and no End pressed, it ends by its length', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceStep(page, 'Ending & check');
  const length = page.getByRole('textbox', { name: /Length of the piece/ });
  await length.fill('0:40');
  await length.blur();
  await page.getByRole('radio', { name: /Fade out/ }).click();
  await page.getByRole('radio', { name: /When I press End/ }).click();
  // The stopwatch starts when the piece's clock does (the music running), not at the
  // click: on a busy laptop getting the sound going can take a while, and the piece's
  // length rightly counts from when it is actually playing.
  await startPiece(page);
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 60_000 });
  const started = Date.now();
  // Nobody presses End. It must be over, sound and all, by 0:40 (a second's grace for the page).
  const stopButton = page.getByRole('button', { name: /■ Stop|Press again to stop/ });
  await expect(stopButton.first()).toBeVisible();
  await expect(stopButton).toHaveCount(0, { timeout: 50_000 });
  const took = (Date.now() - started) / 1000;
  expect(took).toBeLessThanOrEqual(42);
  expect(took).toBeGreaterThan(25); // it played, rather than stopping at once
  expect(pageErrors(page)).toEqual([]);
});

test('the iPad Loops page shows only the saved loops, and a tap turns one on and off', async ({ page, context }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bells');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('checkbox', { name: 'iPad controls' }).check();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  await page.getByRole('button', { name: '▶ Play' }).first().click();

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };
  await ipad.getByRole('tab', { name: 'Loops', exact: true }).dispatchEvent('pointerdown', touch);
  // Only the two saved loops, by name: no empty slots, no scenes, nothing else to hit.
  const pads = ipad.getByRole('button', { name: /Tap to turn/ });
  await expect(pads).toHaveCount(2);
  const bells = ipad.getByRole('button', { name: /^Bells: OFF/ });
  await expect(bells).toBeVisible();
  await bells.dispatchEvent('pointerdown', touch);
  await expect(ipad.getByRole('button', { name: /^Bells: (ON|starting|coming in)/ })).toBeVisible({ timeout: 15_000 });
  // The laptop agrees.
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /^Loop 1: Bells, (▶ playing|starting|fading in)/ })).toBeVisible({ timeout: 15_000 });
  // And off again (after the repeat-tap guard).
  await ipad.waitForTimeout(700);
  await ipad.getByRole('button', { name: /^Bells: / }).dispatchEvent('pointerdown', touch);
  await expect(ipad.getByRole('button', { name: /^Bells: (OFF|stopping|fading out)/ })).toBeVisible({ timeout: 15_000 });
  expect(pageErrors(page)).toEqual([]);
});
