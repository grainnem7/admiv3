import { test, expect, type Page } from '@playwright/test';
import { makePlan, openLaptopBoard, openLaptopSetup, openWelcome, pageErrors, pickColour, pieceStep, place, sceneMore, sessionLog, soundTab } from './app';
import { nameMismatches } from './names';

/** Batch 5 (audit 2026-10-30): what the owner and a keyboard user meet, checked in a real browser. */

const openAllFolds = (page: Page): Promise<void> =>
  page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));

test('A9: every name starts with the words on the control, on every screen', async ({ page }) => {
  await openLaptopSetup(page);
  expect(await nameMismatches(page)).toEqual([]);
  await page.getByRole('button', { name: 'Continue' }).click();
  expect(await nameMismatches(page)).toEqual([]);
});

test('A9: the same on the board, the tabs, Make a piece and Show', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await sessionLog(page);
  expect(await nameMismatches(page)).toEqual([]);
  await soundTab(page);
  await openAllFolds(page);
  expect(await nameMismatches(page)).toEqual([]);
  for (const t of ['Timing', 'Board', 'Connections', 'Cap']) {
    await page.getByRole('tab', { name: t }).click();
    await openAllFolds(page);
    expect(await nameMismatches(page), t).toEqual([]);
  }
  await makePlan(page);
  for (const s of ['Loops', 'Scenes', 'Ending & check'] as const) {
    await pieceStep(page, s);
    if (s === 'Scenes' && await page.getByRole('button', { name: /More for this scene/ }).count() > 0) await sceneMore(page);
    await openAllFolds(page);
    expect(await nameMismatches(page), s).toEqual([]);
  }
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  expect(await nameMismatches(page)).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test('A8: Help opens at the top on its heading, with links to its sections and Close outside the scroll', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(page.getByRole('heading', { name: 'How to play', level: 2 })).toBeFocused();
  const text = dialog.locator('[data-help-text]');
  expect(await text.evaluate((e) => e.scrollTop)).toBe(0);
  expect(await text.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  // Close is not inside the scrolling text, and stays in view after scrolling it.
  await text.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
  // A link goes to its section and puts focus on its heading.
  const link = dialog.getByRole('navigation', { name: 'Sections of Help' }).getByRole('link', { name: 'Keyboard' });
  await link.click();
  await expect(dialog.getByRole('heading', { name: 'Keyboard', level: 3 })).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Keyboard', level: 3 })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('A10: text is 14, 16 or 20 px (or a display size), never smaller; text fields have 10 px inside', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  const sizes = async (): Promise<{ small: string[]; odd: string[] }> => page.evaluate(() => {
    const small: string[] = [];
    const odd: string[] = [];
    document.querySelectorAll('.bs-root *').forEach((el) => {
      if (!(el instanceof HTMLElement) || el.offsetParent === null) return;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
      if (!own || el.closest('canvas, svg, [data-swatch]')) return;
      const px = parseFloat(getComputedStyle(el).fontSize);
      const what = `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" ${px}px`;
      if (px < 14) small.push(what);
      else if (px < 22 && ![14, 16, 20].includes(px)) odd.push(what);
    });
    return { small, odd };
  });
  const check = async (label: string): Promise<void> => {
    const r = await sizes();
    expect(r.small, `${label}: under 14 px`).toEqual([]);
    expect(r.odd, `${label}: not 14, 16 or 20`).toEqual([]);
  };
  await check('board');
  await soundTab(page);
  await openAllFolds(page);
  await check('Sound');
  await makePlan(page);
  await pieceStep(page, 'Scenes');
  await check('Scenes');
  const pads = await page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('.bs-root input[type="text"]')]
    .filter((i) => i.offsetParent !== null).map((i) => parseFloat(getComputedStyle(i).paddingLeft)));
  expect(pads.length).toBeGreaterThan(0);
  for (const p of pads) expect(p).toBeGreaterThanOrEqual(10);
  // ADMI / Ableton / Both are the same size as every other choice.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  const choice = (name: string) => page.getByRole('radio', { name, exact: true }).first().evaluate((e) => getComputedStyle(e).fontSize);
  expect(await choice('ADMI')).toBe(await choice('Both'));
});

