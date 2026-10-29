import { test, expect, type Page } from '@playwright/test';
import type { LoudnessRequest, LoudnessResult } from '../src/dev/loudnessTypes';

/**
 * How loud the board is, measured offline (harmony spec, stage 3): the engine plays a fixed
 * test board (all four parts, a new player's tunes) into an OfflineAudioContext, and the mix
 * is measured as K-weighted loudness (BS.1770, LUFS, ungated) over the passes the band plays
 * in, with the sample peak at the studio limiter's input. See src/dev/loudnessHarness.ts.
 *
 *  - Every sound world measures within a small range of the others (each world's levelDb in
 *    soundWorlds.ts was set from these measurements).
 *  - Energy raises the level, and Energy 5 at its loudest stays under the limiter.
 *  - The plan's quiet opening is quieter than its build.
 */

type Measure = (req: LoudnessRequest) => Promise<LoudnessResult>;

async function openHarness(page: Page): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[page] ${m.text()}`); });
  await page.goto('/e2e/harness/loudness.html');
  await page.waitForFunction(() => (window as unknown as { __admiLoudness?: { ready: boolean } }).__admiLoudness?.ready === true, null, { timeout: 60_000 });
}

async function measure(page: Page, req: Partial<LoudnessRequest>): Promise<LoudnessResult> {
  const full: LoudnessRequest = { world: 'warm', band: 'gentle', jobs: 'default', energy: 0, fill: 0, evolve: 0, passes: 4, ...req };
  return page.evaluate((r) => (window as unknown as { __admiLoudness: { measure: Measure } }).__admiLoudness.measure(r), full);
}

const WORLDS = ['warm', 'lofi', 'ambient', 'electronic'] as const;
const fmt = (r: LoudnessResult): string => `${r.lufs.toFixed(1)} LUFS, mix peak ${r.peakDb.toFixed(1)} dBFS, limiter in ${r.limiterInPeakDb.toFixed(1)} dBFS (${r.notes} notes: ${r.bandNotes} band, ${r.extraNotes} extra; top ${Math.round(r.mixToneHz)} Hz)`;

test('every sound world is about as loud as the others (within 1.5 LU), with the band Quiet and at Full', async ({ page }) => {
  test.setTimeout(400_000);
  await openHarness(page);
  const setups: { name: string; req: Partial<LoudnessRequest> }[] = [
    { name: 'Quiet band', req: { band: 'gentle', jobs: 'default' } },
    { name: 'Full band, all four parts, Sounds change', req: { band: 'full', jobs: 'all', evolve: 0.5 } },
  ];
  for (const setup of setups) {
    const levels: number[] = [];
    for (const world of WORLDS) {
      const r = await measure(page, { ...setup.req, world });
      console.log(`LOUDNESS world=${world} ${setup.name}, Energy off: ${fmt(r)}`);
      expect(r.notes).toBeGreaterThan(20);
      levels.push(r.lufs);
    }
    const range = Math.max(...levels) - Math.min(...levels);
    console.log(`LOUDNESS range across worlds (${setup.name}): ${range.toFixed(2)} LU`);
    expect(range).toBeLessThanOrEqual(1.5);
  }
});

test('Energy raises the level, and Energy 5 at its loudest stays under the limiter', async ({ page }) => {
  test.setTimeout(400_000);
  await openHarness(page);
  // The plan's Open: the band at Full with all four parts, extra notes and Sounds change.
  const open = { band: 'full' as const, jobs: 'all' as const, fill: 0.4, evolve: 0.5 };
  const byEnergy: number[] = [];
  for (const energy of [1, 3, 5]) {
    const r = await measure(page, { ...open, world: 'warm', energy });
    console.log(`LOUDNESS world=warm Open energy=${energy}: ${fmt(r)}`);
    byEnergy.push(r.lufs);
  }
  expect(byEnergy[1]).toBeGreaterThan(byEnergy[0]);
  expect(byEnergy[2]).toBeGreaterThan(byEnergy[1]);
  // At 5, in every world: at least 1 dB under the studio limiter's ceiling (-0.3 dBFS), and
  // the mix itself under the classic limiter's (-2 dBFS).
  for (const world of WORLDS) {
    const r = await measure(page, { ...open, world, energy: 5 });
    console.log(`LOUDNESS world=${world} Open energy=5: ${fmt(r)}`);
    expect(r.limiterInPeakDb).toBeLessThanOrEqual(-1.3);
    expect(r.peakDb).toBeLessThanOrEqual(-3);
  }
});

test('the plan’s quiet opening (Ambient, Energy 2) is quieter than its build (Warm, Energy 3)', async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const opening = await measure(page, { world: 'ambient', energy: 2 });
  const build = await measure(page, { world: 'warm', energy: 3, fill: 0.3 });
  console.log(`LOUDNESS opening (Ambient, Quiet, energy 2): ${fmt(opening)}`);
  console.log(`LOUDNESS build (Warm, Quiet, energy 3): ${fmt(build)}`);
  expect(opening.lufs).toBeLessThan(build.lufs);
});
