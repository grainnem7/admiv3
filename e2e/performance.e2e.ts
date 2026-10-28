import { test, expect, type Page } from '@playwright/test';
import { listenToOutput, makePlan, notesPlayed, openAnotherTab, openLaptopBoard, outputLevels, pageErrors, pickColour, pieceStep, place, startPiece } from './app';

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

/** The player's scene settings as saved in the browser: what a reload or the next session gets. */
async function savedOwn(page: Page): Promise<{ band: unknown; fillAmount: unknown; evolveAmount: unknown; bpm: unknown; currentScene: unknown }> {
  return page.evaluate(() => {
    const id = localStorage.getItem('admi-board-active-player');
    const players = JSON.parse(localStorage.getItem('admi-board-players') ?? '[]') as { id: string; settings: Record<string, unknown> }[];
    const s = (players.find((p) => p.id === id) ?? players[0])?.settings ?? {};
    return { band: s.band, fillAmount: s.fillAmount, evolveAmount: s.evolveAmount, bpm: s.bpm, currentScene: s.currentScene ?? null };
  });
}

/**
 * The piece has started: its clock counts down. That is when the page remembers it for a
 * reload, once the sound is ready, which can take seconds on a busy machine.
 */
async function pieceClockRunning(page: Page): Promise<void> {
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 20_000 });
}

/** A pause measured inside the page (the runner can lag by hundreds of milliseconds). */
const pause = (page: Page, ms: number) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);

/** The player's own sound for these tests: no band, no extra notes, sounds stay. */
async function ownSoundIsPlain(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('group', { name: 'Sounds change' }).getByRole('radio', { name: 'Off', exact: true }).click();
}

/** The Sound tab shows the player's own plain sound again. */
async function expectPlainSound(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Sounds change' }).getByRole('radio', { name: 'Off', exact: true })).toHaveAttribute('aria-checked', 'true');
}

const PLAIN = { band: 'off', fillAmount: 0, evolveAmount: 0, currentScene: null };

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

test('clearing a loop that scenes use asks first, naming them, and takes it out of them; the next Keep never lands in them', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
  await step(page, 'Loops');
  await page.getByRole('button', { name: 'Clear loop 1' }).click();
  const ask = page.getByRole('dialog', { name: 'Clear Bed?' });
  await expect(ask).toContainText('Bed is used in Arrival, Build, Open and Home. Clear it and take it out of those scenes?');
  await ask.getByRole('button', { name: 'Clear it' }).click();
  // The loop and its name are gone (T2-01: the next loop kept there was called "Bed").
  await expect(page.getByRole('listitem', { name: 'Loop 1: Loop 1, empty' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name of loop 1' })).toHaveValue('');
  await step(page, 'Scenes');
  await expect(page.getByRole('button', { name: /^0:00 · Arrival/ })).toContainText('no loops');
  await expect(page.getByRole('button', { name: /^1:30 · Build/ })).toContainText('Loop 2');
  await expect(page.getByRole('button', { name: /^1:30 · Build/ })).not.toContainText('Bed');
  // The check names the scenes left with nothing to play, instead of saying all is well.
  await step(page, 'Ending & check');
  await expect(page.getByText('No loop plays in Arrival and Home')).toBeVisible();
  // A new loop kept now is a new loop: no scene plays it until it is put there.
  await step(page, 'Loops');
  await page.getByRole('button', { name: 'New loop' }).click();
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [6, 5]]);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name of the new loop' })).toHaveValue('');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await step(page, 'Scenes');
  await expect(page.getByRole('button', { name: /^0:00 · Arrival/ })).toContainText('no loops');
  await expect(page.getByRole('button', { name: /^6:00 · Home/ })).toContainText('no loops');
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
    // One shaky press: two touches this far apart, timed inside the page, so a busy test
    // runner cannot stretch the gap past the bounce guard.
    await endPad.evaluate((el, ms) => new Promise<void>((done) => {
      const down = (): void => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, width: 30, height: 30 })); };
      down();
      setTimeout(() => { down(); done(); }, ms);
    }), gap);
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

