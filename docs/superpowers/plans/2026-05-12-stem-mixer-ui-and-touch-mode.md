# Stem Mixer UI Clarity + Touch Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent stem-mixer feedback strip with per-song zone labels and song-type-aware layout (4 stem bars vs 1 volume bar), restore the missing blue-voice callout, and add an iPad touch input mode that drives the stem mixer via a single big X/Y pad with drag-while-held, persist-on-lift semantics.

**Architecture:** Three additions co-located under `src/ui/screens/songPreset/` — a pure view-model helper (`stemMixerView.ts`), a presentational strip component (`StemMixerStrip.tsx`), and a touch-pad component (`StemMixerTouchPad.tsx`) backed by a testable `usePadState` hook. `SongPresetScreen.tsx` is modified to mount the strip in both input modes, add a mode picker that gates camera initialisation, and feed the engine from the pad in touch mode. The `StemMixerMapping` type grows one optional `zoneLabels` field, populated for the four library songs. No engine-side change.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest + jsdom, Pointer Events API. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-12-stem-mixer-ui-and-touch-mode-design.md](../specs/2026-05-12-stem-mixer-ui-and-touch-mode-design.md)

---

## File Map

| Path | New / Modified | Responsibility |
|---|---|---|
| `src/songs/songLibrary.ts` | Modified | Add `zoneLabels?` to `StemMixerMapping`; populate for all 4 library songs. |
| `src/ui/screens/songPreset/stemMixerView.ts` | New | Pure helper. Takes `(song, status, active)` → display view-model (`layout`, `zoneLabel`, `stems`, `filterPercent`, `dimmed`). |
| `src/ui/screens/songPreset/StemMixerStrip.tsx` | New | Presentational. Renders strip based on `resolveStemMixerView` output. |
| `src/ui/screens/songPreset/usePadState.ts` | New | Pointer-events hook. Tracks `{x, y, held}` with persist-on-lift semantics. Reset method. |
| `src/ui/screens/songPreset/StemMixerTouchPad.tsx` | New | Presentational. Renders pad surface + reset button, wires to `usePadState`, calls back with position. |
| `src/ui/screens/SongPresetScreen.tsx` | Modified | Mode picker, conditional camera init, mount strip + pad, fix blue callout, drop redundant per-stem readout. |
| `src/__tests__/stemMixerView.test.ts` | New | Unit tests for the pure helper. |
| `src/__tests__/usePadState.test.ts` | New | Unit tests for the pointer hook. |

---

## Task 1: Extend `StemMixerMapping` with `zoneLabels`

**Files:**
- Modify: `src/songs/songLibrary.ts:22-28` (the `StemMixerMapping` interface) and the four song entries below it.

- [ ] **Step 1: Add the optional `zoneLabels` field to the interface**

In `src/songs/songLibrary.ts`, replace the `StemMixerMapping` interface:

```ts
/** How the Blue (Stem Mixer) object maps zones to stem levels */
export interface StemMixerMapping {
  label: string;
  leftZone: ZoneStemLevels;
  centerZone: ZoneStemLevels;
  rightZone: ZoneStemLevels;
  /** Optional human-readable zone names. Defaults are derived per song-type when absent. */
  zoneLabels?: {
    left: string;
    center: string;
    right: string;
  };
}
```

- [ ] **Step 2: Add zoneLabels to `mixOnlyMixer`**

Replace the existing `mixOnlyMixer` constant with:

```ts
const mixOnlyMixer: StemMixerMapping = {
  label: 'Volume',
  leftZone:   { vocals: 0.0, drums: 0.0, bass: 0.0, other: 0.0 },
  centerZone: { vocals: 0.5, drums: 0.5, bass: 0.5, other: 0.5 },
  rightZone:  { vocals: 1.0, drums: 1.0, bass: 1.0, other: 1.0 },
  zoneLabels: { left: 'Silent', center: 'Half volume', right: 'Full volume' },
};
```

- [ ] **Step 3: Add zoneLabels to `Can't Help Falling`**

Replace its `stemMixer` block:

