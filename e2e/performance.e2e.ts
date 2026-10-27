import { test, expect, type Page } from '@playwright/test';
import { makePlan, notesPlayed, openLaptopBoard, pageErrors, pickColour, pieceStep, place, startPiece } from './app';

/** Make a piece → Loops: two loops, "Bed" (two yellow counters) and an unnamed one (one blue). */
async function saveTwoLoops(page: Page): Promise<void> {
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
}

/** Go to a step of Make a piece from inside it. */
async function step(page: Page, name: 'Loops' | 'Scenes' | 'Ending & check'): Promise<void> {
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: new RegExp(`· ${name}`) }).click();
}

/** The check's summary line ("2 things need fixing…" or "Ready, with…"). */
const checkSummary = (page: Page) => page.getByRole('status').filter({ hasText: /(needs? fixing before the piece|^Ready, with|^Everything is ready)/ });

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

test('Make my plan gives every scene loops, and only then does the check say Ready', async ({ page }) => {
  await openLaptopBoard(page);
  // Nothing saved yet: the plan's scenes are empty, and the check says the room would be silent.
  await makePlan(page);
  await step(page, 'Ending & check');
  await expect(page.getByText('No loop plays in Arrival, Build, Open and Home')).toBeVisible();
  await expect(checkSummary(page)).toHaveText(/needs? fixing before the piece/);
  // Two loops, then the plan again: no scene is left without loops (T3-01).
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Start again from the plan/ }).click();
  await page.getByRole('button', { name: 'Make the plan' }).click();
  for (const row of [/^0:00 · Arrival/, /^1:30 · Build/, /^3:30 · Open/, /^6:00 · Home/]) {
    await expect(page.getByRole('button', { name: row })).not.toContainText('no loops');
  }
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toContainText('Bed, Loop 2');
  await step(page, 'Ending & check');
  await expect(page.getByText(/^No loop plays/)).toHaveCount(0);
  await expect(checkSummary(page)).toHaveText(/^Ready, with \d+ things? to check\.$/);
  expect(pageErrors(page)).toEqual([]);
});

test('a scene with no loops is named by the check, until it is marked to play alone', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  const loops = page.getByRole('group', { name: 'Loops in this scene' });
  await loops.getByRole('button', { name: '✓ Bed' }).click();
  await loops.getByRole('button', { name: '✓ Loop 2' }).click();
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toContainText('no loops');
  await step(page, 'Ending & check');
  await expect(page.getByText('No loop plays in Open')).toBeVisible();
  await expect(page.getByText('The room will be silent there unless Test plays: in Scenes, add a loop or tick “Test alone”.')).toBeVisible();
  await expect(checkSummary(page)).toHaveText('1 thing needs fixing before the piece.');
  // Marked to play alone, it is the plan: the check is ready.
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  await page.getByRole('checkbox', { name: 'Test alone: no loops, only what Test plays' }).check();
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toContainText('Test alone');
  await step(page, 'Ending & check');
  await expect(page.getByText('No loop plays in Open')).toHaveCount(0);
  await expect(checkSummary(page)).toHaveText(/^Ready, with/);
  expect(pageErrors(page)).toEqual([]);
});

test('a loop cleared while scenes use it: the check names it, and Take it out takes it out', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
  await step(page, 'Loops');
  await page.getByRole('button', { name: 'Clear loop 1' }).click();
  await page.getByRole('button', { name: 'Clear it' }).click();
  await step(page, 'Ending & check');
  await expect(page.getByText(/^Arrival, Build, Open and Home use (Bed|Loop 1), which is empty$/)).toBeVisible();
  await page.getByRole('button', { name: /^Take it out: (Bed|Loop 1), from Arrival, Build, Open and Home$/ }).click();
  await expect(page.getByText(/which is empty/)).toHaveCount(0);
  // Arrival and Home had only that loop: now nothing plays in them, and the check says so.
  await expect(page.getByText('No loop plays in Arrival and Home')).toBeVisible();
  await step(page, 'Scenes');
  await expect(page.getByRole('button', { name: /^1:30 · Build/ })).toContainText('Loop 2');
  await expect(page.getByRole('button', { name: /^1:30 · Build/ })).not.toContainText('empty');
  expect(pageErrors(page)).toEqual([]);
});

