import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * Open the Board Sequencer on the laptop board with four ready-made colours, cut off
 * from the server's copy of saved work so every test starts from nothing.
 */
export async function openLaptopBoard(page: Page): Promise<void> {
  await openEmptyLaptopBoard(page);
  await page.getByRole('button', { name: 'Add four colours' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Counter to put down' })).toBeVisible();
}

/** The laptop board with no colours yet: only "Add four colours" above it. */
export async function openEmptyLaptopBoard(page: Page): Promise<void> {
  await cutOff(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  // The first run asks who is playing and which hand they use.
  await page.getByRole('region', { name: "Who's playing?" }).getByRole('textbox', { name: 'Name' }).fill('Test');
  await page.getByRole('button', { name: 'Create' }).click();
  await (await headerButton(page, /Laptop board: play on the laptop/)).click();
}

/**
 * A button of the header's More (U4: the audience screen, Set up and Camera / Laptop live
 * there at every width on the Board view). Set up shows Camera / Laptop in its own header,
 * so a button already in sight is used as it is; otherwise More is opened first.
 */
export async function headerButton(page: Page, name: string | RegExp): Promise<Locator> {
  const direct = page.getByRole('button', { name, exact: typeof name === 'string' }).first();
  if (await direct.isVisible()) return direct;
  const more = page.locator('header').getByRole('button', { name: /^More [▾▴]$/ });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  return page.getByRole('group', { name: 'More', exact: true }).getByRole('button', { name, exact: typeof name === 'string' });
}

/** A new player's set-up on the laptop, from Welcome → Play on the laptop: step 1, the colours. */
export async function openLaptopSetup(page: Page): Promise<void> {
  await cutOff(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Play on the laptop/ }).click();
  await page.getByRole('region', { name: "Who's playing?" }).getByRole('textbox', { name: 'Name' }).fill('Test');
  await page.getByRole('button', { name: 'Create' }).click();
  // A new player from Play on the laptop lands on the board with four colours (item 1); Set up is under More.
  await expect(page.getByRole('radiogroup', { name: 'Counter to put down' })).toBeVisible();
  await (await headerButton(page, '⚙ Set up')).click();
  await expect(page.getByRole('heading', { name: 'Choose the colours' })).toBeVisible();
}

/** Welcome, as on a first run: nothing saved, cut off from the laptop's copy. */
export async function openWelcome(page: Page): Promise<void> {
  await cutOff(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Set up the board/ })).toBeVisible();
}

/** Record the page's errors, and cut it off from the laptop's copy and from the internet. */
async function cutOff(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { admiErrors?: string[] }).admiErrors = errors;
  // No copy on the laptop for tests: nothing restored from it, nothing written to it.
  await page.route('**/admi-store**', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 404, body: '' })
    : route.fulfill({ status: 204, body: '' })));
  // No Magenta models in the tests: they come from the internet, and without them Extra
  // notes uses its own rules. (They load in a worker now, so they no longer freeze the page.)
  await page.route('**/magentadata/**', (route) => route.abort());
}

/** ADMI opened in another tab of the same browser (the same saved data). */
export async function openAnotherTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await cutOff(page);
  await page.goto('/');
  return page;
}

/** Pick a colour above the laptop board ("Red", "Blue", "Yellow", "Green"). */
export async function pickColour(page: Page, colour: string): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { name: new RegExp(colour) }).click();
}

/**
 * A colour's counters play one note each (Sound tab, beside the colour): a new player's
 * melody, bass and chords colours start on a tune. `row` is its line in the colour table
 * ("Red: Melody").
 */
export async function oneNote(page: Page, row: RegExp): Promise<void> {
  await soundTab(page);
  await page.getByRole('row', { name: row }).getByRole('radiogroup', { name: 'Each counter plays' })
    .getByRole('radio', { name: 'One note' }).click();
}

/** Click squares on the laptop board: row counted from the bottom, step from the left (both from 1). */
export async function place(page: Page, squares: [row: number, step: number][]): Promise<void> {
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  for (const [row, step] of squares) {
    await grid.getByRole('button', { name: new RegExp(`^Row ${row} from the bottom, step ${step}(:|$)`) }).click();
  }
}

/**
 * The iPad's full layout (strips, pads, pages) instead of the Simple page a new player gets
 * (spec 2026-11-04), from the iPad settings on the Connections tab, already open.
 */
export async function useFullIpadLayout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Use the full layout instead' }).click();
  await expect(page.getByRole('button', { name: 'Use the simple layout' })).toBeVisible();
}

/**
 * The Sound tab, with every helper open: each folds to one line (A1) and stays as it was
 * left for the session, so this opens the ones still folded.
 */
export async function soundTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Sound' }).click();
  const folded = page.locator('button[data-helper-fold][aria-expanded="false"]');
  while (await folded.count() > 0) await folded.first().click();
}

