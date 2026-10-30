import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { listenToOutput, makePlan, notesPlayed, openAnotherTab, openLaptopBoard, outputLevels, pageErrors, pickColour, pieceStep, place, saveBoardHere, sceneMore, sceneMoreLine, sessionLog, soundTab, startPiece } from './app';

/** Make a piece → Loops: two loops, "Bed" (two yellow counters) and an unnamed one (one blue). */
async function saveTwoLoops(page: Page): Promise<void> {
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1], [4, 5]]);
  await saveBoardHere(page);
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bed');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await saveBoardHere(page);
  await page.getByRole('button', { name: 'Clear the board' }).click();
}

/** Go to a step of Make a piece from inside it. */
/** The scene chips' whole words: a chip shows only what fits, its title has them all. */
const chipTitles = (timeline: Locator): Promise<(string | null)[]> => timeline.getByRole('listitem').getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('title')));

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
  await soundTab(page);
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('group', { name: 'Sounds change' }).getByRole('radio', { name: 'Off', exact: true }).click();
}

/** The Sound tab shows the player's own plain sound again. */
async function expectPlainSound(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await soundTab(page);
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a piece made in Make a piece survives a reload and opens in its first scene', async ({ page }) => {
  await openLaptopBoard(page);
  // Two loops: chords and a bassline, in step 1.
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1], [4, 5]]);
  await saveBoardHere(page);
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bed');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await saveBoardHere(page);
  await page.getByRole('button', { name: 'Clear the board' }).click();

  await page.getByRole('button', { name: /Next: Scenes/ }).click();
  await page.getByRole('button', { name: /Make my plan/ }).click();
  const timeline = page.getByRole('list', { name: 'Timeline of the scenes' });
  await expect.poll(() => chipTitles(timeline)).toEqual(['1 · Arrival 0:00', '2 · Build 1:30', '3 · Open 3:30', '4 · Home 6:00']);

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
  await expect.poll(() => chipTitles(page.getByRole('list', { name: 'Timeline of the scenes' }))).toEqual(['1 · Arrival 0:00', '2 · Build 2:30', '3 · Open 3:30', '4 · Home 6:00']);
  await time.fill('2.5');
  await time.press('Tab');
  await expect(page.getByRole('alert').filter({ hasText: 'Type a time as minutes:seconds, like 2:30.' })).toBeVisible();
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
  await expect.poll(() => chipTitles(page.getByRole('list', { name: 'Timeline of the scenes' }))).toEqual(['1 · Arrival 0:00', '2 · Open 3:30', '3 · Build 5:00', '4 · Home 6:00']);
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
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeHidden();
});