test("a press on the iPad's End piece that chatters at 0, 200, 400 and 600 ms never ends the piece; a tap after quiet does", async ({ page, context }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  // The longest window, so the runner's own pauses can't let it lapse before the last tap.
  await page.getByRole('radiogroup', { name: 'Time for the second tap' }).getByRole('radio', { name: '10 seconds' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  await startPiece(page);

  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Now: Arrival')).toBeVisible();
  const endPad = ipad.getByRole('button', { name: /end the piece/i });
  const ending = page.getByRole('button', { name: 'Cancel the ending' });
  await expect(ipad.getByRole('button', { name: 'End the piece', exact: true })).toBeVisible();
  // One press that chatters for longer than the bounce guard (half a second): four touches
  // 200 ms apart, timed inside the page. Each lands within the guard of the one before.
  const gaps = await endPad.evaluate((el) => new Promise<number[]>((done) => {
    const at: number[] = [];
    const down = (): void => {
      at.push(performance.now());
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, width: 30, height: 30 }));
    };
    down();
    setTimeout(down, 200);
    setTimeout(down, 400);
    setTimeout(() => { down(); done(at.slice(1).map((t, i) => t - at[i])); }, 600);
  }));
  // The touches really came that close together (a busy machine could have spread them).
  for (const gap of gaps) expect(gap).toBeLessThan(500);
  // Only got ready: the piece plays on.
  await expect(ipad.getByRole('button', { name: 'Tap again to end the piece' })).toBeVisible();
  await pause(page, 1000);
  await expect(ending).toHaveCount(0);
  // A tap after a moment's quiet, still inside the window, ends it.
  await endPad.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, width: 30, height: 30 });
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

