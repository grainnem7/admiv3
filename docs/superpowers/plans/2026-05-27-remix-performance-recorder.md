# Remix Performance Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a user's live control performance over the song into stacked overdub layers per loop-region section, then play the whole arrangement back, and save/load it.

**Architecture:** A pure `RemixRecorder` buffers timestamped control events while armed (deduping unchanged continuous params); a pure `RemixArranger` stores sections→takes and composites them (last-non-muted-take-wins for continuous params, all percussion fires). `RemixEngine` owns both: its control methods capture when armed, loop-wrap (detected in `renderFrame`) commits a take, and a playback tick applies composited automation through the existing smoothed setters. `localStorage` persists arrangements. `RemixScreen` gets a recorder panel.

**Tech Stack:** TypeScript strict, Tone.js Transport, Vitest + jsdom.

**Deferred to a follow-up (not in this plan):** live overdub *monitoring* — hearing previously-committed takes play back while you record a new pass over the looping section. In v1 prior takes are heard on "Play remix". Adding live monitoring later means applying prior takes each frame during recording while skipping the params the in-progress take is touching (newest-layer-wins), guarded so monitoring playback doesn't re-record.

---

## File structure

**Create:**
- `src/remix/recording/remixRecording.ts` — types (`RemixEvent`, `RemixTake`, `RemixSection`, `RemixArrangement`, `CaptureInput`).
- `src/remix/recording/RemixRecorder.ts` — `RemixRecorder` (capture buffer + take commit).
- `src/remix/recording/RemixArranger.ts` — `RemixArranger` (sections/takes + pure compositing).
- `src/remix/recording/arrangementStore.ts` — localStorage save/load/list.
- `src/__tests__/RemixRecorder.test.ts`, `RemixArranger.test.ts`, `arrangementStore.test.ts`.

**Modify:**
- `src/remix/RemixEngine.ts` — own recorder+arranger; capture hooks; record/playback tick in `renderFrame`; new API.
- `src/__tests__/RemixEngine.test.ts` — recorder/playback tests.
- `src/ui/screens/RemixScreen.tsx` — recorder panel + wiring.

---

## Task 1: Recording types + RemixRecorder

**Files:**
- Create: `src/remix/recording/remixRecording.ts`, `src/remix/recording/RemixRecorder.ts`
- Test: `src/__tests__/RemixRecorder.test.ts`

- [ ] **Step 1: Write the failing test** — `src/__tests__/RemixRecorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RemixRecorder } from '../remix/recording/RemixRecorder';

describe('RemixRecorder', () => {
  it('does nothing when disarmed', () => {
    const r = new RemixRecorder();
    r.capture({ kind: 'percussion', velocity: 0.8 }, 5);
    expect(r.commitTake().events).toEqual([]);
  });

  it('captures events with t relative to section start', () => {
    const r = new RemixRecorder();
    r.arm(4, 8); // section starts at 4s, length 8s
    r.capture({ kind: 'percussion', velocity: 0.8 }, 6); // t = 2
    const take = r.commitTake();
    expect(take.events).toEqual([{ t: 2, kind: 'percussion', velocity: 0.8 }]);
    expect(take.muted).toBe(false);
    expect(typeof take.id).toBe('string');
  });

  it('wraps t into [0,length) when transport passes the section end', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 1 }, 9); // 9 % 8 = 1
    expect(r.commitTake().events[0].t).toBeCloseTo(1, 5);
  });

  it('dedups unchanged continuous params but keeps changes', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 1); // unchanged → dropped
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.9 }, 2); // changed → kept
    const take = r.commitTake();
    expect(take.events.map((e) => (e as { value: number }).value)).toEqual([0.5, 0.9]);
  });

  it('always records every percussion hit (never deduped)', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 0.8 }, 0);
    r.capture({ kind: 'percussion', velocity: 0.8 }, 1);
    expect(r.commitTake().events).toHaveLength(2);
  });

  it('commitTake clears the buffer and resets continuous baseline', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    r.commitTake();
    // still armed for the next cycle; same value should record again (fresh baseline)
    r.capture({ kind: 'stemFilter', stem: 'vocals', value: 0.5 }, 0);
    expect(r.commitTake().events).toHaveLength(1);
  });

  it('events are sorted by t on commit', () => {
    const r = new RemixRecorder();
    r.arm(0, 8);
    r.capture({ kind: 'percussion', velocity: 1 }, 5);
    r.capture({ kind: 'percussion', velocity: 1 }, 2);
    expect(r.commitTake().events.map((e) => e.t)).toEqual([2, 5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test:run -- RemixRecorder` → FAIL (module not found).

- [ ] **Step 3: Implement types** — `src/remix/recording/remixRecording.ts`:

