import { test, expect, type Page } from '@playwright/test';
import { makePlan, openLaptopBoard, pageErrors, pickColour, pieceStep, place } from './app';

/**
 * Look and words on stage (audit 2026-10-30, batch 3): the renamed buttons, Next scene's
 * Back, End's own sign, the scene chips, the pressed style, and a header that keeps its place.
 */

/** WCAG contrast of two computed colours ("rgb(…)"), worked out in the page. */
const contrastIn = (page: Page, selector: string): Promise<{ text: string; ratio: number }[]> => page.evaluate((sel) => {
  const lum = (c: string): number => {
    const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  return [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
    const cs = getComputedStyle(el);
    const a = lum(cs.color); const b = lum(cs.backgroundColor);
    return { text: el.textContent ?? '', ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
}, selector);

test('the names on stage: Board, ▶ Play the board (no clock), Show, Next scene with Back, ↘ End piece, ■ Stop as the danger button', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const play = page.getByRole('button', { name: '▶ Play the board', exact: true });
  await expect(play).toHaveAccessibleDescription('No clock, no scenes: the piece starts from Show.');
  await expect(page.getByText('No clock, no scenes: the piece starts from Show.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Show: the board, the clock/ })).toHaveText('Show');
  await makePlan(page);
  // The board playing with no clock: the strip offers ▶ Start the piece, and nothing to move on or end.
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await play.click();
  const boardStrip = page.getByRole('region', { name: 'Now and next' });
  await expect(boardStrip.getByRole('button', { name: '▶ Start the piece' })).toBeVisible({ timeout: 20_000 });
  await expect(boardStrip.getByRole('button', { name: /Next scene|End piece/ })).toHaveCount(0);
  await page.locator('#bs-play-stop').click();
  await expect(page.locator('#bs-play-stop')).toHaveText('▶ Play the board');
  await page.waitForTimeout(700); // a press straight after Stop is a bounce
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  const strip = show.getByRole('region', { name: 'Now and next' });
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(strip.getByRole('button', { name: 'Next scene ▶' })).toBeVisible({ timeout: 20_000 });
  const end = strip.getByRole('button', { name: '↘ End piece' });
  await expect(end).toBeVisible();
  // ■ Stop is the strongest button by weight, not hue: the text colour as its fill, the page
  // colour as its words, bold. End is quiet.
  const stop = await show.getByRole('button', { name: '■ Stop', exact: true }).evaluate((b) => {
    const cs = getComputedStyle(b); const root = getComputedStyle(document.querySelector('.bs-root')!);
    return { bg: cs.backgroundColor, fg: cs.color, weight: cs.fontWeight, rootFg: root.color, rootBg: root.backgroundColor };
  });
  expect(stop.bg).toBe(stop.rootFg);
  expect(stop.fg).toBe(stop.rootBg);
  expect(Number(stop.weight)).toBeGreaterThanOrEqual(700);
  expect(await show.getByRole('button', { name: '↘ End piece' }).evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // Next scene, then Back to the scene before.
  await expect(strip).toContainText('Now: Arrival');
  await strip.getByRole('button', { name: 'Next scene ▶' }).click();
  await expect(strip).toContainText('Now: Build');
  await strip.getByRole('button', { name: '↶ Back to Arrival' }).click();
  await expect(strip).toContainText('Now: Arrival');
  await expect(strip.getByRole('button', { name: /Back to/ })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test('scene chips: numbered, each in a list item, readable in both modes, no counter colour; pressed buttons have no orange ring; paragraphs readable', async ({ page }) => {
  await openLaptopBoard(page);
  await makePlan(page);
  const timeline = page.getByRole('list', { name: 'Timeline of the scenes' });
  for (const mode of ['dark', 'light'] as const) {
    if (mode === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(timeline.getByRole('listitem').getByRole('button')).toHaveCount(4);
    const chips = await contrastIn(page, '[aria-label="Timeline of the scenes"] button');
    // Whole words only, never cut: each chip shows what fits, its title has them all.
    const titles = await timeline.getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('title')));
    expect(titles).toEqual(['1 · Arrival 0:00', '2 · Build 1:30', '3 · Open 3:30', '4 · Home 6:00']);
    chips.forEach((c, i) => {
      const [n, , name] = (titles[i] ?? '').split(' ');
      expect([titles[i], `${n} · ${name}`, n, '']).toContain(c.text);
    });
    // Nothing overflows its chip (a cut word would).
    const overflow = await timeline.getByRole('button').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    expect(overflow).toEqual([]);
    for (const c of chips) expect(c.ratio, `${mode} ${c.text}`).toBeGreaterThanOrEqual(4.5);
    // The base stylesheet's orange (#f97316) ring is gone from pressed buttons.
    const pressed = await page.locator('.bs-root [aria-pressed="true"]').evaluateAll((els) => els.map((e) => `${getComputedStyle(e).borderTopColor} ${getComputedStyle(e).boxShadow}`));
    expect(pressed.length).toBeGreaterThan(0);
    for (const p of pressed) expect(p).not.toContain('249, 115, 22');
    // Paragraphs take the board's text colour: no pale grey on light cards.
    const para = await page.locator('.bs-root p', { hasText: 'A scene says which loops play' }).evaluate((p) => {
      let el: HTMLElement | null = p as HTMLElement; let bg = 'rgba(0, 0, 0, 0)';
      while (el && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
      return { color: getComputedStyle(p).color, bg };
    });
    const ratio = await page.evaluate(({ color, bg }) => {
      const lum = (c: string): number => {
        const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
        const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(color); const b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, para);
    expect(ratio, `${mode} paragraph`).toBeGreaterThanOrEqual(4.5);
  }
  // The old ways to make a loop are folded, and the empty name says Keep.
  await pieceStep(page, 'Loops');
  await expect(page.getByRole('button', { name: 'Save the board here' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Name of loop 1' })).toHaveAttribute('placeholder', 'name (after Keep)');
  await page.getByRole('button', { name: /Other ways to make a loop/ }).click();
  await expect(page.getByRole('button', { name: 'Save the board here' }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('the header keeps its place when the board starts: nothing in it wraps or moves', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  const where = (): Promise<string> => page.evaluate(() => {
    const hd = document.querySelector('header')!;
    return JSON.stringify([Math.round(hd.getBoundingClientRect().height), ...[...hd.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top))]);
  });
  for (const width of [1366, 1400, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const before = await where();
    await page.getByRole('button', { name: '▶ Play the board', exact: true }).click();
    await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
    await expect(page.getByText('Stop playing to switch player.')).toBeVisible();
    expect(await where(), `${width} wide`).toBe(before);
    await page.locator('#bs-play-stop').click();
    await expect(page.locator('#bs-play-stop')).toHaveText('▶ Play the board');
    await page.waitForTimeout(700); // ▶ Play the board ignores a press straight after Stop
  }
  expect(pageErrors(page)).toEqual([]);
});