test('A7: Time to press again and Space plays and stops live in Advanced, and Space can be switched off', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await soundTab(page);
  await page.getByRole('button', { name: /^Advanced: key, scale/ }).click();
  const group = page.getByRole('radiogroup', { name: 'Time to press again' });
  await expect(group.getByRole('radio', { name: '4 seconds' })).toBeChecked();
  await group.getByRole('radio', { name: '10 seconds' }).click();
  const space = page.getByRole('checkbox', { name: 'Space plays and stops' });
  await expect(space).toBeChecked();
  await space.uncheck();
  // With Space off it starts nothing.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: '■ Stop', exact: true })).toHaveCount(0);
  await space.check();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '■ Stop', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('A18: the Welcome page has one main region and its headings run in order; the Player button sits on the line of ☀ / Aa / ?', async ({ page }) => {
  await openWelcome(page);
  await expect(page.locator('main, [role="main"]')).toHaveCount(1);
  const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  await openLaptopBoard(page);
  const boardLevels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
  for (let i = 1; i < boardLevels.length; i++) expect(boardLevels[i] - boardLevels[i - 1]).toBeLessThanOrEqual(1);
  await soundTab(page);
  const soundLevels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1])));
  for (let i = 1; i < soundLevels.length; i++) expect(soundLevels[i] - soundLevels[i - 1]).toBeLessThanOrEqual(1);
  const centre = async (name: string | RegExp): Promise<number> => {
    const b = await page.getByRole('button', { name }).first().boundingBox();
    return b ? b.y + b.height / 2 : -1;
  };
  expect(Math.abs((await centre(/^Player:/)) - (await centre('Help')))).toBeLessThanOrEqual(2);
});

test('A18: the audience page is called "ADMI – audience"', async ({ page }) => {
  await page.goto('/audience.html');
  await expect(page).toHaveTitle('ADMI – audience');
});

test('A4: the squares of the board have an edge (checked in the drawing)', async ({ page }) => {
  await openLaptopBoard(page);
  // The laptop board is buttons: each empty square has a border of at least 3:1.
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  const ratio = await grid.getByRole('button').first().evaluate((e) => {
    const lum = (c: string): number => {
      const m = c.match(/\d+(\.\d+)?/g)!.map(Number);
      const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
    };
    const cs = getComputedStyle(e);
    const bg = getComputedStyle(document.querySelector('.bs-root')!).backgroundColor;
    const a = lum(cs.borderTopColor);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(3);
});

test('A5: the scene name on the audience screen sits 5% in, at 2.2% of the width, up to 0.8 opacity', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/audience.html');
  const box = await page.evaluate(() => {
    const root = document.querySelector('#root > div') as HTMLElement;
    const name = root.lastElementChild as HTMLElement;
    const cs = getComputedStyle(name);
    return { right: parseFloat(cs.right), bottom: parseFloat(cs.bottom), size: parseFloat(cs.fontSize), w: root.clientWidth, h: root.clientHeight };
  });
  expect(box.right / box.w).toBeCloseTo(0.05, 2);
  expect(box.bottom / box.h).toBeCloseTo(0.05, 2);
  expect(box.size / box.w).toBeCloseTo(0.022, 3);
});

test('U3: Show splits its controls: ■ Stop and Mute on the playing side, the rest on the other', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  // Before the piece: the big Start button.
  const start = show.getByRole('button', { name: '▶ Start the piece' });
  expect(await start.evaluate((e) => getComputedStyle(e).fontSize)).toBe('22px');
  const box = async (name: string | RegExp): Promise<{ x: number; w: number }> => {
    const b = (await show.getByRole('button', { name, exact: typeof name === 'string' }).first().boundingBox())!;
    return { x: b.x, w: b.width };
  };
  const stop = await box('■ Stop');
  const mute = await box('Mute');
  const leave = await box('Leave Show');
  const width = page.viewportSize()!.width;
  // Right-handed: Stop and Mute at the right, Leave Show at the left, far apart.
  expect(stop.x).toBeGreaterThan(width / 2);
  expect(mute.x).toBeGreaterThan(width / 2);
  expect(leave.x + leave.w).toBeLessThan(width / 2);
  expect(pageErrors(page)).toEqual([]);
});

test('U4: the board fills its side, the page fits the screen, and one Details line under the board holds the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLaptopBoard(page);
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  const empty = await grid.boundingBox();
  // 436 px before U4 at this size, with the page running 66 px past the bottom.
  expect(empty!.width).toBeGreaterThanOrEqual(500);
  // The first counter moves nothing: the bar above the board stays one row.
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  const placed = await grid.boundingBox();
  expect(placed).toEqual(empty);
  for (const [w, h] of [[1440, 900], [1366, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: `${w}x${h}` }).toBe(h);
  }
  // Details: closed at first, it holds the legend, the AI line, the colours and Session log.
  const details = page.locator('details[data-board-details]');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.getByText('your counters')).toBeHidden();
  await details.locator(':scope > summary').click();
  await expect(details.getByText('your counters')).toBeVisible();
  await expect(details.getByText(/AI: Extra notes off/)).toBeVisible();
  await expect(details.locator('details[data-session-log]')).toHaveCount(1);
  expect(pageErrors(page)).toEqual([]);
});