```ts
/**
 * Remix performance-recording data model. A "remix" is the song plus the
 * recorded control performance: per loop-region SECTION, a stack of overdub
 * TAKES, each a list of timestamped control EVENTS. All pure + serializable.
 */
import type { StemId } from '../RemixBaton';

/** A captured control change. `t` is seconds from the section start, in [0,length). */
export type RemixEvent =
  | { t: number; kind: 'stemFilter'; stem: StemId; value: number }
  | { t: number; kind: 'percussion'; velocity: number }
  | { t: number; kind: 'loopSelect'; index: number }
  | { t: number; kind: 'loopEnable'; on: boolean }
  | { t: number; kind: 'loopVolume'; value: number };

/** A capture call (no timestamp — the recorder stamps it). */
export type CaptureInput =
  | { kind: 'stemFilter'; stem: StemId; value: number }
  | { kind: 'percussion'; velocity: number }
  | { kind: 'loopSelect'; index: number }
  | { kind: 'loopEnable'; on: boolean }
  | { kind: 'loopVolume'; value: number };

/** One overdub pass. */
export interface RemixTake {
  id: string;
  muted: boolean;
  events: RemixEvent[];
}

/** A bar-aligned section (mirrors a loop region). */
export interface RemixSection {
  originBar: number;
  lengthBars: number;
  layers: RemixTake[];
}

/** A whole remix performance for one song. */
export interface RemixArrangement {
  songId: string;
  sections: RemixSection[];
}
```

- [ ] **Step 4: Implement RemixRecorder** — `src/remix/recording/RemixRecorder.ts`:

```ts
/**
 * RemixRecorder — buffers timestamped control events while armed. Continuous
 * params (filter/loop) are deduped against the last recorded value so a
 * per-frame stream collapses to change points; percussion (discrete) is always
 * kept. commitTake() returns the buffered events (t-sorted) as a new take and
 * clears the buffer + dedup baseline for the next overdub cycle.
 */
import type { CaptureInput, RemixEvent, RemixTake } from './remixRecording';

const EPS = 0.004; // continuous-value change threshold

function valueOf(input: CaptureInput): number {
  switch (input.kind) {
    case 'stemFilter': return input.value;
    case 'loopVolume': return input.value;
    case 'loopSelect': return input.index;
    case 'loopEnable': return input.on ? 1 : 0;
    case 'percussion': return input.velocity;
  }
}

function paramKey(input: CaptureInput): string {
  return input.kind === 'stemFilter' ? `stemFilter:${input.stem}` : input.kind;
}

export class RemixRecorder {
  private armed = false;
  private buffer: RemixEvent[] = [];
  private sectionStartSec = 0;
  private sectionLengthSec = 0;
  private lastValue = new Map<string, number>();
  private seq = 0;

  arm(sectionStartSec: number, sectionLengthSec: number): void {
    this.armed = true;
    this.sectionStartSec = sectionStartSec;
    this.sectionLengthSec = sectionLengthSec;
    this.buffer = [];
    this.lastValue.clear();
  }

  /** Update section bounds without clearing the buffer (used when advancing). */
  setSection(sectionStartSec: number, sectionLengthSec: number): void {
    this.sectionStartSec = sectionStartSec;
    this.sectionLengthSec = sectionLengthSec;
  }

  disarm(): void {
    this.armed = false;
  }

  isArmed(): boolean {
    return this.armed;
  }

  capture(input: CaptureInput, transportSec: number): void {
    if (!this.armed) return;
    if (input.kind !== 'percussion') {
      const key = paramKey(input);
      const v = valueOf(input);
      const last = this.lastValue.get(key);
      if (last !== undefined && Math.abs(last - v) < EPS) return;
      this.lastValue.set(key, v);
    }
    let t = transportSec - this.sectionStartSec;
    if (this.sectionLengthSec > 0) {
      t = ((t % this.sectionLengthSec) + this.sectionLengthSec) % this.sectionLengthSec;
    }
    this.buffer.push({ t, ...input } as RemixEvent);
  }

  /** Return the buffered events as a take (t-sorted) and reset for the next cycle. */
  commitTake(): RemixTake {
    const events = this.buffer.slice().sort((a, b) => a.t - b.t);
    this.buffer = [];
    this.lastValue.clear();
    return { id: `take-${++this.seq}`, muted: false, events };
  }

  hasBuffered(): boolean {
    return this.buffer.length > 0;
  }
}
```

- [ ] **Step 5: Run test to verify it passes** — `npm run test:run -- RemixRecorder` → PASS.

- [ ] **Step 6: Lint** — `npm run lint` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/remix/recording/remixRecording.ts src/remix/recording/RemixRecorder.ts src/__tests__/RemixRecorder.test.ts
git commit -m "feat(remix): recording data model + RemixRecorder capture buffer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: RemixArranger (sections + compositing)

**Files:**
- Create: `src/remix/recording/RemixArranger.ts`
- Test: `src/__tests__/RemixArranger.test.ts`

