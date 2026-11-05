import { test, expect } from '@playwright/test';
import { headerButton, listenToOutput, makePlan, notesPlayed, oneNote, openLaptopBoard, outputLevels, pageErrors, pickColour, pieceStep, place, pressAndListen, keepAsLoop, loopMenu, loopPlace, soundTab } from './app';

/**
 * The Sound tab and the loop edit window, as a musician uses them: each colour's own
 * sound, the overall feel, and a loop compared with the board before it is changed.
 */

test('the colour table changes a colour, Hear plays it, one note or a tune beside it, and the choices are kept after a reload', async ({ page }) => {
  await openLaptopBoard(page);
  await soundTab(page);
  const red = page.getByRole('row', { name: /^Red: Melody/ });
  await expect(red).toBeVisible();
  await red.getByRole('combobox', { name: 'Sound' }).selectOption('violin');
  await red.getByRole('button', { name: 'Hear Red' }).click(); // works while stopped
  await red.getByRole('button', { name: /^Back to Red/ }).click();
  await expect(red.getByRole('combobox', { name: 'Sound' })).toHaveValue('');
  await red.getByRole('combobox', { name: 'Sound' }).selectOption('violin');
  // One note or a tune, beside each colour: a new player's melody, bass and chords start
  // on a tune, the drums on one note.
  const plays = red.getByRole('radiogroup', { name: 'Each counter plays' });
  await expect(plays.getByRole('radio', { name: 'Tune: a phrase' })).toHaveAttribute('aria-checked', 'true');
  for (const [row, tune] of [[/^Blue: Bass/, 'Tune: a bassline'], [/^Yellow: Chords/, 'Tune: the chords']] as const) {
    await expect(page.getByRole('row', { name: row }).getByRole('radiogroup', { name: 'Each counter plays' })
      .getByRole('radio', { name: tune })).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByRole('row', { name: /^Green: Drums/ }).getByRole('radiogroup', { name: 'Each counter plays' })
    .getByRole('radio', { name: 'One note' })).toHaveAttribute('aria-checked', 'true');
  await plays.getByRole('radio', { name: 'One note' }).click();
  await page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Lively' }).click();

  await page.waitForTimeout(800); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await soundTab(page);
  const after = page.getByRole('row', { name: /^Red: Melody/ });
  await expect(after.getByRole('combobox', { name: 'Sound' })).toHaveValue('violin');
  await expect(after.getByRole('radiogroup', { name: 'Each counter plays' }).getByRole('radio', { name: 'One note' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Lively' })).toHaveAttribute('aria-checked', 'true');

  // Back to the world's sounds, every colour at once.
  await page.getByRole('button', { name: /Reset every colour to the/ }).click();
  await expect(after.getByRole('combobox', { name: 'Sound' })).toHaveValue('');
  expect(pageErrors(page)).toEqual([]);
});

test('the helpers play: extra notes on, then frozen', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5]]);
  await soundTab(page);
  const extra = page.getByRole('group', { name: 'Extra notes' });
  await extra.getByRole('radio', { name: 'Some' }).click();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
  await keepAsLoop(page); // the board is cleared
  await place(page, [[2, 2], [6, 4]]);

  await (await loopMenu(page, 0)).getByRole('button', { name: 'Edit notes: loop 1' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /The board now · 2 counters/ })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Loop 1 as saved' })).toBeVisible();
  // The loop has notes, so copying asks for a second press.
  const copy = dialog.getByRole('button', { name: /Copy the board into this loop/ });
  await copy.click();
  await dialog.getByRole('button', { name: /Press again/ }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(loopPlace(page, 0)).toHaveAttribute('aria-label', /^Loop 1: 2 notes, /);
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await soundTab(page);
  await expect(page.getByRole('row', { name: /^Orange: Melody/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the red cap (tried with the mouse) moves the speed left–right and shows it', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  // The cap's finer settings are folded under More hat settings (A13).
  await page.getByRole('button', { name: 'More hat settings' }).click();
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
  // One note per counter (a tune owns a whole stretch of the loop, so this doesn't apply to it).
  await oneNote(page, /^Red: Melody/);
  await page.getByRole('tab', { name: 'Timing' }).click();
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

test('there and back (was ping-pong) with two pages: choose each page there and back, or one strip', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('tab', { name: 'Timing' }).click();
  await page.getByRole('radiogroup', { name: 'Boards in turn' }).getByRole('radio', { name: '2', exact: true }).click();
  await page.getByRole('tab', { name: 'Board' }).click();
  await page.getByRole('switch', { name: 'There and back' }).click();
  const choice = page.getByRole('radiogroup', { name: 'There and back with 2 pages' });
  await expect(choice.getByRole('radio', { name: 'Each page there and back' })).toBeChecked();
  await choice.getByRole('radio', { name: 'All pages as one strip' }).click();
  await expect(page.getByText('A → B → to the end, then back B ← A ←: like one long board.')).toBeVisible();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('the session log survives a reload, and earlier takes are kept', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(5500); // kept every few seconds while playing
  // A reload mid-take: before, "Save session" came back with 0 notes.
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await expect.poll(() => notesPlayed(page), { timeout: 10_000 }).toBeGreaterThan(2);
  // A new take: the old one stays, under Earlier takes. (The old count shows until the
  // new take starts, so wait for the new one to begin counting from nothing.)
  const before = await notesPlayed(page);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
  await expect(page.getByRole('status').filter({ hasText: 'Board cleared.' }).filter({ has: page.getByRole('button', { name: 'Undo' }) })).toBeVisible();
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

test("after Keep as loop, Rename in the rail's menu names it", async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await keepAsLoop(page);
  // A right-click on the kept loop's place opens its menu.
  const menu = await loopMenu(page, 0);
  await expect(menu).toHaveAccessibleName('Loop 1: more');
  await menu.getByRole('button', { name: 'Rename', exact: true }).click();
  // The name is ready to type; Enter closes the menu and goes back to the loop's place.
  const name = page.getByRole('textbox', { name: 'Name of loop 1' });
  await expect(name).toBeFocused();
  await page.keyboard.type('Intro');
  await expect(name).toHaveValue('Intro');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-loop-rail]').getByRole('group', { name: /: more$/ })).toHaveCount(0);
  await expect(loopPlace(page, 0)).toHaveAttribute('aria-label', /^Intro: loop 1, 1 note, /);
  await expect(loopPlace(page, 0)).toHaveText(/Intro/);
  await expect(loopPlace(page, 0)).toBeFocused();
  // Enter only names it: the loop Keep as loop started still comes in with ▶ Play.
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(loopPlace(page, 0)).toHaveAttribute('aria-label', /^Intro: loop 1, 1 note, (starting|playing)/, { timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('Play on the laptop from Welcome: a new player lands on the laptop board with four colours, no Set up', async ({ page }) => {
  await page.route('**/admi-store**', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 404, body: '' })
    : route.fulfill({ status: 204, body: '' })));
  await page.route('**/magentadata/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Play on the laptop/ }).click();
  await page.getByRole('region', { name: "Who's playing?" }).getByRole('textbox', { name: 'Name' }).fill('Test');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(await headerButton(page, /Laptop board: play on the laptop/)).toHaveAttribute('aria-pressed', 'true');
  // Item 1 of the producer's walk: four ready-made colours and the board, straight away, with
  // nothing to set up (no camera, no board to find). Set up stays under More for later.
  await expect(page.getByRole('region', { name: /^Set up, step/ })).toHaveCount(0);
  await expect(page.getByRole('grid', { name: /Laptop board/ })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Counter to put down' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Red/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Green/ })).toBeVisible();
  // Nothing plays until a counter goes down or Play is pressed.
  await expect(page.locator('#bs-play-stop')).toHaveText('▶ Play the board');
});

test('each new instrument loads and plays with ▶ Hear', async ({ page }) => {
  await openLaptopBoard(page);
  await soundTab(page);
  const hearEach = async (job: RegExp, keys: string[]): Promise<void> => {
    const red = page.getByRole('row', { name: job });
    for (const key of keys) {
      await red.getByRole('combobox', { name: 'Sound' }).selectOption(key);
      await red.getByRole('button', { name: 'Hear Red' }).click();
      await expect(red.getByText(/♪ Playing Red|didn't load in time|couldn't play/)).toHaveText(/♪ Playing Red/, { timeout: 8000 });
      await expect(red.getByText(/♪ Playing Red/)).toBeHidden({ timeout: 4000 }); // the next one's note is its own
    }
  };
  await hearEach(/^Red: Melody/, ['flute', 'saxophone', 'trumpet', 'xylophone', 'guitarAcoustic', 'guitarElectric']);
  await page.getByRole('row', { name: /^Red: Melody/ }).getByRole('combobox', { name: 'Plays' }).selectOption('bass');
  await hearEach(/^Red: Bass/, ['trombone', 'bassoon']);
  expect(pageErrors(page)).toEqual([]);
});

test('Stop silences a launched loop; it does not come back on Play', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  // Keep as loop: the loop comes in with ▶ Play and the board is clear, so every note comes from the loop.
  await keepAsLoop(page);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  // Stop means silence: the loop is stopped.
  await expect(loopPlace(page, 0)).toHaveAttribute('aria-label', 'Loop 1: 2 notes, stopped');
  // Play again with the board still empty: the loop stays stopped, so nothing plays.
  await page.waitForTimeout(600); // ▶ Play ignores a press straight after Stop (a bounce)
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.waitForTimeout(3000);
  expect(await notesPlayed(page)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test('New loop starts from silence, Keep names it, Leave restores the player’s settings', async ({ page }) => {
  await openLaptopBoard(page);
  // The player's own settings: a quiet band, and a loop already playing.
  await soundTab(page);
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Quiet' }).click();
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await keepAsLoop(page); // Loop 1, which comes in with ▶ Play; the board is clear
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // New loop, from the loop's menu: everything stops; the board is empty, so it is ready to
  // compose (nothing kept yet).
  await (await loopMenu(page, 0)).getByRole('button', { name: 'New loop: from silence' }).click();
  await expect(page.getByRole('heading', { name: 'New loop 2 · not kept yet' })).toBeVisible();
  await expect(loopPlace(page, 0)).toHaveAttribute('aria-label', /^Loop 1: 1 note, (stopping|stopped)/);
  const quiet = await notesPlayed(page);
  await page.waitForTimeout(2500);
  expect(await notesPlayed(page)).toBe(quiet);

  // Two counters: only they sound.
  await place(page, [[2, 2], [6, 4]]);
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(quiet);

  // Keep, then name it from a quick name.
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Name of the new loop' });
  await expect(name).toBeFocused();
  await page.getByRole('button', { name: 'Bed', exact: true }).click();
  await expect(name).toHaveValue('Bed');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(loopPlace(page, 1)).toHaveAttribute('aria-label', /^Bed: loop 2, 2 notes/);

  // Leaving gave the player's own settings back.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await soundTab(page);
  await expect(page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Quiet' })).toHaveAttribute('aria-checked', 'true');
  expect(pageErrors(page)).toEqual([]);
});

test('a "d" typed on a button or in a list never opens a Debug Panel (only ?debug in development does)', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: '▶ Play the board' }).first().focus();
  await page.keyboard.press('d');
  await soundTab(page);
  // A keyboard user types a letter in a list to jump through it.
  await page.getByRole('row', { name: /^Red: Melody/ }).getByRole('combobox', { name: 'Sound' }).focus();
  await page.keyboard.press('d');
  await page.locator('body').focus();
  await page.keyboard.press('d');
  await expect(page.getByText('Debug Panel')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Debug information' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('▶ Play and ▶ Start the piece on an empty board send nothing to the speakers: no click (T1-03)', async ({ page }) => {
  test.setTimeout(240_000);
  await listenToOutput(page);
  await openLaptopBoard(page);
  // Digital silence is 0. A click, however short, would be a sample far above this.
  const CLICK = 0.01;
  const gap = (ms: number) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
  const loudest: number[] = [];
  for (let run = 0; run < 5; run++) {
    const levels = await pressAndListen(page, '▶ Play the board', 40, 20); // 800 ms from the press
    expect(levels).toHaveLength(40);
    loudest.push(Math.max(...levels));
    await page.getByRole('button', { name: '■ Stop' }).first().click();
    await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
    await gap(600); // past Play's bounce guard
  }
  // The piece: Show → Start the piece, with the plan's band and no counter down.
  await makePlan(page);
  for (let run = 0; run < 3; run++) {
    await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    const levels = await pressAndListen(page, '▶ Start the piece', 40, 20);
    expect(levels).toHaveLength(40);
    loudest.push(Math.max(...levels));
    await page.getByRole('button', { name: 'Leave Show' }).click();
    await gap(2100); // ■ Stop ignores presses for the piece's first 2 s (B3)
    await page.getByRole('button', { name: '■ Stop' }).first().click();
    await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
    await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
    await gap(600);
  }
  expect(loudest.every((v) => v < CLICK), `loudest sample after each press: ${loudest.join(', ')}`).toBe(true);
  // The meter does hear: one counter down, and Play is heard.
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [3, 5], [5, 7]]);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.02);
  expect(pageErrors(page)).toEqual([]);
});

test('Sound → Chords: a new player has the world’s own chords, two bars each, and melody and bass fit the chord; both can be changed and are kept', async ({ page }) => {
  await openLaptopBoard(page);
  await soundTab(page);
  const card = page.getByRole('group', { name: 'Chords' });
  await expect(card.getByRole('radio', { name: 'The world’s own', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('radio', { name: '2 bars', exact: true })).toHaveAttribute('aria-checked', 'true');
  const fit = card.getByRole('switch', { name: 'Melody and bass fit the chord' });
  await expect(fit).toHaveAttribute('aria-checked', 'true');
  await card.getByRole('radio', { name: 'Calm', exact: true }).click();
  await expect(card).toContainText('Two chords, home and the fourth: I–IV.');
  await card.getByRole('radio', { name: '4 bars', exact: true }).click();
  await fit.click();
  await expect(fit).toHaveAttribute('aria-checked', 'false');
  // "As before" has no length to choose: four chords to a loop, as it was.
  await card.getByRole('radio', { name: 'As before', exact: true }).click();
  await expect(card.getByRole('radiogroup', { name: 'Each chord lasts' })).toHaveCount(0);
  await card.getByRole('radio', { name: 'Calm', exact: true }).click();
  await page.evaluate(() => new Promise((r) => { window.setTimeout(r, 1200); })); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await soundTab(page);
  await expect(card.getByRole('radio', { name: 'Calm', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('radio', { name: '4 bars', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(fit).toHaveAttribute('aria-checked', 'false');
  expect(pageErrors(page)).toEqual([]);
});

test('Sound → Band parts and Keep my notes on top: a new player has pads, bass and drums kept as jobs and their notes on top; both can be changed and are kept', async ({ page }) => {
  await openLaptopBoard(page);
  await soundTab(page);
  const parts = page.getByRole('group', { name: 'Band parts' });
  await expect(parts.getByRole('radio', { name: 'Choose parts', exact: true })).toHaveAttribute('aria-checked', 'true');
  for (const [job, on] of [['Pads', 'true'], ['Bass', 'true'], ['Drums', 'true'], ['Counter-melody', 'false']] as const) {
    await expect(parts.getByRole('switch', { name: job, exact: true })).toHaveAttribute('aria-checked', on);
  }
  const top = page.getByRole('group', { name: 'Keep my notes on top' });
  const onTop = top.getByRole('switch', { name: 'Keep my notes on top' });
  await expect(onTop).toHaveAttribute('aria-checked', 'true');
  await expect(top).toContainText('3 dB');
  await parts.getByRole('switch', { name: 'Counter-melody', exact: true }).click();
  await parts.getByRole('switch', { name: 'Drums', exact: true }).click();
  await onTop.click();
  await expect(top.getByRole('slider')).toHaveCount(0);
  await page.evaluate(() => new Promise((r) => { window.setTimeout(r, 1200); })); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await soundTab(page);
  await expect(parts.getByRole('switch', { name: 'Counter-melody', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(parts.getByRole('switch', { name: 'Drums', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(onTop).toHaveAttribute('aria-checked', 'false');
  // "As before" is kept as a choice: the band as it was.
  await parts.getByRole('radio', { name: 'As before', exact: true }).click();
  await expect(parts.getByRole('switch')).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});
