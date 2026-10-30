import { test, expect, type Page } from '@playwright/test';
import { makePlan, openLaptopBoard, openLaptopSetup, openWelcome, pageErrors, pickColour, pieceStep, place } from './app';
import { nameStartsWithVisible } from '../src/ui/screens/boardSequencer/labelInName';

/**
 * Access, the audience screen, the iPad and the rest (audit 2026-10-30, batch 5): what the
 * owner sees and what a screen reader or a switch is told.
 */

/** Every control with an aria-label on the page now: its label, and the words it shows. */
async function nameProblems(page: Page): Promise<string[]> {
  const items = await page.evaluate(() => {
    const out: { name: string; visible: string }[] = [];
    const sel = 'button, a[href], [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], summary, input[type=checkbox], input[type=radio]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || el.closest('[inert]')) continue;
      const label = el.getAttribute('aria-label');
      if (!label) continue;
      out.push({ name: label, visible: el.innerText ?? '' });
    }
    return out;
  });
  return items.filter((i) => !nameStartsWithVisible(i.name, i.visible)).map((i) => `[${i.visible.trim().replace(/\s+/g, ' ')}] is named "${i.name}"`);
}

/** The visible text with a font under 14 px, and the visible text fields with under 10 px inside. */
async function typeProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('canvas, svg, [inert]') || el.offsetWidth === 0 || el.offsetHeight === 0) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (own && size < 14) out.push(`${size}px: ${(el.textContent ?? '').trim().slice(0, 40)}`);
      if (el instanceof HTMLInputElement && ['text', 'number', 'search', ''].includes(el.type)) {
        const pad = parseFloat(getComputedStyle(el).paddingLeft);
        if (pad < 10) out.push(`field with ${pad}px inside: ${el.getAttribute('aria-label') ?? el.placeholder}`);
      }
    }
    return out;
  });
}

/** The levels of the visible headings, in order. */
const headingLevels = (page: Page): Promise<number[]> => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
    .filter((h) => h.offsetWidth > 0 && !h.closest('[inert], [aria-hidden="true"]'))
    .map((h) => Number(h.tagName[1])));
const inOrder = (levels: number[]): boolean => levels.every((l, i) => (i === 0 ? l === 1 : l <= levels[i - 1] + 1));

test('A9: every button’s name starts with the words it shows, on every screen', async ({ page }) => {
  test.setTimeout(120_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  expect(await nameProblems(page)).toEqual([]);
  await page.getByRole('tab', { name: 'Sound' }).click();
  expect(await nameProblems(page)).toEqual([]);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('button', { name: /Other ways to make a loop/ }).click();
  expect(await nameProblems(page)).toEqual([]);
  await makePlan(page);
  expect(await nameProblems(page)).toEqual([]);
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: /Ending/ }).click();
  expect(await nameProblems(page)).toEqual([]);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  expect(await nameProblems(page)).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});

test('A9: Welcome and the set-up steps too', async ({ page }) => {
  await openWelcome(page);
  expect(await nameProblems(page)).toEqual([]);
  await openLaptopSetup(page);
  expect(await nameProblems(page)).toEqual([]);
});

test('A10: no text under 14 px, and text fields have 10 px inside', async ({ page }) => {
  test.setTimeout(120_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  expect(await typeProblems(page)).toEqual([]);
  await page.getByRole('tab', { name: 'Sound' }).click();
  expect(await typeProblems(page)).toEqual([]);
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  expect(await typeProblems(page)).toEqual([]);
  await makePlan(page);
  expect(await typeProblems(page)).toEqual([]);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  expect(await typeProblems(page)).toEqual([]);
});

test('A8: Help opens at the top, focus on its heading, with Close in reach and links to its sections', async ({ page }) => {
  await openLaptopBoard(page);
  await page.getByRole('button', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'How to play', level: 2 })).toBeFocused();
  const scroller = dialog.locator('[data-scroll]');
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  // Close is visible without scrolling, and is not inside the scrolling text.
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
  expect(await dialog.getByRole('button', { name: 'Close' }).evaluate((b) => b.closest('[data-scroll]') === null)).toBe(true);
  // A link goes to its section, with focus on that heading.
  await dialog.getByText('Jump to a section').click();
  await dialog.getByRole('link', { name: 'Keyboard', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Keyboard', level: 3 })).toBeFocused();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('A7: Time to press again (10 s) keeps Stop waiting past the old 4 s; Space can be switched off', async ({ page }) => {
  test.setTimeout(120_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByRole('button', { name: /^Advanced: key, scale/ }).click();
  const group = page.getByRole('radiogroup', { name: 'Time to press again' });
  await expect(group.getByRole('radio', { name: '4 seconds' })).toHaveAttribute('aria-checked', 'true'); // today's behaviour
  await group.getByRole('radio', { name: '10 seconds' }).click();
  await expect(page.getByRole('switch', { name: 'Space plays and stops' })).toHaveAttribute('aria-checked', 'true');
  // Saved for this player: still there after a reload.
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByRole('button', { name: /^Advanced: key, scale/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Time to press again' }).getByRole('radio', { name: '10 seconds' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = page.getByRole('region', { name: 'Show', exact: true });
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(show.getByRole('region', { name: 'Now and next' }).getByRole('timer')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2100)));
  await show.getByRole('button', { name: '■ Stop', exact: true }).click();
  await expect(show.getByRole('button', { name: '■ Press again to stop' })).toBeVisible();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 5500))); // the old 4 s has gone
  await expect(show.getByRole('button', { name: '■ Press again to stop' })).toBeVisible();
  await show.getByRole('button', { name: '■ Press again to stop' }).click();
  await expect(show.getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave Show' }).click();
  // Space off: the key does nothing.
  await page.getByRole('tab', { name: 'Sound' }).click();
  await page.getByRole('switch', { name: 'Space plays and stops' }).click();
  await expect(page.getByRole('switch', { name: 'Space plays and stops' })).toHaveAttribute('aria-checked', 'false');
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  await expect(page.locator('#bs-play-stop')).toHaveText('▶ Play the board');
  expect(pageErrors(page)).toEqual([]);
});

test('A18: headings in order, one main region on Welcome, the audience page named, the header buttons on one line', async ({ page }) => {
  test.setTimeout(120_000);
  await openWelcome(page);
  expect(await page.locator('main, [role="main"]').count()).toBe(1);
  expect(inOrder(await headingLevels(page))).toBe(true);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  for (const where of ['board', 'sound', 'piece', 'scenes'] as const) {
    if (where === 'sound') await page.getByRole('tab', { name: 'Sound' }).click();
    if (where === 'piece') await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
    if (where === 'scenes') await pieceStep(page, 'Scenes');
    const levels = await headingLevels(page);
    expect({ where, ok: inOrder(levels), levels }).toEqual({ where, ok: true, levels });
  }
  // ☀, Aa, ? and the Player button share one top edge.
  const tops = await Promise.all([/^Player:/, /^Switch to (light|dark) mode$/, /^Aa/, /^Help$/].map(async (name) => {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    return Math.round(box?.y ?? -1);
  }));
  expect(new Set(tops).size).toBe(1);
  const aud = await page.context().newPage();
  await aud.goto('/audience.html');
  await expect(aud).toHaveTitle('ADMI – audience');
});