- [ ] **Step 1: Write the failing test** — `src/__tests__/RemixArranger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RemixArranger } from '../remix/recording/RemixArranger';
import type { RemixTake } from '../remix/recording/remixRecording';

function take(id: string, events: RemixTake['events'], muted = false): RemixTake {
  return { id, muted, events };
}

describe('RemixArranger', () => {
  it('find-or-creates a section by origin+length and appends takes', () => {
    const a = new RemixArranger('song1');
    a.addTake(0, 8, take('t1', []));
    a.addTake(0, 8, take('t2', []));
    a.addTake(8, 8, take('t3', []));
    const arr = a.getArrangement();
    expect(arr.sections).toHaveLength(2);
    expect(arr.sections[0].layers.map((l) => l.id)).toEqual(['t1', 't2']);
    expect(arr.sections[1].originBar).toBe(8);
  });

  it('composite: last non-muted take wins for continuous params', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.3 }]));
    a.addTake(0, 8, take('t2', [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.9 }]));
    const res = RemixArranger.composite(a.getArrangement().sections[0], 5);
    expect(res.filters.vocals).toBeCloseTo(0.9, 5); // later take wins
  });

  it('composite: only events at-or-before t apply', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [
      { t: 0, kind: 'stemFilter', stem: 'drums', value: 0.2 },
      { t: 4, kind: 'stemFilter', stem: 'drums', value: 0.8 },
    ]));
    expect(RemixArranger.composite(a.getArrangement().sections[0], 3).filters.drums).toBeCloseTo(0.2, 5);
    expect(RemixArranger.composite(a.getArrangement().sections[0], 5).filters.drums).toBeCloseTo(0.8, 5);
  });

  it('composite: muted takes are excluded', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 0, kind: 'stemFilter', stem: 'bass', value: 0.4 }]));
    a.addTake(0, 8, take('t2', [{ t: 0, kind: 'stemFilter', stem: 'bass', value: 0.95 }], true));
    expect(RemixArranger.composite(a.getArrangement().sections[0], 5).filters.bass).toBeCloseTo(0.4, 5);
  });

  it('composite: loop params last-wins', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [
      { t: 0, kind: 'loopEnable', on: true },
      { t: 0, kind: 'loopSelect', index: 1 },
      { t: 0, kind: 'loopVolume', value: 0.6 },
    ]));
    const res = RemixArranger.composite(a.getArrangement().sections[0], 5);
    expect(res.loopEnable).toBe(true);
    expect(res.loopSelect).toBe(1);
    expect(res.loopVolume).toBeCloseTo(0.6, 5);
  });

  it('discreteEventsInWindow returns percussion from all non-muted takes in (from,to]', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', [{ t: 2, kind: 'percussion', velocity: 0.8 }]));
    a.addTake(0, 8, take('t2', [{ t: 2.5, kind: 'percussion', velocity: 0.5 }], true)); // muted
    a.addTake(0, 8, take('t3', [{ t: 2.4, kind: 'percussion', velocity: 0.7 }]));
    const hits = RemixArranger.discreteEventsInWindow(a.getArrangement().sections[0], 1, 3);
    expect(hits.map((h) => (h as { velocity: number }).velocity).sort()).toEqual([0.7, 0.8]);
  });

  it('muteTake and deleteTake mutate the right take', () => {
    const a = new RemixArranger('s');
    a.addTake(0, 8, take('t1', []));
    a.addTake(0, 8, take('t2', []));
    a.muteTake(0, 't1', true);
    expect(a.getArrangement().sections[0].layers[0].muted).toBe(true);
    a.deleteTake(0, 't2');
    expect(a.getArrangement().sections[0].layers.map((l) => l.id)).toEqual(['t1']);
  });

  it('load replaces the arrangement', () => {
    const a = new RemixArranger('s');
    a.load({ songId: 's2', sections: [{ originBar: 4, lengthBars: 4, layers: [] }] });
    expect(a.getArrangement().songId).toBe('s2');
    expect(a.getArrangement().sections[0].originBar).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test:run -- RemixArranger` → FAIL.

- [ ] **Step 3: Implement** — `src/remix/recording/RemixArranger.ts`:

