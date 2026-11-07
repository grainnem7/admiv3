import { test, expect, type Browser, type TestInfo } from '@playwright/test';
import { openLaptopBoard, pageErrors, pickColour, place } from './app';

/**
 * The second performer (owner, 7 Nov 2026: "I will be performing alongside Tim. I only have one
 * iPad, but I would like to play and contribute from another laptop"): the iPad's link with
 * `&performer=1`, opened in a laptop-sized browser of its own, alongside Tim's iPad.
 */

const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };

async function joined(browser: Browser, testInfo: TestInfo, path: string, opts: { touch: boolean; size: { width: number; height: number } }) {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: opts.size, hasTouch: opts.touch });
  const p = await ctx.newPage();
  await p.goto(path);
  return { p, close: () => ctx.close() };
}

test('a second laptop joins with the same code: every control, the laptop says it is connected, and Tim’s iPad works alongside', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect(page.locator('#bs-play-stop')).toHaveText('■ Stop', { timeout: 20_000 });
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  const second = page.getByRole('group', { name: 'A second laptop, to play along' });
  await expect(second.getByRole('status')).toHaveText('No second laptop yet');
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));

  const ipad = await joined(browser, testInfo, `/?remote=${code}`, { touch: true, size: { width: 810, height: 1080 } });
  const laptop2 = await joined(browser, testInfo, `/?remote=${code}&performer=1`, { touch: false, size: { width: 1366, height: 768 } });
  try {
    const p = laptop2.p;
    await expect(p.getByRole('status').first()).toHaveText('Connected · playing');
    await expect(p.getByText(`Second performer · code ${code}`)).toBeVisible();
    // The laptop tells them apart: the iPad, and the second laptop.
    await expect(second.getByRole('status')).toHaveText('✓ Second laptop connected', { timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: '✓ iPad connected' })).toBeVisible();
    // Every control, though Tim's iPad has the simple layout.
    await expect(ipad.p.locator('[data-simple-page]')).toBeVisible();
    await expect(p.getByRole('tab')).toHaveText(['Play', 'Instruments & colours', 'Sound', 'Loops', 'Loops & scenes']);
    await expect(p.getByRole('slider')).toHaveCount(4);
    // A mouse click on Extra notes' strip, at its top: Extra notes all the way up, on the laptop too.
    const strip = p.getByRole('slider', { name: 'Extra notes' });
    const box = (await strip.boundingBox())!;
    await p.mouse.click(box.x + box.width / 2, box.y + 4);
    await expect(strip).toHaveAttribute('aria-valuenow', /^(9\d|100)$/);
    // The instruments and colours, from the second laptop: the melody's sound changes on Tim's iPad too.
    await p.getByRole('tab', { name: 'Instruments & colours' }).click();
    await p.getByRole('radio', { name: 'Flute' }).click();
    await expect(ipad.p.getByRole('radio', { name: 'Flute' })).toHaveAttribute('aria-checked', 'true');
    // And Tim's iPad still works alongside: its colour pad silences Red, seen on the second laptop.
    await ipad.p.getByRole('group', { name: 'Counters' }).getByRole('button', { name: /^Red, .*: Playing$/ }).dispatchEvent('pointerdown', touch);
    await expect(p.getByRole('group', { name: 'Counters' }).getByRole('button', { name: /^Red, .*: Silent$/ })).toBeVisible();
    // Gone: the laptop says so within a few seconds.
    await laptop2.close();
    await expect(second.getByRole('status')).toHaveText('No second laptop yet', { timeout: 10_000 });
    await expect(page.getByRole('status').filter({ hasText: '✓ iPad connected' })).toBeVisible();
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await ipad.close();
    await laptop2.close().catch(() => undefined);
  }
});