test('while the clock runs, Stop needs a second press', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await startPiece(page);
  await expect(page.getByRole('timer').first()).toBeVisible();
  await pause(page, 2100); // ■ Stop ignores presses for the piece's first 2 s (B3)
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  await expect(page.getByRole('button', { name: '■ Press again to stop' }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
});

test('End now: the chosen ending runs, then the piece stops by itself', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page); // Arrival sets band Gentle
  await startPiece(page);
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  await page.getByRole('region', { name: 'Now and next' }).getByRole('button', { name: '↘ End piece' }).click();
  await expect(page.getByRole('button', { name: 'Cancel the ending' }).first()).toBeVisible();
  // A fade over two passes, from the next pass: well under a minute at 90 BPM on 8 steps.
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('region', { name: 'Now and next' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

/**
 * Inside the page, from the moment the piece has ended by itself (`ended` says when): press
 * `first` 1 s after, read what it did 1.5 s later, then Space at 3 s, and read again.
 */
const pressesAfterTheEnd = (page: Page, view: 'play' | 'show'): Promise<{ first: string; space: string; said: string }> => page.evaluate(async (v) => {
  const show = (): Element | null => document.querySelector('[role="region"][aria-label="Show"]');
  const button = (text: string): HTMLButtonElement | undefined =>
    [...(v === 'show' ? show()! : document).querySelectorAll('button')].find((b) => b.textContent === text);
  const ended = (): boolean => (v === 'show' ? button('▶ Start the piece') !== undefined : document.getElementById('bs-play-stop')?.textContent === '▶ Play the board');
  const state = (): string => `${v === 'show' ? (button('▶ Start the piece') ? 'Start the piece' : 'no Start') : document.getElementById('bs-play-stop')?.textContent}${document.querySelector('[role="timer"]') ? ' + clock' : ''}`;
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  while (!ended()) await new Promise((r) => requestAnimationFrame(r));
  await wait(1000);
  (v === 'show' ? button('▶ Start the piece') : document.getElementById('bs-play-stop'))?.click();
  await wait(1500);
  const first = state();
  const said = document.querySelector('[aria-live="polite"].visually-hidden')?.textContent ?? '';
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  await wait(1200);
  return { first, space: state(), said };
}, view);

test('straight after the piece ends by itself, ▶ Play and Space start nothing (the second press of a ■ Stop pressed during the ending); 5 s on, ▶ Play plays', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await startPiece(page);
  await page.getByRole('region', { name: 'Now and next' }).getByRole('button', { name: '↘ End piece' }).click();
  expect(await pressesAfterTheEnd(page, 'play')).toEqual({ first: '▶ Play the board', space: '▶ Play the board', said: 'The piece has just ended.' });
  // Only for a moment: 5 s on, ▶ Play plays.
  await page.waitForTimeout(1500);
  await page.locator('#bs-play-stop').click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('in Show, straight after the piece ends by itself, ▶ Start the piece and Space start nothing; 5 s on, ▶ Start the piece starts it', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await show.getByRole('button', { name: '↘ End piece' }).click();
  expect(await pressesAfterTheEnd(page, 'show')).toEqual({ first: 'Start the piece', space: 'Start the piece', said: 'The piece has just ended.' });
  await page.waitForTimeout(1500);
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(show.getByRole('timer')).toBeVisible({ timeout: 20_000 });
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('checkbox', { name: 'End piece', exact: true }).check();
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  // A new player's iPad has the safe show layout: End piece is on the page Tim plays on.
  await expect(page.getByRole('checkbox', { name: 'End piece', exact: true })).toBeChecked();
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  // The laptop is stopped, so a press of New idea is refused and the iPad says so (B18):
  // that is how a press is seen here. Extra notes never changes.
  const extraNotes = ipad.getByRole('slider', { name: 'Extra notes' });
  const pressed = ipad.getByText('Press Play on the laptop first');
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');
  const box = (await ipad.getByRole('button', { name: /New idea/ }).boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  // Lands on New idea, slides well off it (to the status line at the top), lifts there.
  await finger('touchStart', x, y);
  for (const step of [0.25, 0.5, 0.75, 1]) await finger('touchMove', x, y - (y - 20) * step);
  await finger('touchEnd');
  await ipad.waitForTimeout(1500);
  await expect(pressed).toHaveCount(0);
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');

  // Lands, slides off, comes back, lifts on the pad: still nothing.
  await finger('touchStart', x, y);
  await finger('touchMove', x, 20);
  await finger('touchMove', x, y);
  await finger('touchEnd');
  await ipad.waitForTimeout(1500);
  await expect(pressed).toHaveCount(0);
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');

  // The same pad, landed on and lifted from: it acts (refused, as the laptop is stopped).
  await finger('touchStart', x, y);
  await finger('touchEnd');
  await expect(pressed).toBeVisible();
  await expect(extraNotes).toHaveAttribute('aria-valuetext', 'Off');
  expect(pageErrors(page)).toEqual([]);
});

test('"Use the safe show layout" sets out the iPad for the show and says what it did', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  // A new player starts with it.
  await expect(page.getByText('✓ The iPad has the safe show layout.')).toBeVisible();
  // Things added back for a rehearsal...
  await page.getByRole('checkbox', { name: 'Mute', exact: true }).check();
  // The one tick also brings back Capture, Stop all and End piece, and says so (R2-T3-06).
  await page.getByRole('checkbox', { name: 'Loops & scenes page (also shows Capture, Stop the loops and End piece)', exact: true }).check();
  await page.getByRole('checkbox', { name: '🔒 Speed' }).uncheck();
  await expect(page.getByText('✓ The iPad has the safe show layout.')).toHaveCount(0);
  // ...and one button for the show.
  await page.getByRole('button', { name: 'Use the safe show layout' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done: the iPad now shows only the Extra notes strip, New idea and End piece' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mute', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Loops & scenes page' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: '🔒 Speed' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Extra notes', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'End piece', exact: true })).toBeChecked();
  expect(pageErrors(page)).toEqual([]);
});

test("an iPad page from before an update is named on the laptop, never on the iPad; the check offers the safe show layout", async ({ page, context }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await page.getByRole('button', { name: /Rehearse from here, Home/ }).click();
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
  await expect(page.getByRole('button', { name: /^Rehearse from here, Open/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jump to Open now' })).toHaveCount(0);
  // Playing: Open (full band, extra notes, sounds change) comes in at once…
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: 'Jump to Open now' }).click();
  await expect(page.getByRole('button', { name: 'Jump to Open now' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await soundTab(page);
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
  await page.getByRole('button', { name: /Rehearse from here, Open/ }).click();
  const strip = page.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Open');
  await pieceClockRunning(page);
  await pause(page, 1200);
  expect(await savedOwn(page)).toMatchObject(PLAIN);
  // A reload (or a crash) mid-rehearsal: carry on, then stop (T3-17).
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'The piece was playing' }).getByRole('button', { name: /Carry on from/ }).click();
  await expect(strip).toContainText('Now: Open');
  await pause(page, 2100); // ■ Stop ignores presses for the piece's first 2 s (B3)
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

test('the Carry on offer runs out before the ending would begin: it never offers to carry on into the ending, or from the end (R2-T3-01)', async ({ page }) => {
  await openLaptopBoard(page);
  // A 7:00 piece with 0:30 left, remembered as a closed or reloaded tab leaves it. Its
  // ending begins about 0:17 before the end (90 BPM, 8 steps, a 2-pass fade), so Carry on
  // is offered until about 0:22 left.
  await page.evaluate(() => localStorage.setItem('admi-piece-running', JSON.stringify({ startedAt: Date.now() - 390_000, lengthSec: 420, show: false })));
  await page.reload();
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing' });
  await expect(offer.getByRole('button', { name: /Carry on from 6:3\d/ })).toBeVisible();
  // Its time runs out while the offer waits: the offer changes to the piece having ended.
  await expect(endedLine(page)).toBeVisible({ timeout: 15_000 });
  await expect(offer).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Carry on from/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '■ Stop' })).toHaveCount(0);
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
  await saveBoardHere(page);
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bells');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await saveBoardHere(page);
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();

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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await saveBoardHere(page);
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bells');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
      .find((b) => /Save session/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))?.textContent ?? '';
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
  await soundTab(page);
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Full' }).click();
  // A bass and a chord counter on step 1: each rings for most of the pass.
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await pickColour(page, 'Yellow');
  await place(page, [[4, 1]]);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.05);
  await pressAfterNotes(page, 'New loop');
  // Silence from the first quarter second (before: about 2.5 s of ringing at full level).
  const after = await outputLevels(page, 8);
  expect(after.length).toBe(8);
  expect(Math.max(...after)).toBeLessThan(0.01);
  await expect(page.getByRole('heading', { name: 'New loop 1 · silent' })).toBeVisible();
  await expect(page.getByText('Lift the 2 counters, or press Clear the board.', { exact: true })).toBeVisible();
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

test('with every loop full, New loop is off and says why beside it; clearing one lets a new loop in (R2-T1-05, R2-T4-04)', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  for (let i = 1; i <= 8; i++) {
    await saveBoardHere(page);
    await expect(page.getByRole('listitem', { name: new RegExp(`^Loop ${i}: Loop ${i}, 1 note$`) })).toBeVisible();
  }
  // No loop can be kept, so New loop is off before the board is cleared for one.
  const newLoop = page.getByRole('button', { name: 'New loop', exact: true });
  await expect(newLoop).toBeDisabled();
  await expect(newLoop).toHaveAccessibleDescription('Every loop is full: clear one first');
  await expect(page.getByText('Every loop is full: clear one first')).toBeVisible();
  // Clear one: now there is a place for it.
  await page.getByRole('button', { name: 'Clear loop 8' }).click();
  await page.getByRole('dialog', { name: 'Clear Loop 8?' }).getByRole('button', { name: 'Clear it' }).click();
  await expect(newLoop).toBeEnabled();
  await expect(page.getByText('Every loop is full: clear one first')).toHaveCount(0);
  await newLoop.click();
  await expect(page.getByRole('heading', { name: 'New loop 8 · silent' })).toBeVisible();
  await page.getByRole('button', { name: 'Start with these' }).click();
  await expect(page.getByRole('button', { name: 'Keep', exact: true })).toBeEnabled();
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
  await expect(page.getByRole('button', { name: 'Keep the board as this loop' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit notes, loop/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('inside New loop there is one way to make a loop: Keep', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await page.getByRole('button', { name: 'New loop' }).click();
  await expect(page.getByRole('heading', { name: 'New loop 3 · not kept yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep the board as this loop' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Overwrite/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Edit notes, loop/ })).toHaveCount(0);
  await expect(page.getByRole('listitem', { name: /^Loop 1: Bed/ }).getByRole('button', { name: '▶ Play' })).toHaveCount(0);
  // Leaving brings them back, for now.
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep the board as this loop' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Stop while hearing a loop in New loop, then Play: the loop does not come back, on screen or in sound', async ({ page }) => {
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await saveBoardHere(page);
  await page.getByRole('textbox', { name: 'Name of loop 1' }).fill('Bed');
  await page.getByRole('button', { name: 'Clear the board' }).click();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: 'New loop' }).click();
  const hearLoop = page.getByRole('combobox', { name: 'Hear it with a loop' });
  await hearLoop.selectOption({ label: 'Bed' });
  const row = page.getByRole('listitem', { name: /^Loop 1: Bed/ });
  await expect(row).toHaveAttribute('aria-label', /▶ playing$/, { timeout: 20_000 });
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  // Stop ends "Hear it with…" too.
  await expect(hearLoop).toHaveValue('');
  await page.waitForTimeout(600); // ▶ Play ignores a press straight after Stop (a bounce): this is a new press
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('button', { name: '■ Stop' }).first()).toBeVisible();
  // Two presses 150 ms apart, timed inside the page: the second lands on ▶ Play.
  await page.evaluate(async () => {
    const find = (text: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
    find('■ Stop')?.click();
    await new Promise((r) => setTimeout(r, 150));
    find('▶ Play the board')?.click();
  });
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
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
  await saveBoardHere(page);
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

/** Make a piece → Loops: "Bed" (two yellow counters) and "Pulse" (one blue). */
async function saveBedAndPulse(page: Page): Promise<void> {
  await saveTwoLoops(page);
  await page.getByRole('textbox', { name: 'Name of loop 2' }).fill('Pulse');
  await page.getByRole('textbox', { name: 'Name of loop 2' }).press('Tab');
}

/**
 * Wait, inside the page, until the remembered piece's clock (counted from its first start,
 * the page's own piece marker) reaches `sec`. Resolves with that first start (Date.now()).
 */
const untilPieceAt = (page: Page, sec: number): Promise<number> => page.evaluate(async (s) => {
  const p = JSON.parse(localStorage.getItem('admi-piece-running') ?? 'null') as { startedAt: number } | null;
  if (!p) throw new Error('no piece remembered');
  while (Date.now() - p.startedAt < s * 1000) await new Promise((r) => setTimeout(r, 20));
  return p.startedAt;
}, sec);

/** The timer's words at the moment the Now / Next strip first names `scene` (read in the page). */
const timerWhenNow = (page: Page, scene: string, timeout = 30_000): Promise<string> => page.waitForFunction((name) => {
  const strip = document.querySelector('[role="region"][aria-label="Now and next"]');
  if (!strip?.textContent?.includes(`Now: ${name}`)) return false;
  return strip.querySelector('[role="timer"]')?.textContent ?? '';
}, scene, { timeout }).then((h) => h.jsonValue() as Promise<string>);

/** The line saying the piece ended across a reload. */
const endedLine = (page: Page) => page.getByRole('status').filter({ hasText: 'The piece was ending when the page closed or reloaded, so it has ended.' });

test('Space in Show starts the piece: the clock, the opening scene and its loop, focus on the Now / Next strip; Space twice stops it (R2-T4-01)', async ({ page }) => {
  await openLaptopBoard(page);
  await saveBedAndPulse(page);
  await makePlan(page); // Arrival, at 0:00, has Bed
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click(); // by mouse
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await expect(show).toBeFocused();
  await page.keyboard.press('Space');
  await expect(show.getByRole('timer')).toBeVisible({ timeout: 20_000 });
  const strip = show.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Now: Arrival');
  await expect(strip.getByLabel(/^Loops playing: .*Bed/)).toBeVisible();
  // Never onto ■ Stop (B3): the strip.
  await expect(strip).toBeFocused();
  // Space twice, with focus on Show itself, past Stop's first 2 s: the first only gets Stop ready.
  await pause(page, 2100);
  await show.focus();
  await page.keyboard.press('Space');
  await expect(show.getByRole('button', { name: '■ Press again to stop' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(show.getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  await expect(show.getByRole('timer')).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('Space in Show while Tim warms up starts the piece at once: the board never stops (R3-TA-01)', async ({ page }) => {
  await openLaptopBoard(page);
  await saveBedAndPulse(page);
  await makePlan(page); // Arrival, at 0:00, has Bed
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await expect(show.getByRole('button', { name: '■ Stop', exact: true })).toBeVisible();
  // Space on Show itself; watched inside the page from that moment until the clock shows:
  // ■ Stop must be there throughout (the board stopping takes it away).
  const stopped = await page.evaluate(async () => {
    const region = document.querySelector('[role="region"][aria-label="Show"]') as HTMLElement;
    const stopThere = (): boolean => [...region.querySelectorAll('button')].some((b) => /^■ (Stop|Press again to stop)$/.test(b.textContent ?? ''));
    let gone = false;
    const watch = new MutationObserver(() => { if (!stopThere()) gone = true; });
    watch.observe(region, { childList: true, subtree: true, characterData: true });
    region.focus();
    region.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    const until = Date.now() + 20_000;
    while (region.querySelector('[role="timer"]') === null && Date.now() < until) await new Promise((r) => requestAnimationFrame(r));
    watch.disconnect();
    return { gone, timer: region.querySelector('[role="timer"]') !== null };
  });
  expect(stopped).toEqual({ gone: false, timer: true });
  await expect(show.getByRole('region', { name: 'Now and next' })).toContainText('Now: Arrival');
  // Now the piece plays: Space is Stop again (after its first 2 s, B3), two presses.
  await pause(page, 2100);
  await show.focus();
  await page.keyboard.press('Space');
  await expect(show.getByRole('button', { name: '■ Press again to stop' })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('a Space 200 ms after a Stop starts nothing, in Show and in Play (ledger M7)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  // Space pressed on the page 200 ms after `presses` of Stop, all timed inside the page.
  const spaceAfterStop = (presses: number) => page.evaluate(async (n) => {
    const stopButton = () => [...document.querySelectorAll('button')].find((b) => /^■ (Stop|Press again to stop)$/.test(b.textContent ?? ''));
    for (let i = 0; i < n; i++) stopButton()?.click();
    await new Promise((r) => setTimeout(r, 200));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 2500)); // long enough for a start to be playing
  }, presses);
  // Show, the piece playing: Stop twice, then Space.
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(show.getByRole('timer')).toBeVisible({ timeout: 20_000 });
  await pause(page, 2100); // ■ Stop ignores presses for the piece's first 2 s (B3)
  await spaceAfterStop(2);
  await expect(show.getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  await expect(show.getByRole('button', { name: /■ Stop|Press again to stop/ })).toHaveCount(0);
  // Play, plain play: one Stop, then Space.
  await show.getByRole('button', { name: 'Leave Show' }).click();
  await pause(page, 500);
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('button', { name: '■ Stop' }).first()).toBeVisible();
  await spaceAfterStop(1);
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '■ Stop' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('the Carry on offer takes focus; Space on the page under it starts nothing, and the offer stays', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await startPiece(page);
  await pieceClockRunning(page);
  await page.reload();
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing when the page closed or reloaded' });
  const carryOn = offer.getByRole('button', { name: /Carry on from/ });
  await expect(carryOn).toBeFocused();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await pause(page, 2000);
  await expect(carryOn).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '■ Stop' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('▶ Start the piece while the board plays after a jump (route A): it opens in Arrival at the full length, the next scene comes in at its time, and Stop gives the own sound back (R2-T2-01)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await ownSoundIsPlain(page);
  await pieceLength(page, '1:00');
  await makePlan(page); // Arrival 0:00, Build 0:13, Open 0:30, Home 0:51
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
  // Focus stays on the strip, never onto ■ Stop (B3).
  await expect(strip).toBeFocused();
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
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

test('a reload in the last seconds (rehearse from Home, reload at 0:54 of 1:00): no Carry on, the piece has ended, silence', async ({ page }) => {
  await listenToOutput(page);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceLength(page, '1:00');
  await makePlan(page); // Home at 0:51
  await page.getByRole('button', { name: /Rehearse from here, Home/ }).click();
  await pieceClockRunning(page);
  await untilPieceAt(page, 54);
  await page.reload();
  await expect(endedLine(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Carry on from/ })).toHaveCount(0);
  const levels = await outputLevels(page, 12, 250); // 3 s
  expect(levels.every((v) => v === 0), `levels after the reload: ${levels.join(', ')}`).toBe(true);
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
  // OK: the line goes, and nothing starts.
  await endedLine(page).getByRole('button', { name: 'OK' }).click();
  await expect(endedLine(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '■ Stop' })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('a reload with the automatic ending under way: no Carry on, the piece has ended', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await pieceLength(page, '1:00');
  await makePlan(page); // Open at 0:30; the ending begins by itself about 0:17 before the end
  await page.getByRole('button', { name: /Rehearse from here, Open/ }).click();
  await pieceClockRunning(page);
  await expect(page.getByRole('button', { name: 'Cancel the ending' }).first()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(endedLine(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Carry on from/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('↘ End piece in Show, then a reload with a minute left: the piece has ended, in Show, with no Bed (R2-T3-02)', async ({ page }) => {
  await listenToOutput(page);
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await makePlan(page); // 7:00; Home at 6:00 has Bed
  await page.getByRole('button', { name: /Rehearse from here, Home/ }).click();
  await pieceClockRunning(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await untilPieceAt(page, 362);
  await show.getByRole('button', { name: '↘ End piece' }).click();
  await expect(show.getByRole('button', { name: 'Cancel the ending' })).toBeVisible();
  await pause(page, 3000);
  await page.reload();
  // Back where it was, in Show: stopped, silent, and saying why.
  const showAgain = page.getByRole('region', { name: 'Show', exact: true });
  await expect(showAgain.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  await expect(showAgain.getByRole('status').filter({ hasText: 'so it has ended' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Carry on from/ })).toHaveCount(0);
  // Space does nothing while the line is up: no new piece.
  await page.keyboard.press('Space');
  const levels = await outputLevels(page, 12, 250);
  expect(levels.every((v) => v === 0), `levels after the reload: ${levels.join(', ')}`).toBe(true);
  await expect(showAgain.getByRole('timer')).toHaveCount(0);
  await expect(showAgain.getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('a reload with more left than the ending needs: Carry on, the ending begins on time, the last sound is by the first start + length, and no louder (R2-T3-01)', async ({ page }) => {
  test.setTimeout(180_000);
  await listenToOutput(page);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await ownSoundIsPlain(page);
  await pieceLength(page, '5:00');
  await makePlan(page); // Home at 4:17, 0:43 before the end
  await page.getByRole('button', { name: /Rehearse from here, Home/ }).click();
  await pieceClockRunning(page);
  const startedAt = await untilPieceAt(page, 258);
  const before = Math.max(...await outputLevels(page, 20, 250)); // the 5 s before the reload
  expect(before).toBeGreaterThan(0.001);
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'The piece was playing' }).getByRole('button', { name: /Carry on from 4:2\d/ }).click();
  // From here on, measured in the page against the first start, on its wall clock.
  const r = await page.evaluate(async ({ startedAt, lengthMs }) => {
    const buf = new Float32Array(2048);
    let endingAt: number | null = null;
    let peakAfter = 0;
    let lastSound = 0;
    while (Date.now() < startedAt + lengthMs + 2000) {
      const an = (window as unknown as { __admiMeter?: AnalyserNode }).__admiMeter;
      let level = 0;
      if (an) {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        level = Math.sqrt(sum / buf.length);
      }
      if (endingAt === null && document.querySelector('[role="timer"]')?.textContent?.startsWith('ending')) endingAt = Date.now();
      if (endingAt !== null) peakAfter = Math.max(peakAfter, level);
      if (level > 0.001) lastSound = Date.now();
      await new Promise((res) => setTimeout(res, 15));
    }
    return { endingAt: endingAt === null ? null : (endingAt - startedAt) / 1000, peakAfter, lastSound: (lastSound - startedAt) / 1000 };
  }, { startedAt, lengthMs: 300_000 });
  // The ending begins 16.8 s before the end (90 BPM, 8 steps, a 2-pass fade), on the clock
  // counted from the first start: not later by however long the sound took to come back.
  expect(r.endingAt).not.toBeNull();
  expect(r.endingAt!).toBeGreaterThanOrEqual(300 - 16.8 - 0.5);
  expect(r.endingAt!).toBeLessThanOrEqual(300 - 16.8 + 0.75);
  expect(r.lastSound).toBeGreaterThan(270);
  expect(r.lastSound).toBeLessThanOrEqual(300.5);
  // Never louder: the fade starts from where the music was (a little measuring slack).
  expect(r.peakAfter, `before ${before}, after the ending began ${r.peakAfter}`).toBeLessThanOrEqual(before * 1.15 + 0.002);
  expect(pageErrors(page)).toEqual([]);
});

test('two reloads mid-piece, each carried on: silent by the first start + the length on the wall clock', async ({ page }) => {
  test.setTimeout(180_000);
  await listenToOutput(page);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await pieceLength(page, '1:00');
  await makePlan(page);
  await startPiece(page);
  await pieceClockRunning(page);
  const startedAt = await untilPieceAt(page, 10);
  for (const at of [10, 20]) {
    await untilPieceAt(page, at);
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'The piece was playing' }).getByRole('button', { name: /Carry on from/ }).click();
    await pieceClockRunning(page);
  }
  // The clock carried on from the first start: it reads the time since then.
  const left = await page.evaluate((s) => {
    const text = document.querySelector('[role="timer"]')?.textContent ?? '';
    const m = /(\d+):(\d\d)$/.exec(text);
    return m ? { shown: Number(m[1]) * 60 + Number(m[2]), real: 60 - (Date.now() - s) / 1000 } : null;
  }, startedAt);
  expect(left).not.toBeNull();
  expect(Math.abs(left!.shown - left!.real)).toBeLessThanOrEqual(1);
  const lastSound = await page.evaluate(async (s) => {
    const buf = new Float32Array(2048);
    let last = 0;
    while (Date.now() < s + 62_000) {
      const an = (window as unknown as { __admiMeter?: AnalyserNode }).__admiMeter;
      if (an) {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        if (Math.sqrt(sum / buf.length) > 0.001) last = Date.now();
      }
      await new Promise((res) => setTimeout(res, 15));
    }
    return (last - s) / 1000;
  }, startedAt);
  expect(lastSound).toBeGreaterThan(30); // it played
  expect(lastSound).toBeLessThanOrEqual(60.5);
  await expect(page.getByRole('button', { name: '▶ Play the board' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('while ▶ Start the piece loads, an iPad Capture is refused and the iPad shows Capture unavailable', async ({ page, context }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  await page.getByRole('checkbox', { name: 'Loops & scenes page' }).check();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 1180, height: 820 });
  await ipad.goto(`/?remote=${code}`);
  await expect(ipad.getByText('Connected · press Play on the laptop')).toBeVisible();
  await ipad.getByRole('tab', { name: 'Loops & scenes', exact: true }).dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, width: 30, height: 30 });
  const capture = ipad.getByRole('button', { name: /^Capture: save what is on the board/ });
  await expect(capture).toBeEnabled();
  // The sounds are slow to arrive: the piece is starting, its clock not running yet.
  let release = (): void => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/samples/**', async (route) => { await held; await route.continue(); });
  await startPiece(page); // Show → ▶ Start the piece → Leave Show, while the sound still loads
  await expect(capture).toBeDisabled();
  // An iPad page that still offers Capture then (one from before this rule).
  await page.evaluate((code) => new Promise<void>((done) => {
    const ws = new WebSocket(`ws://${location.host}/admi-remote?code=${code}&role=remote`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'trigger', name: 'capture' }));
      setTimeout(() => { ws.close(); done(); }, 300);
    };
  }), code);
  await expect(page.getByText('iPad: Capture not taken (stop the piece to make a loop)')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0); // still loading
  release();
  await pieceClockRunning(page);
  await expect(capture).toBeDisabled();
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: /· Loops/ }).click();
  await expect(page.getByRole('listitem', { name: 'Loop 1: Loop 1, empty' })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

// ---- WP-F2b: Update from now, Tim alone, New loop from a stopped board ----

/** A scene as saved in the browser: what a reload, the next session and the show get. */
async function savedScene(page: Page, name: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((name) => {
    const id = localStorage.getItem('admi-board-active-player');
    const players = JSON.parse(localStorage.getItem('admi-board-players') ?? '[]') as { id: string; settings: { scenes?: { name: string }[] } }[];
    const s = (players.find((p) => p.id === id) ?? players[0])?.settings ?? {};
    return (s.scenes ?? []).find((sc) => sc.name === name) ?? null;
  }, name);
}

/** The sound the player has now, as saved: what Update from now copies into a scene. */
async function savedSoundNow(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const id = localStorage.getItem('admi-board-active-player');
    const players = JSON.parse(localStorage.getItem('admi-board-players') ?? '[]') as { id: string; settings: Record<string, unknown> }[];
    const s = (players.find((p) => p.id === id) ?? players[0])?.settings ?? {};
    return { soundWorld: s.soundWorld, band: s.band, phrases: s.phrases, fillAmount: s.fillAmount, evolveAmount: s.evolveAmount, bpm: s.bpm, chords: s.chords, bandJobs: s.bandJobs, sceneEnergy: s.sceneEnergy };
  });
}

test('Update from now: not there while stopped; while playing it copies the loops and the sound now, and Undo puts the scene back exactly (R2-T2-02)', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  await sceneMore(page);
  // Stopped: nothing plays, so there is nothing to copy (it emptied the scene and lost its sound).
  await expect(page.getByRole('button', { name: 'Update from now' })).toHaveCount(0);
  await expect(page.getByText('While the board plays, Update from now copies what is playing into this scene.')).toBeVisible();
  await pause(page, 800); // saves are gathered for a moment
  const before = await savedScene(page, 'Open');
  expect(before).not.toBeNull();
  // The sound now: a full band and some extra notes; then the board plays, with Bed on.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await soundTab(page);
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Full' }).click();
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Some' }).click();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await pieceStep(page, 'Loops');
  await page.getByRole('listitem', { name: /^Loop 1: Bed/ }).getByRole('button', { name: '▶ Play' }).click();
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  await sceneMore(page);
  await expect(page.getByText('While the board plays, Update from now')).toHaveCount(0);
  await page.getByRole('button', { name: 'Update from now' }).click();
  const line = page.getByRole('status').filter({ hasText: 'Open now has what is playing: Bed · full band.' }).filter({ has: page.getByRole('button', { name: 'Undo' }) });
  await expect(line).toBeVisible();
  // The scene's line: its loops and Energy; the rest in More's line (A1).
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toContainText(/^3:30 · Open.*Bed · Energy: /);
  await expect(await sceneMoreLine(page)).toContainText(/full band · pads, bass, drums · some extra notes/);
  await expect.poll(async () => (await savedScene(page, 'Open'))?.loops).toEqual([0]);
  const sound = await savedSoundNow(page);
  expect(sound.band).toBe('full');
  expect(sound.fillAmount).toBe(0.5);
  expect((await savedScene(page, 'Open'))?.settings).toEqual(sound);
  // Undo: the scene exactly as it was.
  await line.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => savedScene(page, 'Open')).toEqual(before);
  expect(pageErrors(page)).toEqual([]);
});

test('ticking "Test alone" on a scene with loops says what was taken out, and Undo puts them back and unticks it (R2-T2-03)', async ({ page }) => {
  await openLaptopBoard(page);
  await saveTwoLoops(page);
  await step(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
  const open = page.getByRole('button', { name: /^3:30 · Open/ });
  await expect(open).toContainText('Bed, Loop 2');
  await open.click();
  const alone = page.getByRole('checkbox', { name: 'Test alone: no loops, only what Test plays' });
  await alone.check();
  await expect(open).toContainText('Test alone');
  const line = page.getByRole('status').filter({ hasText: 'Open is now Test alone: Bed and Loop 2 taken out.' }).filter({ has: page.getByRole('button', { name: 'Undo' }) });
  await expect(line).toBeVisible();
  await line.getByRole('button', { name: 'Undo' }).click();
  await expect(open).toContainText('Bed, Loop 2');
  await expect(alone).not.toBeChecked();
  expect(pageErrors(page)).toEqual([]);
});

test('New loop on a stopped board starts it, as ▶ Play does: a fresh player\'s counters are heard within 2 s of the sound being ready (R2-T1-01)', async ({ page }) => {
  await listenToOutput(page);
  await openLaptopBoard(page);
  await pieceStep(page, 'Loops');
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'New loop', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^New loop 1/ })).toBeVisible();
  // Plain play: the board plays, with no clock and no scene.
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByText(/Press ▶ Play/)).toHaveCount(0);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [3, 5], [5, 7]]);
  // Two seconds, measured in the page from the last counter.
  const levels = await outputLevels(page, 8, 250);
  expect(levels.length).toBe(8);
  expect(Math.max(...levels)).toBeGreaterThan(0.01);
  await expect.poll(() => notesPlayed(page), { timeout: 5_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('decision F2\'s path: after Stop ×2, New loop starts the board and the counters are heard; stopped inside New loop it says how to hear them, with ▶ Play there (R2-T1-01)', async ({ page }) => {
  await listenToOutput(page);
  await openLaptopBoard(page);
  await startPiece(page);
  await pieceClockRunning(page);
  await pieceStep(page, 'Loops');
  const newLoop = page.getByRole('button', { name: 'New loop', exact: true });
  await expect(newLoop).toBeDisabled();
  await expect(page.getByText('Stop the piece to make a loop')).toBeVisible();
  await pause(page, 2100); // ■ Stop ignores presses for the piece's first 2 s (B3)
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  await newLoop.click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  const stopped = 'Stopped. Press ▶ Play the board to hear the counters.';
  await expect(page.getByText(stopped)).toHaveCount(0);
  await pickColour(page, 'Blue');
  await place(page, [[1, 1], [1, 5]]);
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.01);
  await expect(page.getByText(stopped)).toHaveCount(0);
  // Stopped inside New loop: the panel and the line under the board say how to hear the counters.
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  const panel = page.getByRole('region', { name: /^New loop 1/ });
  await expect(panel.getByText(stopped)).toBeVisible();
  await expect(page.getByText(`Making a new loop. ${stopped} Keep it or leave in Make a piece, 1 · Loops.`)).toBeVisible();
  await expect(page.getByText(/only the counters sound/i)).toHaveCount(0);
  // Keep still keeps the counters on the board.
  await expect(panel.getByRole('button', { name: 'Keep', exact: true })).toBeEnabled();
  // ▶ Play in the panel: the counters are heard again.
  await pause(page, 600); // ▶ Play ignores a press straight after Stop (a bounce): this is a new press
  await panel.getByRole('button', { name: '▶ Play the board' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(stopped)).toHaveCount(0);
  await expect.poll(async () => Math.max(0, ...await outputLevels(page, 4)), { timeout: 20_000 }).toBeGreaterThan(0.01);
  expect(pageErrors(page)).toEqual([]);
});

/** This take's notes, from the session log saved as JSON: each with its colour and when it was heard (s). */
async function sessionNotes(page: Page): Promise<{ t: number; colour: string }[]> {
  await sessionLog(page); // folded under the board (A15)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Save session/ }).click(),
  ]);
  const data = JSON.parse(readFileSync(await download.path(), 'utf-8')) as { notes: { t: number; colour: string }[] };
  return data.notes;
}

test('a colour that comes in at 0:05: on the board but silent in the piece until then, said when it comes in, then heard; with ▶ Play it plays at once', async ({ page }) => {
  await openLaptopBoard(page);
  await ownSoundIsPlain(page);
  // Every counter is down before the piece: Red (melody) and Blue (bass).
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await pickColour(page, 'Blue');
  await place(page, [[1, 1], [2, 5]]);
  await pieceStep(page, 'Scenes');
  const card = page.getByRole('group', { name: 'When each colour comes in' });
  await expect(card).toContainText('The times count only while the piece plays');
  const red = card.getByRole('textbox', { name: /^When Red comes in, in the piece/ });
  await red.fill('0:05');
  await red.blur();
  await expect(red).toHaveValue('0:05');
  await pause(page, 1200); // saves are gathered for a moment
  const redId = await page.evaluate(() => {
    const id = localStorage.getItem('admi-board-active-player');
    const players = JSON.parse(localStorage.getItem('admi-board-players') ?? '[]') as { id: string; settings: Record<string, unknown> }[];
    const s = (players.find((p) => p.id === id) ?? players[0])?.settings ?? {};
    return Object.keys((s.colourComesInAt ?? {}) as Record<string, number>)[0] ?? '';
  });
  expect(redId).not.toBe('');

  await startPiece(page);
  await pieceClockRunning(page);
  const strip = page.getByRole('region', { name: 'Now and next' });
  await expect(strip).toContainText('Waiting: Red at 0:05');
  // On the board its counters are marked as waiting (and said so on the laptop board).
  await expect(page.getByRole('grid', { name: /Laptop board/ })
    .getByRole('button', { name: 'Row 3 from the bottom, step 1: Red, Melody, waiting: comes in at 0:05' })).toBeVisible();
  await expect(page.getByText('Red comes in', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(strip).not.toContainText('Waiting');
  await pause(page, 3000);
  const notes = await sessionNotes(page);
  const redNotes = notes.filter((n) => n.colour === redId);
  // The board played from the start (Blue), and Red not a note before 0:05, then it did.
  expect(notes.some((n) => n.colour !== redId && n.t < 4.5)).toBe(true);
  expect(redNotes.length).toBeGreaterThan(0);
  expect(Math.min(...redNotes.map((n) => n.t))).toBeGreaterThanOrEqual(4.9);

  // Stopped, then plain ▶ Play: no piece clock, so Red plays from the start.
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  await pause(page, 600); // ▶ Play ignores a press straight after Stop (a bounce): this is a new press
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await expect(strip).toHaveCount(0);
  await expect.poll(async () => (await sessionNotes(page)).some((n) => n.colour === redId && n.t < 3), { timeout: 20_000 }).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test('a scene at 0:05 that reaches its faster speed over 4 s: the speed read during the glide lies between the two, rising', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  // The plan's scenes are all at the player's own speed, 90. Build: at 0:05, 150, over 4 s.
  await makePlan(page);
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  await sceneMore(page);
  const time = page.getByRole('textbox', { name: /When Build comes in/ });
  await time.fill('0:05');
  await time.blur();
  await page.getByRole('slider', { name: /^Speed/ }).fill('150');
  await page.getByRole('radiogroup', { name: 'Reach this speed' }).getByRole('radio', { name: 'Gradually' }).click();
  await page.getByRole('slider', { name: /^Over/ }).fill('4');
  await expect(await sceneMoreLine(page)).toContainText('150 BPM, reached over 4 s');

  await startPiece(page);
  await pieceClockRunning(page);
  // The speed as shown, read in the page every 100 ms from about 0:01 to past 0:11.
  const log = await page.evaluate(async () => {
    const out: { bpm: number; rising: boolean }[] = [];
    const end = performance.now() + 11_000;
    while (performance.now() < end) {
      const pill = [...document.querySelectorAll('span[aria-hidden="true"]')]
        .map((el) => /· (\d+) BPM · step/.exec(el.textContent ?? '')).find((m) => m !== null);
      if (pill) out.push({ bpm: Number(pill[1]), rising: /speeding up to 150 BPM/.test(pill.input) });
      await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  });
  expect(log.some((x) => x.bpm === 90)).toBe(true);
  const between = log.filter((x) => x.bpm > 90 && x.bpm < 150);
  expect(between.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < between.length; i++) expect(between[i].bpm).toBeGreaterThanOrEqual(between[i - 1].bpm);
  expect(between[between.length - 1].bpm).toBeGreaterThan(between[0].bpm);
  // Shown as it goes, and at the scene's speed in the end.
  expect(log.some((x) => x.rising)).toBe(true);
  expect(log[log.length - 1].bpm).toBe(150);
  expect(pageErrors(page)).toEqual([]);
});

// ---- Keeping time, and Simplify (spec 2026-10-28) ----

interface LogFile {
  notes: { t: number; origin: string; role: string; source: string }[];
  events: { t: number; kind: string; action?: string }[];
}

/** The whole session log, saved as JSON: notes (with who made them) and events. */
async function sessionLogFile(page: Page): Promise<LogFile> {
  await sessionLog(page); // folded under the board (A15)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Save session/ }).click(),
  ]);
  return JSON.parse(readFileSync(await download.path(), 'utf-8')) as LogFile;
}

/** Sound tab: some Extra notes from the simple rules (Magenta is never loaded in the tests). */
async function extrasFromTheRules(page: Page): Promise<void> {
  await soundTab(page);
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Some', exact: true }).click();
  await page.getByRole('button', { name: /^Advanced: key, scale/ }).click();
  await page.getByRole('radiogroup', { name: 'Extra notes come from' }).getByRole('radio', { name: 'Simple rules' }).click();
}

const keepingTime = (page: Page) => page.getByRole('status', { name: 'Keeping time' });

test('keeping time: a normal run shows nothing while it plays, and the Ready check then says "Keeping time: fine"', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5]]);
  await pieceStep(page, 'Ending & check');
  await expect(page.getByText('Keeping time: not measured yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Keeping time: fine so far', { exact: true })).toBeVisible();
  await pause(page, 8000);
  await expect(keepingTime(page)).toHaveCount(0);
  await expect(page.getByText('Keeping time: fine so far', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  await expect(page.getByText(/^Keeping time: fine in the last run \(0:\d\d\)$/)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('keeping time: a page that stalls mid-piece reports late beats, and the valve pauses Extra notes, said on the laptop', async ({ page }) => {
  await openLaptopBoard(page);
  await extrasFromTheRules(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await startPiece(page);
  await pieceClockRunning(page);
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await pause(page, 6000);
  await expect(keepingTime(page)).toHaveCount(0);
  // The page is too busy to send beats for 2.5 s.
  await page.evaluate(() => { const end = performance.now() + 2500; while (performance.now() < end) { /* busy */ } });
  await expect(keepingTime(page)).toContainText('The sound is falling behind.');
  await expect(keepingTime(page)).toContainText('Paused to keep the sound in time: Extra notes.');
  await expect(keepingTime(page).getByRole('button', { name: 'Switch the extras back on' })).toBeVisible();
  await pause(page, 4000);
  const log = await sessionLogFile(page);
  const paused = log.events.find((e) => e.kind === 'action' && e.action === 'Extra notes paused to keep the sound in time.');
  expect(paused).toBeDefined();
  // Extra notes played before, and not after the valve paused them.
  expect(log.notes.some((n) => n.origin === 'fill' && n.t < paused!.t - 1)).toBe(true);
  expect(log.notes.filter((n) => n.origin === 'fill' && n.t > paused!.t + 1)).toEqual([]);
  // The player's own notes carry on.
  expect(log.notes.some((n) => n.origin !== 'fill' && n.origin !== 'band' && n.t > paused!.t + 1)).toBe(true);
  await page.getByRole('button', { name: '■ Stop', exact: true }).first().click();
  await page.getByRole('button', { name: '■ Press again to stop' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  await pieceStep(page, 'Ending & check');
  await expect(page.getByText(/^Keeping time: the sound fell \d+\.\d s behind in the last run \(\d+ beats? late/)).toBeVisible();
  await expect(page.getByText(/To keep up, ADMI paused Extra notes\.$/)).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Simplify, by mouse and by Shift+S: the band, Extra notes and the second loop go silent, the bed and the player play on; Back to full brings them back', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  await extrasFromTheRules(page);
  await page.getByRole('group', { name: 'Band' }).getByRole('radio', { name: 'Quiet' }).click();
  // Two loops: the Bed (yellow, chords) and another (blue, bass); both play.
  await saveTwoLoops(page);
  await page.getByRole('listitem', { name: /^Loop 1:/ }).getByRole('button', { name: '▶ Play' }).click();
  await page.getByRole('listitem', { name: /^Loop 2:/ }).getByRole('button', { name: '▶ Play' }).click();
  // The player's own counters (red, melody).
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await expect(page.getByRole('button', { name: /^Simplify/ })).toHaveCount(0); // only while playing
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Playing' }).first()).toBeVisible({ timeout: 20_000 });
  await pause(page, 8000); // the band joins on the pass after the first counter

  const banner = page.getByRole('status', { name: 'Simplify' });
  // By mouse.
  await page.getByRole('button', { name: /^Simplify/ }).click();
  await expect(banner).toHaveText('Simplified: Test and Bed');
  await expect(page.getByRole('button', { name: /^Back to full/ })).toHaveAttribute('aria-pressed', 'true');
  await pause(page, 6000);
  await page.getByRole('button', { name: /^Back to full/ }).click();
  await expect(banner).toHaveText('Back to full from the next pass');
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  await pause(page, 7000);
  // By keyboard, in Show.
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.keyboard.press('Shift+S');
  await expect(banner).toHaveText('Simplified: Test and Bed');
  await pause(page, 6000);
  await page.keyboard.press('Shift+S');
  await expect(banner).toHaveText('Back to full from the next pass');
  await page.getByRole('button', { name: 'Leave Show' }).click();
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  await pause(page, 2000);

  const log = await sessionLogFile(page);
  const at = (action: string): number[] => log.events.filter((e) => e.kind === 'action' && e.action === action).map((e) => e.t);
  const [s1, s2] = at('simplify');
  const [b1, b2] = at('back to full');
  expect([s1, b1, s2, b2].every((t) => typeof t === 'number')).toBe(true);
  const between = (from: number, to: number) => log.notes.filter((n) => n.t > from && n.t < to);
  const extras = (ns: LogFile['notes']) => ns.filter((n) => n.origin === 'band' || n.origin === 'fill');
  const loop = (ns: LogFile['notes'], role: string) => ns.filter((n) => n.source === 'loop' && n.role === role);
  const player = (ns: LogFile['notes']) => ns.filter((n) => n.source === 'live' && n.origin !== 'band' && n.origin !== 'fill');
  // Full before: the band, Extra notes, both loops and the player.
  expect(log.notes.some((n) => n.origin === 'band' && n.t < s1)).toBe(true);
  expect(log.notes.some((n) => n.origin === 'fill' && n.t < s1)).toBe(true);
  expect(loop(between(0, s1), 'bass').length).toBeGreaterThan(0);
  // Simplified (mouse, then keyboard): only the bed and the player.
  for (const [from, to] of [[s1, b1], [s2, b2]]) {
    const ns = between(from + 0.5, to);
    expect(extras(ns)).toEqual([]);
    expect(loop(ns, 'bass')).toEqual([]);
    expect(loop(ns, 'chord').length).toBeGreaterThan(0);
    expect(player(ns).length).toBeGreaterThan(0);
  }
  // Back to full: from the next pass, everything is back.
  const full = between(b1 + 6, s2);
  expect(loop(full, 'bass').length).toBeGreaterThan(0);
  expect(full.some((n) => n.origin === 'band')).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

// ---- One shared harmony (spec 2026-10-28-harmony-and-band, stage 1) ----

test('one shared harmony: the band follows each scene’s chords, Tim’s chord counter changes one chord, and the next scene’s chords land on the pass', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  // Red melody at steps 1 and 5; Tim's Yellow chord counter at step 7, two rows up: D,
  // so D minor for the last two beats of each pass. Three counters: the band's bass plays.
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 5]]);
  await pickColour(page, 'Yellow');
  await place(page, [[2, 7]]);
  await makePlan(page);
  // Arrival: Rising, a bar each (C G7 Am F), the band Full.
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();
  await sceneMore(page);
  await page.getByRole('radiogroup', { name: 'Chords' }).getByRole('radio', { name: 'Rising', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Each chord lasts' }).getByRole('radio', { name: '1 bar', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Band' }).getByRole('radio', { name: 'Full', exact: true }).click();
  // Make my plan gives Arrival the band's pads only (stage 2): its bass too, for this test.
  await page.getByRole('group', { name: 'Band parts' }).getByRole('switch', { name: 'Bass', exact: true }).click();
  await expect(await sceneMoreLine(page)).toContainText('Rising chords, 1 bar each');
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();
  // Build at 0:12, in the middle of a pass (8 steps at 90 BPM is 5.3 s): Still, the band Full.
  await page.getByRole('button', { name: /^1:30 · Build/ }).click();
  await sceneMore(page);
  const time = page.getByRole('textbox', { name: /When Build comes in/ });
  await time.fill('0:12');
  await time.blur();
  await page.getByRole('radiogroup', { name: 'Chords' }).getByRole('radio', { name: 'Still', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Band' }).getByRole('radio', { name: 'Full', exact: true }).click();
  await expect(await sceneMoreLine(page)).toContainText('Still chords');

  await startPiece(page);
  await pieceClockRunning(page);
  await pause(page, 24_000);
  const log = await sessionLogFile(page) as unknown as {
    notes: { t: number; colour: string; origin: string; midi?: number }[];
    events: { t: number; kind: string; action?: string }[];
  };
  // The band's bass, on the beat: it lands on each chord's root as the chord changes.
  const spb = 60 / 90;
  const bass = log.notes.filter((n) => n.colour === 'band:bass' && n.midi !== undefined);
  expect(bass.length).toBeGreaterThan(10);
  // The band comes in on the second pass (beat 8), on the first beat of it.
  const t8 = Math.min(...bass.map((n) => n.t));
  const beatOf = (t: number): number => 8 + Math.round((t - t8) / spb);
  const rootAt = new Map<number, number>();
  for (const n of bass) {
    const b = beatOf(n.t);
    // On the beat (a stalled page can send one a little late); the walk's off-beat notes
    // are half a beat (0.33 s) away.
    if (Math.abs(n.t - (t8 + (b - 8) * spb)) < 0.15 && !rootAt.has(b)) rootAt.set(b, n.midi! % 12);
  }
  // Build came in by the clock, mid-pass; its chords wait for the next pass.
  const sceneAt = log.events.find((e) => e.kind === 'action' && e.action === 'scene Build')!.t;
  const arrived = beatOf(sceneAt);
  const pass = Math.ceil(arrived / 8) * 8;
  expect(pass - arrived).toBeGreaterThanOrEqual(2);
  const rising = [0, 7, 9, 5]; // C G A F, a bar each, from the start of the piece
  for (let bar = 8; bar < pass; bar += 4) expect(rootAt.get(bar), `bar at beat ${bar}`).toBe(rising[(bar / 4) % 4]);
  // Tim's D minor: only the last two beats of each pass, then the sequence again.
  for (let p = 8; p < pass; p += 8) {
    expect(rootAt.get(p + 6), `Tim's chord at beat ${p + 6}`).toBe(2);
    expect(rootAt.get(p + 8)).not.toBe(2);
  }
  // From the pass on: Still, a drone on C and G (the bass lands on C, then walks to G);
  // Rising would have been A and F here. Tim's chord still changes its own two beats.
  expect(rootAt.get(pass), `bar at beat ${pass}`).toBe(0);
  // (Its walking notes, where read on the beat: on a busy machine one can come out late.)
  const walk = [pass + 2, pass + 4, pass + 8].filter((b) => rootAt.has(b));
  expect(walk.length).toBeGreaterThanOrEqual(2);
  for (const b of walk) expect([0, 7], `beat ${b}`).toContain(rootAt.get(b));
  expect(rootAt.get(pass + 6)).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

// ---- A band with jobs (spec 2026-10-28-harmony-and-band, stage 2) ----

test('a band with jobs: at Full with Tim on bass, chords and drums, the band’s pads, drums and counter-melody play around him; its bass steps aside while his plays, and comes back when he lifts it', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  // Tim: Blue bass at step 1, Yellow chord at step 3, Green kicks at steps 5 and 7.
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await pickColour(page, 'Yellow');
  await place(page, [[4, 3]]);
  await pickColour(page, 'Green');
  await place(page, [[1, 5], [1, 7]]);
  await makePlan(page);
  // Arrival (the plan gives it pads only): the band Full, with all four parts.
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();
  await sceneMore(page);
  await page.getByRole('radiogroup', { name: 'Band' }).getByRole('radio', { name: 'Full', exact: true }).click();
  const parts = page.getByRole('group', { name: 'Band parts' });
  await expect(parts.getByRole('radio', { name: 'Choose parts', exact: true })).toHaveAttribute('aria-checked', 'true');
  for (const job of ['Bass', 'Drums', 'Counter-melody']) {
    const sw = parts.getByRole('switch', { name: job, exact: true });
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
  }
  await expect(await sceneMoreLine(page)).toContainText('full band · pads, bass, drums, counter-melody');
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();

  await startPiece(page);
  await pieceClockRunning(page);
  await pause(page, 14_000);
  // Tim lifts his bass.
  await pickColour(page, 'Blue');
  await place(page, [[1, 1]]);
  await pause(page, 12_000);
  const log = await sessionLogFile(page) as unknown as {
    notes: { t: number; colour: string; origin: string; role: string; source: string }[];
  };
  const band = (part: string) => log.notes.filter((n) => n.colour === `band:${part}`);
  const tim = (role: string) => log.notes.filter((n) => n.role === role && n.origin !== 'band' && n.origin !== 'fill');
  const lastTimBass = Math.max(...tim('bass').map((n) => n.t));
  // While his bass was down: the band's pads, drums and counter-melody, and no bass of its own.
  for (const part of ['pad', 'groove', 'counter']) {
    expect(band(part).filter((n) => n.t < lastTimBass).length, part).toBeGreaterThan(0);
  }
  expect(band('bass').filter((n) => n.t <= lastTimBass)).toEqual([]);
  // Once he lifted it, the band's bass came back.
  expect(band('bass').filter((n) => n.t > lastTimBass).length).toBeGreaterThan(0);
  // The band's drums only on beats his drums leave empty.
  const spb = 60 / 90;
  const drums = tim('drums');
  // The grid from his last drum: the first beats of a piece can be sent a little late.
  const t0 = Math.max(...drums.map((n) => n.t));
  const beatOf = (t: number): number => Math.floor((t - t0) / spb + 0.02);
  const his = new Set(drums.map((n) => beatOf(n.t)));
  expect(band('groove').length).toBeGreaterThan(0);
  for (const n of band('groove')) expect(his.has(beatOf(n.t)), `band drum at ${n.t.toFixed(2)} s`).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test('a scene’s band parts and lead-in are kept after a reload', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  await sceneMore(page);
  const parts = page.getByRole('group', { name: 'Band parts' });
  // Make my plan: Open has all four.
  for (const job of ['Pads', 'Bass', 'Drums', 'Counter-melody']) {
    await expect(parts.getByRole('switch', { name: job, exact: true })).toHaveAttribute('aria-checked', 'true');
  }
  await parts.getByRole('switch', { name: 'Drums', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Lead-in' }).getByRole('radio', { name: 'Drum fill', exact: true }).click();
  const open = await sceneMoreLine(page);
  await expect(open).toContainText('pads, bass, counter-melody');
  await expect(open).toContainText('drum fill before it');
  await page.evaluate(() => new Promise((r) => { window.setTimeout(r, 1200); })); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(page, 'Scenes');
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  const again = await sceneMoreLine(page);
  await expect(again).toContainText('pads, bass, counter-melody');
  await expect(again).toContainText('drum fill before it');
  expect(pageErrors(page)).toEqual([]);
});

// ---- Harmony spec stage 3: the same AI each rehearsal, and Energy ----

/** One take of the piece from its start, about `sec` seconds, then stopped: its notes, as heard. */
async function takeOfThePiece(page: Page, sec: number): Promise<LogFile['notes']> {
  await startPiece(page);
  await pieceClockRunning(page);
  await expect.poll(() => notesPlayed(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await pause(page, sec * 1000);
  // Stop, pressed twice inside the page: the runner can lag past the second press's window.
  await page.evaluate(async () => {
    const press = (text: string): void => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)?.click();
    press('■ Stop');
    await new Promise((r) => setTimeout(r, 150));
    press('■ Press again to stop');
  });
  await expect(page.getByRole('status').filter({ hasText: 'Stopped' }).first()).toBeVisible();
  const notes = (await sessionLogFile(page)).notes;
  await pause(page, 600); // a start straight after Stop is taken for a bounce: this is a new press
  return notes;
}

type LoggedNote = LogFile['notes'][number] & { midi?: number; midis?: number[]; drum?: string; velocity?: number; colour?: string };

/**
 * A take's notes as music, not clock times: who made each, what it was, and (for the
 * player's own) how hard, with when it came after the take's first note. Late beats on a
 * busy machine move notes in time, never change them, so takes are compared by what
 * played, not to the millisecond.
 */
function asMusic(notes: LoggedNote[]): { t: number; what: string }[] {
  const t0 = Math.min(...notes.map((n) => n.t));
  return notes.map((n) => {
    const own = n.origin === 'placed' || n.origin === 'phrase';
    return { t: n.t - t0, what: `${n.origin}|${n.colour ?? ''}|${n.midi ?? n.midis?.join('+') ?? n.drum ?? ''}${own ? `|${(n.velocity ?? 0).toFixed(2)}` : ''}` };
  });
}

/**
 * What one take played in its first `sec` seconds that the other did not play in a little
 * longer (so a note on the edge of the window, a little late in one take, is not counted).
 */
function notIn(a: { t: number; what: string }[], b: { t: number; what: string }[], sec: number): string[] {
  const left = new Map<string, number>();
  for (const n of b) if (n.t < sec + 0.4) left.set(n.what, (left.get(n.what) ?? 0) + 1);
  const out: string[] = [];
  for (const n of a) {
    if (n.t >= sec) continue;
    const k = left.get(n.what) ?? 0;
    if (k > 0) left.set(n.what, k - 1);
    else out.push(`${n.t.toFixed(2)} s ${n.what}`);
  }
  return out;
}

test('the same ideas each rehearsal: a second run of the piece plays the notes of the first, and New ideas changes them', async ({ page }) => {
  test.setTimeout(240_000);
  await openLaptopBoard(page);
  await extrasFromTheRules(page);
  // On a busy machine the safety valve may pause the extras in one take and not the other:
  // that is a different take for a reason of its own, so it is off here.
  await page.getByRole('checkbox', { name: 'Pause the extras when the sound falls behind' }).uncheck();
  // A loose groove: before seeds, its rests and loudness were new every run.
  await page.getByRole('radiogroup', { name: 'Groove' }).getByRole('radio', { name: 'Lazy' }).click();
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await pickColour(page, 'Green');
  await place(page, [[1, 1], [2, 3], [1, 5], [3, 7]]);
  // The plan's opening, with extra notes and its sounds changing (the plan has neither there).
  await makePlan(page);
  await page.getByRole('button', { name: /^0:00 · Arrival/ }).click();
  await sceneMore(page);
  await page.getByRole('radiogroup', { name: 'Extra notes' }).getByRole('radio', { name: 'Lots', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Sounds change' }).getByRole('radio', { name: 'More', exact: true }).click();
  await pause(page, 1200); // saves are gathered for a moment

  const first = await takeOfThePiece(page, 9);
  const second = await takeOfThePiece(page, 9);
  // It plays the band and the extra notes, and the loose groove rests some of Green's notes.
  expect(first.some((n) => n.origin === 'band')).toBe(true);
  expect(first.some((n) => n.origin === 'fill')).toBe(true);
  const a = asMusic(first);
  const b = asMusic(second);
  expect(a.filter((n) => n.t < 7).length).toBeGreaterThan(20);
  // Every note of the first take in the second, and every note of the second in the first.
  expect(notIn(a, b, 7)).toEqual([]);
  expect(notIn(b, a, 7)).toEqual([]);

  // New ideas for the whole piece: the same board plays differently.
  await page.getByRole('button', { name: '↻ New ideas for the whole piece' }).click();
  await pause(page, 1200);
  const third = asMusic(await takeOfThePiece(page, 9));
  expect(notIn(third, a, 7).length + notIn(a, third, 7).length).toBeGreaterThan(5);
  // ... the instrument's own ideas: the player's counters still play.
  expect(third.some((n) => n.what.startsWith('placed|'))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test('Energy: the plan draws 2, 3, 5, 2; a scene’s Energy, the graph and Surprise me are kept after a reload', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  const graph = page.getByRole('img', { name: /^Energy across the piece/ });
  // The Sound tab's names, and Big for 5 (A2).
  await expect(graph).toHaveAttribute('aria-label', 'Energy across the piece: Arrival Steady, Build Lively, Open Big, Home Steady');
  await page.getByRole('button', { name: /^3:30 · Open/ }).click();
  const energy = page.getByRole('radiogroup', { name: 'Energy of this scene' });
  await expect(energy.getByRole('radio', { name: 'Big', exact: true })).toHaveAttribute('aria-checked', 'true');
  await energy.getByRole('radio', { name: 'Driving', exact: true }).click();
  await expect(page.getByText('Driving: a little louder and brighter, the band busier, more extra notes.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^3:30 · Open/ })).toContainText('Energy: Driving');
  await page.getByRole('switch', { name: /^Surprise me each time/ }).click();
  await pause(page, 1200); // saves are gathered for a moment
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await pieceStep(page, 'Scenes');
  await expect(graph).toHaveAttribute('aria-label', 'Energy across the piece: Arrival Steady, Build Lively, Open Driving, Home Steady');
  await expect(page.getByRole('switch', { name: /^Surprise me each time/ })).toHaveAttribute('aria-checked', 'true');
  expect(pageErrors(page)).toEqual([]);
});