```ts
/**
 * RemixArranger — owns the RemixArrangement (sections → overdub takes) and
 * composites them for playback. Continuous params use last-non-muted-take-wins
 * (a take only stores params the user touched, so untouched params pass
 * through); percussion (discrete) from every non-muted take all fires. Pure
 * compositing — the engine resolves section→time using the song's downbeats.
 */
import type { StemId } from '../RemixBaton';
import type { RemixArrangement, RemixEvent, RemixSection, RemixTake } from './remixRecording';

export interface CompositeResult {
  filters: Partial<Record<StemId, number>>;
  loopSelect?: number;
  loopEnable?: boolean;
  loopVolume?: number;
}

export class RemixArranger {
  private arrangement: RemixArrangement;

  constructor(songId: string) {
    this.arrangement = { songId, sections: [] };
  }

  getArrangement(): RemixArrangement {
    return this.arrangement;
  }

  load(a: RemixArrangement): void {
    this.arrangement = a;
  }

  /** Index of the section with this origin+length, creating it if absent. */
  private ensureSection(originBar: number, lengthBars: number): RemixSection {
    let s = this.arrangement.sections.find(
      (sec) => sec.originBar === originBar && sec.lengthBars === lengthBars,
    );
    if (!s) {
      s = { originBar, lengthBars, layers: [] };
      this.arrangement.sections.push(s);
      this.arrangement.sections.sort((a, b) => a.originBar - b.originBar);
    }
    return s;
  }

  addTake(originBar: number, lengthBars: number, take: RemixTake): void {
    this.ensureSection(originBar, lengthBars).layers.push(take);
  }

  muteTake(sectionIdx: number, takeId: string, muted: boolean): void {
    const take = this.arrangement.sections[sectionIdx]?.layers.find((l) => l.id === takeId);
    if (take) take.muted = muted;
  }

  deleteTake(sectionIdx: number, takeId: string): void {
    const sec = this.arrangement.sections[sectionIdx];
    if (!sec) return;
    sec.layers = sec.layers.filter((l) => l.id !== takeId);
  }

  /** Continuous params at section-relative time `t` (last non-muted take wins). */
  static composite(section: RemixSection, t: number): CompositeResult {
    const res: CompositeResult = { filters: {} };
    for (const take of section.layers) {
      if (take.muted) continue;
      for (const ev of take.events) {
        if (ev.t > t) continue;
        switch (ev.kind) {
          case 'stemFilter': res.filters[ev.stem] = ev.value; break;
          case 'loopSelect': res.loopSelect = ev.index; break;
          case 'loopEnable': res.loopEnable = ev.on; break;
          case 'loopVolume': res.loopVolume = ev.value; break;
          case 'percussion': break; // discrete, handled separately
        }
      }
    }
    return res;
  }

  /** Percussion events with from < t <= to across all non-muted takes. */
  static discreteEventsInWindow(section: RemixSection, fromT: number, toT: number): RemixEvent[] {
    const out: RemixEvent[] = [];
    for (const take of section.layers) {
      if (take.muted) continue;
      for (const ev of take.events) {
        if (ev.kind === 'percussion' && ev.t > fromT && ev.t <= toT) out.push(ev);
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run test:run -- RemixArranger` → PASS.

- [ ] **Step 5: Lint** — `npm run lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/remix/recording/RemixArranger.ts src/__tests__/RemixArranger.test.ts
git commit -m "feat(remix): RemixArranger sections + take compositing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: arrangementStore (localStorage)

**Files:**
- Create: `src/remix/recording/arrangementStore.ts`
- Test: `src/__tests__/arrangementStore.test.ts`

- [ ] **Step 1: Write the failing test** — `src/__tests__/arrangementStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveArrangement, loadArrangementFromStore, listArrangements } from '../remix/recording/arrangementStore';
import type { RemixArrangement } from '../remix/recording/remixRecording';

const A: RemixArrangement = {
  songId: 'song1',
  sections: [{ originBar: 0, lengthBars: 8, layers: [{ id: 't1', muted: false, events: [{ t: 1, kind: 'percussion', velocity: 0.8 }] }] }],
};

beforeEach(() => localStorage.clear());

