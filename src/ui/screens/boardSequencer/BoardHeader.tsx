import type { ReactNode } from 'react';
import { Button } from './ui/Button';
import type { BoardMode } from './theme/boardTokens';

export interface CameraNotice {
  kind: 'fallback' | 'error' | 'changed';
  text: string;
}

export interface BoardHeaderProps {
  title: string;
  onExit(): void;
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
}

/**
 * The frame shared by Set up and Play: exit, title, theme, Large UI, help, and the
 * always-present camera status region — a camera problem must be visible on every step,
 * not only on the one that caused it.
 */
export function BoardHeader({
  title, onExit, mode, onModeChange, largeUi, onLargeUiChange, onHelp, right,
  playerName, onSwitchPlayer, switchPlayerDisabledReason = null, notice, onChangeCamera,
}: BoardHeaderProps): JSX.Element {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button tone="quiet" onClick={onExit} aria-label="Exit the Board Sequencer">← Exit</Button>
        <h1 style={{ fontSize: 18, margin: 0, flex: '0 0 auto' }}>{title}</h1>
        <div style={{ flex: 1, minWidth: 0 }}>{right}</div>
        {playerName && onSwitchPlayer && (
          <Button
            tone="secondary"
            onClick={onSwitchPlayer}
            reason={switchPlayerDisabledReason}
            aria-label={`Player: ${playerName}. Switch player`}
          >
            {`Player: ${playerName}`}
          </Button>
        )}
        <Button
          tone="quiet"
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => onModeChange(mode === 'dark' ? 'light' : 'dark')}
        >
          <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
        </Button>
        <Button
          tone="quiet"
          aria-pressed={largeUi}
          aria-label="Large controls"
          onClick={() => onLargeUiChange(!largeUi)}
        >
          <span aria-hidden="true">Aa</span>
        </Button>
        <Button tone="quiet" aria-label="Help" onClick={onHelp}><span aria-hidden="true">?</span></Button>
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