```ts
    stemMixer: {
      label: 'Stem Mixer',
      leftZone:   { vocals: 1.0, drums: 0.0, bass: 0.0, other: 0.0 },
      centerZone: { vocals: 1.0, drums: 0.3, bass: 0.3, other: 0.6 },
      rightZone:  { vocals: 1.0, drums: 1.0, bass: 1.0, other: 1.0 },
      zoneLabels: { left: 'Vocals only', center: 'Vocals + light band', right: 'Full mix' },
    },
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: zero errors. (The three Blues Brothers tracks share `mixOnlyMixer`, so they inherit zone labels automatically.)

- [ ] **Step 5: Commit**

```bash
git add src/songs/songLibrary.ts
git commit -m "songs: add zoneLabels to StemMixerMapping for UI strip"
```

---

## Task 2: Pure view-model helper `stemMixerView`

**Files:**
- Create: `src/ui/screens/songPreset/stemMixerView.ts`
- Create: `src/__tests__/stemMixerView.test.ts`

The strip needs to know:
- Whether to render 4 stem bars or 1 volume bar (depends on whether the song is "mix-only" — defined as all four stem paths being the same).
- What text label to show for the current zone.
- What % the filter is open (mapped from `filterHz` against `FILTER_MIN_HZ..FILTER_MAX_HZ` logarithmically — match how the voice itself maps it).
- Per-stem display values (gain 0-1).
- Whether the strip should be visually "dimmed" (when blue is not actively driving).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/stemMixerView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveStemMixerView } from '../ui/screens/songPreset/stemMixerView';
import type { SongConfig } from '../songs/songLibrary';
import type { SongPresetStatus } from '../songs/SongPresetEngine';

const trueStemSong: SongConfig = {
  id: 't', title: 't', artist: 't', key: 'C', bpm: 100, timeSignature: '4/4',
  stems: { vocals: 'a/vocals.wav', drums: 'a/drums.wav', bass: 'a/bass.wav', other: 'a/other.wav' },
  stemMixer: {
    label: 'Stem Mixer',
    leftZone:   { vocals: 1, drums: 0, bass: 0, other: 0 },
    centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
    rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    zoneLabels: { left: 'Vocals only', center: 'Mid', right: 'Full' },
  },
};

const mixOnlySong: SongConfig = {
  id: 'm', title: 'm', artist: 'm', key: 'C', bpm: 100, timeSignature: '4/4',
  stems: { vocals: 'b/mix.mp3', drums: 'b/mix.mp3', bass: 'b/mix.mp3', other: 'b/mix.mp3' },
  stemMixer: {
    label: 'Volume',
    leftZone:   { vocals: 0, drums: 0, bass: 0, other: 0 },
    centerZone: { vocals: 0.5, drums: 0.5, bass: 0.5, other: 0.5 },
    rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    zoneLabels: { left: 'Silent', center: 'Half', right: 'Full' },
  },
};

const baseStatus = (partial: Partial<SongPresetStatus> = {}): SongPresetStatus => ({
  isPlaying: false, isPaused: false, currentTime: 0, duration: 0,
  loopEnabled: false, loopStart: 0, loopEnd: 0,
  stemsLoaded: 4, stemsTotal: 4, loadingComplete: true,
  stemVolumes: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
  filterHz: 8000, reverbWet: 0, distance: 0,
  stemMixerZone: 'center', activeColors: [], currentChordName: null,
  accompVolume: 1, stemVolume: 1, chordOffset: 0, bpmAdjust: 0,
  effectiveBpm: 100, currentBeatIndex: -1, totalBeats: 0, hasAnalysis: false,
  continuousBackingEnabled: true, continuousBackingLevel: 0.4,
  voicePresets: {}, currentChordRoot: null,
  ...partial,
});

describe('resolveStemMixerView', () => {
  it('returns multi-stem layout for a song with distinct stem paths', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus(), true);
    expect(view.layout).toBe('multi-stem');
    expect(view.stems).toHaveLength(4);
    expect(view.stems.map((s) => s.id)).toEqual(['vocals', 'drums', 'bass', 'other']);
  });

  it('returns mix-only layout when all four stem paths are identical', () => {
    const view = resolveStemMixerView(mixOnlySong, baseStatus(), true);
    expect(view.layout).toBe('mix-only');
    expect(view.stems).toHaveLength(1);
    expect(view.stems[0].id).toBe('volume');
  });

  it('reads the zone label from the song mapping for the current zone', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus({ stemMixerZone: 'left' }), true);
    expect(view.zoneLabel).toBe('Vocals only');
  });

  it('falls back to a generic label when no zone is active', () => {
    const view = resolveStemMixerView(trueStemSong, baseStatus({ stemMixerZone: null }), false);
    expect(view.zoneLabel).toBe('—');
  });

  it('falls back to default zone names when the mapping has no zoneLabels', () => {
    const songNoLabels: SongConfig = {
      ...trueStemSong,
      stemMixer: { ...trueStemSong.stemMixer, zoneLabels: undefined },
    };
    const view = resolveStemMixerView(songNoLabels, baseStatus({ stemMixerZone: 'left' }), true);
    expect(view.zoneLabel).toBe('Left');
  });

  it('maps filterHz to a 0-100 percent against FILTER_MIN/MAX log range', () => {
    // At FILTER_MAX_HZ (8000) the filter is fully open → ~100%
    const high = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 8000 }), true);
    expect(high.filterPercent).toBeGreaterThanOrEqual(99);
    // At FILTER_MIN_HZ (200) the filter is closed → ~0%
    const low = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 200 }), true);
    expect(low.filterPercent).toBeLessThanOrEqual(1);
    // Geometric mean ≈ sqrt(200 * 8000) = 1264.9 → ~50%
    const mid = resolveStemMixerView(trueStemSong, baseStatus({ filterHz: 1264.9 }), true);
    expect(mid.filterPercent).toBeGreaterThan(45);
    expect(mid.filterPercent).toBeLessThan(55);
  });

  it('marks the strip as dimmed when active=false', () => {
    expect(resolveStemMixerView(trueStemSong, baseStatus(), false).dimmed).toBe(true);
    expect(resolveStemMixerView(trueStemSong, baseStatus(), true).dimmed).toBe(false);
  });

  it('mix-only single bar level averages the four stem volumes', () => {
    const view = resolveStemMixerView(
      mixOnlySong,
      baseStatus({ stemVolumes: { vocals: 1, drums: 1, bass: 0, other: 0 } }),
      true,
    );
    expect(view.stems[0].level).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- stemMixerView`
Expected: FAIL — `Cannot find module '../ui/screens/songPreset/stemMixerView'`.

- [ ] **Step 3: Implement the helper**