test("an iPad page from before an update is named on the laptop, never on the iPad; the check offers the safe show layout", async ({ page, context }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  const outOfDate = "Test's iPad page is out of date: reload it on the iPad.";
  // An iPad page from before builds were compared: it joins, and never says which it is.
  await page.evaluate((code) => {
    (window as unknown as { oldIpad?: WebSocket }).oldIpad = new WebSocket(`ws://${location.host}/admi-remote?code=${code}&role=remote`);
  }, code);
  await expect(page.getByRole('alert').filter({ hasText: outOfDate })).toBeVisible({ timeout: 15_000 });
  await pieceStep(page, 'Ending & check');
  await expect(page.getByRole('listitem').filter({ hasText: outOfDate })).toBeVisible();
  await expect(checkSummary(page)).toContainText('needs fixing before the piece');
  // That page is closed, and today's page is opened: it answers, and the laptop is content.
  await page.evaluate(() => (window as unknown as { oldIpad?: WebSocket }).oldIpad?.close());
  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Connected · press Play on the laptop')).toBeVisible();
  await expect(page.getByText('iPad connected')).toBeVisible();
  await pause(page, 5000); // longer than the laptop waits for an answer
  await expect(page.getByText(outOfDate)).toHaveCount(0);
  await expect(ipad.getByText(/out of date|reload/i)).toHaveCount(0);

  // A fuller iPad than the safe show layout: a warning in the check, with the button.
  const notSafe = page.getByText("Test's iPad is not in the safe show layout");
  await expect(notSafe).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
  await pieceStep(page, 'Ending & check');
  await expect(notSafe).toBeVisible();
  await page.getByRole('button', { name: "Use the safe show layout on Test's iPad" }).click();
  await expect(notSafe).toHaveCount(0);
  await expect(ipad.getByRole('tab')).toHaveCount(0); // the iPad lost its Loops pages
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

test('Jump here now is there only while the board plays; the scene is for that run, never saved, and Stop gives the player their own sound back', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await ownSoundIsPlain(page);
  await makePlan(page);
  // Stopped: each scene offers Rehearse from here; a jump would only have changed settings.
  await expect(page.getByRole('button', { name: /^Rehearse from Open/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jump to Open now' })).toHaveCount(0);
  // Playing: Open (full band, extra notes, sounds change) comes in at once…
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('button', { name: 'Jump to Open now' }).click();
  await expect(page.getByRole('button', { name: 'Jump to Open now' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Full', exact: true })).toHaveAttribute('aria-checked', 'true');
  // …for this run only: what is saved stays the player's own (saves are gathered for a moment).
  await pause(page, 1200);
  expect(await savedOwn(page)).toMatchObject(PLAIN);
  // Stop: their own sound is back, on screen and saved.
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  await expectPlainSound(page);
  await pause(page, 1200);
  expect(await savedOwn(page)).toMatchObject(PLAIN);
  expect(pageErrors(page)).toEqual([]);
});

test("a rehearsal never saves a scene's settings as the player's own: reloaded mid-rehearsal, carried on and stopped, their own sound is back", async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await ownSoundIsPlain(page);
  await makePlan(page);
  await page.getByRole('button', { name: /Rehearse from Open/ }).click();
  const strip = page.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Open');
  await pieceClockRunning(page);
  await pause(page, 1200);
  expect(await savedOwn(page)).toMatchObject(PLAIN);
  // A reload (or a crash) mid-rehearsal: carry on, then stop (T3-17).
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'The piece was playing' }).getByRole('button', { name: /Carry on from/ }).click();
  await expect(strip).toContainText('Now: Open');
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expectPlainSound(page);
  await pause(page, 1200);
  expect(await savedOwn(page)).toMatchObject(PLAIN);
  expect(pageErrors(page)).toEqual([]);
});

test('a reload mid-piece offers to carry on from where the clock would be', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await startPiece(page);
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  await pieceClockRunning(page);
  await page.reload();
  // Straight back to the board: no home screen, no hunting for it.
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing when the page closed or reloaded' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: /Carry on from/ }).click();
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  expect(pageErrors(page)).toEqual([]);
});

test('the Carry on offer goes once the piece would be over: it never offers to carry on from the end', async ({ page }) => {
  await openLaptopBoard(page);
  // A 0:30 piece that started 15 s ago, remembered as a closed or reloaded tab leaves it.
  await page.evaluate(() => localStorage.setItem('admi-piece-running', JSON.stringify({ startedAt: Date.now() - 15_000, lengthSec: 30, show: false })));
  await page.reload();
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing' });
  await expect(offer.getByRole('button', { name: /Carry on from 0:[12]\d/ })).toBeVisible();
  // Its time runs out while the offer waits: the offer goes, rather than "Carry on from 0:30".
  await expect(offer).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Carry on from/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a closed laptop tab, reopened within the piece, offers Carry on; a second tab never does while the first still plays it', async ({ page, context }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await pieceClockRunning(page);
  // A second tab while the first plays the piece: only why it can't save, no Carry on.
  const second = await openAnotherTab(context);
  await expect(second.getByRole('heading', { name: 'ADMI is open in another tab' })).toBeVisible();
  await expect(second.getByText(/The piece was playing/)).toHaveCount(0);
  await second.close();
  // The laptop's tab closes mid-piece (a slip, or a crash), and ADMI is opened again (T3-08).
  await page.close();
  const again = await openAnotherTab(context);
  const offer = again.getByRole('alert').filter({ hasText: 'The piece was playing' });
  await expect(offer.getByRole('button', { name: /Carry on from 0:\d\d/ })).toBeVisible();
  await offer.getByRole('button', { name: /Carry on from/ }).click();
  await expect(again.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  await expect(again.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  expect(pageErrors(again)).toEqual([]);
});

test('a reload during Show carries on in Show', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(page.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  // Not a fixed wait: the piece starts once its sound is ready (up to 4 s on a busy
  // machine), and a reload before that has no piece to carry on: the flake that landed on
  // the home screen.
  await pieceClockRunning(page);
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

test('while Start the piece loads, the iPad shows the opening loops on, and a loop tapped then joins them', async ({ page, context }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page); // Bed, and Loop 2
  await makePlan(page); // Arrival, at 0:00, has Bed
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
  await expect(ipad.getByRole('button', { name: /^Bed: OFF/ })).toBeVisible();
  // The sounds are slow to arrive, so Start the piece waits for them (a few seconds at most).
  let release = (): void => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/samples/**', async (route) => { await held; await route.continue(); });
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  // Still loading: Bed, Arrival's loop, is already on, as it will be. Shown off, a tap
  // meant to turn it on turned it off, and Arrival opened without its loop.
  await expect(ipad.getByRole('button', { name: /^Bed: ON · starts with Play/ })).toBeVisible({ timeout: 3000 });
  await ipad.getByRole('button', { name: /^Loop 2: OFF/ }).dispatchEvent('pointerdown', touch);
  release();
  await expect(ipad.getByText('Connected · playing')).toBeVisible({ timeout: 20_000 });
  await expect(ipad.getByRole('button', { name: /^Bed: (ON|starting|coming in)/ })).toBeVisible();
  await expect(ipad.getByRole('button', { name: /^Loop 2: (ON|starting|coming in)/ })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Capture from an iPad while the piece plays makes no loop, and the laptop says why", async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  await startPiece(page);
  await pieceClockRunning(page);
  // An iPad page that still offers Capture during the piece (one from before this rule).
  await page.evaluate((code) => new Promise<void>((done) => {
    const ws = new WebSocket(`ws://${location.host}/admi-remote?code=${code}&role=remote`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'trigger', name: 'capture' }));
      setTimeout(() => { ws.close(); done(); }, 300);
    };
  }), code);
  await expect(page.getByText('iPad: Capture not taken (stop the piece to make a loop)')).toBeVisible();
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: /· Loops/ }).click();
  await expect(page.getByRole('listitem', { name: 'Loop 1: Loop 1, empty' })).toBeVisible();
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

// ---- Loops (WP-C): New loop is silent at once, one way to make a loop, clearing, a full set ----

/** Press a button inside the page just after a pass's first notes go out: they then ring on. */
async function pressAfterNotes(page: Page, label: string): Promise<void> {
  await page.evaluate(async (label) => {
    const count = (): string => [...document.querySelectorAll('button')]
      .find((b) => /Save the session log/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))?.textContent ?? '';
    const was = count();
    const until = performance.now() + 15_000;
    while (count() === was && performance.now() < until) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 120));
    [...document.querySelectorAll('button')].find((b) => b.textContent === label)?.click();
  }, label);
}

test('New loop silences the notes still ringing at once, as Stop does; after the board is cleared the counters sound again', async ({ page }) => {
  await listenToOutput(page);
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Full' }).click();
  // A bass and a chord counter on step 1: each rings for most of the pass.
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1]]);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.05);
  await pressAfterNotes(page, 'New loop');
  // Silence from the first quarter second (before: about 2.5 s of ringing at full level).
  const after = await outputLevels(page, 8);
  expect(after.length).toBe(8);
  expect(Math.max(...after)).toBeLessThan(0.01);
  await expect(page.getByRole('heading', { name: 'New loop 1 · silent' })).toBeVisible();
  await expect(page.getByText('Lift the 2 counters to start from silence.', { exact: true })).toBeVisible();
  // Clear the board: straight on to composing, never "Lift the 0 counters" (T2-03, T1-05).
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await expect(page.getByText('Only the counters sound. Put them down, listen, change them.')).toBeVisible();
  await expect(page.getByText(/Lift the 0/)).toHaveCount(0);
  // A counter put down now is heard: the voices started afresh, they were not lost.
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [3, 5], [5, 7]]);
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.02);
  expect(pageErrors(page)).toEqual([]);
});

