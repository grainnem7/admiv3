import { expect, type Page } from '@playwright/test';

/**
 * Open the Board Sequencer on the laptop board with four ready-made colours, cut off
 * from the server's copy of saved work so every test starts from nothing.
 */
export async function openLaptopBoard(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { admiErrors?: string[] }).admiErrors = errors;
  // No copy on the laptop for tests: nothing restored from it, nothing written to it.
  await page.route('**/admi-store**', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 404, body: '' })
    : route.fulfill({ status: 204, body: '' })));
  await page.goto('/');
  await page.getByRole('button', { name: /Board Sequencer/ }).click();
  await page.getByRole('button', { name: /Laptop board: play on the laptop/ }).click();
  await page.getByRole('button', { name: 'Add four colours' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Counter to put down' })).toBeVisible();
}

/** Pick a colour above the laptop board ("Red", "Blue", "Yellow", "Green"). */
export async function pickColour(page: Page, colour: string): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Counter to put down' }).getByRole('radio', { name: new RegExp(colour) }).click();
}

/** Click squares on the laptop board: row counted from the bottom, step from the left (both from 1). */
export async function place(page: Page, squares: [row: number, step: number][]): Promise<void> {
  const grid = page.getByRole('grid', { name: /Laptop board/ });
  for (const [row, step] of squares) {
    await grid.getByRole('button', { name: new RegExp(`^Row ${row} from the bottom, step ${step}(:|$)`) }).click();
  }
}

/** How many notes the session log has counted (the "Save session (N notes)" button). */
export async function notesPlayed(page: Page): Promise<number> {
  const text = await page.getByRole('button', { name: /Save the session log/ }).textContent();
  return Number(/\((\d+) notes?\)/.exec(text ?? '')?.[1] ?? 0);
}

export function pageErrors(page: Page): string[] {
  return (page as Page & { admiErrors?: string[] }).admiErrors ?? [];
}

/** Open Make a piece at a step: 'Loops', 'Scenes' or 'Ending & check'. */
export async function pieceStep(page: Page, step: 'Loops' | 'Scenes' | 'Ending & check'): Promise<void> {
  await page.getByRole('button', { name: 'Make a piece', exact: true }).click();
  await page.getByRole('navigation', { name: 'Make a piece: steps' }).getByRole('button', { name: new RegExp(step.replace('&', '&')) }).click();
}

/** Make a piece → Scenes → Make my plan (four scenes over the length). */
export async function makePlan(page: Page): Promise<void> {
  await pieceStep(page, 'Scenes');
  await page.getByRole('button', { name: /Make my plan/ }).click();
}

