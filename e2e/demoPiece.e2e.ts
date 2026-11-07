import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors, pieceStep, sceneCard, selectScene } from './app';

/**
 * The demo piece, Rising Light version 3 (2026-11-06): opened from Who's playing?, as a player
 * of its own, it starts with the drums alone and the Groove lands at 1:06, on its pass. Its
 * thirteen scenes all show, and the last plays.
 */

test('▶ Open the demo piece: a player called Demo piece, its loops named, and the piece starts with the Drums, then the Groove at 1:06', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  const chooser = page.getByRole('region', { name: 'Who\'s playing?' });
  await chooser.getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  const rail = page.locator('[data-loop-rail]');
  for (const name of ['Tribal', 'Groove', 'Double time', 'Brass swells', 'Guitar eighths', 'Winds theme', 'Bells in threes']) await expect(rail.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  const nowNext = page.getByRole('region', { name: 'Now and next' });
  await expect(nowNext).toContainText('Now: Drums', { timeout: 15_000 });
  await expect(nowNext).toContainText('Now: Groove', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});

for (const warmUp of [true, false]) test(`Start the piece ${warmUp ? 'over a board already playing' : 'from a stopped board'}: the opening cuts in at full, not faded up from silence`, async ({ page }) => {
  test.setTimeout(120_000);
  // A fake Ableton port: every message logged with the time it is due.
  await page.addInitScript(() => {
    const log: number[][] = [];
    (window as unknown as { __midiLog: number[][] }).__midiLog = log;
    const output = {
      id: 'fake-admi', name: 'ADMIOutput', manufacturer: 'test', type: 'output', state: 'connected', connection: 'open', version: '1',
      onstatechange: null,
      send(data: number[] | Uint8Array, timestamp?: number) { log.push([timestamp ?? performance.now(), ...Array.from(data)]); },
      clear() { /* nothing queued */ }, open: async () => output, close: async () => output,
    };
    const access = { inputs: new Map(), outputs: new Map([[output.id, output]]), onstatechange: null, sysexEnabled: false };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
  });
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('radiogroup', { name: 'Sound from' }).getByRole('radio', { name: 'Ableton' }).click();
  await page.getByRole('combobox', { name: 'MIDI port' }).selectOption({ label: 'ADMIOutput' });
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  // The board plays first (a test note, a warm-up), then the piece starts over it.
  if (warmUp) await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await expect(page.getByRole('region', { name: 'Now and next' })).toContainText('Now: Drums', { timeout: 15_000 });
  await page.waitForTimeout(16_000);
  const log = await page.evaluate(() => (window as unknown as { __midiLog: number[][] }).__midiLog);
  // The Tribal kick (36 on channel 10), in the order it plays.
  const kicks = log.filter(([t, status, note, vel]) => t > t0 && status === 0x99 && note === 36 && vel > 0).sort((a, b) => a[0] - b[0]).map((m) => m[3]);
  expect(kicks.length).toBeGreaterThanOrEqual(4);
  // The opening scene cuts in: its first kick is as strong as the ones after it.
  expect(kicks[0]).toBeGreaterThanOrEqual(0.75 * Math.max(...kicks.slice(2)));
  await page.getByRole('button', { name: 'Leave Show' }).click();
  expect(pageErrors(page)).toEqual([]);
});

test('the demo’s thirteen scenes all show on the storyboard, and the last plays', async ({ page }) => {
  test.setTimeout(90_000);
  await openLaptopBoard(page);
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  await pieceStep(page, 'Scenes');
  await expect(page.locator('[data-scene-card]')).toHaveCount(13);
  await expect(sceneCard(page, 'Drums')).toBeVisible();
  await selectScene(page, 'Final ascent');
  await page.getByRole('button', { name: '▶ Play the board' }).first().click();
  await page.getByRole('button', { name: 'Jump here now: Final ascent' }).click();
  await expect(sceneCard(page, 'Final ascent')).toHaveAttribute('data-on-now', '');
  await page.getByRole('button', { name: '■ Stop' }).first().click();
  expect(pageErrors(page)).toEqual([]);
});