describe('arrangementStore', () => {
  it('save then load round-trips', () => {
    saveArrangement('my mix', A);
    const loaded = loadArrangementFromStore('song1', 'my mix');
    expect(loaded).toEqual(A);
  });

  it('load returns null for a missing arrangement', () => {
    expect(loadArrangementFromStore('song1', 'nope')).toBeNull();
  });

  it('listArrangements lists names for a song only', () => {
    saveArrangement('a', A);
    saveArrangement('b', A);
    saveArrangement('c', { ...A, songId: 'other' });
    expect(listArrangements('song1').sort()).toEqual(['a', 'b']);
    expect(listArrangements('other')).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test:run -- arrangementStore` → FAIL.

- [ ] **Step 3: Implement** — `src/remix/recording/arrangementStore.ts`:

```ts
/**
 * arrangementStore — persist remix arrangements in localStorage, keyed by
 * songId + a user name. Pure storage wrappers; no UI.
 */
import type { RemixArrangement } from './remixRecording';

const PREFIX = 'remix:arr:';
const key = (songId: string, name: string) => `${PREFIX}${songId}:${name}`;

export function saveArrangement(name: string, a: RemixArrangement): void {
  localStorage.setItem(key(a.songId, name), JSON.stringify(a));
}

export function loadArrangementFromStore(songId: string, name: string): RemixArrangement | null {
  const raw = localStorage.getItem(key(songId, name));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RemixArrangement;
  } catch {
    return null;
  }
}

export function listArrangements(songId: string): string[] {
  const out: string[] = [];
  const p = `${PREFIX}${songId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(p)) out.push(k.slice(p.length));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm run test:run -- arrangementStore` → PASS.

- [ ] **Step 5: Lint** — `npm run lint` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/remix/recording/arrangementStore.ts src/__tests__/arrangementStore.test.ts
git commit -m "feat(remix): localStorage arrangement store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Engine capture + record transport

**Files:**
- Modify: `src/remix/RemixEngine.ts`
- Test: `src/__tests__/RemixEngine.test.ts`

Context: `RemixEngine` already has `this.downbeats: number[]`, `computeLoopRegion(downbeats, originBar, lengthBars)` (returns `{ startSec, endSec } | null`), `getLoopRegion()` (returns `{ startSec, endSec, lengthBars, originBar } | null`), `nudgeLoop(1)`, `this.loopOriginBar`, `this.loopLengthBars`, control methods `setStemFilterNorm`, `triggerPercussion`, `applyBaton`, `applyLoopBaton`, `selectLoop`, and `renderFrame(nowSec)` called every RAF frame. `Tone.getTransport().seconds` is the playback position.

- [ ] **Step 1: Write the failing test** — append to `src/__tests__/RemixEngine.test.ts` (the `tone`/`loadLoopManifest` mocks + `song()` helper already exist):

```ts
describe('RemixEngine recording', () => {
  it('captures stem filter + percussion into a take on section advance', async () => {
    const e = new RemixEngine();
    await e.loadSong(song()); // bpm 120, downbeats [0, 2]
    e.armRecording();
    expect(e.isRecording()).toBe(true);
    e.setStemFilterNorm('vocals', 0.7); // captured (transport at 0)
    e.triggerPercussion(0.5, 0.9);      // captured
    e.advanceSection();                  // commits current take
    const arr = e.getArrangement();
    const allEvents = arr.sections.flatMap((s) => s.layers.flatMap((l) => l.events));
    expect(allEvents.some((ev) => ev.kind === 'stemFilter')).toBe(true);
    expect(allEvents.some((ev) => ev.kind === 'percussion')).toBe(true);
    e.dispose();
  });

  it('does not capture when not recording', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.setStemFilterNorm('vocals', 0.7);
    e.armRecording();
    e.advanceSection();
    const arr = e.getArrangement();
    const allEvents = arr.sections.flatMap((s) => s.layers.flatMap((l) => l.events));
    expect(allEvents).toHaveLength(0); // the pre-arm change wasn't captured
    e.dispose();
  });

  it('disarmRecording stops capture', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.armRecording();
    e.disarmRecording();
    expect(e.isRecording()).toBe(false);
    e.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test:run -- RemixEngine` → FAIL (`armRecording` missing).

- [ ] **Step 3: Add imports + fields** — in `src/remix/RemixEngine.ts`, add imports near the other remix imports:

```ts
import { RemixRecorder } from './recording/RemixRecorder';
import { RemixArranger } from './recording/RemixArranger';
import type { CaptureInput, RemixArrangement } from './recording/remixRecording';
```

Add fields to the class (near `private playing = false;`):

```ts
  private recorder = new RemixRecorder();
  private arranger = new RemixArranger('');
  private songId = '';
  private recSectionOriginBar = 0;
  private recSectionLengthBars: 0 | 4 | 8 | 16 = 8;
  private lastTickSec = 0;
  private playingArrangement = false;
```

- [ ] **Step 4: Initialise arranger on load** — in `loadSong`, right after `Tone.getTransport().bpm.value = song.bpm;` add:

```ts
    this.songId = song.id;
    this.arranger = new RemixArranger(song.id);
    this.recorder.disarm();
    this.playingArrangement = false;
```

- [ ] **Step 5: Add a capture helper + hook the control methods** — add a private helper:

```ts
  private captureNow(input: CaptureInput): void {
    if (this.recorder.isArmed()) this.recorder.capture(input, Tone.getTransport().seconds);
  }
```

Then add capture calls inside the existing methods (do NOT change their existing behaviour, just add a line):

- In `setStemFilterNorm(stem, value)`, after clamping/assigning, add:
  ```ts
    this.captureNow({ kind: 'stemFilter', stem, value: Math.max(0, Math.min(1, value)) });
  ```
- In `applyBaton(out)`, where it sets `state.targetFilterNorm = out.filterNorm;` (the `out.filterNorm !== null` branch), add right after:
  ```ts
    this.captureNow({ kind: 'stemFilter', stem: out.stem, value: out.filterNorm });
  ```
- In `triggerPercussion(timeSec, velocity)`, at the top of the method body add:
  ```ts
    this.captureNow({ kind: 'percussion', velocity });
  ```
- In `selectLoop(i)`, add at the end:
  ```ts
    this.captureNow({ kind: 'loopSelect', index: i });
  ```
- In `applyLoopBaton(out)`, replace the body with capture-aware version:
  ```ts
  applyLoopBaton(out: RemixLoopBatonOutput): void {
    this.setLayerEnabled('loop', out.present);
    this.captureNow({ kind: 'loopEnable', on: out.present });
    if (out.present) {
      this.selectLoop(out.loopIndex);
      this.setLayerVolume('loop', out.volume);
      this.captureNow({ kind: 'loopVolume', value: out.volume });
    }
  }
  ```
  (`selectLoop` already captures `loopSelect`.)

- [ ] **Step 6: Add the record/advance API** — add these methods (e.g. after `getLoopInfo`):

```ts
  /** Current loop region as the section to record into. */
  private currentSectionTimes(): { startSec: number; lengthSec: number } {
    const region = this.getLoopRegion();
    if (region) return { startSec: region.startSec, lengthSec: Math.max(0, region.endSec - region.startSec) };
    return { startSec: 0, lengthSec: this.duration };
  }

  armRecording(): void {
    const { startSec, lengthSec } = this.currentSectionTimes();
    this.recSectionOriginBar = this.loopOriginBar;
    this.recSectionLengthBars = this.loopLengthBars;
    this.recorder.arm(startSec, lengthSec);
    this.lastTickSec = Tone.getTransport().seconds;
  }

  disarmRecording(): void {
    if (this.recorder.hasBuffered()) {
      this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
    }
    this.recorder.disarm();
  }

  isRecording(): boolean {
    return this.recorder.isArmed();
  }

  /** Commit the current take, move the loop to the next region, keep recording there. */
  advanceSection(): void {
    if (this.recorder.hasBuffered()) {
      this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
    }
    this.nudgeLoop(1);
    const { startSec, lengthSec } = this.currentSectionTimes();
    this.recSectionOriginBar = this.loopOriginBar;
    this.recSectionLengthBars = this.loopLengthBars;
    if (this.recorder.isArmed()) this.recorder.arm(startSec, lengthSec);
    this.lastTickSec = Tone.getTransport().seconds;
  }

  getArrangement(): RemixArrangement {
    return this.arranger.getArrangement();
  }
```

- [ ] **Step 7: Drive take-commit on loop wrap in `renderFrame`** — at the top of `renderFrame(nowSec)`, before the existing stem loop, add wrap detection:

```ts
    // Recording: when the looping section wraps (transport jumps back), commit
    // the just-finished cycle as an overdub take and re-arm for the next pass.
    if (this.recorder.isArmed() && nowSec + 1e-3 < this.lastTickSec) {
      if (this.recorder.hasBuffered()) {
        this.arranger.addTake(this.recSectionOriginBar, this.recSectionLengthBars, this.recorder.commitTake());
      }
    }
```

Then at the very END of `renderFrame`, add:

```ts
    this.lastTickSec = nowSec;
```

NOTE: `renderFrame`'s parameter is currently named `_playbackNowSec` and unused. Rename it to `nowSec` and use it as above. Keep the existing `const now = this.ctx.currentTime;` line (that's the audio-clock time for ramps) — do not confuse the two.

- [ ] **Step 8: Run test to verify it passes** — `npm run test:run -- RemixEngine` → PASS (existing + new).

- [ ] **Step 9: Lint + full suite** — `npm run lint` → exit 0; `npm run test:run` → green.

- [ ] **Step 10: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): engine capture hooks + record transport (arm/advance/wrap-commit)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Engine arrangement playback + take ops + load

**Files:**
- Modify: `src/remix/RemixEngine.ts`
- Test: `src/__tests__/RemixEngine.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/__tests__/RemixEngine.test.ts`:

```ts
describe('RemixEngine arrangement playback', () => {
  it('playArrangement applies composited stem filter for the section under the playhead', async () => {
    const e = new RemixEngine();
    await e.loadSong(song()); // downbeats [0,2] → section originBar 0 length covers [0,2]
    // Build an arrangement directly: section at origin 0, one take raising vocals at t=0.
    e.loadArrangement({
      songId: 't',
      sections: [{ originBar: 0, lengthBars: 8, layers: [
        { id: 'k1', muted: false, events: [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.9 }] },
      ] }],
    });
    e.playArrangement();
    expect(e.isPlayingArrangement()).toBe(true);
    e.renderFrame(0.0); // playhead at section start
    e.renderFrame(0.1);
    expect(e.getStemStates().vocals.targetFilterNorm ?? e.getStemFilterNorm('vocals')).toBeCloseTo(0.9, 5);
    e.stopArrangement();
    expect(e.isPlayingArrangement()).toBe(false);
    e.dispose();
  });

  it('muteTake and deleteTake delegate to the arranger', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.loadArrangement({
      songId: 't',
      sections: [{ originBar: 0, lengthBars: 8, layers: [
        { id: 'k1', muted: false, events: [] },
        { id: 'k2', muted: false, events: [] },
      ] }],
    });
    e.muteTake(0, 'k1', true);
    expect(e.getArrangement().sections[0].layers[0].muted).toBe(true);
    e.deleteTake(0, 'k2');
    expect(e.getArrangement().sections[0].layers.map((l) => l.id)).toEqual(['k1']);
    e.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm run test:run -- RemixEngine` → FAIL (`playArrangement` missing).

- [ ] **Step 3: Implement playback + ops** — add methods to `src/remix/RemixEngine.ts`:

```ts
  playArrangement(): void {
    this.playingArrangement = true;
    this.lastTickSec = Tone.getTransport().seconds;
  }

  stopArrangement(): void {
    this.playingArrangement = false;
  }

  isPlayingArrangement(): boolean {
    return this.playingArrangement;
  }

  loadArrangement(a: RemixArrangement): void {
    this.arranger.load(a);
  }

  muteTake(sectionIdx: number, takeId: string, muted: boolean): void {
    this.arranger.muteTake(sectionIdx, takeId, muted);
  }

  deleteTake(sectionIdx: number, takeId: string): void {
    this.arranger.deleteTake(sectionIdx, takeId);
  }

  /** Resolve a section's absolute start time from its origin bar + length. */
  private sectionStartSec(originBar: number, lengthBars: number): number {
    const region = computeLoopRegion(this.downbeats, originBar, lengthBars);
    return region ? region.startSec : 0;
  }

  /** Apply the arrangement's automation for the current playhead. Called from renderFrame. */
  private tickArrangement(nowSec: number): void {
    const arr = this.arranger.getArrangement();
    for (const section of arr.sections) {
      const start = this.sectionStartSec(section.originBar, section.lengthBars);
      const region = computeLoopRegion(this.downbeats, section.originBar, section.lengthBars);
      const end = region ? region.endSec : this.duration;
      if (nowSec < start || nowSec >= end) continue;
      const t = nowSec - start;
      const comp = RemixArranger.composite(section, t);
      for (const stem of STEM_CYCLE_ORDER) {
        const v = comp.filters[stem];
        if (v !== undefined) this.setStemFilterNorm(stem, v);
      }
      if (comp.loopEnable !== undefined) this.setLayerEnabled('loop', comp.loopEnable);
      if (comp.loopSelect !== undefined) this.selectLoop(comp.loopSelect);
      if (comp.loopVolume !== undefined) this.setLayerVolume('loop', comp.loopVolume);
      // Fire percussion crossed since last tick (section-relative window).
      const fromT = this.lastTickSec - start;
      const hits = RemixArranger.discreteEventsInWindow(section, fromT, t);
      for (const hit of hits) {
        if (hit.kind === 'percussion') this.triggerPercussion(nowSec, hit.velocity);
      }
    }
  }
```

NOTE: `tickArrangement` calls `setStemFilterNorm`/`selectLoop`/`triggerPercussion`, which themselves call `captureNow`. During playback the recorder is disarmed, so `captureNow` no-ops — playback does not re-record. (When both recording and playing-back could be active, keep them mutually exclusive in the UI; the engine guards capture by `isArmed()` only.)

- [ ] **Step 4: Call `tickArrangement` from `renderFrame`** — in `renderFrame(nowSec)`, after the wrap-detection block from Task 4 and before the existing stem-state loop, add:

```ts
    if (this.playingArrangement) this.tickArrangement(nowSec);
```

(The `this.lastTickSec = nowSec;` at the end of `renderFrame`, added in Task 4, serves both recording and playback.)

- [ ] **Step 5: Run test to verify it passes** — `npm run test:run -- RemixEngine` → PASS.

- [ ] **Step 6: Lint + full suite** — `npm run lint` → exit 0; `npm run test:run` → green.

- [ ] **Step 7: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): arrangement playback tick + take mute/delete/load

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: RemixScreen recorder panel

**Files:**
- Modify: `src/ui/screens/RemixScreen.tsx`

No unit test (UI). Verify with `npm run lint` (exit 0) and `npm run test:run` (full suite green). Follow the screen's existing patterns: `engineRef`, the `% 6` React-sync block in the RAF loop, the facilitator panel JSX, and the inline `styles.*` convention.

- [ ] **Step 1: Read** `src/ui/screens/RemixScreen.tsx` to locate: the facilitator/triggers panel JSX, the `% 6` sync block, and the `handleSelectSong`/song-load path.

- [ ] **Step 2: Add state for the recorder panel** — near the loop state added previously (`loopInfo`/`loopPresent`), add:

```tsx
const [recArmed, setRecArmed]     = useState(false);
const [arrangement, setArrangement] = useState<import('../../remix/recording/remixRecording').RemixArrangement>({ songId: '', sections: [] });
const [remixPlaying, setRemixPlaying] = useState(false);
```

- [ ] **Step 3: Refresh arrangement view in the `% 6` block** — inside `if (frameCountRef.current % 6 === 0) { ... }`, add:

```tsx
        setArrangement(engineRef.current.getArrangement());
        setRecArmed(engineRef.current.isRecording());
        setRemixPlaying(engineRef.current.isPlayingArrangement());
```

- [ ] **Step 4: Add handlers** — near the other `useCallback` handlers (e.g. by `handlePlay`):

```tsx
const handleArmToggle = useCallback(() => {
  const e = engineRef.current;
  if (e.isRecording()) e.disarmRecording(); else e.armRecording();
  setRecArmed(e.isRecording());
}, []);

const handleAdvanceSection = useCallback(() => {
  engineRef.current.advanceSection();
  setArrangement(engineRef.current.getArrangement());
}, []);

const handlePlayRemix = useCallback(async () => {
  await Tone.start();
  const e = engineRef.current;
  if (e.isPlayingArrangement()) { e.stopArrangement(); setRemixPlaying(false); return; }
  e.playArrangement();
  if (!e.isPlaying()) e.play(); // ensure transport runs
  setRemixPlaying(true);
}, []);

const handleMuteTake = useCallback((sectionIdx: number, takeId: string, muted: boolean) => {
  engineRef.current.muteTake(sectionIdx, takeId, muted);
  setArrangement(engineRef.current.getArrangement());
}, []);

const handleDeleteTake = useCallback((sectionIdx: number, takeId: string) => {
  engineRef.current.deleteTake(sectionIdx, takeId);
  setArrangement(engineRef.current.getArrangement());
}, []);

const handleSaveRemix = useCallback(() => {
  const e = engineRef.current;
  const arr = e.getArrangement();
  if (!arr.songId) return;
  // simple fixed name per song for now
  void import('../../remix/recording/arrangementStore').then((m) => m.saveArrangement('default', arr));
}, []);

const handleLoadRemix = useCallback(() => {
  const arr = engineRef.current.getArrangement();
  if (!arr.songId) return;
  void import('../../remix/recording/arrangementStore').then((m) => {
    const loaded = m.loadArrangementFromStore(arr.songId, 'default');
    if (loaded) { engineRef.current.loadArrangement(loaded); setArrangement(loaded); }
  });
}, []);
```

(If the file imports `saveArrangement`/`loadArrangementFromStore` statically at the top instead, that's fine too — prefer a static import:
```tsx
import { saveArrangement, loadArrangementFromStore } from '../../remix/recording/arrangementStore';
```
and call them directly in the handlers. Use the static-import form to match the file's style.)

- [ ] **Step 5: Render the recorder panel** — add a panel in the facilitator/controls area, matching the file's inline-style row conventions. Render the arm button, current section advance, play-remix, save/load, and the section→take list with mute/delete:

```tsx
<div style={/* a panel container style matching neighbours */}>
  <div style={/* section-subheading style like "Percussion"/"Reach" */}>Remix recorder</div>
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    <button onClick={handleArmToggle} aria-pressed={recArmed} style={styles.btn}>
      {recArmed ? '● Recording' : '○ Arm'}
    </button>
    <button onClick={handleAdvanceSection} style={styles.btn}>Next section →</button>
    <button onClick={handlePlayRemix} style={styles.btn}>{remixPlaying ? '■ Stop remix' : '▶ Play remix'}</button>
    <button onClick={handleSaveRemix} style={styles.btn}>Save</button>
    <button onClick={handleLoadRemix} style={styles.btn}>Load</button>
  </div>
  {arrangement.sections.map((sec, sIdx) => (
    <div key={`${sec.originBar}-${sec.lengthBars}`} style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: '#71718a' }}>
        Section @bar {sec.originBar} · {sec.lengthBars} bars · {sec.layers.length} layer(s)
      </div>
      {sec.layers.map((take) => (
        <div key={take.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span aria-live="polite">{take.muted ? 'muted' : 'on'}: {take.id}</span>
          <button onClick={() => handleMuteTake(sIdx, take.id, !take.muted)} style={styles.btn}>
            {take.muted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={() => handleDeleteTake(sIdx, take.id)} style={styles.btn} aria-label={`Delete ${take.id}`}>✕</button>
        </div>
      ))}
    </div>
  ))}
</div>
```

Match the actual `styles.*` names in the file (e.g. if the button style is `styles.smallBtn`, use that). Render this panel only when a song is loaded (guard with the existing `isLoaded`/`selectedSong` flag used by other panels).

- [ ] **Step 6: Lint + full suite** — `npm run lint` → exit 0; `npm run test:run` → green.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): recorder panel — arm, sections, layers, play/save/load

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run test:run` → all green (new recorder/arranger/store/engine tests included).
- [ ] `npm run lint` → exit 0.
- [ ] **Manual browser check:** load a song, set a loop (e.g. 8 bars), press Arm + Play, move a baton/keys to sweep a stem and fire percussion over the looping section; confirm a layer appears; arm another cycle to overdub; "Next section →"; then "Play remix" with recording disarmed and confirm the performance replays over the song; Save, reload the page/song, Load, and confirm it replays.
