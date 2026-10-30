import { test, expect, type Locator, type Page } from '@playwright/test';
import { makePlan, openLaptopBoard, pageErrors, pickColour, place } from './app';

/**
 * Show safety (audit 2026-10-30, batch 1): the status row in Show, the iPad link that
 * stalls, ■ Stop just after the start, Show surviving the end of full screen, the audience
 * screen in Show and fed while the drawing loop is stopped. The laptop board, no camera.
 */

/** A pause measured inside the page (the runner can lag by hundreds of milliseconds). */
const pause = (page: Page, ms: number) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);
const showOf = (page: Page): Locator => page.getByRole('region', { name: 'Show', exact: true });
const rowOf = (page: Page): Locator => showOf(page).getByRole('group', { name: 'Show status' });
const touch = { pointerType: 'touch', pointerId: 1, width: 30, height: 30 };

/** Red counters on the laptop board and the four-scene plan. */
async function boardWithPlan(page: Page): Promise<void> {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3], [4, 5], [6, 7]]);
  await makePlan(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
}

test('the iPad link: a heartbeat each second, a stall shown on both sides in 3–4 s (never sooner), touches not shown as applied, back without flicker; End piece pressed once and Mute in the Show row (B1, B2, B20)', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  await boardWithPlan(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));

  // The iPad in a browser of its own, its Wi-Fi in our hands: while `stalled`, nothing gets
  // through either way and both sockets stay open.
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 810, height: 1080 }, hasTouch: true });
  let stalled = false;
  await ctx.routeWebSocket(/admi-remote/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => { if (!stalled) server.send(m); });
    server.onMessage((m) => { if (!stalled) ws.send(m); });
  });
  try {
    const ipad = await ctx.newPage();
    // When each message from the laptop arrives, by the iPad page's own clock.
    await ipad.addInitScript(() => {
      const W = window.WebSocket;
      const times: number[] = [];
      (window as unknown as { __fromLaptop: number[] }).__fromLaptop = times;
      window.WebSocket = class extends W {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          this.addEventListener('message', (e) => { if (!String(e.data).includes('"peers"')) times.push(performance.now()); });
        }
      };
    });
    await ipad.goto(`/?remote=${code}`);
    const ipadStatus = ipad.getByRole('status').first();
    await expect(ipadStatus).toHaveText('Connected · press Play on the laptop');

    // The heartbeat, measured: stopped, nothing changes on the laptop, yet it speaks every
    // second, so the 3.5 s lost time is more than three heartbeats.
    await pause(ipad, 6000);
    const gaps = await ipad.evaluate(() => {
      const t = (window as unknown as { __fromLaptop: number[] }).__fromLaptop.slice(-6);
      return t.slice(1).map((x, i) => Math.round(x - t[i]));
    });
    testInfo.annotations.push({ type: 'heartbeat gaps (ms)', description: gaps.join(', ') });
    console.log(`[heartbeat gaps, ms] ${gaps.join(', ')}`);
    expect(gaps.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...gaps)).toBeLessThan(3500 / 3);

    // New idea while the laptop is stopped: refused, and Extra notes stays off (B18).
    await ipad.getByRole('button', { name: /New idea/ }).dispatchEvent('pointerdown', touch);
    await expect(ipad.getByText('Press Play on the laptop first')).toBeVisible();
    await page.getByRole('tab', { name: 'Sound' }).click();
    await expect(page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Off' })).toBeChecked();

    // Show, then the piece: the row says the iPad is there, and no camera (the laptop board).
    await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    const row = rowOf(page);
    await expect(row).toContainText('iPad ✓');
    await expect(row).not.toContainText('Camera');
    await showOf(page).getByRole('button', { name: '▶ Start the piece' }).click();
    await expect(showOf(page).getByRole('timer')).toBeVisible({ timeout: 20_000 });
    await expect(ipadStatus).toHaveText('Connected · playing');
    const boardTop = await showOf(page).locator('canvas').first().boundingBox();

    // Mute: said in the row, and the board does not move.
    await showOf(page).getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(row).toContainText('Muted: nothing is sounding');
    expect((await showOf(page).locator('canvas').first().boundingBox())?.y).toBe(boardTop?.y);
    await showOf(page).getByRole('button', { name: 'Muted', exact: true }).click();
    await expect(row).not.toContainText('Muted');

    // Tim's first End piece tap: the laptop shows it until the window runs out (B20).
    await ipad.getByRole('button', { name: 'End the piece', exact: true }).dispatchEvent('pointerdown', touch);
    await expect(row).toContainText('iPad: End piece pressed once');
    await expect(row).not.toContainText('End piece pressed once', { timeout: 12_000 });
    await expect(page.getByRole('button', { name: 'Cancel the ending' })).toHaveCount(0);

    // The Wi-Fi stalls. 2.5 s on, both still say all is well; by 5 s both say it is not.
    const strip = ipad.getByRole('slider', { name: 'Extra notes' });
    const before = await strip.getAttribute('aria-valuenow');
    stalled = true;
    await pause(page, 2500);
    await expect(row).toContainText('iPad ✓');
    await expect(row).toContainText('! iPad not reaching', { timeout: 3_000 });
    await expect(ipadStatus).toHaveText('Not reaching the laptop', { timeout: 3_000 });
    // A touch now is neither sent nor shown as applied.
    const box = await strip.boundingBox();
    await ipad.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height * 0.2);
    await pause(ipad, 300);
    expect(await strip.getAttribute('aria-valuenow')).toBe(before);

    // Back: both sides recover, and the laptop's line never flickers on the way.
    stalled = false;
    const seen = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const out: string[] = [];
      const id = setInterval(() => {
        const t = document.querySelector('[role="group"][aria-label="Show status"]')?.textContent ?? '';
        const now = t.includes('iPad ✓') ? 'ok' : t.includes('iPad not reaching') ? 'lost' : '?';
        if (out[out.length - 1] !== now) out.push(now);
      }, 100);
      setTimeout(() => { clearInterval(id); resolve(out); }, 8000);
    }));
    expect(seen).toEqual(['lost', 'ok']);
    await expect(ipadStatus).toHaveText('Connected · playing');
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('after a reload mid-piece, the iPad waits for Carry on and its touches are refused; Carry on brings it back (B19)', async ({ page, context }) => {
  test.setTimeout(150_000);
  await boardWithPlan(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('switch', { name: 'iPad controls' }).click();
  const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));
  const ipad = await context.newPage();
  await ipad.setViewportSize({ width: 810, height: 1080 });
  await ipad.goto(`/?remote=${code}`);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await showOf(page).getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing', { timeout: 20_000 });
  await pause(page, 1500);
  await page.reload();
  const offer = page.getByRole('alert').filter({ hasText: 'The piece was playing' });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  await expect(ipad.getByRole('status').first()).toHaveText('The laptop is getting back: waiting for Carry on', { timeout: 15_000 });
  // A touch on the strip is refused: nothing reaches the laptop.
  const strip = ipad.getByRole('slider', { name: 'Extra notes' });
  const box = await strip.boundingBox();
  await ipad.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * 0.2);
  await pause(page, 1000);
  await expect(page.getByText(/^iPad: Extra notes/)).toHaveCount(0);
  await offer.getByRole('button', { name: /Carry on from/ }).click();
  await expect(ipad.getByRole('status').first()).toHaveText('Connected · playing', { timeout: 20_000 });
  expect(pageErrors(page)).toEqual([]);
});