test('a scene time typed as 2.30 is 2:30; one it cannot read is refused and not saved', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  const time = page.getByRole('textbox', { name: /When Build comes in/ });
  await time.fill('2.30');
  await time.press('Tab');
  await expect(page.getByRole('button', { name: /^2:30 · Build/ })).toBeVisible();
  await expect(time).toHaveValue('2:30');
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' }).getByRole('listitem')).toHaveText(['Arrival 0:00', 'Build 2:30', 'Open 3:30', 'Home 6:00']);
  await time.fill('2.5');
  await time.press('Tab');
  await expect(page.getByRole('alert').filter({ hasText: 'Type a time as minutes:seconds, like 2:30, or leave it empty for by hand only.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2:30 · Build/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the piece is at most 7:00: a length of 8:00 is refused, says so, and is not saved', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Ending & check');
  const length = page.getByRole('textbox', { name: /Length of the piece/ });
  await length.fill('8:00');
  await length.press('Tab');
  await expect(page.getByText('The piece can be at most 7:00.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: /Ending & check/ })).toContainText('7:00');
  await expect(page.getByText(/^7:00 · fade over 2 passes/)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('after a new time re-sorts the scenes, the open panel stays on the scene being edited', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  const time = page.getByRole('textbox', { name: /When Build comes in/ });
  await time.fill('5:00');
  await time.press('Tab');
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' }).getByRole('listitem')).toHaveText(['Arrival 0:00', 'Open 3:30', 'Build 5:00', 'Home 6:00']);
  await expect(page.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Build');
  await expect(page.getByRole('button', { name: /^5:00 · Build/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toHaveAttribute('aria-expanded', 'false');
  expect(pageErrors(page)).toEqual([]);
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
  await page.getByRole('switch', { name: 'iPad controls' }).click();
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
  await ipad.waitForTimeout(600); // a real second tap, not a bounce
  await ipad.getByRole('button', { name: 'Tap again to end the piece' }).dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, width: 30, height: 30 });
  await expect(page.getByRole('button', { name: 'Cancel the ending' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("a bounce on the iPad's End piece never ends the piece; a second tap after it does", async ({ page, context }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  // A new player's iPad has the safe show layout: End piece is on the page Tim plays on.
  await expect(page.getByRole('checkbox', { name: 'End piece' })).toBeChecked();
  // The shortest window, so each try can start afresh sooner.
  await page.getByRole('radiogroup', { name: 'Time for the second tap' }).getByRole('radio', { name: '3 seconds' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  await startPiece(page);

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Now: Arrival')).toBeVisible();
  const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };
  const endPad = ipad.getByRole('button', { name: /end the piece/i }); // "End the piece" or "Tap again to end the piece"
  const ending = page.getByRole('button', { name: 'Cancel the ending' });
  for (const gap of [60, 120, 250]) {
    await expect(ipad.getByRole('button', { name: 'End the piece', exact: true })).toBeVisible({ timeout: 10_000 });
    // One shaky press: two touches this far apart.
    await endPad.dispatchEvent('pointerdown', touch);
    await ipad.waitForTimeout(gap);
    await endPad.dispatchEvent('pointerdown', touch);
    // It only got ready: the piece plays on.
    await expect(ipad.getByRole('button', { name: 'Tap again to end the piece' })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(ending).toHaveCount(0);
  }
  // A real second tap, after the bounce guard and inside the window, ends it.
  await expect(ipad.getByRole('button', { name: 'End the piece', exact: true })).toBeVisible({ timeout: 10_000 });
  await endPad.dispatchEvent('pointerdown', touch);
  await ipad.waitForTimeout(700);
  await endPad.dispatchEvent('pointerdown', touch);
  await expect(ending.first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('"when the finger lifts": a real touch that slides off a pad before lifting does nothing', async ({ page, context }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('radiogroup', { name: 'A pad acts' }).getByRole('radio', { name: 'When the finger lifts' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  // Chrome's own touch input, as on an iPad: the browser holds a touch on the pad it lands
  // on (a dispatched pointer event would not show that).
  const cdp = await context.newCDPSession(ipad);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 15, radiusY: 15, force: 1, id: 1 }],
  });
  await ipad.goto(`/?remote=${code}`);
  // New idea turns Extra notes on, which its strip shows: that is how a press is seen here.
  const extraNotes = ipad.getByRole('slider', { name: 'Extra notes' });
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');
  const box = (await ipad.getByRole('button', { name: /New idea/ }).boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  // Lands on New idea, slides well off it (to the status line at the top), lifts there.
  await finger('touchStart', x, y);
  for (const step of [0.25, 0.5, 0.75, 1]) await finger('touchMove', x, y - (y - 20) * step);
  await finger('touchEnd');
  await ipad.waitForTimeout(1500);
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');

  // Lands, slides off, comes back, lifts on the pad: still nothing.
  await finger('touchStart', x, y);
  await finger('touchMove', x, 20);
  await finger('touchMove', x, y);
  await finger('touchEnd');
  await ipad.waitForTimeout(1500);
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');

  // The same pad, landed on and lifted from: it works.
  await finger('touchStart', x, y);
  await finger('touchEnd');
  await expect(extraNotes).toHaveAttribute('aria-valuetext', /%/);
  expect(pageErrors(page)).toEqual([]);
});

test('"Use the safe show layout" sets out the iPad for the show and says what it did', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  // A new player starts with it.
  await expect(page.getByText('✓ The iPad has the safe show layout.')).toBeVisible();
  // Things added back for a rehearsal...
  await page.getByRole('checkbox', { name: 'Mute', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
  await page.getByRole('checkbox', { name: '🔒 Speed' }).uncheck();
  await expect(page.getByText('✓ The iPad has the safe show layout.')).toHaveCount(0);
  // ...and one button for the show.
  await page.getByRole('button', { name: 'Use the safe show layout' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done: the iPad now shows only the Extra notes strip, New idea and End piece' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mute', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Loops & scenes page' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: '🔒 Speed' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Extra notes', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'End piece' })).toBeChecked();
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
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
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

test('an iPad loop tap while the laptop is stopped is refused, says why, and Play brings no loop in', async ({ page, context }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bells');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Connected · press Play on the laptop')).toBeVisible();
  const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };
  await ipad.getByRole('tab', { name: 'Loops', exact: true }).dispatchEvent('pointerdown', touch);
  await ipad.getByRole('button', { name: /^Bells: OFF/ }).dispatchEvent('pointerdown', touch);
  // Refused, in words, on the iPad; nothing waits to start.
  await expect(ipad.getByRole('alert')).toHaveText('Press Play on the laptop first');
  await expect(ipad.getByRole('button', { name: /^Bells: OFF/ })).toBeVisible();
  // ▶ Play on the laptop: the board plays, and no loop comes in by itself.
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect(ipad.getByText('Connected · playing')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(ipad.getByRole('button', { name: /^Bells: OFF/ })).toBeVisible();
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await expect(page.getByRole('listitem', { name: /^Loop 1: Bells/ })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /^Loop 1: Bells, (▶ playing|starting|fading in)/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
