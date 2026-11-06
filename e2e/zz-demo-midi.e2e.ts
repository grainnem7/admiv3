import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { openLaptopBoard } from './app';

/**
 * A probe, not a check: the whole demo piece played to a fake MIDI port called ADMIOutput
 * with Ableton as the sound, every message logged with its time, for scratch analysis.
 * Run on its own: MIDI_DIR=... npx playwright test e2e/zz-demo-midi.e2e.ts
 */

const DIR = process.env.MIDI_DIR ?? '/tmp/midi';

async function fakeMidi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: number[][] = [];
    (window as unknown as { __midiLog: number[][] }).__midiLog = log;
    const output = {
      id: 'fake-admi', name: 'ADMIOutput', manufacturer: 'test', type: 'output', state: 'connected', connection: 'open', version: '1',
      onstatechange: null,
      send(data: number[] | Uint8Array, timestamp?: number) { log.push([performance.now(), timestamp ?? performance.now(), ...Array.from(data)]); },
      clear() { /* nothing queued */ }, open: async () => output, close: async () => output,
    };
    const access = { inputs: new Map(), outputs: new Map([[output.id, output]]), onstatechange: null, sysexEnabled: false };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
  });
}

test('midi: the whole demo piece', async ({ page }) => {
  test.setTimeout(600_000);
  await fakeMidi(page);
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('radiogroup', { name: 'Sound from' }).getByRole('radio', { name: 'Ableton' }).click();
  await page.getByRole('combobox', { name: 'MIDI port' }).selectOption({ label: 'ADMIOutput' });
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  await page.evaluate(() => { (window as unknown as { __midiLog: number[][] }).__midiLog.length = 0; });
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '▶ Start the piece' }).click();
  await page.waitForTimeout(430_000);
  const log = await page.evaluate(() => (window as unknown as { __midiLog: number[][] }).__midiLog);
  writeFileSync(`${DIR}/demo.json`, JSON.stringify({ t0, log }));
  console.log(`MIDI demo: ${log.length} messages`);
});
