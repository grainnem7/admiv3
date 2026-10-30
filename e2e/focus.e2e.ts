import { chromium, test, expect, type Locator, type Page } from '@playwright/test';
import { makePlan, openEmptyLaptopBoard, openLaptopBoard, openLaptopSetup, openWelcome, pageErrors, pickColour, pieceStep, place, saveBoardHere } from './app';

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
  await enter(page, page.getByRole('button', { name: '▶ Play the board', exact: true }));
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
  await enter(page, page.getByRole('button', { name: /^Rehearse from here, Home/ }));
  await focusIsOn(page.getByRole('button', { name: '■ Stop', exact: true }), 20_000);
  expect(pageErrors(page)).toEqual([]);
});

test('Show: ▶ Start the piece leads to the Now / Next strip, never onto ■ Stop; the second press of Stop back to ▶ Start the piece (B3)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await enter(page, page.getByRole('button', { name: /^Show: the board, the clock/ }));
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await enter(page, show.getByRole('button', { name: '▶ Start the piece' }));
  // Not onto ■ Stop: Enter pressed again there stopped the piece it had just started.
  await focusIsOn(show.getByRole('region', { name: 'Now and next' }), 20_000);
  // Past ■ Stop's first 2 s (timed in the page), from ■ Stop: the clock runs, so the first
  // press only gets Stop ready (it waits 4 s for the second).
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2100)));
  await show.getByRole('button', { name: '■ Stop', exact: true }).focus();
  await page.keyboard.press('Enter');
  await focusIsOn(show.getByRole('button', { name: '■ Press again to stop' }));
  await page.keyboard.press('Enter');
  await focusIsOn(show.getByRole('button', { name: '▶ Start the piece' }));
  // Leave Show: back on the Show button.
  await enter(page, show.getByRole('button', { name: 'Leave Show' }));
  await focusIsOn(page.getByRole('button', { name: /^Show: the board, the clock/ }));
  expect(pageErrors(page)).toEqual([]);
});

/** Where focus is, as a screen reader would name it: "BODY" when it has fallen to the page. */
const focusNow = (page: Page): Promise<string> => page.evaluate(() => {
  const el = document.activeElement;
  if (el === null || el === document.body) return 'BODY';
  return `${el.getAttribute('role') ?? el.tagName}:${el.getAttribute('aria-label') ?? el.textContent ?? ''}`;
});
/** Where focus is 1.5 s from now, waited for inside the page (the runner can lag). */
const focusLater = (page: Page): Promise<string> => page.evaluate(() => new Promise<string>((resolve) => setTimeout(() => {
  const el = document.activeElement;
  resolve(el === null || el === document.body ? 'BODY' : `${el.getAttribute('role') ?? el.tagName}:${el.textContent ?? ''}`);
}, 1500)));

test('Clear the board, by Enter, Space or a click, outside and inside New loop: focus goes to the colour to put down, and "Board cleared." is said (R2-T1-02)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Blue');
  const blue = page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { name: /Blue/ });
  const clear = page.getByRole('button', { name: 'Clear the board' });
  for (const how of ['Enter', 'Space', 'click'] as const) {
    await place(page, [[3, 1], [5, 3]]);
    if (how === 'click') await clear.click();
    else { await clear.focus(); await page.keyboard.press(how); }
    expect(await focusNow(page), how).not.toBe('BODY');
    await focusIsOn(blue);
    // The line under the board with its Undo, and the same words read out.
    await expect(page.getByRole('status').filter({ hasText: 'Board cleared.' }).filter({ has: page.getByRole('button', { name: 'Undo' }) })).toBeVisible();
    await expect(page.locator('[aria-live="polite"].visually-hidden')).toHaveText('Board cleared.');
    expect(await focusLater(page), how).toMatch(/^radio:.*Blue/);
  }
  // Inside New loop the same.
  await pieceStep(page, 'Loops');
  await page.getByRole('button', { name: 'New loop', exact: true }).click();
  await place(page, [[3, 1]]);
  await enter(page, clear);
  expect(await focusNow(page)).not.toBe('BODY');
  await focusIsOn(blue);
  expect(await focusLater(page)).toMatch(/^radio:.*Blue/);
  expect(pageErrors(page)).toEqual([]);
});