test('■ Stop ignores presses for 2 s after the piece starts, then takes two presses as before (B3)', async ({ page }) => {
  await boardWithPlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = showOf(page);
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  // Pressed again and again from the moment the clock appears, for 1.5 s, timed in the page.
  const during = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const out: string[] = [];
    const wait = setInterval(() => {
      if (!document.querySelector('[role="timer"]')) return;
      clearInterval(wait);
      const stop = (): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => /Stop/.test(b.textContent ?? ''));
      const id = setInterval(() => { stop()?.click(); out.push(stop()?.textContent ?? 'none'); }, 250);
      setTimeout(() => { clearInterval(id); resolve(out); }, 1500);
    }, 20);
  }));
  expect(during.length).toBeGreaterThanOrEqual(4);
  expect(new Set(during)).toEqual(new Set(['■ Stop']));
  await expect(show.getByRole('timer')).toBeVisible();
  // After 2 s: the first press gets Stop ready, the second stops.
  await pause(page, 1000);
  await show.getByRole('button', { name: '■ Stop', exact: true }).click();
  await show.getByRole('button', { name: '■ Press again to stop' }).click();
  await expect(show.getByRole('button', { name: '▶ Start the piece' })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('Show stays when full screen ends mid-piece; Esc then leaves it, and the piece plays on (B5)', async ({ page }) => {
  await boardWithPlan(page);
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = showOf(page);
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(show.getByRole('timer')).toBeVisible({ timeout: 20_000 });
  // Full screen ends (a click on the projector window, the browser's Esc).
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await pause(page, 1500);
  await expect(show.getByRole('button', { name: 'Leave Show' })).toBeVisible();
  await expect(show.getByRole('timer')).toBeVisible();
  // Esc of its own, out of full screen: leaves Show; the piece plays on.
  await show.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Leave Show' })).toHaveCount(0);
  await expect(page.getByRole('timer').first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('in Show the audience screen can’t be closed while the piece plays, and keeps blooming when the drawing loop stops (B4, B6, B15)', async ({ page }) => {
  test.setTimeout(150_000);
  await boardWithPlan(page);
  // The theme light: Show is dark all the same.
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  const [aud] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Open the audience screen' }).first().click(),
  ]);
  await aud.waitForLoadState();
  const picture = aud.locator('#root > div');
  await expect(picture).toHaveAttribute('data-connected', 'yes', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const show = showOf(page);
  await expect(show).toHaveAttribute('data-bs-mode', 'dark');
  await show.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(show.getByRole('timer')).toBeVisible({ timeout: 20_000 });
  await expect(show.getByRole('button', { name: /Close the audience screen/ })).toHaveCount(0);
  await expect(show.getByText(/^AI:/)).toHaveCount(0);
  await expect(picture).toHaveAttribute('data-awake', 'yes', { timeout: 20_000 });
  // The browser stops drawing the laptop page (as for a covered window): no more frames.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await pause(page, 3500); // longer than the 2.5 s after which an unfed audience screen fades
  const blooms = await aud.evaluate(() => new Promise<number>((resolve) => {
    const el = document.querySelector<HTMLElement>('#root > div');
    const seen = new Set<string>();
    const id = setInterval(() => { for (const s of (el?.dataset.blooms ?? '').split(' ')) if (s) seen.add(s); }, 30);
    setTimeout(() => { clearInterval(id); resolve(seen.size); }, 4000);
  }));
  expect(blooms).toBeGreaterThan(0);
  await expect(picture).toHaveAttribute('data-awake', 'yes');
  expect(pageErrors(page)).toEqual([]);
});
