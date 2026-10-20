import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end tests of the Board Sequencer in a real browser, on the laptop board (no
 * camera needed). `npm run test:e2e`.
 *
 * The test server keeps its "copy on this laptop" in a fresh temporary folder, never in
 * .admi-data: a test must never be able to replace a player's real loops. Each test also
 * runs in a fresh browser profile and is cut off from that copy (see e2e/app.ts).
 */
const PORT = 3105;
const dataDir = process.env.ADMI_E2E_DATA ?? mkdtempSync(join(tmpdir(), 'admi-e2e-'));
process.env.ADMI_E2E_DATA = dataDir; // the same folder for the workers that re-read this file

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ADMI_DATA_DIR: dataDir },
  },
});