test('Clear it, in the question about clearing a loop: focus goes to Undo, not the top of the page (R2-T1-04)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceStep(page, 'Loops');
  await saveBoardHere(page);
  await enter(page, page.getByRole('button', { name: 'Clear loop 1' }));
  const ask = page.getByRole('dialog', { name: 'Clear Loop 1?' });
  await enter(page, ask.getByRole('button', { name: 'Clear it' }));
  await expect(ask).toHaveCount(0);
  await focusIsOn(page.getByRole('button', { name: 'Undo', exact: true }));
  expect(await focusLater(page)).toBe('BUTTON:Undo');
  expect(pageErrors(page)).toEqual([]);
});

test('Undo on the line under the board: the line goes, and focus goes to ▶ Play, not the page', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  // The ▶ Play / ■ Stop button by its id: the Loops step has a ▶ Play of its own as well.
  const play = page.locator('#bs-play-stop');
  // After Clear the board, and after Clear it on a loop: the same Undo line, the same rule.
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await enter(page, page.getByRole('button', { name: 'Undo', exact: true }));
  expect(await focusNow(page)).not.toBe('BODY');
  await focusIsOn(play);
  expect(await focusLater(page)).toBe('BUTTON:▶ Play the board');
  await pieceStep(page, 'Loops');
  await saveBoardHere(page);
  await enter(page, page.getByRole('button', { name: 'Clear loop 1' }));
  await enter(page, page.getByRole('dialog', { name: 'Clear Loop 1?' }).getByRole('button', { name: 'Clear it' }));
  await focusIsOn(page.getByRole('button', { name: 'Undo', exact: true }));
  await page.keyboard.press('Enter');
  await focusIsOn(play);
  expect(await focusLater(page)).toBe('BUTTON:▶ Play the board');
  expect(pageErrors(page)).toEqual([]);
});

/**
 * The camera path from Welcome, by keyboard (R2-T4-02): Set up the board, the name, Create,
 * then the laptop board. Run with no camera, and with Chromium's fake camera below.
 */
async function cameraPathFocus(page: Page, camera: boolean): Promise<void> {
  await openWelcome(page);
  await expect(page.getByText(camera ? 'Camera found' : /^No camera detected/)).toBeVisible();
  await enter(page, page.getByRole('button', { name: /Set up the board/ }));
  const name = page.getByRole('region', { name: "Who's playing?" }).getByRole('textbox', { name: 'Name' });
  await focusIsOn(name);
  await page.keyboard.type('Cam');
  await enter(page, page.getByRole('button', { name: 'Create' }));
  await focusIsOn(page.getByRole('heading', { name: 'Point the camera at the board' }));
  expect(await focusLater(page)).toBe('H2:Point the camera at the board');
  // The laptop board: no step heading in Play, so focus goes to its first control (a new
  // player has no colours yet: Add four colours), never the page.
  await enter(page, page.getByRole('button', { name: /Laptop board: play on the laptop/ }));
  const addFour = page.getByRole('button', { name: 'Add four colours' });
  await focusIsOn(addFour);
  expect(await focusLater(page)).toBe('BUTTON:Add four colours');
  await page.keyboard.press('Enter');
  await focusIsOn(page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { checked: true }));
  expect(pageErrors(page)).toEqual([]);
}

test('the camera path with no camera: Set up the board → the name box, Create → the heading of step 1, Laptop → the laptop board (R2-T4-02)', async ({ page }) => {
  // No camera at all (the laptop's own is never asked for): none listed, none to open.
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => [];
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Requested device not found', 'NotFoundError'); };
  });
  await cameraPathFocus(page, false);
});

test('the camera path with a camera: Set up the board → the name box, Create → the heading of step 1, Laptop → the laptop board (R2-T4-02)', async ({ baseURL }) => {
  // A browser of its own for this test only, with the fake camera Chromium has.
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    const context = await browser.newContext({ baseURL, permissions: ['camera'], viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await cameraPathFocus(page, true);
  } finally {
    await browser.close();
  }
});
