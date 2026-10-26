import { test, expect, type Page } from '@playwright/test';
import { notesPlayed, openLaptopBoard, pageErrors, pickColour, pieceStep, place, startPiece } from './app';

/**
 * Ableton as the Board Sequencer's sound, end to end with a stand-in MIDI port: Chrome's
 * Web MIDI is replaced by a fake "ADMI" output that records every message, so the tests
 * can check what Ableton would hear without Ableton or loopMIDI.
 */

interface Sent { d: number[]; at: number }

/** The stand-in port: one output called ADMI that can be pulled out and put back. */
async function fakeMidiPort(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Listener = ((e: { port: unknown }) => void) | null;
    const sent: { d: number[]; at: number }[] = [];
    const output = {
      id: 'admi-port', name: 'ADMI', manufacturer: 'loopMIDI', type: 'output', state: 'connected' as 'connected' | 'disconnected',
      send(data: number[], at?: number) {
        if (output.state !== 'connected') throw new Error('port disconnected');
        sent.push({ d: [...data], at: at ?? performance.now() });
      },
    };
    const access = { outputs: new Map([[output.id, output]]), inputs: new Map(), onstatechange: null as Listener, sysexEnabled: false };
    const w = window as unknown as Record<string, unknown>;
    w.__midiSent = sent;
    w.__midiPort = {
      remove() { output.state = 'disconnected'; access.onstatechange?.({ port: output }); },
      add() { output.state = 'connected'; access.onstatechange?.({ port: output }); },
    };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
  });
}

const sentSince = (page: Page, sinceMs: number): Promise<Sent[]> => page.evaluate(
  (since) => ((window as unknown as { __midiSent: Sent[] }).__midiSent).filter((m) => m.at >= since),
  sinceMs,
);
const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const isCc = (m: Sent, cc: number) => (m.d[0] & 0xf0) === 0xb0 && m.d[1] === cc;
const isOn = (m: Sent) => (m.d[0] & 0xf0) === 0x90 && m.d[2] > 0;
const isOff = (m: Sent) => (m.d[0] & 0xf0) === 0x80 || ((m.d[0] & 0xf0) === 0x90 && m.d[2] === 0);

async function chooseSoundFrom(page: Page, choice: 'ADMI' | 'Ableton' | 'Both'): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Sound from' }).getByRole('radio', { name: choice, exact: true }).click();
}

/** Play page → Connections: Sound from Ableton on the ADMI port. */
async function setUpAbleton(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  await chooseSoundFrom(page, 'Ableton');
  await page.getByRole('combobox', { name: 'MIDI port' }).selectOption({ label: 'ADMI' });
  await expect(page.getByText('✓ Sending to ADMI')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await fakeMidiPort(page);
});

test('Sound from: switching while playing releases every note in Ableton', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 2], [4, 3], [6, 4]]);
  await setUpAbleton(page);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(async () => (await sentSince(page, 0)).filter(isOn).length, { timeout: 15_000 }).toBeGreaterThan(0);
  // Leaving a route that was sending releases it: Ableton to ADMI, and Both to Ableton (a
  // new route). ADMI to Both has nothing in Ableton to release.
  for (const [choice, releases] of [['ADMI', true], ['Both', false], ['Ableton', true]] as const) {
    const t = await now(page);
    await chooseSoundFrom(page, choice);
    if (releases) await expect.poll(async () => (await sentSince(page, t)).some((m) => isCc(m, 123)), { timeout: 5_000 }).toBe(true);
    else await expect.poll(async () => (await sentSince(page, t)).filter(isOn).length, { timeout: 15_000 }).toBeGreaterThan(0);
  }
  expect(await notesPlayed(page)).toBeGreaterThan(0); // ADMI drew and logged them throughout
  expect(pageErrors(page)).toEqual([]);
});

test('the port goes mid-piece: ADMI plays on and says so; when it is back, it waits to be asked', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 3]]);
  await setUpAbleton(page);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(async () => (await sentSince(page, 0)).filter(isOn).length, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.evaluate(() => (window as unknown as { __midiPort: { remove(): void } }).__midiPort.remove());
  await expect(page.getByText("Ableton's port has gone, so ADMI is playing its own sound.").first()).toBeVisible();
  const before = await notesPlayed(page);
  await expect.poll(() => notesPlayed(page), { timeout: 10_000 }).toBeGreaterThan(before); // the music carries on

  await pieceStep(page, 'Ending & check');
  await expect(page.getByText(/the MIDI port is missing/)).toBeVisible();

  await page.evaluate(() => (window as unknown as { __midiPort: { add(): void } }).__midiPort.add());
  const back = page.getByRole('button', { name: 'Switch to Ableton' }).first();
  await expect(back).toBeVisible();
  const t = await now(page);
  // Not switched yet: nothing new reaches Ableton.
  await page.waitForTimeout(1500);
  expect((await sentSince(page, t)).filter(isOn)).toHaveLength(0);
  await back.click();
  await expect.poll(async () => (await sentSince(page, t)).filter(isOn).length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(pageErrors(page)).toEqual([]);
});

