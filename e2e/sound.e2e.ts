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

test('the red cap (tried with the mouse) moves the speed left–right and shows it', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  await page.getByRole('button', { name: 'Test with the mouse' }).click();
  const area = page.getByRole('img', { name: /Test area/ });
  await area.scrollIntoViewIfNeeded();
  const box = (await area.boundingBox())!;
  const bpm = async (): Promise<number> => Number(/(\d+) BPM/.exec((await page.getByText(/·\s*\d+ BPM · step/).first().textContent()) ?? '')?.[1] ?? 0);
  // The cap starts from the current speed and changes it only once the head moves: so the
  // mouse moves into place, as a head would, rather than appearing there.
  await area.hover({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.waitForTimeout(300);
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height / 2, { steps: 10 });
  await expect.poll(bpm, { timeout: 8000 }).toBeLessThan(90);
  const slow = await bpm();
  await area.hover({ position: { x: box.width * 0.95, y: box.height / 2 } });
  await expect.poll(bpm, { timeout: 8000 }).toBeGreaterThan(slow + 30);
  // Under the board: the cap's state (announced), and what it is doing (shown, not announced).
  await expect(page.getByRole('status', { name: 'Red cap' })).toContainText('cap found');
  await expect(page.getByText(/^Speed \d+ BPM$/).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('a counter past its part’s loop shows that it doesn’t play', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Groove' }).click();
  await page.getByRole('radiogroup', { name: 'Melody loop length' }).getByRole('radio', { name: '6', exact: true }).click();
  await pickColour(page, 'Red');
  await place(page, [[3, 8], [3, 2]]);
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  // Step 8 is past Melody's 6 steps: said on the square, and under the board.
  await expect(grid.getByRole('button', { name: /^Row 3 from the bottom, step 8: .*doesn’t play/ })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Row 3 from the bottom, step 2: (?!.*doesn’t play)/ })).toBeVisible();
  await expect(page.getByText('Steps 7–8 are past Melody’s 6-step loop: melody counters there don’t play.')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('ping-pong with two pages: choose each page there and back, or one strip', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('tab', { name: 'Groove' }).click();
  await page.getByRole('radiogroup', { name: 'Pages' }).getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('tab', { name: 'Board' }).click();
  await page.getByRole('switch', { name: 'Ping-pong' }).click();
  const choice = page.getByRole('radiogroup', { name: 'Ping-pong with 2 pages' });
  await expect(choice.getByRole('radio', { name: 'Each page there and back' })).toBeChecked();
  await choice.getByRole('radio', { name: 'All pages as one strip' }).click();
  await expect(page.getByText('A → B → to the end, then back B ← A ←: like one long board.')).toBeVisible();
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('the session log survives a reload, and earlier takes are kept', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(5500); // kept every few seconds while playing
  // A reload mid-take: before, "Save session" came back with 0 notes.
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await expect.poll(() => notesPlayed(page), { timeout: 10_000 }).toBeGreaterThan(2);
  // A new take: the old one stays, under Earlier takes. (The old count shows until the
  // new take starts, so wait for the new one to begin counting from nothing.)
  const before = await notesPlayed(page);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeLessThan(before);
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: /■ Stop/ }).first().click();
  await expect(page.getByText(/^Earlier takes \(1\)$/)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Clear the board can be undone', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: 'Clear the board' }).click();
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  await expect(grid.getByRole('button', { name: /^Row 3 from the bottom, step 1: empty$/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Board cleared (2 counters).' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(grid.getByRole('button', { name: /^Row 3 from the bottom, step 1: Red/ })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Row 5 from the bottom, step 3: Red/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Help opens with focus inside, and Esc closes it', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Help' })).toBeFocused();
});

test('a player can be renamed and their hand changed', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await expect(chooser.getByText('Right-handed')).toBeVisible();
  await chooser.getByRole('button', { name: 'Edit Test: name and hand' }).click();
  await chooser.getByRole('textbox', { name: 'Name' }).fill('Tim');
  await chooser.getByRole('radio', { name: 'Left' }).click();
  await chooser.getByRole('button', { name: 'Save' }).click();
  await expect(chooser.getByRole('button', { name: /^Tim/ })).toContainText('Left-handed');
  await chooser.getByRole('button', { name: /^Tim/ }).click();
  await expect(page.getByRole('button', { name: /^Player: Tim/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('after saving the board as a loop, its name is ready to type', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceStep(page, 'Loops');
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Name of loop 1' })).toBeFocused();
  await page.keyboard.type('Intro');
  await expect(page.getByRole('textbox', { name: 'Name of loop 1' })).toHaveValue('Intro');
});