/**
 * The selected scene's finer settings (world, chords, band, Extra notes, speed, lead-in, the
 * player alone, ideas, Update from now): the editor's "change ▾", opened if folded.
 * Remembered for the session.
 */
export async function sceneMore(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: /^change [▾▴]/ });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
}

/**
 * The editor's line of words for the finer settings, beside "change ▾": all they hold, in
 * one line (A1). Returns the line with its button; sceneMore opens them.
 */
export async function sceneMoreLine(page: Page): Promise<Locator> {
  return page.getByRole('button', { name: /^change [▾▴]/ }).locator('..');
}

/** The research tools under the board, folded under "Session log" (A15): opened if shut. */
export async function sessionLog(page: Page): Promise<void> {
  // Inside Details, under the board (U4).
  await boardDetails(page);
  const log = page.locator('details[data-session-log]');
  // Its own summary: Earlier takes, inside it, has one too.
  if ((await log.getAttribute('open')) === null) await log.locator(':scope > summary').click();
}

/** Details under the board (U4): the legend, the AI line, every colour's sound and count, and Session log. Opened if shut. */
export async function boardDetails(page: Page): Promise<void> {
  const details = page.locator('details[data-board-details]');
  if ((await details.getAttribute('open')) === null) await details.locator(':scope > summary').click();
}

/** How many notes the session log has counted (the "Save session (N notes)" button). */
export async function notesPlayed(page: Page): Promise<number> {
  await sessionLog(page);
  const text = await page.getByRole('button', { name: /Save session/ }).textContent();
  return Number(/\((\d+) notes?\)/.exec(text ?? '')?.[1] ?? 0);
}

export function pageErrors(page: Page): string[] {
  return (page as Page & { admiErrors?: string[] }).admiErrors ?? [];
}

/**
 * Open Make a piece (K2, 5 Nov 2026: no steps). 'Loops' and 'Scenes' are the board, the rail,
 * the storyboard under them and the selected scene's editor in the panel (from Check, its
 * ‹ Back to the scene); 'Ending & check' is Check, from the storyboard heading's Check ›.
 */
export async function pieceStep(page: Page, step: 'Loops' | 'Scenes' | 'Ending & check'): Promise<void> {
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  const piece = page.getByRole('region', { name: 'The piece', exact: true });
  await expect(piece).toBeVisible();
  if (step === 'Ending & check') {
    await piece.getByRole('button', { name: /^Check/ }).click();
    return;
  }
  const back = page.getByRole('button', { name: '‹ Back to the scene' });
  if (await back.isVisible()) await back.click();
}

/** Make a piece → ✦ Make my plan (four scenes over the length; it replaces any scenes, with Undo). */
export async function makePlan(page: Page): Promise<void> {
  await pieceStep(page, 'Scenes');
  await page.getByRole('button', { name: /^✦ Make my plan/ }).click();
  // With scenes already made it asks first (they are replaced, with Undo): say yes.
  const ask = page.getByRole('dialog', { name: 'Make my plan?' });
  if (await ask.waitFor({ timeout: 1500 }).then(() => true, () => false)) await ask.getByRole('button', { name: 'Make the plan' }).click();
}

/** The storyboard's card for a scene, by name: an option named "Scene N · m:ss <name> …". */
export function sceneCard(page: Page, name: string): Locator {
  return page.getByRole('listbox', { name: 'The piece: its scenes in order' }).getByRole('option', { name: new RegExp(`^Scene \\d+ · \\d+:\\d\\d ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `) });
}

/** Press a scene's card under the board: its editor opens in the panel. */
export async function selectScene(page: Page, name: string): Promise<void> {
  await sceneCard(page, name).click();
}

/**
 * ▶ Hear from here on a scene (K2, was Rehearse from here): its card, then the editor's
 * button. The piece starts two passes before the scene when a scene comes before it.
 */
export async function hearFrom(page: Page, name: string): Promise<void> {
  await selectScene(page, name);
  await page.getByRole('button', { name: new RegExp(`^Hear from here: ${name},`) }).click();
}

/** Keep as scene (K2): beside ▶ Play in Make a piece; what plays now becomes the next scene, after the last. */
export async function keepAsScene(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Keep as scene: keep what is playing/ }).click();
}


/**
 * Start the piece the way a performer does: Show → ▶ Start the piece, then back to the
 * normal view (the clock keeps running). ▶ Play the board on its own only plays the board.
 */
export async function startPiece(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await page.getByRole('button', { name: 'Leave Show' }).click();
}

/**
 * Listen to what the page sends to the speakers: an analyser on everything connected to
 * the audio output. Call before the page loads (it patches AudioNode.connect).
 */
export async function listenToOutput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = AudioNode.prototype.connect as (...a: unknown[]) => unknown;
    (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...args: unknown[]) {
      const dest = args[0];
      if (dest instanceof AudioDestinationNode && dest.context === this.context && this.context instanceof AudioContext) {
        const w = window as unknown as { __admiMeter?: AnalyserNode };
        if (!w.__admiMeter) { w.__admiMeter = this.context.createAnalyser(); w.__admiMeter.fftSize = 2048; }
        orig.call(this, w.__admiMeter);
      }
      return orig.apply(this, args);
    };
  });
}