test('Panic sends every note off and all sound off on all 16 channels', async ({ page }) => {
  await openLaptopBoard(page);
  await setUpAbleton(page);
  const t = await now(page);
  await page.getByRole('button', { name: 'Panic', exact: true }).first().click();
  await expect.poll(async () => new Set((await sentSince(page, t)).filter((m) => isCc(m, 120)).map((m) => m.d[0] & 0x0f)).size).toBe(16);
  expect(new Set((await sentSince(page, t)).filter((m) => isCc(m, 123)).map((m) => m.d[0] & 0x0f)).size).toBe(16);
});

test('a 40 second piece in Ableton mode is silent by 0:40', async ({ page }) => {
  test.setTimeout(180_000); // a 40 s piece, plus setting up and waiting for the instruments
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1], [5, 2], [4, 3], [6, 4]]);
  await setUpAbleton(page);
  await pieceStep(page, 'Ending & check');
  const length = page.getByRole('textbox', { name: /Length of the piece/ });
  await length.fill('0:40');
  await length.blur();
  await page.getByRole('radio', { name: /Fade out/ }).click();
  const pressed = await now(page);
  // ▶ Play just plays; the piece (its clock and its end) starts from Show.
  await startPiece(page);
  const stopButton = page.getByRole('button', { name: /■ Stop|Press again to stop/ });
  await expect(stopButton.first()).toBeVisible();
  // The piece's clock starts once the instruments are ready (up to a few seconds after the
  // press): its 40 seconds count from then, which is when Stop appears.
  const started = await now(page);
  expect(started - pressed).toBeLessThan(6_000);
  await expect(stopButton).toHaveCount(0, { timeout: 45_000 });
  await page.waitForTimeout(500); // the second release
  const deadline = started + 41_000; // a second's grace for the page, as for ADMI's own sound
  const all = await sentSince(page, started);
  const ons = all.filter(isOn);
  expect(ons.length).toBeGreaterThan(0);
  for (const on of ons) {
    expect(on.at).toBeLessThanOrEqual(deadline);
    const ch = on.d[0] & 0x0f;
    expect(all.some((m) => isOff(m) && (m.d[0] & 0x0f) === ch && m.d[1] === on.d[1] && m.at >= on.at)).toBe(true);
  }
  // Expression: 0 on every channel that had any, by the end time.
  const lastExpr = new Map<number, Sent>();
  for (const m of all.filter((x) => isCc(x, 11))) lastExpr.set(m.d[0] & 0x0f, m);
  expect(lastExpr.size).toBeGreaterThan(0);
  for (const m of lastExpr.values()) {
    expect(m.d[2]).toBe(0);
    expect(m.at).toBeLessThanOrEqual(deadline);
  }
  expect(pageErrors(page)).toEqual([]);
});

// ---- Phase 2: sound choices carry over ----

const lastCc = async (page: Page, since: number, cc: number, channel: number): Promise<number | undefined> =>
  (await sentSince(page, since)).filter((m) => isCc(m, cc) && (m.d[0] & 0x0f) + 1 === channel).at(-1)?.d[2];

test('picking Harp on a card switches that channel’s Ableton chain (CC 30 = 48)', async ({ page }) => {
  await openLaptopBoard(page);
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await setUpAbleton(page);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(async () => (await sentSince(page, 0)).filter(isOn).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Sound' }).click();
  const t = await now(page);
  await page.getByRole('row', { name: /^Red: Melody/ }).getByRole('combobox', { name: 'Sound' }).selectOption('harp');
  await expect.poll(() => lastCc(page, t, 30, 1), { timeout: 5_000 }).toBe(48);
  await page.getByRole('button', { name: 'More for Red' }).click();
  await expect(page.getByText(/Ableton sound: Harp \(chain 7\)/).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test('changing World switches every channel without its own sound', async ({ page }) => {
  await openLaptopBoard(page);
  // Sounds change off (a new player's default): a changing colour would keep its own sound.
  await page.getByRole('group', { name: 'Sounds change' }).getByRole('radio', { name: 'Off' }).click();
  await pickColour(page, 'Red');
  await place(page, [[3, 1]]);
  await setUpAbleton(page);
  await page.getByRole('button', { name: '▶ Play' }).first().click();
  await expect.poll(async () => (await sentSince(page, 0)).filter(isOn).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Sound' }).click();
  const t = await now(page);
  await page.getByRole('radiogroup', { name: 'Sound world' }).getByRole('radio', { name: 'Ambient' }).click();
  for (const ch of [1, 2, 3, 10, 11, 12, 13]) await expect.poll(() => lastCc(page, t, 30, ch), { timeout: 5_000 }).toBe(16);
});

test('the AI line says when Extra notes and Sounds change are both off', async ({ page }) => {
  await openLaptopBoard(page);
  const line = page.getByText(/AI: Extra notes off · Sounds change off/);
  // A new player starts with both off: what they hear is their own counters.
  await expect(line.first()).toBeVisible();
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'A few' }).click();
  await expect(line).toHaveCount(0);
  await page.getByRole('group', { name: 'Extra notes' }).getByRole('radio', { name: 'Off' }).click();
  await expect(line.first()).toBeVisible();
});

test('Ableton mode asks to check the band and Extra notes tracks', async ({ page }) => {
  await openLaptopBoard(page);
  await setUpAbleton(page);
  await expect(page.getByText(/Extra notes play on channel 13 and the band on 11 and 12/).first()).toBeVisible();
  await pieceStep(page, 'Ending & check');
  await expect(page.getByText(/tracks for the band \(11, 12\) and Extra notes \(13\)/)).toBeVisible();
});