test('with every loop full, Keep says so on screen and is off; the heading claims no number', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  for (let i = 1; i <= 8; i++) {
    await page.getByRole('button', { name: 'Save the board here' }).first().click();
    await expect(page.getByRole('listitem', { name: new RegExp(`^Loop ${i}: Loop ${i}, 1 note$`) })).toBeVisible();
  }
  await page.getByRole('button', { name: 'New loop' }).click();
  await expect(page.getByRole('heading', { name: 'New loop · silent' })).toBeVisible();
  await page.getByRole('button', { name: 'Start with these' }).click();
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  await expect(keep).toBeDisabled();
  await expect(page.getByText('Every loop is full: clear one first')).toBeVisible();
  // Clear one (still possible inside New loop): now there is a place for it.
  await page.getByRole('button', { name: 'Clear loop 8' }).click();
  await page.getByRole('dialog', { name: 'Clear Loop 8?' }).getByRole('button', { name: 'Clear it' }).click();
  await expect(page.getByRole('heading', { name: 'New loop 8 · not kept yet' })).toBeVisible();
  await expect(keep).toBeEnabled();
  await expect(page.getByText('Every loop is full: clear one first')).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('while the piece plays: New loop is off and says why, there is no other way to make a loop, and no Capture', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(page.getByRole('timer').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Capture/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave Show' }).click();
  await expect(page.getByRole('button', { name: /Capture/ })).toHaveCount(0);
  await pieceStep(page, 'Loops');
  await expect(page.getByRole('button', { name: 'New loop' })).toBeDisabled();
  await expect(page.getByText('Stop the piece to make a loop')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save the board here' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit the notes of loop/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('inside New loop there is one way to make a loop: Keep', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await page.getByRole('button', { name: 'New loop' }).click();
  await expect(page.getByRole('heading', { name: 'New loop 3 · not kept yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save the board here' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Overwrite/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit the notes of loop/ })).toHaveCount(0);
  await expect(page.getByRole('listitem', { name: /^Loop 1: Bed/ }).getByRole('button', { name: '▶ Play' })).toHaveCount(0);
  // Leaving brings them back, for now.
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save the board here' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Stop while hearing a loop in New loop, then Play: the loop does not come back, on screen or in sound', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bed');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('button', { name: 'New loop' }).click();
  const hearLoop = page.getByRole('combobox', { name: 'Hear it with a loop' });
  await hearLoop.selectOption({ label: 'Bed' });
  const row = page.getByRole('listitem', { name: /^Loop 1: Bed/ });
  await expect(row).toHaveAttribute('aria-label', /▶ playing$/, { timeout: 20_000 });
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  // Stop ends "Hear it with…" too.
  await expect(hearLoop).toHaveValue('');
  await page.waitForTimeout(600); // ▶ Play ignores a press straight after Stop (a bounce): this is a new press
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  await expect.poll(() => notesPlayed(page), { timeout: 10_000 }).toBe(0);
  await page.waitForTimeout(4000);
  await expect(row).toHaveAttribute('aria-label', 'Loop 1: Bed, 4 notes');
  expect(await notesPlayed(page)).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test('■ Stop pressed twice quickly, with no piece clock, stops and stays stopped', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect(page.getByRole('button', { name: '■ Stop' }).first()).toBeVisible();
  // Two presses 150 ms apart, timed inside the page: the second lands on ▶ Play.
  await page.evaluate(async () => {
    const find = (text: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
    find('■ Stop')?.click();
    await new Promise((r) => setTimeout(r, 150));
    find('▶ Play')?.click();
  });
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: '▶ Play' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '■ Stop' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('two tabs: only the first saves; the second says why and saves nothing; when the first closes, the second takes over with every loop', async ({ page, context }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await pause(page, 800); // saves are gathered for a moment

  // A second tab of ADMI: it counts every write it would make, to the browser or the laptop.
  const second = await context.newPage();
  const sentToLaptop: string[] = [];
  await second.route('**/admi-store**', (route) => {
    if (route.request().method() !== 'GET') sentToLaptop.push(route.request().method());
    return route.request().method() === 'GET' ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 204, body: '' });
  });
  await second.route('**/magentadata/**', (route) => route.abort());
  await second.addInitScript(() => {
    const w = window as unknown as { __writes: string[] };
    w.__writes = [];
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) { if (this === localStorage) w.__writes.push(k); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (this: Storage, k: string) { if (this === localStorage) w.__writes.push(`-${k}`); return remove.call(this, k); };
  });
  await second.goto('/');
  await expect(second.getByRole('heading', { name: 'ADMI is open in another tab' })).toBeVisible();
  await expect(second.getByText("This one can't save: close the other tab to save here.")).toBeVisible();
  // Nothing to press: no screen, so no Keep, no Save, no clearing, no player to change.
  await expect(second.getByRole('button')).toHaveCount(0);
  // The first tab knows, and is the one that saves.
  await expect(page.getByText("ADMI is also open in another tab. That tab can't save: only this one does.")).toBeVisible();

  // The first tab reloads (by mistake, mid-session): it is still the one that saves, and the
  // second still waits, for longer than it would take to replace a tab that had closed.
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await expect(page.getByRole('heading', { name: 'ADMI is open in another tab' })).toHaveCount(0);
  await pause(second, 7000);
  await expect(second.getByRole('heading', { name: 'ADMI is open in another tab' })).toBeVisible();
  await pieceStep(page, 'Loops');

  // A loop kept in the first tab while the second is open.
  await pickColour(page, 'Green');
  await place(page, [[6, 2]]);
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: 'Name of loop 3' }).fill('Kept in A');
  await page.getByRole('textbox', { name: 'Name of loop 3' }).press('Tab');
  await pause(page, 800);
  expect(await second.evaluate(() => (window as unknown as { __writes: string[] }).__writes)).toEqual([]);
  expect(sentToLaptop).toEqual([]);

  // The first tab closes: the second takes over, with every loop the first one kept.
  await page.close();
  await second.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(second, 'Loops');
  await expect(second.getByRole('textbox', { name: 'Name of loop 1' })).toHaveValue('Bed');
  await expect(second.getByRole('textbox', { name: 'Name of loop 3' })).toHaveValue('Kept in A');
  // It saves now, and a plain reload of it (the only tab) keeps what it saved.
  await second.getByRole('textbox', { name: 'Name of loop 2' }).fill('Kept in B');
  await second.getByRole('textbox', { name: 'Name of loop 2' }).press('Tab');
  await pause(second, 800);
  await second.reload();
  await expect(second.getByRole('heading', { name: 'ADMI is open in another tab' })).toHaveCount(0);
  await second.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(second, 'Loops');
  await expect(second.getByRole('textbox', { name: 'Name of loop 2' })).toHaveValue('Kept in B');
  await expect(second.getByRole('textbox', { name: 'Name of loop 3' })).toHaveValue('Kept in A');
  expect(pageErrors(page)).toEqual([]);
});
// ---- WP-F2a: starting and ending the piece (round 2's Blockers F2-1, F2-2, F2-3) ----

/** The piece's length, typed in Make a piece → Ending & check ("1:00"). */
async function pieceLength(page: Page, text: string): Promise<void> {
  await pieceStep(page, 'Ending & check');
  const length = page.getByRole('textbox', { name: /Length of the piece/ });
  await length.fill(text);
  await length.press('Tab');
}

/** The timer's words at the moment the Now / Next strip first names `scene` (read in the page). */
const timerWhenNow = (page: Page, scene: string, timeout = 30_000): Promise<string> => page.waitForFunction((name) => {
  const strip = document.querySelector('[role="region"][aria-label="Now and next"]');
  if (!strip?.textContent?.includes(`Now: ${name}`)) return false;
  return strip.querySelector('[role="timer"]')?.textContent ?? '';
}, scene, { timeout }).then((h) => h.jsonValue() as Promise<string>);

test('▶ Start the piece while the board plays after a jump (route A): it opens in Arrival at the full length, the next scene comes in at its time, and Stop gives the own sound back (R2-T2-01)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await ownSoundIsPlain(page);
  await pieceLength(page, '1:00');
  await makePlan(page); // Arrival 0:00, Build 0:13, Open 0:30, Home 0:51
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('button', { name: 'Jump to Build now' }).click();
  await expect(page.getByRole('button', { name: 'Jump to Build now' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  const strip = show.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Build');
  // One name for one thing: no "Start clock".
  await expect(page.getByRole('button', { name: /Start clock/ })).toHaveCount(0);
  await strip.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(strip).toContainText('Now: Arrival');
  await expect(strip).toContainText(/Next: Build in 0:1[23]/);
  await expect(strip.getByRole('timer')).toHaveText(/^(1:00|0:5\d)$/);
  await expect(show.getByRole('button', { name: '■ Stop', exact: true })).toBeFocused();
  // Build at 0:13: 0:47 left.
  expect(await timerWhenNow(page, 'Build')).toMatch(/^0:4[678]$/);
  await show.getByRole('button', { name: 'Leave Show' }).click();
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expectPlainSound(page);
  await pieceStep(page, 'Scenes');
  await expect(page.getByRole('button', { name: /· on now/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a scene added while stopped is never "on now" (route B): after a reload, ▶ Play, Show, Start the piece opens in Arrival, and the new scene comes in at its time', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page); // Bed, and Loop 2
  await pieceLength(page, '1:00');
  await makePlan(page);
  await page.getByRole('textbox', { name: 'Name for a new scene' }).fill('Coda');
  await page.getByRole('button', { name: /Add a scene from what/ }).click();
  await page.getByRole('button', { name: /^by hand · Coda/ }).click();
  await page.getByRole('group', { name: 'Loops in this scene' }).getByRole('button', { name: 'Bed' }).click();
  const time = page.getByRole('textbox', { name: /When Coda comes in/ });
  await time.fill('0:20');
  await time.press('Tab');
  await expect(page.getByRole('button', { name: /^0:20 · Coda/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /· on now/ })).toHaveCount(0);
  await pause(page, 800); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click(); // no piece playing: Welcome
  await pieceStep(page, 'Scenes');
  await expect(page.getByRole('button', { name: /^0:20 · Coda/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /· on now/ })).toHaveCount(0);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect(page.getByRole('button', { name: '■ Stop' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const strip = page.getByRole('region', { name: 'Show', exact: true }).getByRole('region', { name: 'Now and next' });
  await strip.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(strip).toContainText('Now: Arrival');
  // Build at 0:13, then Coda at 0:20: 0:40 left.
  expect(await timerWhenNow(page, 'Build')).toMatch(/^0:4[678]$/);
  expect(await timerWhenNow(page, 'Coda')).toMatch(/^0:(39|40|41)$/);
  expect(pageErrors(page)).toEqual([]);
});

test('the first scene at 0:10 and a later one left on by a jump: Start the piece reads "no scene" until 0:10, then each scene comes in at its time', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceLength(page, '1:00');
  await makePlan(page);
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();
  const time = page.getByRole('textbox', { name: /When Arrival comes in/ });
  await time.fill('0:10');
  await time.press('Tab');
  await expect(page.getByRole('button', { name: /^0:10 · Arrival/ })).toBeVisible();
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await page.getByRole('button', { name: 'Jump to Open now' }).click();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const strip = page.getByRole('region', { name: 'Show', exact: true }).getByRole('region', { name: 'Now and next' });
  await strip.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(strip).toContainText('Now: no scene');
  await expect(strip).toContainText(/Next: Arrival in 0:(09|10)/);
  expect(await timerWhenNow(page, 'Arrival')).toMatch(/^0:(49|50|51)$/);
  expect(await timerWhenNow(page, 'Build')).toMatch(/^0:4[678]$/);
  expect(pageErrors(page)).toEqual([]);
});