Create `src/ui/screens/songPreset/stemMixerView.ts`:

```ts
import type { SongConfig, StemMixerMapping } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';
import { FILTER_MIN_HZ, FILTER_MAX_HZ } from '../../../songs/voices/ToneVoiceBase';

export type StemMixerLayout = 'multi-stem' | 'mix-only';

export interface StemBarView {
  id: string;
  label: string;
  level: number; // 0-1
}

export interface StemMixerView {
  layout: StemMixerLayout;
  zoneLabel: string;
  stems: StemBarView[];
  filterPercent: number; // 0-100
  dimmed: boolean;
}

const STEM_IDS = ['vocals', 'drums', 'bass', 'other'] as const;
const STEM_LABELS: Record<(typeof STEM_IDS)[number], string> = {
  vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other',
};

const DEFAULT_ZONE_LABELS = { left: 'Left', center: 'Center', right: 'Right' };

function isMixOnly(song: SongConfig): boolean {
  const paths = STEM_IDS.map((id) => song.stems[id]);
  return paths.every((p) => p === paths[0]);
}

function resolveZoneLabels(mapping: StemMixerMapping): { left: string; center: string; right: string } {
  return mapping.zoneLabels ?? DEFAULT_ZONE_LABELS;
}

function filterHzToPercent(hz: number): number {
  // Log mapping: 200 Hz → 0%, 8000 Hz → 100%.
  if (hz <= FILTER_MIN_HZ) return 0;
  if (hz >= FILTER_MAX_HZ) return 100;
  const ratio = Math.log(hz / FILTER_MIN_HZ) / Math.log(FILTER_MAX_HZ / FILTER_MIN_HZ);
  return Math.round(ratio * 1000) / 10; // one decimal, expressed as 0-100
}

export function resolveStemMixerView(
  song: SongConfig,
  status: SongPresetStatus,
  active: boolean,
): StemMixerView {
  const mixOnly = isMixOnly(song);
  const zoneLabels = resolveZoneLabels(song.stemMixer);
  const zoneLabel = status.stemMixerZone ? zoneLabels[status.stemMixerZone] : '—';
  const filterPercent = filterHzToPercent(status.filterHz);

  let stems: StemBarView[];
  if (mixOnly) {
    const vols = STEM_IDS.map((id) => status.stemVolumes[id] ?? 0);
    const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
    stems = [{ id: 'volume', label: 'Volume', level: avg }];
  } else {
    stems = STEM_IDS.map((id) => ({
      id,
      label: STEM_LABELS[id],
      level: status.stemVolumes[id] ?? 0,
    }));
  }

  return {
    layout: mixOnly ? 'mix-only' : 'multi-stem',
    zoneLabel,
    stems,
    filterPercent,
    dimmed: !active,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- stemMixerView`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/songPreset/stemMixerView.ts src/__tests__/stemMixerView.test.ts
git commit -m "songPreset: pure view-model helper for stem mixer strip"
```

---

## Task 3: `StemMixerStrip` component

**Files:**
- Create: `src/ui/screens/songPreset/StemMixerStrip.tsx`

Presentational only — consumes `resolveStemMixerView`'s output and lays it out. No tests at this layer (RTL not installed; the underlying logic is already covered by Task 2).

- [ ] **Step 1: Create the component**

Create `src/ui/screens/songPreset/StemMixerStrip.tsx`:

```tsx
import { resolveStemMixerView } from './stemMixerView';
import type { SongConfig } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';

interface StemMixerStripProps {
  song: SongConfig | null;
  status: SongPresetStatus | null;
  active: boolean;
}

