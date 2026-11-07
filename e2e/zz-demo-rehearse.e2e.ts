import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { openLaptopBoard } from './app';

/**
 * A probe, not a check (Rising Light v2, D8): a rehearsal of the demo piece with Magenta on,
 * its sound to a fake MIDI port (Ableton as the sound, so the browser has only the AI to
 * think about). Each four passes of a scene with extra notes asks Magenta for an idea, and
 * the demo player keeps it. The piece is played again (at most four times in all) until
 * every four passes has its idea: a kept one replays without asking, so only the missing
 * ones are asked for. Then the players are written out as a backup file for
 * scripts/freeze-demo-ideas.mjs. Run on its own:
 *
 *   REHEARSE_DIR=some/folder npx playwright test e2e/zz-demo-rehearse.e2e.ts
 */

const DIR = process.env.REHEARSE_DIR ?? '/tmp/rehearse';
const PLAYERS_KEY = 'admi-board-players';
const PIECE_MS = 430_000;
const RUNS = 4;

async function fakeMidi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const output = {
      id: 'fake-admi', name: 'ADMIOutput', manufacturer: 'test', type: 'output', state: 'connected', connection: 'open', version: '1',
      onstatechange: null,
      send() { /* heard by no one */ },
      clear() { /* nothing queued */ }, open: async () => output, close: async () => output,
    };
    const access = { inputs: new Map(), outputs: new Map([[output.id, output]]), onstatechange: null, sysexEnabled: false };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
  });
}

interface SceneIdeas { id: string; name: string; ideas: number; fill: number; at: number }

/** The demo player's scenes as saved: how many ideas each has kept, and its extra notes. */
async function keptIdeas(page: Page): Promise<SceneIdeas[]> {
  return page.evaluate((key) => {
    const players = JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string; settings?: { scenes?: { id: string; name: string; at?: number; aiIdeas?: unknown[]; settings?: { fillAmount?: number } }[] } }[];
    const demo = players.find((p) => p.id === 'demo');
    return (demo?.settings?.scenes ?? []).map((s) => ({ id: s.id, name: s.name, ideas: s.aiIdeas?.length ?? 0, fill: s.settings?.fillAmount ?? 0, at: s.at ?? 0 }));
  }, PLAYERS_KEY);
}

/** The demo's four passes, in seconds (a pass is 8 beats at 87 BPM), and when its Big finish begins (pass 72). */
const FOUR_PASSES_SEC = (4 * 8 * 60) / 87;
const ENDING_SEC = 72 * (8 * 60) / 87;
/** Four passes to an idea: a scene with extra notes wants one for every four passes it lasts. */
const wanted = (s: SceneIdeas, i: number, all: SceneIdeas[]): number =>
  (s.fill > 0 ? Math.max(1, Math.round(((all[i + 1]?.at ?? ENDING_SEC) - s.at) / FOUR_PASSES_SEC)) : 0);

test('rehearse: the demo piece with Magenta on, until every four passes has its idea', async ({ page, context }) => {
  test.setTimeout(RUNS * PIECE_MS + 240_000);
  let magentaRequests = 0;
  context.on('request', (r) => { if (r.url().includes('magentadata')) magentaRequests += 1; });
  await fakeMidi(page);
  await openLaptopBoard(page);
  // The tests' helper keeps Magenta's models out; a rehearsal needs them, from the internet.
  await page.unroute('**/magentadata/**');
  await page.getByRole('tab', { name: 'Connections' }).click();
  await page.getByRole('radiogroup', { name: 'Sound from' }).getByRole('radio', { name: 'Ableton' }).click();
  await page.getByRole('combobox', { name: 'MIDI port' }).selectOption({ label: 'ADMIOutput' });
  await page.getByRole('button', { name: /^Player: Test/ }).click();
  await page.getByRole('region', { name: 'Who\'s playing?' }).getByRole('button', { name: '▶ Open the demo piece' }).click();
  await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
  await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
  for (let run = 1; run <= RUNS; run++) {
    if (run > 1) {
      // A fresh page: Magenta's memory of its answers is cleared (an answer fitted to no notes
      // would otherwise come back empty again); the kept ideas are saved, so they stay.
      await page.reload();
      await page.getByRole('button', { name: /Board Sequencer/ }).click();
      const laptop = page.getByRole('button', { name: /Laptop board: play on the laptop/ });
      if (await laptop.isVisible()) await laptop.click();
      await expect(page.getByRole('button', { name: /^Player: Demo piece/ })).toBeVisible();
      await page.getByRole('button', { name: /^Show: the board, the clock/ }).click();
    }
    await page.getByRole('button', { name: '▶ Start the piece' }).click();
    // What the piece is doing every 20 s: the scene on, anything said about keeping time or the AI.
    for (let t = 0; t < PIECE_MS; t += 20_000) {
      await page.waitForTimeout(20_000);
      const said = await page.evaluate(() => document.body.innerText.split(String.fromCharCode(10))
        .filter((l) => /^Now:|falling behind|paused/i.test(l) && l.length < 120).slice(0, 3).join(' | '));
      const kept = (await keptIdeas(page)).reduce((n, s) => n + s.ideas, 0);
      console.log(`run ${run}, ${t / 1000 + 20} s: ideas kept ${kept} · ${said}`);
    }
    const stop = page.getByRole('button', { name: '■ Stop' }).first();
    if (await stop.isVisible()) await stop.click();
    await page.waitForTimeout(3000);
    const scenes = await keptIdeas(page);
    const short = scenes.filter((s, i) => s.ideas < wanted(s, i, scenes));
    console.log(`Run ${run}: ${scenes.map((s) => `${s.name} ${s.ideas}`).join(', ')}; still to come: ${short.map((s) => s.name).join(', ') || 'none'}; Magenta files fetched so far: ${magentaRequests}`);
    if (short.length === 0) break;
  }
  const players = await page.evaluate((key) => localStorage.getItem(key) ?? '[]', PLAYERS_KEY);
  writeFileSync(`${DIR}/backup.json`, JSON.stringify({ app: 'admi-board', version: 1, savedAt: Date.now(), keys: { [PLAYERS_KEY]: players } }));
  console.log(`Backup written to ${DIR}/backup.json`);
});
