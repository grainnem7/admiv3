import { useId, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { PLAY_STOP_ID } from '../ui/focusNext';
import { Tabs } from '../ui/Tabs';
import { WORDS } from '../words';
import { SpeedControl } from './SpeedControl';

export interface PlayPanelProps {
  running: boolean;
  muted: boolean;
  onStart(): void;
  onStop(): void;
  /** Stop was pressed once while the clock runs: the next press stops the piece. */
  stopArmed?: boolean;
  onToggleMute(): void;
  /** The owner's Simplify button, beside Mute while playing (laptop only). */
  simplify?: ReactNode;
  /** Keep as loop (the Board) or Keep as scene (Make a piece): the one making move, beside Play (K1). */
  keep?: ReactNode;
  /** The tempo actually in effect: the engine's while playing, the saved one when stopped. */
  bpm: number;
  /** Change the speed from the transport (item 4): arrow keys, a slider, tap tempo. */
  onBpm?(bpm: number): void;
  /** Why the speed can't be changed here (a tempo counter owns it), or null. */
  bpmReason?: string | null;
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
  /** The open tab, when the screen opens one itself (a Ready-check fix going to its place). */
  tab?: PlayTab;
  onTab?(tab: PlayTab): void;
  /**
   * The notices (Undo, the reload offer, keeping time, the camera): side by side they sit
   * here, in a slot of fixed height between the transport and the tabs, so a notice coming
   * or going never moves the board (A3) and the board has the strip above it back (U7).
   * Stacked, the page keeps them above the board.
   */
  notices?: ReactNode;
}

/** The notices' slot: one notice with its button; more than fits scroll inside it. */
export const NOTICE_SLOT_HEIGHT = 'calc(var(--bs-target) + 8px)';

export type PlayTab = 'sound' | 'groove' | 'loops' | 'connections' | 'cap';

/**
 * The Play panel: transport, the status pill, and the three tabs. In a stacked layout
 * the transport is pinned to the bottom of the viewport and the scroll area reserves
 * room for it, so a focused control is never hidden behind the bar.
 */
export function PlayPanel({
  running, muted, onStart, onStop, stopArmed = false, onToggleMute, simplify = null, keep = null, bpm, onBpm, bpmReason = null, bpmTo = null, step, cols, variationLap, beatOn, clock = null,
  heldCount, handGuardWaiting, piece, connections, cap, groove, sound, loops, stacked, transportAlign, tab: shownTab, onTab, notices = null,
}: PlayPanelProps): JSX.Element {
  const [ownTab, setOwnTab] = useState<PlayTab>('sound');
  const tab = shownTab ?? ownTab;
  const setTab = (t: string): void => { setOwnTab(t as PlayTab); onTab?.(t as PlayTab); };
  const playHintId = useId();

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
          // ■ Stop is the clear danger button (B13); ▶ Play the board plays what is on the board,
          // with no clock and no scenes (B16).
          ? <Button id={PLAY_STOP_ID} tone="danger" onClick={onStop} style={{ minWidth: '7.5em' }}>{stopArmed ? '■ Press again to stop' : '■ Stop'}</Button>
          : <Button id={PLAY_STOP_ID} tone="primary" onClick={onStart} style={{ minWidth: '7.5em' }} aria-describedby={playHintId}>▶ Play the board</Button>}
        <Button tone="secondary" aria-pressed={muted} onClick={onToggleMute} disabled={!running} title={running ? undefined : 'Mute works while playing.'}>
          {muted ? 'Muted' : 'Mute'}
        </Button>
        {keep}
        {running && simplify}
      </div>
      {/* A readout on the page (L2): the beat as a dot, the words in the quiet colour, the
          numbers in the text colour. No pill round it. */}
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 24,
          color: 'var(--bs-fg2)', fontSize: 14, fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: running && beatOn ? 'var(--bs-fg)' : 'var(--bs-border-control)',
          }}
        />
        {/* Only the transport is announced. The step, the lap and the held count change
            several times a second, and putting them in a live region meant a screen
            reader read the pill over and over and nothing else on the screen got through. */}
        <span role="status">{running ? 'Playing' : 'Stopped'}</span>
        <span aria-hidden="true">{' · '}</span>
        {/* The speed: a control when the screen lets it be changed here (item 4), words otherwise. */}
        {onBpm
          ? <SpeedControl bpm={Math.round(bpm)} onBpm={onBpm} reason={bpmReason} />
          : <span aria-hidden="true"><span style={{ color: 'var(--bs-fg)', fontWeight: 600 }}>{Math.round(bpm)}</span>{' BPM'}</span>}
        <span aria-hidden="true">
          {running && <>{' · step '}<span style={{ color: 'var(--bs-fg)', fontWeight: 600 }}>{step + 1}</span>{` of ${cols}`}</>}
          {running && bpmTo !== null && Math.round(bpm) !== bpmTo && ` · ${bpmTo > bpm ? 'speeding up' : 'slowing down'} to ${bpmTo} BPM`}
          {variationLap !== null && running && ` · lap ${variationLap ? 'B' : 'A'}`}
          {heldCount > 0 && ` · ✋ holding ${heldCount}`}
        </span>
        {/* The countdown: a guide to where the piece is, louder in colour as the end nears. */}
        {clock && clock.phase !== 'idle' && (
          <span
            aria-label={`${clock.text} left`}
            style={{
              marginLeft: 6, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: clock.phase === 'running' ? 'var(--bs-fg)' : clock.phase === 'lastMinute' ? 'var(--bs-warn)' : 'var(--bs-danger)',
            }}
          >
            {clock.phase === 'ending' ? `ending · ${clock.text}` : clock.phase === 'over' ? `time ${clock.text}` : `⏱ ${clock.text}`}
          </span>
        )}
      </span>
      {/* What ▶ Play the board is, said beside it (B16): there is no clock. */}
      {!running && (
        <span id={playHintId} style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
          No clock, no scenes: the piece starts from Show.
        </span>
      )}
      {handGuardWaiting && (
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>
          Hand guard: waiting for a clear view of the board
        </span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, gap: 8 }}>
      {!stacked && transport}
      {!stacked && (
        <div data-notice-slot="" style={{ height: NOTICE_SLOT_HEIGHT, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notices}
        </div>
      )}
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
            // Timing, not Groove: Groove is also a setting on the Sound tab (A2).
            { id: 'groove', label: WORDS.timing, content: groove },
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
