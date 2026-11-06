import { test, expect } from '@playwright/test';
import { openLaptopBoard, pickColour, place } from './app';

/**
 * Closing the page mid-piece (the owner, 2026-11-06): the sound kept playing in Ableton,
 * frozen. Closing must tell Ableton every note off on every channel.
 */
test('closing the page while the board plays over MIDI: Ableton is told every note off, on every channel', async ({ page, context }) => {
  const sent: number[][] = [];
  await page.exposeFunction('__midiSend', (data: number[]) => { sent.push(data); });
  await page.addInitScript(() => {
    const out = {
      id: 'fake-admi', name: 'ADMIOutput', manufacturer: 'test', type: 'output', state: 'connected', connection: 'open', version: '1',
      onstatechange: null,
      send(data: number[] | Uint8Array) { (window as unknown as { __midiSend: (d: number[]) => void }).__midiSend(Array.from(data)); },
      clear() { /* nothing */ }, open: async () => out, close: async () => out,
    };
    const access = { inputs: new Map(), outputs: new Map([[out.id, out]]), onstatechange: null, sysexEnabled: false };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
  });
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('radiogroup', { name: 'Sound from' }).getByRole('radio', { name: 'Ableton' }).click();
  await page.getByRole('combobox', { name: 'MIDI port' }).selectOption({ label: 'ADMIOutput' });
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await page.getByRole('button', { name: '▶ Play the board', exact: true }).first().click();
  await expect.poll(() => sent.some((d) => (d[0] & 0xf0) === 0x90 && d[2] > 0), { timeout: 15_000 }).toBe(true);
  sent.length = 0;
  await page.close({ runBeforeUnload: true });
  // A moment for the last messages to arrive from the closing page.
  const other = await context.newPage();
  await other.waitForTimeout(500);
  const allOffChannels = new Set(sent.filter((d) => (d[0] & 0xf0) === 0xb0 && d[1] === 123).map((d) => d[0] & 0x0f));
  expect(allOffChannels.size).toBe(16);
});
