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
 * The Sound tab, with every helper open: each folds to one line (A1) and stays as it was
 * left for the session, so this opens the ones still folded.
 */
export async function soundTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Sound' }).click();
  const folded = page.locator('button[data-helper-fold][aria-expanded="false"]');
  while (await folded.count() > 0) await folded.first().click();
}

/** The open scene's "More for this scene" (A1), opened if folded. Remembered for the session. */
export async function sceneMore(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: /More for this scene/ });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
}

/**
 * What the open scene's More says folded: one line with all it holds (A1). Folds it first,
 * so the line shows; sceneMore opens it again.
 */
export async function sceneMoreLine(page: Page): Promise<Locator> {
  const more = page.getByRole('button', { name: /More for this scene/ });
  if ((await more.getAttribute('aria-expanded')) === 'true') await more.click();
  return more;
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

/** Open Make a piece at a step: 'Loops', 'Scenes' or 'Ending & check'. */
export async function pieceStep(page: Page, step: 'Loops' | 'Scenes' | 'Ending & check'): Promise<void> {
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: new RegExp(step.replace('&', '&')) }).click();
}

/** Make a piece → Scenes → Make my plan (four scenes over the length). */
export async function makePlan(page: Page): Promise<void> {
  await pieceStep(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
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
 * The old way to make a loop: Make a piece → Loops → "Other ways to make a loop" (folded,
 * B17) → Keep the board as this loop (A2), on the first empty loop. The fold stays open once opened.
 */
export async function saveBoardHere(page: Page): Promise<void> {
  const fold = page.getByRole('button', { name: /Other ways to make a loop/ });
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click();
  // On an empty loop: a kept loop's button of the same name replaces it (after a second press).
  await page.getByRole('listitem', { name: /, empty$/ }).first().getByRole('button', { name: 'Keep the board as this loop' }).click();
}
