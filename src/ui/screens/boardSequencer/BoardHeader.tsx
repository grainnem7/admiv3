import { useId, type CSSProperties, type ReactNode } from 'react';
import { Button } from './ui/Button';
import type { BoardMode } from './theme/boardTokens';

export interface CameraNotice {
  kind: 'fallback' | 'error' | 'changed';
  text: string;
}

export interface BoardHeaderProps {
  title: string;
  onExit(): void;
  /** Exit was pressed once while a piece runs: the next press stops it and leaves. */
  exitArmed?: boolean;
  mode: BoardMode;
  onModeChange(mode: BoardMode): void;
  largeUi: boolean;
  onLargeUiChange(large: boolean): void;
  onHelp(): void;
  /** Step indicator on Set up, transport/status on Play. */
  right?: ReactNode;
  /** The active player's name, when more than one profile exists. */
  playerName?: string | null;
  onSwitchPlayer?(): void;
  switchPlayerDisabledReason?: string | null;
  notice?: CameraNotice | null;
  /** "Change camera" takes the user to the Camera step from wherever they are. */
  onChangeCamera?(): void;
  /** Big board hides the header — visually only, so nothing below it is unmounted. */
  hidden?: boolean;
}

/** A round icon button (L2): ☀, Aa and ?, each still a full target. */
const ROUND: CSSProperties = { width: 'var(--bs-target)', padding: 0, borderRadius: '50%' };

/**
 * The frame shared by Set up and Play: exit, the wordmark and the title, theme, Large UI,
 * help, and the always-present camera status region — a camera problem must be visible on
 * every step, not only on the one that caused it.
 */
export function BoardHeader({
  title, onExit, exitArmed = false, mode, onModeChange, largeUi, onLargeUiChange, onHelp, right,
  playerName, onSwitchPlayer, switchPlayerDisabledReason = null, notice, onChangeCamera, hidden = false,
}: BoardHeaderProps): JSX.Element {
  const playerReasonId = useId();
  return (
    <header
      aria-hidden={hidden || undefined}
      style={{
        display: hidden ? 'none' : 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button tone="quiet" onClick={onExit} aria-label={exitArmed ? 'Press again to stop the piece and exit' : 'Exit the Board Sequencer'}>
          {exitArmed ? '← Press again to leave' : '← Exit'}
        </Button>
        {/* The wordmark, then the screen's name in the quiet colour (L2). */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: '0 0 auto' }}>
          <span aria-hidden="true" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.2em' }}>ADMI</span>
          <h1 style={{ fontSize: 14, fontWeight: 500, color: 'var(--bs-fg3)', margin: 0, whiteSpace: 'nowrap' }}>{title}</h1>
        </div>
        {/* Grows to fill the row; on a phone-narrow window it takes a row of its own rather
            than spilling past the edge (A3: nothing scrolls sideways at 320 px). */}
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>{right}</div>
        {playerName && onSwitchPlayer && (
          // While the board plays the button is greyed, with why in its tooltip and in a
          // description a screen reader hears (U6): drawn as a line under the button, the
          // reason touched the transport row.
          <>
            <Button
              tone="quiet"
              onClick={onSwitchPlayer}
              disabled={switchPlayerDisabledReason !== null}
              title={switchPlayerDisabledReason ?? undefined}
              aria-describedby={switchPlayerDisabledReason ? playerReasonId : undefined}
              aria-label={`Player: ${playerName}. Switch player`}
              style={{ color: 'var(--bs-fg)' }}
            >
              {`Player: ${playerName}`}
            </Button>
            {switchPlayerDisabledReason && (
              <span id={playerReasonId} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                {switchPlayerDisabledReason}
              </span>
            )}
          </>
        )}
        <Button
          tone="quiet"
          style={ROUND}
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => onModeChange(mode === 'dark' ? 'light' : 'dark')}
        >
          <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
        </Button>
        <Button
          tone="quiet"
          style={ROUND}
          aria-pressed={largeUi}
          aria-label="Aa: larger controls"
          // What Aa does, in words on hover (A14): only screen readers were told.
          title={largeUi ? 'Larger controls: on' : 'Larger controls'}
          onClick={() => onLargeUiChange(!largeUi)}
        >
          <span aria-hidden="true">Aa</span>
        </Button>
        <Button tone="secondary" style={ROUND} aria-label="Help" onClick={onHelp}><span aria-hidden="true">?</span></Button>
      </div>
      {/* Always mounted, so a notice is announced rather than appearing as new content. */}
      <div
        role="status"
        style={{
          minHeight: notice ? undefined : 0,
          display: notice ? 'flex' : 'none',
          alignItems: 'center',
          gap: 10,
          padding: notice ? '8px 10px' : 0,
          borderRadius: 'var(--bs-radius-md)',
          background: 'var(--bs-warn-tint)',
          color: 'var(--bs-fg)',
          border: notice ? '1px solid var(--bs-border-control)' : 'none',
        }}
      >
        {notice && (
          <>
            <span aria-hidden="true" style={{ color: 'var(--bs-warn)', fontWeight: 700 }}>!</span>
            <span style={{ flex: 1 }}>{notice.text}</span>
            {onChangeCamera && (
              <Button tone="secondary" onClick={onChangeCamera}>Change camera</Button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