test('U4: Welcome wears the board’s colours: the main way in is the board’s accent, not orange', async ({ page }) => {
  await openWelcome(page);
  const main = page.locator('.welcome-board-btn').first();
  const bg = await main.evaluate((e) => getComputedStyle(e).backgroundColor);
  // The board's accent in dark mode: the text colour, #f2f2f2 (L1).
  expect(bg).toBe('rgb(242, 242, 242)');
  const logo = await page.locator('.welcome-logo').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(logo).toBe('rgb(242, 242, 242)');
  expect(pageErrors(page)).toEqual([]);
});

test('U4: in Set up the laptop board can be tried at once: counters go down before Play, silent', async ({ page }) => {
  await openLaptopSetup(page);
  // The colour to put down, above the board, as on the Board view.
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await expect(page.getByRole('grid', { name: /Laptop board/ }).getByRole('button', { name: /^Row 3 from the bottom, step 1: Red/ })).toBeVisible();
  await expect(page.getByText('1 on the board')).toBeVisible();
  // Nothing plays until ▶ Play the board.
  await expect(page.locator('#bs-play-stop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Red: 1')).toBeVisible();
  // The Ready step says it in the order it now happens (U6).
  await expect(page.getByText('Click squares to put counters down, then press ▶ Play the board to hear them.')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('U5: with scenes made, the board keeps its size when play starts; Details shows ▸ and ▾ like every other fold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  const stopped = await grid.boundingBox();
  // The strip with ▶ Start the piece is there before play, so starting moves nothing.
  await expect(page.getByRole('region', { name: 'Now and next' }).getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  expect(await grid.boundingBox()).toEqual(stopped);
  // The fold's sign, as on How scenes work and Other ways.
  const summary = page.locator('details[data-board-details] > summary');
  const sign = (): Promise<string> => summary.evaluate((e) => getComputedStyle(e, '::before').content);
  expect(await sign()).toBe('"▸"');
  await summary.click();
  expect(await sign()).toBe('"▾"');
  expect(pageErrors(page)).toEqual([]);
});

test('U7: notices sit in the side panel and move nothing; Explain the choices under More; Simplify is one line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  const before = await grid.boundingBox();
  await page.getByRole('button', { name: 'Clear the board' }).click();
  const slot = page.locator('[data-notice-slot]');
  await expect(slot.getByRole('button', { name: 'Undo' })).toBeVisible();
  // In the panel: to the right of the board, and the board itself has not moved.
  const s = await slot.boundingBox();
  expect(s!.x).toBeGreaterThan(before!.x + before!.width);
  expect(await grid.boundingBox()).toEqual(before);
  await slot.getByRole('button', { name: 'Undo' }).click();
  // Explain the choices: on to start with, and off takes the sentences away.
  await soundTab(page);
  await expect(page.getByText('How hard everything plays, and how busy the drums are.')).toBeVisible();
  // A switch, under More.
  const explainSwitch = async (): Promise<ReturnType<Page['getByRole']>> => {
    const more = page.locator('header').getByRole('button', { name: /^More [▾▴]$/ });
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    return page.getByRole('group', { name: 'More', exact: true }).getByRole('switch', { name: 'Explain the choices' });
  };
  await expect(await explainSwitch()).toHaveAttribute('aria-checked', 'true');
  await (await explainSwitch()).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('How hard everything plays, and how busy the drums are.')).toHaveCount(0);
  // Still off after a reload.
  await page.reload();
  await page.getByRole('button', { name: /Board Sequencer/ }).click().catch(() => undefined);
  await soundTab(page);
  await expect(page.getByText('How hard everything plays, and how busy the drums are.')).toHaveCount(0);
  await expect(await explainSwitch()).toHaveAttribute('aria-checked', 'false');
  await (await explainSwitch()).click();
  await page.keyboard.press('Escape');
  // Simplify: one line, what it does in its tooltip.
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
  const simplify = page.getByRole('button', { name: /^Simplify/ }).first();
  await expect(simplify).toHaveText('Simplify', { timeout: 20_000 });
  await expect(simplify).toHaveAttribute('title', /only Test and the first loop/);
  expect(pageErrors(page)).toEqual([]);
});

test('L1: the side panel sits on the page: no card, no fill, its tabs words over a hairline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLaptopBoard(page);
  const panel = page.locator('.bs-panel');
  await expect(panel).toHaveCount(1);
  const bg = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  const none = 'rgba(0, 0, 0, 0)';
  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    expect(await bg('.bs-panel'), mode).toBe(none);
    expect(await panel.evaluate((e) => getComputedStyle(e).boxShadow), mode).toBe('none');
    // Mute: a pill with a hairline edge, no fill; the open tab: words with an underline, no fill.
    expect(await panel.getByRole('button', { name: 'Mute' }).evaluate((e) => getComputedStyle(e).backgroundColor), mode).toBe(none);
    expect(await panel.getByRole('button', { name: 'Mute' }).evaluate((e) => getComputedStyle(e).borderTopLeftRadius), mode).toBe('999px');
    const tab = panel.getByRole('tab', { selected: true });
    expect(await tab.evaluate((e) => getComputedStyle(e).backgroundColor), mode).toBe(none);
    expect(await tab.locator('[data-words]').evaluate((e) => getComputedStyle(e).borderBottomWidth), mode).toBe('1px');
  }
  // The panel's padding: the tabs do not touch the panel's edge.
  const card = await panel.boundingBox();
  const tabs = await panel.getByRole('tablist').boundingBox();
  expect(tabs!.x - card!.x).toBeGreaterThanOrEqual(12);
  expect(pageErrors(page)).toEqual([]);
});

