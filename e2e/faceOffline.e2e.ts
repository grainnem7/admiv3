import { test, expect } from '@playwright/test';
import { openLaptopBoard, pageErrors } from './app';

/**
 * The face check that reinforces the hat starts with no internet in the page (owner, 7 Nov
 * 2026: the hat must be ready for a show). The engine comes from the installed package and
 * the model from the laptop's copy, both through ADMI's own server (src/tracking/mediapipeFiles.ts).
 * The server fetches the model from Google once, the first time, if it has no copy yet.
 */
test.use({ launchOptions: { args: ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

test('the face check starts from ADMI’s own server, with the internet cut off from the page', async ({ page }) => {
  test.setTimeout(180_000);
  const outside: string[] = [];
  await page.route(/jsdelivr|googleapis|gstatic/, (route) => { outside.push(route.request().url()); return route.abort(); });
  const local: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/mediapipe/')) local.push(new URL(r.url()).pathname); });
  await openLaptopBoard(page);
  await page.getByRole('tab', { name: 'Cap' }).click();
  await page.getByRole('switch', { name: 'Control with the red cap' }).click();
  await page.getByRole('button', { name: 'More hat settings' }).click();
  await expect(page.getByRole('switch', { name: /Check it is on the head/ })).toBeChecked();
  await expect(page.getByText('Face check on: only a red patch on the head counts, and the face bridges moments when the cap is hidden.')).toBeVisible({ timeout: 150_000 });
  expect(outside).toEqual([]);
  expect(local).toEqual(expect.arrayContaining(['/mediapipe/wasm/vision_wasm_internal.wasm', '/mediapipe/models/face_landmarker.task']));
  expect(pageErrors(page)).toEqual([]);
});
