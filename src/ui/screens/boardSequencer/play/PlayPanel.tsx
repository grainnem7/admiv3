import { useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { PLAY_STOP_ID } from '../ui/focusNext';
import { Tabs } from '../ui/Tabs';

export interface PlayPanelProps {
  running: boolean;
  muted: boolean;
  onStart(): void;
  onStop(): void;
  /** Stop was pressed once while the clock runs: the next press stops the piece. */
  stopArmed?: boolean;
  onToggleMute(): void;
  /** The tempo actually in effect: the engine's while playing, the saved one when stopped. */
  bpm: number;
  /** A scene is reaching its speed gradually: the speed it is on its way to (null = none). */
  bpmTo?: number | null;
  step: number;
  cols: number;
  /** True on a variation (B) lap, when Variation is on with a single page. */
  variationLap: boolean | null;
  /** Flips each beat, so the pulse is visible as well as audible. */
  beatOn: boolean;
  /** How many cells the hand guard is holding, and whether it has a clear view yet. */
  heldCount: number;
  handGuardWaiting: boolean;
  /** The performance clock, when one is running: the countdown and how near the end is. */
  clock?: { text: string; phase: 'idle' | 'running' | 'lastMinute' | 'lastMoments' | 'ending' | 'over' } | null;
  /** Make a piece: the guided steps, shown instead of the tabs while making a piece. */
  piece: ReactNode | null;
  /** The iPad and MIDI out: set up once per rig. */
  connections: ReactNode;
  /** The red cap: head movements as controls. */
  cap: ReactNode;
  groove: ReactNode;
  sound: ReactNode;
  /** The board's own rules: lanes, the loop bank, Variation, where a counter sits. */
  loops: ReactNode;
  /** Stacked layouts pin the transport to the bottom; the player's side comes first. */
  stacked: boolean;
  transportAlign: 'start' | 'end';
}

/**
 * The Play panel: transport, the status pill, and the three tabs. In a stacked layout
 * the transport is pinned to the bottom of the viewport and the scroll area reserves
 * room for it, so a focused control is never hidden behind the bar.
 */
export function PlayPanel({
  running, muted, onStart, onStop, stopArmed = false, onToggleMute, bpm, bpmTo = null, step, cols, variationLap, beatOn, clock = null,
  heldCount, handGuardWaiting, piece, connections, cap, groove, sound, loops, stacked, transportAlign,
}: PlayPanelProps): JSX.Element {
  const [tab, setTab] = useState('sound');

  const transport = (
    <div
      style={{
        // Play and Mute on a line of their own, the status below: the status grows as it
        // plays ("· step 2 of 8"), and beside the buttons it pushed ■ Stop away from where
        // ▶ Play had just been pressed — an imprecise second press landed on something else.
        display: 'flex', gap: 8, flexWrap: 'wrap',
        flexDirection: stacked ? 'row' : 'column',
        alignItems: stacked ? 'center' : transportAlign === 'start' ? 'flex-start' : 'flex-end',
        justifyContent: transportAlign === 'start' ? 'flex-start' : 'flex-end',
        padding: stacked ? '8px 16px' : 0,
        background: stacked ? 'var(--bs-bg)' : undefined,
        borderTop: stacked ? '1px solid var(--bs-border)' : undefined,
        // Stacked, the page scrolls: Play and Stop stay pinned to the bottom of the
        // window, always in reach (the page leaves room for them at its end).
        position: stacked ? 'fixed' : undefined,
        left: stacked ? 0 : undefined,
        right: stacked ? 0 : undefined,
        bottom: stacked ? 0 : undefined,
        zIndex: stacked ? 5 : undefined,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* One button whose words change (the same element), so focus stays on it. */}
        {running
          ? <Button id={PLAY_STOP_ID} tone="primary" onClick={onStop} style={{ minWidth: '7.5em' }}>{stopArmed ? '■ Press again to stop' : '■ Stop'}</Button>
          : <Button id={PLAY_STOP_ID} tone="primary" onClick={onStart} style={{ minWidth: '7.5em' }}>▶ Play</Button>}
        <Button tone="secondary" aria-pressed={muted} onClick={onToggleMute} disabled={!running} title={running ? undefined : 'Mute works while playing.'}>
          {muted ? 'Muted' : 'Mute'}
        </Button>
      </div>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px',
          borderRadius: 999, background: 'var(--bs-elev)', color: 'var(--bs-fg)', fontSize: 13,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: running && beatOn ? 'var(--bs-accent)' : 'var(--bs-border-control)',
          }}
        />
        {/* Only the transport is announced. The step, the lap and the held count change
            several times a second, and putting them in a live region meant a screen
            reader read the pill over and over and nothing else on the screen got through. */}
        <span role="status">{running ? 'Playing' : 'Stopped'}</span>
        <span aria-hidden="true">
          {running ? ` · ${Math.round(bpm)} BPM · step ${step + 1} of ${cols}` : ` · ${Math.round(bpm)} BPM`}
          {running && bpmTo !== null && Math.round(bpm) !== bpmTo && ` · ${bpmTo > bpm ? 'speeding up' : 'slowing down'} to ${bpmTo} BPM`}
          {variationLap !== null && running && ` · lap ${variationLap ? 'B' : 'A'}`}
          {heldCount > 0 && ` · ✋ holding ${heldCount}`}
        </span>
        {/* The countdown: a guide to where the piece is, louder in colour as the end nears. */}
        {clock && clock.phase !== 'idle' && (
          <span
            aria-label={`${clock.text} left`}
            style={{
              marginLeft: 6, padding: '1px 8px', borderRadius: 'var(--bs-radius-sm)', fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              background: clock.phase === 'running' ? 'var(--bs-elev)' : clock.phase === 'lastMinute' ? 'var(--bs-warn-tint)' : 'var(--bs-warn)',
              color: clock.phase === 'lastMoments' || clock.phase === 'ending' || clock.phase === 'over' ? 'var(--bs-bg)' : 'inherit',
            }}
          >
            {clock.phase === 'ending' ? `ending · ${clock.text}` : clock.phase === 'over' ? `time ${clock.text}` : `⏱ ${clock.text}`}
          </span>
        )}
      </span>
      {handGuardWaiting && (
        <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>
          Hand guard: waiting for a clear view of the board
        </span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, gap: 8 }}>
      {!stacked && transport}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // Reserve room for the pinned bar plus the focus outline (WCAG 2.4.11).
          scrollPaddingBottom: stacked ? 'calc(var(--bs-target) + 12px)' : undefined,
        }}
      >
        {piece ?? <Tabs
          label="Play settings"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'sound', label: 'Sound', content: sound },
            { id: 'groove', label: 'Groove', content: groove },
            { id: 'loops', label: 'Board', content: loops },
            { id: 'connections', label: 'Connections', content: connections },
            { id: 'cap', label: 'Cap', content: cap },
          ]}
        />}
      </div>
      {stacked && transport}
    </div>
  );
}
