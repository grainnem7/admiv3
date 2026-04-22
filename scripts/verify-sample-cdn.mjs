#!/usr/bin/env node
/**
 * verify-sample-cdn.mjs
 *
 * Fetches one representative sample URL per nbrosowsky instrument we
 * reference in SAMPLE_CONFIGS and asserts HTTP 200. Run before releases
 * to catch CDN breakage. Not part of `npm test` — external network hit.
 *
 * Usage:  node scripts/verify-sample-cdn.mjs
 */

const CHECKS = [
  // [label, url]
  ['salamander-piano',        'https://tonejs.github.io/audio/salamander/A4.mp3'],
  ['nbrosowsky/violin',       'https://nbrosowsky.github.io/tonejs-instruments/samples/violin/A4.mp3'],
  ['nbrosowsky/cello',        'https://nbrosowsky.github.io/tonejs-instruments/samples/cello/A3.mp3'],
  ['nbrosowsky/contrabass',   'https://nbrosowsky.github.io/tonejs-instruments/samples/contrabass/A2.mp3'],
  ['nbrosowsky/clarinet',     'https://nbrosowsky.github.io/tonejs-instruments/samples/clarinet/D4.mp3'],
  ['nbrosowsky/french-horn',  'https://nbrosowsky.github.io/tonejs-instruments/samples/french-horn/A3.mp3'],
  ['nbrosowsky/tuba',         'https://nbrosowsky.github.io/tonejs-instruments/samples/tuba/D3.mp3'],
  ['nbrosowsky/harp',         'https://nbrosowsky.github.io/tonejs-instruments/samples/harp/A4.mp3'],
  ['nbrosowsky/guitar-nylon', 'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-nylon/A4.mp3'],
  ['nbrosowsky/organ',        'https://nbrosowsky.github.io/tonejs-instruments/samples/organ/A3.mp3'],
];

let failures = 0;

for (const [label, url] of CHECKS) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      console.log(`OK   ${label.padEnd(26)} ${url}`);
    } else {
      console.error(`FAIL ${label.padEnd(26)} ${res.status} ${url}`);
      failures++;
    }
  } catch (err) {
    console.error(`ERR  ${label.padEnd(26)} ${err.message} ${url}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} sample URL(s) failed verification.`);
  process.exit(1);
} else {
  console.log(`\nAll ${CHECKS.length} sample URLs reachable.`);
}
