// Screenshots for the rehearsal guide (docs/rehearsal-setup-guide.html).
// Runs the app on the laptop board against a throwaway data folder and photographs each
// step. Usage: start a server with ADMI_DATA_DIR set to a temp folder, then
//   node scripts/capture-guide-shots.mjs http://localhost:3006 <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3006';
const out = process.argv[3] ?? 'docs/guide-shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
// No copy on the laptop: start from nothing, save nothing there.
await page.route('**/admi-store**', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ status: 204, body: '' })));

const shot = async (name, locator) => {
  // No focus ring from the last click in the picture.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  if (locator) {
    // The side panel scrolls; in a tall window a whole section fits without scrolling.
    await page.setViewportSize({ width: 1440, height: 3000 });
    await page.waitForTimeout(500);
    await locator.screenshot({ path: `${out}/${name}.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
  } else {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  console.log('shot', name);
};
const colour = (name) => page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { name: new RegExp(name) }).click();
const place = async (squares) => {
  const grid = page.getByRole('grid', { name: /Laptop board/ }).last(); // in Show, the full-screen board is the last one
  for (const [row, step] of squares) await grid.getByRole('button', { name: new RegExp(`^Row ${row} from the bottom, step ${step}(:|$)`) }).click();
};
const clear = () => page.getByRole('button', { name: 'Clear the board' }).click();
const saveNext = async (slot, name) => {
  await page.getByRole('button', { name: 'Save the board here' }).first().click();
  await page.getByRole('textbox', { name: `Name of loop ${slot}` }).fill(name);
};
const loopsStep = page.getByRole('region', { name: '1 · Loops' });
const scenesStep = page.getByRole('region', { name: '2 · Scenes' });
const endingStep = page.getByRole('region', { name: /3 · Ending/ });

await page.goto(base);
await page.getByRole('button', { name: /Board Sequencer/ }).click({ timeout: 60_000 });
await page.getByRole('button', { name: /Laptop board: play on the laptop/ }).click();
await page.getByRole('button', { name: 'Add four colours' }).click();
await page.waitForTimeout(800);
await shot('00-play');

await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
await page.waitForTimeout(500);
await shot('01-make-a-piece');

// Loop 1: Bed.
await colour('Yellow');
await place([[3, 1], [3, 5]]);
await shot('02-counters-down');
await saveNext(1, 'Bed');
await shot('03-saved-named', loopsStep);
await clear();
await colour('Blue'); await place([[1, 1], [2, 5]]); await saveNext(2, 'Pulse'); await clear();
await colour('Green'); await place([[4, 1]]); await saveNext(3, 'Beat'); await clear();
await colour('Green'); await place([[7, 1]]); await saveNext(4, 'Beat+'); await clear();
await colour('Red'); await place([[5, 1], [7, 3], [6, 5], [8, 7]]); await saveNext(5, 'Shine'); await clear();
await shot('04-loops-saved', loopsStep);

await page.getByRole('button', { name: 'Edit the notes of loop 6' }).click();
await page.waitForTimeout(400);
await shot('05-draw', page.getByRole('dialog'));
await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();

// Step 2.
await page.getByRole('button', { name: /Next: Scenes/ }).click();
await shot('06-scenes-empty', scenesStep);
await page.getByRole('button', { name: /Make my plan/ }).click();
await shot('07-scenes-plan', scenesStep);
await page.getByRole('button', { name: /1:30 · Build/ }).click();
await shot('08-scene-editor', scenesStep);
await page.getByRole('button', { name: /1:30 · Build/ }).click();

// Step 3.
await page.getByRole('button', { name: /Next: Ending & check/ }).click();
await page.getByRole('radio', { name: /Final chord/ }).click();
await shot('09-ending', endingStep);

// The iPad settings (Play → Connections).
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.getByRole('tab', { name: 'Connections' }).click();
await page.getByRole('checkbox', { name: 'iPad controls' }).check();
await page.getByRole('checkbox', { name: 'End piece' }).check();
await page.waitForTimeout(500);
await shot('10-ipad-settings', page.getByRole('group', { name: 'iPad controls' }));
const code = await page.evaluate(() => localStorage.getItem('admi-remote-code'));

// Show.
await page.getByRole('button', { name: /Show: the board/ }).click();
await page.waitForTimeout(600);
await shot('11-show-ready');
await page.getByRole('button', { name: '▶ Start the piece' }).click();
await page.waitForTimeout(4000);
await place([[5, 2]]);
await page.waitForTimeout(2500);
await shot('12-show-playing');

const ipad = await context.newPage();
await ipad.setViewportSize({ width: 1180, height: 820 });
await ipad.goto(`${base}/?remote=${code}`);
await ipad.waitForTimeout(3000);
await ipad.screenshot({ path: `${out}/13-ipad.png` });
console.log('shot 13-ipad');

await browser.close();
