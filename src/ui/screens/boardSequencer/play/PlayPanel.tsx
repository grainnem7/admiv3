import { useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';

export interface PlayPanelProps {
  running: boolean;
  muted: boolean;
  onStart(): void;
  onStop(): void;
  onToggleMute(): void;
  /** The tempo actually in effect: the engine's while playing, the saved one when stopped. */
  bpm: number;
  step: number;
  cols: number;
  /** True on a variation (B) lap, when Variation is on with a single page. */
  variationLap: boolean | null;
  /** Flips each beat, so the pulse is visible as well as audible. */
  beatOn: boolean;
  /** How many cells the hand guard is holding, and whether it has a clear view yet. */
  heldCount: number;
  handGuardWaiting: boolean;
  groove: ReactNode;
  sound: ReactNode;
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
  running, muted, onStart, onStop, onToggleMute, bpm, step, cols, variationLap, beatOn,
  heldCount, handGuardWaiting, groove, sound, loops, stacked, transportAlign,
}: PlayPanelProps): JSX.Element {
  const [tab, setTab] = useState('groove');

  const transport = (
    <div
      style={{
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        justifyContent: transportAlign === 'start' ? 'flex-start' : 'flex-end',
        padding: stacked ? '8px 0' : 0,
        background: stacked ? 'var(--bs-bg)' : undefined,
        borderTop: stacked ? '1px solid var(--bs-border)' : undefined,
        position: stacked ? 'sticky' : undefined,
        bottom: stacked ? 0 : undefined,
      }}
    >
      {running
        ? <Button tone="primary" onClick={onStop}>■ Stop</Button>
        : <Button tone="primary" onClick={onStart}>▶ Play</Button>}
      <Button tone="secondary" aria-pressed={muted} onClick={onToggleMute} disabled={!running}>
        {muted ? 'Sound off' : 'Mute'}
      </Button>
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
          {variationLap !== null && running && ` · lap ${variationLap ? 'B' : 'A'}`}
          {heldCount > 0 && ` · ✋ holding ${heldCount}`}
        </span>
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
        <Tabs
          label="Play settings"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'groove', label: 'Groove', content: groove },
            { id: 'sound', label: 'Sound', content: sound },
            { id: 'loops', label: 'Loops', content: loops },
          ]}
        />
      </div>
      {stacked && transport}
    </div>
  );
}