/** The loudest level (RMS) heard in each of `bins` stretches of `binMs`, measured in the page. */
export async function outputLevels(page: Page, bins: number, binMs = 250): Promise<number[]> {
  return page.evaluate(async ({ bins, binMs }) => {
    const an = (window as unknown as { __admiMeter?: AnalyserNode }).__admiMeter;
    if (!an) return [];
    const buf = new Float32Array(an.fftSize);
    const out: number[] = [];
    for (let b = 0; b < bins; b++) {
      let peak = 0;
      const end = performance.now() + binMs;
      while (performance.now() < end) {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        peak = Math.max(peak, Math.sqrt(sum / buf.length));
        await new Promise((r) => setTimeout(r, 15));
      }
      out.push(peak);
    }
    return out;
  }, { bins, binMs });
}

/**
 * Press a button and listen to the speakers from that moment: the loudest single sample
 * (not an average, so a click can't hide) in each of `bins` stretches of `binMs`. Pressed
 * and measured inside the page, so the runner's lag stays out of the timing. Needs
 * listenToOutput; it hears only what goes to the speakers, never the reverb's tail being
 * worked out off-line (an OfflineAudioContext), which an earlier probe took for a click.
 */
export async function pressAndListen(page: Page, buttonText: string, bins = 40, binMs = 20): Promise<number[]> {
  return page.evaluate(async ({ buttonText, bins, binMs }) => {
    const an = (window as unknown as { __admiMeter?: AnalyserNode }).__admiMeter;
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === buttonText);
    if (!an || !button) return [];
    const buf = new Float32Array(an.fftSize);
    const out: number[] = [];
    button.click();
    const t0 = performance.now();
    for (let b = 0; b < bins; b++) {
      let peak = 0;
      do {
        an.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => setTimeout(r, 4));
      } while (performance.now() < t0 + (b + 1) * binMs);
      out.push(peak);
    }
    return out;
  }, { buttonText, bins, binMs });
}

/**
 * Keep as loop (K1, 5 Nov 2026), the one way to make a loop: on the Board, the side panel's
 * button beside ▶ Play; in Make a piece (where that place holds Keep as scene, K2), the
 * rail's dashed "+ Keep as loop" place, which does the same. The counters on the board become
 * the next free loop, that loop starts (stopped: it comes in on ▶ Play) and the laptop board
 * is cleared.
 */
export async function keepAsLoop(page: Page): Promise<void> {
  const panel = page.getByRole('button', { name: /^Keep as loop: keep the counters/ });
  if (await panel.count() > 0) await panel.click();
  else await page.locator('[data-loop-rail]').getByRole('button', { name: /^Keep as loop: keep the board as loop/ }).click();
}

/** A place in the loop rail: a kept loop, or the one dashed "+ Keep as loop" place. Slots count from 0. */
export function loopPlace(page: Page, slot: number): Locator {
  return page.locator(`[data-loop-rail] [data-loop-place="${slot}"]`);
}

/**
 * A kept loop's menu, opened by right-clicking its place in the rail: Rename, Replace with
 * the board, Edit notes, Clear and New loop. Returns the menu (a group named "<Name>: more").
 */
export async function loopMenu(page: Page, slot: number): Promise<Locator> {
  await loopPlace(page, slot).click({ button: 'right' });
  const menu = page.locator('[data-loop-rail]').getByRole('group', { name: /: more$/ });
  await expect(menu).toBeVisible();
  return menu;
}

/** Name a kept loop: its menu → Rename, type the name, Enter (which closes the menu). */
export async function renameLoop(page: Page, slot: number, name: string): Promise<void> {
  const menu = await loopMenu(page, slot);
  await menu.getByRole('button', { name: 'Rename', exact: true }).click();
  const box = page.getByRole('textbox', { name: `Name of loop ${slot + 1}` });
  await box.fill(name);
  await box.press('Enter');
  await expect(menu).toHaveCount(0);
}

/**
 * New loop from silence, from the rail's … more menu (it has no button of its own since K1).
 * … more is named for the kept loop last pressed ("More for Bed"), or "More: new loop from
 * silence" when there is none.
 */
export async function openNewLoop(page: Page): Promise<void> {
  const rail = page.locator('[data-loop-rail]');
  await rail.getByRole('button', { name: /^More( for |: new loop)/ }).click();
  await rail.getByRole('group', { name: /: more$/ }).getByRole('button', { name: 'New loop: from silence' }).click();
}

/**
 * Stop a kept loop that is on (Keep as loop starts it): a press on its place. While the
 * board is stopped this takes it out of what comes in on ▶ Play.
 */
export async function stopLoop(page: Page, slot: number): Promise<void> {
  await loopPlace(page, slot).click();
}