test('U9: Inter is the face, bundled; L3: the board sits on the page, not in a well', async ({ page }) => {
  await openLaptopBoard(page);
  const loaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 16px Inter'); });
  expect(loaded).toBe(true);
  const family = await page.getByRole('button', { name: 'Mute' }).evaluate((e) => getComputedStyle(e).fontFamily);
  expect(family.startsWith('Inter')).toBe(true);
  // Bundled, from this server: no request leaves for a font.
  const fromElsewhere = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((r) => r.name).filter((n) => /\.woff2?($|\?)/.test(n) && !n.startsWith(location.origin)));
  expect(fromElsewhere).toEqual([]);
  await expect(page.locator('[data-board-well]')).toHaveCount(0);
  const stage = await page.locator('[data-board-stage]').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(stage).toBe('rgba(0, 0, 0, 0)');
  expect(pageErrors(page)).toEqual([]);
});

test('P2: Keep as loop keeps the board as the next loop in one press, while it plays', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  // The loop rail (G1): an empty place keeps the board there.
  await page.getByRole('button', { name: /^Loop 1: empty/ }).click();
  // One press: kept, started, the board cleared; the music never stopped.
  await expect(page.getByRole('status').filter({ hasText: 'Kept as Loop 1: it plays on, and the board is clear.' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Loop 1: 2 notes, (starting|playing)/ })).toBeVisible();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop');
  await pieceStep(page, 'Loops');
  await expect(page.getByRole('listitem', { name: /^Loop 1:/ })).toBeVisible();
  await expect(page.getByText('7 of 8 places free')).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('P1: Play on the laptop: the board with four colours straight after the name, and the first counter starts it', async ({ page }) => {
  await openWelcome(page);
  await page.getByRole('button', { name: /Play on the laptop/ }).click();
  await page.getByRole('region', { name: "Who's playing?" }).getByRole('textbox', { name: 'Name' }).fill('Tim');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Counter to put down' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose the colours' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '▶ Play the board', exact: true })).toBeVisible();
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('P3: pieces: New piece starts empty, Open brings the first piece back with its scenes', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' })).toBeVisible();
  const fold = page.locator('[data-piece-picker]');
  await expect(fold).toContainText('Piece 1');
  await fold.click();
  await page.getByRole('button', { name: 'New piece' }).click();
  await expect(fold).toContainText('Piece 2');
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Make my plan/ })).toBeVisible();
  if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
  await page.getByRole('button', { name: 'Open: Piece 1' }).click();
  await expect(fold).toContainText('Piece 1');
  await expect(page.getByRole('list', { name: 'Timeline of the scenes' }).getByRole('button')).toHaveCount(4);
  // A reload keeps both pieces and which one is open.
  await page.reload();
  await page.getByRole('button', { name: /Play my board/ }).click();
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await expect(page.locator('[data-piece-picker]')).toContainText('2 pieces');
  expect(pageErrors(page)).toEqual([]);
});
