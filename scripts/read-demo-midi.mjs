#!/usr/bin/env node
/**
 * Read what the demo piece sent over MIDI (Rising Light, task C7), from the probe's log:
 *
 *   MIDI_DIR=some/folder npx playwright test e2e/zz-demo-midi.e2e.ts
 *   node scripts/read-demo-midi.mjs some/folder/demo.json [another/demo.json]
 *
 * One file: pass by pass, which tracks played how many notes, and their ranges; any note
 * left without an off; when "falling behind" showed. Two files: whether the two runs sent
 * the same notes (the determinism the owner asked for), track by track.
 */
import { readFileSync } from 'node:fs';

const BPM = 87;
const PASS_SEC = (8 * 60) / BPM;
const TRACK = {
  1: 'Melody', 2: 'Bass', 3: 'Chords', 4: 'Loop 1', 5: 'Loop 2', 6: 'Loop 3', 7: 'Loop 4', 8: 'Loop 5', 9: 'Loop 6',
  10: 'Drums', 11: 'Band chords', 12: 'Band bass', 13: 'Extra notes', 14: 'Melody 2', 15: 'Melody 3', 16: 'Whole',
};
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (n) => `${NOTE[n % 12]}${Math.floor(n / 12) - 1}`;

/** Every note on and off, with its time from the start in seconds (the time it was meant to sound). */
export function notesOf(file) {
  const { t0, log, behind } = JSON.parse(readFileSync(file, 'utf8'));
  const events = [];
  for (const [, at, status, d1, d2] of log) {
    const kind = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    if (kind !== 0x90 && kind !== 0x80) continue;
    const on = kind === 0x90 && d2 > 0;
    events.push({ sec: (at - t0) / 1000, channel, note: d1, velocity: on ? d2 : 0, on });
  }
  events.sort((a, b) => a.sec - b.sec);
  return { events, behind: (behind ?? []).map((t) => (t - t0) / 1000) };
}

/** Notes still on at the end: an on with no off after it. */
export function hangingNotes(events) {
  const on = new Map();
  for (const e of events) {
    const k = `${e.channel}:${e.note}`;
    on.set(k, (on.get(k) ?? 0) + (e.on ? 1 : -1));
  }
  return [...on.entries()].filter(([, n]) => n > 0).map(([k]) => k);
}

function report(file) {
  const { events, behind } = notesOf(file);
  const ons = events.filter((e) => e.on);
  const first = ons[0]?.sec ?? 0;
  console.log(`\n${file}: ${ons.length} notes; first at ${first.toFixed(2)} s; last at ${(ons.at(-1)?.sec ?? 0).toFixed(1)} s`);
  const passes = new Map();
  for (const e of ons) {
    const pass = Math.floor((e.sec - first + 0.05) / PASS_SEC);
    if (!passes.has(pass)) passes.set(pass, new Map());
    const byTrack = passes.get(pass);
    const t = byTrack.get(e.channel) ?? { n: 0, lo: 127, hi: 0 };
    t.n += 1; t.lo = Math.min(t.lo, e.note); t.hi = Math.max(t.hi, e.note);
    byTrack.set(e.channel, t);
  }
  for (const [pass, byTrack] of [...passes.entries()].sort((a, b) => a[0] - b[0])) {
    const parts = [...byTrack.entries()].sort((a, b) => a[0] - b[0])
      .map(([ch, t]) => `${TRACK[ch] ?? ch} ${t.n}${ch === 10 ? '' : ` (${nameOf(t.lo)}-${nameOf(t.hi)})`}`);
    console.log(`  pass ${String(pass).padStart(2)} ${(pass * PASS_SEC).toFixed(0).padStart(4)} s: ${parts.join(', ')}`);
  }
  const hanging = hangingNotes(events);
  console.log(`  notes left without an off: ${hanging.length === 0 ? 'none' : hanging.join(', ')}`);
  console.log(`  "falling behind" shown: ${behind.length === 0 ? 'never' : behind.map((s) => `${s.toFixed(0)} s`).join(', ')}`);
  return { events, first };
}

/** Two runs, track by track: the same notes, in the same order, at the same places in the beat? */
function compare(a, b) {
  console.log('\nThe two runs, track by track (same notes, same order, within 30 ms):');
  const channels = [...new Set([...a.events, ...b.events].map((e) => e.channel))].sort((x, y) => x - y);
  for (const ch of channels) {
    const one = a.events.filter((e) => e.on && e.channel === ch).map((e) => ({ ...e, sec: e.sec - a.first }));
    const two = b.events.filter((e) => e.on && e.channel === ch).map((e) => ({ ...e, sec: e.sec - b.first }));
    let same = one.length === two.length;
    let firstDiff = -1;
    for (let i = 0; i < Math.min(one.length, two.length); i++) {
      if (one[i].note !== two[i].note || one[i].velocity !== two[i].velocity || Math.abs(one[i].sec - two[i].sec) > 0.03) {
        same = false; firstDiff = i; break;
      }
    }
    const where = firstDiff >= 0 ? `; first difference at ${one[firstDiff].sec.toFixed(1)} s` : '';
    console.log(`  ${(TRACK[ch] ?? String(ch)).padEnd(12)} ${one.length} and ${two.length} notes: ${same ? 'the same' : `different${where}`}`);
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Which log? node scripts/read-demo-midi.mjs demo.json [another-demo.json]');
  process.exit(1);
}
const runs = files.map(report);
if (runs.length === 2) compare(runs[0], runs[1]);