export function StemMixerStrip({ song, status, active }: StemMixerStripProps) {
  if (!song || !status) return null;
  const view = resolveStemMixerView(song, status, active);

  return (
    <div
      style={{
        ...styles.strip,
        opacity: view.dimmed ? 0.5 : 1,
        transition: 'opacity 200ms',
      }}
      aria-label="Stem mixer state"
    >
      <div style={styles.zoneBlock}>
        <div style={styles.zoneLabelKicker}>Zone</div>
        <div style={styles.zoneLabel}>{view.zoneLabel}</div>
      </div>

      <div style={styles.barsBlock}>
        {view.stems.map((stem) => (
          <div key={stem.id} style={styles.barRow}>
            <span style={styles.barLabel}>{stem.label}</span>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${Math.round(stem.level * 100)}%`,
                }}
              />
            </div>
            <span style={styles.barValue}>{Math.round(stem.level * 100)}%</span>
          </div>
        ))}
      </div>

      <div style={styles.filterBlock} aria-label="Filter brightness">
        <div style={styles.filterEnds}>
          <span>Bright</span>
        </div>
        <div style={styles.filterTrack}>
          <div
            style={{
              ...styles.filterFill,
              height: `${view.filterPercent}%`,
            }}
          />
        </div>
        <div style={styles.filterEnds}>
          <span>Warm</span>
        </div>
        <div style={styles.filterPctReadout}>{Math.round(view.filterPercent)}%</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 16,
    padding: '8px 12px',
    background: 'rgba(8,8,18,0.78)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: '#e2e2e8',
    fontFamily: 'system-ui, sans-serif',
    minHeight: 64,
  },
  zoneBlock: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 160,
    paddingRight: 12,
    borderRight: '1px solid rgba(255,255,255,0.08)',
  },
  zoneLabelKicker: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#71718a',
  },
  zoneLabel: {
    fontSize: 18,
    fontWeight: 700,
    color: '#3b82f6',
  },
  barsBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 3,
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 56,
    fontSize: 11,
    color: '#a1a1b8',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 8,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#3b82f6',
    transition: 'width 100ms linear',
  },
  barValue: {
    width: 36,
    fontSize: 10,
    color: '#71718a',
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  filterBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 60,
    paddingLeft: 12,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    fontSize: 9,
    color: '#71718a',
  },
  filterEnds: {
    height: 12,
  },
  filterTrack: {
    flex: 1,
    width: 6,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    margin: '2px 0',
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-end',
  },
  filterFill: {
    width: '100%',
    background: '#3b82f6',
    borderRadius: 3,
    transition: 'height 100ms linear',
  },
  filterPctReadout: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#71718a',
    marginTop: 2,
  },
};
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/songPreset/StemMixerStrip.tsx
git commit -m "songPreset: StemMixerStrip presentational component"
```

---

## Task 4: Mount the strip in `SongPresetScreen` and remove redundant per-stem readout

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx`

- [ ] **Step 1: Import the new component**

Near the top of `SongPresetScreen.tsx`, after the existing imports (around line 27), add:

```tsx
import { StemMixerStrip } from './songPreset/StemMixerStrip';
```

- [ ] **Step 2: Compute `blueActive` from live status**

Inside the component, after the `activeColors` const is read from `liveStatus` (around line 502), derive:

```tsx
const blueActive = activeColors.includes('blue');
```

- [ ] **Step 3: Render the strip above the video**

Find the `return (` block of the component (line 504). Wrap the existing video container so the strip sits above it. Replace:

```tsx
  return (
    <div style={styles.container}>
      {/* Video + overlay */}
      <div
        style={{
          ...styles.videoContainer,
```

with:

```tsx
  return (
    <div style={styles.container}>
      <div style={styles.stage}>
        <StemMixerStrip song={selectedSong} status={liveStatus} active={blueActive} />
        {/* Video + overlay */}
        <div
          style={{
            ...styles.videoContainer,
```

Then close the new `stage` wrapper before the `controlsPanel` div. Find the closing `</div>` of the video container (just before the `{/* Controls panel */}` comment around line 575) and add one more `</div>` after it:

```tsx
        )}
      </div>
      </div>

      {/* Controls panel */}
```

- [ ] **Step 4: Add the `stage` style**

In the `styles` object (around line 1237), add `stage` near `videoContainer`:

```tsx
  stage: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#000',
    minWidth: 0,
  },
```

And change `videoContainer.flex` from `1` to remain `1` but ensure it inherits column layout — replace the existing `videoContainer` definition:

```tsx
  videoContainer: {
    flex: 1,
    position: 'relative',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
```

- [ ] **Step 5: Remove the per-stem lines from the Status block**

Find the Status section (around lines 984-1000). Replace:

```tsx
            <div style={{ fontSize: 12, color: '#a1a1b8', lineHeight: 1.6, fontFamily: 'monospace' }}>
              <div>Active: {liveStatus.activeColors.join(', ') || 'none'}</div>
              <div>Mixer zone: {liveStatus.stemMixerZone ?? 'none'}</div>
              {Object.entries(liveStatus.stemVolumes).map(([id, vol]) => (
                <div key={id}>{id}: {Math.round(vol * 100)}%</div>
              ))}
              <div>Filter: {Math.round(liveStatus.filterHz)} Hz</div>
              <div>Reverb: {Math.round(liveStatus.reverbWet * 100)}%</div>
              <div>Distance: {liveStatus.distance.toFixed(2)}</div>
              <div>Chord: {liveStatus.currentChordName ?? '---'}</div>
              <div>Accomp: {Math.round(liveStatus.accompVolume * 100)}%</div>
            </div>
```

with:

```tsx
            <div style={{ fontSize: 12, color: '#a1a1b8', lineHeight: 1.6, fontFamily: 'monospace' }}>
              <div>Active: {liveStatus.activeColors.join(', ') || 'none'}</div>
              <div>Reverb: {Math.round(liveStatus.reverbWet * 100)}%</div>
              <div>Distance: {liveStatus.distance.toFixed(2)}</div>
              <div>Chord: {liveStatus.currentChordName ?? '---'}</div>
              <div>Accomp: {Math.round(liveStatus.accompVolume * 100)}%</div>
            </div>
```

The strip now owns stem volumes, mixer zone, and filter.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 7: Smoke-check manually**

Run: `npm run dev` and navigate to Song Preset → load *Can't Help Falling*. Expected: a strip appears above the video showing "Zone: —", four stem bars at 0, filter at 100%, and the whole strip dimmed (because blue isn't active yet).

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "songPreset: mount StemMixerStrip + drop redundant per-stem readout"
```

---

## Task 5: Add blue puck callout

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx` — `drawMarker` (around line 1110) and `getRoleStateLines` (around line 1151).

- [ ] **Step 1: Remove the blue exclusion in `drawMarker`**

Find the block in `drawMarker`:

```tsx
  if (isActive && role.id !== 'blue') {
    const preset = status.voicePresets[role.id] ?? '';
    const lines = getRoleStateLines(role.id, pos, preset);
    drawCallout(ctx, x, y, canvasW, color, lines);
  } else {
    // Inactive or blue: just the label
```

Replace with:

```tsx
  if (isActive) {
    const preset = status.voicePresets[role.id] ?? '';
    const lines = getRoleStateLines(role.id, pos, preset, status);
    drawCallout(ctx, x, y, canvasW, color, lines);
  } else {
    // Inactive: just the label
```

Note: `getRoleStateLines` now takes `status` as a 4th parameter (we need `stemMixerZone` and `filterHz` for the blue branch).

- [ ] **Step 2: Update the `getRoleStateLines` signature and add the blue branch**

Replace the entire `getRoleStateLines` function:

```tsx
function getRoleStateLines(
  roleId: ColorRole,
  pos: VoicePosition,
  preset: string,
  status: SongPresetStatus,
): string[] {
  const x = pos.x;
  const y = pos.y;

  if (roleId === 'blue') {
    const zone = status.stemMixerZone;
    const zoneText = zone === 'left' ? 'Left zone' : zone === 'right' ? 'Right zone' : zone === 'center' ? 'Mid zone' : '—';
    const filterPct = Math.round(
      Math.max(0, Math.min(100,
        (Math.log((status.filterHz || 200) / 200) / Math.log(8000 / 200)) * 100
      ))
    );
    return [`Mixer: ${zoneText}`, `Filter ${filterPct}%`];
  }

  if (roleId === 'green') {
    const zone = Math.min(Math.floor(x * 5), 4);
    const shift = Math.round((0.5 - y) * 2);
    const oct = shift > 0 ? `+${shift} oct` : shift < 0 ? `${shift} oct` : 'mid oct';
    return [`♩ ${MELODY_NOTE_NAMES[zone]}  ${oct}`, preset];
  }
  if (roleId === 'red') {
    const voicing = x < LEFT_THRESHOLD ? 'Close voicing' : x > RIGHT_THRESHOLD ? 'Wide voicing' : 'Std voicing';
    const brightness = Math.round((1 - y) * 100);
    return [voicing, `Filter ${brightness}%`, preset];
  }
  if (roleId === 'yellow') {
    const speed = x < LEFT_THRESHOLD ? 'Slow (♩)' : x > RIGHT_THRESHOLD ? 'Fast (♬)' : 'Mid (♪)';
    const range = y < 0.4 ? '2 oct range' : '1 oct range';
    return [speed, range, preset];
  }
  if (roleId === 'orange') {
    const pattern = x < LEFT_THRESHOLD ? 'Minimal' : x > RIGHT_THRESHOLD ? 'Walking' : 'Driving';
    const tone = Math.round((1 - y) * 100);
    return [`${pattern} bass`, `Tone ${tone}%`, preset];
  }
  return [];
}
```

- [ ] **Step 3: Add `SongPresetStatus` to the import line for the type**

Confirm at the top of the file the type is already imported. The existing line should already read:

```tsx
import type { VoicePosition, SongPresetStatus, SongCalibration } from '../../songs/SongPresetEngine';
```

If not, add `SongPresetStatus` to that import.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 5: Smoke-check manually**

Run `npm run dev`, enable Keyboard test mode, press `1` (blue), move mouse. Expected: the blue puck now shows a callout with "Mixer: …" and "Filter %".

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "songPreset: restore blue voice callout (zone + filter)"
```

---

## Task 6: Pad state hook `usePadState`

**Files:**
- Create: `src/ui/screens/songPreset/usePadState.ts`
- Create: `src/__tests__/usePadState.test.ts`

This is the pure brain of the touch pad. It encapsulates pointer event handling and the persist-on-lift contract. Tested directly via `renderHook`.

**Approach:** `@testing-library/react` is not installed in this project. Rather than add it just for this hook, we **extract the state-reducer as a pure function and test that directly**. The React hook (`usePadState`) becomes a thin wrapper around the reducer — its DOM-level behaviour (pointer-capture, coordinate normalisation) gets a manual smoke check in Task 8, but the persist-on-lift contract is exercised by reducer tests alone.

- [ ] **Step 1: Write the failing tests against a pure reducer**

Create `src/__tests__/usePadState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { padReducer, INITIAL_PAD_STATE, type PadEvent } from '../ui/screens/songPreset/usePadState';

describe('padReducer', () => {
  it('starts at (0.5, 0.0) with held=false', () => {
    expect(INITIAL_PAD_STATE).toEqual({ x: 0.5, y: 0.0, held: false });
  });

  it('pointerdown sets held=true and updates position', () => {
    const next = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    expect(next).toEqual({ x: 0.3, y: 0.7, held: true });
  });

  it('pointermove while not held does nothing', () => {
    const next = padReducer(INITIAL_PAD_STATE, { type: 'move', x: 0.9, y: 0.1 });
    expect(next).toBe(INITIAL_PAD_STATE);
  });

  it('pointermove while held updates position, keeps held=true', () => {
    const downState = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    const moveState = padReducer(downState, { type: 'move', x: 0.6, y: 0.2 });
    expect(moveState).toEqual({ x: 0.6, y: 0.2, held: true });
  });

  it('pointerup persists position but keeps held=true (persist-on-lift)', () => {
    const downState = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.4, y: 0.4 });
    const upState = padReducer(downState, { type: 'up' });
    expect(upState).toEqual({ x: 0.4, y: 0.4, held: true });
  });

  it('subsequent pointerdown after lift updates position and keeps held=true', () => {
    let s = padReducer(INITIAL_PAD_STATE, { type: 'down', x: 0.3, y: 0.7 });
    s = padReducer(s, { type: 'up' });
    s = padReducer(s, { type: 'down', x: 0.8, y: 0.1 });
    expect(s).toEqual({ x: 0.8, y: 0.1, held: true });
  });

  it('reset returns to initial state', () => {
    const s = padReducer({ x: 0.9, y: 0.9, held: true }, { type: 'reset' });
    expect(s).toEqual(INITIAL_PAD_STATE);
  });

  it('coordinates are clamped to [0, 1]', () => {
    const high: PadEvent = { type: 'down', x: 1.5, y: -0.2 };
    const next = padReducer(INITIAL_PAD_STATE, high);
    expect(next.x).toBe(1);
    expect(next.y).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- usePadState`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reducer + hook**

Create `src/ui/screens/songPreset/usePadState.ts`:

```ts
import { useCallback, useRef, useState, type RefObject } from 'react';

export interface PadState {
  x: number;
  y: number;
  held: boolean;
}

export type PadEvent =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'reset' };

export const INITIAL_PAD_STATE: PadState = { x: 0.5, y: 0.0, held: false };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function padReducer(state: PadState, event: PadEvent): PadState {
  switch (event.type) {
    case 'down':
      return { x: clamp01(event.x), y: clamp01(event.y), held: true };
    case 'move':
      if (!state.held) return state;
      return { x: clamp01(event.x), y: clamp01(event.y), held: true };
    case 'up':
      // Persist-on-lift: position stays, held stays true until reset.
      return state;
    case 'reset':
      return INITIAL_PAD_STATE;
    default:
      return state;
  }
}

interface UsePadStateResult {
  state: PadState;
  bind: {
    ref: RefObject<HTMLDivElement | null>;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  reset: () => void;
}

/** React hook wrapping `padReducer` with pointer-event handlers normalised to [0,1] coords. */
export function usePadState(): UsePadStateResult {
  const [state, setState] = useState<PadState>(INITIAL_PAD_STATE);
  const ref = useRef<HTMLDivElement>(null);
  const draggingPointerId = useRef<number | null>(null);

  const normalise = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== null) return; // single-finger only
    draggingPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = normalise(e);
    setState((s) => padReducer(s, { type: 'down', x, y }));
  }, [normalise]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== e.pointerId) return;
    const { x, y } = normalise(e);
    setState((s) => padReducer(s, { type: 'move', x, y }));
  }, [normalise]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== e.pointerId) return;
    draggingPointerId.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setState((s) => padReducer(s, { type: 'up' }));
  }, []);

  const reset = useCallback(() => {
    setState((s) => padReducer(s, { type: 'reset' }));
  }, []);

  return {
    state,
    bind: {
      ref,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    reset,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- usePadState`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/songPreset/usePadState.ts src/__tests__/usePadState.test.ts
git commit -m "songPreset: usePadState hook + padReducer (persist-on-lift)"
```

---

## Task 7: `StemMixerTouchPad` component

**Files:**
- Create: `src/ui/screens/songPreset/StemMixerTouchPad.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect } from 'react';
import { usePadState, type PadState } from './usePadState';
import { resolveStemMixerView } from './stemMixerView';
import type { SongConfig } from '../../../songs/songLibrary';
import type { SongPresetStatus } from '../../../songs/SongPresetEngine';

interface StemMixerTouchPadProps {
  song: SongConfig | null;
  status: SongPresetStatus | null;
  onChange: (state: PadState) => void;
}

export function StemMixerTouchPad({ song, status, onChange }: StemMixerTouchPadProps) {
  const { state, bind, reset } = usePadState();

  // Push every state change up to the parent on each render.
  useEffect(() => { onChange(state); }, [state, onChange]);

  const zoneLabels = song?.stemMixer.zoneLabels ?? { left: 'Left', center: 'Center', right: 'Right' };
  const view = song && status ? resolveStemMixerView(song, status, state.held) : null;

  return (
    <div style={styles.wrap}>
      <div
        {...bind}
        style={{ ...styles.pad, touchAction: 'none' }}
        aria-label="Stem mixer touch pad"
        role="application"
      >
        {/* Axis labels */}
        <div style={{ ...styles.axisLabel, top: 8, left: 12 }}>Bright</div>
        <div style={{ ...styles.axisLabel, bottom: 8, left: 12 }}>Warm</div>
        <div style={{ ...styles.zoneStripe, left: '0%' }}>{zoneLabels.left}</div>
        <div style={{ ...styles.zoneStripe, left: '50%', transform: 'translateX(-50%)' }}>{zoneLabels.center}</div>
        <div style={{ ...styles.zoneStripe, right: '0%' }}>{zoneLabels.right}</div>

        {/* Vertical thirds — visual hint that X has 3 zones */}
        <div style={{ ...styles.divider, left: '33.33%' }} />
        <div style={{ ...styles.divider, left: '66.66%' }} />

        {/* Puck */}
        <div
          style={{
            ...styles.puck,
            left: `${state.x * 100}%`,
            top: `${state.y * 100}%`,
            opacity: state.held ? 1 : 0.4,
          }}
        >
          <div style={styles.puckDot} />
        </div>

        {/* Filter % readout, top-right */}
        {view && (
          <div style={styles.filterReadout}>
            Filter {Math.round(view.filterPercent)}%
          </div>
        )}
      </div>

      <button onClick={reset} style={styles.resetBtn} aria-label="Reset mixer to default">
        Reset
      </button>
    </div>
  );
}

const PUCK_SIZE = 48;

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    display: 'flex',
    gap: 12,
    padding: 12,
    minHeight: 0,
  },
  pad: {
    flex: 1,
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(59,130,246,0.10), rgba(59,130,246,0.02))',
    border: '1px solid rgba(59,130,246,0.4)',
    borderRadius: 12,
    overflow: 'hidden',
    userSelect: 'none',
    minHeight: 240,
  },
  axisLabel: {
    position: 'absolute',
    fontSize: 11,
    color: '#a1a1b8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    pointerEvents: 'none',
  },
  zoneStripe: {
    position: 'absolute',
    bottom: 8,
    fontSize: 12,
    fontWeight: 600,
    color: '#a1a1b8',
    pointerEvents: 'none',
    padding: '0 8px',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    background: 'rgba(255,255,255,0.06)',
    pointerEvents: 'none',
  },
  puck: {
    position: 'absolute',
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    marginLeft: -PUCK_SIZE / 2,
    marginTop: -PUCK_SIZE / 2,
    borderRadius: '50%',
    border: '3px solid #3b82f6',
    background: 'rgba(59,130,246,0.18)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 150ms',
  },
  puckDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#3b82f6',
  },
  filterReadout: {
    position: 'absolute',
    top: 8,
    right: 12,
    fontSize: 11,
    color: '#3b82f6',
    fontFamily: 'monospace',
    pointerEvents: 'none',
  },
  resetBtn: {
    width: 80,
    minHeight: 44,
    background: 'rgba(255,255,255,0.05)',
    color: '#a1a1b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'center',
  },
};
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/songPreset/StemMixerTouchPad.tsx
git commit -m "songPreset: StemMixerTouchPad component"
```

---

## Task 8: Mode picker + wire touch mode into `SongPresetScreen`

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx`

- [ ] **Step 1: Add the imports and state**

Near the top of the file, add to the existing imports from `'./songPreset/StemMixerStrip'` line:

```tsx
import { StemMixerStrip } from './songPreset/StemMixerStrip';
import { StemMixerTouchPad } from './songPreset/StemMixerTouchPad';
import type { PadState } from './songPreset/usePadState';
```

Then inside the component, after the existing UI state block (after `showNoteNames` around line 71), add:

```tsx
  // Input mode (webcam | touch). Session-only — not persisted.
  const [inputMode, setInputMode] = useState<'webcam' | 'touch'>('webcam');
  // Touch pad state pushed up from StemMixerTouchPad.
  const padStateRef = useRef<PadState>({ x: 0.5, y: 0.0, held: false });
```

- [ ] **Step 2: Gate camera init on webcam mode**

Find the camera init `useEffect` (around line 138). Wrap the body in a mode check. Replace:

```tsx
  useEffect(() => {
    let cancelled = false;
    let unsubTracking: (() => void) | null = null;

    const init = async () => {
```

with:

```tsx
  useEffect(() => {
    if (inputMode !== 'webcam') {
      // Touch mode: skip camera/tracker, mark "initialised" so the draw loop can run.
      setIsInitialized(true);
      return;
    }

    let cancelled = false;
    let unsubTracking: (() => void) | null = null;

    const init = async () => {
```

And change the dependency array at the bottom of that effect from `[]` to `[inputMode]`.

- [ ] **Step 3: Branch the draw loop's position source on input mode**

Find the loop in the second `useEffect` (around line 225). The block currently reads:

```tsx
          if (keyboardMode) {
            // Keyboard test: use synthetic positions
            ...
          } else {
            // Real camera tracking
            ...
          }
```

Replace with:

```tsx
          if (inputMode === 'touch') {
            // Touch mode: only blue is driven, from the pad. All others inactive.
            const pad = padStateRef.current;
            for (const role of COLOR_ROLES) {
              if (role.id === 'blue') {
                positions.set(role.id, { x: pad.x, y: pad.y, found: pad.held });
              } else {
                positions.set(role.id, { x: 0, y: 0, found: false });
              }
            }
          } else if (keyboardMode) {
            // Keyboard test: use synthetic positions
            const active = keyboardActiveRef.current;
            const mouse = mousePosRef.current;
            for (const role of COLOR_ROLES) {
              const isActive = active.includes(role.id);
              positions.set(role.id, {
                x: isActive ? mouse.x : 0.5,
                y: isActive ? mouse.y : 0.5,
                found: isActive,
              });
            }
          } else {
            // Real camera tracking
            const blobs = blobsRef.current;
            for (const role of COLOR_ROLES) {
              const blob = blobs.find((b) => b.colorId === role.id);
              positions.set(role.id, blob?.found
                ? { x: 1 - blob.x, y: blob.y, found: true }
                : { x: 0, y: 0, found: false });
            }
          }
```

Add `inputMode` to the dependency array of this effect alongside `keyboardMode`.

- [ ] **Step 4: Render either video or touch pad based on mode**

In the JSX (around line 504), replace the entire `<div style={...videoContainer}>...</div>` (the one with `onClick={handleVideoAreaClick}`) by branching:

```tsx
        {inputMode === 'webcam' ? (
          <div
            style={{
              ...styles.videoContainer,
              cursor: colorCalMode ? 'crosshair' : 'default',
            }}
            onClick={handleVideoAreaClick}
          >
            {/* ...existing video/canvas/overlays/banners/loading content stays here unchanged... */}
          </div>
        ) : (
          <StemMixerTouchPad
            song={selectedSong}
            status={liveStatus}
            onChange={(s) => { padStateRef.current = s; }}
          />
        )}
```

(Keep everything previously inside the `videoContainer` div — `<video>`, `<canvas>`, transport bar, calibration banner, colour-cal banner, loading overlay — unchanged inside the `webcam` branch.)

- [ ] **Step 5: Add the mode picker to the header**

Find the header (around line 577):

```tsx
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            &larr; Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Song Preset</h2>
        </div>
```

Replace with:

```tsx
        <div style={styles.header}>
          <button onClick={handleBack} style={styles.btnSmall} aria-label="Back to performance">
            &larr; Back
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e2e2e8' }}>Song Preset</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={() => setInputMode('webcam')}
              style={inputMode === 'webcam' ? styles.btnActive : styles.btnSmall}
              aria-pressed={inputMode === 'webcam'}
            >
              Webcam
            </button>
            <button
              onClick={() => setInputMode('touch')}
              style={inputMode === 'touch' ? styles.btnActive : styles.btnSmall}
              aria-pressed={inputMode === 'touch'}
            >
              Touch
            </button>
          </div>
        </div>
```

- [ ] **Step 6: Hide irrelevant panels in touch mode**

The Instruments / Color Calibration / Range Calibration / Testing sections aren't useful in touch mode. Wrap each of those four `<div style={styles.section}>` blocks with `{inputMode === 'webcam' && ( ... )}`. Specifically:

- Instruments section (around line 585)
- Color Calibration section (around line 879)
- Range Calibration section (around line 902)
- Keyboard Test Mode section (around line 923)

Example wrapping pattern for the Instruments section:

```tsx
        {inputMode === 'webcam' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Instruments</h3>
            {/* ...existing content unchanged... */}
          </div>
        )}
```

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 8: Smoke-check both modes**

Run `npm run dev`. Test webcam mode loads a song and the strip animates as before. Test Touch mode: header shows Webcam/Touch toggle, click Touch — the video disappears, replaced by a blue X/Y pad with a reset button. Load *Can't Help Falling*, press Play, drag your finger (or mouse) around the pad. Expected: the strip's zone label, stem bars, and filter % all update as the puck moves. Lift the pointer — puck stays put, mix continues. Click Reset — puck returns to top-center, mix falls back to continuous backing.

- [ ] **Step 9: Run all tests**

Run: `npm run test:run`
Expected: all tests pass (existing tests still green, plus the 8 + 8 new tests from Tasks 2 and 6).

- [ ] **Step 10: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "songPreset: mode picker + touch input mode for stem mixer"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 2: Full test run**

Run: `npm run test:run`
Expected: every test green. Note new test counts in passing summary.

- [ ] **Step 3: Manual verification checklist (run `npm run dev`)**

For *Can't Help Falling in Love* (true-stem):
- [ ] In webcam mode, with no blue object visible, the strip is dimmed and shows zone "—", four stem bars at 0, filter 100%.
- [ ] When you reveal a blue object (or use Keyboard test mode + key 1), the strip un-dims, zone label flips between "Vocals only" / "Vocals + light band" / "Full mix", four bars animate to match, filter % responds to Y.
- [ ] The blue object on the video now has a callout showing "Mixer: …" + "Filter %".

For *Everybody Needs Somebody To Love* (mix-only):
- [ ] Strip shows one big "Volume" bar (not four).
- [ ] Zone labels are "Silent" / "Half volume" / "Full volume".

For Touch mode:
- [ ] Toggling "Touch" in the header hides the video and shows the blue X/Y pad.
- [ ] Dragging the puck updates the strip in real time.
- [ ] Lifting the pointer leaves the puck where it is; mix doesn't revert.
- [ ] Reset returns puck to center-top; strip dims to "—" + 0% bars.
- [ ] Accompaniment voice rows are not visible in the right panel.

- [ ] **Step 4: If anything in step 3 fails, file a follow-up task at the bottom of this plan and fix before declaring complete.**

---

## Notes for the implementing engineer

- **Line numbers in this plan are approximate** — they reflect the file state at the time of writing and may have drifted. Use them as guides; locate edits by the surrounding code context (e.g., "find the Status section" or "find the camera init useEffect").
- The repo's `.gitignore` already covers transient artefacts; no .gitignore changes needed.
- Working tree at session start had `.claude/settings.local.json` modified — that's pre-existing and unrelated.
- The commit `b8508de` (just before this plan) accidentally bundled four unrelated staged files with the spec doc — that's known, the user opted to leave it. Don't try to revert it.
- No new npm dependencies are required. Pointer Events API is native; the existing test toolchain (Vitest + jsdom) covers the new tests.
- File path convention: components under `src/ui/screens/songPreset/` are new — fine to introduce this subfolder for the screen's now-multiple files. Tests stay in `src/__tests__/`.
- The touch-mode transport buttons (Play / Pause / Restart / Mute) remain in the right side panel — they're tappable but not enlarged for iPad-finger ergonomics. If feedback indicates they're awkward, follow-up work would relocate or enlarge them. Task 9 verification calls this out.
