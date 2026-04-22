#!/usr/bin/env node
/**
 * verify-sample-cdn.mjs
 *
 * Fetches EVERY sample URL declared in SAMPLE_CONFIGS (mirrored here as a
 * hardcoded list) and asserts HTTP 200.  Run before releases to catch CDN
 * breakage. Not part of `npm test` — external network hit.
 *
 * Usage:  node scripts/verify-sample-cdn.mjs
 *         npm run verify:samples
 *
 * IMPORTANT: Keep this list in sync with SAMPLE_CONFIGS in
 *   src/songs/voices/SamplerPlayer.ts.
 * Each entry corresponds to exactly one fetched URL.
 */

const CHECKS = [
  // ── Salamander piano (tonejs.github.io) ─────────────────────────────────
  ['salamander-piano A3',          'https://tonejs.github.io/audio/salamander/A3.mp3'],
  ['salamander-piano A4',          'https://tonejs.github.io/audio/salamander/A4.mp3'],
  ['salamander-piano A5',          'https://tonejs.github.io/audio/salamander/A5.mp3'],

  // ── Strings (nbrosowsky) ─────────────────────────────────────────────────
  ['violin A3',                    'https://nbrosowsky.github.io/tonejs-instruments/samples/violin/A3.mp3'],
  ['violin A4',                    'https://nbrosowsky.github.io/tonejs-instruments/samples/violin/A4.mp3'],
  ['violin A5',                    'https://nbrosowsky.github.io/tonejs-instruments/samples/violin/A5.mp3'],

  ['cello A2',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/cello/A2.mp3'],
  ['cello A3',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/cello/A3.mp3'],
  ['cello A4',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/cello/A4.mp3'],

  // contrabass: only A2 is reachable (A1.mp3 → 404)
  ['contrabass A2',                'https://nbrosowsky.github.io/tonejs-instruments/samples/contrabass/A2.mp3'],

  // ── Winds (nbrosowsky) ───────────────────────────────────────────────────
  ['clarinet D3',                  'https://nbrosowsky.github.io/tonejs-instruments/samples/clarinet/D3.mp3'],
  ['clarinet D4',                  'https://nbrosowsky.github.io/tonejs-instruments/samples/clarinet/D4.mp3'],
  ['clarinet D5',                  'https://nbrosowsky.github.io/tonejs-instruments/samples/clarinet/D5.mp3'],

  // french-horn: only A3 is reachable (A4.mp3 → 404)
  ['french-horn A3',               'https://nbrosowsky.github.io/tonejs-instruments/samples/french-horn/A3.mp3'],

  ['tuba Bb1 (As1.mp3)',           'https://nbrosowsky.github.io/tonejs-instruments/samples/tuba/As1.mp3'],
  ['tuba Bb2 (As2.mp3)',           'https://nbrosowsky.github.io/tonejs-instruments/samples/tuba/As2.mp3'],
  ['tuba D3',                      'https://nbrosowsky.github.io/tonejs-instruments/samples/tuba/D3.mp3'],

  // ── Plucked (nbrosowsky) ─────────────────────────────────────────────────
  // harp: only A4 is reachable (A3.mp3 and A5.mp3 → 404)
  ['harp A4',                      'https://nbrosowsky.github.io/tonejs-instruments/samples/harp/A4.mp3'],

  ['guitar-nylon A3',              'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-nylon/A3.mp3'],
  ['guitar-nylon A4',              'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-nylon/A4.mp3'],
  ['guitar-nylon A5',              'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-nylon/A5.mp3'],

  // ── Keys (nbrosowsky) ────────────────────────────────────────────────────
  ['organ A2',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/organ/A2.mp3'],
  ['organ A3',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/organ/A3.mp3'],
  ['organ A4',                     'https://nbrosowsky.github.io/tonejs-instruments/samples/organ/A4.mp3'],
];

let failures = 0;

for (const [label, url] of CHECKS) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      console.log(`OK   ${label.padEnd(30)} ${url}`);
    } else {
      console.error(`FAIL ${label.padEnd(30)} ${res.status} ${url}`);
      failures++;
    }
  } catch (err) {
    console.error(`ERR  ${label.padEnd(30)} ${err.message} ${url}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} sample URL(s) failed verification.`);
  process.exit(1);
} else {
  console.log(`\nAll ${CHECKS.length} sample URLs reachable.`);
}
